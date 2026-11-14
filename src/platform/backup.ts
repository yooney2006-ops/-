/** JSON 내보내기/가져오기. 아티팩트 기록을 옮기거나 기기를 바꿀 때 쓴다. */
import type { AppState, DayDoc, MainDoc } from "../types";

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
