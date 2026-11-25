# 資源班管理系統：搬到 Next.js 的計畫

這份文件說明新版（`web/`）的架構、資料模型、權限、部署，以及每一個舊功能要怎麼搬。
**舊版（repo 根目錄的 `index.html`、`app.js`、`exam.html`…）在切換之前完全不動，學校照常使用。**

---

## 1. 原則

1. **舊版先不動。** 新版放在 `web/`，另外建置、另外部署。切換之前兩邊並存，讀同一份資料。
2. **排課引擎只有一份。** `core.js` 是舊版、新版、`node test.js` 共用的同一個檔案，不複製。
3. **一個帳號一個人。** 每位老師用自己的 Google 帳號登入，看到自己的頁面；組長／排課者看到全部。
4. **有雲端時，沒登入就看不到資料。** 共用電腦登出後不留下任何學生資料。
5. **能靜態輸出就靜態輸出。** 現在可以放 GitHub Pages；之後要 API 時改到 Firebase App Hosting，頁面不用改。

---

## 2. 架構

| 項目 | 版本／做法 |
|---|---|
| 框架 | Next.js 16.4（App Router、TypeScript、Turbopack） |
| 樣式 | Tailwind CSS 4.3，設計 token 寫在 `app/globals.css` 的 `@theme` |
| 圖示 | lucide-react |
| 字型 | 內文 Noto Sans TC（400/500/700）、標題 Noto Serif TC（600/700），用 `next/font` 載入；正式紙本表單用標楷體字串 `--font-kai` |
| 雲端 | Firebase modular SDK 13（Auth：Google 登入；Firestore） |
| 後端 | Cloud Functions v2（Node 20，asia-east1），放在 repo 根目錄 `functions/` |
| 輸出 | 預設 `output:'export'`（靜態）；`NEXT_OUTPUT=server` 時是一般 Next.js 伺服器（App Hosting） |

### 2.1 資料夾

```
web/
  app/                 頁面（全部是用戶端元件）
    login/ me/ me/students/ me/off/ me/exam/ checkin/ settings/
    admin/ setup/ schedule/ exam/ accounts/
  components/          AppShell（側邊欄＋手機底部列）、WeekGrid、ScheduleBoard、OffEditor、Steps…
  lib/
    core.ts            core.js 的型別包裝（import "../../core.js"）
    types.ts           舊資料 D 與段考資料的型別
    model.ts           目標資料模型（schools/{sid}/…）與 Repo 介面
    legacy.ts          舊格式 D → 目標模型的轉換（搬移腳本用）
    session.tsx        登入狀態、角色、資料來源（整個 App 一份）
    accounts.ts        角色推算（claims 優先，沒有就用舊名單）
    cloud.ts           Firestore 讀寫（過渡期的舊位置＋新增的三個集合）
    local.ts           localStorage、備份檔、範例資料
    schedule.ts        用 core.js 算課表、老師一週、我的學生
    exam.ts            段考監考對照
    iep.ts             IEP 會議介面（等 iep.js）
  firestore.rules.proposed   提議的規則（未部署）
  apphosting.yaml      Firebase App Hosting 設定（未部署）
  deploy/github-pages.yml    GitHub Actions 範本（未啟用）
functions/             （repo 根目錄）
  roles.js             角色與邀請
  ai-proxy.js          AI 代理（佔位）
  scripts/bootstrap-admin.js 建立第一位管理者
```

### 2.2 core.js 怎麼共用

- `web/lib/core.ts` 直接 `import CORE_JS from "../../core.js"`，再補上 TypeScript 型別（`CoreApi`、`Model`…）。
- `core.js` 結尾的 `if(typeof module!=='undefined')module.exports=CORE;` 讓打包器把它當 CommonJS 模組。
- `next.config.ts` 把 `turbopack.root` 與 `outputFileTracingRoot` 設成 repo 根目錄，Turbopack 才會解析 `web/` 以外的檔案。
- `tsconfig` 的 `allowJs` 讓 TypeScript 讀得到它，但不檢查它（舊檔不用改）。
- 好處：另一位開發者在 `core.js` 加的拖曳、試排／確定，新版重新建置就有，不會兩份分岔。
- 注意：`core.js` 不能 import 畫面或瀏覽器專用的東西（現在本來就沒有）。改了 `core.js` 要同時跑 `node test.js` 與 `cd web && npm run build`。

