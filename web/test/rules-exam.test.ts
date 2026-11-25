/* 段考（phase 3d）的規則：web/firestore.rules.next。要 Firestore 模擬器：cd web && npm run test:rules
     exam/{eid}             大家讀；只有管理者／編輯寫
     exam/{eid}/private/*   只有管理者／編輯
     placements/*           監考、支援老師（proctorIds）讀得到自己的；形狀檢查
     seats/*                讀得到這位學生的老師（teacherIds）讀得到
     publicViews/{鑰匙}     不用登入讀單一份（沒過期、鑰匙還登記在 private/view）；管理者／編輯寫自己學校的，同一批登記鑰匙 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { collection, deleteDoc, doc, getDoc, getDocs, query, serverTimestamp, setDoc, Timestamp, where, writeBatch, type Firestore } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const T = "schools/s1/terms/t1";
const E = T + "/exam/main";
let env: RulesTestEnvironment;
type Claims = { sid?: string; role?: string; tid?: string };
const as = (uid: string, c: Claims): Firestore => env.authenticatedContext(uid, { email: uid + "@school.test", email_verified: true, ...c }).firestore() as unknown as Firestore;
const admin = () => as("uAdmin", { sid: "s1", role: "admin" });
const editor = () => as("uEditor", { sid: "s1", role: "editor" });
const r1 = () => as("uR1", { sid: "s1", role: "teacher", tid: "r1" });
const r2 = () => as("uR2", { sid: "s1", role: "teacher", tid: "r2" });
const viewer = () => as("uView", { sid: "s1", role: "viewer" });
const other = () => as("uOther", { sid: "s2", role: "admin" });
const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;

const meta = (rev: number) => ({ rev, updatedBy: "seed", updatedAt: new Date(0) });
const stamp = (uid: string, rev: number) => ({ rev, updatedBy: uid, updatedAt: serverTimestamp() });
const place = (o: Record<string, unknown> = {}) => ({
  ses: "d1p1",
  room: "A",
  date: "12/1",
  dow: "二",
  per: "第1節",
  lab: "作文",
  t: "8:00～9:05",
  roomName: "環教中心",
  proctor: "林老師",
  support: "",
  proctorIds: ["r1"],
  stu: [{ c: "701", s: "03", n: "王小明", sv: "延長", x: "8:00～9:05" }],
  wait: [],
  ...o,
});
const seat = (o: Record<string, unknown> = {}) => ({ teacherIds: ["r1"], cls: "701", seat: "03", name: "王小明", rows: [{ date: "12/1", dow: "二", lab: "作文", per: "第1節", t: "8:00～9:05", ext: true, room: "環教中心", proc: "林老師" }], ...o });
const K1 = "0123456789abcdef0123456789abcdef";
const K2 = "fedcba9876543210fedcba9876543210";
const exp = (days: number) => Timestamp.fromMillis(Date.now() + days * 864e5);
const view = (o: Record<string, unknown> = {}) => ({ sid: "s1", termId: "t1", eid: "main", v: 3, title: "段考", cls: "701", rows: "[]", exp: exp(7), at: serverTimestamp(), ...o });

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-nx-rules-exam",
    firestore: { rules: readFileSync(resolve(__dirname, "../firestore.rules.next"), "utf8") },
  });
});
afterAll(async () => {
  await env?.cleanup();
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const set = (p: string, d: Record<string, unknown>) => setDoc(doc(db, p), d);
    await set("schools/s1", { name: "測試國中" });
    await set(E, { title: "段考", sessions: [], rooms: [], proctors: ["林老師", "王老師"], proctorOf: { "d1p1|A": "林老師" }, supportOf: {}, packed: {}, ...meta(1) });
    await set(E + "/private/data", { json: '{"students":[{"name":"王小明","sv":{"ext":"*"}}]}', ...meta(1) });
    await set(E + "/placements/d1p1%7CA", { ...place(), ...meta(1) });
    await set(E + "/placements/d1p1%7CB", { ...place({ room: "B", proctor: "王老師", proctorIds: ["r2"] }), ...meta(1) });
    await set(E + "/seats/s1", { ...seat(), ...meta(1) });
    await set(E + "/seats/s2", { ...seat({ teacherIds: ["r2", "k1"], name: "陳小華" }), ...meta(1) });
  });
});

describe("段考考程與名單", () => {
  it("考程大家讀（老師、檢視）；只有管理者／編輯寫", async () => {
    await assertSucceeds(getDoc(doc(r1(), E)));
    await assertSucceeds(getDoc(doc(viewer(), E)));
    await assertFails(setDoc(doc(r1(), E), { title: "x", ...stamp("uR1", 2) }));
    await assertSucceeds(setDoc(doc(editor(), E), { title: "新段考", sessions: [], rooms: [], proctors: [], proctorOf: {}, supportOf: {}, packed: {}, ...stamp("uEditor", 2) }));
    await assertFails(getDoc(doc(other(), E)));
  });
  it("學生名單與服務（private）只有管理者／編輯", async () => {
    await assertSucceeds(getDoc(doc(admin(), E + "/private/data")));
    await assertFails(getDoc(doc(r1(), E + "/private/data")));
    await assertFails(getDoc(doc(viewer(), E + "/private/data")));
    await assertFails(setDoc(doc(r1(), E + "/private/notice"), { json: "{}", ...stamp("uR1", 1) }));
  });
});

describe("老師端：試場（交卷名單）與學生考場", () => {
  it("監考老師只讀得到自己的試場；查詢要帶 array-contains", async () => {
    await assertSucceeds(getDoc(doc(r1(), E + "/placements/d1p1%7CA")));
    await assertFails(getDoc(doc(r1(), E + "/placements/d1p1%7CB")));
    await assertSucceeds(getDocs(query(collection(r1(), E + "/placements"), where("proctorIds", "array-contains", "r1"))));
    await assertFails(getDocs(collection(r1(), E + "/placements")));
    await assertFails(getDoc(doc(viewer(), E + "/placements/d1p1%7CA")));
    await assertSucceeds(getDocs(collection(admin(), E + "/placements")));
  });
  it("學生考場：讀得到這位學生的老師（teacherIds）才讀得到", async () => {
    await assertSucceeds(getDoc(doc(r1(), E + "/seats/s1")));
    await assertFails(getDoc(doc(r1(), E + "/seats/s2")));
    await assertSucceeds(getDoc(doc(as("uK1", { sid: "s1", role: "teacher", tid: "k1" }), E + "/seats/s2")));
    await assertSucceeds(getDocs(query(collection(r2(), E + "/seats"), where("teacherIds", "array-contains", "r2"))));
    await assertFails(getDocs(collection(r2(), E + "/seats")));
    await assertFails(getDoc(doc(viewer(), E + "/seats/s1")));
  });
  it("老師、檢視不能寫；管理者寫要合形狀（多出欄位、監考太多、rev 不對都被拒）", async () => {
    await assertFails(setDoc(doc(r1(), E + "/placements/x"), { ...place(), ...stamp("uR1", 1) }));
    await assertFails(setDoc(doc(r1(), E + "/seats/s1"), { ...seat({ teacherIds: ["r1", "r2"] }), ...stamp("uR1", 2) }));
    await assertFails(setDoc(doc(viewer(), E + "/seats/x"), { ...seat(), ...stamp("uView", 1) }));
    await assertSucceeds(setDoc(doc(admin(), E + "/placements/new"), { ...place(), ...stamp("uAdmin", 1) }));
    await assertSucceeds(setDoc(doc(editor(), E + "/seats/s1"), { ...seat({ teacherIds: ["r1", "r2"] }), ...stamp("uEditor", 2) }));
    await assertFails(setDoc(doc(admin(), E + "/placements/new2"), { ...place({ svc: "x" }), ...stamp("uAdmin", 1) }));
    await assertFails(setDoc(doc(admin(), E + "/placements/new3"), { ...place({ proctorIds: ["a", "b", "c", "d", "e"] }), ...stamp("uAdmin", 1) }));
    await assertFails(setDoc(doc(admin(), E + "/seats/s2"), { ...seat({ memo: "備註" }), ...stamp("uAdmin", 2) }));
    await assertFails(setDoc(doc(admin(), E + "/seats/s2"), { ...seat(), ...stamp("uAdmin", 5) }));
    await assertSucceeds(deleteDoc(doc(admin(), E + "/placements/d1p1%7CB")));
    await assertFails(deleteDoc(doc(r1(), E + "/placements/d1p1%7CA")));
  });
});

/** 管理者開連結：登記鑰匙＋寫查考場文件，同一批 */
async function openLink(db: Firestore, uid: string, keys: string[], docs: [string, Record<string, unknown>][], rev = 1) {
  const b = writeBatch(db);
  b.set(doc(db, E + "/private/view"), { json: JSON.stringify({ link: keys[0] || "" }), keys, ...stamp(uid, rev) });
  docs.forEach(([k, d]) => b.set(doc(db, "publicViews/" + k), d));
  return b.commit();
}

