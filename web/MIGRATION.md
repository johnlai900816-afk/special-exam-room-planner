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
| 後端 | Cloud Functions v2（Node 22，asia-east1），放在 repo 根目錄 `functions/` |
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
    model.ts           目標資料模型（schools/{sid}/…）的型別
    legacy.ts          舊格式 D ⇄ 分拆文件（包 functions/nx-split.js）
    repo/              Repo 介面、Firestore 版、記憶體版、toCoreD（README.md）
    session.tsx        登入狀態、角色、資料來源（整個 App 一份）
    accounts.ts        角色推算（claims 優先，沒有就用舊名單）
    cloud.ts           Firestore 讀寫（過渡期的舊位置＋新增的三個集合）
    local.ts           localStorage、備份檔、範例資料
    schedule.ts        用 core.js 算課表、老師一週、我的學生
    exam.ts            段考監考對照
    iep.ts             IEP 會議介面（等 iep.js）
  firestore.rules.proposed   第一版提議的規則（已由 firestore.rules.next 取代）
  firestore.rules.next       下一版規則：舊位置原封＋A+＋schools/{sid}（未部署）
  firestore.indexes.next.json  新位置要的索引
  firebase.emulator.json     規則測試用的模擬器設定（npm run test:rules）
  test/                      vitest：轉換、Repo、同步比對；rules*.test.ts 要模擬器
  apphosting.yaml      Firebase App Hosting 設定（未部署）
  deploy/github-pages.yml    GitHub Actions 範本（未啟用）
functions/             （repo 根目錄）
  nx-split.js          舊 D ⇄ 分拆文件、diff（新版與 Functions 共用）
  nx-core.js           搬移／同步的核心（不依賴 firebase，可測）
  nx-claims.js         claims {sid, role, tid}、邀請、第一位管理者
  nx-migrate.js        nxMigrateLegacy
  nx-sync.js           nxSyncFromLegacy、nxSyncExamFromLegacy
  nx-index.js          上面這些一次匯出
  roles.js             舊版角色函式（由 nx-claims.js 取代）
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

### 3.2 目標：一筆一份文件，老師在技術上讀不到不是自己的學生

型別：`web/lib/model.ts`。轉換（舊 D ⇄ 文件）：`functions/nx-split.js`（Functions、新版、測試共用一份）。存取：`web/lib/repo/`（說明見 `web/lib/repo/README.md`）。

```
schools/{sid}                           {name, domain?, currentTerm, mode:'legacy'|'native'}     只有 Function 寫
schools/{sid}/members/{uid}             {email, role, teacherId?, active, claimsAt}              只有 Function 寫
schools/{sid}/invites/{emailLower}      {email, role, teacherId?, by, exp}                       只有 Function 寫
schools/{sid}/terms/{tid}               {title, periods, rooms, settings, blocked, offBy(g:/c:/k:), sets, lockFix, offPool, packed}
  teachers/{id}                         {ord, name, role, off, note, hours, prefRooms?, x?}
  classes/{cls}                         {cls, head?, subj:{科目: 任課老師id}, ttJson?}           舊 classSubj／tt／classHead
  groups/{gid}                          {ord, name, subject, teacherId, per, mode, room, on, grade, studentIds, fixed?, slots?, x?}
  students/{id}                         {ord, cls, seat, name, caseMgrId, groupIds, teacherIds, note, needs, off?}
  students/{id}/private/profile         {caseMgrId, privNote, iepDate, reviewDate, certExp, examSvc, contacts[], x?}
  attendance/{date}_{gid}@{pid}         {date, key, gid, pid, teacherId, marks:{學生id: 紀錄}, roster, info}
  iep/{roundId}                         {ord, name, due, stuIds, readers, json}   (+ responses/{h}，只有 Function 寫)
  exam/{eid}                            {title, sessions, rooms, proctors, proctorOf, supportOf}
  exam/{eid}/private/{data|notice}      {json}：學生名單與調整、通知單（只有管理者／編輯）
  exam/{eid}/placements/{pid}           {proctorIds, …}：之後段考頁產生，監考老師讀自己的
  versions/{draft|vNNNN}                試排草稿與確定的版本（舊 sched）
  lockLog/{LNNNN}                       鎖課紀錄（舊 lockLog）
  staff/{legacy|iep|sched|sync}         其他只給管理者的：交接基準、weekly、gone、未知欄位、IEP 設定、同步狀態
publicViews/{token}                     {sid, cls, rows（遮罩過）, exp}    只有後端寫
auditLogs/{id}                          {sid, by, action, target, detail, at}   只有後端寫
nxLink/main                             {sid, termId, mode}：舊位置要同步到哪裡（只有 Function 讀寫）
```

