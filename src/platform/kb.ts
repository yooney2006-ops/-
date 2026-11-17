/**
 * 자체 지식 베이스: 근거(evidence)·규칙(rules)·별칭 + 운동/음식 검색 색인 + 음식 문장 해석.
 * 모두 앱에 묶여 있어 네트워크 없이 동작한다. 데이터는 tools/db 스크립트가 만든다.
 */
import evidenceJson from "../data/db/evidence.json";
import rulesJson from "../data/db/rules.json";
import unverifiedJson from "../data/db/unverified.json";
import aliases from "../data/db/aliases.json";
import exMetaJson from "../data/db/exercise_meta.json";
import { EX } from "../data/exercises.js";
import { FOOD_DB } from "../data/foods";
import { buildIndex, norm, score, search, type Indexed } from "./search";
import type { Food } from "../types";

export interface Evidence { id: string; claim: string; value: string; population: string; design: string; level: string; cite: string; title: string; year: number; journal: string; doi: string; pmid: string; status: string }
export interface Rule { id: string; topic: string; label: string; value: string; applies_to: string; evidence: string[]; note: string; used_by: string; status: string }
export const EVIDENCE_DB = evidenceJson as Evidence[];
export const RULES = rulesJson as Rule[];
export const UNVERIFIED = unverifiedJson as { cite: string; reason: string }[];
const evById = new Map(EVIDENCE_DB.map((e) => [e.id, e]));
export const rule = (id: string) => RULES.find((r) => r.id === id);
export const evidenceFor = (r: Rule) => r.evidence.map((id) => evById.get(id)!).filter(Boolean);
export const DESIGN_KO: Record<string, string> = { meta: "메타분석", sr: "체계적 문헌고찰", position: "학회 입장문", rct: "무작위 대조 연구", review: "서술적 고찰", consensus: "전문가 합의", cohort: "단일 연구", preprint: "프리프린트" };

/* ── 운동 검색 ── */
const G = aliases.glossary as Record<string, string>;
/** 한글 운동 이름을 단어 사전으로 영문 표기로 바꾼다 (예: 바벨 벤치프레스 → barbell bench press) */
export function toEnglish(name: string): string {
  return name.replace(/[()°]/g, " ").split(/\s+/).map((w) => G[w] || "").filter(Boolean).join(" ");
}
const exAlias = aliases.exercise as Record<string, string[]>;
/** 공개 운동 데이터(free-exercise-db)에서 가져온 영문 정식 이름·난이도. 대응하지 못한 운동은 없다(undefined) */
export const EX_META = exMetaJson.exercises as Record<string, { en: string; level: string; match: string }>;
export const EX_META_SOURCE = exMetaJson._meta;
export const exMeta = (e: any) => EX_META[e.id] || EX_META[e.base];
let exIndex: Indexed<any>[] | null = null;
export function exerciseIndex(): Indexed<any>[] {
  return (exIndex ??= buildIndex(EX as any[], (e) => [e.name, e.en, exMeta(e)?.en, toEnglish(e.name), ...(exAlias[e.id] || exAlias[e.base] || []), e.muscles, e.equip, e.part, e.cat, e.brand, e.line]));
}
export const searchExercises = (q: string, limit = 400) => search(exerciseIndex(), q, limit);

/* ── 음식 검색 ── */
export interface FoodRow extends Food { id?: string; cat?: string; custom?: boolean; src?: string; status?: string }
const foodAlias = aliases.food as Record<string, string[]>;
let extraFoods: FoodRow[] = [];           // 가져온 공개 데이터(public/data/foods.json) + 검증 통과한 AI 응답
let foodIdx: { key: unknown; idx: Indexed<FoodRow>[] } | null = null;
let extraVersion = 0;
export function setExtraFoods(list: FoodRow[]): void { extraFoods = list; extraVersion++; foodIdx = null; }
export const getExtraFoods = () => extraFoods;
export const builtinFoods = () => FOOD_DB as FoodRow[];
/** custom = 사용자가 직접 넣은 음식. 내 음식 → 내장 → 추가 데이터 순으로 찾는다 */
export function foodIndex(custom: FoodRow[]): Indexed<FoodRow>[] {
  // 색인은 음식 목록이 바뀔 때만 다시 만든다 (내 음식의 개수·이름이 같고 추가 데이터가 같으면 재사용)
  const key = custom.length + "|" + custom.map((f) => f.name).join("\u0001") + "|" + extraVersion;
  if (foodIdx && foodIdx.key === key) return foodIdx.idx;
  const all = [...custom.map((f) => ({ ...f, custom: true })), ...builtinFoods(), ...extraFoods];
  const idx = buildIndex(all, (f) => [f.name, ...(foodAlias[f.name] || []), f.cat]);
  foodIdx = { key, idx }; return idx;
}
export const searchFoods = (custom: FoodRow[], q: string, limit = 40) => search(foodIndex(custom), q, limit);

/* ── 음식 문장 해석: "닭가슴살 200g, 밥 반 공기" → DB 항목 + 수량. 하나라도 확실히 못 찾으면 null (그때만 AI) ── */
const NUM_KO: Record<string, number> = { 반: 0.5, 한: 1, 하나: 1, 두: 2, 둘: 2, 세: 3, 셋: 3, 네: 4, 넷: 4, 다섯: 5 };
const UNIT = "개|공기|인분|잔|컵|장|조각|그릇|봉지|봉|캔|병|줄|알|팩|접시|스푼|큰술|쪽|g|그램|ml|kg";
export interface Resolved { food: FoodRow; qty: number }
export function resolveFoodText(text: string, custom: FoodRow[]): Resolved[] | null {
  const parts = String(text || "").split(/[,+\n·]|그리고|하고|이랑|랑(?=\s)|와(?=\s)|과(?=\s)/).map((s) => s.trim()).filter(Boolean);
  if (!parts.length) return null;
  const idx = foodIndex(custom), out: Resolved[] = [];
  for (const part of parts) {
    let name = part, n: number | null = null, unit = "";
    const m = part.match(new RegExp(`(\\d+(?:\\.\\d+)?|${Object.keys(NUM_KO).join("|")})\\s*(${UNIT})?(?:\\s*(?:정도|쯤))?\\s*$`));
    if (m && m.index! > 0) { n = m[1] in NUM_KO ? NUM_KO[m[1]] : +m[1]; unit = m[2] || ""; name = part.slice(0, m.index).trim(); }
    name = name.replace(/\s*(먹었어요?|먹음|먹었다|을|를)\s*$/, "").trim();
    if (!name) return null;
    // 이름이 정확히 같거나(별칭 포함) 그 이름으로 시작하는 항목만 인정한다. 애매하면 AI에게 넘긴다.
    let best: Indexed<FoodRow> | null = null, bs = 0;
    for (const e of idx) { const s = score(name, e); if (s > bs) { bs = s; best = e; } }
    if (!best || bs < 80) return null;
    const exact = best.n.some((t) => t === norm(name));
    if (!exact && idx.filter((e) => score(name, e) >= 80).length > 1) return null;   // 후보가 여럿이면 추측하지 않는다
    const f = best.item; let qty = 1;
    if (n != null) {
      if (/^(g|그램|ml)$/.test(unit)) { if (!f.grams) return null; qty = n / f.grams; }
      else if (unit === "kg") { if (!f.grams) return null; qty = (n * 1000) / f.grams; }
      else qty = n;
    }
    if (!(qty > 0) || qty > 20) return null;
    out.push({ food: f, qty: Math.round(qty * 100) / 100 });
  }
  return out;
}