### 2.3 資料來源的順序

1. **登入且在名單裡** → Firestore。過渡期讀舊位置 `rc/main`、`exams/main`，和舊版同一份、即時同步。
2. **這台設成「不使用雲端」（單機）** → 這台瀏覽器的 localStorage `resource-class-v1`（舊版存的同一份；新舊版同在 github.io 網域，讀得到）。
3. **登入了但暫時連不上** → 先用 localStorage 那一份。
4. **使用者自己選的備份檔**（舊版「下載備份檔」的 JSON）→ 只放在記憶體，不存檔、不上傳。
5. **範例資料** → `core.defaultData()` 再用 `core.solve` 排好。沒登入也能看（虛構資料）。

有雲端但沒登入時，**不顯示 localStorage 裡的真實資料**。

---

## 3. 資料模型

### 3.1 現在（舊版，過渡期新版照讀）

| 文件 | 內容 | 誰寫 |
|---|---|---|
| `config/access` | `{admin, emails, viewers, link?}`；新版加 `bind {信箱: teacher id}` | 主持人 |
| `rc/main` | `{json: JSON.stringify(D), by, at}`：名冊、老師、課程、排課、不排課、全校課表… | 編輯 |
| `rc/presence`、`rc/att-日期` | 在線上的人、點名紀錄 | 成員／編輯 |
| `exams/main`、`exams/notice`、`exams/presence` | 段考考場、通知單補充資料 | 編輯 |
| `view/{鑰匙}` | 免登入檢視 | 編輯 |

過渡期新版**只加**三個集合（要部署提議規則的 A+ 段才寫得進去）：

| 文件 | 內容 |
|---|---|
| `teacherOff/{teacherId}` | 老師自己送出的不排課時段 `{off, by, at, status:'pending'|'applied'}`；管理者在「資料與帳號」按「套用到排課」寫進 `rc/main` |
| `joinRequests/{uid}` | 還不在名單的人送出的加入申請 |
| `replies/{topic}/by/{uid}` | 老師自己的回覆（通知單、IEP 會議出席） |

新版寫 `rc/main` 時用交易（讀最新→改→寫回），格式和 `cloud.js` 的 `cloudPush` 一樣，舊版畫面會即時跟著變。

### 3.2 目標（架構審查採用版）

不再把整份 D 存成一個 JSON，改成一筆一份文件：

```
schools/{sid}                         {name, domain}
schools/{sid}/members/{uid}           {email, role:'admin'|'teacher'|'viewer', teacherId?, active}   只有 Function 寫
schools/{sid}/invites/{email}         {email, role, teacherId?, by, exp}                             只有 Function 寫
schools/{sid}/terms/{tid}             {title, periods, rooms, settings, rev}
  students/{id}                       {cls, seat, name, caseMgrUid, groupIds, rev, updatedBy, updatedAt}
  students/{id}/private/profile       需求、備註、聯絡資料等（個管老師與管理者才讀得到）
  teachers/{id}                       {name, role, uid?, off, hours, note, rev…}
  groups/{gid}                        課程＋排課結果 slots[]、status:'draft'|'final'
  exams/{eid}（+ sessions、placements）
  attendance/{date}
  iep/{mid}（+ responses/{uid}）
publicViews/{token}                   {sid, cls, rows（遮罩過）, exp}    只有後端寫
auditLogs/{id}                        {sid, by, action, target, detail, at}   只有後端寫、管理者讀
```

- **並行修改**：每份文件帶 `rev`。新增 `rev==1`，更新規則檢查 `rev` 剛好 +1、`updatedBy` 是自己。用戶端用交易更新；被別人搶先時提示「內容已被○○更新」再重做。
- **core.js 照用**：畫面把 terms/students/teachers/groups 組回 D（`legacy.ts` 的反方向）再交給 `compile(D)`，引擎不用改。
- **型別**：`web/lib/model.ts`；轉換：`web/lib/legacy.ts` 的 `fromLegacy(D, by, teacherUid)`。

