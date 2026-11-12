#!/usr/bin/env node
/**
 * DISのページを正にする。旧ライブラリーの LP-000n ページの28章分析を、DIS-LP-000n のページへ「複製」して1ページにまとめる。
 *   - DIS-LP-000n のページが無ければ新規作成（属性は、タグ・取得日・参考URLなどを旧ページから写す。CBS同期状態・ナレッジ関連・ステータスは写さない）。
 *     あれば（DIS-LP-0004）、そのページの末尾に28章を足す。
 *   - 並び: 番号 → 撮り直し画像（FV・全体）→ DIS 9軸分析 → Unit画像 → 食い違い → 28章分析（旧ライブラリー）
 *   - 旧ページは削除しない。冒頭に「DIS-LP-000n に移行済み」のリンクを置く（以前に足した番号の注記は、その文に書き換える）。
 * 既定はドライラン。実書込みは --apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false のときだけ。
 *   node scripts/dis/migrate-to-dis-page.mjs --id DIS-LP-0005 [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { assertWritesAllowed, writesAllowed } from "./lib/write-guard.mjs";
import { dropboxFolder, markdownToBlocks } from "./lib/adapters.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { listBlockChildren, appendBlockChildren, insertBlockChildrenAfter, headingBlock, paragraphBlock, imageUploadBlock, notionFetch, findPageByMatchProperty, loadLpPropertyConfig } from "../lib/notion-client.mjs";
import { requireEnv } from "../lib/env.mjs";
import { updateJson } from "./lib/lock.mjs";
import { toJpeg, downloadToTemp, upload, text, rt, notionUrl, exists, sleep, SLOTS, MARK, OLD_TOGGLE } from "./merge-library.mjs";

const COPY_PROPS = ["ブランド", "参考URL", "出典", "取得日", "商材", "カテゴリ", "業種タグ", "配色タグ", "レイアウトタグ", "コピータイプ", "メイン訴求"];
const warn = [];

const cleanRT = (arr = []) => arr.map((t) => {
  const ann = t.annotations ? { annotations: { bold: t.annotations.bold, italic: t.annotations.italic, strikethrough: t.annotations.strikethrough, underline: t.annotations.underline, code: t.annotations.code, color: t.annotations.color } } : {};
  if (t.type === "mention") return { type: "mention", mention: t.mention, ...ann };
  if (t.type === "equation") return { type: "equation", equation: t.equation, ...ann };
  // 相対パス（../01_PC/…）など、Notionが受け付けないリンクは、文字だけを残す（リンク先は、旧ライブラリーのローカルパスで、Notion上では切れていた）
  const url = t.text?.link?.url;
  const okLink = url && /^(https?:\/\/|mailto:)/.test(url) ? { link: t.text.link } : {};
  return { type: "text", text: { content: t.text?.content ?? t.plain_text ?? "", ...okLink }, ...ann };
});

function copyProp(p) {
  switch (p?.type) {
    case "select": return p.select ? { select: { name: p.select.name } } : null;
    case "multi_select": return p.multi_select?.length ? { multi_select: p.multi_select.map((o) => ({ name: o.name })) } : null;
    case "rich_text": return p.rich_text?.length ? { rich_text: cleanRT(p.rich_text) } : null;
    case "url": return p.url ? { url: p.url } : null;
    case "date": return p.date ? { date: { start: p.date.start, end: p.date.end ?? null } } : null;
    default: return null;
  }
}

/** 旧ページのブロックを、複製できる形にする（画像は取得して再アップロード）。対応しない種類は、警告に記録して止める。 */
async function cloneBlock(b, ctx) {
  const t = b.type;
  const kids = async () => (b.has_children ? (await cloneList(await listBlockChildren(b.id), ctx)) : []);
  switch (t) {
    case "paragraph": case "bulleted_list_item": case "numbered_list_item": case "quote": case "to_do": {
      const c = await kids();
      return { object: "block", type: t, [t]: { rich_text: cleanRT(b[t].rich_text), ...(t === "to_do" ? { checked: b[t].checked } : {}), ...(c.length ? { children: c } : {}) } };
    }
    case "heading_1": case "heading_2": case "heading_3": {
      const c = await kids();
      return { object: "block", type: t, [t]: { rich_text: cleanRT(b[t].rich_text), ...(b[t].is_toggleable ? { is_toggleable: true } : {}), ...(c.length ? { children: c } : {}) } };
    }
    case "callout": {
      const c = await kids();
      const icon = b.callout.icon?.type === "emoji" ? { icon: b.callout.icon } : {};
      return { object: "block", type: t, callout: { rich_text: cleanRT(b.callout.rich_text), ...icon, ...(c.length ? { children: c } : {}) } };
    }
    case "toggle": {
      const c = await kids();
      if (text(b).startsWith("旧画像（アーカイブ掲載")) return c; // 以前に足した、旧画像のトグルは、中の旧画像だけを出す
      return { object: "block", type: t, toggle: { rich_text: cleanRT(b.toggle.rich_text), ...(c.length ? { children: c } : {}) } };
    }
    case "code": return { object: "block", type: t, code: { rich_text: cleanRT(b.code.rich_text), language: b.code.language, caption: cleanRT(b.code.caption) } };
    case "divider": return { object: "block", type: t, divider: {} };
    case "table": {
      const rows = (await listBlockChildren(b.id)).map((r) => ({ object: "block", type: "table_row", table_row: { cells: r.table_row.cells.map(cleanRT) } }));
      return { object: "block", type: t, table: { table_width: b.table.table_width, has_column_header: b.table.has_column_header, has_row_header: b.table.has_row_header, children: rows } };
    }
    case "image": {
      const cap = cleanRT(b.image.caption);
      if (cap.some((c) => (c.text?.content || "").startsWith("DIS撮り直し"))) return null; // 以前に足したDIS画像は、DISのセクションにあるので省く
      if (b.image.type === "external") return { object: "block", type: t, image: { type: "external", external: { url: b.image.external.url }, caption: cap } };
      if (ctx.dry) { ctx.images++; return { object: "block", type: "paragraph", paragraph: { rich_text: [] } }; }
      const dl = await downloadToTemp(b.image.file.url, `old_${ctx.images++}`);
      return { object: "block", type: t, image: { type: "file_upload", file_upload: { id: await upload(dl.file, dl.type) }, caption: cap } };
    }
    default: warn.push(`未対応のブロック: ${t} (${b.id})`); return { object: "block", type: "paragraph", paragraph: { rich_text: cleanRT([{ type: "text", text: { content: `[未対応のブロック: ${t}]` } }]) } };
  }
}
async function cloneList(blocks, ctx) {
  const out = [];
  for (const b of blocks) { const c = await cloneBlock(b, ctx); if (Array.isArray(c)) out.push(...c); else if (c) out.push(c); }
  return out;
}

