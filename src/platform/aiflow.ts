/**
 * 조회 흐름: 로컬 DB → 캐시 → AI.
 * - 같은 질문으로 AI를 두 번 부르지 않는다 (ai_cache)
 * - AI가 준 음식 영양성분은 검증 대기(pending)에 넣고, 검증 규칙을 통과한 것만 정식 데이터(promoted)로 승격한다
 * - 지점별로 DB 적중 / 캐시 적중 / AI 호출 수를 기록한다 (ai_log)
 */
import { askJSON, askText } from "./ai";
import { kvAll, kvBump, kvGet, kvPut } from "./storage";
import { norm } from "./search";
import { builtinFoods, getExtraFoods, setExtraFoods, type FoodRow } from "./kb";

export type Site = "food_text" | "food_photo" | "diet_coach" | "ex_tip" | "plan_gen" | "plan_feedback" | "ask";
export type Hit = "db" | "cache" | "ai" | "ai_fail";
/** 지점 분류 (감사 결과). A = DB로 완전 대체, B = DB·캐시 우선, C = AI 필요 */
export const SITE_CLASS: Record<Site, "B" | "C"> = { food_text: "B", food_photo: "C", diet_coach: "B", ex_tip: "B", plan_gen: "B", plan_feedback: "B", ask: "C" };

const today = () => new Date().toISOString().slice(0, 10);
const mem: Record<string, number> = {};
/** 호출 기록. 저장에 실패해도(사생활 보호 모드 등) 기능은 계속된다 */
export function logHit(site: Site, hit: Hit): void {
  mem[site + ":" + hit] = (mem[site + ":" + hit] || 0) + 1;
  kvBump("ai_log", today() + "|" + site, [hit], { date: today(), site }).catch(() => {});
}
export const sessionCounts = () => ({ ...mem });
export async function aiStats(): Promise<Record<Site, Record<Hit, number>>> {
  const out = {} as Record<Site, Record<Hit, number>>;
  for (const [, v] of await kvAll<any>("ai_log")) { const o = (out[v.site as Site] ||= { db: 0, cache: 0, ai: 0, ai_fail: 0 }); for (const h of ["db", "cache", "ai", "ai_fail"] as Hit[]) o[h] += v[h] || 0; }
  return out;
}

/** 짧고 안정적인 문자열 해시 (캐시 키) */
export function hash(s: string): string {
  let a = 0x811c9dc5, b = 0x01000193; for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b + c, 2246822519) ^ (b >>> 13); }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36) + s.length.toString(36);
}
const keyOf = (site: Site, q: string) => site + ":" + hash(norm(q));

/** 캐시 → AI (JSON). cacheKey는 '같은 질문'을 가리는 글(프롬프트 전체가 아니라 사용자 입력 부분) */
export async function cachedJSON(site: Site, cacheKey: string, prompt: string): Promise<any> {
  const k = keyOf(site, cacheKey);
  const hit = await kvGet<any>("ai_cache", k).catch(() => undefined);
  if (hit) { logHit(site, "cache"); return hit.value; }
  try { const value = await askJSON(prompt); logHit(site, "ai"); kvPut("ai_cache", k, { site, q: cacheKey.slice(0, 200), value, at: Date.now() }).catch(() => {}); return value; }
  catch (e) { logHit(site, "ai_fail"); throw e; }
}
/** 캐시 → AI (글). 캐시에 있으면 onText를 한 번 부르고 끝난다 */
export async function cachedText(site: Site, cacheKey: string, prompt: string, onText?: (t: string) => void): Promise<string> {
  const k = keyOf(site, cacheKey);
  const hit = await kvGet<any>("ai_cache", k).catch(() => undefined);
  if (hit) { logHit(site, "cache"); onText?.(hit.value); return hit.value; }
  try { const value = await askText(prompt, onText); logHit(site, "ai"); kvPut("ai_cache", k, { site, q: cacheKey.slice(0, 200), value, at: Date.now() }).catch(() => {}); return value; }
  catch (e) { logHit(site, "ai_fail"); throw e; }
}
/** 사진은 캐시하지 않는다 (같은 사진인지 가릴 수 없음) */
export async function photoJSON(prompt: string, images: Blob[]): Promise<any> {
  try { const v = await askJSON(prompt, { images }); logHit("food_photo", "ai"); return v; } catch (e) { logHit("food_photo", "ai_fail"); throw e; }
}

