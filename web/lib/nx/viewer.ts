/* 檢視（教務處）看得到的段考資料：只有 exam/{eid}（考程、試場、監考對照；只有老師姓名，沒有學生）。
   學生名單、服務、試場名單在 private／placements／seats，檢視讀不到（規則與 Repo 都擋）。 */
import type { ExamDoc } from "../model";
import type { ExamRoom, ExamSession } from "../types";

export interface ExamRow {
  ses: ExamSession;
  /** 這一節有排監考的試場：主監考、支援 */
  rooms: { id: string; name: string; proctor: string; support: string }[];
}

/** 考程（照段考的順序），每一節有誰監考哪一間 */
export function examRows(E: ExamDoc | null | undefined): ExamRow[] {
  if (!E) return [];
  const ses = (E.sessions || []) as ExamSession[],
    rooms = (E.rooms || []) as ExamRoom[];
  const P = E.proctorOf || {},
    S = E.supportOf || {};
  return ses.map((s) => ({
    ses: s,
    rooms: rooms
      .map((r) => ({ id: r.id, name: r.name || r.id, proctor: P[s.id + "|" + r.id] || "", support: S[s.id + "|" + r.id] || "" }))
      .filter((r) => r.proctor || r.support),
  }));
}

/** 每位監考老師的場次（老師 → 第幾節哪一間），照考程順序 */
export function proctorList(rows: ExamRow[]): { name: string; n: number; items: string[] }[] {
  const by = new Map<string, string[]>();
  rows.forEach((r) =>
    r.rooms.forEach((x) => {
      const lab = (r.ses.date || "") + " " + (r.ses.period || "") + " " + x.name;
      if (x.proctor) (by.get(x.proctor) || by.set(x.proctor, []).get(x.proctor)!).push(lab);
      if (x.support) (by.get(x.support) || by.set(x.support, []).get(x.support)!).push(lab + "（支援）");
    }),
  );
  return [...by.entries()].map(([name, items]) => ({ name, n: items.length, items })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
}
