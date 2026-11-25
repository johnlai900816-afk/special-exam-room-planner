/* eslint-disable @typescript-eslint/no-explicit-any */
/* 學生通知單（舊版 notice.html）：學校的公版，紙本一個字、一條線都不能變。
     noticeHtml：一位學生一張 A4（和 notice.html 逐字相同）
     syncNotice：從段考考場帶入日期、考科、時間、地點（notice.html 的 syncPlanner）
     NOTICE_CSS：notice.html 的 <style> 裡和紙張、列印有關的每一行，逐字複製
   test/notice.test.ts 把 notice.html 的原文放在沙盒裡跑，好幾種輸入逐字比對 HTML；CSS 一行一行比對。改這裡要一起改 notice.html。 */
import { dateKey, normDate } from "./examCore";

export interface NoticeCell {
  loc?: string;
  shade?: boolean;
  s?: string;
  e?: string;
  subj?: string;
}
export interface NoticeStudent {
  cls: string;
  seat: string;
  name: string;
  /** 手動改的格子（`${天}-${節}`） */
  c: Record<string, NoticeCell>;
  /** 排考場帶來的格子 */
  a: Record<string, NoticeCell>;
  /** 下午合併格的文字（每一天） */
  pm: Record<string, string>;
  /** 這位學生自己的注意事項；null＝用共同的 */
  notes: string | null;
  /** 對應的段考學生 id（連動） */
  pid?: string;
  plName?: string;
  demo?: boolean;
}
export interface NoticeData {
  v: number;
  link: boolean;
  head: { line1: string; line2: string; label: string; teachers: string; stampOn: boolean; stamp: string; reply?: boolean };
  days: { date: string; dow: string; pmMerge: boolean; pmText: string }[];
  amCount: number;
  periods: { n: string; d: { s: string; e: string; subj: string; pl?: number; plSubj?: string }[] }[];
  defLoc: string;
  notes: string;
  rooms: string[];
  students: NoticeStudent[];
}

