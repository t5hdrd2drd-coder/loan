import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
let html = readFileSync("dist/index.html", "utf8");
const js = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/)?.[1];
const css = html.match(/<link[^>]*href="([^"]+\.css)"[^>]*>/)?.[1];
if (!js || !css) throw Error("請先執行 npm run build");
html = html.replace(
  '<html lang="zh-Hant">',
  '<html lang="zh-Hant" data-preview="demo">',
);
const script = readFileSync(resolve("dist", js), "utf8").replace(
  /<\/script/gi,
  "<\\/script",
);
const style = readFileSync(resolve("dist", css), "utf8").replace(
  /@import[^;]+;/g,
  "",
);
html = html.replace(
  /<script[^>]*src="[^"]+"[^>]*><\/script>/,
  () => `<script type="module">${script}</script>`,
);
html = html.replace(
  /<link[^>]*href="[^"]+\.css"[^>]*>/,
  () => `<style>${style}</style>`,
);
html = html.replace(
  /<title>[^<]+<\/title>/,
  "<title>禾帳｜互動示範（不連接正式資料）</title>",
);
mkdirSync("artifacts", { recursive: true });
writeFileSync("artifacts/禾帳-互動示範.html", html);
console.log("已建立 artifacts/禾帳-互動示範.html，可下載後直接用瀏覽器開啟。");
