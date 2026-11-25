# 資源班管理系統（新版，Next.js）

架構、資料模型、權限、部署與搬移清單請看 [MIGRATION.md](./MIGRATION.md)。

```
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run build      # 靜態輸出到 out/
# 指定子路徑（Git Bash 要加 MSYS_NO_PATHCONV=1，不然路徑會被改寫）
MSYS_NO_PATHCONV=1 BASE_PATH=/special-exam-room-planner/app npm run build
# App Hosting 用的伺服器模式
NEXT_OUTPUT=server npm run build
```

排課引擎是 repo 根目錄的 `core.js`（和舊版共用），改了要同時跑根目錄的 `node test.js`。
