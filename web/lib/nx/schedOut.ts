/* eslint-disable @typescript-eslint/no-explicit-any */
/* 課表輸出（舊版 app.js renderOut 的 #outArea 內容），逐字照搬：同樣的 HTML、同樣的 class，
   樣式是 components/sched/out.css（從 repo 根目錄 app.css 逐字複製的輸出與列印規則）。
   test/sched-out.test.ts 把舊版 app.js 的 renderOut 放在沙盒裡跑，和這裡的結果逐字比對。
   內容裡的資料一律經過 esc()（和舊版同一個），所以畫面可以直接放進 dangerouslySetInnerHTML。 */
import { CORE, type Model, type SolveState } from "../core";
import type { RcData, Student } from "../types";
import { sortStu, stuLabel, X } from "./sched";

export type OutMode = "master" | "teacher" | "lock" | "lockraw" | "homeroom" | "regular" | "card" | "student" | "cm" | "group";
export const OUT_MODES: [OutMode, string][] = [
  ["master", "總課表"],
  ["teacher", "資源班老師課表"],
  ["lock", "給教務處的鎖課表"],
  ["lockraw", "鎖課清單（教務處格式）"],
  ["homeroom", "給導師的班級抽離表"],
  ["regular", "給任課老師的抽離名單"],
  ["card", "學生個人課表"],
  ["student", "學生抽離一覽"],
  ["cm", "個管個案一覽"],
  ["group", "組別總表"],
];
export const OUT_GROUPS: [string, OutMode[]][] = [
  ["課表", ["master", "teacher", "card"]],
  ["給教務處", ["lock", "lockraw"]],
  ["給老師", ["homeroom", "regular", "cm"]],
  ["一覽", ["student", "group"]],
];

export const esc = (s: unknown) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const LOCKN: Record<string, string> = { 國文: "國語文", 英文: "英語文" };
const TCOL = ["#b4541a", "#b02a2a", "#7a4a22", "#5a3a8c", "#2a2620", "#1f7fa8", "#a83a86", "#6f6556", "#2f6a3a", "#2f47a8", "#1f7a70", "#8a6a10"];
const SUBC: Record<string, string[]> = {
  "": ["#eef5ee", "#5aa06f", "#22603a"],
  國: ["#fdecec", "#e86a6a", "#a11d1d"],
  數: ["#eaf1fa", "#6a9ad8", "#234a94"],
  英: ["#fdf7dc", "#c99a1a", "#8a5a00"],
  社: ["#f3ecfa", "#9a6fd0", "#4b2a8c"],
};
const DAYS = CORE.DAYS;
const gradeOfCls = CORE.gradeOfCls;
function shortName(g: { name?: string; subject?: string }) {
  const n = String(g.name || ""),
    j = String(g.subject || "");
  return j && n.length > j.length && n.endsWith(j) ? n.slice(0, -j.length) : j && n.length > j.length && n.startsWith(j) ? n.slice(j.length) : n;
}
const thead = (cells: string[], cls?: string) => `<thead><tr>${cells.map((c) => `<th${cls ? ` class="${cls}"` : ""}>${c}</th>`).join("")}</tr></thead>`;
const signLine = (x?: string) => `<p class="sign">製表：＿＿＿＿＿＿　日期：＿＿＿＿＿＿${x || ""}</p>`;
export function printDate(now: Date): string {
  const d = now;
  return d.getFullYear() - 1911 + "." + String(d.getMonth() + 1).padStart(2, "0") + "." + String(d.getDate()).padStart(2, "0");
}
const tCall = (n: string) => (n && !/(老師|主任|組長|校長)/.test(n) ? n + "老師" : n);

export interface OutOpt {
  /** 學生個人課表：只印這個年級（''＝全部） */
  outG?: string;
  /** 印的日期（鎖課表、鎖課清單的標題） */
  now?: Date;
}

