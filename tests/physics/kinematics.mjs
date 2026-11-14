// 생체역학 제약 측정: 분절 길이 불변, 바-발 중앙 정렬, 바 경로.  node tests/physics/kinematics.mjs [id,id]
import { EX } from "../../src/data/exercises.js";
import { FIG } from "../../src/engine/fig.js";
import { pathToFileURL } from "node:url";
globalThis.window ??= { matchMedia: () => ({ matches: false }) };
globalThis.getComputedStyle ??= () => ({ getPropertyValue: () => "#888" });
const len = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const SEGS = [["sh", "el"], ["el", "ha"], ["hip", "kn"], ["kn", "an"]];
const N = 20;
export function sample(ex) { const rig = FIG.makeRig(ex.anim, ex); return Array.from({ length: N + 1 }, (_, i) => rig.at(i / N)); }
/** 분절 길이가 동작 중 변하는 최대 폭(m) */
export function segmentDrift(ex) {
  const fr = sample(ex); let worst = 0, where = "";
  for (const k of ["L", "R"]) for (const [a, b] of SEGS) {
    const L = fr.map(J => len(J[a + k], J[b + k])); const d = Math.max(...L) - Math.min(...L);
    if (d > worst) { worst = d; where = a + "-" + b + k; }
  }
  const tr = fr.map(J => len(J.pelvis, J.neck)); const d = Math.max(...tr) - Math.min(...tr); if (d > worst) { worst = d; where = "pelvis-neck"; }
  return { worst, where };
}
/** 바(양손 중점)의 경로. z = 앞뒤, y = 높이. midfoot = 발 중앙 z */
export function barPath(ex) {
  const fr = sample(ex);
  return fr.map(J => { const h = [(J.haL[0] + J.haR[0]) / 2, (J.haL[1] + J.haR[1]) / 2, (J.haL[2] + J.haR[2]) / 2];
    const mid = (J.heelL[2] + J.toeL[2] + J.heelR[2] + J.toeR[2]) / 4; return { y: h[1], z: h[2], mid, shZ: (J.shL[2] + J.shR[2]) / 2, shY: (J.shL[1] + J.shR[1]) / 2, knZ: Math.max(J.knL[2], J.knR[2]), knY: J.knL[1] }; });
}
if (import.meta.url === pathToFileURL(process.argv[1] || "").href) {
  const only = process.argv[2] ? process.argv[2].split(",") : null;
  const bad = [];
  for (const ex of EX) { if (ex.brand) continue; const d = segmentDrift(ex); if (d.worst > 0.002) bad.push(`${ex.id} ${d.where} ${(d.worst * 100).toFixed(1)}cm`); }
  console.log("분절 길이 변동 >2mm:", bad.length, bad.join(" | "));
  for (const id of only || ["squat", "front_squat", "deadlift", "rdl", "ohp", "bb_row", "good_morning", "bench"]) {
    const ex = EX.find(e => e.id === id); const p = barPath(ex);
    const off = p.map(q => q.z - q.mid); const zs = p.map(q => q.z), ys = p.map(q => q.y);
    console.log(id.padEnd(13), "바-발중앙 앞뒤 편차(cm) 최소/최대:", (Math.min(...off) * 100).toFixed(1), (Math.max(...off) * 100).toFixed(1),
      "| 바 앞뒤 이동폭", ((Math.max(...zs) - Math.min(...zs)) * 100).toFixed(1), "| 상하", ((Math.max(...ys) - Math.min(...ys)) * 100).toFixed(1),
      "| s0 z,y", p[0].z.toFixed(2), p[0].y.toFixed(2), "s1", p[N].z.toFixed(2), p[N].y.toFixed(2), "shZ", p[0].shZ.toFixed(2), p[N].shZ.toFixed(2));
  }
}
