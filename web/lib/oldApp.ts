/* 舊版的網址。切換到新版（schools/{sid}.mode=='native'）之後只剩兩個用途：
   1. IEP 的公開填答頁（iep.html，家長與老師填空堂的連結；iepGetSurvey／iepSubmit 仍是那一套）
   2. 還在過渡期（mode=='legacy'）的學校：唯讀提示旁邊的「到舊版修改」——native 模式不會出現 */
export const OLD_APP = "https://johnlai900816-afk.github.io/special-exam-room-planner/";

/** 只能看的時候的一句話：過渡期指到舊版；切換後（native）或管理者的唯讀預覽，不再提舊版 */
export const roText = (legacy: boolean): string => (legacy ? "過渡期請在舊版修改" : "這裡只能看");
