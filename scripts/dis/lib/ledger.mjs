import fs from "node:fs/promises";
import path from "node:path";
import { normalizeUrl } from "./dedupe.mjs";
import { REPO_ROOT, readJson } from "./config.mjs";

export const LEDGER_PATH = `${REPO_ROOT}data/dis-ledger.json`;

/** 冪等性キー：媒体＋正規化URL（日付は含めない＝別日でも同じURLは重複）。 */
export function idempotencyKey(media, pageUrl) {
  return `${media}:${normalizeUrl(pageUrl)}`;
}

export async function loadLedger(file = LEDGER_PATH) {
  return readJson(file, { version: 1, entries: [] });
}

export async function saveLedger(ledger, file = LEDGER_PATH) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(ledger, null, 2) + "\n");
  await fs.rename(tmp, file);
}

export function findEntry(ledger, key) {
  return ledger.entries.find((e) => e.key === key);
}

/** 本番書込みの進捗を段階ごとに記録（dropbox/notion）。再実行時に完了済み段階をスキップする。 */
export function upsertEntry(ledger, entry) {
  const i = ledger.entries.findIndex((e) => e.key === entry.key);
  if (i >= 0) ledger.entries[i] = { ...ledger.entries[i], ...entry };
  else ledger.entries.push(entry);
  return ledger;
}