- **誰讀得到學生**：`teacherIds`＝個管＋教他資源班課的老師＋他原班該科的任課老師（和「我的學生」同一個定義，`nx-split.readersOf`）。個管一定在 `teacherIds` 裡（規則檢查），所以老師用 `where('teacherIds','array-contains',tid)` 一個查詢就拿得到全部；Repo 另外再查 `caseMgrId == tid` 合併。
- **敏感欄位**：私密備註、IEP／檢討／鑑定日期、段考服務、家長聯絡紀錄、**以及任何不認得的學生欄位**都放 `private/profile`。`caseMgrId` 抄一份在 private 上，規則讀的時候不用 `get()`；管理者寫的時候用 `getAfter()` 檢查和學生文件一致。
- **Firestore 收不下的值**（陣列直接包陣列，例如全校課表 `[姓名, 節數, 旗標]`、`lockLast.list`、IEP 調查單）存成 JSON 字串（`ttJson`、`packed`、`json`、`x`）。
- **順序**：`ord` 保留名冊順序（core.js 用陣列索引，順序不同 solve 的結果就不同）。
- **rev**：每份文件 `rev`（新增 1、更新剛好 +1）、`updatedBy`（uid；搬移／同步寫的是 `migrate:legacy`／`sync:legacy`）、`updatedAt`（伺服器時間），規則檢查。用戶端用交易；被搶先時 `RevConflictError`。
- **core.js 照用**：`toCoreD(records)` 把讀得到的文件組回舊格式 D，`compile / solve / lockTable` 不用改。來回轉換後 compile 與 solve 的結果完全相同（`web/test/legacy.test.ts`）。老師的 D 只有自己的學生，課程的 `students` 也只剩自己的；看課表夠用，一鍵排課只給管理者。

### 3.3 搬移與過渡期

**原則：過渡期舊版（`rc/main`）是正本，新位置是單向同步出來的唯讀副本。** 一份資料任何時候只有一個地方可以改，就不會互相蓋掉。

1. **老師先搬到新版、只讀新位置。** 老師的 Repo 是 `readOnly`（`schools/{sid}.mode=='legacy'`），課表、我的學生、個案卡都讀分拆後的文件，**讀不到別人的學生**。老師要送出的東西（不排課時段、回覆）照舊寫過渡期集合 `teacherOff`、`replies`，由管理者在舊版套用。
2. **管理者繼續用舊版**，直到那個功能在新版做好。舊版每存一次 `rc/main`，`nxSyncFromLegacy` 就把差異寫到新位置（通常幾秒內）。
3. **同步的比對方式**（`functions/nx-core.js` `planMain`，測試：`web/test/sync.test.ts`）：
   - 觸發：`onDocumentWritten('rc/{docId}')`（`main`、`att-YYYY-MM-DD`）與 `onDocumentWritten('exams/{docId}')`（`main`、`notice`）。只有 `nxLink/main.mode=='legacy'` 時才做。
   - 把事件的 before、after 兩版 D 各自 `split()`，用 `diff()` 一份一份比：內容（排好 key 的 JSON，不含 rev 等）一樣就跳過；不一樣就整份覆寫，`rev = 新位置現在的 rev + 1`、`updatedBy='sync:legacy'`；before 有、after 沒有的刪掉（學生連 private）。改一位學生的名字＝寫 1 份；把學生加進課程＝課程＋那位學生 2 份（teacherIds 跟著變）。
   - 防亂序：`terms/{tid}/staff/sync` 記上次同步到的 rc/main 版本（`rev`，沒有就 `at`）。這次的 after 比記錄舊 → 跳過；記錄正好等於這次的 before → 只寫差異；其他（漏了事件）→ 拿 after 和新位置現在的內容整個比一次。
   - 新版那邊有人改過（`updatedBy` 不是同步／搬移）又被舊版蓋掉的文件記一筆 `auditLogs`（`nxSyncConflict`）。過渡期新版唯讀，正常不會發生。
   - 想確認沒有漂移：隨時再跑一次 `nxMigrateLegacy`（冪等，資料一樣就是 0 筆）。
