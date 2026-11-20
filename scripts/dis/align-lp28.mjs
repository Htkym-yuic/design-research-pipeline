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
import fsSync, { constants as fsc } from "node:fs";
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
import { refTitles, parseChapters, basicInfo, alignToV40, detectChapterMap, moveCh29ToCh24 } from "./lib/lp28-align.mjs";

const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? "").join("");
const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };

/** 旧ライブラリーのNotionページの「保存先」から、ローカルの同期フォルダにある最新の full_analysis（Markdown）を探す。 */
export async function findSourceMd(libProps, root = path.join(os.homedir(), "Dropbox")) {
  const raw = (libProps["保存先"]?.rich_text || []).map((t) => t.plain_text).join("") || (libProps["Dropbox正本パス"]?.rich_text || []).map((t) => t.plain_text).join("");
  const byNumber = async () => {
    // 「保存先」が短く切れている・空のとき: LP番号から、01_By_Date 配下の LP-nnnn_… フォルダを探す
    const id = /^LP-0*(\d+)/.exec((libProps["タイトル"]?.title || []).map((t) => t.plain_text).join(""))?.[1];
    if (!id) return null;
    const lib = path.join(root, "Research_Library", "Design", "LP_Research_Library", "01_By_Date");
    if (!(await exists(lib))) return null;
    const hits = [];
    for (const d of await fs.readdir(lib)) for (const k of ["LP"]) {
      const lv1 = path.join(lib, d, k); if (!(await exists(lv1))) continue;
      for (const c of await fs.readdir(lv1)) {
        const lv2 = path.join(lv1, c); if (!(await fs.stat(lv2)).isDirectory()) continue;
        for (const f of await fs.readdir(lv2)) if (new RegExp(`^LP-0*${id}_`).test(f) && !/pre_recovery/.test(f)) hits.push(path.join(lv2, f, "03_Analysis"));
      }
    }
    for (const dir of hits) {
      if (!(await exists(dir))) continue;
      const files = (await fs.readdir(dir)).filter((f) => /full_analysis_v\d+.*\.md$/.test(f) && !/draft/.test(f)).sort((a, b) => Number(/_v(\d+)/.exec(b)?.[1]) - Number(/_v(\d+)/.exec(a)?.[1]) || (b > a ? 1 : -1));
      if (files[0]) return { file: path.join(dir, files[0]), version: /_v(\d+)/.exec(files[0])?.[0].slice(1) };
    }
    return null;
  };
  if (!raw) return byNumber();
  let p = raw.replace(/^https?:.*$/, "");
  const m = /^(.*?\/LP-0?\d+_[^/]+)/.exec(p);
  const base = m ? m[1] : p.replace(/\/03_Analysis.*$/, "");
  const cands = [path.join(root, base, "03_Analysis"), path.join(root, "Research_Library", "Design", "LP_Research_Library", base, "03_Analysis")];
  for (const dir of cands) {
    if (!(await exists(dir))) continue;
    const files = (await fs.readdir(dir)).filter((f) => /full_analysis_v\d+.*\.md$/.test(f) && !/draft/.test(f)).sort((a, b) => Number(/_v(\d+)/.exec(b)?.[1]) - Number(/_v(\d+)/.exec(a)?.[1]) || (b > a ? 1 : -1));
    if (files[0]) return { file: path.join(dir, files[0]), version: /_v(\d+)/.exec(files[0])?.[0].slice(1) };
  }
  return byNumber();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const notionUrl = (id) => `https://app.notion.com/p/${String(id).replace(/-/g, "")}`;


/** Notionの旧28章の部分（ブロック）を、Markdownにする（mdが無いページ用）。太字・コード・リンクは残す。画像は、案件フォルダの標準画像の6枠に、前の小見出しで対応づける。 */
async function notionPartToMd(part, { itemDir, disId }) {
  const rtMd = (arr) => (arr || []).map((x) => { let s = x.plain_text ?? ""; if (!s) return ""; const a = x.annotations || {}; if (a.code) s = "`" + s + "`"; if (a.bold) s = "**" + s + "**"; if (x.href) s = `[${s}](${x.href})`; return s; }).join("");
  const slots = [["PC Full Page", "PC_full"], ["PC First View", "PC_first_view"], ["PC Section一覧", "PC_sections"], ["SP Full Page", "SP_full"], ["SP First View", "SP_first_view"], ["SP Section一覧", "SP_sections"]];
  const out = []; let h3 = "", num = 0, prevNum = false, notionImgDir = null, notionImgN = 0;
  for (const b of part.slice(1)) {
    const rich = b[b.type]?.rich_text;
    const tx = rtMd(rich);
    if (b.type !== "numbered_list_item") { prevNum = false; num = 0; }
    if (b.type === "paragraph") { if (!tx.startsWith("以下は、旧ライブラリーの")) out.push(tx, ""); }
    else if (b.type === "heading_2") out.push("", `## ${text(b)}`, "");
    else if (b.type === "heading_3") { h3 = text(b); out.push("", `### ${text(b)}`, ""); }
    else if (b.type === "bulleted_list_item") out.push(`- ${tx}`);
    else if (b.type === "numbered_list_item") { num = prevNum ? num + 1 : 1; prevNum = true; out.push(`${num}. ${tx}`); }
    else if (b.type === "quote") out.push(`> ${tx}`, "");
    else if (b.type === "divider") out.push("---", "");
    else if (b.type === "table") {
      const rows = (await listBlockChildren(b.id)).map((r) => r.table_row.cells.map((c) => rtMd(c).replace(/\|/g, "／").replace(/\n/g, " ")));
      if (rows.length) out.push("", `| ${rows[0].join(" | ")} |`, `| ${rows[0].map(() => "---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`), "");
    } else if (b.type === "image") {
      const slot = h3.includes("旧画像") ? null : slots.find(([title]) => h3.includes(title));
      let file = slot && itemDir ? path.join(itemDir, "files", "01_Normal_Images", `${disId}_${slot[1]}.png`) : null;
      if (!(file && fsSync.existsSync(file))) {
        // 標準画像に当たらない画像（例: 旧画像・参照のみ）は、いまのNotionの画像をそのまま取り出して、入れ直す
        file = null;
        const img = b.image; const url = img?.type === "file" ? img.file.url : img?.type === "external" ? img.external.url : "";
        if (url) { const r = await fetch(url); if (r.ok) { const ext = (/image\/(png|jpe?g|webp|gif)/.exec(r.headers.get("content-type") || "")?.[1] || "png").replace("jpeg", "jpg"); const dir = notionImgDir || (notionImgDir = await fs.mkdtemp(path.join(os.tmpdir(), "dis-notion-img-"))); file = path.join(dir, `${disId}_notion_${++notionImgN}.${ext}`); await fs.writeFile(file, Buffer.from(await r.arrayBuffer())); } }
      }
      if (file) out.push("", `![${h3}](${file})`, ""); else out.push("", `（画像を取り込めなかった: ${h3 || "小見出しなし"}）`, "");
    } else if (tx) out.push(tx, "");
    else out.push("", `（${b.type} は、取り込めなかった）`, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

/** 準備（読み取りのみ）: 元のMarkdown・そろえた後のMarkdown・Notionの今の28章の部分・比較。 */
export async function prepare(disId, opts = {}) {
  const cfg = await loadConfig();
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === disId && r.relation === "same_lp");
  if (!rel?.disNotionPageId || !rel.libraryNotionPageId) throw new Error(`${disId}: 対応表にDISページ・旧LPページのIDがありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, disId);
  const lib = await notionFetch(`/pages/${rel.libraryNotionPageId}`);
  const src = opts.replaceV40 ? { file: opts.md } : opts.fromNotion ? { file: "(Notionの本文から作成)" } : await findSourceMd(lib.properties);
  if (!src) throw new Error(`${disId}: 旧ライブラリーの full_analysis（Markdown）が、同期フォルダに見つかりません`);
  const blocks = await listBlockChildren(rel.disNotionPageId);
  // 置き換える部分: 通常は「28章分析（旧ライブラリー）」の見出しから。--replace-v40 は、すでにある「28章分析（統一28章 v4.0）」の部分だけ
  const v40off = opts.replaceV40 ? blocks.findIndex((b) => b.type === "heading_1" && text(b).startsWith("28章分析（統一28章 v4.0）")) : 0;
  if (opts.replaceV40 && v40off < 0) throw new Error(`${disId}: 「28章分析（統一28章 v4.0）」の見出しがありません`);
  const n28raw = await readNotionChapter28(rel.disNotionPageId, v40off ? blocks.slice(v40off) : blocks);
  const n28 = { ...n28raw, start: n28raw.start < 0 ? -1 : n28raw.start + v40off };
  const itemDirForImages = itemDir;
  const sourceMd = opts.fromNotion ? await notionPartToMd(n28.part, { itemDir: itemDirForImages, disId }) : await fs.readFile(src.file, "utf8");
  const refFile = (await fs.readdir(path.join(REPO_ROOT, "outputs/dis/LP"))).filter((d) => d.startsWith("0001_")).map((d) => path.join(REPO_ROOT, "outputs/dis/LP", d, "28ch/LP-0245_v1.0.md"))[0];
  const ref = refTitles(await fs.readFile(refFile, "utf8"));
  const title = (lib.properties["タイトル"]?.title || []).map((t) => t.plain_text).join("");
  const brand = (/^LP-\d+｜(.+?)｜/.exec(title) || [])[1] || "";
  const props = { "取得日": lib.properties["取得日"]?.date?.start, "コピータイプ": (lib.properties["コピータイプ"]?.multi_select || []).map((o) => o.name).join("／"), "オファー": (lib.properties["オファー"]?.rich_text || []).map((t) => t.plain_text).join("") };
  const { chapters } = parseChapters(sourceMd);
  const cmp = compareNotionToMd({ notionLines: n28.lines.filter((l) => !l.startsWith("以下は、旧ライブラリーの")), notionChapterNums: n28.nums, md: sourceMd });
  const isP4 = Boolean(detectChapterMap(chapters));
  // 章0〜27の形（章0が実行・重複防止記録）: 章0を章28にする。Notionの章29（更新履歴）は、章24の末尾へ移す
  const shift0 = !isP4 && chapters.some((c) => c.n === 0) && !chapters.some((c) => c.n === 28) && chapters.every((c) => c.n <= 27);
  const normal = (k) => path.join(itemDir, "files", "01_Normal_Images", `${disId}_${k}.png`);
  // 別構成（P4）は、mdに章2の画像が無い → 標準画像の6枠を足す。章0〜27の形は、mdに無いFirst Viewの2枠だけを足す
  const slots = isP4 ? [["PC Full Page", "PC_full"], ["PC First View", "PC_first_view"], ["PC Section一覧", "PC_sections"], ["SP Full Page", "SP_full"], ["SP First View", "SP_first_view"], ["SP Section一覧", "SP_sections"]]
    : shift0 ? [["PC First View", "PC_first_view"], ["SP First View", "SP_first_view"]] : [];
  const ch2Images = itemDir ? slots.map(([title, k]) => ({ title, ref: normal(k) })).filter((x) => fsSync.existsSync(x.ref)) : [];
  // Notionにだけあるもの（取り込む）
  const part = n28.part, t0 = part.length ? Date.parse(part[0].created_time) : 0;
  const lateIdx = part.map((_, i) => i).filter((i) => Date.parse(part[i].created_time) - t0 > 30 * 60e3 || Date.parse(part[i].last_edited_time) - Date.parse(part[i].created_time) > 30 * 60e3);
  const lateOk = lateIdx.length > 0 && lateIdx.every((i, k) => (k === 0 ? part[i].type === "heading_2" && /^28\. /.test(text(part[i])) : ["paragraph", "bulleted_list_item"].includes(part[i].type)));
  const carry = { ch28Blocks: 0, ch29Blocks: 0, ch28Md: "", ch29Md: "" };
  if (lateOk) { carry.ch28Blocks = lateIdx.length; carry.ch28Md = await blocksToMd(lateIdx.slice(1).map((i) => part[i])); }
  if (shift0) {
    const i29 = part.findIndex((b) => b.type === "heading_2" && /^29\. /.test(text(b)));
    if (i29 >= 0) { carry.ch29Blocks = part.length - i29; carry.ch29Md = await blocksToMd(part.slice(i29 + 1)); }
  }
  const aligned = opts.replaceV40
    ? { md: moveCh29ToCh24(sourceMd), mapping: chapters.filter((c) => c.n <= 28).map((c) => ({ n: c.n, from: c.title, to: ref[c.n] || c.title, kind: "同名" })), notes: [] }
    : alignToV40({ ch2Images: opts.fromNotion ? [] : ch2Images, notionCh28Md: carry.ch28Md, notionCh29Md: carry.ch29Md, md: sourceMd, ref, lp: rel.libraryId, brand, disId, info: basicInfo(chapters.find((c) => c.n === 1)?.body || ""), props, thumbnailRef: `images/${rel.libraryId}_thumbnail.jpg` });
  // 取り込めるもの以外に、Notionにしか無いものが残っているか（章28・29は、取り込む分だけ除く）
  // 章0（旧v2の実行・重複防止記録）の中身は、章28の補完記録（章0の写し）として、取り込む。章0と写しの文が、同じかも確かめる
  const ch0Copied = lateOk && cmp.notionOnlyChapters.includes(0);
  const handled = { chapters: [...(shift0 ? [28, 29] : []), ...(ch0Copied ? [0] : [])], lateBlocks: carry.ch28Blocks };
  const unhandledChapters = cmp.notionOnlyChapters.filter((n) => !handled.chapters.includes(n));
  const unhandledLate = n28.lateBlocks - handled.lateBlocks;
  return { cfg, rel, itemDir, src, sourceMd, chapters, ref, brand, aligned, blocks, n28, cmp, lp: rel.libraryId, carry, unhandledChapters, unhandledLate, v40off };
}

/** Notionのブロック（段落・箇条書き・表・小見出し）を、Markdownの文字にする（取り込み用。文字だけ）。 */
async function blocksToMd(bl) {
  const out = [];
  for (const b of bl) {
    const tx = text(b);
    if (b.type === "paragraph") { if (tx) out.push(tx, ""); }
    else if (b.type === "bulleted_list_item") out.push(`- ${tx}`);
    else if (b.type === "numbered_list_item") out.push(`1. ${tx}`);
    else if (/^heading_[23]$/.test(b.type)) out.push("", `#### ${tx}`, "");
    else if (b.type === "table") {
      const rows = (await listBlockChildren(b.id)).map((r) => r.table_row.cells.map((c) => c.map((x) => x.plain_text).join("").replace(/\|/g, "／").replace(/\n/g, " ")));
      if (rows.length) out.push("", `| ${rows[0].join(" | ")} |`, `| ${rows[0].map(() => "---").join(" | ")} |`, ...rows.slice(1).map((r) => `| ${r.join(" | ")} |`), "");
    } else if (tx) out.push(tx, "");
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
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

async function apply(disId, opts = {}) {
  if (process.env.DIS_ENABLE_WRITES !== "true" || process.env.DRY_RUN !== "false") throw new Error("DIS_ENABLE_WRITES=true と DRY_RUN=false が必要です");
  const ctx = await prepare(disId, opts);
  const { rel, aligned, n28, cmp, lp } = ctx;
  // 1) 止める条件（Notionにしか無い章・あとから足した内容があるページは、書き換えずに止まる）
  if (n28.start < 0) throw new Error(`${disId}: Notionに「28章分析」の見出しがありません。何も書いていません`);
  if (!opts.replaceV40 && n28.part.some((b) => b.type === "heading_1" && text(b).startsWith("28章分析（統一28章 v4.0）"))) throw new Error(`${disId}: すでにそろえ済みです。何も書いていません`);
  if (ctx.unhandledChapters.length || ctx.unhandledLate) throw new Error(`${disId}: Notionにしか無い内容があるため、止めます（章: ${ctx.unhandledChapters.join(",") || "なし"}／あとから足した・直したブロック: ${ctx.unhandledLate}件）。何も書いていません`);
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
  else if (!opts.replaceV40) md = md.replace(new RegExp(`^!\\[サムネイル\\]\\(images/${lp}_thumbnail\\.jpg\\)\\s*\n`, "m"), "");
  for (const m of [...md.matchAll(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/gm)]) {
    const ref = m[2];
    if (map.has(ref) || (ref.startsWith("images/") && !opts.replaceV40)) continue;
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
  const intro = opts.replaceV40
    ? `以下は、${lp} の28章分析（v1.0。アーカイブ画像から作成した版を、表のまま入れ直した）。章29「更新履歴」は、章24の末尾へ移した。上の「分析テスト v0.1」・DIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`
    : opts.fromNotion
      ? `以下は、${lp} の28章分析（旧ライブラリーの本文。Dropboxに元のMarkdownが無いため、Notionの本文から作った。章の名前と並びを統一28章 v4.0 にそろえた版。内容は書き換えていない。章29「更新履歴」は、章24の末尾へ移した）。上のDIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`
      : `以下は、${lp} の28章分析（旧ライブラリーの本文。章の名前と並びを統一28章 v4.0 にそろえた版。内容は書き換えていない。章29「更新履歴」は、章24の末尾へ移した）。上のDIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`;
  const blocks = [nc.headingBlock(`28章分析（統一28章 v4.0）｜${lp}`, 1), nc.paragraphBlock(intro)];
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
  const off = ctx.v40off || 0;
  const n2 = await readNotionChapter28(rel.disNotionPageId, off ? after.slice(off) : after);
  const nums = n2.nums.filter((n) => n >= 1 && n <= 29);
  const dupOrMissing = [...Array(28)].map((_, i) => i + 1).filter((n) => nums.filter((x) => x === n).length !== 1);
  const ch24 = (() => { const a2 = off ? after.slice(off) : after; const i = a2.findIndex((b) => /^heading_2$/.test(b.type) && text(b).startsWith("24. 更新・検証記録")); const j = a2.findIndex((b, k) => k > i && /^heading_2$/.test(b.type)); return a2.slice(i, j).some((b) => text(b).startsWith("旧・章29")); })();
  const result = { disId, lp, url: notionUrl(rel.disNotionPageId), 置き換えた古いブロック: deleted, 追加した新しいブロック: blocks.length, 画像: { 旧: old.filter((b) => b.type === "image").length, 新: blocks.filter((b) => b.type === "image").length }, lp28check: chk, "28章より前の部分が不変": unchanged, "章1〜28が各1回": dupOrMissing.length === 0, "章29の見出し無し": !nums.includes(29), "章24の末尾に旧・章29": ch24, 全ブロック: { 前: before, 後: after.length }, 秒: Math.round((Date.now() - t0) / 1000), backup: bk };
  const logf = path.join(REPO_ROOT, "data/dis-merge-log.json");
  const lg = JSON.parse(await fs.readFile(logf, "utf8")); lg.entries.push({ at: new Date().toISOString(), kind: "align-lp28", ...result }); await fs.writeFile(logf, JSON.stringify(lg, null, 2) + "\n");
  console.log("\n" + JSON.stringify(result, null, 2));
}

async function main() {
  const t0 = Date.now();
  const { values: a } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false }, "replace-v40": { type: "boolean", default: false }, md: { type: "string" }, "from-notion": { type: "boolean", default: false } } });
  const opts = { replaceV40: a["replace-v40"], md: a.md, fromNotion: a["from-notion"] };
  if (opts.replaceV40 && !opts.md) throw new Error("--replace-v40 には --md <ファイル> が必要です");
  if (!a.id) throw new Error("--id DIS-LP-000n が必要です");
  if (a.apply) return apply(a.id, opts);
  const ctx = await prepare(a.id, opts);
  const { rel, itemDir, src, sourceMd, chapters, aligned, blocks, n28, cmp, lp, brand } = ctx;
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
  console.log(JSON.stringify({ disId: a.id, lp, brand, 元のMarkdown: src.file, 章数: chapters.length, Section数: (sourceMd.match(/^### Section \d+/gm) || []).length, lp28check: chk, Notionにしか無い章: cmp.notionOnlyChapters, 取り込む: { 章28の補完記録のブロック: ctx.carry.ch28Blocks, 章29のブロック: ctx.carry.ch29Blocks, 章0を章28へ: ctx.carry.ch29Blocks > 0 || aligned.mapping.some((m) => m.kind === "章0→章28へ移動") }, 取り込めずに残る: { 章: ctx.unhandledChapters, ブロック: ctx.unhandledLate }, あとから足した・直したブロック: n28.lateBlocks, 版の違いの行: cmp.notionOnlyLines.length, Notion: { DISページの全ブロック: blocks.length, 置き換わる28章の部分: n28.part.length, 置き換わる画像: imgOld, そろえた後の最上位ブロック数: newBlocks.length, 表の行を含む総数: countAll(newBlocks), 後の画像: imgNew }, Notionの今の章名と違うもの: titleDiff, 秒: Math.round((Date.now() - t0) / 1000) }, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