/** 旧ページの、28章分析（章1〜29）の範囲だけを取り出す（以前に足した「DIS 9軸分析」以降と、番号の注記は除く）。 */
function oldRange(blocks, disId) {
  const end = blocks.findIndex((b) => /^heading_/.test(b.type) && text(b).startsWith(MARK));
  return (end >= 0 ? blocks.slice(0, end) : blocks).filter((b) => !(b.type === "callout" && (text(b).includes(`${disId}（DIS）`) || text(b).includes("移行済み"))));
}

async function buildDis({ disId, lp, itemDir, ctx }) {
  const img = path.join(itemDir, "files", "01_Normal_Images");
  const out = [];
  out.push({ object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "🔗" }, rich_text: rt(`番号: ${disId}（DIS）＝ ${lp}（旧ライブラリー）。このページが正。DISの9軸分析（dis-2.0）と、旧ライブラリーの28章分析（章1〜29）を1ページにまとめている。2つの評価の点数は別の方法によるもので、混ぜない。`) } });
  const slotBlocks = [];
  for (const [label, key] of Object.entries(SLOTS)) {
    const src = path.join(img, `${disId}_${key}.png`);
    if (!(await exists(src))) continue;
    slotBlocks.push(headingBlock(label, 3));
    slotBlocks.push(ctx.dry ? paragraphBlock(`[画像 ${key}]`) : imageUploadBlock(await upload(await toJpeg(src, `${disId}_${key}`)), `DIS撮り直し（${disId}）${label}`));
  }
  if (slotBlocks.length) out.push(headingBlock("撮り直し画像（DIS）：ファーストビュー・全体", 2), ...slotBlocks);
  const md = await fs.readFile(path.join(itemDir, "analysis.md"), "utf8");
  out.push(headingBlock(`${MARK}（dis-2.0）｜${disId}`, 2), paragraphBlock(`この見出しは、DISの9軸（1〜5点）による評価。下の「28章分析」（旧ライブラリー）の点数とは別の方法で、混ぜない。`), ...markdownToBlocks(md));
  const sbu = path.join(img, "sections_by_unit");
  for (const dev of ["pc", "sp"]) {
    const names = (await exists(sbu)) ? (await fs.readdir(sbu)).filter((n) => n.startsWith(`${dev}_`) && n.endsWith(".png")).sort() : [];
    if (!names.length) continue;
    out.push(headingBlock(`${dev.toUpperCase()} Unit画像（${dev}_NN_種類）`, 3));
    for (const n of names) out.push(ctx.dry ? paragraphBlock(`[画像 ${n}]`) : imageUploadBlock(await upload(await toJpeg(path.join(sbu, n), n.replace(/\.png$/, ""))), n.replace(/\.png$/, "")));
  }
  const rec = (await fs.readdir(itemDir)).find((n) => /^reconciliation_.*\.md$/.test(n));
  if (rec) out.push(headingBlock(`28章とDISの食い違い（${rec.replace(/\.md$/, "")}）`, 2), ...markdownToBlocks(await fs.readFile(path.join(itemDir, rec), "utf8")));
  return out;
}

