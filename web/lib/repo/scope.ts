import type { RoleClaims } from "../model";
import type { RepoScope } from "./types";

/** custom claims → RepoScope；沒有 claims（還沒加入新位置）回傳 null */
export function scopeOf(claims: RoleClaims | null | undefined, uid: string, termId: string): RepoScope | null {
  if (!claims || !claims.sid || !uid || !termId) return null;
  const tid = claims.tid || claims.teacherId;
  return tid ? { sid: claims.sid, termId, uid, role: claims.role, tid } : { sid: claims.sid, termId, uid, role: claims.role };
}
