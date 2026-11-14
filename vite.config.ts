import { defineConfig, loadEnv, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import type { IncomingMessage } from "node:http";

/** 개발·미리보기 서버에서 /api/ai를 server/ai.ts에 연결한다. 키는 .env.local의 ANTHROPIC_API_KEY. */
function aiDevApi(env: Record<string, string>): Plugin {
  const mw = async (req: IncomingMessage, res: any) => {
    const { handleAI } = await import("./server/ai.ts");
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) if (typeof v === "string") headers.set(k, v);
    const out = await handleAI(
      new Request("http://localhost/api/ai", { method: req.method, headers, body: req.method === "POST" ? Buffer.concat(chunks) : undefined }),
      { ...process.env, ...env },
    );
    res.statusCode = out.status;
    out.headers.forEach((v, k) => res.setHeader(k, v));
    if (out.body) for await (const c of out.body as any) res.write(c);
    res.end();
  };
  return {
    name: "gymlog-ai-dev-api",
    configureServer(s) { s.middlewares.use("/api/ai", mw); },
    configurePreviewServer(s) { s.middlewares.use("/api/ai", mw); },
  };
}

export default defineConfig(({ mode }) => ({
  // GitHub Pages처럼 하위 경로에 올려도 동작하도록 상대 경로로 빌드한다
  base: "./",
  plugins: [
    aiDevApi(loadEnv(mode, process.cwd(), ["ANTHROPIC_", "GYMLOG_"])),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/icon.svg"],
      manifest: {
        name: "짐로그",
        short_name: "짐로그",
        description: "운동·식단 기록",
        lang: "ko",
        display: "standalone",
        start_url: ".",
        scope: ".",
        background_color: "#eef0f4",
        theme_color: "#ee5113",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\//, handler: "StaleWhileRevalidate", options: { cacheName: "fonts" } },
        ],
      },
    }),
  ],
  test: { include: ["tests/unit/**/*.test.ts"] },
}));
