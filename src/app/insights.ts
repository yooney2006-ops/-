/**
 * 분석 탭: 회복(피로) 바디 히트맵, 주간 볼륨, 추정 1RM 추이, 강도(RIR) 추이, 부위별 세트, 월간 기록.
 * 참고: Hevy(근육 히트맵·주간 세트), Strong(운동별 1RM 그래프), Alpha Progression(RIR 기반 강도 관리), Fitbod(회복도).
 */
import { S, ui } from "./state";
import { addDays, esc, parseD, r0, r1, wIdx } from "./util";
import { workSets, e1rm, exType, itemVolume, recovery, rirOf } from "./training";
import { MGROUP, monthCal, recoveryCards, backupNudgeHtml } from "./views";
import { FIG } from "../engine/fig.js";
import { EX } from "../data/exercises.js";
import type { WorkoutItem } from "../types";

const itemsOf = (d: string): WorkoutItem[] => S.days[d]?.workout?.items || [];
const mondayOf = (d: string) => addDays(d, -wIdx(d));
const md = (d: string) => `${parseD(d).getMonth() + 1}/${parseD(d).getDate()}`;

interface Week { start: string; vol: number; sets: number; rirSum: number; rirN: number; hard: number }

/** 기준 주를 포함해 최근 n주의 볼륨·세트·RIR */
export function weeklyStats(ref: string, n = 8): Week[] {
  const out: Week[] = [];
  for (let w = n - 1; w >= 0; w--) {
    const start = addDays(mondayOf(ref), -7 * w);
    const wk: Week = { start, vol: 0, sets: 0, rirSum: 0, rirN: 0, hard: 0 };
    for (let i = 0; i < 7; i++) for (const it of itemsOf(addDays(start, i))) {
      const ds = workSets(it) as any[];
      if (exType(it) === "t") continue;
      wk.vol += itemVolume(it); wk.sets += ds.length;
      for (const s of ds) if (s.rir !== "" && s.rir != null) { const r = rirOf(s); wk.rirSum += r; wk.rirN++; if (r <= 1) wk.hard++; }
    }
    out.push(wk);
  }
  return out;
}

interface Lift { name: string; pts: { d: string; v: number }[]; last: number; delta: number }

/** 기록이 2번 이상 있는 중량 운동의 추정 1RM 추이 (최근 기록이 많은 순) */
export function liftTrends(max = 6): Lift[] {
  const by = new Map<string, { d: string; v: number }[]>();
  for (const d of Object.keys(S.days).sort()) for (const it of itemsOf(d)) {
    if (exType(it) !== "w") continue;
    const best = (workSets(it) as any[]).reduce((a, s) => Math.max(a, e1rm(+s.w, +s.r)), 0);
    if (best > 0) { const a = by.get(String(it.name)) || []; a.push({ d, v: best }); by.set(String(it.name), a); }
  }
  return [...by.entries()].filter(([, p]) => p.length >= 2)
    .sort((a, b) => b[1].length - a[1].length || (a[1][a[1].length - 1].d < b[1][b[1].length - 1].d ? 1 : -1)).slice(0, max)
    .map(([name, all]) => { const pts = all.slice(-12); const last = pts[pts.length - 1].v; return { name, pts, last, delta: last - pts[0].v }; });
}

