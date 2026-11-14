import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadAll, putDocs, replaceAll } from "../../src/platform/storage";
import { countDays, parseBackup, toBackup } from "../../src/platform/backup";
import type { AppState } from "../../src/types";

const main = { profile: { sex: "m", age: 30, height: 175, weight: 70, activity: 1.55, goal: "bulk" }, override: null, customFoods: [], plan: [{ title: "A", items: [] }] } as AppState["main"];
const dayA = { meals: [{ id: "1", meal: "아침", name: "밥", serving: "1공기", grams: 210, kcal: 315, carb: 69, protein: 5.7, fat: 0.6, qty: 1 }], workout: { items: [] } };

describe("IndexedDB 저장", () => {
  it("비어 있으면 null", async () => {
    expect(await loadAll()).toBeNull();
  });
  it("문서 구조는 main + d-YYYY-MM-DD, 읽으면 그대로 돌아온다", async () => {
    await putDocs({ main, "d-2026-11-14": dayA });
    expect(await loadAll()).toEqual({ main, days: { "2026-11-14": dayA } });
  });
  it("replaceAll은 이전 기록을 남기지 않는다", async () => {
    await replaceAll({ main, days: { "2026-01-01": dayA } });
    expect(Object.keys((await loadAll())!.days!)).toEqual(["2026-01-01"]);
  });
});

describe("백업 파일", () => {
  const state: AppState = { main, days: { "2026-11-14": dayA, "2026-11-15": { meals: [], workout: { items: [] } } } };
  it("내보낸 파일을 다시 읽으면 같은 데이터", () => {
    expect(parseBackup(JSON.stringify(toBackup(state)))).toEqual(state);
    expect(countDays(state)).toBe(1);
  });
  it("아티팩트 클라우드 문서 모양(main, d-날짜)도 읽는다", () => {
    expect(parseBackup(JSON.stringify({ main, "d-2026-11-14": dayA })).days).toEqual({ "2026-11-14": dayA });
  });
  it("엉뚱한 파일은 거절한다", () => {
    expect(() => parseBackup("안녕")).toThrow();
    expect(() => parseBackup("[1,2]")).toThrow();
    expect(() => parseBackup('{"main":{}}')).toThrow();
  });
  it("빠진 필드는 채우고 잘못된 날짜 키는 버린다", () => {
    const s = parseBackup(JSON.stringify({ main, days: { "2026-11-14": {}, oops: dayA } }));
    expect(s.days).toEqual({ "2026-11-14": { meals: [], workout: { items: [] } } });
  });
});
