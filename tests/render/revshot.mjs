// 운동 동작을 프레임별로 렌더링해 PNG로 저장한다. 동작을 고친 뒤 눈으로 확인하는 용도.
//   npm run render -- '{"ids":["bench","squat"],"s":[[0,90],[0.5,90],[1,90],[0],[1]]}' out.png
//   s: 프레임 목록. [진행도 0~1, 카메라 yaw]  또는 [진행도] (운동별 고정 카메라)
import { chromium } from "playwright";
import { createServer } from "vite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const q = JSON.parse(process.argv[2] || '{"ids":["bench"]}');
const out = resolve(process.argv[3] || "tests/render/out/render.png");
mkdirSync(dirname(out), { recursive: true });

const server = await createServer({ configFile: false, root: process.cwd(), logLevel: "error", server: { port: 0 } });
await server.listen();
const { port } = server.httpServer.address();
const browser = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const page = await browser.newPage({ viewport: { width: 1500, height: 300 } });
const errs = [];
page.on("pageerror", (e) => errs.push(e.message));
page.on("console", (m) => { if (m.type() === "error") errs.push(m.text()); });
await page.goto(`http://localhost:${port}/tests/render/rev.html#${encodeURIComponent(JSON.stringify(q))}`);
await page.waitForSelector("body[data-done]", { timeout: 20000 }).catch(() => errs.push("렌더가 끝나지 않음"));
await page.screenshot({ path: out, fullPage: true });
console.log(errs.slice(0, 5).join("\n") || "ok → " + out);
await browser.close();
await server.close();
process.exit(errs.length ? 1 : 0);
