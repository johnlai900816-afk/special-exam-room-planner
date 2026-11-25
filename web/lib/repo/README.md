# `web/lib/repo`：資料存取介面

頁面**只**透過這裡讀寫新的資料位置 `schools/{sid}/terms/{tid}/…`。模型見 `web/lib/model.ts`，規則見 `web/firestore.rules.next`，搬移見 `web/MIGRATION.md`。

```ts
import { createFirestoreRepo, createMemoryRepo, toCoreD, type Repo } from "@/lib/repo";
```

## 匯出

| 名稱 | 種類 | 說明 |
|---|---|---|
| `Repo` | interface | 見下表 |
| `RepoScope` | type | `{ sid, termId, uid, role, tid? }`，`role`/`tid` 來自 custom claims |
| `Loaded` | type | `{ records: TermRecords, revs: RevMap }` |
| `RevMap`, `revKey(col, id)` | type, fn | 每份文件的 `{rev, updatedBy, updatedAt}`；學期文件的 key 是 `"term"`，其他是 `"students/s1"` |
| `WritableCol`, `DocOf<C>` | type | `"term" \| "teachers" \| "classes" \| "groups" \| "students" \| "privates" \| "attendance" \| "iep" \| "iepInvite"`，另外 `"exam" \| "examPrivate" \| "versions" \| "lockLog" \| "staff"`（只有管理者／編輯：還原、新學期、匯入） |
| `BatchOp`, `BatchResult`, `BatchOptions` | type | `Repo.batch` 用：`{col, id, data（null＝刪除）, expectRev（null＝不檢查）}` |
| `RevConflictError` | class | 別人先改了：`{col, id, expected, current}` |
| `RepoDeniedError` | class | 沒有權限 |
| `createFirestoreRepo(db, scope, opt?)` | fn | Firestore 版（`opt.readOnly` 過渡期設 true） |
| `createMemoryRepo(scope, records?, opt?)` | fn | 記憶體版；`records` 省略＝範例資料（`core.defaultData()`）。**照規則**過濾：老師只拿到自己的學生 |
| `demoRecords()` | fn | 範例資料的 records（全部，管理者看到的） |
| `toCoreD(records, opt?)` | fn | records → 舊格式 D，可以直接給 `core.compile / solve / lockTable…` |
| `splitD(D)` | fn | 舊格式 D → records（全部；搬移、範例、測試用） |
| `emptyRecords()` | fn | 空的 `TermRecords` |
| `deriveStudentLinks(records)` | fn | 依課程重算每位學生的 `groupIds`、`teacherIds`（寫課程或學生後要做；`put` 已經自動做） |
| `scopeOf(claims, uid, termId)` | fn | custom claims → `RepoScope`；沒有 claims 回傳 null |

## `Repo`

| 方法 | 說明 |
|---|---|
| `kind` | `"firestore"` 或 `"memory"` |
| `scope` | 建立時給的 `RepoScope` |
| `readOnly` | 過渡期 true：資料由 `rc/main` 單向同步，不要提供編輯 |
| `load()` | 一次讀完這個人讀得到的全部 |
| `watch(next, fail?)` | 即時；每次變動都給完整的 `Loaded`。回傳取消函式 |
| `put(col, id, data, expectRev)` | 寫整份文件；新增時 `expectRev=0`。回傳新 rev |
| `patch(col, id, partial, expectRev)` | 改部分欄位 |
| `remove(col, id)` | 刪除（管理者／編輯）；學生連 private 一起刪 |
| `batch(ops, opt?)` | 一次寫很多份（匯入、個管分配、還原、新學期）。每份檢查 rev（`expectRev:null` 不檢查）；衍生欄位（學生的 groupIds、teacherIds、private.caseMgrId）照最後的結果補寫。Firestore 分成幾個交易（`opt.chunk`，預設 300），同一位學生的學生文件與 private 一定在同一個交易（規則的 `getAfter`）；某一個交易失敗時前面的不會退回，錯誤訊息會寫「前面 N 份已寫入」。記憶體版整批先檢查再寫 |
| `saveMyOff(off, expectRev)` | 老師改自己的不排課時段 |
| `mark(date, gid, pid, studentId, rec)` | 點名；`rec=null` 取消 |