### 3.3 搬移步驟（之後做，不是現在）

1. 部署 Functions 與新規則（B 段）；用 `bootstrap-admin.js` 建第一位管理者。
2. 寫一支搬移 Function（管理者呼叫）：讀 `rc/main`、`exams/main`，用 `fromLegacy` 拆成新文件，寫 `auditLogs`。舊文件**不刪**。
3. 新版改用 `SchoolRepo`（新位置）讀寫；舊版繼續用舊位置。這段期間**只有一邊能改**：搬移當天起，請組長只用新版，舊版設成唯讀（例如把舊名單成員都改成檢視）。
4. 穩定一學期後，再決定是否刪舊文件、拿掉舊規則 A 段。

---

## 4. 角色與帳號

### 4.1 角色

| 角色 | 是誰 | 看得到 | 能改 |
|---|---|---|---|
| 管理者 `admin` | 特教組長、排課者 | 全部 | 全部；成員角色（經 Function） |
| 老師 `teacher` | 資源班與普通班老師 | 自己的課表、自己的學生（個管的才看得到敏感欄位）、自己的監考、排課總表 | 自己的不排課時段、自己的回覆、點名 |
| 檢視 `viewer` | 教務處、行政 | 排課總表 | 不能改 |

### 4.2 角色放在哪裡

- **目標：custom claims `{sid, role, teacherId}`**，由 `functions/roles.js` 設定，同時寫 `schools/{sid}/members/{uid}` 與 `auditLogs`。
- **第一位管理者由 `functions/scripts/bootstrap-admin.js` 建立**（手動、用服務帳號執行），不再是「第一個登入的人」。新版的登入頁也不提供自己認領。
- **過渡期（還沒部署 Function）**：新版從舊名單 `config/access` 推角色：主持人與「編輯」＝管理者；「檢視」且有 `bind`＝老師；「檢視」沒有綁定＝檢視。新版加的老師在舊版畫面上就是「檢視」，舊版照常運作。claims 存在時以 claims 為準。

### 4.3 老師帳號怎麼綁到名冊上的老師

- 過渡期：主持人在新版「資料與帳號」選「這個信箱是名冊上的哪一位」，寫在 `config/access.bind`。
- 目標：管理者呼叫 `createInvite({sid, email, role, teacherId})` 寄出邀請；老師登入後呼叫 `acceptInvite()`，Function 檢查 Google 驗證過的信箱與期限，設定 claims（含 `teacherId`）。已登入過的人可直接 `setMemberRole`。
- claims 變了以後，用戶端要 `getIdToken(true)` 才拿得到新的；`members/{uid}.claimsAt` 會更新，畫面可以監看它自動刷新。

### 4.4 Functions（`functions/roles.js`，請在 `functions/index.js` 合併匯出）

| 名稱 | 種類 | 做什麼 |
|---|---|---|
| `setMemberRole` | callable | 管理者設定某人（uid 或 email）的角色與 `teacherId`；不能把最後一位管理者降級 |
| `createInvite` | callable | 管理者邀請一個信箱，預設 14 天到期 |
| `acceptInvite` | callable | 被邀請的人登入後領取角色（collection group 查 `invites.email`） |
| `revokeMember` | callable | 停用成員：清 claims、撤銷 refresh token、`active:false` |
| `aiProxy`（`functions/ai-proxy.js`） | callable | AI 代理佔位，現在回 `unimplemented` |

每一個都寫 `auditLogs`。`acceptInvite` 的 collection group 查詢需要在 `firestore.indexes.json` 開 `invites.email` 的 collection-group 單欄索引。
套件：`firebase-functions` v6 以上、`firebase-admin` v12 以上（由 `functions/package.json` 管理，另一位開發者在建 `index.js`）。

---

## 5. 規則（`web/firestore.rules.proposed`，未部署）

