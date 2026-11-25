/* 管理者的點名（lib/nx/checkin.ts）和舊版一樣：
     attStats：一節一份的點名文件 vs 舊版 checkin.js attStats（舊的一天一份格式），同一份資料、同一個時間，結果逐項相同
     學生卡：新版 cardsHtml vs 舊版 renderCards 的 #outArea，逐字相同（全部、某一班、某一門課）
     導師週報：weeklyOf（點名文件）＝ core.weeklySummary（舊格式）；缺席、還沒上、名單；用 AI 潤飾的去識別化
   舊版原文放在 node 的 vm 沙盒裡跑（test/oldApp.ts）。 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { CORE } from "../lib/core";
import { NX } from "../lib/legacy";
import type { AttendanceDoc } from "../lib/model";
import { attStats, cardsHtml, checkTodos, findStudents, groupStats, logSpan, setWeeklySent, weeklyAiRequest, weeklyAiRestore, weeklyOf, weeklySent, weeklyText } from "../lib/nx/checkin";
import { addDays, hmOf, sessionsOn, ymd } from "../lib/nx/today";
import { createMemoryRepo, demoRecords, memoryStore, toCoreD } from "../lib/repo";
import { buildBoard } from "../lib/schedule";
import type { RcData } from "../lib/types";
import { oldSandbox, pick } from "./oldApp";

const CHECKIN = readFileSync(resolve(__dirname, "../../checkin.js"), "utf8");
// 2026-11-26（週四）10:30（本機時間）
const NOW = new Date(2026, 10, 26, 10, 30).getTime();
const TODAY = ymd(new Date(NOW));
const HM = hmOf(new Date(NOW));

function oldCheckin(D: RcData, extra: Record<string, unknown> = {}) {
  const sb = oldSandbox([pick("stuLabel"), pick("sortStu"), CHECKIN], {
    now: NOW,
    extra: { window: {}, loadScript: () => new Promise(() => {}), ico: () => "", ...extra },
  });
  sb.ctx.__D = JSON.parse(JSON.stringify(D));
  sb.run("D=normalize(__D);");
  return sb;
}

/** 範例資料上做一學期的點名：好幾天、好幾節；有名單的、舊的沒有名單、組別被刪掉的、空的一節、今天還沒上完的 */
function fixture() {
  const R = demoRecords();
  const D = toCoreD(R);
  const B = buildBoard(D);
  const att: Record<string, AttendanceDoc> = {};
  const sts = ["in", "late", "leave", "abs", "in", "in"];
  let n = 0;
  for (let i = 20; i >= 0; i--) {
    const day = addDays(TODAY, -i);
    sessionsOn(B, day).forEach((s, j) => {
      n++;
      if (n % 7 === 3) return; // 沒點名的節次
      const marks: AttendanceDoc["marks"] = {};
      s.sids.forEach((sid, k) => {
        if ((n + k) % 5 === 4) return; // 有點名、這位沒紀錄 → 缺席（課上完了才算）
        const st = sts[(n + k + j) % sts.length];
        marks[sid] = { st, tin: st === "in" || st === "late" ? s.p.start : "", tout: "", note: k === 0 && st === "leave" ? "病假" : "" };
      });
      const doc: AttendanceDoc = { date: day, key: s.key, gid: s.gid, pid: s.p.id, teacherId: s.teacherId, marks };
      if (n % 4 !== 0) doc.roster = s.sids.slice(0, Math.max(1, s.sids.length - (n % 3 === 0 ? 1 : 0))); // 有的沒有名單（舊紀錄）
      if (n % 5 === 0) doc.info = { g: s.name, p: s.p.name };
      if (n % 11 === 0) doc.marks = {}; // 點了又全部清掉
      att[s.aid] = doc;
    });
  }
  // 組別被刪掉（新學期）的舊紀錄：只有 info
  att[addDays(TODAY, -3) + "_gone@1"] = {
    date: addDays(TODAY, -3),
    key: "gone@1",
    gid: "gone",
    pid: "1",
    teacherId: "",
    marks: { [D.students[0].id]: { st: "in", tin: "08:00" } },
    roster: [D.students[0].id, D.students[1].id],
    info: { g: "已刪除的組", p: "第一節" },
  };
  return { R, D, B, att };
}
/** 等於的舊格式（舊版會把沒有任何學生紀錄的 key 刪掉） */
const oldATT = (att: Record<string, AttendanceDoc>) => NX.joinAttendance(Object.fromEntries(Object.entries(att).filter(([, a]) => Object.keys(a.marks).length)));

