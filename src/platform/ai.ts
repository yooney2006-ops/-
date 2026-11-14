/**
 * Claude 호출. 브라우저는 API 키를 갖지 않고, 서버리스 함수(server/ai.ts)에 요청만 보낸다.
 * 주소는 VITE_AI_ENDPOINT(기본 /api/ai). 함수가 없거나 오프라인이면 code:"none" 오류가 난다.
 */
const ENDPOINT: string = import.meta.env.VITE_AI_ENDPOINT || "/api/ai";
const TOKEN_KEY = "gymlog-ai-token";

export interface AIError {
  code: "none" | "unauthorized" | "rate_limited" | "refused" | "error";
  message?: string;
}

/** 서버 함수에 접속 암호(GYMLOG_TOKEN)를 걸어 둔 경우 이 기기에 저장해 두는 값 */
export function getAIToken(): string {
  try { return localStorage.getItem(TOKEN_KEY) || ""; } catch { return ""; }
}
export function setAIToken(t: string): void {
  try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* 무시 */ }
}

async function call(body: unknown): Promise<Response> {
  let res: Response;
  try {
    const token = getAIToken();
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json", ...(token ? { "x-gymlog-token": token } : {}) },
      body: JSON.stringify(body),
    });
  } catch {
    throw { code: "none" } satisfies AIError;
  }
  if (res.ok) return res;
  let message: string | undefined;
  let code: string | undefined;
  try { const j = await res.json(); message = j.error; code = j.code; } catch { /* 본문 없음 */ }
  if (res.status === 404 || res.status === 405 || code === "not_configured") throw { code: "none", message } satisfies AIError;
  if (res.status === 401) throw { code: "unauthorized" } satisfies AIError;
  if (res.status === 429) throw { code: "rate_limited" } satisfies AIError;
  if (code === "refused") throw { code: "refused" } satisfies AIError;
  throw { code: "error", message } satisfies AIError;
}

/** 사진을 긴 변 1568px 이하 JPEG로 줄여 base64로 만든다(휴대폰 원본은 요청 한도를 넘는다). */
async function encodeImage(file: Blob): Promise<{ media_type: string; data: string }> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1568 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k);
  c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  bmp.close?.();
  return { media_type: "image/jpeg", data: c.toDataURL("image/jpeg", 0.85).split(",")[1] };
}

/** JSON으로 답을 받는다. opts.images에 사진 파일을 넣을 수 있다. */
export async function askJSON(prompt: string, opts: { images?: Blob[] } = {}): Promise<any> {
  const images = await Promise.all((opts.images || []).map(encodeImage));
  const res = await call({ mode: "json", prompt, images });
  const { text } = await res.json();
  const m = String(text || "").match(/[\[{][\s\S]*[\]}]/);
  try {
    return JSON.parse(m ? m[0] : text);
  } catch {
    throw { code: "error", message: "JSON 형식이 아님" } satisfies AIError;
  }
}

/** 글로 답을 받는다. onText는 지금까지 받은 전체 글로 여러 번 불린다(스트리밍). */
export async function askText(prompt: string, onText?: (text: string) => void): Promise<string> {
  const res = await call({ mode: "text", prompt });
  if (!res.body) { const t = await res.text(); onText?.(t); return t; }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    text += dec.decode(value, { stream: true });
    onText?.(text);
  }
  if (!text.trim()) throw { code: "error", message: "빈 응답" } satisfies AIError;
  return text;
}

export function aiErr(e: AIError | null | undefined): string {
  if (!e) return "알 수 없는 오류가 났어요.";
  if (e.code === "none") return navigator.onLine === false
    ? "오프라인이라 Claude 기능을 쓸 수 없어요. 기록은 그대로 할 수 있어요."
    : "Claude 연결이 아직 설정되지 않았어요. (서버 함수와 API 키가 필요해요 — README 참고)";
  if (e.code === "unauthorized") return "AI 접속 암호가 맞지 않아요. '내 정보·목표'에서 다시 입력해 주세요.";
  if (e.code === "rate_limited") return "요청이 잠시 많아요. 1분쯤 뒤에 다시 눌러 주세요.";
  if (e.code === "refused") return "Claude가 이 요청에는 답하지 않았어요. 내용을 바꿔 다시 시도해 주세요.";
  return "Claude 응답을 읽지 못했어요. 다시 시도해 주세요." + (e.message ? " (" + e.message + ")" : "");
}
