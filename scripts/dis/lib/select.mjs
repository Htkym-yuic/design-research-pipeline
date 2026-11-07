/** 候補スコアリング（0-100）。重みは config.scoring.weights。各項目は0〜1で評価済みの値を受け取る。 */
export function scoreCandidate(c, weights) {
  const s = c.signals || {};
  let total = 0;
  const parts = {};
  for (const [k, w] of Object.entries(weights)) {
    const v = Math.max(0, Math.min(1, Number(s[k] ?? 0)));
    parts[k] = Math.round(v * w * 10) / 10;
    total += v * w;
  }
  return { score: Math.round(total * 10) / 10, parts };
}

/**
 * 候補から1件を選ぶ。除外理由を全候補に残す（選定理由の透明性）。
 * @returns {{selected: object|null, evaluated: object[], skippedReason?: string}}
 */
export function selectOne(candidates, { weights, minScore, maxCandidates = 5, dupCheck }) {
  const pool = candidates.slice(0, maxCandidates);
  const evaluated = pool.map((c) => {
    const dup = dupCheck(c);
    const { score, parts } = scoreCandidate(c, weights);
    const blockers = [];
    if (dup.duplicate) blockers.push(`重複(${dup.reason}: ${dup.of ?? "?"})`);
    if (c.termsStatus !== "known") blockers.push("参照元の利用条件が未確認");
    if (!c.pageUrl) blockers.push("実ページURL未取得");
    if (c.fetchError) blockers.push(`取得不可: ${c.fetchError}`);
    return { ...c, score, scoreParts: parts, duplicate: dup, blockers };
  });
  const eligible = evaluated.filter((e) => e.blockers.length === 0 && e.score >= minScore).sort((a, b) => b.score - a.score);
  if (eligible.length === 0) {
    const reason = evaluated.length === 0 ? "候補なし" : evaluated.every((e) => e.blockers.length) ? "全候補が除外条件に該当" : `最高スコアが閾値${minScore}未満`;
    return { selected: null, evaluated, skippedReason: reason };
  }
  return { selected: eligible[0], evaluated };
}
