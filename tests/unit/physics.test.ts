// 3D 동작 회귀 검사. 동작(src/engine/fig.js)이나 운동 DB를 건드리면 여기서 걸린다.
import { describe, expect, it } from "vitest";
// @ts-ignore — 검사 스크립트는 순수 JS
import { physcheck } from "../physics/physcheck.mjs";
// @ts-ignore
import { barcheck } from "../physics/barcheck.mjs";

/** 검사기의 알려진 오탐(실제 동작은 정상). 여기에 운동을 추가하려면 렌더 이미지로 확인한 뒤에만. */
// front_squat: goblet과 같은 딥 스쿼트 최저점에서 무릎 방향 판정이 오탐 (렌더로 확인함)
const KNOWN_FALSE_POSITIVES = ["bulgarian", "front_squat", "goblet", "rower", "stepup"];

describe("3D 동작 물리 검사", () => {
  it("알려진 오탐 외에는 문제가 없다", () => {
    const bad = physcheck().map((o: { id: string }) => o.id).sort();
    expect(bad).toEqual(KNOWN_FALSE_POSITIVES);
  });
  it("바벨이 몸을 뚫는 운동이 없다", () => {
    expect(barcheck()).toEqual([]);
  });
});

// @ts-ignore
import { segmentDrift, barPath } from "../physics/kinematics.mjs";
import { EX } from "../../src/data/exercises.js";

describe("생체역학 제약", () => {
  it("분절(위팔·아래팔·허벅지·정강이·몸통) 길이는 동작 내내 변하지 않는다 (2mm 이내)", () => {
    const bad = (EX as any[]).filter((e) => !e.brand).map((e) => [e.id, segmentDrift(e).worst]).filter(([, d]) => (d as number) > 0.002);
    expect(bad).toEqual([]);
  });
  it.each(["squat", "front_squat", "deadlift", "sumo_dl", "rdl", "good_morning", "ohp", "bb_row"])(
    "%s: 바가 발 중앙 수직선에서 1cm 이상 벗어나지 않는다", (id) => {
      const off = barPath((EX as any[]).find((e) => e.id === id)).map((q: any) => Math.abs(q.z - q.mid));
      expect(Math.max(...off)).toBeLessThan(0.01);
    });
});
