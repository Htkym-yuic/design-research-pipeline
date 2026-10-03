import fs from "node:fs/promises";
import path from "node:path";

const CONFIG_PATH = "config/non-lp-deep-analysis-templates.json";
const RESERVATIONS_PATH = "candidates/non-lp/intake-reservations.json";
const CURRENT_CANDIDATES_PATH = "candidates/non-lp/candidates.json";
const LIGHT_ANALYSIS_PATH = "candidates/non-lp/lightweight-analysis.json";
const CAPTURE_SUMMARY_PATH = "screenshots/non-lp-candidates/summary.json";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith("--") ? argv[++i] : true;
  }
  return args;
}

async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

function safeSlug(value) {
  return String(value || "untitled")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "untitled";
}

function inferType(id) {
  const prefix = String(id).split("-")[0];
  if (["PHAC", "ILAC", "SLAC", "DESAC", "MVAC", "NYAC", "FBAC", "MEAC"].includes(prefix)) return "ASSET";
  return prefix;
}

function placeholder(value, fallback = "[要分析]") {
  return value === null || value === undefined || value === "" ? fallback : String(value);
}

function imageSlotRows(profile) {
  return profile.imageSlots
    .map((slot, index) => `| ${index + 1} | ${slot} | [要設定: 画像パスまたはfailure_reason] | 未確認 |`)
    .join("\n");
}

function unitSections(profile) {
  return profile.analysisUnits.map((unit, index) => {
    const fields = [
      `1. 対象・位置: [要分析: ${unit}の位置または画面状態]`,
      `2. 役割: [要分析]`,
      `3. 観察できる内容: [要分析]`,
      `4. 構図・レイアウト: [要分析]`,
      `5. 情報階層・視線誘導: [要分析]`,
      `6. 配色・文字・素材: [要分析]`,
      `7. 媒体固有の評価: [要分析: ${profile.focus.join("、")}]`,
      `8. 目的・行動への寄与: [要分析]`,
      `9. 根拠: [要設定: 画像・URL・実測値]`,
      `10. 再利用できる構造: [要分析]`,
      `11. 権利・除外要素: rights_unknown。固有素材はrights_excluded候補`,
      `12. 確信度: 低（テンプレート作成時点）`
    ];
    return `### Unit ${String(index + 1).padStart(2, "0")}｜${unit}\n\n${fields.join("\n")}`;
  }).join("\n\n");
}

function focusRows(profile) {
  return profile.focus.map((item) => `| ${item} | [要分析] | [要設定: 根拠] |`).join("\n");
}

function databaseRows(profile) {
  return profile.databaseFields.map((field) => `| ${field} | [要設定] |`).join("\n");
}

