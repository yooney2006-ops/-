/**
 * 근거 화면: "왜 이 권장인지" 시트, 가이드 탭의 근거 목록, 자유 질문에 대한 자체 DB 답, 규칙 기반 식단 코멘트.
 * 전부 앱에 묶인 데이터로 그리므로 네트워크·AI 없이 동작한다.
 */
import { DESIGN_KO, EVIDENCE_DB, RULES, UNVERIFIED, evidenceFor, rule, searchExercises, type Evidence, type Rule } from "../platform/kb";
import { buildIndex, search } from "../platform/search";
import { logHit, aiStats, SITE_CLASS, type Site } from "../platform/aiflow";
import { kvAll } from "../platform/storage";
import { getExtraFoods, builtinFoods } from "../platform/kb";
import { openSheet } from "./sheets";
import { esc, r0 } from "./util";
import { S } from "./state";

const link = (e: Evidence) => e.doi ? `<a class="xs" href="https://doi.org/${encodeURI(e.doi)}" target="_blank" rel="noopener">DOI ↗</a>` : e.pmid ? `<a class="xs" href="https://pubmed.ncbi.nlm.nih.gov/${e.pmid}/" target="_blank" rel="noopener">PubMed ↗</a>` : "";
const badge = (st: string) => `<span class="chip ${st === "검증됨" || st === "근거 연결됨" ? "ok" : "warn"}">${esc(st)}</span>`;

function evHtml(e: Evidence): string {
  return `<div class="evi"><div class="xs muted">${esc(e.cite)} · ${DESIGN_KO[e.design] || e.design} · 근거 수준 ${e.level} ${e.status !== "검증됨" ? badge(e.status) : ""}</div>
    <div class="small">${esc(e.claim)}</div>${e.value ? `<div class="xs"><b>수치</b> ${esc(e.value)}</div>` : ""}${e.population ? `<div class="xs muted">대상: ${esc(e.population)}</div>` : ""}${link(e)}</div>`;
}
function ruleHtml(r: Rule): string {
  const ev = evidenceFor(r);
  return `<div class="rulebox"><div class="spread"><b>${esc(r.label)}</b>${badge(r.status)}</div><div class="num" style="margin-top:2px">${esc(r.value)}</div>
    ${r.applies_to ? `<div class="xs muted">적용 대상: ${esc(r.applies_to)}</div>` : ""}${r.note ? `<div class="xs" style="margin-top:4px">${esc(r.note)}</div>` : ""}
    ${ev.length ? ev.map(evHtml).join("") : `<div class="xs muted" style="margin-top:6px">연결된 확인 근거가 없어요. 앱의 추정값으로 보세요.</div>`}</div>`;
}

/** "왜 이 권장인지": 규칙과 연결된 근거를 보여 준다 */
export function whySheet(ids: string[]): void {
  const rs = ids.map((id) => rule(id.trim())).filter(Boolean) as Rule[];
  openSheet(`<div class="spread"><h2>왜 이 권장인가요?</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
    <p class="xs muted" style="margin:4px 0 8px">논문 서지는 PubMed·Crossref에서 직접 확인했고, 내용은 자체 요약이에요. 연구 대상이 한정된 결과는 대상을 함께 적었어요.</p>
    ${rs.map(ruleHtml).join("")}<p class="xs muted" style="margin-top:10px">질병·부상·약물과 관련된 경우에는 이 권장값을 따르기 전에 의사·전문가와 상담하세요.</p>`);
}

/** 운동 상세의 "권장값의 근거"에 쓸 규칙들 */
export function exRuleIds(e: any): string {
  const ids = ["rest", "load_reps", "rir"]; if (e.stretch) ids.push("stretch"); if (e.cat === "머신" || e.cat === "프리웨이트") ids.push("machine_free"); if (e.type === "w") ids.push("e1rm_reps");
  return ids.join(",");
}

