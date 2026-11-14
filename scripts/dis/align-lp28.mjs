#!/usr/bin/env node
/**
 * DISページの28章（旧ライブラリーの28章。章1〜29）を、LP-0245の形（統一28章 v4.0）にそろえる。
 *   ドライラン（既定）: 元のMarkdownを読み、そろえた後のMarkdown・章の対応表・lp28-check・Notionで置き換わるブロック数を出す。
 *                       外部には何も書かない。そろえた後のMarkdownは、案件フォルダの 28ch-dryrun/ に置く（ローカルのみ）。
 *   node scripts/dis/align-lp28.mjs --id DIS-LP-0009
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readJson } from "./lib/config.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { loadConfig } from "./lib/config.mjs";
import { listBlockChildren, notionFetch } from "../lib/notion-client.mjs";
import { mdToBlocks } from "./register-lp28.mjs";
import { checkLp28Chapter8 } from "./lib/lp28-check.mjs";
import { refTitles, parseChapters, basicInfo, alignToV40 } from "./lib/lp28-align.mjs";

const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? "").join("");
const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };

/** 旧ライブラリーのNotionページの「保存先」から、ローカルの同期フォルダにある最新の full_analysis（Markdown）を探す。 */
export async function findSourceMd(libProps, root = path.join(os.homedir(), "Dropbox")) {
  const raw = (libProps["保存先"]?.rich_text || []).map((t) => t.plain_text).join("") || (libProps["Dropbox正本パス"]?.rich_text || []).map((t) => t.plain_text).join("");
  if (!raw) return null;
  let p = raw.replace(/^https?:.*$/, "");
  const m = /^(.*?\/LP-0?\d+_[^/]+)/.exec(p);
  const base = m ? m[1] : p.replace(/\/03_Analysis.*$/, "");
  const cands = [path.join(root, base, "03_Analysis"), path.join(root, "Research_Library", "Design", "LP_Research_Library", base, "03_Analysis")];
  for (const dir of cands) {
    if (!(await exists(dir))) continue;
    const files = (await fs.readdir(dir)).filter((f) => /full_analysis_v\d+.*\.md$/.test(f) && !/draft/.test(f)).sort((a, b) => Number(/_v(\d+)/.exec(b)?.[1]) - Number(/_v(\d+)/.exec(a)?.[1]) || (b > a ? 1 : -1));
    if (files[0]) return { file: path.join(dir, files[0]), version: /_v(\d+)/.exec(files[0])?.[0].slice(1) };
  }
  return null;
}

async function main() {
  const t0 = Date.now();
  const { values: a } = parseArgs({ options: { id: { type: "string" } } });
  if (!a.id) throw new Error("--id DIS-LP-000n が必要です");
  const cfg = await loadConfig();
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === a.id && r.relation === "same_lp");
  if (!rel?.disNotionPageId || !rel.libraryNotionPageId) throw new Error(`${a.id}: 対応表にDISページ・旧LPページのIDがありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, a.id);
  const lib = await notionFetch(`/pages/${rel.libraryNotionPageId}`);
  const src = await findSourceMd(lib.properties);
  if (!src) throw new Error(`${a.id}: 旧ライブラリーの full_analysis（Markdown）が、同期フォルダに見つかりません`);
  const sourceMd = await fs.readFile(src.file, "utf8");
  const refMd = await fs.readFile((await fs.readdir(path.join(REPO_ROOT, "outputs/dis/LP"))).filter((d) => d.startsWith("0001_")).map((d) => path.join(REPO_ROOT, "outputs/dis/LP", d, "28ch/LP-0245_v1.0.md"))[0], "utf8");
  const ref = refTitles(refMd);
  const title = (lib.properties["タイトル"]?.title || []).map((t) => t.plain_text).join("");
  const brand = (/^LP-\d+｜(.+?)｜/.exec(title) || [])[1] || "";
  const props = { "取得日": lib.properties["取得日"]?.date?.start, "コピータイプ": (lib.properties["コピータイプ"]?.multi_select || []).map((o) => o.name).join("／"), "オファー": (lib.properties["オファー"]?.rich_text || []).map((t) => t.plain_text).join("") };
  const { chapters } = parseChapters(sourceMd);
  const aligned = alignToV40({ md: sourceMd, ref, lp: rel.libraryId, brand, disId: a.id, info: basicInfo(chapters.find((c) => c.n === 1)?.body || ""), props, thumbnailRef: "images/" + `${rel.libraryId}_thumbnail.jpg` });
  const chk = checkLp28Chapter8(aligned.md);

  // Notion: いまのDISページの28章の部分と、そろえた後のブロック数
  const blocks = await listBlockChildren(rel.disNotionPageId);
  const s = blocks.findIndex((b) => b.type === "heading_1" && text(b).startsWith("28章分析"));
  const oldPart = s >= 0 ? blocks.slice(s) : [];
  const newBlocks = mdToBlocks(aligned.md);
  const imgOld = oldPart.filter((b) => b.type === "image").length;
  const imgNew = newBlocks.filter((b) => b.__image).length;
  const countAll = (bl) => bl.reduce((n, b) => n + 1 + (b.table?.children?.length || 0), 0);
  const oldAll = oldPart.length; // 子ブロック（表の行など）は含まない、最上位のブロック数
  // Notionにいまある章の見出しと、そろえた後の章名の違い
  const nowTitles = oldPart.filter((b) => /^heading_[23]$/.test(b.type) && /^\d{1,2}\. /.test(text(b))).map((b) => text(b).replace(/\s+/g, " "));
  const newTitles = aligned.mapping.filter((m) => m.n <= 28).map((m) => `${m.n}. ${m.to}`);
  const titleDiff = newTitles.filter((t) => !nowTitles.includes(t));
  const dry = path.join(itemDir, "28ch-dryrun");
  await fs.mkdir(dry, { recursive: true });
  await fs.writeFile(path.join(dry, `${rel.libraryId}_v1.0.md`), aligned.md);
  const kinds = {};
  aligned.mapping.forEach((m) => (kinds[m.kind.split("（")[0]] = (kinds[m.kind.split("（")[0]] || 0) + 1));
  console.log(JSON.stringify({
    disId: a.id, lp: rel.libraryId, brand, 元のMarkdown: src.file, 元の版: src.version, 章数: chapters.length, Section数: (sourceMd.match(/^### Section \d+/gm) || []).length,
    章の対応の内訳: kinds, 名前が変わる章: aligned.mapping.filter((m) => m.kind.startsWith("名前変更")).map((m) => `${m.n}. ${m.from} → ${m.to}`),
    移す章: aligned.mapping.filter((m) => m.kind.includes("移動")).map((m) => `${m.n}. ${m.from} → ${m.to}`), 足す章: aligned.mapping.filter((m) => m.kind.startsWith("足す")).map((m) => `${m.n}. ${m.to}`),
    注意: aligned.notes, lp28check: chk, 作ったMarkdown: path.join(dry, `${rel.libraryId}_v1.0.md`),
    Notion: { DISページの全ブロック: blocks.length, 置き換わる28章の部分の最上位ブロック数: oldAll, 置き換わる画像: imgOld, そろえた後の最上位ブロック数: newBlocks.length, そろえた後の表の行を含む総数: countAll(newBlocks), 後の画像: imgNew },
    Notionの今の章名と違うもの: titleDiff,
    秒: Math.round((Date.now() - t0) / 1000),
  }, null, 2));
  console.log("\n--- 章の対応 ---");
  for (const m of aligned.mapping) console.log(`${String(m.n).padStart(2)}. ${m.from ?? "（無し）"} → ${m.to}  [${m.kind}]`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
