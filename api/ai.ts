/**
 * Vercel 서버 함수: /api/ai → Claude 프록시(server/ai.ts).
 * 환경 변수는 Vercel 프로젝트 설정에서 넣는다: ANTHROPIC_API_KEY(필수), GYMLOG_TOKEN(공개 주소면 꼭), GYMLOG_MODEL(선택).
 * Edge 런타임을 쓴다: 웹 표준 Request/Response를 그대로 받고, 글 답변을 글자가 나오는 대로 흘려보낼 수 있다.
 */
import { handleAI } from "../server/ai";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  const env = (globalThis as any).process?.env ?? {};
  return handleAI(request, { ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY, GYMLOG_TOKEN: env.GYMLOG_TOKEN, GYMLOG_MODEL: env.GYMLOG_MODEL });
}