/** 가이드 탭: 근거 목록 (주제별) + 미검증 목록 */
export function evidenceSectionHtml(): string {
  const topics = [...new Set(RULES.map((r) => r.topic))];
  const linked = RULES.filter((r) => r.status === "근거 연결됨").length;
  return `<section class="card"><div class="spread"><h2>권장값과 연구 근거</h2><span class="xs muted">규칙 ${RULES.length}개 중 ${linked}개 근거 연결 · 논문 ${EVIDENCE_DB.length}편</span></div>
    <div style="margin-top:6px">${topics.map((t) => `<details class="ev"><summary>${esc(t)} <span class="xs muted">${RULES.filter((r) => r.topic === t).map((r) => r.label).join(" · ")}</span></summary><div style="margin-top:6px">${RULES.filter((r) => r.topic === t).map(ruleHtml).join("")}</div></details>`).join("")}
    <details class="ev"><summary>확인하지 못해 넣지 않은 자료 <span class="xs muted">${UNVERIFIED.length}건</span></summary><ul class="tip-list small">${UNVERIFIED.map((u) => `<li>${esc(u.cite)} — <span class="muted">${esc(u.reason)}</span></li>`).join("")}</ul></details></div></section>`;
}

/** 자유 질문: 규칙·근거·운동 DB에서 관련 내용을 찾아 먼저 보여 준다 (AI와 무관하게 즉시) */
let kbIdx: ReturnType<typeof buildIndex<Rule>> | null = null;
export function kbAnswerHtml(q: string): string {
  kbIdx ??= buildIndex(RULES, (r) => [r.label, r.topic, r.value, r.note, ...evidenceFor(r).map((e) => e.claim)]);
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  const seen = new Set<string>(); const rs: Rule[] = [];
  for (const w of [q, ...words]) for (const r of search(kbIdx, w, 3)) if (!seen.has(r.id)) { seen.add(r.id); rs.push(r); }
  const exs = (words.length ? words : [q]).flatMap((w) => searchExercises(w, 2)).filter((e, i, a) => a.indexOf(e) === i).slice(0, 3);
  const medical = /아프|아파|통증|부상|다쳤|디스크|수술|약을|약 복용|혈압|당뇨|임신|질환|저림/.test(q);
  if (!rs.length && !exs.length && !medical) return "";
  logHit("ask", "db");
  return `<div class="card" style="margin-top:10px;background:var(--surface-2)"><div class="xs muted">자체 DB에서 찾은 내용</div>
    ${medical ? `<div class="hint" style="margin-top:6px">통증·부상·질환·약물과 관련된 내용은 앱이 권장값을 드리지 않아요. 증상이 심하거나 계속되면 의사·물리치료사 등 전문가와 상담하세요.</div>` : ""}
    ${exs.map((e: any) => `<button class="res" data-act="exDetail" data-id="${e.id}"><span><b>${esc(e.name)}</b> <span class="muted xs">${esc(e.muscles)}</span><br><span class="xs">${esc(e.tips[0] || "")}</span></span></button>`).join("")}
    ${rs.slice(0, 3).map(ruleHtml).join("")}</div>`;
}

/** 식단: 규칙 기반 코멘트 (AI 없이). 목표 대비 부족·초과를 근거와 함께 짚는다 */
export function dietRuleHtml(T: any, t: any, nMeals: number): string {
  if (!nMeals) return "";
  const p = S.main.profile, lines: string[] = [];
  const pr = t.protein / (T.protein || 1), kc = t.kcal / (T.kcal || 1);
  if (pr < 0.8) lines.push(`단백질이 목표의 <b>${r0(pr * 100)}%</b>예요. ${r0(T.protein - t.protein)}g 더 채우면 목표(체중 kg당 ${(T.protein / p.weight).toFixed(1)}g)에 닿아요.`);
  else if (pr <= 1.15) lines.push(`단백질 목표를 채웠어요 (<b>${r0(t.protein)}g</b> / ${r0(T.protein)}g).`);
  else lines.push(`단백질이 목표보다 많아요 (${r0(t.protein)}g). 하루 약 1.6g/kg을 넘는 양은 근육 증가에 추가 이득이 뚜렷하지 않았어요.`);
  if (kc < 0.85) lines.push(p.goal === "cut" ? `열량이 목표보다 <b>${r0(T.kcal - t.kcal)}kcal</b> 적어요. 적자가 500kcal보다 커지면 근육 유지에 불리했어요.` : `열량이 목표보다 <b>${r0(T.kcal - t.kcal)}kcal</b> 부족해요.`);
  else if (kc > 1.1) lines.push(`열량이 목표보다 <b>${r0(t.kcal - T.kcal)}kcal</b> 많아요.`);
  else lines.push(`열량은 목표 범위 안이에요 (${r0(t.kcal)} / ${r0(T.kcal)}kcal).`);
  if (t.sodium > 2300) lines.push(`나트륨 ${r0(t.sodium)}mg — 국물·가공식품 비중을 확인해 보세요.`);
  logHit("diet_coach", "db");
  return `<section class="card"><div class="spread"><h2>오늘 식단 요약</h2><button class="why" data-act="why" data-rule="protein_${p.goal === "cut" ? "cut" : p.goal === "bulk" ? "bulk" : "keep"},kcal_cut,kcal_bulk">근거</button></div>
    <ul class="tip-list small" style="margin-top:6px">${lines.map((l) => `<li>${l}</li>`).join("")}</ul><div class="xs muted">규칙 기반 계산 (AI 호출 없음)</div></section>`;
}

