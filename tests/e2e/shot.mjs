// node shot.mjs out.png '<js to run in page>' [width] [fullPage]
import { chromium } from "playwright"; import { preview } from "vite";
const [out, code, w, full] = process.argv.slice(2);
const server = await preview({ root: "/home/user/-", logLevel: "error", preview: { port: 0 } });
const b = await chromium.launch({ args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] });
const p = await b.newPage({ viewport: { width: +(w || 420), height: 900 } }); const errs = [];
p.on("pageerror", e => errs.push(e.message)); p.on("console", m => { if (m.type() === "error") errs.push(m.text()); });
await p.goto(server.resolvedUrls.local[0]); await p.waitForSelector("#view > *");
await p.evaluate(`(async()=>{const g=window.gymlog;${code}})()`); await p.waitForTimeout(1800);
await p.screenshot({ path: out, fullPage: !!full }); console.log(errs.slice(0, 4).join("\n") || "ok");
await b.close(); await server.close(); process.exit(0);
