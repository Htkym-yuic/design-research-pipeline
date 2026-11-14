/**
 * Notion の今の28章と、Dropbox の最新の .md を比べる（読み取りのみ・純粋な関数）。
 * 「Notionにしか無い内容」（例: Cの補完で Notion に書き足した章28）があるページは、書き換えると消えてしまうので、止める。
 */
import { parseChapters } from "./lp28-align.mjs";

/** 行を、比較用にそろえる（記号・番号・空白・リンクの書き方の違いを無視）。 */
export function norm(line) {
  return String(line)
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^[#>\-*\s]+/, "")
    .replace(/^\d{1,2}[.．]\s*/, "")
    .replace(/[|*`_\s　]/g, "")
    .replace(/[“”"「」『』]/g, "")
    .trim();
}

/** Markdown全体を、比較用の1つの文字列にする（行ごとにそろえて、改行でつなぐ）。 */
export function mdIndex(md) {
  return String(md).split("\n").map(norm).filter(Boolean).join("\n");
}

/**
 * Notion側の行（ブロックの文字。表は1行を「 | 」でつないだもの）と、Markdownを比べる。
 * 戻り値: { notionOnlyLines: [...], notionOnlyChapters: [...] }
 *   notionOnlyChapters: Notionにある章番号（1〜29）で、Markdownに無い章。
 */
export function compareNotionToMd({ notionLines, notionChapterNums, md, minLen = 10 }) {
  const idx = mdIndex(md);
  const mdChapters = new Set(parseChapters(md).chapters.map((c) => c.n));
  const only = [];
  for (const raw of notionLines) {
    const n = norm(raw);
    if (n.length < minLen) continue;
    if (idx.includes(n.slice(0, 40))) continue;
    only.push(raw);
  }
  return { notionOnlyLines: only, notionOnlyChapters: [...new Set(notionChapterNums)].filter((n) => !mdChapters.has(n)).sort((a, b) => a - b) };
}