- **A 段：舊位置**，和正式的 `firestore.rules` 一字不差，舊版不受影響。
- **A+ 段：過渡期新增** `teacherOff`、`joinRequests`、`replies`：老師只能寫自己綁定的那一位、只能寫自己的回覆；管理者（編輯）讀取並套用。
- **B 段：新位置**，helper `canRead(sid)`、`canEdit(sid)`、`isAdmin(sid)` 讀 claims：
  - `members`、`invites` 用戶端一律不能寫（只有 Function）。
  - `students/{id}/private/*` 只有個管老師（`caseMgrUid`）與管理者讀得到。
  - `teachers/{id}`：老師本人只能改 `off`（＋`rev`、`updatedBy`、`updatedAt`）。
  - 所有更新檢查 `rev` +1 與 `updatedBy`；刪除只有管理者。
  - `publicViews` 只能 `get`、要沒過期（`exp > request.time`）；`auditLogs` 只有管理者讀自己學校的。

部署前：用 Firebase 模擬器（`firebase emulators:start --only firestore`）加規則單元測試，至少測「老師改別人的 off 被擋」「viewer 寫入被擋」「private 非個管讀不到」「rev 沒 +1 被擋」「舊版的 rc/main 讀寫照舊」。

---

## 6. 共用電腦的安全

1. **有雲端時沒登入不顯示資料**：AppShell 會導到登入頁；localStorage 的舊資料只在「單機」模式顯示。
2. **登出清乾淨**：登出時把記憶體裡的資料、預覽身分、讀進來的備份檔全部清掉。
3. **公用電腦模式**（登入頁、設定頁可勾）：不讀不寫 localStorage；登入狀態改成只存在這個分頁（`browserSessionPersistence`），關掉分頁就登出；登出時一併清掉 sessionStorage。
4. 新版不開 Firestore 離線快取（不在磁碟留下資料）。
5. 備份檔只在記憶體裡；「下載備份檔」會提醒含學生姓名。

---

## 7. 部署（**都還沒做，下面是步驟**）

### 7.1 階段一：GitHub Pages，新版放 `/app/`（舊版留在根目錄）

1. 把 `web/deploy/github-pages.yml` 複製到 repo 根目錄 `.github/workflows/pages.yml`。
2. GitHub「Settings › Pages › Source」改成「GitHub Actions」。
3. 流程：`node test.js` → `web/` 裡 `npm ci && npm run lint && npm run build`（`BASE_PATH=/special-exam-room-planner/app`）→ 把舊版檔案放根目錄、`web/out` 放 `/app` → 發布。
4. 舊版網址不變；新版是 `https://johnlai900816-afk.github.io/special-exam-room-planner/app/`。
5. Firebase Authentication 的「已授權網域」已經有 `johnlai900816-afk.github.io`，不用改。
6. 注意：之後舊版加新檔案（例如 `iep.js`），要記得加進流程的 `cp` 清單。

### 7.2 階段二：Firebase App Hosting（專案已是 Blaze 方案）

要用 API routes、伺服器端 AI 代理、App Check 時改用這個。

1. `firebase init apphosting`（或主控台「App Hosting › 建立後端」），連 GitHub repo，**根目錄設 `web/`**，區域 asia-east1。
2. `web/apphosting.yaml` 已設 `NEXT_OUTPUT=server`（關掉靜態輸出）、`BASE_PATH=""`。
3. 指定分支（建議先 `feat/next` 或 `staging`）→ 自動建置；拿到 `*.hosted.app` 網址先測。
4. Authentication「已授權網域」加上 App Hosting 的網域（與之後的自訂網域）。
5. 驗證完成後才綁自訂網域；GitHub Pages 的舊版先保留當備援。
6. 程式上：頁面都是用戶端元件，不用 cookies／headers／Server Actions，所以兩種輸出共用同一份程式。加 API route 時放在 `app/api/…/route.ts`，並在靜態輸出建置中排除（或只在 `NEXT_OUTPUT=server` 時建置）。

### 7.3 Functions 與規則

