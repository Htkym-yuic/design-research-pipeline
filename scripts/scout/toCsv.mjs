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

// 件数トレンド（total_count）の履歴。サンプリング結果（解釈が要るドラフト）とは
// 別に、実行ごとの生数値だけを機械的に積み上げる。数値のみなので、解釈を伴う
// scan-log.mdへの追記（Claudeの判断が要る）とは異なり、ワークフローから直接
// 自動コミットしてよい。
export const COUNT_HISTORY_HEADER = "date,fingerprint,total_count";

/** 件数トレンドCSVの1行（ヘッダーなし） */
export function countHistoryRow({ date, fingerprint, count }) {
  return [date, fingerprint, count].join(",");
}
