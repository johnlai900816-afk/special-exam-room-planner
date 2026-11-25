/* 段考資料 ⇄ 分拆文件（lib/nx/examData.ts）：
     名冊 → 考場（rosterPull）和舊版 exam.html?embed 一樣；匯入考評服務名單（rowsToStudents、parseSvc）和舊版一樣
     存段考：exam/main、private/data、private/notice、placements（監考老師）、seats（讀得到學生的老師）；第二次存一樣的內容 0 份
     記憶體版 Repo（和規則同一套）：老師只看得到自己監考的試場、自己的學生的考場；private 看不到；不能寫 */
import { describe, expect, it } from "vitest";
import { applyOps } from "../lib/nx/apply";
import { defaultData, type ExamD } from "../lib/nx/examCore";
import { EID, examOps, loadExam, rosterPull } from "../lib/nx/examData";
import { matchImport, rowsToStudents, applyImport } from "../lib/nx/examImport";
import { build, normalize, runSolve } from "../lib/nx/examOut";
import { normalize as nNormalize, defaultData as nDefault, syncNotice } from "../lib/nx/notice";
import { createMemoryRepo, demoRecords, memoryStore, toCoreD } from "../lib/repo";
import { examSandbox } from "./examOld";

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

describe("名冊 → 考場（rosterPull）和舊版一樣", () => {
  it("新的段考、已經有的段考（改名、換座號、名冊刪除、IEP 服務改了）", () => {
    const R = toCoreD(demoRecords());
    const roster = clone(R) as unknown as Record<string, unknown> & { students: { id: string; name: string; examSvc?: unknown; cls: string; seat: string }[]; gone?: string[] };
    roster.students[0].examSvc = { ext: "*", note: "提醒時間" };
    roster.students[1].examSvc = { oral: ["國文"] };
    const starts: ExamD[] = [];
    const a = defaultData();
    a.students = [];
    a.proctors = [];
    a.proctorInfo = {};
    starts.push(a);
    const b = defaultData();
    b.students.push({ id: "zz", cls: roster.students[2].cls, seat: roster.students[2].seat, name: roster.students[2].name, sv: { small: "*" }, memo: "", on: true });
    b.students.push({ id: "yy", cls: roster.students[3].cls, seat: roster.students[3].seat, name: "不同人", sv: {}, memo: "", on: true });
    starts.push(b);
    for (const E0 of starts) {
      const sb = examSandbox(["pinfo", "EXAM_TT", "ttSnap", "rosterPull", "normalize"], { roster });
      sb.ctx.__J = JSON.stringify(E0);
      const old = sb.run<string>("D=normalize(JSON.parse(__J));const ch=rosterPull();JSON.stringify([ch,D])");
      const E = normalize(clone(E0), defaultData);
      const r = rosterPull(E, roster);
      expect(JSON.stringify([r.ch, E])).toBe(old);
      // 名冊刪除（gone）
      const r2 = clone(roster);
      r2.gone = [roster.students[0].id];
      sb.ctx.__R = r2;
      const old2 = sb.run<string>("rosterRead=()=>__R;rosterPull();JSON.stringify(D)");
      rosterPull(E, r2);
      expect(JSON.stringify(E)).toBe(old2);
    }
  });
});

describe("匯入考評服務名單和舊版一樣", () => {
  const rows = [
    ["班級", "座號", "學生", "服務", "科目"],
    ["901", "01", "王小明", "延長時間、報讀", "全科"],
    ["902", "15", "陳 小華", "口頭作答(國文、作文)", "數學不用口頭"],
    ["", "", "", "、電腦作答", ""],
    ["803", "07", "林小美", "特殊考場(人數調整)", "除作文外"],
    ["704", "02", "張小安", "電腦打字", "作文"],
    ["705", "03", "李同學", "延長（觀察）、誦讀", "國文、英文（要不要再說）"],
    ["801", "05", "黃小傑", "不知道的服務", ""],
  ];
  it("rowsToStudents、對到現有的學生、匯入", () => {
    const D = defaultData();
    const sb = examSandbox(["subjects", "subjAliases", "rowsToStudents", "parseSvc", "sameNm", "impFind"]);
    sb.ctx.__J = JSON.stringify(D);
    sb.ctx.__rows = rows;
    const old = sb.run<string>("D=JSON.parse(__J);JSON.stringify(rowsToStudents(__rows))");
    const list = rowsToStudents(D, rows);
    expect(JSON.stringify(list)).toBe(old);
    expect(list.length).toBe(6);
    const m = matchImport(D, list);
    expect(m.nNew + m.nUpd).toBe(6);
    const before = D.students.length;
    applyImport(D, list, false);
    expect(D.students.length).toBe(before + m.nNew);
  });
});

/** 範例名冊＋段考（排好、通知單帶入） */
function setup() {
  const store = memoryStore(demoRecords());
  const admin = createMemoryRepo({ sid: "demo", termId: "t", uid: "a", role: "admin" }, store);
  return { store, admin };
}

