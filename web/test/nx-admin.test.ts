/* functions/nx-admin-core.js：換目前學期的檢查、搬移狀態。不用模擬器。 */
import { describe, expect, it } from "vitest";
import CORE_JS from "../../functions/nx-admin-core.js";

const C = CORE_JS as unknown as {
  switchTermDenied(link: unknown, school: unknown, termId: string, exists: boolean): string | null;
  linkView(sid: string, link: unknown, school: unknown, sync: unknown): { link: { termId: string; mode: string } | null; school: { currentTerm: string } | null; sync: { ver: unknown } | null };
};

describe("nxSetCurrentTerm 的檢查", () => {
  it("過渡期不能換、代碼要對、學期要有資料、不能換成同一個", () => {
    const school = { currentTerm: "114-2" };
    expect(C.switchTermDenied({ mode: "legacy" }, school, "115-1", true)).toMatch(/過渡期/);
    expect(C.switchTermDenied(null, school, "115/1", true)).toMatch(/代碼/);
    expect(C.switchTermDenied(null, school, "115-1", false)).toMatch(/沒有資料/);
    expect(C.switchTermDenied(null, school, "114-2", true)).toMatch(/已經/);
    expect(C.switchTermDenied({ mode: "native" }, school, "115-1", true)).toBeNull();
  });
});

describe("nxLinkStatus", () => {
  it("只給自己學校的連結；時間轉成字串", () => {
    const at = { toDate: () => new Date("2026-11-01T00:00:00Z") };
    const v = C.linkView("s1", { sid: "s1", termId: "t1", mode: "legacy", at }, { name: "x", currentTerm: "t1", mode: "legacy" }, { json: '{"rev":3}', updatedAt: at });
    expect(v.link?.termId).toBe("t1");
    expect(v.sync?.ver).toEqual({ rev: 3 });
    expect(C.linkView("s2", { sid: "s1", termId: "t1" }, null, null).link).toBeNull();
  });
});
