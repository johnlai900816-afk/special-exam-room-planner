// 靜態輸出後處理：Next 16 把分段預取檔寫成 `__next.me/iep/__PAGE__.txt`（資料夾），
// 瀏覽器卻要 `__next.me.iep.__PAGE__.txt`（一個檔名），放上 Firebase Hosting 會 404。
// 這裡把每個巢狀的預取檔另外複製一份成點號連接的檔名，換頁前的預取就找得到。
import { readdirSync, statSync, copyFileSync } from "node:fs";
import { join, relative, sep } from "node:path";

const out = new URL("../out/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
let n = 0;

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) flatten(dir, p);
    else walk(p);
  }
}

function flatten(base, top) {
  (function rec(d) {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) rec(p);
      else if (name.endsWith(".txt")) {
        const flat = relative(base, p).split(sep).join(".");
        copyFileSync(p, join(base, flat));
        n++;
      }
    }
  })(top);
}

walk(out);
console.log(`flat-prefetch: ${n} files`);