1. `functions/index.js` 合併 `require('./roles')`、`require('./ai-proxy')` 的匯出。
2. `firebase deploy --only functions`（區域 asia-east1，Node 20）。
3. 規則：先在模擬器測完，再 `firebase deploy --only firestore:rules`（用 `firestore.rules.proposed` 的內容）。**舊規則 A 段要原封保留**，否則舊版會壞。
4. 第一位管理者：
   ```
   $env:GOOGLE_APPLICATION_CREDENTIALS="C:\路徑\service-account.json"
   node functions/scripts/bootstrap-admin.js --sid <學校代碼> --email <組長 Gmail> --name "<學校名稱>" [--teacher-id <名冊老師id>]
   ```
   這個人要先用 Google 登入新版一次。服務帳號金鑰不要放進 repo。
5. App Check：主控台註冊 reCAPTCHA Enterprise，用戶端 `initializeAppCheck`，Functions 的 `enforceAppCheck` 改成 `true`，Firestore 打開強制驗證。先用「監控」模式觀察一週再強制。

---

## 8. AI 代理（合約）

瀏覽器**不直接**呼叫 AI。一律呼叫 `aiProxy`（callable，asia-east1）：

```
請求  { sid, task: 'groupSuggest' | 'iepDraft' | 'noticeText', input: {...} }
回應  { ok: true, output: {...}, usage: { inChars, outChars } }
錯誤  unauthenticated / permission-denied / resource-exhausted / invalid-argument / unimplemented
```

伺服器端要做：

1. 驗證 ID token（callable 自動），檢查 `claims.sid == sid` 且角色是 admin 或 teacher。
2. 限流：每人每分鐘 N 次、每校每日上限（用 Firestore 計數或 Memorystore）。
3. 去識別化：學生姓名、座號、身分證、電話換成代號（`S1`、`S2`…）後才送出；回來再換回。
4. 呼叫 Vertex AI Gemini（**區域 asia-east1**，資料不出境），不讓模型保留資料。
5. 寫 `auditLogs`：誰、哪個 task、字數、結果，**不記內容**。
6. App Check 強制。

舊版 `core.js` 的 `aiProblem / aiPrompt / aiApply` 產生與套用提示的邏輯可以沿用，只是改成在伺服器端呼叫。

---

## 9. 設計規範

- 顏色 token（`app/globals.css`）：`--bg #f6f2ea`、`--sunk #efe9dc`、`--card #fffdf8`、`--field #fff`、`--hover #ece5d6`、`--line #e6dfd2`、`--line2 #d3c9b8`、`--ink #2a2620`、`--ink2 #4d463c`、`--mute #6f6556`、`--acc #2f6a5b`、`--acc-d #235044`、`--acc-l #e3efe9`、`--ok`、`--warn #96590a`、`--warn-l`、`--bad #a8321f`、`--bad-l`、`--focus #d8a93a`；系統深色模式自動切換。另外補了 `--info`（原班鎖課的課塊）。
- Tailwind 類別直接用 token 名：`bg-card`、`text-ink2`、`bg-acc-l`、`text-warn`…
- 字級 12/13/14.5/16/18/22/30（`text-xs`/`sm`/`md`/`base`/`lg`/`xl`/`2xl`），內文 16；用 rem，跟著「設定 › 字的大小」放大。
- 圓角 8/12/16（`rounded-lg`/`xl`/`2xl`）；`rounded-leaf`（16 16 16 4）只給可以點的卡片。
- 點擊目標至少 40×40（`min-h-10`）；焦點框用 `--focus`。
- 不用表情符號，介面文字用繁體中文、直接說要做什麼。

## 10. 導覽

- 側邊欄最多 6 項；手機改成底部列。
- **老師**：今天（我的課表、現在這一節點名、待辦）／點名／我的學生（個案卡）／不排課時段／段考查詢（我的監考、交卷名單）／設定（字級、公用電腦模式）。
- **管理者**：總覽／學期初準備（① 匯入 › ② 學生 › ③ 老師與任課 › ④ 教室與節次 › ⑤ 規則）／排課（① 老師開課 › ② 不排課時段 › ③ 學生編組 › ④ 排課表 › ⑤ 課表輸出）／段考考場（照它的步驟）／簽到退／資料與帳號；側邊欄底部有「以教師身分預覽」。
- **檢視**：排課總表／設定。
- 多步驟流程一律 ①②③ 加「下一步 →」（`components/Steps.tsx`）。

