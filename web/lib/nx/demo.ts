/* 範例資料（沒登入、單機、或還沒有雲端）：core.defaultData() 排好課，再補幾筆讓老師頁有東西看——
   個管學生的到期日、家長聯絡、一份別人開的 IEP 調查邀請我（填空堂）、一場已排定的會、上一節的點名。
   全部是虛構的。整個分頁共用一份記憶體資料庫，換頁不會不見；重新整理就回到原樣。 */
import { IEP, type Round } from "../iep";
import type { TermRecords } from "../model";
import { createMemoryRepo, demoRecords, memoryStore, toCoreD, type MemoryStore, type Repo, type RepoScope } from "../repo";
import { buildBoard } from "../schedule";
import { inviteDocs, roundDoc } from "./iepSync";
import { addDays, sessionsOn, ymd } from "./today";

/** 範例資料裡可以挑的老師（資源班老師都有個管學生） */
export const DEMO_DEFAULT_TID = "r1";

export function demoSeed(today = ymd(new Date())): TermRecords {
  const R = demoRecords();
  // 到期日、家長聯絡（r1 個管 s1、s4；r2 個管 s2）
  const p = (id: string) => R.privates[id];
  if (p("s1")) Object.assign(p("s1"), { iepDate: addDays(today, 12), privNote: "上課前先確認作業本", contacts: [{ id: "c1", date: addDays(today, -6), how: "電話", who: "母親", note: "討論段考延長時間" }] });
  if (p("s4")) Object.assign(p("s4"), { reviewDate: addDays(today, 25), examSvc: { ext: "*", read: ["數學"] } });
  if (p("s2")) Object.assign(p("s2"), { iepDate: addDays(today, 8), privNote: "（r2 的私密備註）" });

  // 王老師（r2）開的調查：個管學生 s2，r1 在七英（g3）教他 → r1 被邀請；另一場已排定
  const D = toCoreD(R);
  const ord = Object.keys(R.iep).length;
  const s = IEP.newRoundAs(D, "r2", { name: "期初 IEP 會議時間調查", stu: ["s2"], due: addDays(today, 5) }) as Round;
  s.kind = IEP.KINDS[0];
  s.priv = "cls";
  IEP.setRange(D, s, addDays(today, 7), addDays(today, 11), ["5", "6", "7"]);
  const sd = roundDoc(D, s, ord);
  R.iep[s.id] = sd;
  Object.assign(R.iepInvite, inviteDocs(D, s, sd.readers, IEP.busyOf(D, s)));

  const q = IEP.quickMeet(D, { sid: "s2", date: addDays(today, 3), p: "6", room: "會議室", kind: IEP.KINDS[0], host: "r2" }) as Round;
  if (q) {
    const qd = roundDoc(D, q, ord + 1);
    R.iep[q.id] = qd;
    // 直接開會不調查空堂，只把排定的場次告訴出席老師
    Object.assign(R.iepInvite, inviteDocs(D, q, qd.readers));
  }

  // r1 最近一個上課日的點名（一節點完、一節漏了一位）
  const B = buildBoard(D);
  for (let i = 1; i <= 7; i++) {
    const day = addDays(today, -i);
    const ses = sessionsOn(B, day, DEMO_DEFAULT_TID);
    if (!ses.length) continue;
    ses.slice(0, 2).forEach((x, j) => {
      const marks: Record<string, { st: string; tin?: string; tout?: string; note?: string }> = {};
      x.sids.forEach((sid, k) => {
        if (j === 1 && k === 0) return;
        marks[sid] = k === 1 ? { st: "late", tin: x.p.start, tout: "", note: "" } : { st: "in", tin: x.p.start, tout: x.p.end, note: "" };
      });
      R.attendance[x.aid] = { date: day, key: x.key, gid: x.gid, pid: x.p.id, teacherId: x.teacherId, marks, roster: x.sids, info: { g: x.name, p: x.p.name } };
    });
    break;
  }
  return R;
}

let store: MemoryStore | null = null;
/** 整個分頁共用的範例資料庫 */
export function demoStore(): MemoryStore {
  if (!store) store = memoryStore(demoSeed());
  return store;
}
export function resetDemo(): void {
  store = null;
}

export function demoScope(tid: string): RepoScope {
  return { sid: "demo", termId: "demo", uid: "demo-" + tid, role: "teacher", tid };
}
export function demoRepo(tid: string): Repo {
  return createMemoryRepo(demoScope(tid), demoStore());
}

/** 範例資料的管理者視角（同一份記憶體資料庫：管理者改了，切回老師就看得到） */
export const DEMO_ADMIN_SCOPE: RepoScope = { sid: "demo", termId: "demo", uid: "demo-admin", role: "admin" };
let adminRepo: Repo | null = null;
let adminFor: MemoryStore | null = null;
export function demoAdminRepo(): Repo {
  const st = demoStore();
  if (!adminRepo || adminFor !== st) {
    adminRepo = createMemoryRepo(DEMO_ADMIN_SCOPE, st);
    adminFor = st;
  }
  return adminRepo;
}

/** 範例資料的檢視視角（教務處：沒有學生資料） */
export const DEMO_VIEWER_SCOPE: RepoScope = { sid: "demo", termId: "demo", uid: "demo-viewer", role: "viewer" };
let viewerRepo: Repo | null = null;
let viewerFor: MemoryStore | null = null;
export function demoViewerRepo(): Repo {
  const st = demoStore();
  if (!viewerRepo || viewerFor !== st) {
    viewerRepo = createMemoryRepo(DEMO_VIEWER_SCOPE, st, { readOnly: true });
    viewerFor = st;
  }
  return viewerRepo;
}