const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function defaultData(): NoticeData {
  const P = (n: number, a: string[], b: string[]) => ({ n: String(n), d: [{ s: a[0], e: a[1], subj: a[2] }, { s: b[0], e: b[1], subj: b[2] }] });
  return {
    v: 1,
    link: true,
    head: { line1: "115學年度第1學期第1次段考", line2: "特殊考場通知單", label: "給副班長", teachers: "○○○老師、○○○老師", stampOn: true, stamp: "" },
    days: [
      { date: "10月14日", dow: "三", pmMerge: false, pmText: "" },
      { date: "10月15日", dow: "四", pmMerge: true, pmText: "服務學習(回原班)" },
    ],
    amCount: 4,
    periods: [
      P(1, ["08:20", "09:05", "作文"], ["08:20", "09:05", "自習"]),
      P(2, ["09:15", "10:00", "數學"], ["09:15", "10:00", "國文"]),
      P(3, ["10:10", "10:55", "自習"], ["10:10", "10:55", "自習"]),
      P(4, ["11:05", "11:50", "英文"], ["11:05", "11:55", "生物(七)/理化(八九)"]),
      P(5, ["13:10", "13:55", "地科(九)/自習(七八)"], ["", "", ""]),
      P(6, ["14:05", "14:50", "自習"], ["", "", ""]),
      P(7, ["15:10", "15:55", "社會"], ["", "", ""]),
    ],
    defLoc: "原班",
    notes: "考試兩天都要帶[[通知單]]來考試。\n檢查文具(黑筆、2B鉛筆、立可帶、橡皮擦)是否帶齊。",
    rooms: ["原班", "環教中心", "學習中心一", "學習中心二", "學習中心三", "學習中心四", "技藝大樓電腦教室/(特教辦公室集合)", "特教辦公室", "綠光教室"],
    students: [
      {
        demo: true,
        cls: "901",
        seat: "01",
        name: "王小明",
        c: {
          "0-0": { loc: "環教中心", shade: true, s: "08:00" },
          "0-1": { loc: "環教中心", shade: true, e: "10:20" },
          "0-3": { loc: "環教中心", shade: true, s: "10:45" },
          "0-6": { loc: "環教中心", shade: true, s: "14:50" },
          "1-1": { loc: "環教中心", shade: true, e: "10:20" },
          "1-3": { loc: "環教中心", shade: true, s: "10:45" },
        },
        notes: "考試兩天都要帶[[通知單]]來考試。\n星期三第6節要帶==課本==來學習中心自習==(14：50考試)==\n檢查文具(黑筆、2B鉛筆、立可帶、橡皮擦)是否帶齊。",
      } as NoticeStudent,
      {
        demo: true,
        cls: "903",
        seat: "04",
        name: "張小安",
        c: { "0-0": { loc: "技藝大樓電腦教室/(特教辦公室集合)", shade: true }, "1-1": { loc: "技藝大樓電腦教室/(特教辦公室集合)", shade: true } },
        notes: "星期三作文：__7：50__先到特教辦公室集合。\n星期四國文：__9：00__先到特教辦公室集合。\n檢查文具(黑筆、2B鉛筆、立可帶、橡皮擦)是否帶齊。",
      } as NoticeStudent,
      {
        demo: true,
        cls: "802",
        seat: "06",
        name: "黃小傑",
        c: { "0-0": { loc: "學習中心三" }, "0-1": { loc: "學習中心三" }, "0-3": { loc: "學習中心二" }, "0-6": { loc: "學習中心二" }, "1-1": { loc: "學習中心三" }, "1-3": { loc: "學習中心二" } },
        notes: null,
      } as NoticeStudent,
    ],
  };
}
export function normalize(o: any): NoticeData {
  const d = defaultData();
  o.head = Object.assign(d.head, o.head || {});
  o.days = o.days && o.days.length === 2 ? o.days : d.days;
  o.periods = o.periods || d.periods;
  o.amCount = o.amCount || 4;
  o.periods.forEach((p: any) => {
    p.d = p.d || [{}, {}];
    p.d.forEach((x: any) => {
      x.s = x.s || "";
      x.e = x.e || "";
      x.subj = x.subj || "";
    });
  });
  if (o.defLoc == null) o.defLoc = d.defLoc;
  if (o.notes == null) o.notes = d.notes;
  o.rooms = o.rooms || d.rooms;
  o.students = o.students || [];
  if (o.link === undefined) o.link = true;
  o.students.forEach((s: any) => {
    s.c = s.c || {};
    s.a = s.a || {};
    s.pm = s.pm || {};
    if (s.notes === undefined) s.notes = null;
  });
  return o;
}
const hm = (s: unknown) => {
  const a = String(s || "").split(/[:：]/);
  return +a[0] * 60 + (+a[1] || 0);
};
const fmt = (m: number) => String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
export const stuId = (s: { cls?: string; seat?: string; name?: string }) => (s.cls || "") + (s.seat ? "-" + s.seat : "") + (s.name || "");

