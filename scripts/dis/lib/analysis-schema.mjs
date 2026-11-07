/**
 * DIS分析（analysis.json）の構造と品質検証。原本スキル（dis-design-learning）の「分析パックの完了チェック」に準拠する。
 * schemaVersion: "dis-2.0"（現行）。"dis-1.0"（旧9軸）は読み取り専用の履歴として扱い、公開（publish）はできない。
 */
export const AXES = [
  { key: "purpose_fit", label: "目的適合" },
  { key: "information_hierarchy", label: "情報優先順位" },
  { key: "visual_flow", label: "視線誘導" },
  { key: "message_copy", label: "訴求・コピー" },
  { key: "trust_safety", label: "信頼・安心" },
  { key: "color_legibility", label: "配色・可読性" },
  { key: "layout_spacing", label: "レイアウト・余白" },
  { key: "visual_brand", label: "ビジュアル・ブランド" },
  { key: "implementation_reuse", label: "実装・転用性" },
];
export const AXIS_KEYS = AXES.map((a) => a.key);
export const CONFIDENCE = ["high", "medium", "low"];
export const TOOLS = ["Canva", "Photoshop", "Elementor"];
export const REVIEW_STATES = ["未レビュー", "レビュー済み"];
const FORBIDDEN_FIELDS = ["logoAsset", "personPhoto", "verbatimCopy", "price", "trackRecord", "totalScore", "ranking"];
const IMPROVEMENT_FIELDS = [["issue", "課題"], ["evidence", "根拠"], ["change", "変更"], ["expected", "期待変化"], ["metric", "確認指標"]];

const blankImprovement = () => ({ issue: "", evidence: "", change: "", expected: "", metric: "" });

export function emptyAnalysis({ media, disId, pageUrl, brand }) {
  return {
    schemaVersion: "dis-2.0",
    analysisVersion: "2.0",
    sourceAnalysisRef: "なし（新規調査）",
    status: "template",
    reviewState: "未レビュー",
    generatedAt: new Date().toISOString(),
    media, disId, pageUrl, brand,
    sourceImageRefs: [],
    summary: "",
    selectionReason: "",
    sectionCoverage: { sourceUnitCount: 0, analyzedUnitCount: 0 },
    units: [{ id: "U1", name: "", sectionRef: "", role: "", observation: "", evidence: "", confidence: null, reuseStructure: "", mustReplace: [], unknowns: [], annotation: "" }],
    axes: AXES.map((x) => ({ key: x.key, label: x.label, score: null, scope: "", evidence: "", confidence: null, unverified: "" })),
    improvements: { top: [blankImprovement()], priority: [], ideas: [] },
    reproduction: Object.fromEntries(TOOLS.map((t) => [t, { structureSteps: [], replaceSteps: [] }])),
    reuse: { reusableStructures: [], mustReplaceElements: [] },
    rights: { unverified: ["利用条件・権利は目視確認が必要"], noReuse: ["ロゴ", "人物", "写真", "コピー", "価格", "実績値"] },
    existingAnalysisComparison: { existing: false, note: "既存分析なし（新規調査）", matches: [], differences: [], additions: [] },
    externalSync: { cbs: "未同期（DISはCBSへ同期しない）", notion: "未登録", dropbox: "未保存" },
  };
}

const str = (v) => typeof v === "string" && v.trim().length > 0;
const arr = (v) => Array.isArray(v);