4. **一個管理者功能搬完，就把那一塊交給新版**：把對應的集合加進 `nxLink/main.native`（例 `['attendance']`），同步從此跳過它們，新版的 Repo 對那一塊不再 readOnly；同時請管理者不要再在舊版改那一塊（舊版那部分會變成過時的備份）。可以分開交的塊：
   - 點名 `attendance`（舊 `rc/att-*`，本來就是獨立文件）
   - IEP `iep`、段考 `exam`、`examPrivate`
   - **排課核心** `term`、`teachers`、`classes`、`groups`、`students`、`privates`、`versions`、`lockLog`、`staff`：彼此相依（core.js 一起用），**要一起交**，也就是第 5 步。
   新版從不寫 `rc/main`，所以不會有「新版改的被舊版存檔蓋掉」以外的衝突；那種情況同步會記 `nxSyncConflict`。
5. **切換日**（所有管理者功能都在新版）：
   1. 舊版最後存一次；跑 `nxMigrateLegacy`（`dryRun:false`）確認 0 筆差異。
   2. `nxLink/main.mode` 和 `schools/{sid}.mode` 改成 `'native'`（同步停止；新版 Repo 不再 readOnly）。
   3. 部署規則：**舊位置只剩管理者（舊名單的「編輯」）讀得到**。把 A 段這幾行改掉，其他不動：
      ```
      match /rc/main        { allow read: if editor();   allow create, update: if false; … }
      match /rc/{id}        { allow read: if editor() && id.matches('att-[0-9]{4}-[0-9]{2}-[0-9]{2}');  allow create, update: if false; … }
      match /exams/{id}     { allow read: if editor() && id in ['main', 'notice'];  allow create, update: if false; … }
      match /iepResp/{round}/r/{h} { allow read: if editor(); … }
      ```
      （原本是 `member()` 讀、`editor()` 寫。改完舊版變成管理者唯讀的備份；老師在舊名單裡是「檢視」，從此讀不到 rc/main。）
6. **退休**（穩定一學期後）：下載 rc/main 的備份檔（線下保存），規則改成 `rc/*`、`exams/*` `allow read, write: if false`，拿掉 A 段的其他舊位置與 A+ 段，最後刪舊文件。

**IEP 會議與 Functions 怎麼對過去**

| 舊 | 過渡期 | 切換後 |
|---|---|---|
| `D.iep.rounds[]`（rc/main） | 同步成 `iep/{roundId}`（`json`＝整份調查單；`readers`＝發起人＋學生的個管）；`cfg`、`cur` 在 `staff/iep` | 新版直接寫 `iep/{roundId}` |
| `iepTok/{sha256}`（編輯建立） | 不動，`iepGetSurvey`／`iepSubmit` 照舊 | 新版建立時在 token 加 `sid`、`termId`；`iep-core.js` 依 `sid` 把回覆寫到 `schools/{sid}/terms/{tid}/iep/{round}/responses/{h}`（規則已備好：管理者＋readers 讀、只有 Function 寫）。舊 `iepTok` 到期就自然失效 |
| `iepResp/{round}/r/{h}`（成員讀） | 不動 | 切換時改成只有編輯讀；新回覆在新位置 |
| `ai.js`（看 `config/access`） | 不動 | 改看 claims（`role` in admin/editor/teacher、`sid`） |
| `roles.js`（claims `{sid, role, teacherId}`） | 由 `nx-claims.js` 取代（claims `{sid, role, tid}`、多了 editor） | 從 `index.js` 拿掉 |

---

## 4. 角色與帳號

### 4.1 角色

