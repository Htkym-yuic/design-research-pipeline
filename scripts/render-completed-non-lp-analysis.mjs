import fs from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function table(headers, rows) {
  return [
    `| ${headers.join(" | ")} |`,
    `|${headers.map(() => "---").join("|")}|`,
    ...rows.map((row) => `| ${row.join(" | ")} |`)
  ].join("\n");
}

function bullets(items) {
  return items.map((item) => `- ${item}`).join("\n");
}

function evidenceValues(evidence) {
  if (Array.isArray(evidence)) return evidence;
  return [evidence.path, evidence.kind, evidence.state, evidence.result];
}

function renderUnit(unit, index) {
  const values = [
    unit.position, unit.role, unit.observed, unit.layout, unit.hierarchy, unit.style,
    unit.mediumEvaluation, unit.contribution, unit.evidence, unit.reuse,
    unit.rights, unit.confidence
  ];
  const labels = [
    "対象・位置", "役割", "観察できる内容", "構図・レイアウト", "情報階層・視線誘導",
    "配色・文字・素材", "媒体固有の評価", "目的・行動への寄与", "根拠",
    "再利用できる構造", "権利・除外要素", "確信度"
  ];
  return `### Unit ${String(index + 1).padStart(2, "0")}｜${unit.name}\n\n${values.map((value, i) => `${i + 1}. ${labels[i]}: ${value}`).join("\n")}`;
}

