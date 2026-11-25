/* 段考監考：exam.html 的資料用「老師姓名」記監考（proctorOf / supportOf 的鍵是 `${場次 id}|${試場 id}`），
   沒有 teacher id，所以用姓名對名冊。名冊姓名常帶「（國）」這類註記，比對時去掉括號再比。 */
import type { ExamData, Teacher } from "./types";

export interface Duty {
  key: string;
  kind: "監考" | "支援";
  date: string;
  dow: string;
  period: string;
  subject: string;
  start: string;
  end: string;
  room: string;
}

const bare = (n: string) =>
  String(n || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\s+/g, "")
    .trim();

export function sameTeacher(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  return bare(a) !== "" && bare(a) === bare(b);
}

export function dutiesOf(exam: ExamData | null, t: Teacher | null): Duty[] {
  if (!exam || !t) return [];
  const sess = new Map((exam.sessions || []).map((s) => [s.id, s]));
  const rooms = new Map((exam.rooms || []).map((r) => [r.id, r]));
  const out: Duty[] = [];
  const scan = (map: Record<string, string> | undefined, kind: Duty["kind"]) => {
    for (const [key, name] of Object.entries(map || {})) {
      if (!sameTeacher(name, t.name)) continue;
      const [sid, rid] = key.split("|");
      const s = sess.get(sid);
      if (!s) continue;
      out.push({
        key: kind + key,
        kind,
        date: s.date,
        dow: s.dow,
        period: s.period,
        subject: s.subject,
        start: s.start,
        end: s.end,
        room: rooms.get(rid)?.name || rid,
      });
    }
  };
  scan(exam.proctorOf, "監考");
  scan(exam.supportOf, "支援");
  const order = (exam.sessions || []).map((s) => s.id);
  return out.sort((a, b) => order.indexOf(a.key.slice(2).split("|")[0]) - order.indexOf(b.key.slice(2).split("|")[0]));
}