| 角色 | 是誰 | 讀 | 寫 |
|---|---|---|---|
| `admin` | 特教組長 | 學校全部 | 學校全部；成員與邀請（經 Function）；刪學期 |
| `editor` | 排課者、其他組長 | 學校全部 | 學校全部（不管成員） |
| `teacher` | 資源班與普通班老師（一定要綁 `tid`） | 學期設定、老師、班級、課程、段考考程；**自己的學生**（個管或 teacherIds 有自己）；自己個管的 private；自己課的點名；自己是 readers 的 IEP | 自己的 `off`；自己個管的 private（私密欄位，不能改 caseMgrId）；自己課的點名；自己是 readers 的 IEP |
| `viewer` | 教務處、行政 | 學期設定、老師、班級、課程（總課表）、段考考程與監考對照。**沒有學生資料** | 不能寫 |

畫面上 `editor` 和 `admin` 一樣（`accounts.appRoleOf`），只差「資料與帳號」的成員管理。

### 4.2 claims 與 Functions（`functions/nx-claims.js`）

custom claims 一律只有 `{ sid, role, tid? }`。規則只看 claims，不用 `get()` 查角色。claims 變了以後用戶端要 `getIdToken(true)`；`members/{uid}.claimsAt` 會更新，畫面可以監看它自動刷新。停用的人 ID token 最長 1 小時內還有效（已撤銷 refresh token）。

| 名稱 | 誰 | 做什麼 |
|---|---|---|
| `nxBootstrap({sid, name})` | 舊名單主持人（`config/access.admin`，Google 驗證過） | 第一位 admin；`tid` 取自 `config/access.bind`。學校已有其他 admin 就拒絕 |
| `nxImportLegacyMembers({sid, dryRun})` | admin | 舊名單 → 邀請：主持人→admin、編輯→editor、檢視且 bind 了老師→teacher、其他檢視→viewer |
| `nxCreateInvite({sid, email, role, tid?, days?})` | admin | 邀請（`invites/{emailLower}`），預設 14 天 |
| `nxAcceptInvite({sid?})` | 被邀請的人 | 領取角色；沒給 sid 時用 collection group 查 `invites.email`（要索引） |
| `nxSetClaims({sid, uid|email, role, tid?})` | admin | 改角色；不能把最後一位 admin 降級 |
| `nxRevokeMember({sid, uid})` | admin | 清 claims、撤銷 refresh token、`active:false` |
| `nxMigrateLegacy({sid, termId, name?, dryRun=true, prune=true})` | 舊名單主持人或 admin | 見 3.3；回傳各集合要寫／刪的筆數 |
| `nxSyncFromLegacy`、`nxSyncExamFromLegacy` | Firestore 觸發 | 見 3.3 |

每一個都寫 `auditLogs`。

---

## 5. 規則（`web/firestore.rules.next`，未部署）

- **A 段：舊位置**，和正式的 `firestore.rules` 一字不差（測試會比對兩份檔的行為）。
- **A+ 段：過渡期**：`teacherOff`、`joinRequests`、`replies`。
- **B 段：`schools/{sid}/…`**：helper `inSchool / isAdmin / isStaff / isTeacher / myTid` 讀 claims。
  - 成員、邀請、學校文件：用戶端一律不能寫；成員只有 admin 列得出來，本人讀自己的。
  - 學生：`get`／`list` 只給管理者／編輯，或 `caseMgrId == tid`、`tid in teacherIds` 的老師（查詢沒帶條件會整個被拒）。
  - private：管理者／編輯，或 `caseMgrId == tid` 的老師；老師只能改私密欄位。
  - 每一份文件都檢查欄位（`hasOnly`）與大小；新增 `rev==1`、更新 `rev` 剛好 +1、`updatedBy==uid`、`updatedAt==request.time`。
  - `versions`、`lockLog`、`staff`、`exam/*/private` 只給管理者／編輯；`publicViews` 只能 `get` 沒過期的；`members` 等不能 `list` 的地方都關掉。
- 索引：`web/firestore.indexes.next.json`（點名 `teacherId+date`、`invites.email` collection group）。

**測試（要 Java 11+）：**

