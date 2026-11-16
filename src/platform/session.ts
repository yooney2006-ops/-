/**
 * 운동 중 세션 유지: 앱이 꺼졌다 켜져도 이어지게 하는 것들.
 * - 마지막으로 보던 탭 (몇 시간 안에 다시 열면 그 탭으로)
 * - 휴식 타이머의 종료 시각
 * - 화면 꺼짐 방지 (운동 탭에서 운동이 진행 중일 때)
 * - 휴식이 끝났을 때의 소리·알림
 * 모두 기기(localStorage)에만 저장한다. 저장이 막힌 환경에서는 조용히 건너뛴다.
 */
const UI_KEY = "gymlog-ui", TIMER_KEY = "gymlog-timer";
const RESTORE_WINDOW = 3 * 60 * 60 * 1000;       // 3시간 안에 다시 열면 보던 탭으로

const get = (k: string): any => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch { return null; } };
const set = (k: string, v: unknown) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch { /* 저장 불가 */ } };

export function saveTab(tab: string): void { set(UI_KEY, { tab, at: Date.now() }); }
export function restoreTab(): string | null { const v = get(UI_KEY); return v && typeof v.tab === "string" && Date.now() - v.at < RESTORE_WINDOW ? v.tab : null; }

export function saveTimer(end: number, total: number): void { set(TIMER_KEY, end ? { end, total } : null); }
/** 아직 끝나지 않은 타이머가 있으면 돌려준다 */
export function restoreTimer(): { end: number; total: number } | null { const v = get(TIMER_KEY); if (v && v.end > Date.now()) return v; if (v) set(TIMER_KEY, null); return null; }

/* ── 화면 꺼짐 방지 ── */
let want = false, lock: any = null;
async function acquire(): Promise<void> {
  if (!want || lock || document.visibilityState !== "visible") return;
  try { lock = await (navigator as any).wakeLock?.request("screen"); lock?.addEventListener?.("release", () => { lock = null; }); } catch { lock = null; }
}
/** on=true인 동안 화면이 꺼지지 않게 한다(지원하는 브라우저에서만). 다른 앱에 다녀오면 자동으로 다시 건다 */
export function keepAwake(on: boolean): void {
  want = on;
  if (on) acquire(); else if (lock) { lock.release?.().catch(() => {}); lock = null; }
}
export const isAwake = () => !!lock;
if (typeof document !== "undefined") document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") acquire(); });

/* ── 휴식 종료 알림: 소리 + (권한이 있으면) 알림 ── */
let actx: AudioContext | null = null;
/** 사용자가 화면을 누른 순간에 불러 둬야 나중에 소리를 낼 수 있다 (브라우저 자동재생 정책) */
export function primeSound(): void {
  try { actx ??= new (window.AudioContext || (window as any).webkitAudioContext)(); if (actx.state === "suspended") actx.resume(); } catch { actx = null; }
}
export function beep(): void {
  if (!actx) return;
  try {
    for (const [i, f] of [[0, 880], [0.18, 880], [0.36, 1320]] as [number, number][]) {
      const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime + i;
      o.frequency.value = f; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
      o.start(t); o.stop(t + 0.16);
    }
  } catch { /* 소리 불가 */ }
}
export const notifyState = (): string => (typeof Notification === "undefined" ? "unsupported" : Notification.permission);
export async function askNotify(): Promise<string> { try { return typeof Notification === "undefined" ? "unsupported" : await Notification.requestPermission(); } catch { return "denied"; } }
/** 화면을 보고 있지 않을 때만 알림을 띄운다 */
export async function notifyRestDone(): Promise<void> {
  if (notifyState() !== "granted" || document.visibilityState === "visible") return;
  try { const reg = await navigator.serviceWorker?.getRegistration(); const opt = { body: "다음 세트를 시작하세요", tag: "gymlog-rest", renotify: true } as NotificationOptions;
    if (reg) await reg.showNotification("휴식 끝", opt); else new Notification("휴식 끝", opt); } catch { /* 알림 불가 */ }
}
