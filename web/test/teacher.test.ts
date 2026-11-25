/* 老師端（phase 2）的純邏輯：今天／待辦、IEP 的範圍與填空堂、私密欄位的權限。不用模擬器。 */
import { describe, expect, it } from "vitest";
import { IEP, type Round } from "../lib/iep";
import { demoSeed } from "../lib/nx/demo";
import { inviteDocs, inviteWrites, mergeInvites, owedInvites, readyRounds, roundDoc, upcomingMeets } from "../lib/nx/iepSync";
import { canSeePrivate, myStudentList, privPatch, relationOf, saveContact, setSvc, svcSubjects, type ExamSvc } from "../lib/nx/privacy";
import { addDays, attSummary, countIn, currentPeriod, defaultPid, sessionsOn, tapRecord, todos } from "../lib/nx/today";
import { createMemoryRepo, memoryStore, RepoDeniedError, revKey, toCoreD, type RepoScope } from "../lib/repo";
import { buildBoard } from "../lib/schedule";

const T = (tid: string): RepoScope => ({ sid: "s", termId: "t", uid: "u-" + tid, role: "teacher", tid });
// 2026-11-30 是週一
const MON = "2026-11-30";

async function view(tid: string, today = MON) {
  const store = memoryStore(demoSeed(today));
  const repo = createMemoryRepo(T(tid), store);
  const L = await repo.load();
  const D = toCoreD(L.records);
  return { store, repo, L, D, board: buildBoard(D) };
}

describe("今天：我的課與現在這一節", () => {
  it("只列我帶的課；同一天依節次排；週末沒有", async () => {
    const { board } = await view("r1");
    const ses = sessionsOn(board, MON, "r1");
    expect(ses.length).toBeGreaterThan(0);
    expect(ses.every((s) => s.teacherId === "r1")).toBe(true);
    expect(ses.map((s) => s.pi)).toEqual([...ses.map((s) => s.pi)].sort((a, b) => a - b));
    expect(sessionsOn(board, "2026-11-29", "r1")).toEqual([]);
  });
  it("現在這一節：在開始與結束之間；下課時間不算", () => {
    const P = [
      { id: "1", name: "第1節", start: "08:20", end: "09:05" },
      { id: "2", name: "第2節", start: "09:15", end: "10:00" },
    ];
    expect(currentPeriod(P, "08:20")).toBe(0);
    expect(currentPeriod(P, "09:05")).toBe(-1);
    expect(currentPeriod(P, "09:30")).toBe(1);
  });
  it("預設點哪一節：今天是還沒結束的第一節；別天是第一節", async () => {
    const { board } = await view("r1");
    const ses = sessionsOn(board, MON, "r1");
    expect(defaultPid(ses, MON, "2026-11-29", "23:00")).toBe(ses[0].p.id);
    expect(defaultPid(ses, MON, MON, "00:00")).toBe(ses[0].p.id);
    expect(defaultPid(ses, MON, MON, "23:59")).toBe(ses[ses.length - 1].p.id);
  });
  it("點名：第一次簽到（超過寬限算遲到）、再點一次簽退、別天不記時間", () => {
    expect(tapRecord(undefined, MON, MON, "08:24", "08:20", 5)).toMatchObject({ st: "in", tin: "08:24" });
    expect(tapRecord(undefined, MON, MON, "08:26", "08:20", 5)).toMatchObject({ st: "late" });
    expect(tapRecord({ st: "in", tin: "08:24", tout: "" }, MON, MON, "09:05", "08:20", 5)).toMatchObject({ tout: "09:05" });
    expect(tapRecord({ st: "leave" }, MON, MON, "09:05", "08:20", 5)).toBeNull();
    expect(tapRecord(undefined, MON, "2026-12-01", "09:00", "08:20", 5)).toMatchObject({ st: "in", tin: "" });
  });
});