function spark(vals: number[], w = 96, h = 30): string {
  const mn = Math.min(...vals), mx = Math.max(...vals), x = (i: number) => 2 + (w - 4) * i / (vals.length - 1), y = (v: number) => h - 3 - (h - 6) * (v - mn) / (mx - mn || 1);
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><polyline points="${vals.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${x(vals.length - 1)}" cy="${y(vals[vals.length - 1])}" r="3" fill="var(--accent)"/></svg>`;
}

function bars(weeks: Week[], val: (w: Week) => number, fmt: (v: number) => string, cur: string): string {
  const mx = Math.max(1, ...weeks.map(val));
  return `<div class="bars">${weeks.map(w => { const v = val(w); return `<div class="bcol${w.start === cur ? " cur" : ""}"><span class="bv num">${v ? fmt(v) : ""}</span><i style="height:${Math.max(v ? 4 : 0, v / mx * 100)}%"></i><span class="bl">${md(w.start)}</span></div>`; }).join("")}</div>`;
}

export function viewInsights(): string {
  const ref = ui.date as string, cur = mondayOf(ref), weeks = weeklyStats(ref, 8);
  const any = weeks.some(w => w.sets > 0);
  let h = backupNudgeHtml() + `<section class="card"><div class="spread"><h2>회복 히트맵</h2><span class="xs muted">진할수록 아직 피로가 남은 부위</span></div>
    <div class="grid2" style="margin-top:8px"><canvas id="heatFront" class="heat" aria-label="앞면 피로도"></canvas><canvas id="heatBack" class="heat" aria-label="뒷면 피로도"></canvas></div>
    <div class="heatlegend xs muted"><span>회복됨</span><i></i><span>피로</span></div></section>`;
  if (!any) h += `<div class="empty">아직 완료한 세트가 없어요. 운동 탭에서 세트를 체크하면 여기에 볼륨·1RM·강도 추이가 쌓여요.</div>`;
  else {
    const tw = weeks[weeks.length - 1], pw = weeks[weeks.length - 2];
    const chg = pw && pw.vol ? Math.round((tw.vol / pw.vol - 1) * 100) : null;
    h += `<section class="card"><div class="spread"><h2>주간 훈련 볼륨</h2><span class="small">이번 주 <b class="num">${r0(tw.vol).toLocaleString()}</b>kg${chg != null ? ` <span class="num" style="color:${chg >= 0 ? "var(--good)" : "var(--warn)"}">${chg >= 0 ? "+" : ""}${chg}%</span>` : ""}</span></div>
      ${bars(weeks, w => w.vol, v => v >= 1000 ? r1(v / 1000) + "t" : String(r0(v)), cur)}
      <div class="spread small" style="margin-top:10px"><span class="muted">주간 완료 세트</span><span class="num">${weeks.map(w => w.sets).join(" · ")}</span></div>
      <p class="xs muted" style="margin:6px 0 0">볼륨 = 무게 × 횟수의 합(완료 세트). 한 주에 10% 넘게 급증하면 회복이 따라오지 못할 수 있어요.</p></section>`;
    const lifts = liftTrends();
    h += `<section class="card"><div class="spread"><h2>추정 1RM 추이</h2><span class="xs muted">Epley 공식 · 세션 최고 세트</span></div>`;
    h += lifts.length ? `<div class="lifts">${lifts.map(l => `<button class="lift" data-act="tips" data-ex="${esc(EX.find((e: any) => e.name === l.name)?.id || "")}" data-name="${esc(l.name)}"><span class="ln">${esc(l.name)}</span>${spark(l.pts.map(p => p.v))}<span class="lv num"><span><b>${r1(l.last)}</b> kg</span><small style="color:${l.delta >= 0 ? "var(--good)" : "var(--warn)"}">${l.delta >= 0 ? "▲" : "▼"} ${r1(Math.abs(l.delta))}</small></span></button>`).join("")}</div>`
      : `<p class="small muted" style="margin:8px 0 0">같은 운동을 두 번 이상 기록하면 추이가 보여요.</p>`;
    h += `</section>`;
    const rw = weeks.filter(w => w.rirN > 0);
    h += `<section class="card"><div class="spread"><h2>강도 (RIR)</h2><span class="xs muted">RIR = 남은 반복 수 · 낮을수록 고강도</span></div>`;
    if (rw.length) {
      const avg = tw.rirN ? r1(tw.rirSum / tw.rirN) : null, hard = tw.rirN ? Math.round(tw.hard / tw.rirN * 100) : null;
      h += `<div class="kpis"><div><span class="xs muted">이번 주 평균 RIR</span><b class="num">${avg ?? "–"}</b></div><div><span class="xs muted">고강도 세트 (RIR 0~1)</span><b class="num">${hard != null ? hard + "%" : "–"}</b></div><div><span class="xs muted">RIR 기록률</span><b class="num">${tw.sets ? Math.round(tw.rirN / tw.sets * 100) : 0}%</b></div></div>
        ${bars(weeks, w => w.rirN ? Math.max(.15, 4 - w.rirSum / w.rirN) : 0, v => r1(4 - v).toString(), cur)}
        <p class="xs muted" style="margin:6px 0 0">막대가 높을수록 한계에 가깝게 훈련한 주(숫자 = 평균 RIR). 근비대 목표는 대부분의 세트를 RIR 0~3에서, 고강도 주가 이어지면 한 주 낮추는 걸 권해요.</p>`;
    } else h += `<p class="small muted" style="margin:8px 0 0">세트 옆 RIR 칸을 채우면 강도 추이를 볼 수 있어요.</p>`;
    h += `</section>`;
  }
  return h + recoveryCards() + monthCal();
}

/** 회복 히트맵: 부위별 피로(100 − 회복도)를 인체 모형에 색으로 */
export function initHeatMaps(): void {
  const rec = recovery(ui.date) as Record<string, { r: number }>;
  const heat: Record<string, number> = {};
  for (const [g, keys] of MGROUP as [string, string[]][]) for (const k of keys) heat[k] = Math.max(0, Math.min(1, (100 - (rec[g]?.r ?? 100)) / 45));
  const keys = Object.keys(heat);
  const ex = { id: "heat", anim: { p: "raise", o: { kind: "shrug", tool: "none" } }, prim: keys.filter(k => heat[k] > .55), sec: keys.filter(k => heat[k] > .15 && heat[k] <= .55), cam: [0, 6] };
  for (const [id, yaw] of [["heatFront", 15], ["heatBack", 195]] as [string, number][]) {
    const cv = document.getElementById(id) as HTMLCanvasElement | null; if (!cv) continue;
    try { const v = FIG.viewer(cv, ex, { autoplay: false, heat }); v.setView(yaw, 6); v.setSpan(1.3, [0, .93, 0]); v.frameAt(0); (ui.maps as any[]).push(v); } catch { /* 3D 미지원 */ }
  }
}
