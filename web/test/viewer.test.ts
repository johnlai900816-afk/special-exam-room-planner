/* 檢視（教務處，lib/nx/viewer.ts＋記憶體版 Repo 的 viewer 視角）：
     讀不到學生、private、點名、IEP、版本、段考名單；總課表和管理者看到的一字不差；考程與監考只用 exam/main。 */
import { describe, expect, it } from "vitest";
import { demoAdminRepo, demoViewerRepo } from "../lib/nx/demo";
import { outBoard, outHtml } from "../lib/nx/schedOut";
import { examRows, proctorList } from "../lib/nx/viewer";
import { RepoDeniedError, revKey, toCoreD } from "../lib/repo";

describe("檢視的資料", () => {
  it("範例資料的檢視視角：沒有學生資料；總課表和管理者一樣", async () => {
    const A = await demoAdminRepo().load(),
      V = await demoViewerRepo().load();
    expect(Object.keys(A.records.students).length).toBeGreaterThan(3);
    (["students", "privates", "attendance", "iep", "iepInvite", "versions", "lockLog", "staff", "examPrivate", "examPlace", "examSeat"] as const).forEach((c) =>
      expect(Object.keys(V.records[c] || {})).toEqual([]),
    );
    expect(Object.keys(V.records.groups)).toEqual(Object.keys(A.records.groups));
    const now = new Date(2026, 10, 26);
    const html = (R: typeof A.records) => {
      const D = toCoreD(R),
        b = outBoard(D);
      return outHtml(D, b.M, b.S, b.ROOM, "master", { now });
    };
    expect(html(A.records)).toBeTruthy();
    expect(html(V.records)).toBe(html(A.records));
    expect(JSON.stringify(V.records)).not.toMatch(new RegExp(Object.values(A.records.students)[0].name));
  });
  it("範例資料的檢視視角不能寫", async () => {
    const r = demoViewerRepo(),
      V = await r.load();
    const gid = Object.keys(V.records.groups)[0];
    await expect(r.put("groups", gid, { ...V.records.groups[gid], name: "改" }, V.revs[revKey("groups", gid)].rev)).rejects.toBeInstanceOf(RepoDeniedError);
  });
  it("考程與監考：每一節有誰監考哪一間；每位老師的場次", () => {
    const rows = examRows({
      sessions: [
        { id: "a", date: "11/26", dow: "三", period: "第一節", subject: "國文", start: "08:20", end: "09:05" },
        { id: "b", date: "11/26", dow: "三", period: "第二節", subject: "數學", start: "09:15", end: "10:00" },
      ],
      rooms: [
        { id: "A", name: "資源A" },
        { id: "B", name: "資源B" },
      ],
      proctorOf: { "a|A": "王老師", "b|A": "王老師", "b|B": "林老師" },
      supportOf: { "a|A": "林老師" },
    });
    expect(rows.map((r) => r.rooms.map((x) => x.name + x.proctor + x.support))).toEqual([["資源A王老師林老師"], ["資源A王老師", "資源B林老師"]]);
    expect(proctorList(rows)).toEqual([
      { name: "王老師", n: 2, items: ["11/26 第一節 資源A", "11/26 第二節 資源A"] },
      { name: "林老師", n: 2, items: ["11/26 第一節 資源A（支援）", "11/26 第二節 資源B"] },
    ]);
    expect(examRows(null)).toEqual([]);
  });
});
