/* IEP 會議：另一位開發者正在寫 repo 根目錄的 iep.js。這裡先定好新版要用的介面，
   等 iep.js 進來後，比照 lib/core.ts 的做法 `import IEP_JS from "../../iep.js"` 接上，
   把 meetingsOf() 換成呼叫它。現在一律回傳空陣列，畫面顯示「尚未開放」。 */
import type { RcData } from "./types";

export interface IepMeeting {
  id: string;
  studentId: string;
  /** YYYY-MM-DD */
  date: string;
  time?: string;
  place?: string;
  /** 要出席的老師 teacher id */
  attendees: string[];
  status?: "planned" | "done" | "cancelled";
}

export const IEP_READY = false;

export function meetingsOf(_D: RcData | null, _teacherId: string): IepMeeting[] {
  void _D;
  void _teacherId;
  return [];
}
