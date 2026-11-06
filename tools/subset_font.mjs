// Subset Fusion Pixel (SIL OFL) to the characters used in src/ — usage:
// node tools/subset_font.mjs <font.woff2> <out.woff2> [node_modules dir with subset-font]
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createRequire } from "node:module";

const [, , src, out, modDir] = process.argv;
const require = createRequire(resolve(modDir ?? ".", "x.js"));
const subsetFont = require("subset-font");

const chars = new Set();
for (let c = 0x20; c < 0x7f; c++) chars.add(String.fromCharCode(c));
for (const c of "·…—–「」『』，。！？：；、（）《》【】“”‘’➜→←↑↓★×÷％") chars.add(c);
const walk = (d) => {
  for (const n of readdirSync(d)) {
    const p = join(d, n);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|json)$/.test(n)) for (const c of readFileSync(p, "utf8")) chars.add(c);
  }
};
walk("src");
const text = [...chars].join("");
const buf = await subsetFont(readFileSync(src), text, { targetFormat: "woff2" });
writeFileSync(out, buf);
console.log(`chars ${chars.size} -> ${out} ${buf.length} bytes`);
