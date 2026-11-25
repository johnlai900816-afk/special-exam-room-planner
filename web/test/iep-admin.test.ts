/* IEP 會議（管理者端）：和舊版 iep.js 的管理者模式（SC=''）一樣的範圍——
     全部的調查（不論誰開的）、任何學生（不限個管）、可以改別人開的調查、承辦是「特教組」；
     會議設定（必要身分、每場都邀請、導師、科目提示）寫到 staff/iep、classes、學期設定；
     管理者開的調查 readers＝學生的個管（老師端讀得到、填空堂收得到），管理者本身不在 readers。
   用記憶體版 Repo（照規則過濾）。 */
import { describe, expect, it } from "vitest";
import { IEP, type Round } from "../lib/iep";
import { planOnD } from "../lib/nx/apply";
import { demoSeed } from "../lib/nx/demo";
import { inviteDocs, nextOrd, roundDoc } from "../lib/nx/iepSync";
import { createMemoryRepo, memoryStore, revKey, toCoreD, type RepoScope } from "../lib/repo";

const ADMIN: RepoScope = { sid: "s", termId: "t", uid: "admin", role: "admin" };
const T = (tid: string): RepoScope => ({ sid: "s", termId: "t", uid: "u-" + tid, role: "teacher", tid });
const MON = "2026-11-30";

async function setup() {
  const store = memoryStore(demoSeed(MON));
  const admin = createMemoryRepo(ADMIN, store);
  const L = await admin.load();
  return { store, admin, L, D: toCoreD(L.records) };
}

describe("IEP 會議：管理者看全部、改全部", () => {
  it("全部的調查（老師開的也在）、全部的學生；老師只看到自己的", async () => {
    const { D, store } = await setup();
    const all = IEP.ownRounds(D, "", 0);
    expect(all.length).toBeGreaterThan(0);
    expect(all.every((R) => IEP.canEdit(D, R, ""))).toBe(true);
    expect(IEP.mineStu(D, "").length).toBe(D.students.length);
    // r1 不是這份調查的發起人（r2 開的）：老師端看不到、改不到
    const r1 = toCoreD((await createMemoryRepo(T("r1"), store).load()).records);
    expect(IEP.ownRounds(r1, "r1", 0).length).toBe(0);
    expect(IEP.canEdit(D, all[0], "r1")).toBe(false);
  });

  it("管理者開調查：任何學生、承辦是特教組；readers＝學生的個管；個管讀得到、被邀請的老師收到填空堂", async () => {
    const { D, admin, L, store } = await setup();
    const sids = D.students.filter((s) => s.caseMgr).slice(0, 3).map((s) => s.id);
    const cms = [...new Set(sids.map((id) => D.students.find((s) => s.id === id)!.caseMgr))].sort();
    const R = IEP.newRoundAs(D, "", { name: "期末 IEP", stu: sids });
    expect(R.meets.map((m) => m.s).sort()).toEqual([...sids].sort());
    expect(IEP.hostId(D, R) === "" || cms.length === 1).toBe(true);
    IEP.setRange(D, R, "2026-12-07", "2026-12-11", ["5", "6"]);
    R.inv = 1;
    const doc = roundDoc(D, R, nextOrd(L.records.iep));
    expect(doc.readers).toEqual(cms);
    await admin.put("iep", R.id, doc, 0);
    const inv = inviteDocs(D, R, doc.readers, IEP.busyOf(D, R));
    for (const [id, v] of Object.entries(inv)) await admin.put("iepInvite", id, v, 0);
    // 個管看得到這份調查單
    const cm = await createMemoryRepo(T(cms[0]), store).load();
    expect(cm.records.iep[R.id]).toBeTruthy();
    // 被邀請的老師收到自己的填空堂
    const some = Object.values(inv)[0];
    if (some) {
      const t = await createMemoryRepo(T(some.teacherId), store).load();
      expect(Object.values(t.records.iepInvite).some((v) => v.roundId === R.id)).toBe(true);
    }
  });

  it("管理者可以改老師開的調查（rev 檢查），readers 只加不減", async () => {
    const { admin, L } = await setup();
    const rid = Object.keys(L.records.iep)[0];
    const D = toCoreD(L.records);
    const R = IEP.ensure(D).rounds.find((r) => r.id === rid) as Round;
    R.name = "改過的名字";
    const prev = L.records.iep[rid];
    const doc = roundDoc(D, R, 0, prev);
    await admin.put("iep", rid, doc, L.revs[revKey("iep", rid)].rev);
    const L2 = await admin.load();
    expect(L2.records.iep[rid].name).toBe("改過的名字");
    expect(L2.records.iep[rid].readers).toEqual(expect.arrayContaining(prev.readers));
  });

  it("會議設定：必要身分、每場都邀請 → staff/iep；導師 → classes；科目提示 → 學期設定", async () => {
    const { L } = await setup();
    const D0 = toCoreD(L.records);
    const t = D0.teachers[0];
    const cls = String(D0.students[0].cls);
    const p = planOnD(L.records, (D) => {
      const c = IEP.ensure(D).cfg;
      c.req["行政"] = 1;
      c.admin.push(["t:" + t.id, "輔導主任", 1]);
      (D.classHead = (D.classHead || {}) as Record<string, string>)[cls] = "周導師";
      D.settings.iepAvoidSubj = ["數學"];
    });
    const cols = p.ops.set.map((o) => o.col + "/" + o.id).sort();
    expect(cols).toContain("staff/iep");
    expect(p.ops.set.some((o) => o.col === "term")).toBe(true);
    expect(cols.some((c) => c.startsWith("classes/"))).toBe(true);
    expect(cols.some((c) => c.startsWith("iep/"))).toBe(false); // 調查單本身不動
    const iep = JSON.parse(String(p.ops.set.find((o) => o.col === "staff" && o.id === "iep")!.data.json));
    expect(iep.cfg.admin).toContainEqual(["t:" + t.id, "輔導主任", 1]);
    // 之後帶入的出席名單有這位（必要）
    const D1 = p.D1;
    const ppl = IEP.derive(D1, D1.students[0].id);
    expect(ppl.some((x) => x[0] === "t:" + t.id && x[2] === 1)).toBe(true);
    expect(IEP.hintLists(D1).avoid).toEqual(["數學"]);
  });
});
