import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { choseong, editDistance, jamo } from "../../src/platform/search";
import { EVIDENCE_DB, RULES, resolveFoodText, searchExercises, searchFoods, setExtraFoods, toEnglish } from "../../src/platform/kb";
import { DB_VERSION, _closeForTest, kvAll, kvGet, loadAll, putDocs } from "../../src/platform/storage";

vi.mock("../../src/platform/ai", () => ({ askJSON: vi.fn(), askText: vi.fn() }));
import { askJSON, askText } from "../../src/platform/ai";
import { aiStats, cachedJSON, cachedText, ingestAIFoods, sessionCounts, validateFood } from "../../src/platform/aiflow";

const names = (l: any[]) => l.map((e) => e.name);

describe("검색", () => {
  it("초성·자모 분해", () => {
    expect(choseong("벤치프레스")).toBe("ㅂㅊㅍㄹㅅ");
    expect(editDistance(jamo("밴치프레스"), jamo("벤치프레스"))).toBe(1);
  });
  it("초성 검색", () => { expect(names(searchExercises("ㅂㅊㅍㄹㅅ"))).toContain("바벨 벤치프레스"); expect(names(searchExercises("ㄹㅍㄷㅇ"))).toContain("랫 풀다운"); });
  it("오타 허용", () => { expect(names(searchExercises("밴치프레스"))).toContain("바벨 벤치프레스"); expect(names(searchExercises("데드리프투"))).toContain("컨벤셔널 데드리프트"); });
  it("별칭", () => { expect(names(searchExercises("턱걸이"))[0]).toBe("풀업(턱걸이)"); expect(names(searchExercises("사레레"))).toContain("사이드 레터럴 레이즈"); expect(names(searchExercises("천국의 계단"))).toContain("스텝밀(천국의 계단)"); });
  it("영문·한영 혼용", () => {
    expect(toEnglish("바벨 벤치프레스")).toBe("barbell bench press");
    expect(names(searchExercises("bench press"))).toContain("바벨 벤치프레스");
    expect(names(searchExercises("squat"))).toContain("바벨 백스쿼트");
    expect(names(searchExercises("덤벨 curl"))).toContain("덤벨 컬");
    expect(names(searchExercises("Iso-Lateral")).length).toBeGreaterThan(3);      // 브랜드 머신 영문 모델명
  });
  it("근육·기구로도 찾는다 (기존 동작 유지)", () => { expect(searchExercises("광배").length).toBeGreaterThan(5); expect(searchExercises("스미스").length).toBeGreaterThan(3); });
  it("엉뚱한 검색어는 결과 없음", () => { expect(searchExercises("zzzzqqq")).toEqual([]); });
  it("음식: 별칭·초성·오타", () => {
    expect(names(searchFoods([], "달걀"))).toContain("계란(삶은)");
    expect(names(searchFoods([], "ㄷㄱㅅㅅ"))).toContain("닭가슴살(삶은)");
    expect(names(searchFoods([], "고구미"))).toContain("고구마");
    expect(names(searchFoods([], "banana"))).toContain("바나나");
  });
});

describe("음식 문장 해석 (DB로 풀리면 AI를 부르지 않는다)", () => {
  it("이름과 수량을 DB에서 찾는다", () => {
    const r = resolveFoodText("바나나 2개, 흰쌀밥 반 공기", [])!;
    expect(r.map((x) => [x.food.name, x.qty])).toEqual([["바나나", 2], ["흰쌀밥", 0.5]]);
  });
  it("그램 단위는 제공량으로 환산", () => { expect(resolveFoodText("고구마 300g", [])![0].qty).toBe(2); });
  it("DB에 없는 음식이 섞이면 null → AI로", () => { expect(resolveFoodText("바나나 1개, 마라탕 한 그릇", [])).toBeNull(); });
  it("후보가 여럿이라 애매하면 추측하지 않는다", () => { expect(resolveFoodText("계란 2개", [])).toBeNull(); });
});

describe("AI 음식 응답 검증", () => {
  const ok = { name: "마라탕", serving: "1그릇", grams: 600, kcal: 700, carb: 60, protein: 35, fat: 35, sugar: 5, sodium: 3000, qty: 1 };
  it("정상 값은 통과", () => { expect(validateFood(ok, [])).toEqual({ ok: true, reasons: [] }); });
  it("범위·필수값·열량 불일치·중복을 걸러 낸다", () => {
    expect(validateFood({ ...ok, kcal: 9999 }, []).ok).toBe(false);
    expect(validateFood({ ...ok, protein: undefined }, []).reasons).toContain("필수 수치(열량·탄수·단백질·지방) 누락");
    expect(validateFood({ ...ok, kcal: 100 }, []).reasons).toContain("열량과 영양소가 맞지 않음");
    expect(validateFood({ ...ok, grams: 0 }, []).ok).toBe(false);
    expect(validateFood(ok, [{ name: "마라탕" }]).reasons).toContain("이미 있는 음식");
  });
});

