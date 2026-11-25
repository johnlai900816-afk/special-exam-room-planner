import { defineConfig } from "vitest/config";

// npm test：單元測試（不用模擬器）。規則測試（test/rules*.test.ts）只有在 Firestore 模擬器開著時才跑：
//   npm run test:rules（見 web/test/README 段落於 MIGRATION.md §5）
const emulator = !!process.env.FIRESTORE_EMULATOR_HOST;

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    exclude: emulator ? [] : ["test/rules*.test.ts"],
    environment: "node",
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
  },
});
