#!/usr/bin/env node
/**
 * LP-0214（Awarefy・軽量分析のページ）に、28章分析（章1〜29）を追記する。
 *   - 既存のブロックは、変更・削除しない。既存の本文の最後（子ページの手前）の直後に挿入する
 *   - Dropbox: LP-0214のフォルダに 03_Analysis/LP-0214_v1.0.md と 03_Analysis/images/ を、新規に置く（上書きしない。同期の完了を待つ）
 *   - すでに「28章分析」の見出しがあれば、何も書かない
 * 実書込みは --apply と DIS_ENABLE_WRITES=true と DRY_RUN=false がそろったときだけ。
 *   node scripts/dis/add-lp0214-28.mjs [--apply]
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { REPO_ROOT } from "./lib/config.mjs";
import * as nc from "../lib/notion-client.mjs";
import { markdownToBlocks } from "./lib/adapters.mjs";
import { toJpeg, upload } from "./merge-library.mjs";
import { copyToLocalDropbox, waitForSync } from "./register-new-dis.mjs";

export const PAGE_ID = "3e724d4f-a671-8115-99d7-eda4e959fa66";
export const MARK = "28章分析（統一28章 v4.0）｜LP-0214";
const DIR = path.join(REPO_ROOT, "outputs/lp-0214-28ch");
const text = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? "").join("");

/** Markdownを、ブロックの列にする。画像（![…](images/…)）は、{__image:{rel,caption}} の印にする。 */
export function planBlocks(md) {
  const out = [];
  let buf = [];
  const flush = () => { if (buf.length) { out.push(...markdownToBlocks(buf.join("\n"))); buf = []; } };
  for (const line of String(md).split("\n")) {
    const m = /^!\[(.*?)\]\((images\/[^)]+)\)\s*$/.exec(line.trim());
    if (m) { flush(); out.push({ __image: { rel: m[2], caption: m[1] } }); } else buf.push(line);
  }
  flush();
  return out;
}

async function main() {
  const { values: a } = parseArgs({ options: { apply: { type: "boolean", default: false } } });
  const md = await fs.readFile(path.join(DIR, "LP-0214_v1.0.md"), "utf8");
  const existing = await nc.listBlockChildren(PAGE_ID);
  if (existing.some((b) => text(b).startsWith("28章分析"))) { console.log("すでに「28章分析」の見出しがあります。何も書いていません"); return; }
  const lastBody = [...existing].reverse().find((b) => b.type !== "child_page");
  const page = await nc.notionFetch(`/pages/${PAGE_ID}`);
  const folder = (page.properties["Dropbox正本パス"]?.rich_text || []).map((t) => t.plain_text).join("");
  if (!folder) throw new Error("プロパティ「Dropbox正本パス」が空です");
  const body = planBlocks(md);
  const imgs = body.filter((b) => b.__image).map((b) => b.__image.rel);
  const files = (await fs.readdir(path.join(DIR, "images"))).sort();
  const plan = [{ local: path.join(DIR, "LP-0214_v1.0.md"), remote: `${folder}/03_Analysis/LP-0214_v1.0.md` }, ...files.map((f) => ({ local: path.join(DIR, "images", f), remote: `${folder}/03_Analysis/images/${f}` }))];
  console.log(JSON.stringify({ mode: a.apply ? "APPLY" : "DRY-RUN", existingBlocks: existing.length, insertAfter: `${lastBody.type}:${text(lastBody).slice(0, 30)}`, childPagesAfter: existing.filter((b) => b.type === "child_page").length, newBlocks: body.length + 2, imagesInBody: imgs, dropboxFolder: `${folder}/03_Analysis`, dropboxFiles: plan.length }, null, 2));
  if (!a.apply) { console.log("ドライラン: 何も書いていません"); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true" || process.env.DRY_RUN !== "false") throw new Error("DIS_ENABLE_WRITES=true と DRY_RUN=false が必要です");

  // 1) Dropbox（ローカルの同期フォルダへ、上書きせずにコピー。同期の完了を確かめてから、Notionへ）
  const root = process.env.DROPBOX_LOCAL_ROOT || path.join(os.homedir(), "Dropbox");
  const { copied } = await copyToLocalDropbox({ plan, folder: `${folder}/03_Analysis`, root });
  const { listFolder } = await import("../lib/dropbox-client.mjs");
  const sync = await waitForSync({ copied, folder: `${folder}/03_Analysis`, listFolder, log: (m) => console.error(m) });
  if (!sync.ok) throw new Error(`Dropboxの同期が完了していません（足りない例: ${sync.missing.join(", ")}）。Notionには書いていません`);

  // 2) Notion（既存の本文の直後に、100件以内ずつ、順に挿入）
  const blocks = [nc.headingBlock(MARK, 1), nc.paragraphBlock("以下は、LP-0214 の28章分析（v1.0。アーカイブ画像から作成）。上の「分析テスト v0.1」とは別の分析で、章8のSection分けも違う。点数は混ぜない。")];
  for (const b of body) {
    if (!b.__image) { blocks.push(b); continue; }
    const f = path.join(DIR, b.__image.rel);
    blocks.push(nc.imageUploadBlock(await upload(await toJpeg(f, path.basename(f).replace(/\.[^.]+$/, ""))), b.__image.caption));
  }
  let after = lastBody.id, n = 0;
  for (let i = 0; i < blocks.length; i += 90) {
    const r = await nc.insertBlockChildrenAfter(PAGE_ID, blocks.slice(i, i + 90), after);
    const got = r.results || [];
    // 挿入した最後のブロックのIDを取り、次の挿入の位置にする（順序を保つ）
    const all = await nc.listBlockChildren(PAGE_ID);
    const idx = all.findIndex((b) => b.id === after);
    after = all[idx + Math.min(90, blocks.length - i)].id;
    n += got.length || Math.min(90, blocks.length - i);
    await new Promise((r2) => setTimeout(r2, 350));
  }
  const final = await nc.listBlockChildren(PAGE_ID);
  const ok = final.length === existing.length + blocks.length && final.slice(0, existing.indexOf(lastBody) + 1).every((b, i) => b.id === existing[i].id) && final.at(-1).type === "child_page";
  console.log(ok ? `追記しました（${existing.length}→${final.length}ブロック）` : `WARNING: 追記後のブロック数・順序が合いません（${existing.length}+${blocks.length} ≠ ${final.length}）`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