function buildMarkdown({ item, analysis, profile, type, runDate }) {
  const sourceDetail = placeholder(item.sourceDetailUrl || item.captureUrl);
  const title = placeholder(item.title);
  return `## 1. 基本情報

| 項目 | 内容 |
|---|---|
| ID | ${item.id} |
| 媒体 | ${profile.label} |
| 正式名称 | ${title} |
| 参考元 | ${placeholder(item.sourceName)} |
| 参考元詳細URL | ${sourceDetail} |
| 撮影・確認対象URL | ${placeholder(item.captureUrl)} |
| 遷移先URL | ${placeholder(item.landingUrl, "未確認")} |
| 取得日 | ${runDate} |
| 分析規格 | drs-deep-1.0 |
| CBS同期状態 | 未同期・ユーザー確認待ち |

## 2. 実画像・証拠

| 順序 | 固定画像枠 | ファイルまたはfailure_reason | 状態 |
|---:|---|---|---|
${imageSlotRows(profile)}

## 3. 全体マップ・寸法・位置索引

- 原本寸法: [要実測]
- 表示・掲載環境: [要確認]
- Unit位置索引: [要作成]
- Web/UI/PartsはPC/SPまたは状態別の位置を分けて記録する。

## 4. 詳細分析とパーツ管理の役割分担

- 本文は判断構造、視覚構造、再利用条件を正本化する。
- 章15は再利用候補、章26は画像化・切り出し・再現指示を同じIDで管理する。
- 固有素材を保存対象の構造と混同しない。

## 5. エグゼクティブサマリー

- 日次軽量分析: ${placeholder(analysis.overview)}
- 選定理由: ${placeholder(analysis.selectionReason)}
- 保存価値: [要分析]
- 主な学習価値: [要分析]
- 詳細分析スコア: [要採点]/100

## 6. 想定ターゲット・利用文脈・認知段階

- 想定ターゲット: [要分析]
- 利用文脈: [要分析]
- 認知段階またはタスク段階: [要分析]
- 意思決定・操作・理解の障壁: [要分析]

## 7. 構成骨格・情報優先順位・視線誘導

1. [要分析]
2. [要分析]
3. [要分析]
- 情報優先順位: [要分析]
- 視線誘導: [要分析]

## 8. 全Unit詳細分析

${unitSections(profile)}

## 9. コピー・メッセージ・オファー・行動分析

- 主要コピーまたはメッセージ: [要分析]
- 補助コピー: [要分析]
- オファー・価格・条件: [該当なし／要分析]
- CTA・期待行動: [要分析]
- 媒体固有重点: ${profile.focus.join("、")}

## 10. 信頼形成・理解支援・反論処理

- 信頼形成: [要分析]
- 理解支援: [要分析]
- 不安・反論・エラーへの対処: [要分析]
- クロージングまたは完了状態: [要分析]

## 11. PC/SP・比率・媒体・状態差

- PC/SP差: [該当なし／要分析]
- 掲載比率・サイズ差: [要分析]
- 操作前後・展開差: [該当なし／要分析]
- 情報の欠落・優先順位変化: [要分析]

## 12. 配色・タイポグラフィ・造形・素材配置

- 役割別HEX: [要実測]
- タイポグラフィ: [要分析]
- グリッド・余白: [要分析]
- 写真・イラスト・商品・人物配置: [要分析]
- 装飾・背景処理: [要分析]

## 13. 良い点・弱い点・機会損失

- 良い点: [要分析]
- 弱い点: [要分析]
- 機会損失: [要分析]
- 既存ライブラリとの差分: [要分析]

## 14. P0/P1/P2改善案

| 優先 | 課題 | 根拠 | 修正案 | 期待効果 | 検証指標 |
|---|---|---|---|---|---|
| P0 | [要分析] | [要設定] | [要分析] | [要分析] | [要設定] |
| P1 | [要分析] | [要設定] | [要分析] | [要分析] | [要設定] |
| P2 | [要分析] | [要設定] | [要分析] | [要分析] | [要設定] |

## 15. 再利用価値のある候補

| ID | 候補名 | 元Unit | 再利用種別 | 再利用価値 | 残す構造 | 差し替える内容 | 権利区分 |
|---|---|---|---|---|---|---|---|
| C01 | [要分析] | Unit 01 | [要分析] | [要分析] | [要分析] | [要分析] | reference_only |

## 16. 権利・再利用ルール

- 初期状態: rights_unknown。
- ロゴ、人物・商品写真、固有イラスト、固有コピー、固有数値はrights_excluded候補。
- 再利用対象は構成、余白、情報順序、役割分担、操作原則とする。

## 17. 未確認・failure_reason・次工程

| 対象 | failure_reason | 影響 | 代替情報 | 次に必要な確認 |
|---|---|---|---|---|
| 画像・実測 | template_pending_visual_review | 視覚評価未完了 | 日次軽量分析 | 原本画像を確認 |
| 権利 | asset_license_unverified | 固有素材を転用できない | 構造のみ参照 | ライセンス確認 |

## 18. 媒体別参照プロファイル

| 評価対象 | 分析 | 根拠 |
|---|---|---|
${focusRows(profile)}

## 19. 異業種・他媒体への転用例

| 転用先 | 残す構造 | 置換する内容 | 追加情報 | 不適合条件 |
|---|---|---|---|---|
| [要分析] | [要分析] | [要分析] | [要分析] | [要分析] |
| [要分析] | [要分析] | [要分析] | [要分析] | [要分析] |
| [要分析] | [要分析] | [要分析] | [要分析] | [要分析] |

## 20. ビジュアルトークン・制作条件

| 役割 | 値 | 採用条件 |
|---|---|---|
| 背景 | [要実測] | [要分析] |
| 面 | [要実測] | [要分析] |
| 本文 | [要実測] | [要分析] |
| 強調 | [要実測] | [要分析] |
| CTA・注目点 | [要実測] | [要分析] |

## 21. 提案時の抽出・評価ルール

| 評価軸 | 配点 | 見る点 |
|---|---:|---|
| Visual | 20 | 構図・色・文字・素材の学習価値 |
| Clarity | 20 | 情報や操作の整理方法 |
| Originality | 15 | 既存ライブラリとの差分 |
| Reusability | 20 | 構造・原則の転用可能性 |
| Learning | 15 | 成立理由を説明できるか |
| Evidence | 10 | URL・画像・実測で裏付けられるか |

## 22. 推奨データベース項目

| 項目 | 値 |
|---|---|
${databaseRows(profile)}

## 23. 証拠・ファイル台帳

| ファイル・URL | 種別 | 寸法・状態 | 検証結果 |
|---|---|---|---|
| ${sourceDetail} | 参考元詳細 | URL | 取得済み |
| [要設定] | 原本画像 | [要実測] | 未確認 |

## 24. 更新・検証記録

| check | 結果 |
|---|---|
| chapters | Pending |
| unit-fields | Pending |
| image-slots | Pending |
| evidence | Pending |
| candidate-parity | Pending |
| rights | Pending |
| unknowns | Pending |
| database-fields | Pending |

## 25. Sources

1. ${sourceDetail}
2. ${placeholder(item.sourceUrl, "参考元トップURL未確認")}
3. ${placeholder(item.captureUrl)}

## 26. 画像・パーツ切り出し／再現指示書

| ID | 候補名 | 位置・状態 | 再利用種別 | 推奨ファイル名 | 除外する固有要素 | 再現・切り出し注意 |
|---|---|---|---|---|---|---|
| C01 | [章15と一致] | [要実測] | [要分析] | ${item.id}_C01-[short-name].png | [要分析] | 意味単位を途中で切らない |

## 27. 返却・後工程依頼文

${item.id}は${profile.label}の詳細分析テンプレート作成済みです。画像確認、実測、媒体固有評価、権利確認、候補確定後にNotionへ反映し、CBS同期は別途ユーザー確認を行ってください。

## 28. 実行・重複防止記録

- run_id: RUN-${runDate.replaceAll("-", "")}-NONLP-DEEP-${item.id}
- ID: ${item.id}
- 媒体: ${type}
- 規格: drs-deep-1.0
- 分析モード: テンプレート生成
- 重複確認: ID、captureUrl、sourceDetailUrlを予約台帳と照合
- 実行結果: 29章テンプレート生成。詳細分析、Notion反映、CBS同期は未実施。

## 29. 更新履歴

- ${runDate} drs-deep-1.0: 媒体別29章テンプレートを生成。
`;
}

