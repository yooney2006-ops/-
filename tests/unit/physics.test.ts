// 3D 동작 회귀 검사. 동작(src/engine/fig.js)이나 운동 DB를 건드리면 여기서 걸린다.
import { describe, expect, it } from "vitest";
// @ts-ignore — 검사 스크립트는 순수 JS
import { physcheck } from "../physics/physcheck.mjs";
// @ts-ignore
import { barcheck } from "../physics/barcheck.mjs";

/** 검사기의 알려진 오탐(실제 동작은 정상). 여기에 운동을 추가하려면 렌더 이미지로 확인한 뒤에만. */
const KNOWN_FALSE_POSITIVES = ["bulgarian", "goblet", "rower", "stepup"];

describe("3D 동작 물리 검사", () => {
  it("알려진 오탐 4건 외에는 문제가 없다", () => {
    const bad = physcheck().map((o: { id: string }) => o.id).sort();
    expect(bad).toEqual(KNOWN_FALSE_POSITIVES);
  });
  it("바벨이 몸을 뚫는 운동이 없다", () => {
    expect(barcheck()).toEqual([]);
  });
});