describe("查考場連結（publicViews）", () => {
  it("管理者開連結；不用登入讀得到單一份；不能列出", async () => {
    await assertSucceeds(openLink(admin(), "uAdmin", [K1, K2 + "_701"], [
      [K1, view({ cls: undefined, all: true })],
      [K2 + "_701", view()],
    ].map(([k, d]) => [k as string, Object.fromEntries(Object.entries(d as Record<string, unknown>).filter(([, v]) => v !== undefined))])));
    await assertSucceeds(getDoc(doc(anon(), "publicViews/" + K1)));
    await assertSucceeds(getDoc(doc(anon(), "publicViews/" + K2 + "_701")));
    await assertFails(getDocs(collection(anon(), "publicViews")));
    await assertFails(getDocs(collection(admin(), "publicViews")));
  });
  it("鑰匙沒登記不能寫；換新或關閉後，舊文件就算還在也讀不到", async () => {
    await assertFails(setDoc(doc(admin(), "publicViews/" + K1), view()));
    await assertSucceeds(openLink(admin(), "uAdmin", [K1], [[K1, view()]]));
    // 關閉：登記拿掉（舊文件故意不刪）
    await assertSucceeds(setDoc(doc(admin(), E + "/private/view"), { json: "{}", keys: [], ...stamp("uAdmin", 2) }));
    await assertFails(getDoc(doc(anon(), "publicViews/" + K1)));
    await assertSucceeds(deleteDoc(doc(admin(), "publicViews/" + K1)));
  });
  it("過期的讀不到；到期超過 400 天、格式不對的鑰匙、多出欄位、別校、老師、沒登入都不能寫", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      await setDoc(doc(db, E + "/private/view"), { json: "{}", keys: [K1, K2], ...meta(1) });
      await setDoc(doc(db, "publicViews/" + K1), { ...view(), at: new Date(), exp: Timestamp.fromMillis(Date.now() - 1000) });
    });
    await assertFails(getDoc(doc(anon(), "publicViews/" + K1)));
    await assertFails(openLink(admin(), "uAdmin", [K2], [[K2, view({ exp: exp(500) })]], 2));
    await assertFails(openLink(admin(), "uAdmin", ["notakey", K2], [["notakey", view()]], 2));
    await assertFails(openLink(admin(), "uAdmin", [K2], [[K2, view({ svc: "延長" })]], 2));
    await assertFails(openLink(other(), "uOther", [K2], [[K2, view()]], 2));
    await assertFails(setDoc(doc(other(), "publicViews/" + K2), view({ sid: "s2" })));
    await assertFails(openLink(r1(), "uR1", [K2], [[K2, view()]], 2));
    await assertFails(setDoc(doc(anon(), "publicViews/" + K2), view()));
    await assertSucceeds(openLink(editor(), "uEditor", [K2], [[K2, view()]], 2));
  });
});