const args = parseArgs(process.argv.slice(2));
if (!args.id) {
  console.error("Usage: npm run analyze:non-lp:deep:template -- --id BN-0001 [--date YYYY-MM-DD] [--output DIR]");
  process.exit(1);
}

const config = await readJson(CONFIG_PATH, null);
if (!config) throw new Error(`${CONFIG_PATH} を読み込めません`);
const type = String(args.type || inferType(args.id)).toUpperCase();
const profile = config.types[type];
if (!profile) throw new Error(`未対応の媒体種別です: ${type}`);
if (!new RegExp(profile.idPattern).test(args.id)) throw new Error(`ID形式が不正です: ${args.id} / ${profile.idPattern}`);

const reservations = await readJson(RESERVATIONS_PATH, { reserved: [] });
const current = await readJson(CURRENT_CANDIDATES_PATH, { candidates: [] });
const light = await readJson(LIGHT_ANALYSIS_PATH, { analyses: {} });
const captures = await readJson(CAPTURE_SUMMARY_PATH, { results: [] });
const allItems = [...(current.candidates || []), ...(reservations.reserved || [])];
const found = allItems.find((entry) => entry.id === args.id) || {};
const item = {
  ...found,
  id: args.id,
  title: args.title || found.title || "[要設定]",
  sourceName: args.source || found.sourceName || "[要設定]",
  sourceDetailUrl: args.url || found.sourceDetailUrl || found.captureUrl || "[要設定]"
};
const runDate = args.date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const outputRoot = path.resolve(args.output || "deep-analysis/non-lp", runDate, `${args.id}-${safeSlug(item.title)}`);
await fs.mkdir(path.join(outputRoot, "00_Catalog"), { recursive: true });
await fs.mkdir(path.join(outputRoot, "03_Analysis"), { recursive: true });

const markdownPath = path.join(outputRoot, "03_Analysis", `${args.id}_full_analysis_drs-deep-1.0_${runDate.replaceAll("-", "")}.md`);
await fs.writeFile(markdownPath, buildMarkdown({ item, analysis: light.analyses?.[args.id] || {}, profile, type, runDate }) + "\n");

const capture = (captures.results || []).find((entry) => entry.id === args.id);
const metadata = {
  schema_version: config.schemaVersion,
  id: args.id,
  media_type: type,
  asset_type: profile.assetType,
  title: item.title,
  source_name: item.sourceName,
  source_detail_url: item.sourceDetailUrl,
  capture_url: item.captureUrl || null,
  landing_url: item.landingUrl || null,
  profile,
  lightweight_analysis: light.analyses?.[args.id] || null,
  capture_status: capture?.status || "not_found_in_local_capture_summary",
  analysis_status: "template_generated_pending_visual_analysis",
  notion_status: "not_synced",
  cbs_status: "not_synced",
  generated_at: new Date().toISOString()
};
await fs.writeFile(path.join(outputRoot, "metadata.json"), JSON.stringify(metadata, null, 2) + "\n");

const audit = {
  schema_version: config.schemaVersion,
  id: args.id,
  mode: "template",
  checks: {
    chapters: "pending_validation",
    unit_fields: "pending_analysis",
    image_slots: "pending_analysis",
    evidence: "pending_analysis",
    candidate_parity: "pending_analysis",
    rights: "pending_analysis"
  },
  notion: "not_synced",
  cbs: "not_synced"
};
await fs.writeFile(path.join(outputRoot, "00_Catalog", `${args.id}_deep_audit_${runDate.replaceAll("-", "")}.json`), JSON.stringify(audit, null, 2) + "\n");
console.log(JSON.stringify({ id: args.id, type, outputRoot, markdownPath }, null, 2));
