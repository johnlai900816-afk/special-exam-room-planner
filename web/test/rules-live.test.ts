/* 正式（現在部署中）的 repo 根目錄 firestore.rules 的單元測試：確認舊版用的位置照預期運作，
   也確認 web/firestore.rules.next 的 A 段（和正式規則一字不差）行為相同。要 Firestore 模擬器：
     cd web && npm run test:rules */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  type Firestore,
} from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const LINK = "0123456789abcdef0123456789abcdef";
const HOST = "host@school.test";
const ED = "ed@school.test";
const VW = "vw@school.test";

const files: [string, string][] = [
  ["firestore.rules（正式）", resolve(__dirname, "../../firestore.rules")],
  ["firestore.rules.next（A 段）", resolve(__dirname, "../firestore.rules.next")],
];

for (const [label, file] of files) {
  describe(label, () => {
    let env: RulesTestEnvironment;
    const as = (uid: string, email: string, verified = true): Firestore =>
      env.authenticatedContext(uid, { email, email_verified: verified }).firestore() as unknown as Firestore;
    const host = () => as("uHost", HOST);
    const ed = () => as("uEd", ED);
    const vw = () => as("uVw", VW);
    const stranger = () => as("uX", "x@else.test");
    const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
    const jsonDoc = (email: string, extra: Record<string, unknown> = {}) => ({ json: "{}", by: email, at: serverTimestamp(), ...extra });
    const future = () => Timestamp.fromMillis(Date.now() + 864e5);

    beforeAll(async () => {
      env = await initializeTestEnvironment({
        projectId: "demo-live-" + (file.endsWith(".next") ? "next" : "prod"),
        firestore: { rules: readFileSync(file, "utf8") },
      });
    });
    afterAll(async () => {
      await env?.cleanup();
    });
    beforeEach(async () => {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await setDoc(doc(db, "config/access"), { admin: HOST, emails: [HOST, ED, VW], viewers: [VW], link: LINK });
        await setDoc(doc(db, "rc/main"), { json: "{}", by: HOST, at: new Date(), rev: 3 });
        await setDoc(doc(db, "rc/att-2026-11-26"), { "g1@1": { s1: { st: "in" } } });
        await setDoc(doc(db, "exams/main"), { json: "{}", by: HOST, at: new Date() });
        await setDoc(doc(db, "view/" + LINK), { exp: future(), rows: [] });
        await setDoc(doc(db, "view/" + LINK + "_701"), { exp: Timestamp.fromMillis(Date.now() - 1000), rows: [] });
        await setDoc(doc(db, "iepResp/r1/r/" + "a".repeat(64)), { free: [] });
        await setDoc(doc(db, "iepTok/" + "b".repeat(64)), { r: "r1", exp: future(), keys: [], stu: [], who: "t" });
        await setDoc(doc(db, "auditLogs/a1"), { by: "x" });
      });
    });

    describe("config/access（共用名單）", () => {
      it("成員讀得到，非成員、沒登入、信箱沒驗證讀不到；不能列出", async () => {
        await assertSucceeds(getDoc(doc(vw(), "config/access")));
        await assertFails(getDoc(doc(stranger(), "config/access")));
        await assertFails(getDoc(doc(anon(), "config/access")));
        await assertFails(getDoc(doc(as("uEd", ED, false), "config/access")));
        await assertFails(getDocs(collection(host(), "config")));
      });
      it("只有主持人改得了名單；主持人不能把自己設成檢視；不能刪", async () => {
        await assertSucceeds(updateDoc(doc(host(), "config/access"), { emails: [HOST, ED, VW, "new@school.test"] }));
        await assertFails(updateDoc(doc(ed(), "config/access"), { emails: [HOST, ED] }));
        await assertFails(updateDoc(doc(host(), "config/access"), { viewers: [VW, HOST] }));
        await assertFails(updateDoc(doc(host(), "config/access"), { link: "not-hex" }));
        await assertFails(updateDoc(doc(host(), "config/access"), { extra: 1 }));
        await assertFails(deleteDoc(doc(host(), "config/access")));
      });
      it("主持人可以交給名單裡已有的人，不能交給名單外的人", async () => {
        await assertSucceeds(updateDoc(doc(host(), "config/access"), { admin: ED }));
      });
      it("主持人不能交給名單外的人", async () => {
        await assertFails(updateDoc(doc(host(), "config/access"), { admin: "x@else.test", emails: [HOST, ED, VW, "x@else.test"] }));
      });
      it("第一次建立只有 adminEmail()（CHANGE-ME@example.com）可以", async () => {
        await env.withSecurityRulesDisabled(async (ctx) => deleteDoc(doc(ctx.firestore(), "config/access")));
        await assertFails(setDoc(doc(host(), "config/access"), { admin: HOST, emails: [HOST], viewers: [] }));
        const me = as("uMe", "CHANGE-ME@example.com");
        await assertSucceeds(setDoc(doc(me, "config/access"), { admin: "CHANGE-ME@example.com", emails: ["CHANGE-ME@example.com"], viewers: [] }));
      });
    });

    describe("rc/main（名冊與排課）", () => {
      it("切換後：只有編輯讀得到，檢視和非成員讀不到", async () => {
        await assertFails(getDoc(doc(vw(), "rc/main")));
        await assertSucceeds(getDoc(doc(ed(), "rc/main")));
        await assertFails(getDoc(doc(stranger(), "rc/main")));
      });
      it("切換後：誰都寫不進去", async () => {
        await assertFails(setDoc(doc(ed(), "rc/main"), jsonDoc(ED, { rev: 4 })));
        await assertFails(setDoc(doc(host(), "rc/main"), jsonDoc(HOST)));
        await assertFails(setDoc(doc(vw(), "rc/main"), jsonDoc(VW)));
      });
      it("格式不對被拒：by 不是自己、多出欄位、rev 跳號、at 不是伺服器時間；不能刪", async () => {
        await assertFails(setDoc(doc(ed(), "rc/main"), jsonDoc(HOST)));
        await assertFails(setDoc(doc(ed(), "rc/main"), jsonDoc(ED, { x: 1 })));
        await assertFails(setDoc(doc(ed(), "rc/main"), jsonDoc(ED, { rev: 9 })));
        await assertFails(setDoc(doc(ed(), "rc/main"), { json: "{}", by: ED, at: new Date() }));
        await assertFails(deleteDoc(doc(host(), "rc/main")));
      });
    });

    describe("rc/presence、rc/att-日期", () => {
      it("每個人只能改自己那一格", async () => {
        await assertSucceeds(setDoc(doc(vw(), "rc/presence"), { uVw: { email: VW, name: "檢視", at: 1 } }));
        await assertFails(setDoc(doc(vw(), "rc/presence"), { uEd: { email: ED, name: "冒充", at: 1 } }));
        await assertFails(setDoc(doc(stranger(), "rc/presence"), { uX: { email: "x@else.test", name: "x", at: 1 } }));
      });
      it("點名（切換後）：只有編輯讀、誰都不能寫；其他名稱的 rc 文件不能建", async () => {
        await assertFails(getDoc(doc(vw(), "rc/att-2026-11-26")));
        await assertSucceeds(getDoc(doc(ed(), "rc/att-2026-11-26")));
        await assertFails(setDoc(doc(ed(), "rc/att-2026-11-27"), { "g1@1": { s1: { st: "in" } } }));
        await assertFails(setDoc(doc(vw(), "rc/att-2026-11-27"), { "g1@1": { s1: { st: "in" } } }));
        await assertFails(setDoc(doc(ed(), "rc/other"), { a: 1 }));
        await assertFails(getDoc(doc(ed(), "rc/other")));
      });
    });

    describe("exams/*（段考考場）", () => {
      it("main、notice（切換後）：只有編輯讀、誰都不能寫；其他名稱不行", async () => {
        await assertFails(getDoc(doc(vw(), "exams/main")));
        await assertSucceeds(getDoc(doc(ed(), "exams/main")));
        await assertFails(setDoc(doc(ed(), "exams/notice"), jsonDoc(ED)));
        await assertFails(setDoc(doc(vw(), "exams/main"), jsonDoc(VW)));
        await assertFails(setDoc(doc(ed(), "exams/foo"), jsonDoc(ED)));
        await assertFails(getDoc(doc(stranger(), "exams/main")));
      });
      it("exams/presence 只能改自己那一格", async () => {
        await assertSucceeds(setDoc(doc(ed(), "exams/presence"), { uEd: { email: ED, name: "編", at: 2 } }));
        await assertFails(setDoc(doc(ed(), "exams/presence"), { uVw: { email: VW, name: "x", at: 2 } }));
      });
    });

    describe("view/{鑰匙}（免登入檢視）", () => {
      it("沒過期的任何人都 get 得到；過期的讀不到；不能列出", async () => {
        await assertSucceeds(getDoc(doc(anon(), "view/" + LINK)));
        await assertFails(getDoc(doc(anon(), "view/" + LINK + "_701")));
        await assertFails(getDocs(collection(anon(), "view")));
      });
      it("鑰匙換掉後，舊文件就算沒過期也讀不到（get 要 linkDoc）", async () => {
        await env.withSecurityRulesDisabled(async (ctx) => {
          await setDoc(doc(ctx.firestore(), "view/" + "e".repeat(32)), { exp: future(), rows: [] });
        });
        await assertFails(getDoc(doc(anon(), "view/" + "e".repeat(32))));
      });
      it("只有編輯能用名單上的鑰匙寫，exp 一定要在 400 天內", async () => {
        await assertSucceeds(setDoc(doc(ed(), "view/" + LINK + "_801"), { exp: future(), rows: [] }));
        await assertFails(setDoc(doc(vw(), "view/" + LINK + "_801"), { exp: future(), rows: [] }));
        await assertFails(setDoc(doc(ed(), "view/" + "f".repeat(32)), { exp: future(), rows: [] }));
        await assertFails(setDoc(doc(ed(), "view/" + LINK), { exp: Timestamp.fromMillis(Date.now() + 500 * 864e5), rows: [] }));
        await assertFails(setDoc(doc(ed(), "view/" + LINK), { rows: [] }));
      });
    });

    describe("IEP（iepTok、iepResp、iepRate）", () => {
      it("iepTok：網頁讀不到；編輯可以建（格式正確），檢視不行", async () => {
        const tok = { r: "r1", exp: future(), keys: [], stu: [], who: "p" };
        await assertFails(getDoc(doc(ed(), "iepTok/" + "b".repeat(64))));
        await assertSucceeds(setDoc(doc(ed(), "iepTok/" + "c".repeat(64)), tok));
        await assertFails(setDoc(doc(vw(), "iepTok/" + "c".repeat(64)), tok));
        await assertFails(setDoc(doc(ed(), "iepTok/short"), tok));
        await assertFails(setDoc(doc(ed(), "iepTok/" + "d".repeat(64)), { ...tok, who: "x" }));
      });
      it("iepTok：到期最多 120 天後；keys 一定是陣列", async () => {
        const tok = { r: "r1", exp: future(), keys: [], stu: [], who: "p" };
        await assertSucceeds(setDoc(doc(ed(), "iepTok/" + "1".repeat(64)), { ...tok, exp: Timestamp.fromMillis(Date.now() + 100 * 864e5) }));
        await assertFails(setDoc(doc(ed(), "iepTok/" + "2".repeat(64)), { ...tok, exp: Timestamp.fromMillis(Date.now() + 130 * 864e5) }));
        await assertFails(setDoc(doc(ed(), "iepTok/" + "3".repeat(64)), { ...tok, keys: "x" }));
      });
      it("iepResp（切換後）：只有編輯讀得到，誰都不能從網頁寫；編輯可以刪", async () => {
        const p = "iepResp/r1/r/" + "a".repeat(64);
        await assertFails(getDoc(doc(vw(), p)));
        await assertSucceeds(getDoc(doc(ed(), p)));
        await assertFails(getDoc(doc(stranger(), p)));
        await assertFails(setDoc(doc(ed(), p), { free: ["x"] }));
        await assertFails(deleteDoc(doc(vw(), p)));
        await assertSucceeds(deleteDoc(doc(ed(), p)));
      });
      it("iepRate 網頁讀寫一律拒絕", async () => {
        await assertFails(getDoc(doc(host(), "iepRate/x")));
        await assertFails(setDoc(doc(host(), "iepRate/x"), { c: 1 }));
      });
    });

    describe("auditLogs、aiRate、aiCache", () => {
      it("稽核紀錄只有主持人讀得到，誰都不能寫", async () => {
        await assertSucceeds(getDoc(doc(host(), "auditLogs/a1")));
        await assertFails(getDoc(doc(ed(), "auditLogs/a1")));
        await assertFails(setDoc(doc(host(), "auditLogs/a2"), { by: "x" }));
      });
      it("沒列出的集合一律拒絕", async () => {
        await assertFails(getDoc(doc(host(), "aiRate/x")));
        await assertFails(setDoc(doc(host(), "aiCache/x"), { a: 1 }));
      });
    });
  });
}
