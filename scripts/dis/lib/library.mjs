import fs from "node:fs/promises";
import path from "node:path";

/** 案件フォルダ名: <連番4桁>_<日付8桁>_<ブランド名（短縮）>  例: 0001_20261110_KAKEDASHI */
export function safeBrand(brand, max = 24) {
  const t = String(brand || "").replace(/[\\/:*?"<>|\u0000-\u001f]/g, " ").replace(/\s+/g, "_").replace(/^[._]+|[._]+$/g, "");
  return Array.from(t).slice(0, max).join("") || "untitled";
}

export function itemFolderName({ disId, date, brand }) {
  const serial = String(disId).match(/-(\d{4})$/)?.[1];
  if (!serial) throw new Error(`連番IDではありません: ${disId}`);
  return `${serial}_${String(date).replaceAll("-", "")}_${safeBrand(brand)}`;
}

/** 媒体別の案件フォルダ（<出力先>/<LP|Banner|Web>/<案件フォルダ>）。出力先からの相対パスを返す。 */
export function itemRelDir(cfg, media, { disId, date, brand }) {
  return path.join(cfg.media[media].localFolder, itemFolderName({ disId, date, brand }));
}

/** 媒体フォルダの名前の一覧（先頭が、いま作る名前。続くのは、以前の名前で、読み取りだけ使う。既存のフォルダは動かさない）。 */
export function mediaFolders(cfg, media) {
  return [cfg.media[media].localFolder, ...(cfg.media[media].localFolderAliases || [])];
}

/** フォルダ名の先頭4桁（連番）から、媒体フォルダ内で予約済みの番号を集める。 */
export async function reservedFromLibrary(outDir, cfg, media) {
  const out = [];
  for (const folder of mediaFolders(cfg, media)) {
    try {
      const names = await fs.readdir(path.join(outDir, folder));
      out.push(...names.map((n) => n.match(/^(\d{4})_/)?.[1]).filter(Boolean).map((s) => `${cfg.idPrefix}-${cfg.media[media].idCode}-${s}`));
    } catch { /* なし */ }
  }
  return out;
}

const exists = async (p) => fs.access(p).then(() => true, () => false);

/** 全案件の一覧（INDEX.md）。各案件フォルダの item.json と、フォルダ内のファイルの有無から状態を判定する。 */
export async function writeIndex(outDir, cfg, ledger) {
  const rows = [];
  for (const media of Object.keys(cfg.media)) {
   for (const folder of mediaFolders(cfg, media)) {
    const base = path.join(outDir, folder);
    let names = [];
    try { names = (await fs.readdir(base)).sort(); } catch { continue; }
    for (const n of names) {
      const dir = path.join(base, n);
      let item;
      try { item = JSON.parse(await fs.readFile(path.join(dir, "item.json"), "utf8")); } catch { continue; }
      let status = "未撮影";
      if (await exists(path.join(dir, "files"))) status = "撮影済み";
      try { const a = JSON.parse(await fs.readFile(path.join(dir, "analysis.json"), "utf8")); if (a.status && a.status !== "template") status = "分析済み"; } catch { /* なし */ }
      if (await exists(path.join(dir, "analysis.md"))) status = "検証済み";
      if (ledger?.entries?.some((e) => e.disId === item.disId)) status = "登録済み";
      rows.push({ folder: `${folder}/${n}`, ...item, status });
    }
   }
  }
  const L = ["# DIS 案件一覧", "", "（自動生成。媒体別フォルダの中に、自動・手動を区別せず連番で並ぶ）", "", "| ID | 日付 | 種類 | 取得 | ブランド | 状態 | URL | フォルダ |", "|---|---|---|---|---|---|---|---|"];
  for (const r of rows) L.push(`| ${r.disId} | ${r.date} | ${r.media} | ${r.mode} | ${String(r.brand).replace(/\|/g, "/")} | ${r.status} | ${r.pageUrl} | ${r.folder} |`);
  if (!rows.length) L.push("| （まだありません） | | | | | | | |");
  await fs.writeFile(path.join(outDir, "INDEX.md"), L.join("\n") + "\n");
  return rows;
}
