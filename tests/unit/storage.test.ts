import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadAll, putDocs, replaceAll } from "../../src/platform/storage";
import { countDays, parseBackup, toBackup, toCSV, workoutRows } from "../../src/platform/backup";
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

describe("CSV 내보내기", () => {
  it("완료한 세트만, 워밍업은 번호 없이, 쉼표가 든 이름은 따옴표로", () => {
    const st = { main, days: { "2026-11-16": { meals: [], workout: { items: [{ exId: "bench", name: "벤치, 바벨", sets: [{ w: 20, r: 10, done: true, kind: "w" }, { w: 60, r: 8, done: true, rir: "1", pr: true }, { w: 60, r: 8, done: false }] }] } } } } as any;
    const rows = workoutRows(st);
    expect(rows.length).toBe(3);
    expect(rows[1]).toEqual(["2026-11-16", "벤치, 바벨", "가슴", "", "워밍업", 20, 10, "", ""]);
    expect(rows[2]).toEqual(["2026-11-16", "벤치, 바벨", "가슴", 1, "본 세트", 60, 8, "1", "Y"]);
    expect(toCSV(rows).split("\r\n")[2]).toBe('2026-11-16,"벤치, 바벨",가슴,1,본 세트,60,8,1,Y');
  });
});

describe("Claude 프록시 (Vercel 함수 진입점)", () => {
  const post = (body: unknown, headers: Record<string, string> = {}) => new Request("https://x/api/ai", { method: "POST", headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  it("키가 없으면 '설정 안 됨'으로 답한다 (앱은 안내 문구를 보여 준다)", async () => {
    const { default: handler } = await import("../../api/ai");
    const old = process.env.ANTHROPIC_API_KEY; delete process.env.ANTHROPIC_API_KEY;
    const r = await handler(post({ mode: "text", prompt: "hi" })); if (old) process.env.ANTHROPIC_API_KEY = old;
    expect(r.status).toBe(503); expect((await r.json()).code).toBe("not_configured");
  });
  it("접속 암호가 설정돼 있으면 암호 없이는 거절하고, 형식이 틀린 요청·GET도 거절한다", async () => {
    const { handleAI } = await import("../../server/ai");
    const env = { ANTHROPIC_API_KEY: "test-key-not-real", GYMLOG_TOKEN: "pw" };
    expect((await handleAI(post({ mode: "text", prompt: "hi" }), env)).status).toBe(401);
    expect((await handleAI(post({ mode: "nope" }, { "x-gymlog-token": "pw" }), env)).status).toBe(400);
    expect((await handleAI(new Request("https://x/api/ai"), env)).status).toBe(405);
  });
});