/** #outArea 的內容（舊版 renderOut 的 b）；沒有排任何一節時回傳 null（畫面顯示「還沒有課表」） */
export function outHtml(D: RcData, M: Model, ST: SolveState, ROOM: Int16Array, outMode: OutMode, opt: OutOpt = {}): string | null {
  const m = M as any;
  const outG = opt.outG || "";
  const now = opt.now || new Date();
  const placed = [...ST.slot].filter((s) => s >= 0).length;
  if (!placed) return null;
  const tName = (t: number) => (t >= 0 && M.T[t] ? M.T[t].name : "");
  const slotsText = (list: number[]) => {
    const by: Record<number, string[]> = {};
    list.forEach((s) => {
      const d = Math.floor(s / M.NP);
      (by[d] = by[d] || []).push(M.P[s % M.NP].name);
    });
    return Object.keys(by)
      .sort()
      .map((d) => "週" + DAYS[+d] + " " + by[+d].join("、"))
      .join("；");
  };
  const locksNow = () => {
    if (M.flex)
      return X.assignLocks(M, ST.slot).locks.map((k: any) => ({ cls: k.cls, s: k.s, sj: k.sj, t: k.t, groups: k.groups, extra: k.extra }));
    const mm = new Map<string, any>();
    M.L.forEach((x, l) => {
      const s = ST.slot[l],
        g = M.G[x.g];
      if (s < 0 || !g.need) return;
      g.locks.forEach((k) => {
        const key = k.cls + "|" + s;
        let o = mm.get(key);
        if (!o) mm.set(key, (o = { cls: k.cls, s, sj: g.subject, t: k.t, groups: [], extra: false }));
        if (!o.groups.includes(g.name)) o.groups.push(g.name);
      });
    });
    return [...mm.values()];
  };
  const tShort = () => {
    const o: Record<number, string> = {},
      nm = (t: number) => X.normName(M.T[t].name).replace(/（.*?）|\(.*?\)/g, ""),
      rts = m.rts as number[],
      sur = rts.map((t) => nm(t).slice(0, 1));
    rts.forEach((t, i) => {
      o[t] = sur.filter((x) => x === sur[i]).length > 1 ? nm(t) : sur[i];
    });
    return o;
  };

  const T = esc(D.title || "資源班"),
    dt = D.settings.dates ? `<p class="dt">實施日期：${esc(D.settings.dates)}</p>` : "";
  let b = "";
  const cmName = (s: Student) => {
    const t = D.teachers.find((x) => x.id === s.caseMgr);
    return t ? t.name : "";
  };
  const roomOf = (l: number) => (ROOM[l] >= 0 && D.rooms[ROOM[l]] ? D.rooms[ROOM[l]].name : "");
  if (outMode === "master") {
    const names = D.rooms.map((r) => String(r.name || "")),
      uq = (a: string[]) => new Set(a).size === a.length,
      la = names.map((n) => n.slice(-1)),
      fa = names.map((n) => n.slice(0, 1)),
      rn = names.every((n) => n.length <= 2) ? names : uq(la) ? la : uq(fa) ? fa : names;
    const cols = D.rooms.map((r, i) => ({ i, n: rn[i] })).concat(M.L.some((x, l) => ST.slot[l] >= 0 && ROOM[l] < 0) ? [{ i: -1, n: "其他" }] : []),
      at: Record<string, number[]> = {};
    M.L.forEach((x, l) => {
      const sl = ST.slot[l];
      if (sl >= 0) {
        const k = sl + "|" + ROOM[l];
        (at[k] = at[k] || []).push(l);
      }
    });
    const rts = m.rts as number[];
    const ti = (t: number) => Math.max(0, rts.indexOf(t)) % 12,
      tc = (t: number) => TCOL[ti(t) % TCOL.length],
      sh = tShort();
    b =
      `<style>@page{size:A4 landscape;margin:10mm}</style><div class="pg master">${dt}<h2>${T} 課表</h2><p class="lg">教師：${rts.map((t) => `<b class="t${ti(t)}" style="color:${tc(t)}">${esc(M.T[t].name)}（${esc(sh[t])}）</b>`).join("、")}</p>
      <table class="out mt"><thead><tr><th rowspan="2"></th>${DAYS.map((d) => `<th colspan="${cols.length}" class="dl">星期${d}</th>`).join("")}</tr><tr>${DAYS.map(() => cols.map((c, k) => `<th class="${k ? "" : "dl"}">${esc(c.n)}</th>`).join("")).join("")}</tr></thead>` +
      D.periods
        .map(
          (p, pi) =>
            `<tr><th>${esc(String(p.name).replace(/^第\s*(\S+?)\s*節$/, "$1"))}</th>` +
            DAYS.map((d, di) =>
              cols
                .map(
                  (c, k) =>
                    `<td class="${k ? "" : "dl"}">${(at[di * M.NP + pi + "|" + c.i] || [])
                      .map((l) => {
                        const g = M.G[M.L[l].g];
                        return `<span class="t${ti(g.t)}" style="color:${tc(g.t)}"><b>${esc(String(g.subject).slice(0, 1))}</b><br>${esc(shortName(g.ref))}${g.t >= 0 ? `<br><small>${esc(sh[g.t] || "")}</small>` : ""}</span>`;
                      })
                      .join("")}</td>`,
                )
                .join(""),
            ).join("") +
            "</tr>",
        )
        .join("") +
      "</table></div>";
  } else if (outMode === "teacher") {
    (m.rts as number[]).forEach((t) => {
      const at: Record<number, number> = {};
      M.L.forEach((x, l) => {
        const g = M.G[x.g];
        if (g.t === t && ST.slot[l] >= 0) at[ST.slot[l]] = l;
      });
      b +=
        `<div class="pg"><h2>${T}｜${esc(M.T[t].name)}課表（每週 ${Object.keys(at).length} 節）</h2><table class="out">${thead(["節次"].concat(DAYS.map((d) => "週" + d)))}` +
        D.periods
          .map(
            (p, pi) =>
              `<tr><td class="c">${esc(p.name)}<br><small>${esc(p.start)}～${esc(p.end)}</small></td>` +
              DAYS.map((d, di) => {
                const l = at[di * M.NP + pi];
                if (l == null) return "<td></td>";
                const g = M.G[M.L[l].g];
                return `<td class="c"><b>${esc(g.name)}</b><br><small>${esc(roomOf(l))}　${g.stu.length} 人</small></td>`;
              }).join("") +
              "</tr>",
          )
          .join("") +
        "</table></div>";
    });
  } else if (outMode === "lockraw") {
    const reg = D.periods.filter((p) => !p.extra),
      pn = (s: number) => {
        const p = M.P[s % M.NP],
          mm = String(p.name).match(/^第\s*(\d+)\s*節$/);
        return mm ? +mm[1] : reg.indexOf(p) + 1;
      };
    const rows: { cls: string; sj: string; s: number; t: string }[] = (
      M.flex
        ? X.assignLocks(M, ST.slot).locks.map((k: any) => ({ cls: k.cls, sj: k.sj, s: k.s, t: M.T[k.t].name }))
        : CORE.lockTable(M, ST.slot).flatMap((r) => r.slots.map((s) => ({ cls: r.cls, sj: r.subject, s, t: r.teacher })))
    ).sort((a: any, c: any) => a.cls.localeCompare(c.cls) || a.s - c.s);
    b =
      `<div class="pg"><h2>${T}｜鎖課清單（${printDate(now)} 印）</h2><table class="out">${thead(["班級名稱", "科目名稱", "星期", "首節", "末節", "教師姓名"])}` +
      rows.map((r) => `<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(LOCKN[r.sj] || r.sj)}</td><td class="c">${Math.floor(r.s / M.NP) + 1}</td><td class="c">${pn(r.s)}</td><td class="c">${pn(r.s)}</td><td>${esc(r.t)}</td></tr>`).join("") +
      `</table><p class="note">欄位和教務處「特教鎖課需求」的資料輸出相同，按「複製」可以貼到試算表。科目名稱國文、英文會寫成國語文、英語文。共 ${rows.length} 筆。</p>${signLine()}</div>`;
    // 特教鎖課整理：每班各科鎖幾節、國文有沒有連 2 節（同一天相鄰兩節）
    const CS = ["國語文", "英語文", "數學", "理化"],
      cnt: Record<string, { n: Record<string, number>; g: number[] }> = {};
    rows.forEach((r) => {
      const o = (cnt[r.cls] = cnt[r.cls] || { n: {}, g: [] }),
        sj = LOCKN[r.sj] || r.sj;
      o.n[sj] = (o.n[sj] || 0) + 1;
      if (sj === "國語文") o.g.push(r.s);
    });
    const brk = m.brk as ArrayLike<unknown>;
    const dbl = (g: number[]) => (g.some((s) => g.includes(s + 1) && Math.floor(s / M.NP) === Math.floor((s + 1) / M.NP) && pn(s + 1) === pn(s) + 1 && !brk[s % M.NP]) ? 1 : 0);
    b +=
      `<div class="pg"><h2>${T}｜特教鎖課整理（${printDate(now)} 印）</h2><table class="out">${thead(["班級名稱", "國語文", "英語文", "數學", "國文連2", "理化"])}` +
      Object.keys(cnt)
        .sort()
        .map((c) => {
          const o = cnt[c];
          return `<tr><td class="c">${esc(c)}</td>${CS.slice(0, 3)
            .map((s) => `<td class="c">${o.n[s] || 0}</td>`)
            .join("")}<td class="c">${dbl(o.g)}</td><td class="c">${o.n["理化"] || 0}</td></tr>`;
        })
        .join("") +
      `</table><p class="note">欄位和「特教鎖課需求」的特教鎖課整理相同。國文連2 是 1 表示這一班有鎖到同一天相鄰的兩節國文。</p>${signLine()}</div>`;
  } else if (outMode === "lock") {
    if (M.flex) {
      const A = X.assignLocks(M, ST.slot),
        n = A.locks.filter((k: any) => !k.extra).length,
        ex = A.locks.length - n;
      b =
        `<div class="pg"><p class="note">有學生被抽離的班級節次共 <b>${A.pulled}</b> 個：鎖到 <b>${n}</b> 個（同一科 ${A.same}、改鎖別科 ${n - A.same}），鎖不到 <b>${A.open.length}</b> 個${ex ? "；另外為了連堂多鎖 " + ex + " 節" : ""}。${A.fixAll ? `手排鎖課 ${A.fixAll} 節，沿用 <b>${A.fixed}</b> 節。` : ""}</p>${A.warn.length ? `<div class="probs">${A.warn.map((w: string) => "<div>" + esc(w) + "</div>").join("")}</div>` : ""}</div>` +
        (A.open.length
          ? `<div class="pg"><h2>${T}｜鎖不到課的節次</h2><table class="out">${thead(["班級", "節次", "資源班組別", "原因"])}` +
            A.open.map((o: any) => `<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.groups.join("、"))}</td><td>${esc(o.why)}</td></tr>`).join("") +
            `</table><p class="note">這些節次學生照樣到資源班上課，只是原班那一節不是主科。想減少的話，可以到排課表把那一節移到別的時段。</p></div>`
          : "") +
        (A.idle.length
          ? `<div class="pg"><h2>${T}｜手排鎖課沒用到的節次</h2><table class="out">${thead(["班級", "節次", "手排鎖的老師", "科目"])}` +
            A.idle
              .sort((a: any, c: any) => a.cls.localeCompare(c.cls) || a.s - c.s)
              .map((o: any) => `<tr><td class="c">${esc(o.cls)}</td><td>${esc(M.sn(o.s))}</td><td>${esc(o.t)}</td><td>${esc(o.sj || "")}</td></tr>`)
              .join("") +
            `</table><p class="note">手排時有鎖，但現在的課表這一節沒有這一班的學生被抽離，所以不會交給教務處。九年級英數理如果是教學組統一鎖的，也會列在這裡。</p></div>`
          : "");
    }
    b +=
      `<div class="pg"><h2>${T}｜資源班抽離課鎖課表（${printDate(now)} 印）</h2><table class="out">${thead(["班級", "科目", "任課老師", "請排這一科的節次", "節數", "資源班組別"])}` +
      CORE.lockTable(M, ST.slot)
        .map((r) => `<tr><td class="c">${esc(r.cls)}</td><td class="c">${esc(r.subject)}</td><td>${esc(r.teacher)}</td><td>${esc(slotsText(r.slots))}</td><td class="c">${r.slots.length}</td><td>${esc(r.groups.join("、"))}</td></tr>`)
        .join("") +
      `</table><p class="note">外加課和不鎖課的課不占原班主科時間，沒有列在這張表。</p>${signLine()}</div>`;
  } else if (outMode === "homeroom" || outMode === "card") {
    const of: Record<number, Record<number, { g: any; l: number }>> = {};
    M.L.forEach((x, l) => {
      const s = ST.slot[l],
        g = M.G[x.g];
      if (s < 0) return;
      g.stu.forEach((i) => {
        (of[i] = of[i] || {})[s] = { g, l };
      });
    });
    const list = D.students
      .map((s, i) => ({ s, i }))
      .filter((o) => of[o.i])
      .sort((a, b2) => sortStu(a.s, b2.s));
    if (outMode === "card") {
      const ttl = (D.settings.cardTitle as string) || "資源班課表";
      b =
        list
          .filter((o) => !outG || gradeOfCls(o.s.cls) === +outG)
          .map(
            ({ s, i }) =>
              `<div class="pg pcard"><h2>${esc(s.cls)}-${esc(s.seat)}${esc(s.name)}　${esc(ttl)}</h2>${cmName(s) ? `<p class="dt">個管老師：${esc(tCall(cmName(s)))}</p>` : ""}<table class="out pt">${thead(["節次/時間"].concat(DAYS.map((d) => "星期" + d)))}` +
              D.periods
                .map(
                  (p, pi) =>
                    `<tr class="${pi % 2 ? "alt" : ""}"><th>${esc(p.name)}${p.start && !p.extra ? `<small>${esc(p.start)}–${esc(p.end)}</small>` : ""}</th>` +
                    DAYS.map((d, di) => {
                      const o = of[i][di * M.NP + pi];
                      if (!o) return "<td></td>";
                      const c = SUBC[String(o.g.subject)[0]] || SUBC[""],
                        tn = tName(o.g.t);
                      return `<td><div class="pc" style="background:${c[0]};border-left-color:${c[1]};color:${c[2]}"><b>${esc(o.g.subject)}</b><span>${esc(tCall(tn))}</span><small>${roomOf(o.l) ? "@ " + esc(roomOf(o.l)) : ""}</small></div></td>`;
                    }).join("") +
                    "</tr>",
                )
                .join("") +
              `</table></div>`,
          )
          .join("") || '<p class="note">這個年級沒有學生有排課。</p>';
    } else {
      // 給導師：每一節寫「原班 ○○課 → 資源班 ○○（老師・教室）」。彈性鎖課時原班鎖的科目可能和資源班不同，照配鎖課的結果寫
      const lk: Record<string, any> = {};
      locksNow().forEach((k: any) => {
        lk[k.cls + "|" + k.s] = k;
      });
      const line = (s: { s: Student; i: number }, x: number) => {
        const o = of[s.i][x],
          g = o.g,
          pn = M.P[x % M.NP].name,
          to = "資源班 " + g.subject + "（" + [tCall(tName(g.t)), roomOf(o.l)].filter(Boolean).join("・") + "）";
        if (!g.pull) return `<b>${esc(pn)}</b> <span class="tagv">外加</span> → ${esc(to)}`;
        const k = lk[s.s.cls + "|" + x],
          from = g.need && k ? "原班 " + k.sj + "課" : g.need ? "原班（這一節沒有鎖課）" : "原班照常上課（不鎖課）";
        return `<b>${esc(pn)}</b> ${esc(from)} → ${esc(to)}`;
      };
      const head = (D.classHead || {}) as Record<string, string>;
      b = [...new Set(list.map((o) => String(o.s.cls)))]
        .map((c) => {
          const ss = list.filter((o) => String(o.s.cls) === c),
            cms = [...new Set(ss.map((o) => cmName(o.s)).filter(Boolean))],
            hr = head[c];
          return (
            `<div class="pg">${dt}<h2>${T}｜${esc(c)} 班 資源班抽離表</h2><p class="note">${hr ? "導師：" + esc(tCall(hr)) + "　" : ""}個管老師：${esc(cms.map(tCall).join("、") || "未指定")}</p><table class="out">${thead(["座號", "姓名", "個管老師"].concat(DAYS.map((d) => "週" + d)))}` +
            ss
              .map(
                (o) =>
                  `<tr><td class="c">${esc(o.s.seat)}</td><td>${esc(o.s.name)}</td><td class="c">${esc(cmName(o.s))}</td>` +
                  DAYS.map(
                    (d, di) =>
                      "<td>" +
                      Object.keys(of[o.i])
                        .map(Number)
                        .filter((x) => Math.floor(x / M.NP) === di)
                        .sort((a, b2) => a - b2)
                        .map((x) => line(o, x))
                        .join("<br>") +
                      "</td>",
                  ).join("") +
                  "</tr>",
              )
              .join("") +
            `</table><p class="note">以上節次學生到資源班上課，請導師協助提醒。標「外加」的是早自習、午休等外加時段，不占原班的課。</p>${signLine("　導師簽收：＿＿＿＿＿＿")}</div>`
          );
        })
        .join("");
    }
  } else if (outMode === "regular") {
    // 給原班任課老師：他哪一班、哪一節有學生被抽離、去上什麼。老師來自鎖課（彈性鎖課照配鎖課結果）
    const by: Record<number, any[]> = {};
    locksNow().forEach((k: any) => {
      if (k.t >= 0 && !k.extra) (by[k.t] = by[k.t] || []).push(k);
    });
    const outAt = (cls: string, s: number) => {
      const r: { st: Student; g: any; l: number }[] = [];
      M.L.forEach((x, l) => {
        if (ST.slot[l] !== s) return;
        const g = M.G[x.g];
        if (!g.need) return;
        g.stu.forEach((i) => {
          const st = D.students[i];
          if (String(st.cls) === cls) r.push({ st, g, l });
        });
      });
      return r.sort((a, c) => sortStu(a.st, c.st));
    };
    b =
      Object.keys(by)
        .map(Number)
        .sort((a, c) => tName(a).localeCompare(tName(c)))
        .map(
          (t) =>
            `<div class="pg">${dt}<h2>${T}｜給 ${esc(tCall(tName(t)))} 的抽離名單</h2><table class="out">${thead(["節次", "班級", "您這節的課", "被抽離的學生", "去資源班上"])}` +
            by[t]
              .sort((a, c) => a.s - c.s || a.cls.localeCompare(c.cls))
              .map((k) => {
                const st = outAt(k.cls, k.s);
                return `<tr><td>${esc(M.sn(k.s))}</td><td class="c">${esc(k.cls)}</td><td class="c">${esc(k.sj)}</td><td>${esc(st.map((o) => o.st.seat + " " + o.st.name).join("、"))}</td><td>${esc([...new Set(st.map((o) => o.g.subject + "（" + [tCall(tName(o.g.t)), roomOf(o.l)].filter(Boolean).join("・") + "）"))].join("、"))}</td></tr>`;
              })
              .join("") +
            `</table><p class="note">這些節次上面的學生到資源班上課，不在原班教室。</p>${signLine()}</div>`,
        )
        .join("") || '<p class="note">還沒有任何鎖課，請先到「任課老師」填各班原班老師。</p>';
  } else if (outMode === "cm") {
    // 一位個管老師一頁：他的個案在哪一班、上哪些組、每週幾節（私密欄位不印）
    const cms = D.teachers.filter((t) => D.students.some((s) => s.caseMgr === t.id));
    b =
      cms
        .map((t) => {
          const ss = D.students
            .map((s, i) => ({ s, i }))
            .filter((o) => o.s.caseMgr === t.id)
            .sort((a, c) => sortStu(a.s, c.s));
          return (
            `<div class="pg"><h2>${T}｜${esc(tCall(t.name))} 個管個案一覽（${ss.length} 人）</h2><table class="out">${thead(["班級", "座號", "姓名", "組別（老師）", "每週節數", "上課節次"])}` +
            ss
              .map(({ s, i }) => {
                const gs = M.G.filter((g) => g.per && g.stu.includes(i)),
                  ls = M.L.map((x, l) => l).filter((l) => gs.includes(M.G[M.L[l].g]) && ST.slot[l] >= 0);
                return `<tr><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td><td>${esc(gs.map((g) => g.name + (g.t >= 0 ? "（" + tName(g.t) + "）" : "")).join("、") || "尚未分組")}</td><td class="c">${ls.length}</td><td>${esc(slotsText(ls.map((l) => ST.slot[l]).sort((a, c) => a - c)))}</td></tr>`;
              })
              .join("") +
            "</table></div>"
          );
        })
        .join("") || '<p class="note">還沒有學生指定個管老師。</p>';
  } else if (outMode === "student") {
    const of: Record<number, { s: number; g: any }[]> = {};
    M.L.forEach((x, l) => {
      const s = ST.slot[l],
        g = M.G[x.g];
      if (s < 0) return;
      g.stu.forEach((i) => {
        (of[i] = of[i] || []).push({ s, g });
      });
    });
    b =
      `<div class="pg"><h2>${T}｜學生抽離一覽</h2><table class="out">${thead(["班級", "座號", "姓名"].concat(DAYS.map((d) => "週" + d), ["每週"]))}` +
      D.students
        .map((s, i) => ({ s, i }))
        .filter((o) => of[o.i])
        .sort((a, b2) => sortStu(a.s, b2.s))
        .map(
          ({ s, i }) =>
            `<tr><td class="c">${esc(s.cls)}</td><td class="c">${esc(s.seat)}</td><td>${esc(s.name)}</td>` +
            DAYS.map(
              (d, di) =>
                "<td>" +
                of[i]
                  .filter((o) => Math.floor(o.s / M.NP) === di)
                  .sort((a, b2) => a.s - b2.s)
                  .map((o) => esc(M.P[o.s % M.NP].name + " " + o.g.name))
                  .join("<br>") +
                "</td>",
            ).join("") +
            `<td class="c">${of[i].length}</td></tr>`,
        )
        .join("") +
      "</table></div>";
  } else {
    b =
      `<div class="pg"><h2>${T}｜組別總表</h2><table class="out">${thead(["組別", "科目", "型態", "老師", "教室", "上課節次", "學生"])}` +
      M.G.filter((g) => g.per)
        .map((g) => {
          const ls = M.L.map((x, l) => l).filter((l) => M.L[l].g === g.gi && ST.slot[l] >= 0),
            rs = [...new Set(ls.map((l) => ROOM[l]).filter((r) => r >= 0).map((r) => D.rooms[r].name))];
          return `<tr><td><b>${esc(g.name)}</b></td><td class="c">${esc(g.subject)}</td><td class="c">${esc(g.ref.mode || "抽離")}</td><td>${esc(tName(g.t))}</td><td>${esc(rs.join("、"))}</td><td>${esc(slotsText(ls.map((l) => ST.slot[l]).sort((a, c) => a - c)))}</td><td>${esc(g.stu.map((i) => stuLabel(D.students[i])).join("、"))}</td></tr>`;
        })
        .join("") +
      "</table></div>";
  }
  return b;
}

/** 輸出用的課表：一律是正式課表（草稿不印） */
export function outBoard(D: RcData): { M: Model; S: SolveState; ROOM: Int16Array } {
  const M = CORE.compile(D);
  const S = CORE.toState(M, D);
  if (!S.rfix) S.rfix = new Int16Array(M.L.length).fill(-1);
  M.lroom = S.rfix;
  const ROOM = CORE.assignRooms(M, S.slot);
  return { M, S, ROOM };
}
