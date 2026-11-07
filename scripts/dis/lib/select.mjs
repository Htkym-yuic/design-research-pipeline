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
export function selectOne(candidates, { weights, minScore, maxCandidates = 5, dupCheck, tieSeed = "", passScore = null, reviewedOnly = false }) {
  const evaluated = candidates.map((c) => {
    const dup = dupCheck(c);
    const { score, parts } = scoreCandidate(c, weights);
    const blockers = [];
    if (dup.duplicate) blockers.push(`重複(${dup.reason}: ${dup.of ?? "?"})`);
    if (c.termsStatus !== "known") blockers.push("参照元の利用条件が未確認");
    if (!c.pageUrl) blockers.push("実ページURL未取得");
    if (c.fetchError) blockers.push(`取得不可: ${c.fetchError}`);
    return { ...c, score, scoreParts: parts, duplicate: dup, blockers, inComparison: false };
  });
  // 比較するのは「除外条件に該当しない候補」の先頭 maxCandidates 件（重複や取得失敗で枠を消費しない）
  const eligible = evaluated.filter((e) => e.blockers.length === 0);
  for (const e of eligible.slice(0, maxCandidates)) e.inComparison = true;
  // 人が評価した候補（reviewReasonあり）は、評価の合計点が高い順に選ぶ。同点のときだけ機械的なスコア、さらに日替わりの乱数で決める。
  // 評価済みの候補は、選定基準（passScore。原本は13/18点）以上でなければ選ばれない。足切りの閾値（minScore）は免除する。
  // reviewedOnly=true（rescore）のときは、評価済みだけを対象にし、基準を満たす候補がなければ「基準未達」でスキップする。
  const total = (c) => (c.reviewReason ? Number(c.reviewTotal ?? Math.round(Number(c.signals?.learningValue ?? 0) * 18)) : -1);
  const passes = (c) => (c.reviewReason ? passScore == null || total(c) >= passScore : !reviewedOnly && c.score >= minScore);
  const compared = eligible.slice(0, maxCandidates).filter(passes)
    .sort((a, b) => total(b) - total(a) || b.score - a.score || tieHash(tieSeed, a.pageUrl) - tieHash(tieSeed, b.pageUrl));
  if (compared.length === 0) {
    const reason = evaluated.length === 0 ? "候補なし" : eligible.length === 0 ? "全候補が除外条件に該当" : reviewedOnly ? `選定基準${passScore}/18点以上の候補なし（基準未達）` : `最高スコアが閾値${minScore}未満`;
    return { selected: null, evaluated, skippedReason: reason };
  }
  return { selected: compared[0], evaluated };
}

/** 参照元ごとに順番に1件ずつ取り出して並べ替える（先頭の参照元に偏らないようにする）。 */
export function interleaveBySource(candidates, seed = "") {
  const groups = new Map();
  for (const c of candidates) {
    const k = c.sourceKey || "?";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  // 参照元の並び順を日替わりで回す（参照元が多い媒体でも、5候補の枠に毎日異なる参照元が入る）
  const lists = [...groups.entries()].sort((a, b) => tieHash(seed, a[0]) - tieHash(seed, b[0])).map(([, v]) => v);
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
