#!/usr/bin/env node
/**
 * 215件のDISページについて、Notionの今の28章と、Dropboxの最新の .md を、読み取りだけで比べる。
 *   Notionにしか無い章・文があるページを、一覧にする（書き換えると消えてしまうページ）。
 *   node scripts/dis/compare-lp28.mjs [--out <json>] [--only DIS-LP-0009,...]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/config.mjs";
import { listBlockChildren, notionFetch } from "../lib/notion-client.mjs";
import { compareNotionToMd } from "./lib/lp28-compare.mjs";
import { findSourceMd } from "./align-lp28.mjs";

const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? "").join("");

/** DISページの「28章分析」の部分を、行（文字）と、章番号にして取り出す。表の行は、セルを「 | 」でつなぐ。 */
export async function readNotionChapter28(pageId, blocks = null) {
  const bl = blocks || (await listBlockChildren(pageId));
  const s = bl.findIndex((b) => b.type === "heading_1" && text(b).startsWith("28章分析"));
  if (s < 0) return { start: -1, part: [], lines: [], nums: [], lateBlocks: 0 };
  const part = bl.slice(s);
  const lines = [], nums = [];
  const t0 = Date.parse(part[0].created_time);
  // 28章の見出しより、30分以上あとに作られた・編集されたブロック（あとから足した・直した内容）
  const late = part.filter((b) => Date.parse(b.created_time) - t0 > 30 * 60e3 || Date.parse(b.last_edited_time) - Date.parse(b.created_time) > 30 * 60e3);
  const walk = async (b) => {
    const t = text(b);
    if (t) lines.push(t);
    if (/^heading_[23]$/.test(b.type)) { const m = /^(\d{1,2})\. /.exec(t); if (m) nums.push(Number(m[1])); }
    if (b.type === "table") for (const r of await listBlockChildren(b.id)) lines.push(r.table_row.cells.map((c) => c.map((x) => x.plain_text).join("")).join(" | "));
    else if (b.has_children && b.type !== "table") for (const k of await listBlockChildren(b.id)) await walk(k);
  };
  for (const b of part.slice(1)) await walk(b);
  return { start: s, part, lines, nums, lateBlocks: late.length };
}

async function main() {
  const { values: a } = parseArgs({ options: { out: { type: "string" }, only: { type: "string" } } });
  const rels = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "data/dis-relations.json"), "utf8")).relations
    .filter((r) => r.disId.startsWith("DIS-LP-0") && r.relation === "same_lp" && r.disNotionPageId && !r.lp28)
    .sort((x, y) => (x.disId < y.disId ? -1 : 1));
  const only = a.only ? new Set(a.only.split(",")) : null;
  const todo = rels.filter((r) => !only || only.has(r.disId));
  const out = []; let i = 0;
  const work = async () => {
    while (i < todo.length) {
      const r = todo[i++];
      try {
        const lib = await notionFetch(`/pages/${r.libraryNotionPageId}`);
        const src = await findSourceMd(lib.properties);
        if (!src) { out.push({ dis: r.disId, lp: r.libraryId, status: "md無し" }); continue; }
        const md = await fs.readFile(src.file, "utf8");
        const n = await readNotionChapter28(r.disNotionPageId);
        const cmp = compareNotionToMd({ notionLines: n.lines.filter((l) => !l.startsWith("以下は、旧ライブラリーの")), notionChapterNums: n.nums, md });
        // 止める条件: Notionにしか無い章がある／28章の見出しのあとに足された・直されたブロックがある。文の違いだけは、Dropbox版が新しいための差（記録のみ）
        const stop = cmp.notionOnlyChapters.length > 0 || n.lateBlocks > 0;
        out.push({ dis: r.disId, lp: r.libraryId, status: stop ? "止める" : "OK", reason: [cmp.notionOnlyChapters.length ? `Notionにしか無い章: ${cmp.notionOnlyChapters.join(",")}` : "", n.lateBlocks ? `あとから足した・直したブロック ${n.lateBlocks}件` : ""].filter(Boolean).join(" ／ "), src: path.basename(src.file), 版の違いの行: cmp.notionOnlyLines.length, examples: cmp.notionOnlyLines.slice(0, 2).map((x) => x.slice(0, 70)) });
      } catch (e) { out.push({ dis: r.disId, lp: r.libraryId, status: "エラー", err: String(e.message).slice(0, 120) }); }
    }
  };
  await Promise.all([work(), work(), work(), work()]);
  out.sort((x, y) => (x.dis < y.dis ? -1 : 1));
  if (a.out) await fs.writeFile(a.out, JSON.stringify(out, null, 1));
  const c = {}; out.forEach((x) => (c[x.status] = (c[x.status] || 0) + 1));
  console.log(JSON.stringify(c));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
