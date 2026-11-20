#!/usr/bin/env node
/**
 * 撮影の待ち行列（data/dis-capture-queue.json）のURLを、1件ずつ、撮影・テンプレート作成まで進める（ローカルのみ）。
 *
 *   npm run dis:capture-queue -- --list                   # 一覧と状態（実行しない）
 *   npm run dis:capture-queue -- --limit 5                # 未処理のうち先頭5件を実行
 *   npm run dis:capture-queue -- --only <URLの一部>       # 指定のURLだけ
 *   npm run dis:capture-queue -- --archive-only --limit 5 # アーカイブ掲載の画像で撮るものだけ（実ページは撮らない）
 *   npm run dis:capture-queue -- --queue data/dis-archive-align-queue.json --limit 1   # 別の一覧（進捗は <一覧>-progress.json）
 *
 * ・DRY_RUN=true で dis:run を呼ぶ。Dropbox・Notion・台帳には書かない。
 * ・ログイン・課金壁・Bot対策・403などは回避しない。失敗は理由（出力の末尾）を記録して、次へ進む。再試行もしない。
 * ・進捗は data/dis-capture-progress.json（done／failed／skipped）。done は再実行しない。failed は --retry-failed で再実行できる。
 */
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { parseArgs } from "node:util";

const DEFAULT_QUEUE = "data/dis-capture-queue.json";
const DEFAULT_PROGRESS = "data/dis-capture-progress.json";

/** 新しい形式（libraryId・rdlpUrl・status）の一覧も、同じ形（url・fromArchive）にそろえる。rdlpUrl のないもの（need_rdlp）は、対象にしない。 */
export function normalizeQueue(queue) {
  const items = [];
  for (const it of queue.items) {
    if (it.url) { items.push(it); continue; }
    if (!it.rdlpUrl) continue;
    items.push({ ...it, url: it.rdlpUrl, fromArchive: true });
  }
  return { ...queue, items };
}

export function buildArgs(item, date) {
  const a = ["run", "dis:run", "--", "--media", "lp", "--url", item.rdlpUrl || item.url, "--date", date, "--stage", "collect,select,capture,template", "--capture"];
  if (item.fromArchive || item.rdlpUrl) a.push("--from-archive");
  return a;
}

function readJson(f, fallback) {
  try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return fallback; }
}

function main() {
  const { values } = parseArgs({ options: { list: { type: "boolean" }, limit: { type: "string" }, only: { type: "string" }, date: { type: "string" }, "retry-failed": { type: "boolean" }, "archive-only": { type: "boolean" }, queue: { type: "string" } } });
  const QUEUE = values.queue || DEFAULT_QUEUE;
  const PROGRESS = values.queue ? values.queue.replace(/\.json$/, "") + "-progress.json" : DEFAULT_PROGRESS;
  const raw = readJson(QUEUE, null);
  const queue = raw && normalizeQueue(raw);
  if (!queue) throw new Error(`${QUEUE} がありません。git pull してください`);
  if (queue.obsolete) throw new Error(`${QUEUE} は使いません（${String(queue.note).split("\n")[0]}）`);
  const progress = readJson(PROGRESS, { updatedAt: null, items: {} });
  const date = values.date || new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const state = (u) => progress.items[u]?.status || "pending";
  if (values.list) {
    for (const it of queue.items) console.log(`${state(it.url).padEnd(8)} ${it.fromArchive || it.rdlpUrl ? "[archive] " : ""}${it.rdlpUrl || it.url}`);
    const c = {}; for (const it of queue.items) c[state(it.url)] = (c[state(it.url)] || 0) + 1;
    console.log(JSON.stringify(c));
    return;
  }
  let todo = queue.items.filter((it) => state(it.url) === "pending" || (values["retry-failed"] && state(it.url) === "failed"));
  if (values["archive-only"]) todo = todo.filter((it) => it.fromArchive || it.rdlpUrl); // アーカイブ掲載の画像で撮るものだけ（実ページの撮影は後回し）
  if (values.only) todo = todo.filter((it) => it.url.includes(values.only));
  if (values.limit) todo = todo.slice(0, Number(values.limit));
  console.log(`対象 ${todo.length} 件（日付 ${date}、DRY_RUN=true・ローカルのみ）`);
  for (const it of todo) {
    console.log(`\n== ${it.rdlpUrl || it.url}${it.fromArchive || it.rdlpUrl ? "（アーカイブの画像）" : ""}`);
    const started = Date.now();
    const r = spawnSync("npm", buildArgs(it, date), { encoding: "utf8", env: { ...process.env, DRY_RUN: "true" } });
    const out = `${r.stdout || ""}${r.stderr || ""}`.trim();
    const tail = out.split("\n").slice(-12).join("\n");
    console.log(tail);
    progress.items[it.url] = { status: r.status === 0 ? "done" : "failed", exitCode: r.status, durationSec: Math.round((Date.now() - started) / 1000), finishedAt: new Date().toISOString(), tail: r.status === 0 ? undefined : tail };
    progress.updatedAt = new Date().toISOString();
    fs.writeFileSync(PROGRESS, JSON.stringify(progress, null, 1) + "\n");
  }
}

import { fileURLToPath } from "node:url";
if (process.argv[1] === fileURLToPath(import.meta.url)) main();
