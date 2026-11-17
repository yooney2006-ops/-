/** JSON 내보내기/가져오기. 아티팩트 기록을 옮기거나 기기를 바꿀 때 쓴다. */
import type { AppState, DayDoc, MainDoc } from "../types";
import { EX } from "../data/exercises.js";
const PART = new Map<string, string>((EX as any[]).map((e) => [e.id, e.part]));

export interface BackupFile {
  app: "gymlog";
  version: 1;
  exportedAt: string;
  main: MainDoc;
  days: Record<string, DayDoc>;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function toBackup(state: AppState): BackupFile {
  return { app: "gymlog", version: 1, exportedAt: new Date().toISOString(), main: state.main, days: state.days };
}

/**
 * 받아들이는 모양:
 *  1) 이 앱의 백업 파일 {app:"gymlog", main, days}
 *  2) 아티팩트의 브라우저 저장본(localStorage "gymlog-v1") {main, days}
 *  3) 아티팩트 클라우드 문서 모음 {main, "d-2026-01-02": {...}, ...}
 * 모양이 맞지 않으면 한국어 메시지로 오류를 던진다.
 */
export function parseBackup(text: string): AppState {
  let v: any;
  try {
    v = JSON.parse(text);
  } catch {
    throw new Error("JSON 파일이 아니에요.");
  }
  if (!v || typeof v !== "object" || Array.isArray(v)) throw new Error("짐로그 백업 파일이 아니에요.");
  const main = v.main;
  if (!main || typeof main !== "object" || !main.profile || !Array.isArray(main.plan))
    throw new Error("짐로그 백업 파일이 아니에요. (내 정보·플랜이 없어요)");
  const src: Record<string, unknown> =
    v.days && typeof v.days === "object"
      ? v.days
      : Object.fromEntries(Object.entries(v).filter(([k]) => k.startsWith("d-")).map(([k, d]) => [k.slice(2), d]));
  const days: Record<string, DayDoc> = {};
  for (const [k, d] of Object.entries(src)) {
    if (!DATE.test(k) || !d || typeof d !== "object") continue;
    const day = d as any;
    days[k] = {
      ...day,
      meals: Array.isArray(day.meals) ? day.meals : [],
      workout: { ...(day.workout || {}), items: Array.isArray(day.workout?.items) ? day.workout.items : [] },
    };
  }
  main.customFoods = Array.isArray(main.customFoods) ? main.customFoods : [];
  if (main.override === undefined) main.override = null;
  return { main, days };
}

/** 기록이 있는 날 수 (가져오기 전 확인 문구용) */
export function countDays(state: AppState): number {
  return Object.values(state.days).filter((d) => d.meals.length || d.workout.items.length).length;
}

export function downloadJSON(name: string, data: unknown): void {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 완료한 세트를 한 줄씩 (엑셀·구글 시트용). 첫 줄은 열 이름 */
export function workoutRows(state: AppState): (string | number)[][] {
  const rows: (string | number)[][] = [["날짜", "운동", "부위", "세트", "종류", "무게(kg)", "횟수", "RIR", "신기록"]];
  for (const d of Object.keys(state.days).sort()) for (const it of state.days[d].workout?.items || []) {
    let n = 0;
    for (const s of it.sets || []) {
      if (!s.done) continue; const kind = (s as any).kind === "w" ? "워밍업" : (s as any).kind === "d" ? "드롭" : "본 세트"; if ((s as any).kind !== "w") n++;
      rows.push([d, String(it.name ?? ""), String((it as any).part ?? PART.get(String((it as any).exId)) ?? ""), (s as any).kind === "w" ? "" : n, kind, Number(s.w) || 0, Number(s.r) || 0, s.rir ?? "", (s as any).pr ? "Y" : ""]);
    }
  }
  return rows;
}
/** CSV 한 칸: 쉼표·따옴표·줄바꿈이 있으면 따옴표로 감싼다 */
export const csvCell = (v: string | number) => { const t = String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export const toCSV = (rows: (string | number)[][]) => rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
/** 내려받기. 엑셀에서 한글이 깨지지 않게 BOM을 붙인다. 돌려주는 값은 데이터 줄 수 */
export function downloadCSV(name: string, rows: (string | number)[][]): number {
  if (rows.length <= 1) return 0;
  const url = URL.createObjectURL(new Blob(["\ufeff" + toCSV(rows)], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  return rows.length - 1;
}
