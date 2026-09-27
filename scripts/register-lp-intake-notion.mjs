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
 * 軽量分析JSONがある候補は、日次所見とPC/SP画像も掲載する。
 * JSONがない候補を「軽量分析済み」とは扱わず、収集済み・分析待ちとして明示する。
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
  headingBlock,
  imageUploadBlock,
  loadLpPropertyConfig,
  paragraphBlock,
  replaceIntakePageChildren,
  uploadFileForNotion,
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
const summaryPath = getArg("summary") || process.env.LP_CAPTURE_SUMMARY_FILE || "screenshots/lp-candidates/summary.json";
const analysisPath =
  getArg("analysis") || process.env.LP_LIGHTWEIGHT_ANALYSIS_FILE || "candidates/lp-archive/lightweight-analysis.json";

const candidatesData = JSON.parse(await fs.readFile(candidatesPath, "utf8").catch((error) => {
  throw new Error(`候補ファイルを読み込めません（${candidatesPath}）: ${error.message}`);
}));
const dropboxResult = JSON.parse(await fs.readFile(dropboxResultPath, "utf8").catch((error) => {
  throw new Error(`Dropboxアップロード結果を読み込めません（${dropboxResultPath}）: ${error.message}`);
}));
const captureSummary = JSON.parse(await fs.readFile(summaryPath, "utf8").catch((error) => {
  throw new Error(`撮影結果を読み込めません（${summaryPath}）: ${error.message}`);
}));
const lightweightData = JSON.parse(await fs.readFile(analysisPath, "utf8").catch(() => '{"analyses":{}}'));

const candidateById = new Map(candidatesData.candidates.map((candidate) => [candidate.id, candidate]));
const captureById = new Map();
for (const item of captureSummary.results || []) {
  if (item.status !== "captured") continue;
  if (!captureById.has(item.id)) captureById.set(item.id, {});
  captureById.get(item.id)[item.device] = item;
}
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
  const analysis = lightweightData.analyses?.[candidate.id] || null;
  const analysisReady = Boolean(
    analysis?.overview && analysis?.fvImpression && analysis?.roughStructure && analysis?.deepDivePriority,
  );
  const progressNote = analysisReady
    ? "日次軽量分析実施済み。PC/SPのFV・全体確認画像を掲載。詳細分析とCBS同期は週末レビュー後に実施。"
    : "収集・撮影・Dropbox保存まで完了。軽量分析JSONがないため分析待ち。詳細分析とCBS同期は未実施。";

  const values = {
    title: `${candidate.id} ${candidate.title || ""}`.trim(),
    brand: candidate.metadata?.company || "",
    referenceUrl: candidate.captureUrl || "",
    source: candidate.sourceName || "",
    capturedAt: todayJst(),
    status: "未着手",
    analysisDone: false,
    notionSynced: true,
    cbsSyncStatus: "未同期",
    knowledgeStatus: "未着手",
    dropboxPath: dropboxCandidate.dropboxPath || "",
    productType: ["LP"],
    category: "その他",
    mainAppeal: analysis?.mainAppeal || "",
    industryTags: analysis?.industryTags || [],
    colorTags: analysis?.colorTags || [],
    layoutTags: analysis?.layoutTags || [],
    progressNote,
  };

  const { properties, unknownKeys } = buildLpProperties(propertyConfig, values);
  if (unknownKeys.length > 0) {
    console.warn(`${candidate.id}: config/notion-lp-properties.jsonに定義の無いキーを無視しました: ${unknownKeys.join(", ")}`);
  }

  const bodyBlocks = [headingBlock(analysisReady ? "日次軽量分析" : "日次収集結果")];
  if (analysisReady) {
    bodyBlocks.push(
      paragraphBlock(`概要: ${analysis.overview}`),
      paragraphBlock(`FV印象: ${analysis.fvImpression}`),
      paragraphBlock(`構成ざっくり: ${analysis.roughStructure}`),
      paragraphBlock(`テイスト・配色: ${analysis.tasteAndColor || "要確認"}`),
      paragraphBlock(`参考にできる点: ${analysis.usefulPoints || "要確認"}`),
      paragraphBlock(`要確認点: ${analysis.reviewPoints || "なし"}`),
      paragraphBlock(`詳細分析候補度: ${analysis.deepDivePriority}`),
    );
  } else {
    bodyBlocks.push(paragraphBlock("軽量分析は未実施です。画像を確認して軽量分析JSONを用意するまで、分析済みとして扱いません。"));
  }
  bodyBlocks.push(
    headingBlock("基本情報"),
    paragraphBlock(`対象URL: ${candidate.captureUrl || "（未取得）"}`),
    paragraphBlock(`LP Archive詳細URL: ${candidate.sourceDetailUrl || "（未取得）"}`),
    paragraphBlock(`Dropbox正本パス: ${dropboxCandidate.dropboxPath || "（未アップロード）"}`),
  );

  if (dryRun) {
    results.push({ id: candidate.id, status: "dry_run", properties, bodyBlockCount: bodyBlocks.length });
    console.log(`[DRY_RUN] ${candidate.id}: Notion登録予定（プロパティ${Object.keys(properties).length}件）`);
    continue;
  }

  try {
    const captures = captureById.get(candidate.id) || {};
    const imageDefinitions = [
      ["PC ファーストビュー", captures.pc?.screenshots?.notionFirstView],
      ["PC 全体", captures.pc?.screenshots?.notionSections],
      ["SP ファーストビュー", captures.sp?.screenshots?.notionFirstView],
      ["SP 全体", captures.sp?.screenshots?.notionSections],
    ].filter(([, filePath]) => filePath);
    for (const [label, filePath] of imageDefinitions) {
      bodyBlocks.push(headingBlock(label));
      const fileUploadId = await uploadFileForNotion(filePath);
      bodyBlocks.push(imageUploadBlock(fileUploadId, `${candidate.id} ${label}`));
    }
    bodyBlocks.push(paragraphBlock("画像はNotion用軽量版です。正本画像と個別画像はDropboxに保管しています。"));

    const existingPage = await findPageByMatchProperty(dataSourceId, propertyConfig, candidate.id);

    if (existingPage) {
      await updatePageProperties(existingPage.id, properties);
      const analysisDoneProperty = propertyConfig.properties.analysisDone?.notionName;
      const analysisDone = analysisDoneProperty
        ? existingPage.properties?.[analysisDoneProperty]?.checkbox === true
        : false;
      if (!analysisDone) await replaceIntakePageChildren(existingPage.id, bodyBlocks);
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
if (failedCount > 0) process.exitCode = 1;