describe("조회 흐름: 캐시 → AI, 검증 대기 → 승격", () => {
  beforeEach(() => { vi.mocked(askJSON).mockReset(); vi.mocked(askText).mockReset(); setExtraFoods([]); });
  it("같은 질문에 AI를 두 번 부르지 않는다 (공백·대소문자 차이 무시)", async () => {
    vi.mocked(askJSON).mockResolvedValue({ items: [] });
    await cachedJSON("food_text", "마라탕 한 그릇", "p"); await cachedJSON("food_text", "마라탕  한그릇", "p");
    expect(askJSON).toHaveBeenCalledTimes(1);
    vi.mocked(askText).mockResolvedValue("답");
    const seen: string[] = []; await cachedText("ask", "스쿼트 깊이", "p"); await cachedText("ask", "스쿼트 깊이", "p", (t) => seen.push(t));
    expect(askText).toHaveBeenCalledTimes(1); expect(seen).toEqual(["답"]);
  });
  it("AI가 실패해도 예외만 전달하고 기록한다", async () => {
    vi.mocked(askText).mockRejectedValue({ code: "none" });
    await expect(cachedText("ask", "새 질문", "p")).rejects.toEqual({ code: "none" });
    expect(sessionCounts()["ask:ai_fail"]).toBe(1);
  });
  it("검증 통과한 음식만 승격되고, 승격된 음식은 다음부터 DB에서 찾는다", async () => {
    const good = { name: "마라탕", serving: "1그릇", grams: 600, kcal: 700, carb: 60, protein: 35, fat: 35, sugar: 5, sodium: 3000, qty: 1 };
    const bad = { ...good, name: "이상한 음식", kcal: 5 };
    const out = await ingestAIFoods([good, bad], [], "text", "마라탕");
    expect(out.map((o) => o.check.ok)).toEqual([true, false]);
    await new Promise((r) => setTimeout(r, 30));
    expect((await kvAll("pending")).length).toBe(2);
    expect((await kvAll("promoted")).map(([k]) => k)).toEqual(["마라탕"]);
    expect(resolveFoodText("바나나 1개, 마라탕 1그릇", [])!.map((x) => x.food.name)).toEqual(["바나나", "마라탕"]);
  });
  it("지점별 호출 수가 기록된다", async () => {
    await new Promise((r) => setTimeout(r, 30));
    const st = await aiStats();
    expect(st.food_text.ai).toBe(1); expect(st.food_text.cache).toBe(1); expect(st.ask.ai).toBe(1); expect(st.ask.cache).toBe(1); expect(st.ask.ai_fail).toBe(1);
  });
});

describe("마이그레이션", () => {
  it("버전 1(기록만 있는 DB)에서 올려도 기존 기록이 그대로이고 새 저장소가 생긴다", async () => {
    await _closeForTest();
    await new Promise<void>((res, rej) => { const d = indexedDB.deleteDatabase("gymlog"); d.onsuccess = () => res(); d.onerror = () => rej(d.error); });
    await new Promise<void>((res, rej) => {           // 예전 앱이 만든 v1 DB
      const rq = indexedDB.open("gymlog", 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("docs");
      rq.onsuccess = () => { const db = rq.result; const t = db.transaction("docs", "readwrite"); t.objectStore("docs").put({ profile: { weight: 70 }, plan: [] }, "main"); t.objectStore("docs").put({ meals: [], workout: { items: [{ name: "바벨 벤치프레스", sets: [{ w: 60, r: 8, done: true }] }] } }, "d-2026-11-01"); t.oncomplete = () => { db.close(); res(); }; };
      rq.onerror = () => rej(rq.error);
    });
    const st = await loadAll();                         // 새 코드가 v2로 올린다
    expect(DB_VERSION).toBe(2);
    expect((st!.main as any).profile.weight).toBe(70);
    expect(st!.days!["2026-11-01"].workout.items[0].name).toBe("바벨 벤치프레스");
    expect(await kvGet("ai_cache", "x")).toBeUndefined(); // 새 저장소를 읽을 수 있다
    await putDocs({ "d-2026-11-02": { meals: [], workout: { items: [] } } });
    expect(Object.keys((await loadAll())!.days!).sort()).toEqual(["2026-11-01", "2026-11-02"]);
  });
});

describe("근거·규칙 데이터 무결성", () => {
  it("모든 근거에 출처·검증 상태·서지가 있다", () => {
    for (const e of EVIDENCE_DB as any[]) { expect(e.claim && e.cite && e.title && e.year && e.status && e.checked_via && e.version, e.id).toBeTruthy(); expect(e.doi || e.pmid, e.id).toBeTruthy(); expect(["검증됨", "서지만 확인"]).toContain(e.status); }
  });
  it("모든 규칙은 근거에 연결되거나 '미검증'으로 표시된다", () => {
    const ids = new Set(EVIDENCE_DB.filter((e) => e.status === "검증됨").map((e) => e.id));
    for (const r of RULES as any[]) { const linked = r.evidence.some((id: string) => ids.has(id)); expect(r.status, r.id).toBe(linked ? "근거 연결됨" : "미검증"); expect(r.source && r.version, r.id).toBeTruthy(); }
  });
  it("앱이 실제로 쓰는 상수와 규칙 값이 어긋나지 않는다", async () => {
    const { e1rm } = await import("../../src/app/training");
    expect(e1rm(100, 6)).toBeCloseTo(120);                                   // Epley
    expect(RULES.find((r) => r.id === "protein_cut")!.value).toContain("2.2");
    expect(RULES.find((r) => r.id === "vol_week")!.value).toContain("10–20");
  });
});