const SITE_KO: Record<Site, string> = { food_text: "음식 글 입력", food_photo: "음식 사진", diet_coach: "식단 코멘트", ex_tip: "운동 설명", plan_gen: "플랜 생성", plan_feedback: "플랜 평가", ask: "자유 질문" };
/** DB 현황: 지점별 DB/캐시/AI 횟수, 검색 실패어(다음 DB 확장 우선순위), 검증 대기 중인 AI 응답 */
export async function dbStatusSheet(): Promise<void> {
  const [st, miss, pend] = await Promise.all([aiStats().catch(() => ({} as any)), kvAll<any>("search_miss").catch(() => []), kvAll<any>("pending").catch(() => [])]);
  const rows = (Object.keys(SITE_KO) as Site[]).map((k) => { const v = st[k] || { db: 0, cache: 0, ai: 0, ai_fail: 0 }; return `<tr><td>${SITE_KO[k]} <span class="xs muted">${SITE_CLASS[k]}</span></td><td class="num">${v.db}</td><td class="num">${v.cache}</td><td class="num">${v.ai}</td><td class="num">${v.ai_fail}</td></tr>`; }).join("");
  const top = miss.map(([, v]) => v).sort((a, b) => b.n - a.n).slice(0, 30);
  const wait = pend.map(([, v]) => v).filter((v) => !v.check?.ok);
  const extra = getExtraFoods();
  openSheet(`<div class="spread"><h2>DB 현황</h2><button class="btn sm ghost" data-act="closeSheet">닫기</button></div>
    <div class="small" style="margin-top:6px">음식 ${builtinFoods().length + extra.length}개 (내장 ${builtinFoods().length} · 공개 데이터 ${extra.filter((f) => f.src !== "ai").length} · 검증 통과한 AI 추정 ${extra.filter((f) => f.src === "ai").length}) · 규칙 ${RULES.length}개 · 논문 ${EVIDENCE_DB.length}편</div>
    <h3 style="margin-top:14px">조회 기록</h3><table class="tbl"><tr><th>지점</th><th>DB</th><th>캐시</th><th>AI</th><th>실패</th></tr>${rows}</table>
    <p class="xs muted">B = DB·캐시에 있으면 AI를 부르지 않는 지점, C = AI가 필요한 지점. 숫자는 이 기기 누적.</p>
    <h3 style="margin-top:14px">검색에서 못 찾은 말 <span class="xs muted">${miss.length}개</span></h3>
    ${top.length ? `<div class="row" style="margin-top:6px">${top.map((m) => `<span class="chip">${esc(m.q)} · ${m.kind === "food" ? "음식" : "운동"} ${m.n}회</span>`).join("")}</div>` : `<p class="small muted">아직 없어요.</p>`}
    <h3 style="margin-top:14px">검증 대기 중인 AI 응답 <span class="xs muted">${wait.length}개</span></h3>
    ${wait.length ? wait.slice(0, 20).map((w) => `<div class="xs" style="margin-top:4px"><b>${esc(w.item?.name || "?")}</b> ${r0(w.item?.kcal)}kcal — <span class="muted">${esc((w.check?.reasons || []).join(", "))}</span></div>`).join("") : `<p class="small muted">없어요. 검증 규칙(범위·필수값·열량 일치·중복)을 통과한 응답만 음식 DB에 들어가요.</p>`}`);
}
