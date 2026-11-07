#!/usr/bin/env node
/** 準備（収集・選定・一覧画像）の結果を1行にまとめる。通知用。 node scripts/dis/prep-summary.mjs <outディレクトリ> <日付> */
import fs from "node:fs/promises";
import path from "node:path";

const LABEL = { lp: "LP", banner: "バナー", web: "Web" };

export async function prepSummary(outDir, date) {
  const parts = [];
  for (const m of ["lp", "banner", "web"]) {
    const dir = path.join(outDir, date, m);
    let note;
    try {
      const sel = JSON.parse(await fs.readFile(path.join(dir, "selection.json"), "utf8"));
      const review = await fs.readFile(path.join(dir, "review/review.json"), "utf8").then(JSON.parse).catch(() => null);
      if (review?.items?.length) note = `${review.items.length}件`;
      else note = sel.selected ? "選定済み（一覧なし）" : `スキップ（${sel.skippedReason || "候補なし"}）`;
    } catch { note = "未実行/失敗"; }
    parts.push(`${LABEL[m]} ${note}`);
  }
  return parts.join(" / ");
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href) {
  const [outDir = "outputs/dis", date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10)] = process.argv.slice(2);
  console.log(await prepSummary(outDir, date));
}
