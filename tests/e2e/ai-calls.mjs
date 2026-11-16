// AI 호출 수 측정: 같은 사용 시나리오에서 /api/ai 로 실제 나가는 요청을 센다.  npm run build && node tests/e2e/ai-calls.mjs
// (API 키가 없으므로 요청을 가로채 가짜 응답을 돌려준다. 세는 것은 '요청이 나갔는가'뿐이다.)
import { chromium } from "playwright";
import { preview } from "vite";
const server = await preview({ logLevel: "error", preview: { port: 0 } });
const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 420, height: 900 } })).newPage();
let calls = 0; const perStep = [];
await page.route("**/api/ai", async (route) => {
  calls++; const body = JSON.parse(route.request().postData() || "{}");
  if (body.mode === "json") return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ items: [{ name: "마라탕", serving: "1그릇", grams: 600, kcal: 700, carb: 60, protein: 35, fat: 35, sugar: 5, sodium: 3000, qty: 1 }], note: "가짜 응답" }) }) });
  return route.fulfill({ status: 200, contentType: "text/plain", body: "가짜 응답" });
});
page.on("dialog", (d) => d.accept());
await page.goto(server.resolvedUrls.local[0]); await page.waitForSelector("#view > *");
const goTab = (t) => page.evaluate((t) => { const g = window.gymlog; g.A.closeSheet(); g.ui.tab = t; g.render(); }, t);
const step = async (name, old, fn) => { const b = calls; await fn(); await page.waitForTimeout(500); perStep.push([name, old, calls - b]); };
const foodText = async (txt) => { await goTab("food"); await page.evaluate(() => { const g = window.gymlog; g.A.addFood({ dataset: { meal: "점심" } }); });
  await page.click('#sheet [data-act=sheetMode][data-m="ai"]'); await page.waitForSelector("#aiFoodIn"); await page.fill("#aiFoodIn", txt); await page.click("[data-act=aiParse]"); };
await step("① DB에 있는 음식 문장 (바나나 2개, 흰쌀밥 반 공기)", 1, () => foodText("바나나 2개, 흰쌀밥 반 공기"));
await step("② DB에 없는 음식 (마라탕 한 그릇)", 1, () => foodText("마라탕 한 그릇"));
await step("③ 같은 음식 다시 입력", 1, () => foodText("마라탕 한 그릇"));
await step("④ 승격된 뒤 다른 문장 (바나나 1개, 마라탕 1그릇)", 1, () => foodText("바나나 1개, 마라탕 1그릇"));
await page.evaluate(() => { const g = window.gymlog; g.A.addParsed(); });
await step("⑤ 식단 코멘트 (규칙 기반 요약은 자동, AI 버튼 1번)", 1, async () => { await goTab("food"); await page.click("[data-act=aiFood]"); });
await step("⑥ 식단 코멘트 다시", 1, async () => { await goTab("food"); await page.click("[data-act=aiFood]"); });
await step("⑦ DB 운동 설명 (벤치프레스 상세 열기)", 1, async () => { await page.evaluate(() => window.gymlog.exDetail("bench")); await page.waitForTimeout(300); const has = await page.locator("#sheet [data-act=aiTip]").count(); if (has) await page.click("#sheet [data-act=aiTip]"); await page.evaluate(() => window.gymlog.A.closeSheet()); });
await step("⑧ 플랜 평가 2번", 2, async () => { await goTab("plan"); await page.click("[data-act=aiFeedback]"); await page.waitForTimeout(400); await goTab("plan"); await page.click("[data-act=aiFeedback]"); });
await step("⑨ 자유 질문 2번 (같은 질문)", 2, async () => { await goTab("guide"); for (let i = 0; i < 2; i++) { await page.fill("#gAsk", "스쿼트 깊이는 어디까지"); await page.press("#gAsk", "Enter"); await page.waitForTimeout(400); } });
const kbShown = await page.evaluate(() => /자체 DB에서 찾은 내용/.test(document.getElementById("gAskOut").textContent));
const before = perStep.reduce((a, s) => a + s[1], 0);
console.log("단계                                                      | 이전(버튼마다 호출) | 지금");
for (const [n, o, c] of perStep) console.log(n.padEnd(48), "|", String(o).padStart(4), "|", String(c).padStart(3));
console.log(`합계: 이전 ${before}회 → 지금 ${calls}회`, "| 자유 질문에 자체 DB 결과 표시:", kbShown);
console.log("지점별 기록:", JSON.stringify(await page.evaluate(() => window.gymlog.aiStats())));
await browser.close(); await server.close();
process.exit(calls <= 4 ? 0 : 1);
