import { pad } from "./util";

/* 휴식 타이머: 세트를 완료하면 자동으로 뜨는 떠 있는 타이머 */
export const timer: { end: number; iv: ReturnType<typeof setInterval> | null; total: number } = { end: 0, iv: null, total: 0 };

/** 짧은 진동(지원하는 기기에서만). 세트 완료·신기록·휴식 종료에 쓴다 */
export function buzz(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* 지원 안 함 */ }
}

const el = (id: string) => document.getElementById(id)!;

export function startTimer(sec = 90): void {
  timer.end = Date.now() + sec * 1000;
  timer.total = sec;
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
    buzz([120, 80, 120]);
    setTimeout(() => el("timer").classList.remove("on"), 2500);
  }
}
