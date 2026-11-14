/**
 * 음식 분석·코칭용 Claude 프록시. API 키는 여기(서버)에만 둔다.
 *
 * 웹 표준 Request → Response 함수라 Cloudflare Workers/Pages, Vercel, Netlify, Deno 어디든
 * 몇 줄짜리 래퍼로 올릴 수 있다. 개발 중에는 vite.config.ts가 /api/ai에 연결해 준다.
 *
 * 환경 변수
 *   ANTHROPIC_API_KEY  필수
 *   GYMLOG_TOKEN       선택. 설정하면 앱에서 같은 암호를 입력해야 호출된다(주소가 공개돼도 남이 못 쓰게).
 *   GYMLOG_MODEL       선택. 기본 claude-opus-5-5
 */
import Anthropic from "@anthropic-ai/sdk";

export interface AIEnv {
  ANTHROPIC_API_KEY?: string;
  GYMLOG_TOKEN?: string;
  GYMLOG_MODEL?: string;
}

interface AIRequest {
  mode: "json" | "text";
  prompt: string;
  images?: { media_type: string; data: string }[];
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"] as const;
type ImageType = (typeof IMAGE_TYPES)[number];
const MAX_PROMPT = 20_000;
const MAX_IMAGE_B64 = 6_000_000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });

function parse(body: any): AIRequest | null {
  if (!body || (body.mode !== "json" && body.mode !== "text")) return null;
  if (typeof body.prompt !== "string" || !body.prompt.trim() || body.prompt.length > MAX_PROMPT) return null;
  const images = body.images ?? [];
  if (!Array.isArray(images) || images.length > 2) return null;
  for (const im of images) {
    if (!im || !IMAGE_TYPES.includes(im.media_type) || typeof im.data !== "string" || im.data.length > MAX_IMAGE_B64) return null;
  }
  return { mode: body.mode, prompt: body.prompt, images };
}

function apiError(e: unknown): Response {
  if (e instanceof Anthropic.AuthenticationError || e instanceof Anthropic.PermissionDeniedError)
    return json(500, { code: "not_configured", error: "API 키가 올바르지 않아요" });
  if (e instanceof Anthropic.RateLimitError) return json(429, { code: "rate_limited", error: "요청이 많아요" });
  if (e instanceof Anthropic.APIError) return json(502, { code: "error", error: `Claude API 오류 ${e.status ?? ""}`.trim() });
  return json(502, { code: "error", error: "Claude에 연결하지 못했어요" });
}

export async function handleAI(request: Request, env: AIEnv): Promise<Response> {
  if (request.method !== "POST") return json(405, { code: "error", error: "POST만 받아요" });
  if (!env.ANTHROPIC_API_KEY) return json(503, { code: "not_configured", error: "ANTHROPIC_API_KEY가 없어요" });
  if (env.GYMLOG_TOKEN && request.headers.get("x-gymlog-token") !== env.GYMLOG_TOKEN)
    return json(401, { code: "unauthorized", error: "접속 암호가 필요해요" });

  let req: AIRequest | null = null;
  try { req = parse(await request.json()); } catch { /* 아래에서 400 */ }
  if (!req) return json(400, { code: "error", error: "요청 형식이 올바르지 않아요" });

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [
    ...(req.images ?? []).map((im) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: im.media_type as ImageType, data: im.data },
    })),
    { type: "text", text: req.prompt },
  ];
  const stream = client.beta.messages.stream({
    model: env.GYMLOG_MODEL || "claude-opus-5-5",
    max_tokens: 16000,
    output_config: { effort: "medium" },
    // 안전 분류기가 요청을 거절하면 서버에서 다른 모델로 한 번 더 시도한다
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    messages: [{ role: "user", content }],
  });

  if (req.mode === "json") {
    try {
      const msg = await stream.finalMessage();
      if (msg.stop_reason === "refusal") return json(422, { code: "refused", error: "답변이 거절됐어요" });
      const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
      return json(200, { text });
    } catch (e) {
      return apiError(e);
    }
  }

  // text: 글자가 나오는 대로 흘려보낸다. 첫 글자 전에 난 오류만 상태 코드로 알릴 수 있다.
  const enc = new TextEncoder();
  const iter = stream[Symbol.asyncIterator]();
  let first: string | null = null;
  const nextText = async (): Promise<string | null> => {
    for (;;) {
      const { done, value } = await iter.next();
      if (done) return null;
      if (value.type === "content_block_delta" && value.delta.type === "text_delta") return value.delta.text;
      if (value.type === "message_delta" && value.delta.stop_reason === "refusal") throw new Error("refusal");
    }
  };
  try {
    first = await nextText();
  } catch (e) {
    if (e instanceof Error && e.message === "refusal") return json(422, { code: "refused", error: "답변이 거절됐어요" });
    return apiError(e);
  }
  if (first === null) return json(422, { code: "refused", error: "빈 응답" });
  const body = new ReadableStream<Uint8Array>({
    async start(ctrl) {
      ctrl.enqueue(enc.encode(first!));
      try {
        for (let t = await nextText(); t !== null; t = await nextText()) ctrl.enqueue(enc.encode(t));
      } catch {
        ctrl.enqueue(enc.encode("\n\n(응답이 중간에 끊겼어요. 다시 시도해 주세요.)"));
      }
      ctrl.close();
    },
    cancel() { stream.abort(); },
  });
  return new Response(body, { headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" } });
}