```
# Git Bash
export JAVA_HOME="C:/Users/User/tools/jdk-21.0.13.1+2"
export PATH="/c/Users/User/tools/jdk-21.0.13.1+2/bin:$PATH"
cd web
npm test              # 單元測試：轉換、toCoreD 來回、Repo 權限、同步比對（不用模擬器）
npm run test:rules    # firebase emulators:exec 開 Firestore 模擬器（demo-rc 專案，不碰正式資料）跑完自動關
```

`test:rules` 跑三份：`rules.test.ts`（新位置 25 項）、`rules-live.test.ts`（正式 `firestore.rules` 與 `.next` 的 A 段各 19 項）、`rules-repo.test.ts`（Firestore 版 Repo 的查詢與交易都過得了規則）。

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

### 7.3 Functions、索引、規則（照這個順序；都還沒做）

1. **規則**：把 `web/firestore.rules.next` 的內容放進 repo 根目錄 `firestore.rules`。⚠️ A 段的 `adminEmail()` 要填**正式專案現在部署中的那個信箱**（repo 裡是 `CHANGE-ME@example.com`），其他一字不改。先 `cd web && npm run test:rules`，再 `firebase deploy --only firestore:rules`。舊版不受影響（A 段相同），新位置還沒有資料。
2. **索引**：把 `web/firestore.indexes.next.json` 放成根目錄 `firestore.indexes.json`，`firebase.json` 的 `firestore` 加 `"indexes": "firestore.indexes.json"`，`firebase deploy --only firestore:indexes`（建好要幾分鐘）。
3. **Functions**：`functions/index.js` 加一行 `Object.assign(exports, require('./nx-index'));`，並拿掉 `roles.js` 那一行（它設的 claims 沒有 editor、用 teacherId；由 nx-claims.js 取代）。`firebase deploy --only functions`（或只部署 `functions:nxBootstrap,functions:nxSetClaims,functions:nxCreateInvite,functions:nxAcceptInvite,functions:nxRevokeMember,functions:nxImportLegacyMembers,functions:nxMigrateLegacy,functions:nxSyncFromLegacy,functions:nxSyncExamFromLegacy`）。Firestore 觸發的區域要和資料庫位置一致；資料庫不在 asia-east1 時改 `nx-sync.js` 的 `region`。同步函式在 `nxLink/main` 出現前什麼都不做。
4. **第一位管理者**：主持人登入新版，呼叫 `nxBootstrap({sid, name})`，再 `getIdToken(true)`。（`functions/scripts/bootstrap-admin.js` 仍可用，但不需要了。）
5. **搬資料**：主持人呼叫 `nxMigrateLegacy({sid, termId})`（預設 dry-run，看筆數）→ 確認後 `{dryRun:false}`。從這一刻起同步開始。
6. **帳號**：`nxImportLegacyMembers({sid})` 看清單 → `{dryRun:false}` 寄出邀請；老師登入新版呼叫 `nxAcceptInvite()`。
7. 之後照 3.3 的第 4–6 步。
8. App Check：主控台註冊 reCAPTCHA Enterprise，用戶端 `initializeAppCheck`，Functions 的 `enforceAppCheck` 改成 `true`，Firestore 打開強制驗證。先用「監控」模式觀察一週再強制。

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
2. **過渡期老師讀得到整份 `rc/main`**（舊規則以成員為單位），包含不是自己的學生。新版本身只讀 `schools/{sid}/…`（讀不到別人的學生），但只要舊規則還讓「檢視」讀 rc/main，技術上仍讀得到。要等 3.3 第 5 步改規則（rc/main 只剩編輯讀）才算真正隔離——所以老師都搬到新版後，**越早切換越好**；也可以提早只做規則那一步：把老師從舊名單移除（新版靠 claims，不需要舊名單）。
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

---

## 8. Phase 2：老師端（`/me/…`，新資料模型）

