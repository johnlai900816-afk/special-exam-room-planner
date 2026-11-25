import path from "node:path";
import type { NextConfig } from "next";

// 部署路徑：GitHub Pages 預定放在 /special-exam-room-planner/app。
// 用環境變數 BASE_PATH 指定（本機開發不設＝根目錄）。
//   BASE_PATH=/special-exam-room-planner/app npm run build
const basePath = (process.env.BASE_PATH || "").replace(/\/+$/, "");

// 舊系統的 core.js 在 web/ 的上一層（repo 根目錄）。Turbopack 預設不解析專案根目錄以外的檔案，
// 所以把 root 設成 repo 根目錄，web/lib/core.ts 才能直接 import "../../core.js"，兩邊共用同一份。
const repoRoot = path.join(__dirname, "..");

// 兩種部署都能用同一份程式：
//   預設：靜態輸出（output:'export'）→ out/，可以放 GitHub Pages
//   NEXT_OUTPUT=server：一般 Next.js 伺服器 → Firebase App Hosting（apphosting.yaml 會設），之後可以加 API routes
// 頁面一律是用戶端元件、不用 cookies/headers/Server Actions，所以切換時不用改頁面。
const staticExport = process.env.NEXT_OUTPUT !== "server";

const nextConfig: NextConfig = {
  output: staticExport ? "export" : undefined,
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
  trailingSlash: true, // 產生 me/index.html，GitHub Pages 才找得到
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
  outputFileTracingRoot: repoRoot,
  turbopack: {
    root: repoRoot,
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