/* ── AI가 준 음식: 검증 규칙 ── */
export interface FoodCheck { ok: boolean; reasons: string[] }
const num = (v: unknown) => (typeof v === "number" && isFinite(v) ? v : NaN);
export function validateFood(f: any, known: { name: string }[]): FoodCheck {
  const r: string[] = [];
  const name = typeof f?.name === "string" ? f.name.trim() : "";
  if (!name) r.push("이름 없음");
  const kcal = num(f?.kcal), c = num(f?.carb), p = num(f?.protein), fat = num(f?.fat), g = num(f?.grams);
  if ([kcal, c, p, fat].some(isNaN)) r.push("필수 수치(열량·탄수·단백질·지방) 누락");
  else {
    if (kcal < 0 || kcal > 3000) r.push("열량 범위 밖");
    if ([c, p, fat].some((v) => v < 0 || v > 500)) r.push("영양소 범위 밖");
    if (g > 0 && c + p + fat > g * 1.02) r.push("영양소 합이 제공량보다 큼");
    const est = 4 * c + 4 * p + 9 * fat;                       // Atwater 계수. 알코올·식이섬유 때문에 넉넉히 본다
    if (Math.abs(kcal - est) > Math.max(40, est * 0.35, kcal * 0.35)) r.push("열량과 영양소가 맞지 않음");
  }
  if (!(g > 0) || g > 3000) r.push("제공량(g) 없음 또는 범위 밖");
  if (num(f?.sodium) > 20000) r.push("나트륨 범위 밖");
  if (name && known.some((k) => norm(k.name) === norm(name))) r.push("이미 있는 음식");
  return { ok: r.length === 0, reasons: r };
}

/** AI 응답 음식들을 검증 대기에 넣고, 통과한 것만 승격한다. 화면에 보여 줄 항목(검증 결과 포함)을 돌려준다 */
export async function ingestAIFoods(items: any[], custom: { name: string }[], origin: "text" | "photo", q: string): Promise<(FoodRow & { check: FoodCheck })[]> {
  const known = [...custom, ...builtinFoods(), ...getExtraFoods()];
  const out: (FoodRow & { check: FoodCheck })[] = []; const add: FoodRow[] = [];
  for (const it of items) {
    const check = validateFood(it, [...known, ...add]);
    const key = hash(norm(String(it?.name || "")) + "|" + it?.grams + "|" + it?.kcal);
    const rec = { item: it, check, origin, q: q.slice(0, 120), at: new Date().toISOString(), source: "AI(Claude) 추정", status: check.ok ? "자동 검증 통과" : "검증 대기" };
    kvPut("pending", key, rec).catch(() => {});
    if (check.ok) { const base = { ...it }; delete base.qty; const row: FoodRow = { ...base, src: "ai", status: "자동 검증 통과" }; add.push(row); kvPut("promoted", norm(row.name), { ...row, at: rec.at, source: rec.source }).catch(() => {}); }
    out.push({ ...it, check });
  }
  if (add.length) setExtraFoods([...getExtraFoods(), ...add]);
  return out;
}

/** 시작할 때: 승격된 음식과 (있으면) 가져온 공개 음식 데이터를 불러온다. 둘 다 없어도 내장 DB로 동작한다 */
export async function loadKnowledge(base = import.meta.env?.BASE_URL || "/"): Promise<void> {
  let imported: FoodRow[] = [];
  try { const r = await fetch(base + "data/foods.json"); if (r.ok && (r.headers.get("content-type") || "").includes("json")) { const doc = await r.json(); const def = doc.meta?.defaults || {}; imported = (doc.foods || []).map((f: any) => ({ ...(def[f.src] || {}), ...f })); } } catch { /* 파일 없음·오프라인 */ }
  let promoted: FoodRow[] = [];
  try { promoted = (await kvAll<FoodRow>("promoted")).map(([, v]) => v); } catch { /* 저장소 없음 */ }
  setExtraFoods([...imported, ...promoted]);
}
