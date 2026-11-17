// free-exercise-db(퍼블릭 도메인, Unlicense) → src/data/db/exercise_meta.json  (영문 정식 이름·난이도)
//   node tools/db/import_exercises.mjs <free-exercise-db/dist/exercises.json>
// 이름이 정확히 대응하는 운동만 연결한다(단어 집합이 같을 때). 직접 지정한 대응(MANUAL)도 데이터셋에 그 이름이 실제로 있을 때만 쓴다.
// 대응하지 못한 운동은 난이도를 비워 두고 목록으로 남긴다. 재실행해도 같은 결과.
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { EX } from "../../src/data/exercises.js";
const root = fileURLToPath(new URL("../../", import.meta.url));
const G = JSON.parse(fs.readFileSync(root + "src/data/db/aliases.json", "utf8")).glossary;
const fe = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const tok = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).map((w) => w.replace(/s$/, "")).sort().join(" ");
const toEn = (n) => n.replace(/[()°]/g, " ").split(/\s+/).map((w) => G[w] || "").filter(Boolean).join(" ");
// 표기가 달라 자동 대응이 안 되는 대표 운동 (데이터셋에 이 이름이 없으면 무시된다)
const MANUAL = { bench: "Barbell Bench Press - Medium Grip", incline_bb: "Barbell Incline Bench Press - Medium Grip", squat: "Barbell Squat", front_squat: "Front Barbell Squat", deadlift: "Barbell Deadlift",
  pullup: "Pullups", pushup: "Pushups", dips: "Dips - Chest Version", ohp: "Standing Military Press", bb_row: "Bent Over Barbell Row", lat_pd: "Wide-Grip Lat Pulldown", close_pd: "Close-Grip Front Lat Pulldown",
  crunch: "Crunches", db_fly: "Dumbbell Flyes", incline_fly: "Incline Dumbbell Flyes", db_curl: "Dumbbell Bicep Curl", skull: "Lying Triceps Press", front_raise: "Front Dumbbell Raise", upright_row: "Upright Barbell Row",
  arnold: "Arnold Dumbbell Press", db_pullover: "Bent-Arm Dumbbell Pullover", close_bench: "Close-Grip Barbell Bench Press", hack_squat: "Hack Squat",
  glute_bridge: "Butt Lift (Bridge)", rollout: "Ab Roller", bike: "Bicycling, Stationary", rower: "Rowing, Stationary", elliptical: "Elliptical Trainer", stair: "Stairmaster", decline_bb: "Decline Barbell Bench Press", tbar_row: "T-Bar Row with Handle" };
const byTok = new Map(), byName = new Map();
for (const f of fe) { if (!byTok.has(tok(f.name))) byTok.set(tok(f.name), f); byName.set(f.name, f); }
const LV = { beginner: "초급", intermediate: "중급", expert: "상급" };
const meta = {}, unmatched = [], manualMissing = [];
for (const e of EX.filter((e) => !e.brand).sort((a, b) => (a.id < b.id ? -1 : 1))) {
  let f = null, how = "";
  if (MANUAL[e.id]) { f = byName.get(MANUAL[e.id]) || null; how = "직접 지정"; if (!f) manualMissing.push(e.id + "=" + MANUAL[e.id]); }
  if (!f) { f = byTok.get(tok(toEn(e.name))) || null; how = "이름 일치"; }
  if (f) meta[e.id] = { en: f.name, level: LV[f.level] || "", source_id: f.id, match: how }; else unmatched.push(e.id);
}
const doc = { _meta: { source: "free-exercise-db (github.com/yuhonas/free-exercise-db)", license: "Unlicense (퍼블릭 도메인)", version: "2026.11.16", status: "검증됨(공개 데이터)", note: "난이도는 데이터셋의 level 값. 대응하지 못한 운동은 비워 둠" }, exercises: meta, unmatched };
fs.writeFileSync(root + "src/data/db/exercise_meta.json", JSON.stringify(doc, null, 1));
console.log("연결", Object.keys(meta).length, "/ 111 · 대응 못함", unmatched.length, "· 직접 지정했지만 데이터셋에 없는 이름:", manualMissing.join(", ") || "없음");
