/**
 * LP日次収集の結果を、Notionの「01｜LPリサーチライブラリー」へ軽量分析ページとして
 * 登録（新規作成 or 更新）する。
 *
 * 入力：
 *   - candidates.json（デフォルト candidates/lp-archive/candidates.json）… タイトル・URL等のメタ情報
 *   - dropbox-upload-result.json（デフォルト screenshots/lp-candidates/dropbox-upload-result.json）
 *     … Dropbox保存パス（scripts/upload-lp-intake-to-dropbox.mjsの出力）
 *
 * 出力：<出力ディレクトリ>/notion-registration-result.json
 *
 * 【重要】ここで登録するのは構造化・追跡用の項目（ステータス・URL・Dropboxパス等）まで。
 * FV印象・構成ざっくり・業種・訴求・配色・レイアウトタグ等の「軽量分析の中身」は、
 * 実際に画面を見て判断する工程（人手 or 週末レビュー時のChatGPT分析）に委ねる。
 * ここで自動生成すると、見ていない内容を捏造することになるため行わない。
 *
 * DRY_RUN=true の場合、Notionへは書き込まず、登録予定の内容だけを出力する。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { isDryRun, requireEnv } from "./lib/env.mjs";
import {
  appendBlockChildren,
  buildLpProperties,
  createPage,
  findPageByMatchProperty,
  loadLpPropertyConfig,
  paragraphBlock,
  updatePageProperties,
} from "./lib/notion-client.mjs";

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function todayJst() {
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

const candidatesPath = getArg("candidates") || process.env.LP_CANDIDATES_FILE || "candidates/lp-archive/candidates.json";
const dropboxResultPath =
  getArg("dropbox-result") || process.env.LP_DROPBOX_RESULT_FILE || "screenshots/lp-candidates/dropbox-upload-result.json";
const dryRun = isDryRun();

const candidatesData = JSON.parse(await fs.readFile(candidatesPath, "utf8").catch((error) => {
  throw new Error(`候補ファイルを読み込めません（${candidatesPath}）: ${error.message}`);
}));
const dropboxResult = JSON.parse(await fs.readFile(dropboxResultPath, "utf8").catch((error) => {
  throw new Error(`Dropboxアップロード結果を読み込めません（${dropboxResultPath}）: ${error.message}`);
}));

const candidateById = new Map(candidatesData.candidates.map((candidate) => [candidate.id, candidate]));
const propertyConfig = await loadLpPropertyConfig();

if (!dryRun) {
  requireEnv("NOTION_TOKEN");
}
const dataSourceId = requireEnv("NOTION_LP_DATA_SOURCE_ID");

const results = [];

for (const dropboxCandidate of dropboxResult.candidates) {
  const candidate = candidateById.get(dropboxCandidate.id);
  if (!candidate) {
    results.push({ id: dropboxCandidate.id, status: "skipped", reason: "candidates.jsonに該当IDが見つかりません" });
    continue;
  }

  const values = {
    title: `${candidate.id} ${candidate.title || ""}`.trim(),
    lpId: candidate.id,
    brand: candidate.metadata?.company || "",
    referenceUrl: candidate.captureUrl || "",
    source: candidate.sourceName || "",
    capturedAt: todayJst(),
    status: "軽量分析待ち",
    analysisDone: false,
    notionSynced: true,
    cbsSyncStatus: "未同期",
    knowledgeStatus: "軽量分析のみ",
    dropboxPath: dropboxCandidate.dropboxPath || "",
    productType: candidate.metadata?.category || "",
    category: candidate.metadata?.category || "",
    progressNote:
      "自動収集のみ実施。FV印象・構成・訴求・配色・レイアウトタグ等の軽量分析は未実施（週末レビューで判断）。",
  };

  const { properties, unknownKeys } = buildLpProperties(propertyConfig, values);
  if (unknownKeys.length > 0) {
    console.warn(`${candidate.id}: config/notion-lp-properties.jsonに定義の無いキーを無視しました: ${unknownKeys.join(", ")}`);
  }

  const bodyBlocks = [
    paragraphBlock("この分析は軽量分析ページです。詳細分析は週末レビューで選定した候補のみ行います。"),
    paragraphBlock(`対象URL: ${candidate.captureUrl || "（未取得）"}`),
    paragraphBlock(`LP Archive詳細URL: ${candidate.sourceDetailUrl || "（未取得）"}`),
    paragraphBlock(`Dropbox正本パス: ${dropboxCandidate.dropboxPath || "（未アップロード）"}`),
    paragraphBlock("FV印象: （軽量分析未実施）"),
    paragraphBlock("構成ざっくり: （軽量分析未実施）"),
    paragraphBlock("深掘り候補度: （軽量分析未実施・週末レビューでCBS取り込み候補を判断します）"),
    paragraphBlock("画像について: Notionに登録する画像は軽量版のみです。正本画像はDropboxに保管しています。"),
  ];

  if (dryRun) {
    results.push({ id: candidate.id, status: "dry_run", properties, bodyBlockCount: bodyBlocks.length });
    console.log(`[DRY_RUN] ${candidate.id}: Notion登録予定（プロパティ${Object.keys(properties).length}件）`);
    continue;
  }

  try {
    const existingPage = await findPageByMatchProperty(dataSourceId, propertyConfig, candidate.id);

    if (existingPage) {
      await updatePageProperties(existingPage.id, properties);
      results.push({ id: candidate.id, status: "updated", pageId: existingPage.id });
      console.log(`${candidate.id}: 既存のNotionページを更新しました（${existingPage.id}）`);
    } else {
      const page = await createPage(dataSourceId, properties, []);
      await appendBlockChildren(page.id, bodyBlocks);
      results.push({ id: candidate.id, status: "created", pageId: page.id });
      console.log(`${candidate.id}: Notionページを新規作成しました（${page.id}）`);
    }
  } catch (error) {
    results.push({ id: candidate.id, status: "failed", error: error.message });
    console.error(`${candidate.id}: Notion登録に失敗しました - ${error.message}`);
  }
}

const outputDir = path.dirname(dropboxResultPath);
const outputPath = path.join(outputDir, "notion-registration-result.json");
await fs.writeFile(
  outputPath,
  JSON.stringify({ registeredAt: new Date().toISOString(), dryRun, results }, null, 2),
);

const failedCount = results.filter((item) => item.status === "failed").length;
console.log(`Notion登録結果: ${results.length}候補中${failedCount}候補で失敗あり。詳細: ${outputPath}`);
