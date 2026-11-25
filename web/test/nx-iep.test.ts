/* functions/nx-iep-core.js：新版老師發布 IEP 連結的檢查、回覆要抄到哪裡。不用模擬器。 */
import { describe, expect, it } from "vitest";
import CORE_JS from "../../functions/nx-iep-core.js";
import { IEP, type Round } from "../lib/iep";
import { CORE } from "../lib/core";
import type { RcData } from "../lib/types";

const C = CORE_JS as unknown as {
  mayTouch(t: unknown, sid: string, round: unknown): boolean;
  cleanDoc(d: unknown, now: number): { out: Record<string, unknown>; pk: string; exp: number };
  mirrorPath(tok: unknown, round: string, h: string): string;
};
const H = "a".repeat(64);

describe("誰能發布", () => {
  const round = { readers: ["r1", "r2"] };
  it("readers 裡的老師、同校管理者可以；別的老師、別校不行", () => {
    expect(C.mayTouch({ sid: "s", role: "teacher", tid: "r1" }, "s", round)).toBe(true);
    expect(C.mayTouch({ sid: "s", role: "teacher", tid: "r3" }, "s", round)).toBe(false);
    expect(C.mayTouch({ sid: "s", role: "editor" }, "s", round)).toBe(true);
    expect(C.mayTouch({ sid: "x", role: "admin" }, "s", round)).toBe(false);
    expect(C.mayTouch({ sid: "s", role: "viewer" }, "s", round)).toBe(false);
  });
});

describe("發布內容", () => {
  const D = CORE.defaultData() as RcData;
  const R = IEP.newRoundAs(D, "r2", { stu: ["s2"], due: "2026-12-04" }) as Round;
  IEP.setRange(D, R, "2026-12-07", "2026-12-11", ["5", "6"]);
  const o = IEP.webPeople(D, R)[0];
  const now = new Date(2026, 10, 26).getTime();
  const doc = { ...IEP.publicDoc(D, R, o), pk: o.k };
  it("iep.js publicDoc 的內容通得過；只留公開欄位", () => {
    const x = C.cleanDoc({ ...doc, secret: "x", r: "hijack" }, now);
    expect(x.pk).toBe(o.k);
    expect(x.out.keys).toEqual(o.keys);
    expect(x.out).not.toHaveProperty("secret");
    expect(x.out).not.toHaveProperty("r");
    expect(x.exp).toBe(IEP.expMs(R));
  });
  it("公開內容不放任何「有課」：publicDoc 沒有 busy，有人塞進來也不寫", () => {
    expect(doc).not.toHaveProperty("busy");
    const x = C.cleanDoc({ ...doc, busy: { [o.keys[0]]: "資源班課" } }, now);
    expect(x.out).not.toHaveProperty("busy");
  });
  it("過期、超過 120 天、節次格式不對、出席者代號不對都擋", () => {
    expect(() => C.cleanDoc({ ...doc, expMs: now - 1 }, now)).toThrow(/期限已過/);
    expect(() => C.cleanDoc({ ...doc, expMs: now + 130 * 864e5 }, now)).toThrow(/120/);
    expect(() => C.cleanDoc({ ...doc, keys: ["../x"] }, now)).toThrow(/節次/);
    expect(() => C.cleanDoc({ ...doc, pk: "zz" }, now)).toThrow(/代號/);
    expect(() => C.cleanDoc({ ...doc, who: "a" }, now)).toThrow(/who/);
  });
});

describe("回覆抄到新位置", () => {
  it("有 sid、termId、調查單相同才抄", () => {
    expect(C.mirrorPath({ sid: "s1", termId: "115-1", r: "iepab12" }, "iepab12", H)).toBe("schools/s1/terms/115-1/iep/iepab12/responses/" + H);
    expect(C.mirrorPath({ r: "iepab12" }, "iepab12", H)).toBe("");
    expect(C.mirrorPath({ sid: "s1", termId: "t", r: "other" }, "iepab12", H)).toBe("");
    expect(C.mirrorPath({ sid: "../x", termId: "t", r: "a" }, "a", H)).toBe("");
    expect(C.mirrorPath(null, "a", H)).toBe("");
  });
});
