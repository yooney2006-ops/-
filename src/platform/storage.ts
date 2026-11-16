/**
 * 저장 계층: IndexedDB.
 * 문서 키는 아티팩트 시절과 같다 — `main` 하나와 날짜별 `d-YYYY-MM-DD`.
 * 나중에 기기 간 동기화(Supabase 등)를 붙일 때는 이 파일의 네 함수만 같은 모양으로 구현하면 된다.
 */
import type { AppState, DayDoc, MainDoc } from "../types";

const DB_NAME = "gymlog";
const STORE = "docs";
/**
 * 스키마 버전
 *  1: docs (사용자 기록)
 *  2: ai_cache(AI 응답 캐시) · pending(AI 응답 검증 대기) · promoted(검증 통과한 음식) · search_miss(검색 실패 쿼리) · ai_log(호출 수)
 */
export const DB_VERSION = 2;
export const KB_STORES = ["ai_cache", "pending", "promoted", "search_miss", "ai_log"] as const;
export type KbStore = (typeof KB_STORES)[number];
const ALL_STORES = [STORE, ...KB_STORES];
let dbp: Promise<IDBDatabase> | null = null;

function open(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const rq = indexedDB.open(DB_NAME, DB_VERSION);
      // 마이그레이션: 버전마다 없는 저장소만 추가한다. 기존 사용자 기록(docs)은 건드리지 않는다.
      rq.onupgradeneeded = () => { const db = rq.result; for (const name of ALL_STORES) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name); };
      rq.onsuccess = () => resolve(rq.result);
      rq.onerror = () => reject(rq.error);
      rq.onblocked = () => reject(new Error("IndexedDB가 다른 탭에 막혀 있어요"));
    });
    dbp.catch(() => (dbp = null));
  }
  return dbp;
}

function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => T): Promise<T> {
  return open().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(STORE, mode);
        const out = run(t.objectStore(STORE));
        t.oncomplete = () => resolve(out);
        t.onerror = () => reject(t.error);
        t.onabort = () => reject(t.error ?? new Error("저장이 취소됐어요"));
      }),
  );
}

export const dayKey = (date: string) => "d-" + date;

/** 저장된 문서를 전부 읽는다. 아무것도 없으면 null. */
export async function loadAll(): Promise<Partial<AppState> | null> {
  const rows = await tx("readonly", (s) => {
    const out: [string, unknown][] = [];
    s.openCursor().onsuccess = (e) => {
      const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result;
      if (c) {
        out.push([String(c.key), c.value]);
        c.continue();
      }
    };
    return out;
  });
  if (!rows.length) return null;
  const st: Partial<AppState> = { days: {} };
  for (const [k, v] of rows) {
    if (k === "main") st.main = v as MainDoc;
    else if (k.startsWith("d-")) st.days![k.slice(2)] = v as DayDoc;
  }
  return st;
}

/** 문서 여러 개를 한 트랜잭션으로 쓴다. 값이 undefined면 그 문서를 지운다. */
export function putDocs(docs: Record<string, unknown>): Promise<void> {
  return tx("readwrite", (s) => {
    for (const [k, v] of Object.entries(docs)) {
      if (v === undefined) s.delete(k);
      else s.put(JSON.parse(JSON.stringify(v)), k);
    }
  });
}

/** 전체를 통째로 바꾼다(백업 가져오기). 한 트랜잭션이라 중간에 실패하면 원래 데이터가 남는다. */
export function replaceAll(state: AppState): Promise<void> {
  return tx("readwrite", (s) => {
    s.clear();
    s.put(JSON.parse(JSON.stringify(state.main)), "main");
    for (const [d, v] of Object.entries(state.days)) s.put(JSON.parse(JSON.stringify(v)), dayKey(d));
  });
}

/** 브라우저가 저장 공간을 마음대로 비우지 않도록 요청한다(휴대폰에서 기록이 사라지는 일 방지). */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}

/* ── 보조 저장소(캐시·검증 대기·로그): 키-값 ── */
function kv<T>(store: KbStore, mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest | void): Promise<T> {
  return open().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode); const rq = run(t.objectStore(store));
    t.oncomplete = () => resolve((rq ? rq.result : undefined) as T);
    t.onerror = () => reject(t.error); t.onabort = () => reject(t.error ?? new Error("저장이 취소됐어요"));
  }));
}
export const kvGet = <T>(store: KbStore, key: string) => kv<T | undefined>(store, "readonly", (s) => s.get(key));
export const kvPut = (store: KbStore, key: string, value: unknown) => kv<void>(store, "readwrite", (s) => { s.put(JSON.parse(JSON.stringify(value)), key); });
export const kvDelete = (store: KbStore, key: string) => kv<void>(store, "readwrite", (s) => { s.delete(key); });
export const kvClear = (store: KbStore) => kv<void>(store, "readwrite", (s) => { s.clear(); });
export async function kvAll<T>(store: KbStore): Promise<[string, T][]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const out: [string, T][] = []; const t = db.transaction(store, "readonly");
    t.objectStore(store).openCursor().onsuccess = (e) => { const c = (e.target as IDBRequest<IDBCursorWithValue | null>).result; if (c) { out.push([String(c.key), c.value]); c.continue(); } };
    t.oncomplete = () => resolve(out); t.onerror = () => reject(t.error);
  });
}
/** 숫자 필드를 1씩 올린다 (호출 수·검색 실패 횟수). 읽고 쓰기를 한 트랜잭션에서 한다 */
export async function kvBump(store: KbStore, key: string, fields: string[], extra: Record<string, unknown> = {}): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, "readwrite"); const os = t.objectStore(store); const g = os.get(key);
    g.onsuccess = () => { const v = { ...(g.result || {}), ...extra } as Record<string, any>; for (const f of fields) v[f] = (v[f] || 0) + 1; os.put(v, key); };
    t.oncomplete = () => resolve(); t.onerror = () => reject(t.error);
  });
}
/** 테스트용: 열린 연결을 닫는다 */
export async function _closeForTest(): Promise<void> { if (dbp) { (await dbp).close(); dbp = null; } }