async function main() {
  const { values: args } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!args.id) throw new Error("--id DIS-LP-000n を指定");
  // 同じ番号を2つの処理が同時に反映して、ページが重複しないよう、番号ごとに排他をかける（実書込みのときだけ）
  const lockDir = path.join(REPO_ROOT, "data", ".locks", `migrate-${args.id}`);
  if (args.apply) {
    await fs.mkdir(path.dirname(lockDir), { recursive: true });
    try { await fs.mkdir(lockDir); } catch (e) { if (e.code === "EEXIST") throw new Error(`${args.id}: 別の処理が反映中です（${lockDir}）。重複を避けるため中止します`); throw e; }
  }
  try { await run(args); } finally { if (args.apply) await fs.rmdir(lockDir).catch(() => {}); }
}

async function run(args) {
  const cfg = await loadConfig();
  const pages = await readJson(path.join(REPO_ROOT, "data/dis-notion-pages.json"));
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === args.id && r.relation === "same_lp");
  if (!rel) throw new Error(`${args.id} に対応するLP番号がありません`);
  const lp = rel.libraryId, disId = args.id;
  const entry = pages.pages[lp] || (rel.libraryNotionPageId ? { pageId: rel.libraryNotionPageId } : null) || await (async () => { const f = await findPageByMatchProperty(requireEnv(cfg.media.lp.notion.envVar), await loadLpPropertyConfig(), lp); return f ? { pageId: f.id } : null; })();
  if (!entry) throw new Error(`${lp} のNotionページが見つかりません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, disId);
  const item = await readJson(path.join(itemDir, "item.json"));
  const opts = { apply: args.apply };
  const wr = writesAllowed(opts);
  if (args.apply) assertWritesAllowed(opts);
  const ctx = { dry: !wr, images: 0 };
  const dsId = requireEnv(cfg.media.lp.notion.envVar);
  const folder = dropboxFolder(cfg, "lp", item.date, disId);

  const oldBlocks = await listBlockChildren(entry.pageId);
  const range = oldRange(oldBlocks, disId);
  const oldPage = await notionFetch(`/pages/${entry.pageId}`);
  const oldTitle = text({ type: "x", x: { rich_text: oldPage.properties["タイトル"].title } });
  const exist = entry.disPageId || (await notionFetch(`/data_sources/${dsId}/query`, { method: "POST", body: JSON.stringify({ filter: { property: "タイトル", title: { starts_with: disId } }, page_size: 5 }) })).results?.[0]?.id;
  if (exist && !entry.disPageId) throw new Error(`${disId} のページがすでにあります（${exist}）。重複して作りません。内容を確認してください`);
  const existingBlocks = entry.disPageId ? await listBlockChildren(entry.disPageId) : [];
  if (existingBlocks.some((b) => /^heading_/.test(b.type) && text(b).startsWith("28章分析（旧ライブラリー）"))) throw new Error(`${disId}: すでに移行済みです`);

  const plan = { disId, lp, dryRun: !wr, mode: entry.disPageId ? "既存のDISページに28章を追記" : "DISページを新規作成", oldTopLevelBlocks: range.length };
  const copied = await cloneList(range, ctx);
  const disBlocks = entry.disPageId ? [] : await buildDis({ disId, lp, itemDir, ctx });
  const head = [headingBlock(`28章分析（旧ライブラリー）｜${lp}`, 1), paragraphBlock(`以下は、旧ライブラリーの ${lp} ページ（28章分析。v2.2系）の本文を複製したもの（内容は書き換えていない）。上のDIS 9軸分析とは評価の方法が違うため、点数は混ぜない。`)];
  const all = [...disBlocks, ...head, ...copied];
  plan.newBlocks = all.length; plan.imagesToReupload = ctx.images; plan.warnings = warn;
  if (!wr) { console.log(JSON.stringify(plan, null, 2)); return; }
  if (warn.length) throw new Error(`未対応のブロックがあるため中止: ${warn.join(" / ")}`);

  let pageId = entry.disPageId;
  if (!pageId) {
    const props = { タイトル: { title: rt(oldTitle.replace(/^LP-\d{4}/, disId)) } };
    for (const k of COPY_PROPS) { const v = copyProp(oldPage.properties[k]); if (v) props[k] = v; }
    props["Dropbox正本パス"] = { rich_text: rt(folder) };
    props["進捗メモ"] = { rich_text: rt(`${lp} から移行（DISを正）。28章分析は本文の後半。CBSの鍵は旧番号 ${lp}。`) };
    const page = await notionFetch("/pages", { method: "POST", body: JSON.stringify({ parent: { type: "data_source_id", data_source_id: dsId }, properties: props, children: all.slice(0, 90) }) });
    pageId = page.id; plan.newPageId = pageId; plan.newPageUrl = page.url;
    try {
      for (let i = 90; i < all.length; i += 90) { await appendBlockChildren(pageId, all.slice(i, i + 90)); await sleep(350); }
    } catch (e) {
      // 今回作った作りかけのページだけを、ごみ箱へ移す（復元できる）。既存のページには触らない
      await notionFetch(`/pages/${pageId}`, { method: "PATCH", body: JSON.stringify({ in_trash: true }) }).catch(() => {});
      throw new Error(`${disId}: 途中で失敗したため、作りかけの新ページ（${pageId}）をごみ箱へ移しました: ${e.message}`);
    }
  } else {
    for (let i = 0; i < all.length; i += 90) { await appendBlockChildren(pageId, all.slice(i, i + 90)); await sleep(350); }
    // 以前に足した「統合済み」の注記を、「このページが正」の文に書き換える
    const old = existingBlocks.find((b) => b.type === "callout" && text(b).includes("統合済み"));
    if (old) await notionFetch(`/blocks/${old.id}`, { method: "PATCH", body: JSON.stringify({ callout: { rich_text: [...rt(`番号: ${disId}（DIS）＝ ${lp}（旧ライブラリー）。このページが正。28章分析は、ページ末尾の「28章分析（旧ライブラリー）」に複製した。旧ページ: `), ...rt(`${lp}｜LP分析`, notionUrl(entry.pageId))] } }) });
  }
  // 旧ページの冒頭に「移行済み」のリンク（旧ページは削除しない）
  const newUrl = notionUrl(pageId);
  const note = [...rt(`${disId} のページに移行済み（このページ以降は、旧ライブラリーの記録として残している）: `), ...rt(disId, newUrl)];
  const mine = oldBlocks.find((b) => b.type === "callout" && text(b).includes(`${disId}（DIS）`));
  if (mine) await notionFetch(`/blocks/${mine.id}`, { method: "PATCH", body: JSON.stringify({ callout: { rich_text: note } }) });
  else { const t = oldBlocks.findIndex((b) => b.type === "table"); await insertBlockChildrenAfter(entry.pageId, [{ object: "block", type: "callout", callout: { icon: { type: "emoji", emoji: "➡️" }, rich_text: note } }], (t >= 0 ? oldBlocks[t] : oldBlocks[0]).id); }
  plan.status = "done"; plan.disPageId = pageId;
  await updateJson(path.join(REPO_ROOT, "data/dis-relations.json"), { relations: [] }, (rels) => {
    const r0 = rels.relations.find((r) => r.disId === disId && r.relation === "same_lp");
    if (r0) { r0.disNotionPageId = pageId; r0.libraryNotionPageId = r0.libraryNotionPageId || entry.pageId; }
    return rels;
  });
  await updateJson(path.join(REPO_ROOT, "data/dis-merge-log.json"), { entries: [] }, (prev) => { prev.entries.push({ at: new Date().toISOString(), kind: "migrate-to-dis-page", ...plan }); return prev; });
  console.log(JSON.stringify(plan, null, 2));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
