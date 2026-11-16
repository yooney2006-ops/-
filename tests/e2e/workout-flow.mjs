// 운동 중 흐름 검사 (IMPROVEMENTS.md 1~4번).  npm run build && node tests/e2e/workout-flow.mjs
import { chromium } from "playwright"; import { preview } from "vite";
const server = await preview({ logLevel: "error", preview: { port: 0 } });
const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true }); const p = await ctx.newPage();
const errs = []; p.on("pageerror", e => errs.push(e.message));
let failed = 0; const check = (n, ok, x = "") => { console.log((ok ? "  ✓ " : "  ✗ ") + n + (ok ? "" : "  " + x)); if (!ok) failed++; };
await p.goto(server.resolvedUrls.local[0]); await p.waitForSelector("#view > *");
const seed = () => p.evaluate(() => { const g = window.gymlog; const d = g.day(); d.workout.items = [g.mkItem(g.EXMAP.bench, 3, 8, 60), g.mkItem(g.EXMAP.squat, 3, 6, 80), g.mkItem(g.EXMAP.lat_pd, 3, 10, 50)]; g.markDirty("d-" + g.ui.date); });
await seed(); await p.click("[data-tab=workout]");
// 1) 세트 값: 포커스 유지 + 뒤 세트로 이어짐
await p.click('input[data-f="w"][data-i="0"][data-k="0"]'); await p.keyboard.press("Control+A"); await p.keyboard.type("62.5"); await p.click('input[data-f="r"][data-i="0"][data-k="0"]'); await p.waitForTimeout(150);
check("무게를 고치고 횟수 칸을 누르면 포커스가 그 칸에 남는다", await p.evaluate(() => { const a = document.activeElement; return a?.dataset?.f === "r" && a.dataset.k === "0"; }));
check("고친 무게가 안 끝낸 뒤 세트에 이어진다 (62.5 ×3)", JSON.stringify(await p.evaluate(() => window.gymlog.day().workout.items[0].sets.map(s => s.w))) === "[62.5,62.5,62.5]");
check("화면의 2·3세트 칸도 62.5로 보인다", await p.evaluate(() => [1, 2].every(k => document.querySelector(`input[data-f="w"][data-i="0"][data-k="${k}"]`).value === "62.5")));
check("원판 계산이 62.5kg 기준으로 바뀐다", (await p.textContent("#plates-0")).includes("62.5kg"));
await p.click('[data-act=toggleSet][data-i="0"][data-k="0"]'); await p.waitForTimeout(200);
await p.click('input[data-f="w"][data-i="0"][data-k="1"]'); await p.keyboard.press("Control+A"); await p.keyboard.type("65"); await p.keyboard.press("Tab"); await p.waitForTimeout(150);
check("끝낸 세트는 그대로, 뒤 세트만 따라간다 (62.5, 65, 65)", JSON.stringify(await p.evaluate(() => window.gymlog.day().workout.items[0].sets.map(s => s.w))) === "[62.5,65,65]");
// 2) 타이머·탭 복원, 화면 꺼짐 방지 요청
check("세트 체크 후 타이머가 뜬다", await p.evaluate(() => document.getElementById("timer").classList.contains("on")));
const before = await p.evaluate(() => document.getElementById("timerT").textContent);
await p.evaluate(() => window.gymlog.flush()); await p.waitForTimeout(1200); await p.reload(); await p.waitForSelector("#view > *"); await p.waitForTimeout(400);
const after = await p.evaluate(() => [document.getElementById("timer").classList.contains("on"), document.getElementById("timerT").textContent, window.gymlog.ui.tab]);
check(`새로고침 뒤에도 타이머가 이어진다 (${before} → ${after[1]})`, after[0] && after[1] !== "GO!" && after[1] <= before);
check("새로고침 뒤 운동 탭으로 돌아온다", after[2] === "workout");
await p.click("[data-act=timerStop]"); await p.reload(); await p.waitForSelector("#view > *"); await p.waitForTimeout(300);
check("끈 타이머는 다시 살아나지 않는다", await p.evaluate(() => !document.getElementById("timer").classList.contains("on")));
// 3) 버튼 크기·삭제 되돌리기·아래로
const sizes = await p.evaluate(() => [...document.querySelectorAll(".ex-head button, .adjust button")].map(e => { const r = e.getBoundingClientRect(); return [e.textContent.trim(), Math.round(r.width), Math.round(r.height)]; }));
const small = sizes.filter(([, w, h]) => w < 44 || h < 44);
check("운동 카드의 버튼이 모두 44px 이상", small.length === 0, JSON.stringify(small.slice(0, 5)));
check("가로 넘침 없음", await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth <= 1));
await p.click('[data-act=delEx][data-i="0"]'); await p.waitForTimeout(200);
check("완료 세트가 있는 운동은 한 번에 지워지지 않는다", await p.evaluate(() => window.gymlog.day().workout.items.length === 3));
await p.click('[data-act=delEx][data-i="0"]'); await p.waitForTimeout(200);
check("두 번째에 지워지고 되돌리기 버튼이 뜬다", await p.evaluate(() => window.gymlog.day().workout.items.length === 2) && await p.locator("#toast [data-act=undoDel]").count() === 1);
await p.click("#toast [data-act=undoDel]"); await p.waitForTimeout(200);
check("되돌리면 완료 세트까지 원래 자리로 돌아온다", await p.evaluate(() => { const it = window.gymlog.day().workout.items; return it.length === 3 && it[0].exId === "bench" && it[0].sets[0].done === true; }));
await p.click('[data-act=delEx][data-i="2"]'); await p.waitForTimeout(150);
check("완료 세트가 없는 운동은 한 번에 지워지고 되돌릴 수 있다", await p.evaluate(() => window.gymlog.day().workout.items.length === 2) && await p.locator("#toast [data-act=undoDel]").count() === 1);
await p.click("#toast [data-act=undoDel]"); await p.waitForTimeout(150);
await p.click('[data-act=moveEx][data-i="0"][data-d="1"]'); await p.waitForTimeout(150);
check("아래로 옮기기", await p.evaluate(() => window.gymlog.day().workout.items.map(x => x.exId).join() === "squat,bench,lat_pd"));
// 4) 다른 요일 루틴
await p.evaluate(() => { const g = window.gymlog; g.day().workout.items = []; g.markDirty("d-" + g.ui.date); g.render(); });
await p.click("[data-act=pickPlan]"); await p.waitForTimeout(200);
const n = await p.locator("#sheet [data-act=loadPlan]").count();
check("루틴 목록에 플랜의 운동하는 요일이 모두 보인다", n === await p.evaluate(() => window.gymlog.S.main.plan.filter(d => d.items.length).length) && n >= 2, "개수 " + n);
const pick = await p.evaluate(() => { const g = window.gymlog; const w = g.wIdx(g.ui.date); return g.S.main.plan.findIndex((d, i) => i !== w && d.items.length); });
await p.click(`#sheet [data-act=loadPlan][data-i="${pick}"]`); await p.waitForTimeout(250);
check("다른 요일의 루틴이 오늘 운동으로 들어온다", await p.evaluate((i) => { const g = window.gymlog; return g.day().workout.items.length === g.S.main.plan[i].items.length && g.day().workout.items[0].name === g.S.main.plan[i].items[0].name && !document.getElementById("sheet").classList.contains("open"); }, pick));
// 5) 세트 종류·슈퍼세트
await seed(); await p.evaluate(() => { window.gymlog.A.timerStop(); window.gymlog.render(); });
await p.click('[data-act=setKind][data-i="0"][data-k="0"]'); await p.waitForTimeout(150);
check("세트 번호를 누르면 워밍업(W)이 되고 본 세트 번호는 1부터 다시 센다", await p.evaluate(() => [...document.querySelectorAll('[data-act=setKind][data-i="0"]')].map(e => e.firstChild.textContent.trim()).join() === "W,1,2"));
await p.click('[data-act=toggleSet][data-i="0"][data-k="0"]'); await p.waitForTimeout(200);
check("워밍업 세트는 볼륨에 들어가지 않는다", await p.evaluate(() => window.gymlog.itemVolume(window.gymlog.day().workout.items[0]) === 0 && document.getElementById("sumVol").textContent === "0"));
await p.evaluate(() => window.gymlog.A.timerStop());
await p.click('[data-act=setKind][data-i="0"][data-k="2"]'); await p.click('[data-act=setKind][data-i="0"][data-k="2"]'); await p.waitForTimeout(150);   // 3번째 세트 → 드롭
await p.click('[data-act=toggleSet][data-i="0"][data-k="1"]'); await p.waitForTimeout(250);
check("다음 세트가 드롭세트면 휴식 타이머가 뜨지 않는다", await p.evaluate(() => !document.getElementById("timer").classList.contains("on")));
check("본 세트는 볼륨에 들어간다 (60×8)", await p.evaluate(() => window.gymlog.itemVolume(window.gymlog.day().workout.items[0]) === 480));
await p.click('[data-act=superset][data-i="1"]'); await p.waitForTimeout(150);
await p.click('[data-act=toggleSet][data-i="1"][data-k="0"]'); await p.waitForTimeout(250);
check("슈퍼세트의 앞 운동을 끝내면 타이머 없이 다음 운동으로", await p.evaluate(() => !document.getElementById("timer").classList.contains("on")));
await p.click('[data-act=toggleSet][data-i="2"][data-k="0"]'); await p.waitForTimeout(250);
check("슈퍼세트의 뒤 운동을 끝내면 타이머가 뜬다", await p.evaluate(() => document.getElementById("timer").classList.contains("on")));
await p.evaluate(() => window.gymlog.A.timerStop());
// 6) 입력만 하고 칸을 벗어나지 않아도 저장된다
await seed(); await p.evaluate(() => { window.gymlog.A.timerStop(); window.gymlog.ui.tab = "workout"; window.gymlog.render(); window.scrollTo(0, 0); });
await p.click('input[data-f="w"][data-i="1"][data-k="0"]'); await p.keyboard.press("Control+A"); await p.keyboard.type("77.5"); await p.waitForTimeout(500);
await p.reload(); await p.waitForSelector("#view > *");
check("입력 중이던 값이 새로고침 뒤에도 남는다 (77.5)", await p.evaluate(() => window.gymlog.day().workout.items[1].sets[0].w === 77.5));
await p.evaluate(() => { window.gymlog.ui.tab = "workout"; window.gymlog.render(); });
await p.click('input[data-f="w"][data-i="2"][data-k="0"]'); await p.keyboard.press("Control+A"); await p.keyboard.type("55"); await p.keyboard.press("Tab"); await p.waitForTimeout(150);
check("입력 즉시 저장을 넣은 뒤에도 뒤 세트로 이어진다 (55 ×3)", JSON.stringify(await p.evaluate(() => window.gymlog.day().workout.items[2].sets.map(s => s.w))) === "[55,55,55]");
// 7) 운동 메모: 다음에 같은 운동을 넣어도 보인다
await p.fill('.exnote[data-key="bench"]', "시트 4칸, 그립 81cm"); await p.waitForTimeout(400);
await p.evaluate(() => window.gymlog.flush()); await p.reload(); await p.waitForSelector("#view > *");
await p.evaluate(() => { const g = window.gymlog; g.ui.date = g.addDays(g.ui.date, 1); g.day().workout.items = [g.mkItem(g.EXMAP.bench, 3, 8, 60)]; g.ui.tab = "workout"; g.render(); });
check("메모가 다른 날 같은 운동에도 보인다", await p.inputValue('.exnote[data-key="bench"]') === "시트 4칸, 그립 81cm");
await p.evaluate(() => { const g = window.gymlog; delete g.S.days[g.ui.date]; g.ui.date = g.ymd(new Date()); g.render(); });
// 8) 운동 시간·완료 요약
await p.evaluate(() => { const g = window.gymlog; const d = g.day(); d.workout.items = [g.mkItem(g.EXMAP.bench, 2, 8, 60)]; d.workout.items[0].sets[0].done = true; d.workout.items[0].sets[0].t = Date.now() - 25 * 60000; g.markDirty("d-" + g.ui.date); g.render(); });
check("세트가 남아 있으면 완료 요약이 없다", await p.locator(".done-card").count() === 0);
await p.click('[data-act=toggleSet][data-i="0"][data-k="1"]'); await p.waitForTimeout(250); await p.evaluate(() => window.gymlog.A.timerStop());
check("모든 세트를 끝내면 완료 요약에 운동 시간(25분)·세트·볼륨이 나온다", await p.evaluate(() => { const t = document.querySelector(".done-card")?.textContent || ""; return /25분/.test(t) && /960/.test(t); }));
// 9) 내 루틴 저장·불러오기·삭제·되돌리기
p.once("dialog", d => d.accept("상체 A"));
await p.click("[data-act=pickPlan]"); await p.waitForTimeout(150); await p.click("#sheet [data-act=saveRoutine]"); await p.waitForTimeout(250);
check("오늘 운동을 이름 붙여 루틴으로 저장", await p.evaluate(() => { const r = window.gymlog.S.main.routines || []; return r.length === 1 && r[0].name === "상체 A" && r[0].items[0].sets.every(s => !s.done); }));
await p.evaluate(() => { const g = window.gymlog; g.A.closeSheet(); g.ui.date = g.addDays(g.ui.date, 2); g.render(); });
await p.click("[data-act=pickPlan]"); await p.waitForTimeout(150); await p.click("#sheet [data-act=loadPlan][data-r]"); await p.waitForTimeout(250);
check("다른 날에 내 루틴을 불러온다", await p.evaluate(() => { const g = window.gymlog; return g.day().workout.items.length === 1 && g.day().workout.items[0].exId === "bench" && !document.getElementById("sheet").classList.contains("open"); }));
await p.click("[data-act=pickPlan]"); await p.waitForTimeout(150); await p.click("#sheet [data-act=delRoutine]"); await p.waitForTimeout(200);
const gone = await p.evaluate(() => (window.gymlog.S.main.routines || []).length === 0);
await p.click("#toast [data-act=undoRoutine]"); await p.waitForTimeout(200);
check("루틴 삭제와 되돌리기", gone && await p.evaluate(() => window.gymlog.S.main.routines.length === 1));
await p.evaluate(() => window.gymlog.A.closeSheet());
check("페이지 오류 없음", errs.length === 0, errs.join(" | "));
await b.close(); await server.close(); console.log(failed ? `\n실패 ${failed}건` : "\n모두 통과"); process.exit(failed ? 1 : 0);
