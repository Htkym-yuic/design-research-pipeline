// 調査サンプルのCSV整形。ネットワーク・fsは使わない純粋関数。
//
// 移植元: imsaif/design-with-claude の research-scout ブランチ
// (scripts/research/collect/toCsv.mjs)。agent-config調査での
// `is_frontend`列は、デザイン指紋そのものがすでに「デザイン関連ツール」を
// 意味するため、この移植では落としている（フロントエンド判定の二重適用は
// しない、という単純化）。

export const CSV_HEADER = "repo,fingerprint,first_commit,quarter";

/** ISO日付 -> "2026Q1" のような四半期ラベル（UTC基準） */
export function quarterOf(isoDate) {
  const d = new Date(isoDate);
  const year = d.getUTCFullYear();
  const quarter = Math.floor(d.getUTCMonth() / 3) + 1;
  return `${year}Q${quarter}`;
}

/** quarterを算出した正規の行オブジェクトを作る */
export function rowFrom({ repo, fingerprint, firstCommit }) {
  return {
    repo,
    fingerprint,
    first_commit: firstCommit,
    quarter: quarterOf(firstCommit),
  };
}

/** 行配列 -> CSV文字列（末尾改行あり） */
export function toCsv(rows) {
  const lines = [CSV_HEADER];
  for (const r of rows) {
    lines.push([r.repo, r.fingerprint, r.first_commit, r.quarter].join(","));
  }
  return lines.join("\n") + "\n";
}
