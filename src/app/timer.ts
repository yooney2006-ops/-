import { pad } from "./util";
import { beep, notifyRestDone, restoreTimer, saveTimer } from "../platform/session";

/* 휴식 타이머: 세트를 완료하면 자동으로 뜨는 떠 있는 타이머 */
export const timer: { end: number; iv: ReturnType<typeof setInterval> | null; total: number } = { end: 0, iv: null, total: 0 };

/** 짧은 진동(지원하는 기기에서만). 세트 완료·신기록·휴식 종료에 쓴다 */
export function buzz(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* 지원 안 함 */ }
}

const el = (id: string) => document.getElementById(id)!;

export function startTimer(sec = 90, total = sec): void {
  timer.end = Date.now() + sec * 1000;
  timer.total = total;
  saveTimer(timer.end, timer.total);        // 앱이 꺼졌다 켜져도 남은 시간부터 이어지게
  el("timer").classList.add("on");
  el("timer").classList.remove("go");
  if (timer.iv) clearInterval(timer.iv);
  timer.iv = setInterval(tick, 250);
  tick();
}

export function tick(): void {
  const ms = Math.max(0, timer.end - Date.now());
  const left = Math.round(ms / 1000);
  el("timerT").textContent = Math.floor(left / 60) + ":" + pad(left % 60);
  el("timerBar").style.transform = `scaleX(${timer.total ? Math.min(1, ms / 1000 / timer.total) : 0})`;
  if (left <= 0) {
    if (timer.iv) clearInterval(timer.iv);
    el("timerT").textContent = "GO!";
    el("timer").classList.add("go");
    buzz([120, 80, 120]); beep(); notifyRestDone(); saveTimer(0, 0);
    setTimeout(() => el("timer").classList.remove("on"), 2500);
  }
}

export function stopTimer(): void { if (timer.iv) clearInterval(timer.iv); el("timer").classList.remove("on"); saveTimer(0, 0); }
/** 시작할 때: 끝나지 않은 휴식 타이머가 저장돼 있으면 이어서 돌린다 */
export function resumeTimer(): boolean { const t = restoreTimer(); if (!t) return false; startTimer((t.end - Date.now()) / 1000, t.total); return true; }
