// 실제 브라우저로 빌드 결과를 돌려 보는 검사.  npm run build && npm run test:e2e
// 확인하는 것: 네 탭이 오류 없이 그려지는지, 3D 영상이 뜨는지, 기록이 새로고침 뒤에도 남는지,
// 백업 내보내기→가져오기가 되는지, 오프라인에서도 앱이 열리는지, Claude 미설정 시 안내가 나오는지.
import { chromium } from "playwright";
import { preview } from "vite";
import { readFileSync } from "node:fs";

const server = await preview({ logLevel: "error", preview: { port: 0 } });
const url = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const ctx = await browser.newContext({ viewport: { width: 420, height: 900 }, acceptDownloads: true });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push("페이지 오류: " + e.message));
page.on("dialog", (d) => d.accept());
let failed = 0;
const check = (name, ok, extra = "") => { console.log((ok ? "  ✓ " : "  ✗ ") + name + (ok ? "" : "  " + extra)); if (!ok) failed++; };

await page.goto(url);
await page.waitForSelector("#view > *");
check("저장 상태 표시가 '이 기기'", (await page.textContent("#saveStatus")).includes("이 기기"));

for (const [tab, min] of [["food", 200], ["workout", 200], ["plan", 500], ["guide", 2000], ["stats", 500]]) {
  await page.click(`[data-tab=${tab}]`);
  const len = await page.evaluate(() => document.getElementById("view").innerHTML.length);
  check(`${tab} 탭이 그려짐`, len > min, `길이 ${len}`);
}

// 운동 가이드: 222개, 3D 영상
await page.click("[data-tab=guide]");
check("가이드에 운동 222개", (await page.textContent("#guideCount")).includes("222"));
await page.click("[data-act=exDetail][data-id=bench]");
await page.waitForTimeout(800);
// WebGL 캔버스는 직접 읽으면 비어 보이므로 화면 캡처의 크기로 판단한다(빈 화면은 수 KB 미만)
const shot = await page.locator("#sheet canvas").first().screenshot({ path: process.env.SHOT || undefined });
const painted = shot.length;
check("벤치프레스 3D 영상이 그려짐", painted > 6000, `캡처 ${painted}바이트`);
// 가이드 토글과 속도
await page.click("[data-g=lines]"); await page.click("#figSpeedBtn");
check("가이드 토글·0.5x 전환", await page.evaluate(() => window.gymlog.ui.fig.guide().lines === true && document.getElementById("figSpeedBtn").textContent === "0.5x"));
check("궤적 오버레이가 그려짐", await page.evaluate(() => { const c = document.querySelector("#sheet canvas.fig-ov"); if (!c) return false; const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }));
await page.click("#sheet [data-act=closeSheet]");

// 기록 → 새로고침 뒤 유지
await page.click("[data-tab=workout]");
await page.evaluate(() => { const g = window.gymlog; const d = g.day(); d.workout.items = [g.mkItem(g.EXMAP.bench, 3, 8, 60)]; g.markDirty("d-" + g.ui.date); g.render(); });
await page.click('[data-act=toggleSet][data-i="0"][data-k="0"]');
check("세트 완료 시 휴식 타이머가 자동으로 뜸", await page.evaluate(() => document.getElementById("timer").classList.contains("on")));
await page.click("[data-act=timerStop]");
await page.evaluate(() => window.gymlog.flush());
await page.reload();
await page.waitForSelector("#view > *");
const kept = await page.evaluate(() => { const g = window.gymlog; const it = g.S.days[g.ui.date]?.workout.items[0]; return !!it && it.exId === "bench" && it.sets[0].done === true; });
check("운동 기록이 새로고침 뒤에도 남음", kept);

// 백업 내보내기 → 기록 지우기 → 가져오기
await page.click("[data-act=openProfile]");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-act=exportData]")]);
const file = await dl.path();
const backup = JSON.parse(readFileSync(file, "utf8"));
check("백업 파일에 오늘 기록이 들어 있음", backup.app === "gymlog" && Object.values(backup.days).some((d) => d.workout.items.length));
await page.evaluate(async () => { const g = window.gymlog; const k = g.ui.date; delete g.S.days[k]; g.markDirty("d-" + k); await g.flush(); });
await page.setInputFiles("#importIn", file);
await page.waitForTimeout(500);
check("가져오기로 기록이 되살아남", await page.evaluate(() => { const g = window.gymlog; return g.S.days[g.ui.date]?.workout.items[0]?.exId === "bench"; }));
await page.reload();
await page.waitForSelector("#view > *");
check("가져온 기록이 저장돼 있음", await page.evaluate(() => { const g = window.gymlog; return g.S.days[g.ui.date]?.workout.items[0]?.exId === "bench"; }));

// Claude 미설정: 조용히 죽지 않고 안내가 나와야 한다
// 화면 폭별 가로 넘침 없음
for (const w of [360, 420, 1280]) { await page.setViewportSize({ width: w, height: 900 });
  for (const tab of ["workout", "stats", "plan"]) { await page.click(`[data-tab=${tab}]`); await page.waitForTimeout(150);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth); check(`${w}px ${tab}: 가로 넘침 없음`, over <= 1, `${over}px`); } }
await page.setViewportSize({ width: 420, height: 900 });
await page.click("[data-tab=guide]");
await page.fill("#gAsk", "스쿼트 무릎");
await page.press("#gAsk", "Enter");
await page.waitForTimeout(800);
const aiMsg = await page.evaluate(() => document.getElementById("view").textContent);
check("Claude 미설정 안내가 나옴", /Claude 연결이 아직 설정되지 않았어요|Claude 응답을 읽지 못했어요/.test(aiMsg));

// 오프라인: 서비스 워커가 앱을 열어 줘야 한다
await page.evaluate(() => navigator.serviceWorker.ready);
await page.waitForTimeout(1500);
await ctx.setOffline(true);
let offlineOK = false;
try { await page.reload(); await page.waitForSelector("#view > *", { timeout: 5000 }); offlineOK = await page.evaluate(() => !!window.gymlog.S.main); } catch { /* 실패 */ }
check("오프라인에서도 앱이 열림", offlineOK);
await ctx.setOffline(false);

check("페이지 오류 없음", errs.length === 0, errs.slice(0, 3).join(" | "));
await browser.close();
await server.close();
console.log(failed ? `\n실패 ${failed}건` : "\n모두 통과");
process.exit(failed ? 1 : 0);
