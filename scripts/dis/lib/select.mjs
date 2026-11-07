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
export function selectOne(candidates, { weights, minScore, maxCandidates = 5, dupCheck, tieSeed = "" }) {
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
  const eligible = evaluated.filter((e) => e.blockers.length === 0 && e.score >= minScore).sort((a, b) => b.score - a.score || tieHash(tieSeed, a.pageUrl) - tieHash(tieSeed, b.pageUrl));
  if (eligible.length === 0) {
    const reason = evaluated.length === 0 ? "候補なし" : evaluated.every((e) => e.blockers.length) ? "全候補が除外条件に該当" : `最高スコアが閾値${minScore}未満`;
    return { selected: null, evaluated, skippedReason: reason };
  }
  return { selected: eligible[0], evaluated };
}

/** 参照元ごとに順番に1件ずつ取り出して並べ替える（先頭の参照元に偏らないようにする）。 */
export function interleaveBySource(candidates) {
  const groups = new Map();
  for (const c of candidates) {
    const k = c.sourceKey || "?";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const lists = [...groups.values()];
  const out = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

/** 決定的な疑似乱数（日付＋URL）。同点のとき日替わりで参照元が偏らないようにする。 */
export function tieHash(seed, text) {
  let h = 2166136261;
  for (const ch of `${seed}|${text}`) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h;
}
