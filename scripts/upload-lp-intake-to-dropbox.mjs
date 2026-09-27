/**
 * LP日次収集で撮影したスクリーンショット（scripts/capture-lp-candidates.mjsの出力）を、
 * Dropboxの99_Needs_Review配下へアップロードする。
 *
 * 入力: <出力ディレクトリ>/summary.json（デフォルト screenshots/lp-candidates/summary.json）
 * 出力: <出力ディレクトリ>/dropbox-upload-result.json
 *
 * 保存先の構造（依頼どおり）：
 *   /design/Design_Research_Library/LP_Research_Library/99_Needs_Review/
 *     <YYYY-MM-DD>/daily-intake-<idStart>-<idEnd>/<ID-タイトル>/
 *       metadata.json
 *       01_Normal_Images/
 *       02_Notion_Images/
 *
 * DRY_RUN=true の場合、実際のアップロードは行わず、アップロード予定の一覧だけを出力する。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { isDryRun, requireEnv } from "./lib/env.mjs";
import { ensureFolder, uploadFile } from "./lib/dropbox-client.mjs";

function getArg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : null;
}

function safeName(value) {
  const normalized = (value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "untitled";
}

function todayJst() {
  // JST（UTC+9）での日付をYYYY-MM-DD形式で得る
  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return now.toISOString().slice(0, 10);
}

const summaryPath = getArg("summary") || process.env.LP_CAPTURE_SUMMARY_FILE || "screenshots/lp-candidates/summary.json";
const dropboxRoot = process.env.DROPBOX_DESIGN_ROOT || "/design/Design_Research_Library";
const intakeDate = process.env.LP_INTAKE_DATE || todayJst();
const dryRun = isDryRun();

const summaryRaw = await fs.readFile(summaryPath, "utf8").catch((error) => {
  throw new Error(`撮影結果のsummary.jsonを読み込めません（${summaryPath}）: ${error.message}`);
});
const summary = JSON.parse(summaryRaw);

// resultsは (candidate × デバイス) で1件ずつ入っているので、candidate単位へまとめ直す
const byCandidate = new Map();
for (const result of summary.results) {
  if (result.status !== "captured") continue;
  if (!byCandidate.has(result.id)) {
    byCandidate.set(result.id, { id: result.id, title: result.title, devices: [] });
  }
  byCandidate.get(result.id).devices.push(result);
}

const candidateIds = [...byCandidate.keys()].sort();
if (candidateIds.length === 0) {
  console.log("アップロード対象の候補がありません（撮影に成功した候補が0件）。");
  process.exit(0);
}

const idStart = candidateIds[0];
const idEnd = candidateIds[candidateIds.length - 1];
const intakeFolderName = `daily-intake-${idStart}-${idEnd}`;
const intakeBasePath = `${dropboxRoot}/LP_Research_Library/99_Needs_Review/${intakeDate}/${intakeFolderName}`;

if (!dryRun) {
  requireEnv("DROPBOX_APP_KEY");
}

console.log(`${dryRun ? "[DRY_RUN] " : ""}Dropboxアップロード先: ${intakeBasePath}`);

const uploadResults = [];

for (const candidate of byCandidate.values()) {
  const candidateFolder = `${candidate.id}-${safeName(candidate.title)}`;
  const candidateDropboxPath = `${intakeBasePath}/${candidateFolder}`;
  const normalDir = `${candidateDropboxPath}/01_Normal_Images`;
  const notionDir = `${candidateDropboxPath}/02_Notion_Images`;

  const filesToUpload = [];

  // metadata.jsonはcapture-lp-candidates.mjsが候補フォルダ直下（screenshots.fullPageと同じ階層）に書き出している
  for (const device of candidate.devices) {
    const { screenshots } = device;
    const deviceCandidateDir = path.dirname(screenshots.fullPage);

    filesToUpload.push(
      { local: path.join(deviceCandidateDir, "metadata.json"), remote: `${candidateDropboxPath}/metadata.json`, skipIfMissing: true },
      { local: screenshots.fullPage, remote: `${normalDir}/${path.basename(screenshots.fullPage)}` },
      { local: screenshots.firstView, remote: `${normalDir}/${path.basename(screenshots.firstView)}` },
      { local: screenshots.sectionIndex, remote: `${normalDir}/${path.basename(screenshots.sectionIndex)}` },
      { local: screenshots.sectionPreview, remote: `${normalDir}/${path.basename(screenshots.sectionPreview)}` },
      { local: screenshots.notionFirstView, remote: `${notionDir}/${path.basename(screenshots.notionFirstView)}` },
      { local: screenshots.notionSections, remote: `${notionDir}/${path.basename(screenshots.notionSections)}` },
    );
  }

  // 同じmetadata.jsonを2回（PC/SP）アップロードしないよう重複除去する
  const uniqueFiles = [...new Map(filesToUpload.map((item) => [item.remote, item])).values()];

  const candidateResult = { id: candidate.id, title: candidate.title, dropboxPath: candidateDropboxPath, files: [] };

  if (dryRun) {
    for (const file of uniqueFiles) {
      candidateResult.files.push({ remote: file.remote, status: "dry_run" });
    }
    console.log(`[DRY_RUN] ${candidate.id}: ${uniqueFiles.length}件のアップロード予定（${candidateDropboxPath}）`);
  } else {
    try {
      await ensureFolder(normalDir);
      await ensureFolder(notionDir);

      for (const file of uniqueFiles) {
        try {
          const buffer = await fs.readFile(file.local);
          await uploadFile(file.remote, buffer);
          candidateResult.files.push({ remote: file.remote, status: "uploaded" });
        } catch (error) {
          if (file.skipIfMissing && error.code === "ENOENT") {
            candidateResult.files.push({ remote: file.remote, status: "skipped_missing_local_file" });
            continue;
          }
          candidateResult.files.push({ remote: file.remote, status: "failed", error: error.message });
        }
      }
      console.log(`${candidate.id}: アップロード完了（${candidateDropboxPath}）`);
    } catch (error) {
      candidateResult.status = "failed";
      candidateResult.error = error.message;
      console.error(`${candidate.id}: アップロードに失敗しました - ${error.message}`);
    }
  }

  uploadResults.push(candidateResult);
}

const outputDir = path.dirname(summaryPath);
const outputPath = path.join(outputDir, "dropbox-upload-result.json");
const output = {
  uploadedAt: new Date().toISOString(),
  dryRun,
  intakeDate,
  intakeBasePath,
  candidates: uploadResults,
};
await fs.writeFile(outputPath, JSON.stringify(output, null, 2));

const failedCount = uploadResults.filter(
  (item) => item.status === "failed" || item.files?.some((file) => file.status === "failed"),
).length;
console.log(`Dropboxアップロード結果: ${uploadResults.length}候補中${failedCount}候補で失敗あり。詳細: ${outputPath}`);
if (failedCount > 0) process.exitCode = 1;
