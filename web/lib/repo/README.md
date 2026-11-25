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
| `WritableCol`, `DocOf<C>` | type | `"term" \| "teachers" \| "classes" \| "groups" \| "students" \| "privates" \| "attendance" \| "iep"` |
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
