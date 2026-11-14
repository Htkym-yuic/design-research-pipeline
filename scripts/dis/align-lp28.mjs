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
import { constants as fsc } from "node:fs";
import { fileURLToPath } from "node:url";
import { REPO_ROOT, readJson } from "./lib/config.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { loadConfig } from "./lib/config.mjs";
import { listBlockChildren, notionFetch } from "../lib/notion-client.mjs";
import { mdToBlocks } from "./register-lp28.mjs";
import * as nc from "../lib/notion-client.mjs";
import { toJpeg, upload } from "./merge-library.mjs";
import { copyToLocalDropbox, waitForSync } from "./register-new-dis.mjs";
import { readNotionChapter28 } from "./compare-lp28.mjs";
import { compareNotionToMd } from "./lib/lp28-compare.mjs";
import { dropboxFolder } from "./lib/adapters.mjs";
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notionUrl = (id) => `https://app.notion.com/p/${String(id).replace(/-/g, "")}`;

/** 準備（読み取りのみ）: 元のMarkdown・そろえた後のMarkdown・Notionの今の28章の部分・比較。 */
export async function prepare(disId) {
  const cfg = await loadConfig();
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === disId && r.relation === "same_lp");
  if (!rel?.disNotionPageId || !rel.libraryNotionPageId) throw new Error(`${disId}: 対応表にDISページ・旧LPページのIDがありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, disId);
  const lib = await notionFetch(`/pages/${rel.libraryNotionPageId}`);
  const src = await findSourceMd(lib.properties);
  if (!src) throw new Error(`${disId}: 旧ライブラリーの full_analysis（Markdown）が、同期フォルダに見つかりません`);
  const sourceMd = await fs.readFile(src.file, "utf8");
  const refFile = (await fs.readdir(path.join(REPO_ROOT, "outputs/dis/LP"))).filter((d) => d.startsWith("0001_")).map((d) => path.join(REPO_ROOT, "outputs/dis/LP", d, "28ch/LP-0245_v1.0.md"))[0];
  const ref = refTitles(await fs.readFile(refFile, "utf8"));
  const title = (lib.properties["タイトル"]?.title || []).map((t) => t.plain_text).join("");
  const brand = (/^LP-\d+｜(.+?)｜/.exec(title) || [])[1] || "";
  const props = { "取得日": lib.properties["取得日"]?.date?.start, "コピータイプ": (lib.properties["コピータイプ"]?.multi_select || []).map((o) => o.name).join("／"), "オファー": (lib.properties["オファー"]?.rich_text || []).map((t) => t.plain_text).join("") };
  const { chapters } = parseChapters(sourceMd);
  const aligned = alignToV40({ md: sourceMd, ref, lp: rel.libraryId, brand, disId, info: basicInfo(chapters.find((c) => c.n === 1)?.body || ""), props, thumbnailRef: `images/${rel.libraryId}_thumbnail.jpg` });
  const blocks = await listBlockChildren(rel.disNotionPageId);
  const n28 = await readNotionChapter28(rel.disNotionPageId, blocks);
  const cmp = compareNotionToMd({ notionLines: n28.lines.filter((l) => !l.startsWith("以下は、旧ライブラリーの")), notionChapterNums: n28.nums, md: sourceMd });
  return { cfg, rel, itemDir, src, sourceMd, chapters, ref, brand, aligned, blocks, n28, cmp, lp: rel.libraryId };
}

async function backupBlocks(ctx, file) {
  const full = [];
  for (const b of ctx.blocks) {
    const o = { ...b };
    if (b.type === "table") o.__rows = await listBlockChildren(b.id);
    full.push(o);
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ disId: ctx.rel.disId, pageId: ctx.rel.disNotionPageId, at: new Date().toISOString(), blocks: full }), { flag: "wx" });
  return full.length;
}

async function apply(disId) {
  if (process.env.DIS_ENABLE_WRITES !== "true" || process.env.DRY_RUN !== "false") throw new Error("DIS_ENABLE_WRITES=true と DRY_RUN=false が必要です");
  const ctx = await prepare(disId);
  const { rel, aligned, n28, cmp, lp } = ctx;
  // 1) 止める条件（Notionにしか無い章・あとから足した内容があるページは、書き換えずに止まる）
  if (n28.start < 0) throw new Error(`${disId}: Notionに「28章分析」の見出しがありません。何も書いていません`);
  if (n28.part.some((b) => b.type === "heading_1" && text(b).startsWith("28章分析（統一28章 v4.0）"))) throw new Error(`${disId}: すでにそろえ済みです。何も書いていません`);
  if (cmp.notionOnlyChapters.length || n28.lateBlocks) throw new Error(`${disId}: Notionにしか無い内容があるため、止めます（章: ${cmp.notionOnlyChapters.join(",") || "なし"}／あとから足した・直したブロック: ${n28.lateBlocks}件）。何も書いていません`);
  const chk = checkLp28Chapter8(aligned.md);
  if (!chk.ok) throw new Error(`${disId}: lp28-check がNGです（${chk.errors.join(" / ")}）。何も書いていません`);
  const t0 = Date.now();

  // 2) 画像（章2の6枠＋サムネイル）。元のMarkdownからの相対パスを、28ch/images/ の名前に直す
  const srcDir = path.dirname(ctx.src.file);
  const imgDir = await fs.mkdtemp(path.join(os.tmpdir(), "dis-align-"));
  const map = new Map(); // md内の参照 → { local, name }
  let md = aligned.md;
  const thumb = path.join(imgDir, `${lp}_thumbnail.jpg`);
  const fv = path.join(ctx.itemDir, "files", "01_Normal_Images", `${disId}_PC_first_view.png`);
  if (await exists(fv)) { const { default: sharp } = await import("sharp"); await sharp(fv, { limitInputPixels: false }).resize({ width: 640, withoutEnlargement: true }).jpeg({ quality: 80 }).toFile(thumb); map.set(`images/${lp}_thumbnail.jpg`, { local: thumb, name: `${lp}_thumbnail.jpg` }); }
  else md = md.replace(new RegExp(`^!\\[サムネイル\\]\\(images/${lp}_thumbnail\\.jpg\\)\\s*\n`, "m"), "");
  for (const m of [...md.matchAll(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/gm)]) {
    const ref = m[2];
    if (map.has(ref) || ref.startsWith("images/")) continue;
    const local = path.resolve(srcDir, ref);
    if (!(await exists(local))) { md = md.replace(m[0], `（画像は旧ライブラリーに無い: ${path.basename(ref)}）`); continue; }
    map.set(ref, { local, name: path.basename(ref) });
  }
  for (const [ref, v] of map) md = md.split(`](${ref})`).join(`](images/${v.name})`);
  const files = [...map.values()];
  const names = new Set(); for (const f of files) { if (names.has(f.name)) throw new Error(`画像の名前が重なっています: ${f.name}`); names.add(f.name); }

  // 3) Dropbox: 28ch/ を新規に作る（上書きしない）
  const disFolder = (await notionFetch(`/pages/${rel.disNotionPageId}`)).properties["Dropbox正本パス"]?.rich_text?.map((t) => t.plain_text).join("") || dropboxFolder(ctx.cfg, "lp", (await readJson(path.join(ctx.itemDir, "item.json"))).date, disId);
  const mdLocal = path.join(imgDir, `${lp}_v1.0.md`);
  await fs.writeFile(mdLocal, md);
  const plan = [{ local: mdLocal, remote: `${disFolder}/28ch/${lp}_v1.0.md` }, ...files.map((f) => ({ local: f.local, remote: `${disFolder}/28ch/images/${f.name}` }))];
  // ローカルの案件フォルダにも、同じ内容を置く
  const localCh = path.join(ctx.itemDir, "28ch");
  await fs.mkdir(path.join(localCh, "images"), { recursive: true });
  await fs.copyFile(mdLocal, path.join(localCh, `${lp}_v1.0.md`), fsc.COPYFILE_EXCL);
  for (const f of files) await fs.copyFile(f.local, path.join(localCh, "images", f.name), fsc.COPYFILE_EXCL);
  const root = process.env.DROPBOX_LOCAL_ROOT || path.join(os.homedir(), "Dropbox");
  const { copied } = await copyToLocalDropbox({ plan, folder: `${disFolder}/28ch`, root });
  const { listFolder } = await import("../lib/dropbox-client.mjs");
  const sync = await waitForSync({ copied, folder: `${disFolder}/28ch`, listFolder, log: (m) => console.error(m) });
  if (!sync.ok) throw new Error(`${disId}: Dropboxの同期が完了していません（${sync.missing.join(", ")}）。Notionには書いていません`);
  console.log(`Dropbox: 28ch/ に ${copied.length}ファイルを置き、同期を確認しました`);

  // 4) 消す一覧の表示と、ブロック一覧のバックアップ（実行の直前）
  const old = n28.part;
  const byType = {}; old.forEach((b) => (byType[b.type] = (byType[b.type] || 0) + 1));
  console.log(`\n■ 消す予定（置き換える）: DISページ ${rel.disId} の「28章分析（旧ライブラリー）」の部分 ${old.length}ブロック（${Object.entries(byType).map(([k, v]) => `${k}:${v}`).join(", ")}）`);
  console.log("  見出し:", old.filter((b) => /^heading_[123]$/.test(b.type)).map((b) => text(b).slice(0, 22)).join(" / "));
  const bk = path.join(REPO_ROOT, "outputs/dis/backup", `${disId}-28ch-before-align.json`);
  const nb = await backupBlocks(ctx, bk);
  console.log(`  バックアップ: ${bk}（ページ全体の最上位 ${nb}ブロック、表の行つき）`);

  // 5) 新しいブロックを、ページの末尾に追加（古いブロックは、まだ消さない）
  const body = mdToBlocks(md);
  const blocks = [nc.headingBlock(`28章分析（統一28章 v4.0）｜${lp}`, 1), nc.paragraphBlock(`以下は、${lp} の28章分析（旧ライブラリーの本文。章の名前と並びを統一28章 v4.0 にそろえた版。内容は書き換えていない。章29「更新履歴」は、章24の末尾へ移した）。上のDIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`)];
  for (const b of body) {
    if (!b.__image) { blocks.push(b); continue; }
    const v = [...map.entries()].find(([k, x]) => `images/${x.name}` === b.__image.rel);
    if (!v) { blocks.push(nc.paragraphBlock(`（画像: ${b.__image.rel}）`)); continue; }
    blocks.push(nc.imageUploadBlock(await upload(await toJpeg(v[1].local, v[1].name.replace(/\.[^.]+$/, ""))), b.__image.caption));
  }
  const before = ctx.blocks.length;
  let added = 0;
  try {
    for (let i = 0; i < blocks.length; i += 90) { await nc.appendBlockChildren(rel.disNotionPageId, blocks.slice(i, i + 90)); added += Math.min(90, blocks.length - i); await sleep(350); }
  } catch (e) {
    throw new Error(`${disId}: 新しいブロックの追加の途中で失敗しました（${added}/${blocks.length}）。古いブロックは消していません。追加済みの新しいブロックは、ページの末尾に残っています: ${e.message}`);
  }
  const mid = await listBlockChildren(rel.disNotionPageId);
  if (mid.length !== before + blocks.length) throw new Error(`${disId}: 追加後のブロック数が合いません（${before}+${blocks.length}≠${mid.length}）。古いブロックは消していません`);

  // 6) 新しいブロックが全部入ったので、古いブロックを消す（失敗したら、そこで止まる）
  let deleted = 0;
  for (const b of old) {
    try { await nc.notionFetch(`/blocks/${b.id}`, { method: "DELETE" }); } // 429・一時的なエラーは、notionFetch が待って再試行する
    catch (e) { throw new Error(`${disId}: 古いブロックの削除が失敗しました（${e.message}。${deleted}/${old.length}件まで削除済み）。止まります。残りの古いブロックと、新しいブロックの両方が、ページに残っています`); }
    deleted++; await sleep(250);
  }

  // 7) 読み直し
  const after = await listBlockChildren(rel.disNotionPageId);
  const unchanged = ctx.blocks.slice(0, n28.start).every((b, i) => after[i]?.id === b.id && after[i].type === b.type);
  const n2 = await readNotionChapter28(rel.disNotionPageId, after);
  const nums = n2.nums.filter((n) => n >= 1 && n <= 29);
  const dupOrMissing = [...Array(28)].map((_, i) => i + 1).filter((n) => nums.filter((x) => x === n).length !== 1);
  const ch24 = (() => { const i = after.findIndex((b) => /^heading_2$/.test(b.type) && text(b).startsWith("24. 更新・検証記録")); const j = after.findIndex((b, k) => k > i && /^heading_2$/.test(b.type)); return after.slice(i, j).some((b) => text(b).startsWith("旧・章29")); })();
  const result = { disId, lp, url: notionUrl(rel.disNotionPageId), 置き換えた古いブロック: deleted, 追加した新しいブロック: blocks.length, 画像: { 旧: old.filter((b) => b.type === "image").length, 新: blocks.filter((b) => b.type === "image").length }, lp28check: chk, "28章より前の部分が不変": unchanged, "章1〜28が各1回": dupOrMissing.length === 0, "章29の見出し無し": !nums.includes(29), "章24の末尾に旧・章29": ch24, 全ブロック: { 前: before, 後: after.length }, 秒: Math.round((Date.now() - t0) / 1000), backup: bk };
  const logf = path.join(REPO_ROOT, "data/dis-merge-log.json");
  const lg = JSON.parse(await fs.readFile(logf, "utf8")); lg.entries.push({ at: new Date().toISOString(), kind: "align-lp28", ...result }); await fs.writeFile(logf, JSON.stringify(lg, null, 2) + "\n");
  console.log("\n" + JSON.stringify(result, null, 2));
}

async function main() {
  const t0 = Date.now();
  const { values: a } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!a.id) throw new Error("--id DIS-LP-000n が必要です");
  if (a.apply) return apply(a.id);
  const { rel, itemDir, src, sourceMd, chapters, aligned, blocks, n28, cmp, lp, brand } = await prepare(a.id);
  const chk = checkLp28Chapter8(aligned.md);
  const newBlocks = mdToBlocks(aligned.md);
  const imgOld = n28.part.filter((b) => b.type === "image").length;
  const imgNew = newBlocks.filter((b) => b.__image).length;
  const countAll = (bl) => bl.reduce((n, b) => n + 1 + (b.table?.children?.length || 0), 0);
  const nowTitles = n28.part.filter((b) => /^heading_[23]$/.test(b.type) && /^\d{1,2}\. /.test(text(b))).map((b) => text(b).replace(/\s+/g, " "));
  const titleDiff = aligned.mapping.filter((m) => m.n <= 28).map((m) => `${m.n}. ${m.to}`).filter((t) => !nowTitles.includes(t));
  const dry = path.join(itemDir, "28ch-dryrun");
  await fs.mkdir(dry, { recursive: true });
  await fs.writeFile(path.join(dry, `${lp}_v1.0.md`), aligned.md);
  console.log(JSON.stringify({ disId: a.id, lp, brand, 元のMarkdown: src.file, 章数: chapters.length, Section数: (sourceMd.match(/^### Section \d+/gm) || []).length, lp28check: chk, Notionにしか無い章: cmp.notionOnlyChapters, あとから足した・直したブロック: n28.lateBlocks, 版の違いの行: cmp.notionOnlyLines.length, Notion: { DISページの全ブロック: blocks.length, 置き換わる28章の部分: n28.part.length, 置き換わる画像: imgOld, そろえた後の最上位ブロック数: newBlocks.length, 表の行を含む総数: countAll(newBlocks), 後の画像: imgNew }, Notionの今の章名と違うもの: titleDiff, 秒: Math.round((Date.now() - t0) / 1000) }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