---

## 11. 逐頁搬移清單

狀態：**完成**＝新版可用；**唯讀**＝看得到不能改；**骨架**＝頁面與步驟在，內容連回舊版；**未開始**。

| 舊功能（舊版位置） | 新版位置 | 狀態 | 要做的事 |
|---|---|---|---|
| 總覽儀表板（總覽） | `/admin` | 部分 | 已有：學生／老師／課程／排入數、衝突與警告、老師節數與個案數、各班人數。待補：段考狀態、今天的課、待處理事項 |
| 名冊：學生（名冊） | `/setup` ② | 骨架 | 表格編輯、Excel 貼上（`core.importStudents`）、個管、需要的科目；敏感欄位改存 `private/` |
| 名冊：老師、教室、作息（名冊） | `/setup` ③④ | 骨架 | 老師身分與應授節數、`importTeacherList`；教室含備用；作息與外加時段 |
| 全校課表（名冊／匯入：文字與掃描 PDF） | `/setup` ① | 骨架 | `ttParseAll`、`ttGuessClass`、學生名單對照；PDF 文字擷取與 OCR 放到 Function（大檔不在手機上跑） |
| 匯入：分組表、任課老師、不排課、手排鎖課（排課／名冊） | `/setup` ①、`/schedule` ①③ | 骨架 | `importCourseTable`、`importOff`、`importLocks`、`canonSubj`；匯入前自動保留版本 |
| 匯入與新學期（名冊 › 匯入與新學期） | `/accounts` | 骨架 | `newTerm`（升年級、清空）；全部清空要打出學校名稱確認；版本快照 |
| 排課：分組（排課） | `/schedule` ①③ | 骨架 | 老師開課、學生編組（`needList`、`candidates`、`placeStudents`） |
| 排課：不排課時段（排課） | `/schedule` ②、老師 `/me/off` | 部分 | 老師自己的已完成（過渡期送出→組長套用）；年級／班級／群組／個人層次的編輯待做 |
| 排課：排課板、一鍵排課、衝堂檢查（排課） | `/schedule` ④ | 唯讀 | 已用 core.js 顯示總表、篩選、衝突清單。待接：拖曳（`data-lesson`／`data-slot`、`BoardHooks`、`canPlace`）、一鍵排課（`solve`，建議放 Web Worker）、試排／確定（另一位開發者在 core/app.js 做） |
| 課表輸出（排課 › 課表輸出） | `/schedule` ⑤ | 骨架 | 老師課表、鎖課表（`lockTable`）、班級抽離表、學生個人課表、總課表（板橋格式）、列印 CSS（標楷體） |
| 我的課表（新功能） | `/me` | 完成 | 資源班老師看自己的課，普通班老師看被鎖在原班的節次 |
| 我的學生（新功能） | `/me/students` | 完成 | 個管、在我課裡、原班該科任課；敏感欄位只給個管看 |
| 段考考場（`exam.html`） | `/exam` | 骨架 | 照 exam.html 的步驟拆：考程、學生與調整、試場、排試場與監考、輸出。它的排列邏輯建議先抽成 `exam-core.js`（比照 core.js 共用）再搬 |
| 我的監考（新功能） | `/me/exam` | 完成 | 讀 `exams/main` 的 `proctorOf`／`supportOf`，用姓名對名冊 |
| 段考交卷名單（exam.html） | `/me/exam` | 骨架 | 我監考的試場學生與調整 |
| 簽到退（`checkin.js`） | `/checkin` | 骨架 | 點名、掃碼、出缺席紀錄、學生卡；過渡期讀寫 `rc/att-日期`，目標 `attendance/{date}` |
| 通知單（`notice.html`） | 段考 ⑤ | 未開始 | 版面改用新 token；列印用標楷體；`exams/notice` |
| 雲端共用（`cloud.js` 共用對話框） | `/accounts`、`/login` | 部分 | 成員、角色、綁定老師、加入申請、老師送出的不排課時段已做；在線上的人（presence）未做；最終改由 Function 管理 |
| 學校自己的雲端（`school.js`） | `lib/firebase-config.ts` | 部分 | 新版讀同一個 localStorage `rc-school-cloud`；設定畫面未做。改成 App Hosting 後，每校一個專案或一個專案多校（`schools/{sid}`）要先決定 |
| 備份與還原（共用 › 備份與還原） | `/accounts`、右上角資料來源 | 部分 | 下載備份檔（同格式）、讀取備份檔（只在記憶體）已做；還原寫回雲端、版本未做 |
| 免登入檢視連結（`view/{鑰匙}`） | `publicViews/{token}` | 未開始 | 改由後端產生遮罩過的資料、帶到期日 |
| IEP 會議（`iep.js`，另一位開發者） | `/me` 卡片、`lib/iep.ts` | 佔位 | 接上 `iep.js` 後顯示要出席的會議與回覆（`iep/{mid}/responses/{uid}`） |