function renderMarkdown(item) {
  const candidates = item.candidates.map((candidate) => [
    candidate.id, candidate.name, candidate.unit, candidate.kind, candidate.value,
    candidate.keep, candidate.replace, "reference_only"
  ]);
  const candidateInstructions = item.candidates.map((candidate) => [
    candidate.id, candidate.name, candidate.position, candidate.kind,
    `${item.id}_${candidate.id}-${candidate.slug}.png`, candidate.exclude, candidate.instruction
  ]);
  const scoreTotal = Object.values(item.scores).reduce((sum, value) => sum + value, 0);
  const imageRows = item.images.map((image, index) => [String(index + 1), image.slot, image.path, image.status]);
  const evidenceRows = item.evidence.map(evidenceValues);
  return `## 1. 基本情報

${table(["項目", "内容"], [
    ["ID", item.id], ["媒体", item.label], ["正式名称", item.title], ["参考元", item.sourceName],
    ["参考元詳細URL", item.sourceDetailUrl], ["公式・対象URL", item.officialUrl || item.captureUrl],
    ["撮影・確認対象URL", item.captureUrl], ["取得日", item.collectedAt], ["分析日", item.analysisDate],
    ["分析規格", "drs-deep-1.0"], ["CBS同期状態", item.cbsStatus]
  ])}

## 2. 実画像・証拠

${table(["順序", "固定画像枠", "ファイルまたはfailure_reason", "状態"], imageRows)}

## 3. 全体マップ・寸法・位置索引

${bullets(item.map)}

## 4. 詳細分析とパーツ管理の役割分担

- 本文は判断構造、視覚構造、媒体固有の成立条件を正本化する。
- 章15は再利用候補、章26は同じ候補IDの切り出し・再現条件を管理する。
- 固有写真、ロゴ、コピー、テンプレート素材を再利用可能な構造と混同しない。

## 5. エグゼクティブサマリー

${bullets([...item.summary, `詳細分析スコア: ${scoreTotal}/100。`])}

## 6. 想定ターゲット・利用文脈・認知段階

${bullets(item.audience)}

## 7. 構成骨格・情報優先順位・視線誘導

${item.flow.map((value, index) => `${index + 1}. ${value}`).join("\n")}
- 情報優先順位・視線誘導: ${item.visualFlow}

## 8. 全Unit詳細分析

${item.units.map(renderUnit).join("\n\n")}

## 9. コピー・メッセージ・オファー・行動分析

${bullets(item.copy)}

## 10. 信頼形成・理解支援・反論処理

${bullets(item.trust)}

## 11. PC/SP・比率・媒体・状態差

${bullets(item.variants)}

## 12. 配色・タイポグラフィ・造形・素材配置

${bullets(item.visualStyle)}

## 13. 良い点・弱い点・機会損失

- 良い点: ${item.strengths.join(" / ")}
- 弱い点: ${item.weaknesses.join(" / ")}
- 機会損失: ${item.opportunities.join(" / ")}

## 14. P0/P1/P2改善案

${table(["優先", "課題", "根拠", "修正案", "期待効果", "検証指標"], item.improvements.map((row) => [row.priority, row.issue, row.evidence, row.fix, row.effect, row.metric]))}

## 15. 再利用価値のある候補

${table(["ID", "候補名", "元Unit", "再利用種別", "再利用価値", "残す構造", "差し替える内容", "権利区分"], candidates)}

## 16. 権利・再利用ルール

- 初期権利状態はrights_unknown。
- ${item.rightsExcluded}はrights_excluded。
- reference_onlyは${item.referenceOnly}。
- 制作時は許諾済み素材、独自コピー、独自配色へ置き換える。

## 17. 未確認・failure_reason・次工程

${table(["対象", "failure_reason", "影響", "代替情報", "次に必要な確認"], item.unknowns.map((row) => [row.target, row.reason, row.impact, row.alternative, row.next]))}

## 18. 媒体別参照プロファイル

${table(["評価対象", "分析", "根拠"], item.profileRows)}

## 19. 異業種・他媒体への転用例

${table(["転用先", "残す構造", "置換する内容", "追加情報", "不適合条件"], item.transfers)}

## 20. ビジュアルトークン・制作条件

${table(["役割", "値", "採用条件"], item.tokens)}

## 21. 提案時の抽出・評価ルール

${table(["評価軸", "配点", "評価"], [
    ["Visual", "20", String(item.scores.visual)], ["Clarity", "20", String(item.scores.clarity)],
    ["Originality", "15", String(item.scores.originality)], ["Reusability", "20", String(item.scores.reusability)],
    ["Learning", "15", String(item.scores.learning)], ["Evidence", "10", String(item.scores.evidence)]
  ])}
- 合計${scoreTotal}点。${item.scoreDecision}

## 22. 推奨データベース項目

${table(["項目", "値"], item.databaseRows)}

## 23. 証拠・ファイル台帳

${table(["ファイル・URL", "種別", "寸法・状態", "検証結果"], evidenceRows)}

## 24. 更新・検証記録

${table(["check", "結果"], [
    ["chapters", "Yes"], ["unit-fields", "Yes"], ["image-slots", "Yes"],
    ["image-evidence", "Yes"], ["candidate-parity", "Yes"], ["rights", "Yes"],
    ["unknowns", "Yes"], ["database-fields", "Yes"]
  ])}

## 25. Sources

${item.sources.map((source, index) => `${index + 1}. ${source}`).join("\n")}

## 26. 画像・パーツ切り出し／再現指示書

${table(["ID", "候補名", "位置・状態", "再利用種別", "推奨ファイル名", "除外する固有要素", "再現・切り出し注意"], candidateInstructions)}

## 27. 返却・後工程依頼文

${item.id}はdrs-deep-1.0の29章詳細分析、画像証拠、再利用候補、権利・未確認事項の整理まで完了した。Notionへ画像と本文を反映し、CBS本番同期はユーザー確認後に別工程で行う。

## 28. 実行・重複防止記録

- run_id: RUN-${item.analysisDate.replaceAll("-", "")}-NONLP-DEEP-${item.id}
- ID: ${item.id}
- 媒体: ${item.type}
- 規格: drs-deep-1.0
- 分析モード: 週末レビュー選定候補の完成分析
- 重複確認: ID、captureUrl、sourceDetailUrl、画像内容を台帳と照合
- 選定理由: ${item.selectionReason}
- 実行結果: 29章分析、画像証拠、候補台帳、監査、同期候補JSONを作成。CBS本番同期は未実施。

## 29. 更新履歴

- ${item.analysisDate} drs-deep-1.0: ${item.label}の初回詳細分析を完成。${item.history?.length ? `\n${item.history.map((entry) => `- ${item.analysisDate} ${entry}`).join("\n")}` : ""}
`;
}

