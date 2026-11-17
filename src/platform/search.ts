/**
 * 검색: 한국어 별칭 · 초성 · 오타 허용 · 한/영 혼용.
 * 서버 없이 기기 안에서 돈다. 검색어와 후보를 같은 방식으로 정규화해 점수를 매긴다.
 */
import { kvBump } from "./storage";

const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const JUNG = ["ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ", "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ"];
const JONG = ["", "ㄱ", "ㄲ", "ㄳ", "ㄴ", "ㄵ", "ㄶ", "ㄷ", "ㄹ", "ㄺ", "ㄻ", "ㄼ", "ㄽ", "ㄾ", "ㄿ", "ㅀ", "ㅁ", "ㅂ", "ㅄ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
const isSyl = (c: number) => c >= 0xac00 && c <= 0xd7a3;

/** 공백·기호를 없애고 소문자로 */
export const norm = (s: string) => String(s ?? "").toLowerCase().replace(/[\s\-_/·.,()]+/g, "");
/** 글자마다 초성만 (한글이 아니면 그대로) */
export function choseong(s: string): string {
  let o = ""; for (const ch of norm(s)) { const c = ch.charCodeAt(0); o += isSyl(c) ? CHO[Math.floor((c - 0xac00) / 588)] : ch; } return o;
}
/** 자모 단위로 풀기 — 오타 비교용 (벤치 ↔ 밴치는 자모 하나 차이) */
export function jamo(s: string): string {
  let o = ""; for (const ch of norm(s)) { const c = ch.charCodeAt(0); if (!isSyl(c)) { o += ch; continue; } const i = c - 0xac00; o += CHO[Math.floor(i / 588)] + JUNG[Math.floor((i % 588) / 28)] + JONG[i % 28]; } return o;
}
const isChoOnly = (s: string) => s.length > 0 && [...s].every((c) => CHO.includes(c));

/** 편집 거리 (상한을 넘으면 일찍 끝냄) */
export function editDistance(a: string, b: string, max = 3): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return max + 1; prev = cur;
  }
  return prev[b.length];
}
/** 검색어가 후보의 '어느 부분'과 오타 허용 범위 안에서 맞는지 (자모 기준 부분 일치) */
function fuzzyIn(qj: string, tj: string, tol: number): number {
  if (qj.length < 4) return tol + 1;
  let best = tol + 1;
  for (let i = 0; i + qj.length - tol <= tj.length && i <= tj.length; i++) for (const L of [qj.length, qj.length - 1, qj.length + 1]) {
    if (L <= 0 || i + L > tj.length) continue; const d = editDistance(qj, tj.slice(i, i + L), tol); if (d < best) best = d; if (best === 0) return 0;
  }
  return best;
}

export interface Indexed<T> { item: T; texts: string[]; n: string[]; c: string[]; j: string[] }
/** 항목마다 검색에 쓸 글(이름·별칭·영문명 등)을 미리 정규화해 둔다 */
export function buildIndex<T>(items: T[], texts: (it: T) => (string | undefined | null)[]): Indexed<T>[] {
  return items.map((item) => { const t = texts(item).filter(Boolean).map(String); return { item, texts: t, n: t.map(norm), c: t.map(choseong), j: t.map(jamo) }; });
}

/** 한 후보의 점수. 0이면 불일치. 첫 번째 글(이름)에 맞으면 별칭보다 높다 */
export function score<T>(q: string, e: Indexed<T>, fuzzy = true): number {
  const qn = norm(q); if (!qn) return 1;
  const cho = isChoOnly(qn), qj = jamo(qn), tol = qj.length >= 9 ? 2 : 1;
  let best = 0;
  for (let i = 0; i < e.n.length; i++) {
    const w = i === 0 ? 1 : 0.9; let s = 0;
    if (e.n[i] === qn) s = 100; else if (e.n[i].startsWith(qn)) s = 80; else if (e.n[i].includes(qn)) s = 60;
    else if (cho && e.c[i].startsWith(qn)) s = 50; else if (cho && qn.length >= 2 && e.c[i].includes(qn)) s = 40;
    else if (!cho && fuzzy) { const d = fuzzyIn(qj, e.j[i], tol); if (d <= tol) s = 30 - d * 8; }
    if (s * w > best) best = s * w;
  }
  return best;
}

/** 여러 단어 검색: 띄어 쓴 단어가 모두 맞아야 한다 (예: "해머 벤치") */
export function search<T>(index: Indexed<T>[], q: string, limit = 60): T[] {
  const words = String(q ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return index.slice(0, limit).map((e) => e.item);
  const whole = norm(q); let out: [number, number, T][] = [];
  // 1차: 정확·앞부분·포함·초성 일치만. 하나도 없을 때만 오타 허용 비교를 한다 (음식 수천 건에서도 입력이 밀리지 않게)
  for (const fuzzy of [false, true]) {
    index.forEach((e, k) => {
      let s = score(whole, e, fuzzy);
      if (!s && words.length > 1) { let sum = 0; for (const w of words) { const x = score(w, e, fuzzy); if (!x) { sum = 0; break; } sum += x; } s = sum ? (sum / words.length) * 0.8 : 0; }
      if (s) out.push([s, k, e.item]);
    });
    if (out.length) break; out = [];
  }
  return out.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map((x) => x[2]);
}

/** 결과가 없던 검색어를 기록한다 → 다음 DB 확장의 우선순위 */
let missTimer: ReturnType<typeof setTimeout> | undefined;
export function logMiss(kind: "food" | "exercise", q: string): void {
  const k = norm(q); if (k.length < 2) return;
  clearTimeout(missTimer);              // 타이핑 중간 글자는 빼고, 멈춘 뒤의 검색어만
  missTimer = setTimeout(() => { kvBump("search_miss", kind + ":" + k, ["n"], { kind, q: q.trim(), last: new Date().toISOString() }).catch(() => {}); }, 1200);
}