/* ---------- 通知單 HTML ---------- */
// 標記：__底線__  [[外框]]  ==灰底==
function mark(s: string): string {
  return esc(s)
    .replace(/__(.+?)__/g, "<u>$1</u>")
    .replace(/\[\[(.+?)\]\]/g, '<span class="bx">$1</span>')
    .replace(/==(.+?)==/g, '<span class="sh">$1</span>');
}
function lines2(text: unknown, shade?: boolean): string {
  // 單行 14pt；多行：第一行 12pt、其餘 9pt
  const a = String(text || "")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  if (a.length <= 1) return shade && a[0] ? '<span class="sh">' + esc(a[0]) + "</span>" : esc(a[0] || "");
  return a.map((x, i) => '<span class="' + (i ? "s" : "m") + '">' + esc(x) + "</span>").join("<br>");
}
function locHtml(text: unknown, shade?: boolean): string {
  // 單行 14pt；多行全部 12pt，灰底只加在第一行
  const a = String(text || "")
    .split("/")
    .map((x) => x.trim())
    .filter((x) => x !== "");
  if (!a.length) return "";
  const f = shade ? '<span class="sh">' + esc(a[0]) + "</span>" : esc(a[0]);
  if (a.length === 1) return f;
  return '<span class="m">' + f + a.slice(1).map((x) => "<br>" + esc(x)).join("") + "</span>";
}
function timeHtml(std: { s: string; e: string }, c: NoticeCell): string {
  const s = (c && c.s) || std.s,
    e = (c && c.e) || std.e;
  if (!s && !e) return "";
  const cs = s !== std.s,
    ce = e !== std.e;
  const a = cs ? '<span class="bx' + (hm(s) < hm(std.s) ? " sh" : "") + '">' + esc(s) + "</span>" : "<span>" + esc(s) + "</span>";
  const b = ce ? '<span class="bx">' + esc(e) + "</span>" : "<span>" + esc(e) + "</span>";
  return '<div class="tm">' + a + "<br>" + b + "</div>";
}
export const cellOf = (stu: NoticeStudent, k: string): NoticeCell => Object.assign({}, stu.a[k], stu.c[k]);
function dayCells(D: NoticeData, stu: NoticeStudent, d: number, i: number): string {
  const std = D.periods[i].d[d],
    c = cellOf(stu, d + "-" + i);
  const subj = c.subj || std.subj;
  const loc = c.loc || (subj || std.s ? D.defLoc : "");
  return "<td>" + esc(D.periods[i].n) + "</td><td>" + timeHtml(std, c) + "</td><td>" + lines2(subj) + "</td><td>" + locHtml(loc, c.shade) + "</td>";
}
export function noticeHtml(D: NoticeData, stu: NoticeStudent): string {
  const H = D.head,
    id = esc(stuId(stu)),
    np = D.periods.length,
    am = Math.min(D.amCount, np),
    pm = np - am;
  const stampSrc = H.stamp || "stamp.png";
  let h = '<div class="page">';
  if (H.label) h += '<div class="label"><span class="sh">' + esc(H.label) + "</span></div>";
  h += '<p class="t1">' + esc(H.line1) + '</p><p class="t2">' + esc(H.line2) + "</p>";
  h += '<p class="who"><u>' + id + "</u>：</p>";
  h +=
    '<p class="intro">' +
    (H.stampOn ? '<img class="stamp" src="' + esc(stampSrc) + '" alt="">' : "") +
    '請詳細閱讀通知單下方的<span class="big">【注意】</span>事項，同時<span class="dbl">注意考試地點和時間</span>，不要遲到，如有疑問，請找學習中心導師：' +
    esc(H.teachers) +
    "。</p>";
  h += '<div class="gap1"></div><div class="gap2"></div>';
  h +=
    '<table class="nt"><colgroup><col style="width:9.84mm"><col style="width:9.93mm"><col style="width:19.86mm"><col style="width:20.28mm"><col style="width:39.93mm"><col style="width:10mm"><col style="width:19.79mm"><col style="width:20.28mm"><col style="width:38.93mm"></colgroup>';
  h += '<tr><td class="name" colspan="9">學生姓名：<u>' + id + "</u></td></tr>";
  h += '<tr class="date"><td></td>' + D.days.map((x) => '<td colspan="4">' + esc(x.date) + (x.dow ? "（星期" + esc(x.dow) + "）" : "") + "</td>").join("") + "</tr>";
  const hd = "<td>節次</td><td>時間</td><td>科目</td><td>考試<br>地點</td>";
  const block = (from: number, n: number, name: string) => {
    let r = "";
    for (let k = 0; k < n; k++) {
      const i = from + k;
      r += '<tr class="pr">';
      if (k === 0) r += '<td rowspan="' + (n + (from === 0 ? 1 : 0)) + '">' + name + "</td>";
      for (let d = 0; d < 2; d++) {
        if (from > 0 && D.days[d].pmMerge) {
          r += "<td>" + esc(D.periods[i].n) + "</td>";
          if (k === 0) r += '<td colspan="3" rowspan="' + n + '">' + esc(stu.pm[d] != null && stu.pm[d] !== "" ? (stu.pm[d] === "-" ? "" : stu.pm[d]) : D.days[d].pmText) + "</td>";
        } else r += dayCells(D, stu, d, i);
      }
      r += "</tr>";
    }
    return r;
  };
  h += '<tr class="hd"><td rowspan="' + (am + 1) + '">上午</td>' + hd + hd + "</tr>";
  h += block(0, am, "").replace(/<td rowspan="\d+"><\/td>/, "");
  if (pm > 0) {
    h += '<tr class="noon"><td colspan="9">午休時間</td></tr>' + block(am, pm, "下午");
  }
  h += "</table>";
  const notes = String(stu.notes != null ? stu.notes : D.notes)
    .split("\n")
    .map((x) => x.trim())
    .filter((x) => x);
  h +=
    '<div class="notes">' +
    notes.map((t, i) => (i === 0 ? '<p style="margin-left:.5mm">注意：1、' + mark(t) + "</p>" : '<p class="n2">' + (i + 1) + "、" + mark(t) + "</p>")).join("") +
    "</div>";
  return h + "</div>";
}

