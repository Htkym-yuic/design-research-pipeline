#!/usr/bin/env node
/**
 * 旧ライブラリーから取り込んだ案件（dis:ingest-library）に、Unitごとの切り出し画像（sections_by_unit/）と全体図を作る。
 * dis:run --stage crop は「選定済みの案件」だけが対象のため、取り込み案件はこちらを使う。分析（analysis.json）が validate を通った後に実行する。
 *   node scripts/dis/crop-units.mjs --id DIS-LP-0008
 * 書込みは、案件フォルダ内（files/01_Normal_Images/sections_by_unit/ と 02_Notion_Images/ の全体図、files.json）だけ。Dropbox・Notionには書かない。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { cropSections, SECTION_DIR } from "./lib/crop.mjs";
import { buildUnitOverview, OVERVIEW_KEY } from "./lib/overview.mjs";

const { values: args } = parseArgs({ options: { id: { type: "string" } } });
if (!args.id) throw new Error("--id DIS-LP-000n を指定");
const cfg = await loadConfig();
const it = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, args.id);
if (!it) throw new Error(`${args.id} の案件フォルダが見つかりません`);
const a = await readJson(`${it}/analysis.json`);
const res = await cropSections(it, a, { id: args.id });
const overview = await buildUnitOverview(it, a, { id: args.id, produced: res.produced });
const overviewRel = `02_Notion_Images/${args.id}_${OVERVIEW_KEY}_notion.jpg`;
const files = (await readJson(`${it}/files.json`, [])).filter((f) => !f.rel.startsWith(`01_Normal_Images/${SECTION_DIR}/`) && f.rel !== overviewRel);
await fs.writeFile(`${it}/files.json`, `${JSON.stringify([...files, ...res.produced.map(({ local, rel }) => ({ local, rel })), ...(overview ? [{ local: overview.local, rel: overview.rel }] : [])], null, 2)}\n`);
console.log(`${args.id}: ${res.produced.length}枚を切り出し${overview ? ` / 全体図1枚（${overview.tiles}セクション）` : ""}${res.warnings.length ? ` / WARNING: ${res.warnings.join("; ")}` : ""}`);
