/**
 * LP日次収集の結果を、GitHub ActionsのStep Summary（$GITHUB_STEP_SUMMARY）へ
 * Markdownとして書き出す。失敗があった場合に見落とさないようにするための表示専用スクリプト。
 * ローカル実行時（GITHUB_STEP_SUMMARYが無い場合）は標準出力にそのまま出す。
 */
import fs from "node:fs/promises";

async function readJsonSafe(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

const captureSummary = await readJsonSafe("screenshots/lp-candidates/summary.json");
const dropboxResult = await readJsonSafe("screenshots/lp-candidates/dropbox-upload-result.json");
const notionResult = await readJsonSafe("screenshots/lp-candidates/notion-registration-result.json");
const nonLpCapture = await readJsonSafe("screenshots/non-lp-candidates/summary.json");
const nonLpDropbox = await readJsonSafe("screenshots/non-lp-candidates/dropbox-upload-result.json");
const nonLpNotion = await readJsonSafe("screenshots/non-lp-candidates/notion-registration-result.json");

const lines = ["# LP日次収集 実行結果", ""];

if (captureSummary) {
  const failedCaptures = captureSummary.results.filter((r) => r.status !== "captured");
  lines.push(`## 撮影`, `- 対象: ${captureSummary.candidateCount}件`, `- 失敗: ${failedCaptures.length}件`);
  for (const item of failedCaptures) {
    lines.push(`  - ⚠ ${item.id}（${item.device}）: ${item.error || "unknown error"}`);
  }
  lines.push("");
} else {
  lines.push("## 撮影", "- summary.jsonが見つかりませんでした", "");
}

if (dropboxResult) {
  const failedUploads = dropboxResult.candidates.filter((c) => c.files?.some((f) => f.status === "failed") || c.status === "failed");
  lines.push(
    `## Dropboxアップロード${dropboxResult.dryRun ? "（DRY_RUN）" : ""}`,
    `- 保存先: \`${dropboxResult.intakeBasePath}\``,
    `- 対象: ${dropboxResult.candidates.length}候補`,
    `- 失敗あり: ${failedUploads.length}候補`,
  );
  for (const item of failedUploads) {
    lines.push(`  - ⚠ ${item.id}: ${item.error || item.files.filter((f) => f.status === "failed").map((f) => f.remote).join(", ")}`);
  }
  lines.push("");
} else {
  lines.push("## Dropboxアップロード", "- dropbox-upload-result.jsonが見つかりませんでした", "");
}

if (notionResult) {
  const failedPages = notionResult.results.filter((r) => r.status === "failed");
  lines.push(
    `## Notion登録${notionResult.dryRun ? "（DRY_RUN）" : ""}`,
    `- 対象: ${notionResult.results.length}候補`,
    `- 失敗: ${failedPages.length}候補`,
  );
  for (const item of failedPages) {
    lines.push(`  - ⚠ ${item.id}: ${item.error}`);
  }
  lines.push("");
} else {
  lines.push("## Notion登録", "- notion-registration-result.jsonが見つかりませんでした", "");
}

lines.push("# LP以外の日次収集 実行結果", "");

if (nonLpCapture) {
  const byMedia = {};
  for (const item of nonLpCapture.results || []) byMedia[item.mediaType] = (byMedia[item.mediaType] || 0) + 1;
  const failed = (nonLpCapture.results || []).filter((item) => item.status !== "captured");
  lines.push("## 収集・撮影", `- 対象: ${nonLpCapture.candidateCount}件`, `- 媒体別: ${Object.entries(byMedia).map(([key, count]) => `${key} ${count}件`).join(" / ") || "0件"}`, `- 失敗・要確認: ${failed.length}件`);
  for (const item of failed) lines.push(`  - ⚠ ${item.id}: ${item.error || "unknown error"}`);
  lines.push("");
} else {
  lines.push("## 収集・撮影", "- 非LP処理は未実行です", "");
}

if (nonLpDropbox) {
  const failed = (nonLpDropbox.results || []).filter((item) => item.status === "failed");
  lines.push(`## 非LP Dropbox${nonLpDropbox.dryRun ? "（DRY_RUN）" : ""}`, `- 対象: ${(nonLpDropbox.results || []).length}件`, `- 失敗: ${failed.length}件`, "");
}

if (nonLpNotion) {
  const created = (nonLpNotion.results || []).filter((item) => item.status === "created").length;
  const existing = (nonLpNotion.results || []).filter((item) => item.status === "already_exists").length;
  const failed = (nonLpNotion.results || []).filter((item) => item.status === "failed");
  lines.push(`## 非LP Notion${nonLpNotion.dryRun ? "（DRY_RUN）" : ""}`, `- 新規登録: ${created}件`, `- 重複スキップ: ${existing}件`, `- 失敗: ${failed.length}件`);
  for (const item of failed) lines.push(`  - ⚠ ${item.id}: ${item.error}`);
  lines.push("");
}

const output = lines.join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, output + "\n");
} else {
  console.log(output);
}
