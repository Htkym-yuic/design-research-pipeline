/**
 * GitHub Actions実行前に、必要なSecrets / Variablesが揃っているかを確認する。
 * 足りないものがあれば、処理を始める前に分かりやすく失敗させる。
 *
 * DRY_RUN=true のときは、実際にDropbox/Notionへ書き込まないため、
 * 秘密情報（Secrets）が無くても実行できる。ただし同期先を確認できるよう、
 * 設定項目（Variables）だけは常に必須にする。
 *
 * Usage: node scripts/lib/check-env.mjs [--dropbox] [--notion]
 * 引数無しなら両方チェックする。
 */
import { isDryRun, requireEnvAll } from "./env.mjs";

const DROPBOX_SECRETS = ["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN"];
const NOTION_SECRETS = ["NOTION_TOKEN"];
const NOTION_VARS = ["NOTION_LP_DATA_SOURCE_ID"];

const checkDropbox = process.argv.includes("--dropbox") || !process.argv.includes("--notion");
const checkNotion = process.argv.includes("--notion") || !process.argv.includes("--dropbox");
const dryRun = isDryRun();

const missing = [];

if (checkDropbox && !dryRun) {
  try {
    requireEnvAll(DROPBOX_SECRETS);
  } catch (error) {
    missing.push(...(error.missing || []));
  }
}

if (checkNotion) {
  try {
    requireEnvAll(NOTION_VARS);
    if (!dryRun) requireEnvAll(NOTION_SECRETS);
  } catch (error) {
    missing.push(...(error.missing || []));
  }
}

if (dryRun) {
  console.log("DRY_RUN=true のため、Dropbox/NotionのSecretsは未設定でも実行できます（設定項目のみ確認しました）。");
}

if (missing.length > 0) {
  console.error("必要な環境変数（GitHub Secrets / Variables）が設定されていません：");
  for (const name of missing) {
    console.error(`  - ${name}`);
  }
  console.error(
    "\nリポジトリの Settings > Secrets and variables > Actions で登録してください。" +
      "詳細は docs/OPERATIONS.md の「自動化（GitHub Actions）」を参照してください。",
  );
  process.exit(1);
}

console.log("環境変数チェック：問題ありません。");
