#!/usr/bin/env node
/** DIS分析の自然言語検索（ローカルの索引のみ）。 node scripts/dis/search.mjs "検索語や質問文" [--dir outputs/dis] */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { searchIndexes } from "./lib/text-index.mjs";
import { REPO_ROOT } from "./lib/config.mjs";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { dir: { type: "string", default: `${REPO_ROOT}outputs/dis` } } });
const query = positionals.join(" ").trim();
if (!query) { console.error('使い方: npm run dis:search -- "検索語"'); process.exit(2); }
const found = [];
for (const f of await fs.readdir(values.dir, { recursive: true }).catch(() => [])) {
  if (f.endsWith("text-index.json")) found.push(JSON.parse(await fs.readFile(path.join(values.dir, f), "utf8")));
}
if (!found.length) { console.log("索引がありません（先に validate まで実行してください）"); process.exit(0); }
for (const r of searchIndexes(found, query)) {
  console.log(`${r.score}  ${r.id}  ${r.brand}  ${r.pageUrl}`);
  for (const h of r.hits) console.log(`    [${h.field}] ${h.text.slice(0, 80)}`);
}
