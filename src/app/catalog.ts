// @ts-nocheck — 아티팩트 원본에서 그대로 옮긴 코드. 타입은 점진적으로 붙인다.
import { EX } from "../data/exercises.js";

/* 운동 라이브러리 (팁 포함)
   type: w=중량, b=맨몸(횟수), t=시간(분)
   ============================================================ */

export const EXMAP = Object.fromEntries(EX.map(e=>[e.id,e]));
export const PARTS = ["가슴","등","하체","어깨","팔","코어","유산소"];
export const WD = ["월","화","수","목","금","토","일"];