---

## 12. 風險

1. **兩邊同時改同一份 `rc/main`**：過渡期新版只在少數地方寫（老師時段套用、主持人改名單），都用交易；但舊版本身是「最後存檔的人為準」，和新版同時改仍可能蓋掉。搬到新位置前，大量編輯請只在一邊做。
2. **過渡期老師讀得到整份 `rc/main`**（舊規則以成員為單位），包含不是自己的學生。這是舊規則的限制，要等搬到 `schools/{sid}/…`、敏感欄位拆到 `private/` 才解決。
3. **規則部署失誤會讓舊版壞掉**：A 段必須和正式規則一致；先在模擬器測、選學校不上課的時間部署。
4. **core.js 被改壞會同時影響兩邊**：好處也是風險。CI 要同時跑 `node test.js` 與 `web` 的建置。
5. **用姓名對監考**：名冊與段考的姓名寫法不同（例如「張老師（國）」）會對不到；已忽略括號註記，仍可能有同名或簡稱。
6. **custom claims 更新延遲**：改角色後要重新取得 token；忘了刷新會看到舊權限（最長 1 小時）。
7. **localStorage 是 github.io 整個網域共用**：同一個 GitHub 帳號底下的其他網站也讀得到。搬到 App Hosting 的獨立網域後解決；公用電腦模式可減少暴露。
8. **靜態輸出的預取請求**：Next 16 靜態輸出在 GitHub Pages 上，換頁前的部分 segment 預取會 404（`__next.*.__PAGE__.txt`），換頁本身正常；改 App Hosting 後沒有這個問題。
9. **中文字型很大**：`next/font` 依 unicode-range 分段載入，第一次開啟在慢速網路會先看到系統字。
10. **Turbopack root 設到 repo 根目錄**：會監看整個 repo；`web/node_modules` 以外沒有大型資料夾，目前沒問題。不要把真實資料檔放進 repo（`.gitignore` 已擋 `*匯入檔*.json`、`*備份*.json`）。

---

## 13. 要請使用者決定的事

1. **網址**：先用 GitHub Pages `/special-exam-room-planner/app/`，還是直接上 App Hosting（自訂網域？）。
2. **第一位管理者**：誰（哪個 Gmail）、學校代碼 `sid` 用什麼（例 `banqiao`）。
3. **一校一專案還是一個專案多校**：學校自己的 Firebase（`school.js`）要不要保留。保留的話，每校都要各自部署 Functions 與規則。
4. **舊名單怎麼轉**：舊版的「編輯」是不是都算管理者？哪些人其實是一般老師？
5. **普通班老師要不要帳號**：還是先只開資源班老師。
6. **搬移日**：哪一天起只用新版編輯、舊版轉唯讀。
7. **AI**：要不要開、哪些任務、每校每天的上限。