export function validateAnalysis(a, { requireComplete = true } = {}) {
  if (a?.schemaVersion === "dis-1.0") return { ok: false, errors: ["旧形式（dis-1.0・旧9軸）です。dis-2.0へ移行してください（公開はできません）"] };
  const errors = [];
  const err = (m) => errors.push(m);
  if (a?.schemaVersion !== "dis-2.0") err("schemaVersion は dis-2.0");
  if (requireComplete && a?.status !== "complete") err(`status が complete ではありません (${a?.status})`);
  for (const f of ["media", "disId", "pageUrl", "brand", "summary", "selectionReason", "analysisVersion", "sourceAnalysisRef"]) if (!str(a?.[f])) err(`${f} が空`);
  if (!REVIEW_STATES.includes(a?.reviewState)) err(`reviewState は ${REVIEW_STATES.join("/")}`);
  if (!(typeof a?.generatedAt === "string" && !Number.isNaN(Date.parse(a.generatedAt)))) err("generatedAt は日時（ISO形式）");
  if (!arr(a?.sourceImageRefs) || a.sourceImageRefs.length === 0 || !a.sourceImageRefs.every(str)) err("sourceImageRefs（元画像参照）が空");

  const units = arr(a?.units) ? a.units : [];
  if (units.length === 0) err("units（全Section/Unit）が空");
  const sc = a?.sectionCoverage;
  if (!(Number.isInteger(sc?.sourceUnitCount) && Number.isInteger(sc?.analyzedUnitCount))) err("sectionCoverage.sourceUnitCount / analyzedUnitCount は整数");
  else if (sc.sourceUnitCount !== sc.analyzedUnitCount || sc.analyzedUnitCount !== units.length) err(`sectionCoverage が一致しない（source=${sc.sourceUnitCount}, analyzed=${sc.analyzedUnitCount}, units=${units.length}）`);
  units.forEach((u, i) => {
    for (const f of ["id", "name", "role", "observation", "evidence", "reuseStructure"]) if (!str(u?.[f])) err(`units[${i}].${f} が空`);
    if (!CONFIDENCE.includes(u?.confidence)) err(`units[${i}].confidence は ${CONFIDENCE.join("/")}`);
    if (!arr(u?.mustReplace)) err(`units[${i}].mustReplace（差替必須要素）は配列`);
    if (!arr(u?.unknowns)) err(`units[${i}].unknowns は配列`);
    else u.unknowns.forEach((k, j) => { for (const f of ["item", "impact", "nextCheck"]) if (!str(k?.[f])) err(`units[${i}].unknowns[${j}].${f} が空`); });
  });
  if (new Set(units.map((u) => u?.id)).size !== units.length) err("units の id が重複");

  const axes = arr(a?.axes) ? a.axes : [];
  if (axes.length !== AXES.length) err(`axes は${AXES.length}件ちょうど`);
  for (const ax of AXES) {
    const x = axes.find((v) => v?.key === ax.key);
    if (!x) { err(`9軸に「${ax.label}（${ax.key}）」がない`); continue; }
    const s = x.score;
    if (!(Number.isInteger(s) && s >= 0 && s <= 5)) err(`${ax.label}: score は0〜5の整数（0=評価不能）`);
    if (!str(x.scope)) err(`${ax.label}: 対象範囲(scope)が必須`);
    if (!str(x.evidence)) err(`${ax.label}: 根拠(evidence)が必須`);
    if (!CONFIDENCE.includes(x.confidence)) err(`${ax.label}: 確信度(confidence)は ${CONFIDENCE.join("/")}`);
    if (!str(x.unverified)) err(`${ax.label}: 未確認事項(unverified)が必須（なければ「なし」と明記）`);
    if (s === 0 && !str(x.notEvaluableReason)) err(`${ax.label}: score 0 は notEvaluableReason（評価不能の理由）が必須`);
  }

  const imp = a?.improvements || {};
  if (!arr(imp.top) || imp.top.length !== 1) err("最優先アクション(improvements.top)は1件");
  if (!arr(imp.priority) || imp.priority.length < 1) err("優先アクション(improvements.priority)が空");
  if (!arr(imp.ideas) || imp.ideas.length < 1) err("改善アイデア(improvements.ideas)が空");
  for (const grp of ["top", "priority", "ideas"]) (arr(imp[grp]) ? imp[grp] : []).forEach((it, i) => IMPROVEMENT_FIELDS.forEach(([f, label]) => { if (!str(it?.[f])) err(`improvements.${grp}[${i}].${f}（${label}）が空`); }));

  for (const t of TOOLS) {
    const r = a?.reproduction?.[t];
    if (!arr(r?.structureSteps) || r.structureSteps.length < 1) err(`再現手順(${t}): structureSteps（再現可能な構造）が空`);
    if (!arr(r?.replaceSteps) || r.replaceSteps.length < 1) err(`再現手順(${t}): replaceSteps（固有素材の差替）が空`);
  }
  if (!arr(a?.reuse?.reusableStructures) || a.reuse.reusableStructures.length < 1) err("reuse.reusableStructures（再利用構造）が空");
  if (!arr(a?.reuse?.mustReplaceElements) || a.reuse.mustReplaceElements.length < 1) err("reuse.mustReplaceElements（差替必須要素）が空");
  if (!arr(a?.rights?.unverified) || a.rights.unverified.length < 1) err("rights.unverified（権利・未確認事項）が空");
  if (!arr(a?.rights?.noReuse) || a.rights.noReuse.length < 1) err("rights.noReuse（再利用しない要素）が空");

  const c = a?.existingAnalysisComparison;
  if (typeof c?.existing !== "boolean") err("existingAnalysisComparison.existing は true/false");
  else if (!c.existing && !str(c.note)) err("既存分析がない場合は existingAnalysisComparison.note を書く");
  else if (c.existing && !(arr(c.matches) && arr(c.differences) && arr(c.additions))) err("既存分析がある場合は matches/differences/additions（一致・相違・追加発見）が必要");
  for (const f of ["cbs", "notion", "dropbox"]) if (!str(a?.externalSync?.[f])) err(`externalSync.${f}（外部同期の記録）が空`);
  for (const f of FORBIDDEN_FIELDS) if (a?.[f] !== undefined) err(`禁止フィールド ${f}（転用対象／媒体横断の順位づけ）を含めない`);
  return { ok: errors.length === 0, errors };
}

const cell = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\n/g, " ");
const imp = (it) => `課題: ${it.issue} ／ 根拠: ${it.evidence} ／ 変更: ${it.change} ／ 期待変化: ${it.expected} ／ 確認指標: ${it.metric}`;

