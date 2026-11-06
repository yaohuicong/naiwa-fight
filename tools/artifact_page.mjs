// Writes dist/play.html: the page used when the game is published as a Claude artifact.
// The artifact host adds its own <html>/<head>/<body>, so this file has only title, style, script and the mount div.
// The pixel font is embedded as a data URI because the artifact frame only loads fonts from data: or Google Fonts.
import { readFileSync, writeFileSync } from "node:fs";

const html = readFileSync("dist/index.html", "utf8");
const script = html.match(/<script type="module"[^>]*src="([^"]+)"/)?.[1];
if (!script) throw new Error("dist/index.html has no module script — run vite build first");
const font = readFileSync("dist/assets/fonts/fusion-pixel-subset.woff2").toString("base64");

const page = `<title>奶娃格斗 第一关</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
  /* 全屏游戏页：单一夜雨暗色，画布按 16:9 居中铺满 */
  :root { --bg: #05050a; --fg: #c9d6ff; color-scheme: dark; }
  @font-face {
    font-family: "FusionPixel";
    src: url(data:font/woff2;base64,${font}) format("woff2");
    font-display: block;
  }
  html { height: 100%; box-sizing: border-box; background: var(--bg); }
  body {
    height: 100%; margin: 0; overflow: hidden; box-sizing: border-box;
    background: var(--bg); color: var(--fg);
    padding-block: 0;
    padding-left: max(16px, env(safe-area-inset-left, 0px));
    padding-right: max(16px, env(safe-area-inset-right, 0px));
  }
  #game { width: 100%; height: 100%; }
</style>
<script type="module" src="${script}"></script>
<div id="game"></div>
`;
writeFileSync("dist/play.html", page);
console.log(`dist/play.html written (${(page.length / 1024).toFixed(1)} KB, script ${script})`);
