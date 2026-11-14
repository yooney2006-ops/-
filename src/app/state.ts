/**
 * 앱 상태와 저장. 화면 코드는 S를 직접 고친 뒤 markDirty(문서 키)를 부른다.
 * 바뀐 문서만 잠깐 모았다가 IndexedDB에 쓴다.
 */
import type { AppState } from "../types";
import { loadAll, putDocs, replaceAll, requestPersistence, dayKey } from "../platform/storage";
import { makeTemplate } from "./training";
import { esc, ymd } from "./util";

export { dayKey };

/** 아티팩트 시절 브라우저 저장 키. 같은 주소에 남아 있으면 첫 실행 때 한 번 옮겨 온다. */
const LEGACY_LS_KEY = "gymlog-v1";

export function defaultState(): AppState {
  return {
    main: {
      profile: { sex: "m", age: 27, height: 175, weight: 72, activity: 1.55, goal: "bulk", example: true },
      override: null,
      customFoods: [],
      plan: makeTemplate({ days: 4, goal: "hyper", level: "mid", equip: "gym" }).days,
      planNote: "예시 플랜 (상하체 4분할). 원하는 대로 바꾸거나 추천을 다시 받아보세요.",
    },
    days: {},
  };
}

// 시작 시 initState()가 채운다 (플랜 템플릿 정의 이후에 만들어야 해서 null로 시작)
export let S: AppState = null as unknown as AppState;
// 화면 상태. 원본 코드가 필드를 자유롭게 붙여 쓰므로 느슨한 타입으로 둔다.
export const ui: Record<string, any> = {
  tab: "food", date: ymd(new Date()), guidePart: "전체", guideCat: "전체", guideBrand: "전체", guideQ: "", aiBusy: false,
};

const dirty = new Set<string>();
let timer: ReturnType<typeof setTimeout> | undefined;
let chain: Promise<void> = Promise.resolve();
let failed = false;

export function setStatus(t: string, warn = false): void {
  const el = document.getElementById("saveStatus");
  if (el) el.innerHTML = "저장: <b" + (warn ? ' style="color:var(--bad)"' : "") + ">" + esc(t) + "</b>";
}

export function markDirty(key: string): void {
  dirty.add(key);
  clearTimeout(timer);
  timer = setTimeout(flush, 250);
}

/** 모아 둔 변경을 지금 쓴다. 화면을 떠날 때도 불린다. */
export function flush(): Promise<void> {
  clearTimeout(timer);
  if (!dirty.size) return chain;
  const keys = [...dirty];
  dirty.clear();
  const docs: Record<string, unknown> = {};
  for (const k of keys) docs[k] = k === "main" ? S.main : S.days[k.slice(2)] || { meals: [], workout: { items: [] } };
  chain = chain.then(async () => {
    try {
      await putDocs(docs);
      if (failed) { failed = false; setStatus("이 기기"); }
    } catch (e) {
      console.error(e);
      keys.forEach((k) => dirty.add(k)); // 다음 변경 때 다시 시도
      failed = true;
      setStatus("저장 실패 · 백업을 내보내 두세요", true);
    }
  });
  return chain;
}

function valid(v: any): v is AppState {
  return !!(v && v.main && v.main.profile && Array.isArray(v.main.plan));
}

/** 저장된 데이터를 읽어 S를 채운다. 화면을 그리기 전에 한 번 부른다. */
export async function initState(): Promise<void> {
  S = defaultState();
  try {
    const saved = await loadAll();
    if (saved && valid(saved)) {
      S = { main: saved.main, days: saved.days || {} };
    } else {
      let legacy: any = null;
      try { legacy = JSON.parse(localStorage.getItem(LEGACY_LS_KEY) || "null"); } catch { /* 없음 */ }
      if (valid(legacy)) S = { main: legacy.main, days: legacy.days || {} };
      await replaceAll(S);
    }
    setStatus("이 기기");
    requestPersistence();
  } catch (e) {
    console.error(e);
    failed = true;
    setStatus("저장소를 열 수 없음 · 기록이 남지 않아요", true);
  }
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
  addEventListener("pagehide", () => { flush(); });
}

/** 전체 데이터를 바꾼다(백업 가져오기). 저장까지 끝난 뒤 돌아온다. */
export async function replaceState(next: AppState): Promise<void> {
  clearTimeout(timer);
  dirty.clear();
  await chain;
  await replaceAll(next);
  S = next;
}