describe("待辦", () => {
  it("要點名（已經開始的課）、IEP 要填、30 天內到期；還沒開始的課不算", async () => {
    const { D, board, L } = await view("r1");
    const early = todos({ D, board, tid: "r1", today: MON, hm: "00:00", attendance: L.records.attendance, invites: L.records.iepInvite });
    expect(early.some((x) => x.kind === "att")).toBe(false);
    const late = todos({ D, board, tid: "r1", today: MON, hm: "23:00", attendance: L.records.attendance, invites: L.records.iepInvite });
    expect(late.filter((x) => x.kind === "att").length).toBe(sessionsOn(board, MON, "r1").length);
    expect(late.some((x) => x.kind === "iep-owe")).toBe(true);
    const due = late.filter((x) => x.kind === "due");
    expect(due.map((x) => x.text).join()).toMatch(/IEP 會議 12\/12（12 天）/);
    // 別人個管的學生（s2 的 IEP 日期）不會出現在 r1 的待辦
    expect(due.some((x) => x.text.includes("陳小華"))).toBe(false);
  });
  it("點完名就不再列；點一半列還沒點的人數", async () => {
    const { D, board, repo } = await view("r1");
    const s = sessionsOn(board, MON, "r1")[0];
    for (const sid of s.sids.slice(1)) await repo.mark(MON, s.gid, s.p.id, sid, { st: "in" });
    const att = (await repo.load()).records.attendance;
    expect(countIn(att, s)).toBe(s.sids.length - 1);
    const t = todos({ D, board, tid: "r1", today: MON, hm: s.p.end, attendance: att, invites: {} }).filter((x) => x.kind === "att");
    expect(t[0].text).toContain("1 人還沒點名");
  });
  it("填了空堂就不再列；期限過了也不列", async () => {
    const { L } = await view("r1");
    const inv = L.records.iepInvite;
    expect(owedInvites(inv, "r1", MON).length).toBe(1);
    expect(owedInvites(inv, "r1", addDays(MON, 6)).length).toBe(0);
    const id = Object.keys(inv).find((k) => inv[k].teacherId === "r1" && inv[k].keys.length && !inv[k].meets.length)!;
    expect(owedInvites({ ...inv, [id]: { ...inv[id], ansAt: 1, free: [] } }, "r1", MON).length).toBe(0);
  });
  it("要開的會：別人排定、邀請我的也看得到（只有班級座號）", async () => {
    const { D, L } = await view("r1");
    const up = upcomingMeets(D, L.records.iepInvite, "r1", MON);
    expect(up.length).toBe(1);
    expect(up[0].stu).toBe("701-10");
    expect(up[0].at.startsWith(addDays(MON, 3))).toBe(true);
  });
  it("出缺席摘要：只算點過名的節次", async () => {
    const { L, D } = await view("r1");
    const any = Object.values(L.records.attendance)[0];
    const sid = any.roster![0];
    const o = attSummary(L.records.attendance, sid, D.periods, MON, "23:00");
    expect(o.exp).toBeGreaterThan(0);
    expect(o.in + o.leave + o.abs).toBe(o.exp);
  });
});

describe("IEP：只看得到、改得到自己的", () => {
  it("老師只讀得到自己是 readers 的調查單；r1 讀不到 r2 的調查單本身", async () => {
    const { L } = await view("r1");
    expect(Object.keys(L.records.iep)).toEqual([]);
    const r2 = await view("r2");
    expect(Object.keys(r2.L.records.iep).length).toBe(2);
  });
  it("開調查只能放自己個管的學生；readers＝自己；別人當 reader 的寫不進去；自己的可以刪", async () => {
    const { D, repo } = await view("r1");
    const R = IEP.newRoundAs(D, "r1", { stu: ["s1", "s2", "s4"] });
    expect(R.meets.map((m) => m.s).sort()).toEqual(["s1", "s4"]);
    const doc = roundDoc(D, R, 0);
    expect(doc.readers).toEqual(["r1"]);
    await repo.put("iep", R.id, doc, 0);
    await expect(repo.put("iep", "x1", { ...doc, readers: ["r2"] }, 0)).rejects.toBeInstanceOf(RepoDeniedError);
    await repo.remove("iep", R.id);
    expect((await repo.load()).records.iep[R.id]).toBeUndefined();
  });
  it("readers 只加不減：別位個管的學生讀不到時，不會把他拿掉", async () => {
    const { D } = await view("r1");
    const R = IEP.newRoundAs(D, "r1", { stu: ["s1"] });
    expect(roundDoc(D, R, 0, { ord: 3, name: "", due: "", stuIds: [], readers: ["r1", "r3"], json: "{}" }).readers).toEqual(["r1", "r3"]);
  });
  it("填空堂：發起人發邀請；被邀請的只能改回覆；回覆讀回調查單", async () => {
    const t = await view("r2");
    const rid = Object.keys(t.L.records.iep).find((k) => !JSON.parse(t.L.records.iep[k].json).quick)!;
    const R = JSON.parse(t.L.records.iep[rid].json) as Round;
    const want = inviteDocs(t.D, R, t.L.records.iep[rid].readers);
    expect(Object.keys(want)).toContain(rid + "_r1");
    // 公開內容只有班級座號，沒有姓名
    expect(JSON.stringify(want[rid + "_r1"])).not.toContain("陳小華");
    // 也不放任何人哪一節有課
    expect(want[rid + "_r1"].busy).toEqual({});

    const r1 = createMemoryRepo(T("r1"), t.store);
    const L1 = await r1.load();
    const id = rid + "_r1";
    const v = L1.records.iepInvite[id];
    const free = v.keys.slice(0, 2);
    const rev = L1.revs[revKey("iepInvite", id)].rev;
    await r1.patch("iepInvite", id, { free, note: "可以調課", ansAt: 1000 }, rev);
    await expect(r1.patch("iepInvite", id, { keys: [] }, rev + 1)).rejects.toBeInstanceOf(RepoDeniedError);
    // r3 讀不到別人的邀請
    const L3 = await createMemoryRepo(T("r3"), t.store).load();
    expect(L3.records.iepInvite[id]).toBeUndefined();

    const L2 = await t.repo.load();
    const R2 = JSON.parse(L2.records.iep[rid].json) as Round;
    const D2 = toCoreD(L2.records);
    expect(mergeInvites(D2, R2, L2.records.iepInvite)).toBe(1);
    expect(R2.ans["t:r1"][free[0]]).toBe("y");
    expect(R2.web!["t:r1"].note).toBe("可以調課");
    expect(mergeInvites(D2, R2, L2.records.iepInvite)).toBe(0);
    // 發起人改內容時保留對方的回覆；發起人改不了回覆
    const w2 = inviteDocs(D2, { ...R2, due: addDays(MON, 9) }, L2.records.iep[rid].readers);
    const ops = inviteWrites(w2, L2.records.iepInvite, rid);
    expect(ops.set.find((x) => x.id === id)!.data.free).toEqual(free);
    await expect(t.repo.patch("iepInvite", id, { free: [] }, L2.revs[revKey("iepInvite", id)].rev)).rejects.toBeInstanceOf(RepoDeniedError);
  });
  it("回覆齊了才列入「可以排」", async () => {
    const { D } = await view("r1");
    const R = IEP.newRoundAs(D, "r1", { stu: ["s1"] });
    IEP.setRange(D, R, addDays(MON, 7), addDays(MON, 8), ["1"]);
    expect(readyRounds(D, "r1").length).toBe(0);
    IEP.progress(D, R).people.forEach((o) => IEP.fillRest(R, o.k, "y", null));
    expect(readyRounds(D, "r1").map((x) => x.id)).toEqual([R.id]);
  });
});

