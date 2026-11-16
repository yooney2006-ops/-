import "./styles/app.css";
import { initState } from "./app/state";
import { render } from "./app/views";
import { loadKnowledge, aiStats, sessionCounts } from "./platform/aiflow";
import * as kb from "./platform/kb";
import "./app/actions"; // 클릭·입력 이벤트 연결
import { restoreTab } from "./platform/session";
import { resumeTimer, startTimer } from "./app/timer";

await initState();
// 운동 중에 앱이 꺼졌다 켜진 경우: 보던 탭과 휴식 타이머를 이어 준다
{ const t = restoreTab(); if (t) state.ui.tab = t; }
render();
resumeTimer();
loadKnowledge(); // 승격된 음식·가져온 공개 데이터 (없어도 내장 DB로 동작)

// 콘솔·자동 검사에서 상태를 들여다보기 위한 손잡이 (예: gymlog.S.days)
import * as state from "./app/state";
import * as training from "./app/training";
import * as util from "./app/util";
import * as views from "./app/views";
import { A } from "./app/actions";
import { EXMAP } from "./app/catalog";
(window as any).gymlog = {
  get S() { return state.S; },
  ui: state.ui, A, EXMAP, ...training, ...util, ...views,
  aiStats, sessionCounts, kb, startTimer, defaultState: state.defaultState, markDirty: state.markDirty, flush: state.flush,
};