export function analysisToMarkdown(a) {
  if (a.schemaVersion === "dis-1.0") return analysisToMarkdownV1(a);
  const L = [`# ${a.brand}（${a.disId}）`, "",
    `- 媒体: ${a.media}`, `- ページ: ${a.pageUrl}`, `- 分析版: ${a.analysisVersion}（元分析参照: ${a.sourceAnalysisRef}）`, `- 生成日時: ${a.generatedAt}`, `- レビュー状態: ${a.reviewState}`,
    `- 元画像参照: ${a.sourceImageRefs.join("、")}`, `- 外部同期: CBS=${a.externalSync.cbs} ／ Notion=${a.externalSync.notion} ／ Dropbox=${a.externalSync.dropbox}`, "",
    "## 概要", a.summary, "", "## 選定理由", a.selectionReason, "",
    "## 権利・未確認事項", ...a.rights.unverified.map((v) => `- 未確認: ${v}`), `- 転用しない: ${a.rights.noReuse.join("、")}`, "",
    "## 再利用構造と差替必須要素", ...a.reuse.reusableStructures.map((v) => `- 再利用構造: ${v}`), ...a.reuse.mustReplaceElements.map((v) => `- 差替必須: ${v}`), "",
    "## 既存分析との比較"];
  const c = a.existingAnalysisComparison;
  if (!c.existing) L.push(`- ${c.note}`);
  else L.push(...c.matches.map((v) => `- 一致: ${v}`), ...c.differences.map((v) => `- 相違: ${v}`), ...c.additions.map((v) => `- 追加発見: ${v}`));
  L.push("", `## Section / Unit（${a.sectionCoverage.analyzedUnitCount}/${a.sectionCoverage.sourceUnitCount}）`);
  for (const u of a.units) {
    L.push(`### ${u.id} ${u.name}`, `- 位置: ${u.sectionRef || "-"}`, `- 役割: ${u.role}`, `- 観察: ${u.observation}`, `- 根拠: ${u.evidence}（確信度 ${u.confidence}）`, `- 再利用構造: ${u.reuseStructure}`, `- 差替必須: ${u.mustReplace.length ? u.mustReplace.join("、") : "なし"}`);
    for (const k of u.unknowns) L.push(`- 未確認: ${k.item}（影響: ${k.impact} ／ 次の確認: ${k.nextCheck}）`);
    if (u.annotation) L.push(`- 注釈: ${u.annotation}`);
    L.push("");
  }
  L.push("## 9軸評価", "| 軸 | 評価 | 確信度 | 対象範囲 | 根拠 | 未確認 |", "|---|---|---|---|---|---|");
  for (const x of a.axes) L.push(`| ${x.label} | ${x.score === 0 ? "評価不能" : x.score} | ${x.confidence} | ${cell(x.scope)} | ${cell(x.score === 0 ? x.notEvaluableReason : x.evidence)} | ${cell(x.unverified)} |`);
  L.push("", "## 改善案", "### 最優先アクション", ...a.improvements.top.map((i) => `- ${imp(i)}`), "### 優先アクション", ...a.improvements.priority.map((i) => `- ${imp(i)}`), "### 改善アイデア", ...a.improvements.ideas.map((i) => `- ${imp(i)}`), "", "## 再現手順");
  for (const t of TOOLS) {
    const r = a.reproduction[t];
    L.push(`### ${t}`, "再現できる構造", ...r.structureSteps.map((s, i) => `${i + 1}. ${s}`), "固有素材の差替", ...r.replaceSteps.map((s, i) => `${i + 1}. ${s}`), "");
  }
  return L.join("\n");
}

function analysisToMarkdownV1(a) {
  const L = [`# ${a.brand}（${a.disId}）`, "", `- 媒体: ${a.media}`, `- ページ: ${a.pageUrl}`, "", "## 概要", a.summary, "", "## 選定理由", a.selectionReason, "", "## 権利・未確認事項", ...a.rightsNotes.unverified.map((v) => `- 未確認: ${v}`), `- 転用しない: ${a.rightsNotes.noReuse.join("、")}`, "", "## Section / Unit"];
  for (const u of a.units) L.push(`### ${u.id} ${u.name}`, `- 位置: ${u.sectionRef || "-"}`, `- 観察: ${u.observation}`, `- 注釈: ${u.annotation}`, "");
  L.push("## 9軸評価", "| 軸 | 評価 | 確信度 | 根拠 | 未確認 |", "|---|---|---|---|---|");
  for (const x of a.axes) L.push(`| ${x.axis} | ${x.score ?? "-"} | ${x.confidence ?? "-"} | ${String(x.evidence).replace(/\|/g, "／")} | ${String(x.unverified).replace(/\|/g, "／")} |`);
  L.push("", "## アクション", `**最優先**: ${a.actions.top.join(" / ")}`, "", "**優先**", ...a.actions.priority.map((v) => `- ${v}`), "", "**改善アイデア**", ...a.actions.ideas.map((v) => `- ${v}`), "", "## 再現手順");
  for (const t of TOOLS) L.push(`### ${t}`, ...(a.reproduction[t] || []).map((s, i) => `${i + 1}. ${s}`), "");
  return L.join("\n");
}