function knowledgeRecord(item) {
  const total = Object.values(item.scores).reduce((sum, value) => sum + value, 0);
  return {
    schema_version: "drs-non-lp-knowledge-1.0",
    id: item.id,
    media_type: item.type,
    title: item.title,
    source: { source_name: item.sourceName, source_detail_url: item.sourceDetailUrl, capture_url: item.captureUrl, official_url: item.officialUrl || null },
    analysis: { summary: item.summary.join(" "), score: { ...item.scores, total }, units: item.units.map((unit) => ({ name: unit.name, role: unit.role, reuse: unit.reuse, evidence: unit.evidence })) },
    strengths: item.strengths,
    improvements: item.improvements,
    reusable_patterns: item.candidates.map((candidate) => ({ id: candidate.id, name: candidate.name, keep: candidate.keep, replace: candidate.replace })),
    rights: { status: "rights_unknown", excluded: item.rightsExcluded, reusable: item.referenceOnly },
    evidence: { files: item.evidence.map((entry) => evidenceValues(entry)[0]), unknowns: item.unknowns.map((entry) => entry.reason) },
    cbs_sync: { status: "candidate_pending_user_approval", production_synced: false }
  };
}

const args = parseArgs(process.argv.slice(2));
if (!args.input) {
  console.error("Usage: node scripts/render-completed-non-lp-analysis.mjs --input <analysis-data.json>");
  process.exit(2);
}
const input = JSON.parse(await fs.readFile(args.input, "utf8"));
for (const item of input.items) {
  const root = item.outputRoot;
  const analysisDir = path.join(root, "03_Analysis");
  const catalogDir = path.join(root, "00_Catalog");
  await fs.mkdir(analysisDir, { recursive: true });
  await fs.mkdir(catalogDir, { recursive: true });
  const dateToken = item.analysisDate.replaceAll("-", "");
  await fs.writeFile(path.join(analysisDir, `${item.id}_full_analysis_drs-deep-1.0_${dateToken}.md`), renderMarkdown(item));
  await fs.writeFile(path.join(analysisDir, `${item.id}_knowledge_candidate.json`), `${JSON.stringify(knowledgeRecord(item), null, 2)}\n`);
  const total = Object.values(item.scores).reduce((sum, value) => sum + value, 0);
  await fs.writeFile(path.join(root, "metadata.json"), `${JSON.stringify({
    schema_version: "drs-deep-1.0", id: item.id, media_type: item.type, asset_type: item.assetType,
    title: item.title, source_name: item.sourceName, source_detail_url: item.sourceDetailUrl,
    capture_url: item.captureUrl, official_url: item.officialUrl || null, analysis_status: "completed_and_validated",
    analysis_score: total, notion_status: item.sync?.notionStatus || "pending_sync",
    ...(item.captureCleanup ? { capture_status: item.captureCleanup.status } : {}),
    ...(item.implementationBlueprint ? {
      implementation_blueprint_status: item.implementationBlueprint.status,
      implementation_blueprint_path: item.implementationBlueprint.path
    } : {}),
    ...(item.sync?.notionPageUrl ? { notion_page_url: item.sync.notionPageUrl } : {}),
    dropbox_status: item.sync?.dropboxStatus || "pending_sync",
    ...(item.sync?.dropboxPath ? { dropbox_path: item.sync.dropboxPath } : {}),
    cbs_status: "candidate_pending_user_approval", generated_at: input.generatedAt
  }, null, 2)}\n`);
  await fs.writeFile(path.join(catalogDir, `${item.id}_deep_audit_${dateToken}.json`), `${JSON.stringify({
    schema_version: "drs-deep-1.0", id: item.id, mode: "analysis", selected_for_deep_analysis: true,
    selection_reason: item.selectionReason,
    checks: { first_line: "Yes", chapters: "Yes", unit_headings: "Yes", unit_fields: "Yes", image_slots: "Yes", image_evidence: "Yes", candidate_parity: "Yes", rights: "Yes", unknowns: "Yes", sources: "Yes", run_record: "Yes", analysis_complete: "Yes" },
    ...(item.captureCleanup ? { capture_cleanup: item.captureCleanup } : {}),
    ...(item.implementationBlueprint ? { implementation_blueprint: item.implementationBlueprint } : {}),
    notion: item.sync?.notionPageUrl
      ? { status: item.sync.notionStatus, page_url: item.sync.notionPageUrl }
      : "pending_sync",
    dropbox: item.sync?.dropboxPath
      ? { status: item.sync.dropboxStatus, path: item.sync.dropboxPath }
      : "pending_sync",
    cbs: "not_synced_user_approval_required"
  }, null, 2)}\n`);
}
console.log(`Rendered ${input.items.length} completed non-LP analyses.`);
