// 比率の信頼区間。純粋関数（ネットワーク・fs不使用）。
//
// 移植元: imsaif/design-with-claude の research-scout ブランチ
// (scripts/research/collect/stats.mjs)。コード・コメントともに同一のまま移植。
//
// Wald区間（p ± z·sqrt(pq/n)）ではなく Wilson score interval を使う。
// Waldはp=0またはp=1で「±0」という嘘の精度を返してしまう
// （例: 0/40で「0%±0pp」になるが、正しい95%上限は約9%）。
// Wilsonは両端でも正しく振れ幅を残す。

const Z = 1.96; // 95%

/** k/nのWilson 95%区間を返す（{low, high}は比率） */
export function wilson95(k, n) {
  if (n === 0) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = Z * Z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (Z / denom) * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** 「23% (95% CI 18-28%, n=278)」形式の文字列を返す */
export function formatCi(k, n) {
  const pct = n ? Math.round((k / n) * 100) : 0;
  const { low, high } = wilson95(k, n);
  return `${pct}% (95% CI ${Math.round(low * 100)}-${Math.round(high * 100)}%, n=${n})`;
}