describe("attStats：一節一份的點名文件，和舊版 checkin.js 一樣", () => {
  const { D, att } = fixture();
  const sb = oldCheckin(D);
  sb.ctx.__ATT = oldATT(att);
  sb.run("ATT=__ATT;");
  const gids = ["", ...D.groups.slice(0, 3).map((g) => g.id), "gone"];
  const spans: [string, string][] = [
    ["0000-00-00", "9999-99-99"],
    [addDays(TODAY, -7), TODAY],
    [TODAY, TODAY],
    [addDays(TODAY, -14), addDays(TODAY, -8)],
  ];
  for (const [from, to] of spans)
    for (const gid of gids)
      it(from.slice(5) + "～" + to.slice(5) + (gid ? " 組 " + gid : " 全部"), () => {
        const a = sb.run<Record<string, unknown>>(`JSON.parse(JSON.stringify(attStats(${JSON.stringify(from)},${JSON.stringify(to)},${JSON.stringify(gid)})))`);
        const b = JSON.parse(JSON.stringify(attStats(att, D, from, to, gid, TODAY, HM)));
        expect(b).toEqual(a);
        if (!gid && from === "0000-00-00") expect(Object.keys(b).length).toBeGreaterThan(3);
      });
  it("沒點名的節次不算、點名但沒紀錄的算缺席、今天還沒上完的不算", () => {
    const by = attStats(att, D, "0000-00-00", "9999-99-99", "", TODAY, HM);
    const tot = Object.values(by).reduce((n, o) => n + o.abs, 0);
    expect(tot).toBeGreaterThan(0);
    // 已刪除的組照存的名字
    expect(Object.values(by).some((o) => o.rows.some((r) => r.g === "已刪除的組"))).toBe(true);
    const gs = groupStats(by);
    expect(gs.reduce((n, g) => n + g.exp, 0)).toBe(Object.values(by).reduce((n, o) => n + o.exp, 0));
  });
  it("logSpan 和舊版一樣", () => {
    for (const r of ["day", "week", "month", "all", "custom"] as const) {
      const a = sb.run(`logRange=${JSON.stringify(r)};logFrom='2026-11-02';logTo='2026-11-10';JSON.stringify(logSpan())`);
      expect(JSON.stringify(logSpan(r, "2026-11-02", "2026-11-10", TODAY))).toBe(a);
    }
  });
});

describe("掃卡或輸入學生", () => {
  it("學生卡、班級座號、姓名、部分姓名", () => {
    const D = toCoreD(demoRecords());
    const s = D.students[0];
    expect(findStudents(D.students, "RC:" + s.id).hit).toEqual([s]);
    expect(findStudents(D.students, String(s.cls) + String(s.seat).padStart(2, "0")).hit).toContain(s);
    expect(findStudents(D.students, s.name).hit).toContain(s);
    expect(findStudents(D.students, "").hit).toEqual([]);
  });
});

describe("學生卡和舊版一字不差", () => {
  const D = toCoreD(demoRecords());
  D.title = "範例國中 <資源班>";
  const sb = oldCheckin(D);
  const old = (f: string) => {
    sb.run(`cardFilter=${JSON.stringify(f)};renderCards();`);
    const h = (sb.ctx.els as Record<string, { innerHTML: string }>).page.innerHTML;
    const i = h.indexOf('<div id="outArea" class="cardsheet">');
    return h.slice(i + '<div id="outArea" class="cardsheet">'.length, -"</div>".length);
  };
  for (const f of ["", String(D.students[0].cls), "g:" + D.groups[0].id, "g:沒有"])
    it("範圍「" + (f || "全部") + "」", () => {
      const a = old(f);
      expect(cardsHtml(D, f)).toBe(a);
      if (f === "") expect(a.split('class="scard"').length - 1).toBe(D.students.filter((s) => s.name).length);
    });
});