| 頁面 | 網址 | 讀寫 |
|---|---|---|
| 今天 | `/me/` | 我的課（現在這一節）、待辦（要點名、IEP 要填空堂、可以排的調查、個管學生 30 天內到期）、要開的會 |
| 我的學生 | `/me/students/`、個案 `/me/student/?id=` | 學生、組別、課表、出缺席；**個管才有**私密欄位、家長聯絡、段考服務（`students/{id}/private/profile`，`Repo.patch` 帶 rev） |
| 我的 IEP | `/me/iep/?tab=inv|survey|plan|quick` | 填空堂（`iepInvite`）、調查①②③④、排定與通知（開會通知和舊版逐字相同，`test/iep-print.test.ts`）、直接開會 |
| 點名 | `/me/check/` | 我的課、最近的課；`Repo.mark` |
| 我的設定 | `/me/settings/` | 不排課時段（`Repo.saveMyOff`）、監考（`exam/{eid}` 的 proctorOf／supportOf）、深色、字級、公用電腦模式 |

- 登入（`lib/nx/session.tsx`）：Google → 沒有 claims 就呼叫 `nxAcceptInvite` → `getIdToken(true)` → 讀 `schools/{sid}.currentTerm`。
  老師 → Firestore 版 Repo；管理者／編輯／檢視這一階段只看到「管理功能請先用舊版」。沒登入或單機 → 範例資料（記憶體版 Repo，可以選看哪位老師）。
- 過渡期：`schools/{sid}.mode=='legacy'` 時老師端只讀；`schools/{sid}.native`（集合名稱陣列，和 `nxLink/main.native` 一致，由 Function 寫）列出的部分可以寫。
- `iep.js`、`teacher.js` 直接 import（`lib/iep.ts`、`lib/teach.ts`，只補型別），和 `core.js` 一樣不複製。
- 舊版 IEP 的 QR 小單與「③ 連結與 QR」流程正在改版，新版放在獨立元件 `components/iep/QrSlips.tsx`、`components/iep/Publish.tsx`，之後照新設計改這兩個檔。

**IEP 線上連結**：公開頁（舊版 `iep.html`）與 `iepGetSurvey`／`iepSubmit` 不動。鑰匙只存在發布的那台電腦（`rc-iep-tok`，和舊版同一個鍵；公用電腦模式在 sessionStorage）。
新版老師不在舊名單的「編輯」裡，規則不讓他寫 `iepTok`，所以新增 `functions/nx-iep.js`（純邏輯 `nx-iep-core.js`，`test/nx-iep.test.ts`）：

| Function | 做什麼 |
|---|---|
| `nxIepPublish({sid, termId, roundId, docs:[{h, doc}], drop})` | 呼叫的人是那份調查單的 readers（或管理者／編輯）才行；檢查欄位與上限（400 節、80 位、120 天）後寫 `iepTok/{h}`，多加 `sid`、`termId`；別的調查用過的雜湊不能蓋；`drop` 只刪同一份調查單的 |
| `nxIepClose({sid, termId, roundId})` | 結束調查：刪這份調查單的 `iepTok`、`iepResp` 回覆、新位置的 `responses` |
| `nxIepMirror`（`iepResp/{round}/r/{h}` 觸發） | `iepTok/{h}` 有 `sid`、`termId` 就把回覆抄到 `schools/{sid}/terms/{tid}/iep/{round}/responses/{h}`；舊版發的（沒有 sid）不動 |

**要部署的東西**（都還沒做）：
1. 規則：`web/firestore.rules.next`（B 段新增 `iepInvite`、老師刪自己唯一 reader 的 `iep`）。
2. Functions：`nx-index.js` 已匯出 `nxIepPublish`、`nxIepClose`、`nxIepMirror`（還要先部署 phase 1 的 `nx-claims.js` 等）；`functions/index.js` 要加 `Object.assign(exports, require('./nx-index'))`。
3. `iepTok` 的 `where('r','==')` + `where('sid','==')`（nxIepClose）只用單欄索引合併，不用另外建索引。

**測試**：`npm test`（單元：`teacher.test.ts` 今天／待辦、IEP 範圍、私密欄位；`iep-print.test.ts` 通知單逐字比對；`nx-iep.test.ts`）、
`npm run test:rules`（加了 iepInvite、老師刪調查單、responses 的規則測試）、`npm run test:e2e`（Firestore＋Auth 模擬器：兩位老師真的登入，各自只讀得到自己的學生，private 只有個管讀寫得到）。