/* ---------- 與段考考場連動（舊版 syncPlanner；P＝段考考場的整份資料，要有 assign） ---------- */
const GN: Record<number, string> = { 7: "七", 8: "八", 9: "九" };
export interface SyncResult {
  ok: boolean;
  seen: number;
  add: number;
  gone: number;
  /** 段考有幾天（> 2 只帶入前兩天） */
  days: number;
  /** 目前選的學生在新名單裡的位置 */
  cur: number;
}
export function syncNotice(D: NoticeData, P: any, cur = 0): SyncResult {
  const fail: SyncResult = { ok: false, seen: 0, add: 0, gone: 0, days: 0, cur };
  if (!P || !P.students || !P.sessions || !P.rooms) return fail;
  const me = D.students[cur];
  const tm = String(P.title || "").match(/(\d+)\s*學年度\s*第\s*(\d)\s*學期.*?第\s*(\d)\s*次段考/);
  if (tm) D.head.line1 = tm[1] + "學年度第" + tm[2] + "學期第" + tm[3] + "次段考";
  // 日期統一寫法後再排序：「12/01」和「12/1」算同一天，先考的放第一天
  const ndate = (s: any) => normDate(s.date);
  const dates = [...new Set<string>(P.sessions.map(ndate))].sort((a, b) => dateKey(a) - dateKey(b));
  const pidx = (s: any) => {
    const m = String(s.period).match(/\d+/);
    return m ? D.periods.findIndex((p) => String(p.n) === m[0]) : -1;
  };
  dates.slice(0, 2).forEach((dt, d) => {
    const s = P.sessions.find((x: any) => ndate(x) === dt),
      m = String(dt).match(/(\d+)\D+(\d+)$/);
    D.days[d].date = m ? +m[1] + "月" + +m[2] + "日" : dt;
    if (s.dow) D.days[d].dow = s.dow;
  });
  // 考科與時間：排列機有的節次以排列機為準；上次帶入、這次已不存在的改回自習
  const allG = [...new Set<number>([].concat(...P.sessions.map((s: any) => s.grades || [])))].sort();
  if (!D.periods.some((p) => p.d.some((x) => x.pl)))
    D.periods.forEach((p) =>
      p.d.forEach((x) => {
        if (x.s) x.subj = "自習";
      }),
    ); // 第一次連動：先清掉範例考科
  D.periods.forEach((p) =>
    p.d.forEach((x) => {
      if (x.pl) x.pl = 2;
    }),
  );
  P.sessions.forEach((s: any) => {
    const d = dates.indexOf(ndate(s)),
      i = pidx(s);
    if (d < 0 || d > 1 || i < 0 || s.makeup) return;
    if (i >= D.amCount) D.days[d].pmMerge = false;
    const x = D.periods[i].d[d],
      g: number[] = s.grades || [],
      rest = allG.filter((y) => !g.includes(y));
    x.s = fmt(hm(s.start));
    x.e = fmt(hm(s.end));
    x.pl = 1;
    const ns =
      g.length && rest.length ? s.subject + "(" + g.map((y) => GN[y] || y).join("") + ")/自習(" + rest.map((y) => GN[y] || y).join("") + ")" : s.subject;
    if (x.plSubj === undefined || x.subj === x.plSubj) x.subj = ns; // 在「考試設定」改過科目寫法的，保留你的寫法
    x.plSubj = ns;
  });
  D.periods.forEach((p) =>
    p.d.forEach((x) => {
      if (x.pl === 2) {
        delete x.pl;
        delete x.plSubj;
        x.subj = "自習";
      }
    }),
  );
  // 沒排考試、但那天下午沒合併的節次補上時間與「自習」
  D.periods.forEach((p, i) =>
    p.d.forEach((x, d) => {
      if (i >= D.amCount && !D.days[d].pmMerge && !x.s) {
        const o = p.d[1 - d];
        x.s = o.s;
        x.e = o.e;
        if (!x.subj) x.subj = "自習";
      }
    }),
  );
  // 學生
  const sesById: Record<string, any> = {},
    roomById: Record<string, any> = {};
  P.sessions.forEach((s: any) => (sesById[s.id] = s));
  P.rooms.forEach((r: any) => {
    roomById[r.id] = r;
    if (r.name && !D.rooms.includes(r.name)) D.rooms.push(r.name);
  });
  D.students = D.students.filter((s) => !s.demo);
  const seen = new Set<NoticeStudent>();
  let add = 0,
    gone = 0;
  const sameName = (a: string, b: string) => a && b && (a === b || a.endsWith(b) || b.endsWith(a));
  const waitR = P.rooms.find((r: any) => r.type === "wait"),
    gOf = (c: unknown) => parseInt(String(c || "").trim()[0], 10) || 0;
  P.students.forEach((ps: any) => {
    if (ps.on === false) return;
    const cells: Record<string, NoticeCell> = {},
      waits: { subj: string; s: any }[] = [];
    for (const k in P.assign || {}) {
      const sep = k.lastIndexOf("|");
      if (k.slice(0, sep) !== ps.id) continue;
      // 排列機的鍵是「學生|科目」；同一科分兩節考時是「學生|科目@節次代號」，科目要把 @ 後面拿掉
      const subj = k.slice(sep + 1).replace(/@.*$/, ""),
        a = P.assign[k],
        s = sesById[a.ses],
        r = roomById[a.room];
      if (!s || !r) continue;
      if (s.makeup) waits.push({ subj, s });
      const d = dates.indexOf(ndate(s)),
        i = pidx(s);
      if (d < 0 || d > 1 || i < 0) continue;
      const has = (v: string) => {
        const sc = ps.sv && ps.sv[v];
        return sc === "*" || (Array.isArray(sc) && sc.includes(subj));
      };
      const c: NoticeCell = { loc: r.name },
        e = +s.extMin || 0;
      if (has("ext") || has("pc")) c.shade = true;
      if (has("ext") && e) {
        if (s.extMode === "before") c.s = fmt(hm(s.start) - e);
        else c.e = fmt(hm(s.end) + e);
      }
      if (s.makeup) c.subj = subj + "(補考)";
      cells[d + "-" + i] = c;
    }
    // 改到補考節的學生：正考那一節要待在自習等候教室（以前會印成「原班」，學生會走錯地方）
    waits.forEach((w) => {
      const g = gOf(ps.cls);
      P.sessions
        .filter((x: any) => x.subject === w.subj && !x.makeup && (!g || (x.grades || []).includes(g)))
        .forEach((x: any) => {
          const d = dates.indexOf(ndate(x)),
            i = pidx(x);
          if (d < 0 || d > 1 || i < 0 || cells[d + "-" + i]) return;
          cells[d + "-" + i] = { loc: waitR ? waitR.name : "自習等候教室", subj: "自習/(" + w.subj + "改補考)", shade: true };
        });
    });
    if (!Object.keys(cells).length) return;
    let st =
      D.students.find((x) => x.pid === ps.id && !seen.has(x)) ||
      D.students.find((x) => !x.pid && !seen.has(x) && String(x.cls) === String(ps.cls) && (!x.seat || !ps.seat || +x.seat === +ps.seat) && sameName(x.name, ps.name));
    if (st) {
      if (st.pid && st.name === st.plName) st.name = ps.name || "";
      st.cls = ps.cls || st.cls;
      st.seat = ps.seat || st.seat;
    } else {
      st = { cls: ps.cls || "", seat: ps.seat || "", name: ps.name || "", a: {}, c: {}, pm: {}, notes: null };
      D.students.push(st);
      add++;
    }
    st.pid = ps.id;
    st.plName = ps.name || "";
    st.a = cells;
    seen.add(st);
  });
  // 排列機已經沒有的學生：沒手動改過就移除，有改過就留下來變成手動學生
  D.students = D.students.filter((s) => {
    if (!s.pid || seen.has(s)) return true;
    if (Object.keys(s.c).length || s.notes != null) {
      delete s.pid;
      delete s.plName;
      s.a = {};
      return true;
    }
    gone++;
    return false;
  });
  D.students.sort(
    (x, y) =>
      String(x.cls).localeCompare(String(y.cls), "zh-Hant", { numeric: true }) || String(x.seat).localeCompare(String(y.seat), "zh-Hant", { numeric: true }),
  );
  return { ok: true, seen: seen.size, add, gone, days: dates.length, cur: Math.max(0, D.students.indexOf(me as NoticeStudent)) };
}