describe("私密欄位只給個管", () => {
  it("我的學生：個管與有教的分開；搜尋姓名", async () => {
    const { L } = await view("r1");
    const S = myStudentList(L.records, "r1");
    expect(S.cm.every((x) => x.s.caseMgrId === "r1")).toBe(true);
    expect(S.taught.length).toBeGreaterThan(0);
    expect(S.taught.every((x) => x.s.caseMgrId !== "r1")).toBe(true);
    expect(myStudentList(L.records, "r1", "王小明").cm.map((x) => x.id)).toEqual(["s1"]);
  });
  it("canSeePrivate：個管 true；有教但不是個管 false；private 沒讀到也 false", async () => {
    const { L } = await view("r1");
    const sc = T("r1");
    expect(canSeePrivate(sc, L.records, "s1")).toBe(true);
    const taught = myStudentList(L.records, "r1").taught[0];
    expect(relationOf(taught.s, "r1")).toBe("taught");
    expect(canSeePrivate(sc, L.records, taught.id)).toBe(false);
    expect(L.records.privates[taught.id]).toBeUndefined();
    expect(canSeePrivate(sc, { ...L.records, privates: {} }, "s1")).toBe(false);
  });
  it("個管改私密欄位、家長聯絡、段考服務都過；不能改 caseMgrId；別的老師改不到", async () => {
    const { repo, L, store } = await view("r1");
    await repo.patch("privates", "s1", privPatch("privNote", " 新備註 "), L.revs[revKey("privates", "s1")].rev);
    const L2 = await repo.load();
    const c = saveContact(L2.records.privates.s1.contacts, { date: MON, how: "LINE", who: "父親", note: "請假" });
    await repo.patch("privates", "s1", privPatch("contacts", c), L2.revs[revKey("privates", "s1")].rev);
    const L3 = await repo.load();
    await repo.patch("privates", "s1", privPatch("examSvc", setSvc(L3.records.privates.s1.examSvc as ExamSvc, "oral", "all")), L3.revs[revKey("privates", "s1")].rev);
    const L4 = await repo.load();
    expect(L4.records.privates.s1.privNote).toBe("新備註");
    expect(L4.records.privates.s1.contacts!.length).toBe(2);
    expect(L4.records.privates.s1.examSvc).toEqual({ oral: "*" });
    await expect(repo.patch("privates", "s1", { caseMgrId: "r2" }, L4.revs[revKey("privates", "s1")].rev)).rejects.toBeInstanceOf(RepoDeniedError);
    expect(() => privPatch("caseMgrId" as never, "x")).toThrow();
    const r2 = createMemoryRepo(T("r2"), store);
    await expect(r2.patch("privates", "s1", { privNote: "x" }, 1)).rejects.toBeInstanceOf(RepoDeniedError);
  });
  it("段考服務的科目：考程的科目，沒有就預設七科；已勾的一定在", () => {
    expect(svcSubjects(["國文／英聽", "數學"], undefined)).toEqual(["國文", "英聽", "數學"]);
    expect(svcSubjects([], { read: ["體育"] })).toContain("體育");
    expect(setSvc({ ext: "*" }, "ext", "")).toEqual({});
    expect(setSvc({}, "read", "some", ["數學"])).toEqual({ read: ["數學"] });
  });
});