### 各角色讀得到什麼（`load()` 的內容）

| 集合 | admin / editor | teacher | viewer |
|---|---|---|---|
| `term`、`teachers`、`classes`、`groups` | 全部 | 全部 | 全部 |
| `students` | 全部 | `caseMgrId == tid` 或 `teacherIds` 含 `tid` | 無 |
| `privates` | 全部 | 只有自己個管的 | 無 |
| `attendance` | 全部 | `teacherId == tid` | 無 |
| `iep` | 全部 | `readers` 含 `tid` | 無 |
| `iepInvite` | 全部 | `teacherId == tid`（邀請我的）或 `readers` 含 `tid`（我發的） | 無 |
| `exam` | 全部 | 全部（考程、試場、監考對照） | 全部 |
| `examPrivate`、`versions`、`lockLog`、`staff` | 全部 | 無 | 無 |

Firestore 版的查詢就是照這張表下的（老師：`where('teacherIds','array-contains',tid)` 和 `where('caseMgrId','==',tid)` 兩個查詢合併；private 逐筆 `get`），所以規則不會拒絕整個查詢。

### 怎麼接 core.js

```ts
const { records } = await repo.load();
const D = toCoreD(records);          // 舊格式 D
const M = CORE.compile(D);            // 照舊
```

老師拿到的 D 只有自己的學生，課程的 `students` 也只剩自己的學生；看課表、看自己的學生夠用，**一鍵排課（solve）只給管理者**（要全部的學生才排得對）。

### 寫入與 rev

- 每一份文件都有 `rev`（從 1 開始）、`updatedBy`（uid）、`updatedAt`（伺服器時間）；`put/patch` 自動帶，規則檢查剛好 +1。
- 畫面記住讀到的 rev（`revs[revKey(col,id)].rev`），存檔時傳進去；被別人搶先時丟 `RevConflictError`，請提示「內容已被○○更新」再重讀。
- 寫 `groups`（改學生名單、老師）或 `students`（改個管、班級）時，`put/patch` 會在同一個批次更新受影響學生的 `groupIds`、`teacherIds`、`private.caseMgrId`，各自 rev +1。

### 範例

```ts
// 管理者改一門課的學生
const { records, revs } = await repo.load();
const g = records.groups["g1"];
await repo.put("groups", "g1", { ...g, studentIds: [...g.studentIds, "s9"] }, revs[revKey("groups", "g1")].rev);

// 老師改自己的不排課時段
await repo.saveMyOff(["2-5", "2-6"], revs[revKey("teachers", scope.tid!)].rev);
```

### IEP 填空堂邀請 `iepInvite/{roundId}_{teacherId}`（phase 2 新增）

新版才有、舊格式 D 沒有（`functions/nx-split.js` 不認得，搬移與同步不碰；`emptyRecords()`／`splitD()` 會補一個空的）。
調查單的 readers（發起人、個管）寫公開的部分（和線上連結 iepTok 同一套：班級座號、節次、有課的種類、已排定的場次）；
被邀請的老師只能改 `free`、`note`、`ansAt`。發起人打開「我的 IEP」時，`lib/nx/iepSync.mergeInvites` 把回覆讀回調查單。
老師可以刪「只有自己一個 reader」的調查單（`iep`）與自己是 readers 的邀請。

### 管理者端：用舊的純函式改資料（`lib/nx/apply.ts`）

```ts
import { planOnD, summarize, applyOps } from "@/lib/nx/apply";
const { records, revs } = await repo.load();
const p = planOnD(records, (D) => CORE.importStudents(D, tsv)); // 在 toCoreD(records) 的副本上跑
summarize(p.ops, revs);   // {add, update, del, total, byCol}：先給人看
await applyOps(repo, p.ops, revs);  // repo.batch，每份帶 rev
```

`planOnD` 把 D0、D1 都過 `splitD` 再 `diff`（`functions/nx-split.js`），只有真的變了的文件會寫；預設只比排課核心的集合（`CORE_COLS`：term、teachers、classes、groups、students、privates、staff）。
`diffRecords(before, after, cols?)` 直接比兩份 records（還原備份用）；`filterOps` 拿掉不要的（例：還原時不刪點名）。