/* ---------- 紙張與列印的樣式：notice.html 的 <style> 逐行複製（不改任何一個字） ---------- */
export const NOTICE_CSS = [
  "/* ---------- 通知單本體（尺寸照原 Word 檔：A4、邊界 1.27cm、標楷體） ---------- */",
  ".page{width:210mm;height:296.8mm;box-sizing:border-box;padding:12.7mm;position:relative;overflow:hidden;background:#fff;color:#000;",
  '  font-family:"Times New Roman","標楷體","DFKai-SB","BiauKaiTC","BiauKai","Kaiti TC","AR PL UKai TW",serif;font-size:12pt;line-height:18pt;',
  "  -webkit-print-color-adjust:exact;print-color-adjust:exact;font-kerning:none;text-autospace:normal}",
  ".page p{margin:0}",
  ".page .t1,.page .t2{text-align:center;font-weight:bold;font-size:18pt;line-height:36pt}",
  ".page .t1{margin-bottom:9pt}",
  ".page .label{position:absolute;left:15.9mm;top:5.7mm;width:43.2mm;height:16.7mm;box-sizing:border-box;border:.5pt solid #000;background:#fff;",
  '  padding:1.27mm 2.54mm;font-family:"Times New Roman","新細明體","PMingLiU","Songti TC",serif;font-weight:bold;font-size:26pt;line-height:36pt;white-space:nowrap;overflow:hidden;text-align:left}',
  ".page .who{font-weight:bold;font-size:18pt;line-height:36pt}",
  ".page .who u{text-decoration-thickness:1pt;text-underline-offset:2pt}",
  ".page .intro{font-size:16pt;line-height:36pt;text-indent:8.6mm;position:relative}",
  ".page .intro .big{font-size:20pt}",
  ".page .intro .dbl{font-weight:bold;text-decoration:underline double;text-decoration-thickness:.75pt;text-underline-offset:2.5pt}",
  ".page .stamp{position:absolute;left:135.2mm;top:21.2mm;width:49.7mm;height:35.4mm;z-index:2;pointer-events:none}",
  ".page .gap1{height:30pt}.page .gap2{height:18pt}",
  ".page table.nt{border-collapse:collapse;table-layout:fixed;width:188.84mm;margin-left:-2.17mm;font-weight:bold;font-size:14pt;line-height:17.4pt}",
  ".page table.nt td{border:.5pt solid #000;padding:0 1.9mm;text-align:center;vertical-align:middle;word-break:break-all;overflow:hidden}",
  ".page table.nt td.name{background:#e6e6e6;text-align:left;font-size:16pt;line-height:20pt;height:38pt;padding:0 2.4mm}",
  ".page table.nt td.name u{font-size:14pt;text-underline-offset:2pt}",
  ".page table.nt tr.date td{height:30.9pt}",
  ".page table.nt tr.hd td,.page table.nt tr.pr td{height:35.7pt}",
  ".page table.nt tr.noon td{height:29.7pt}",
  ".page .m{font-size:12pt}.page .s{font-size:9pt}",
  ".page .sh{background:#d9d9d9}",
  ".page .bx{border:.5pt solid #000}",
  ".page .tm .bx{padding:0 .3mm}",
  ".page .notes{font-weight:bold;font-size:14pt;line-height:30pt;white-space:pre-wrap}",
  ".page .notes p.n2{text-indent:15mm;margin-bottom:9pt}",
  ".page .notes u{text-underline-offset:2pt}",
  ".page .notes .bx{padding:1pt 0}",
  // 頁面（操作介面）的共同設定：紙張外面的東西，印出來時只剩 #print
  ':root{--bg:#f7f5f1;--card:#ffffff;--sunk:#efece6;--line:#e7e3db;--line2:#d6d0c5;--ink:#1f2430;--ink2:#4a5060;--mute:#6b6f7a;--red:#b8423a;--blue:#2f5c8a;--blue-l:#e9eff6;',
  "  --ok:#2f7a5b;--ok-l:#e6f2ec;--warn:#9a5b0b;--warn-l:#fbf0dc;--bad:#b3382d;--bad-l:#fbe8e5;--focus:#2f5c8a;--on-ink:#ffffff;",
  "  --lift:0 1px 3px rgba(31,36,48,.1);--pop:0 12px 36px rgba(31,36,48,.16);--backdrop:rgba(31,36,48,.38);--sheet:0 1px 3px rgba(31,36,48,.12),0 8px 24px rgba(31,36,48,.06);",
  '  --sans:"Noto Sans TC",system-ui,-apple-system,"Segoe UI","Microsoft JhengHei",sans-serif;color-scheme:light}',
  "*{box-sizing:border-box}",
  "html,body{height:100%}",
  "body{margin:0;font-family:var(--sans);font-size:15px;line-height:1.55;color:var(--ink);background:var(--bg);-webkit-font-smoothing:antialiased}",
  "#pv{flex:1;overflow:auto;padding:24px;min-height:0}",
  "#pv .page{margin:0 auto 20px;box-shadow:var(--sheet)}",
  "#print{display:none}",
  "@page{size:A4;margin:0}",
  "@media print{",
  "  html,body{height:auto;background:#fff}",
  "  #app,#toast,dialog{display:none!important}",
  "  #print{display:block}",
  "  #print .page{break-after:page;page-break-after:always}",
  "  #print .page:last-child{break-after:auto;page-break-after:auto}",
  "}",
].join("\n");

/** 一份完整的通知單文件（預覽＋列印用；放在 iframe 裡，樣式和 notice.html 一樣、不受外面頁面影響）。
    base＝stamp.png 所在的網址（印章圖的相對路徑和舊版一樣是 stamp.png） */
export function noticeDoc(D: NoticeData, preview: NoticeStudent[], print: NoticeStudent[], base: string): string {
  return (
    '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8"><base href="' +
    esc(base) +
    '"><title>學生通知單</title><style>' +
    NOTICE_CSS +
    '</style></head><body><div id="app"><div id="pv">' +
    preview.map((s) => noticeHtml(D, s)).join("") +
    '</div></div><div id="print">' +
    print.map((s) => noticeHtml(D, s)).join("") +
    "</div></body></html>"
  );
}
