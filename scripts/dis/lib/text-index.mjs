/** DIS Text Index: 検証済みの分析から、自然言語検索用の索引を作る（外部送信なし・ローカルのみ）。 */
const CJK = /[぀-ヿ㐀-鿿]+/g;

export function tokenize(text) {
  const t = String(text || "").normalize("NFKC").toLowerCase();
  const out = [];
  for (const w of t.match(/[a-z0-9][a-z0-9_-]+/g) || []) out.push(w);
  for (const run of t.match(CJK) || []) {
    if (run.length === 1) { out.push(run); continue; }
    for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  }
  return out;
}

function entriesOf(a) {
  const e = [["summary", a.summary], ["selectionReason", a.selectionReason]];
  for (const u of a.units) e.push([`unit:${u.id}`, [u.name, u.role, u.observation, u.reuseStructure, u.annotation].filter(Boolean).join(" ")]);
  for (const x of a.axes) e.push([`axis:${x.key}`, `${x.label} ${x.scope} ${x.evidence}`]);
  for (const g of ["top", "priority", "ideas"]) a.improvements[g].forEach((i, n) => e.push([`improvement:${g}:${n}`, `${i.issue} ${i.change} ${i.expected}`]));
  for (const s of a.reuse.reusableStructures) e.push(["reuse", s]);
  return e.filter(([, t]) => String(t || "").trim());
}

export function buildTextIndex(a, now = new Date()) {
  const entries = entriesOf(a).map(([field, text]) => ({ field, text: String(text).slice(0, 600) }));
  const tf = new Map();
  for (const { text } of entries) for (const t of tokenize(text)) tf.set(t, (tf.get(t) || 0) + 1);
  const terms = Object.fromEntries([...tf.entries()].sort((x, y) => y[1] - x[1] || (x[0] < y[0] ? -1 : 1)).slice(0, 400));
  return { schemaVersion: "dis-text-index-1.0", id: a.disId, media: a.media, brand: a.brand, pageUrl: a.pageUrl, analysisVersion: a.analysisVersion, generatedAt: now.toISOString(), entries, terms };
}

/** 索引（複数）から、質問文に近い順に返す。 */
export function searchIndexes(indexes, query, { limit = 5 } = {}) {
  const q = [...new Set(tokenize(query))];
  const scored = indexes.map((idx) => {
    let score = 0;
    for (const t of q) score += Math.log(1 + (idx.terms[t] || 0));
    const hits = idx.entries.map((e) => ({ field: e.field, text: e.text, s: q.filter((t) => tokenize(e.text).includes(t)).length })).filter((h) => h.s > 0).sort((a, b) => b.s - a.s).slice(0, 2);
    return { id: idx.id, media: idx.media, brand: idx.brand, pageUrl: idx.pageUrl, score: Math.round(score * 100) / 100, hits };
  }).filter((r) => r.score > 0).sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
