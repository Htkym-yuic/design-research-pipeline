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

const output = lines.join("\n");

if (process.env.GITHUB_STEP_SUMMARY) {
  await fs.appendFile(process.env.GITHUB_STEP_SUMMARY, output + "\n");
} else {
  console.log(output);
}
