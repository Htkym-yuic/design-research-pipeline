#!/usr/bin/env node
/**
 * 28章がある旧ライブラリーのLP（LP-nnnn）の、DISの9軸（分析・検証済み）を、Dropbox・Notionに登録する（1件ずつ）。
 *   1) Dropbox: ローカルの同期フォルダへ、上書きせずにコピー → 同期の完了を確かめる
 *   2) Notion: migrate-to-dis-page.mjs を呼ぶ（新しい形のDISページ＝コールアウト・撮り直し画像・各Unitの下の画像つき9軸・旧28章の複製。
 *      旧LPページは書き換えず、「移行済み」のコールアウトを1つ追記）
 * 実書込みは --apply と DIS_ENABLE_WRITES=true と DRY_RUN=false がそろったときだけ。
 *   node scripts/dis/register-library-dis.mjs --id DIS-LP-0206 [--apply]
 */
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { loadConfig, REPO_ROOT, readJson } from "./lib/config.mjs";
import { dropboxFolder } from "./lib/adapters.mjs";
import { findItemDir } from "./import-analysis.mjs";
import { planFiles, ensureMetadata } from "./merge-library.mjs";
import { copyToLocalDropbox, waitForSync } from "./register-new-dis.mjs";

const exists = async (p) => { try { await fs.access(p); return true; } catch { return false; } };

/** Dropboxに置くファイルの計画。01_Normal_Images・03_Analysis（analysis.json・analysis.md・annotations.json・text-index.json）・metadata.json。 */
export async function planLibraryDropbox(itemDir, folder) {
  const base = await planFiles(itemDir);
  const extra = [];
  for (const n of ["analysis.md", "annotations.json", "text-index.json"]) if (await exists(path.join(itemDir, n))) extra.push({ local: path.join(itemDir, n), rel: `03_Analysis/${n}` });
  return [...base, ...extra].map((f) => ({ local: f.local, remote: `${folder}/${f.rel}` }));
}

const runNode = (args) => new Promise((resolve) => {
  const c = spawn(process.execPath, args, { env: process.env });
  let out = ""; c.stdout.on("data", (d) => (out += d)); c.stderr.on("data", (d) => (out += d));
  c.on("close", (code) => resolve({ code, out }));
});

async function main() {
  const { values: a } = parseArgs({ options: { id: { type: "string" }, apply: { type: "boolean", default: false } } });
  if (!a.id) throw new Error("--id DIS-LP-000n が必要です");
  const cfg = await loadConfig();
  const rel = (await readJson(path.join(REPO_ROOT, "data/dis-relations.json"))).relations.find((r) => r.disId === a.id && r.relation === "same_lp");
  if (!rel) throw new Error(`${a.id} に対応するLP番号がありません`);
  const itemDir = await findItemDir(path.join(REPO_ROOT, "outputs/dis"), cfg, a.id);
  if (!itemDir) throw new Error(`${a.id} の案件フォルダが見つかりません`);
  const item = await readJson(path.join(itemDir, "item.json"));
  const folder = dropboxFolder(cfg, "lp", item.date, a.id);
  const meta = await ensureMetadata(itemDir, a.apply);
  const plan = await planLibraryDropbox(itemDir, folder);
  const missing = [];
  for (const p of plan) if (!(await exists(p.local)) && !(p.local.endsWith("metadata.json") && meta.created && !a.apply)) missing.push(p.local);
  if (missing.length) throw new Error(`${a.id}: ローカルに無いファイルがあります（${missing.slice(0, 3).join(", ")}）。何も書いていません`);
  console.log(JSON.stringify({ mode: a.apply ? "APPLY" : "DRY-RUN", disId: a.id, lp: rel.libraryId, dropboxFolder: folder, dropboxFiles: plan.length }, null, 2));
  if (!a.apply) { const r = await runNode([path.join(REPO_ROOT, "scripts/dis/migrate-to-dis-page.mjs"), "--id", a.id]); console.log(r.out.slice(-1500)); return; }
  if (process.env.DIS_ENABLE_WRITES !== "true" || process.env.DRY_RUN !== "false") throw new Error("DIS_ENABLE_WRITES=true と DRY_RUN=false が必要です");

  const root = process.env.DROPBOX_LOCAL_ROOT || path.join(os.homedir(), "Dropbox");
  // 前回、Dropboxへのコピーのあとで止まったときの再開: フォルダがすでにあり、全ファイルが同じ大きさでそろっているときだけ、コピーを省く（上書きはしない）
  let copied;
  if (await exists(path.join(root, folder))) {
    copied = [];
    for (const f of plan) {
      const a = await fs.stat(f.local), b = await fs.stat(path.join(root, f.remote)).catch(() => null);
      if (!b || a.size !== b.size) throw new Error(`${a.size === b?.size ? "" : "同期フォルダの"}${f.remote} が、前回のコピーと合いません。何もコピーしません`);
      copied.push({ remote: f.remote, bytes: a.size });
    }
    console.log(`Dropbox: 前回コピー済みの${copied.length}ファイルを確認しました（再コピーなし）`);
  } else ({ copied } = await copyToLocalDropbox({ plan, folder, root }));
  const { listFolder } = await import("../lib/dropbox-client.mjs");
  const sync = await waitForSync({ copied, folder, listFolder, log: (m) => console.error(m) });
  if (!sync.ok) throw new Error(`${a.id}: Dropboxの同期が完了していません（足りない例: ${sync.missing.join(", ")}）。Notionには書いていません`);
  console.log(`Dropbox: ${copied.length}ファイルをコピーし、同期を確認しました（${sync.sec}秒）`);

  const r = await runNode([path.join(REPO_ROOT, "scripts/dis/migrate-to-dis-page.mjs"), "--id", a.id, "--apply"]);
  if (r.code !== 0) throw new Error(`${a.id}: Notionへの反映に失敗: ${r.out.slice(-600)}`);
  const m = /"newPageId": "([^"]+)"/.exec(r.out);
  console.log(`Notion: DISページを作成しました（${m?.[1] || "?"}）。旧ページに「移行済み」を追記しました`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message || e); process.exit(1); });
