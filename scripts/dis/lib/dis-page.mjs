/**
 * NotionのDISページの形（要件定義）。外部には何も書かない（純粋な関数と、ブロックの組み立てだけ）。
 *   1. セクション画像（pc_NN_種類・sp_NN_種類）は、ページ末尾ではなく、各Unit（U1〜）の分析のすぐ下に置く（PC→SPの順）
 *   2. 旧LPページへのリンクは、冒頭のコールアウトに、Notionのページへのリンクとして入れる
 *   3. Dropboxの保存先は、文字ではなくリンク（プロパティ「Dropbox正本パス」と本文の両方）
 *   4. 古い表示（「Notion＝未登録（ローカルのみ）」・プロパティ「Notion同期：NO」）を直す
 *   5. 9軸と28章は混ぜない。既存の画像・本文は消さない
 */
import { markdownToBlocks } from "./adapters.mjs";

const rt = (content, link) => [{ type: "text", text: { content, ...(link ? { link: { url: link } } : {}) } }];
export const notionPageUrl = (id) => `https://app.notion.com/p/${String(id).replace(/-/g, "")}`;

/** Dropboxのフォルダを開くリンク（自分のアカウントで開く。共有リンクは作らない＝Dropboxへ書かない）。 */
export function dropboxLink(folder) {
  return `https://www.dropbox.com/home${String(folder).split("/").map((s) => encodeURIComponent(s)).join("/")}`;
}

/** 冒頭のコールアウト（旧LPページへのリンク・Dropboxへのリンク入り）。 */
export function disCallout({ disId, lp, oldPageId, dropboxFolderPath }) {
  const parts = [...rt(`番号: ${disId}（DIS）＝ ${lp}（旧ライブラリー）。このページが正。DISの9軸分析（dis-2.0）と、旧ライブラリーの28章分析（章1〜29）を1ページにまとめている。2つの評価の点数は別の方法によるもので、混ぜない。`)];
  if (oldPageId) parts.push(...rt("\n旧ページ: "), ...rt(`${lp}｜LP分析`, notionPageUrl(oldPageId)));
  if (dropboxFolderPath) parts.push(...rt("\nDropbox正本: "), ...rt(dropboxFolderPath, dropboxLink(dropboxFolderPath)));
  return { object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🔗" }, rich_text: parts } };
}

/** プロパティ「Dropbox正本パス」（リッチテキスト。文字がリンクになる）。 */
export const dropboxPathProp = (folder) => ({ rich_text: rt(folder, dropboxLink(folder)) });

/** analysis.md の「外部同期」の行を、実際の状態に合わせる（CBSの文言は、そのまま残す）。 */
export function fixExternalSyncLine(md, { dropboxFolderPath, lp }) {
  return String(md).replace(/^- 外部同期:.*$/m, (line) => {
    const cbs = /CBS=(.*?) ／ Notion=/.exec(line)?.[1] ?? "未同期";
    return `- 外部同期: CBS=${cbs} ／ Notion=登録済み（このページ。旧ライブラリーの${lp}のページは、読み取りのみで、本文は変更していない） ／ Dropbox=保存済み（${dropboxFolderPath}）`;
  });
}

/** analysis.md を、Unit（### U1 …）ごとに分ける。各Unitは、次の見出し（#〜###）の手前まで。 */
export function splitUnits(md) {
  const lines = String(md).split("\n");
  const isUnit = (l) => /^### U\d+(?:\s|$)/.test(l);
  const isHead = (l) => /^#{1,3}\s/.test(l);
  const units = [];
  let first = -1, i = 0;
  for (; i < lines.length; i++) {
    if (!isUnit(lines[i])) continue;
    if (first < 0) first = i;
    let j = i + 1;
    while (j < lines.length && !isHead(lines[j])) j++;
    units.push({ id: /^### (U\d+)/.exec(lines[i])[1], title: lines[i].replace(/^###\s*/, ""), start: i, end: j });
    i = j - 1;
  }
  return { lines, units };
}

/** sections_by_unit のファイル名（pc_NN_種類.png・sp_NN_種類.png）を、Unit番号（U1〜）ごとに、PC→SPの順に並べる。 */
export function groupUnitImages(names) {
  const by = {};
  for (const n of [...names].sort()) {
    const m = /^(pc|sp)_(\d{2})_.+\.png$/.exec(n);
    if (!m) continue;
    (by[`U${Number(m[2])}`] ||= { pc: [], sp: [] })[m[1]].push(n);
  }
  return Object.fromEntries(Object.entries(by).map(([k, v]) => [k, [...v.pc, ...v.sp]]));
}

/**
 * 分析のMarkdownを、Unitごとに、そのUnitの分析のすぐ下へ画像を置いたブロック列にする。
 * imageBlock(name): 画像名（拡張子なし）→ ブロック。Unitが無い画像（対応するUが無い番号）は、最後にまとめて返す（捨てない）。
 */
export function buildAnalysisBlocks(md, unitImages, imageBlock) {
  const { lines, units } = splitUnits(md);
  const out = [];
  let cur = 0;
  const used = new Set();
  for (const u of units) {
    out.push(...markdownToBlocks(lines.slice(cur, u.end).join("\n")));
    for (const n of unitImages[u.id] || []) { out.push(imageBlock(n.replace(/\.png$/, ""))); used.add(n); }
    cur = u.end;
  }
  out.push(...markdownToBlocks(lines.slice(cur).join("\n")));
  const orphan = Object.values(unitImages).flat().filter((n) => !used.has(n));
  return { blocks: out, orphans: orphan, placed: used.size };
}

const btext = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");

/**
 * 既存のDISページ（Notion APIのブロック列）に対する、組み替えの計画（読み取りだけ）。
 * 末尾の「PC Unit画像」「SP Unit画像」の見出しと画像を、各Unitの下へ移す計画を返す。
 */
export function planRestructure(blocks, unitImages) {
  const heads = blocks.map((b, i) => ({ b, i })).filter(({ b }) => /^heading_[123]$/.test(b.type));
  const unitHeads = heads.filter(({ b }) => /^U\d+(\s|$)/.test(btext(b)));
  const oldImgHeads = heads.filter(({ b }) => /^(PC|SP) Unit画像/.test(btext(b)));
  const moves = [];
  for (const h of unitHeads) {
    const id = /^(U\d+)/.exec(btext(h.b))[1];
    const next = heads.find((x) => x.i > h.i);
    const after = (next ? next.i : blocks.length) - 1; // このUnitの最後のブロック
    moves.push({ unit: id, title: btext(h.b), insertAfterBlockId: blocks[after].id, images: unitImages[id] || [] });
  }
  const oldImageBlocks = [];
  for (const h of oldImgHeads) {
    const next = heads.find((x) => x.i > h.i);
    const to = next ? next.i : blocks.length;
    for (let k = h.i + 1; k < to; k++) if (blocks[k].type === "image") oldImageBlocks.push(blocks[k].id);
  }
  return { moves, oldImageHeadingIds: oldImgHeads.map(({ b }) => b.id), oldImageBlockIds: oldImageBlocks, unitsWithoutImages: moves.filter((m) => !m.images.length).map((m) => m.unit) };
}