describe("導師週報", () => {
  const { D, B, att } = fixture();
  (D as Record<string, unknown>).classHead = { [String(D.students[0].cls)]: "周導師" };
  const weeks = [addDays(TODAY, -10), TODAY];
  for (const w of weeks)
    it(w + " 那一週：點名文件和舊格式算出來一樣", () => {
      const C = CORE as unknown as { weeklySummary: (...a: unknown[]) => unknown; weekStartOf(s: string): string };
      const W = weeklyOf(D, att, C.weekStartOf(w), TODAY, B);
      const W0 = C.weeklySummary(D, NX.joinAttendance(att), C.weekStartOf(w), { today: TODAY, M: B.M, slot: B.S.slot });
      expect(JSON.parse(JSON.stringify(W))).toEqual(JSON.parse(JSON.stringify(W0)));
      expect(W.classes.length).toBeGreaterThan(0);
    });
  it("缺席、還沒上、週報草稿", () => {
    const C = CORE as unknown as { weekStartOf(s: string): string };
    const W = weeklyOf(D, att, C.weekStartOf(TODAY), TODAY, B);
    const rows = W.classes.flatMap((c) => c.students.flatMap((s) => s.rows));
    expect(rows.some((r) => r.future)).toBe(true); // 明天以後
    expect(rows.some((r) => r.st === "abs")).toBe(true);
    const c = W.classes.find((x) => x.head) || W.classes[0];
    const txt = weeklyText(W, c, "資源班");
    expect(txt).toContain(c.cls + " 班");
    expect(txt.endsWith("資源班")).toBe(true);
  });
  it("已發送：存在 D.weekly（staff/legacy），可以取消", () => {
    const D2 = JSON.parse(JSON.stringify(D)) as RcData;
    setWeeklySent(D2, "2026-11-16", true);
    expect(weeklySent(D2, "2026-11-16")).toBe(true);
    setWeeklySent(D2, "2026-11-16", false);
    expect(weeklySent(D2, "2026-11-16")).toBe(false);
  });
  it("用 AI 潤飾：送出的內容沒有學生和導師的姓名，回來換回名字", () => {
    const C = CORE as unknown as { weekStartOf(s: string): string };
    const W = weeklyOf(D, att, C.weekStartOf(addDays(TODAY, -7)), TODAY, B);
    const c = W.classes.find((x) => x.head) || W.classes[0];
    const txt = weeklyText(W, c, "資源班");
    const { req, pairs } = weeklyAiRequest(D, c, txt, false);
    for (const s of D.students) if (s.name.length >= 2) expect(req.prompt).not.toContain(s.name);
    if (c.head) expect(req.prompt).not.toContain(c.head);
    expect(req.system).toContain("LINE");
    const back = weeklyAiRestore(D, req.prompt, pairs);
    for (const s of c.students) expect(back).toContain(s.name);
  });
  it("今天的待辦：這一節還沒簽到、週一提醒上週週報", () => {
    const mon = "2026-11-23";
    const ses = sessionsOn(B, mon);
    const p = ses[0].p;
    const t = checkTodos({ D, board: B, att: {}, today: mon, hm: p.start, dow: 1, sessions: ses });
    expect(t.map((x) => x.href)).toEqual(["/admin/checkin/", "/admin/checkin/?tab=weekly&w=2026-11-16"]);
    const D2 = JSON.parse(JSON.stringify(D)) as RcData;
    setWeeklySent(D2, "2026-11-16", true);
    expect(checkTodos({ D: D2, board: B, att: {}, today: mon, hm: "23:00", dow: 1, sessions: ses })).toEqual([]);
  });
});

describe("Repo.mark 第一次點名記下名單和組名、節次名稱（舊 _roster、_info）", () => {
  it("管理者點名任何一門課；那門課的老師讀得到，別的老師讀不到", async () => {
    const st = memoryStore(demoRecords());
    const admin = createMemoryRepo({ sid: "x", termId: "t", uid: "a", role: "admin" }, st);
    const D = toCoreD(st.records);
    const B = buildBoard(D);
    const s = sessionsOn(B, "2026-11-23")[0];
    await admin.mark(s.date, s.gid, s.p.id, s.sids[0], { st: "in", tin: "08:00", tout: "", note: "" });
    const a = st.records.attendance[s.aid];
    expect(a.roster).toEqual(s.sids);
    expect(a.info).toEqual({ g: s.name, p: s.p.name });
    const mine = await createMemoryRepo({ sid: "x", termId: "t", uid: "u1", role: "teacher", tid: s.teacherId }, st).load();
    expect(mine.records.attendance[s.aid]?.marks[s.sids[0]].st).toBe("in");
    const other = D.teachers.find((t) => t.role === "資源班" && t.id !== s.teacherId)!;
    const theirs = await createMemoryRepo({ sid: "x", termId: "t", uid: "u2", role: "teacher", tid: other.id }, st).load();
    expect(theirs.records.attendance[s.aid]).toBeUndefined();
  });
});
