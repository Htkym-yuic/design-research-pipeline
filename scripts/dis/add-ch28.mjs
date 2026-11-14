#!/usr/bin/env node
/**
 * 旧28章（章0〜27・章0が先頭）のDISページの末尾に、「28. 実行・重複防止記録」を追記する。
 *   - 章28 = 章0の内容の写し ＋ 今回の補完の記録。新しい分析・画像の読み直しはしない
 *   - 既存のブロックは変更・削除しない（末尾への追記のみ）。すでに「28.」があれば何も書かない
 *   - Dropboxには、03_Analysis に新規ファイル（上書きしない）を、ローカルの同期フォルダへコピーする
 * 実書込みは --apply と DIS_ENABLE_WRITES=true と DRY_RUN=false がそろったときだけ。
 *   node scripts/dis/add-ch28.mjs --id DIS-LP-0014 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { REPO_ROOT } from "./lib/config.mjs";
import { listBlockChildren, appendBlockChildren, updatePageProperties } from "../lib/notion-client.mjs";

const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? "").join("");
const rt = (c) => [{ type: "text", text: { content: String(c).slice(0, 1900) } }];
const bullet = (c) => ({ object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rt(c) } });

/** ブロック列から、章0（「0. 実行」〜「1. 基本情報」の手前）の箇条書きの文字を取り出す。 */
export function chapter0Lines(blocks) {
  const a = blocks.findIndex((b) => /^0\. 実行/.test(text(b)));
  const z = blocks.findIndex((b, i) => i > a && /^1\. 基本情報/.test(text(b)));
  if (a < 0 || z < 0) throw new Error("章0（0. 実行・重複防止記録）が見つかりません");
  return blocks.slice(a + 1, z).filter((b) => b.type === "bulleted_list_item").map(text).filter(Boolean);
}

export function buildChapter28({ ch0, disId, lp, today }) {
  const supplement = [
    `補完記録（${today}）: 統一28章 v4.0 では章28＝実行・重複防止記録。このページの旧28章は章0（先頭）にあり、章28が無かったため、章0の内容を、ここに写した`,
    `補完の範囲: 章28の追記のみ。章0〜27・DIS 9軸分析・画像・プロパティは変更していない（追記のみ・削除なし）`,
    `新しい分析・画像の読み直しはしていない。対応: ${disId}（DIS）＝ ${lp}（旧ライブラリー）。旧LPページ（${lp}）は変更していない`,
  ];
  const blocks = [
    { object: "block", type: "heading_2", heading_2: { rich_text: rt("28. 実行・重複防止記録") } },
    { object: "block", type: "paragraph", paragraph: { rich_text: rt("章0（先頭）の記録の写し。原本は章0。") } },
    ...ch0.map(bullet),
    ...supplement.map(bullet),
  ];
  const md = ["## 28. 実行・重複防止記録", "", "章0（先頭）の記録の写し。原本は章0。", "", ...ch0.map((l) => `- ${l}`), ...supplement.map((l) => `- ${l}`), ""].join("\n");
  return { blocks, md };
}

async function main() {
  const { values: a } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false } } });
  const rels = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "data/dis-relations.json"), "utf8")).relations;
  const rel = rels.find((r) => r.disId === a.id);
  if (!rel?.disNotionPageId || !rel.libraryId) throw new Error(`${a.id} の対応表（DISページID・LP番号）がありません`);
  const pageId = rel.disNotionPageId, lp = rel.libraryId;
  const blocks = await listBlockChildren(pageId);
  if (blocks.some((b) => /^28\. /.test(text(b)))) { console.log("すでに「28.」があります。何も書いていません"); return; }
  const today = new Date().toISOString().slice(0, 10);
  const { blocks: add, md } = buildChapter28({ ch0: chapter0Lines(blocks), disId: a.id, lp, today });
  const root = process.env.DROPBOX_LOCAL_ROOT || path.join(os.homedir(), "Dropbox");
  const est = rel.establishedAt || "";
  const meta = (await fs.readdir(path.join(REPO_ROOT, "outputs/dis/LP"))).find((d) => d.startsWith(a.id.replace("DIS-LP-", "")));
  const folder = path.join(root, "design/Design_Research_Library/LP_Research_Library/99_Needs_Review", est, "dis-daily", a.id, "03_Analysis");
  const file = path.join(folder, `${lp}_ch28_v1.1.md`);
  const localCopy = meta ? path.join(REPO_ROOT, "outputs/dis/LP", meta, "28ch", `${lp}_ch28_v1.1.md`) : null;
  console.log(JSON.stringify({ mode: a.apply ? "APPLY" : "DRY-RUN", disId: a.id, lp, pageId, existingBlocks: blocks.length, appendBlocks: add.length, dropboxFile: file, localCopy }, null, 2));
  console.log(md);
  if (!a.apply) { console.log("ドライラン: 何も書いていません"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true" || process.env.DRY_RUN !== "false") throw new Error("DIS_ENABLE_WRITES=true と DRY_RUN=false が必要です");
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(file, md, { flag: "wx" });
  if (localCopy) { await fs.mkdir(path.dirname(localCopy), { recursive: true }); await fs.writeFile(localCopy, md, { flag: "wx" }); }
  await appendBlockChildren(pageId, add);
  const after = await listBlockChildren(pageId);
  const ok = after.length === blocks.length + add.length && /^28\. /.test(text(after[blocks.length]));
  console.log(ok ? `追記しました（${blocks.length}→${after.length}ブロック）` : "WARNING: 追記後のブロック数が合いません");
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