describe("存段考：分拆文件、老師端的兩種文件", () => {
  it("第一次存、再存一次 0 份；placements 的 proctorIds、seats 的 teacherIds", async () => {
    const { store, admin } = setup();
    let L = await admin.load();
    const R = L.records;
    const roster = toCoreD(R);
    const ld = loadExam(R, roster);
    expect(ld.saved).toBe(false);
    expect(ld.E.students.length).toBe(roster.students.length);
    expect(ld.E.proctors).toEqual(roster.teachers.filter((t) => t.role === "資源班").map((t) => t.name));
    // 給一半的學生服務、排列、通知單帶入
    ld.E.students.forEach((s, i) => (s.sv = i % 2 ? { ext: "*" } : { small: "*", read: ["國文"] }));
    const X = build(ld.E);
    runSolve(X, "all");
    const N = nNormalize(nDefault());
    syncNotice(N, clone(X.D));
    const ops = examOps(R, X.D, N);
    const cols = new Set(ops.set.map((o) => o.col));
    expect([...cols].sort()).toEqual(["exam", "examPlace", "examPrivate", "examSeat"]);
    await applyOps(admin, ops, L.revs);
    L = await admin.load();
    expect(L.records.exam[EID]).toBeTruthy();
    expect(Object.keys(L.records.examPrivate).sort()).toEqual([EID + "/data", EID + "/notice"]);
    // 讀回來一樣、再存 0 份
    const again = loadExam(L.records, toCoreD(L.records));
    expect(again.saved).toBe(true);
    expect(again.changed).toBe(false);
    const ops2 = examOps(L.records, again.E, again.N);
    expect(ops2.set.length + ops2.del.length).toBe(0);
    // placements：每一節每一間；監考老師對到名冊 id
    const places = Object.values(L.records.examPlace);
    expect(places.length).toBeGreaterThan(2);
    const tByName = new Map(Object.entries(L.records.teachers).map(([id, t]) => [t.name, id]));
    places.forEach((p) => {
      const want = [p.proctor, p.support].filter(Boolean).map((n) => tByName.get(n)).filter(Boolean);
      expect(p.proctorIds.sort()).toEqual([...new Set(want)].sort());
      expect(p.stu.length + p.wait.length).toBeGreaterThan(0);
    });
    // seats：讀得到這位學生的老師
    Object.entries(L.records.examSeat).forEach(([k, s]) => {
      const sd = L.records.students[k.slice(EID.length + 1)];
      expect(s.teacherIds.sort()).toEqual([...new Set([...sd.teacherIds, ...(sd.caseMgrId ? [sd.caseMgrId] : [])])].sort());
      expect(Object.keys(s.rows[0]).sort()).toEqual(["date", "dow", "ext", "lab", "per", "proc", "room", "t"]);
    });
    void store;
  });

  it("老師只看得到自己監考的試場、自己的學生的考場；看不到 private；不能寫段考", async () => {
    const { store, admin } = setup();
    const L = await admin.load();
    const ld = loadExam(L.records, toCoreD(L.records));
    ld.E.students.forEach((s) => (s.sv = { ext: "*" }));
    const X = build(ld.E);
    runSolve(X, "all");
    await applyOps(admin, examOps(L.records, X.D, null), L.revs);
    const all = (await admin.load()).records;
    const tids = Object.keys(all.teachers).filter((id) => all.teachers[id].role === "資源班");
    let sawPlace = 0;
    for (const tid of tids) {
      const T = createMemoryRepo({ sid: "demo", termId: "t", uid: "u" + tid, role: "teacher", tid }, store);
      const r = (await T.load()).records;
      expect(Object.keys(r.examPrivate)).toEqual([]);
      Object.values(r.examPlace).forEach((p) => expect(p.proctorIds).toContain(tid));
      Object.values(r.examSeat).forEach((s) => expect(s.teacherIds).toContain(tid));
      const mine = Object.values(all.examPlace).filter((p) => p.proctorIds.includes(tid)).length;
      expect(Object.keys(r.examPlace).length).toBe(mine);
      sawPlace += mine;
      await expect(T.put("examPlace", EID + "/x", { ...Object.values(all.examPlace)[0], proctorIds: [tid] }, 0)).rejects.toThrow();
      await expect(T.put("exam", EID, { title: "x" }, 1)).rejects.toThrow();
    }
    expect(sawPlace).toBeGreaterThan(0);
    // 檢視（教務處）：看得到考程，看不到試場與學生考場
    const V = createMemoryRepo({ sid: "demo", termId: "t", uid: "v", role: "viewer" }, store);
    const rv = (await V.load()).records;
    expect(Object.keys(rv.exam)).toEqual([EID]);
    expect(Object.keys(rv.examPlace).length + Object.keys(rv.examSeat).length + Object.keys(rv.examPrivate).length).toBe(0);
  });
});
