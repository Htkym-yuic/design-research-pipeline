/** DIS分析（analysis.json）の構造と品質検証。status=complete のものだけ公開（Dropbox/Notion）対象。 */
export const AXES = ["情報設計", "視線誘導", "タイポグラフィ", "配色", "余白・レイアウト", "CTA・導線", "信頼性・根拠", "ブランド一貫性", "再現性"];
export const CONFIDENCE = ["high", "medium", "low"];
export const TOOLS = ["Canva", "Photoshop", "Elementor"];
const FORBIDDEN_COPY_FIELDS = ["logoAsset", "personPhoto", "verbatimCopy", "price", "trackRecord"];

export function emptyAnalysis({ media, disId, pageUrl, brand }) {
  return {
    schemaVersion: "dis-1.0",
    status: "template",
    media, disId, pageUrl, brand,
    summary: "",
    selectionReason: "",
    rightsNotes: { unverified: ["利用条件・権利は目視確認が必要"], noReuse: ["ロゴ", "人物", "写真", "コピー", "価格", "実績値"] },
    units: [{ id: "U1", name: "", sectionRef: "", observation: "", annotation: "" }],
    axes: AXES.map((axis) => ({ axis, score: null, evidence: "", confidence: null, unverified: "" })),
    actions: { top: [], priority: [], ideas: [] },
    reproduction: { Canva: [], Photoshop: [], Elementor: [] },
  };
}

export function validateAnalysis(a, { requireComplete = true } = {}) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (a?.schemaVersion !== "dis-1.0") err("schemaVersion は dis-1.0");
  if (requireComplete && a?.status !== "complete") err(`status が complete ではありません (${a?.status})`);
  for (const f of ["media", "disId", "pageUrl", "brand", "summary", "selectionReason"]) if (!String(a?.[f] ?? "").trim()) err(`${f} が空`);
  if (!Array.isArray(a?.units) || a.units.length === 0) err("units（全Section/Unit）が空");
  else a.units.forEach((u, i) => { for (const f of ["name", "observation", "annotation"]) if (!String(u?.[f] ?? "").trim()) err(`units[${i}].${f} が空`); });
  const axes = a?.axes || [];
  for (const name of AXES) {
    const x = axes.find((v) => v.axis === name);
    if (!x) { err(`9軸に「${name}」がない`); continue; }
    if (!(Number.isFinite(x.score) && x.score >= 1 && x.score <= 5)) err(`${name}: score は1〜5`);
    if (!String(x.evidence ?? "").trim()) err(`${name}: 根拠(evidence)が必須`);
    if (!CONFIDENCE.includes(x.confidence)) err(`${name}: 確信度(confidence)は ${CONFIDENCE.join("/")}`);
    if (!String(x.unverified ?? "").trim()) err(`${name}: 未確認事項(unverified)が必須（なければ「なし」と明記）`);
  }
  if (axes.length !== AXES.length) err(`axes は${AXES.length}件ちょうど`);
  const act = a?.actions || {};
  if (!Array.isArray(act.top) || act.top.length !== 1) err("最優先アクション(top)は1件");
  if (!Array.isArray(act.priority) || act.priority.length < 1) err("優先アクション(priority)が空");
  if (!Array.isArray(act.ideas) || act.ideas.length < 1) err("改善アイデア(ideas)が空");
  for (const t of TOOLS) if (!Array.isArray(a?.reproduction?.[t]) || a.reproduction[t].length < 1) err(`再現手順(${t})が空`);
  for (const f of FORBIDDEN_COPY_FIELDS) if (a?.[f] !== undefined) err(`転用禁止フィールド ${f} を含めない`);
  return { ok: errors.length === 0, errors };
}

export function analysisToMarkdown(a) {
  const L = [`# ${a.brand}（${a.disId}）`, "", `- 媒体: ${a.media}`, `- ページ: ${a.pageUrl}`, "", "## 概要", a.summary, "", "## 選定理由", a.selectionReason, "", "## 権利・未確認事項", ...a.rightsNotes.unverified.map((v) => `- 未確認: ${v}`), `- 転用しない: ${a.rightsNotes.noReuse.join("、")}`, "", "## Section / Unit"];
  for (const u of a.units) L.push(`### ${u.id} ${u.name}`, `- 位置: ${u.sectionRef || "-"}`, `- 観察: ${u.observation}`, `- 注釈: ${u.annotation}`, "");
  L.push("## 9軸評価", "| 軸 | 評価 | 確信度 | 根拠 | 未確認 |", "|---|---|---|---|---|");
  for (const x of a.axes) L.push(`| ${x.axis} | ${x.score ?? "-"} | ${x.confidence ?? "-"} | ${String(x.evidence).replace(/\|/g, "／")} | ${String(x.unverified).replace(/\|/g, "／")} |`);
  L.push("", "## アクション", `**最優先**: ${a.actions.top.join(" / ")}`, "", "**優先**", ...a.actions.priority.map((v) => `- ${v}`), "", "**改善アイデア**", ...a.actions.ideas.map((v) => `- ${v}`), "", "## 再現手順");
  for (const t of TOOLS) L.push(`### ${t}`, ...(a.reproduction[t] || []).map((s, i) => `${i + 1}. ${s}`), "");
  return L.join("\n");
}
