import { describe, expect, it } from "vitest";
import { EX, CAMS, COMPOUND, STRETCH } from "../../src/data/exercises.js";

describe("운동 DB", () => {
  it("운동 222개 (기본 111 + 브랜드 머신 111), id 중복 없음", () => {
    expect(EX.length).toBe(222);
    expect(EX.filter((e: any) => e.brand).length).toBe(111);
    expect(new Set(EX.map((e: any) => e.id)).size).toBe(222);
  });
  it("모든 운동에 동작 패턴·주동근·팁이 있다", () => {
    for (const e of EX as any[]) {
      expect(e.anim?.p, e.id).toBeTruthy();
      expect(e.prim.length, e.id).toBeGreaterThan(0);
      expect(e.tips.length, e.id).toBeGreaterThan(0);
    }
  });
  it("보조 테이블이 없는 운동을 가리키지 않는다", () => {
    const ids = new Set(EX.map((e: any) => e.id));
    for (const k of [...Object.keys(CAMS), ...Object.keys(STRETCH), ...COMPOUND]) expect(ids.has(k), k).toBe(true);
  });
});
