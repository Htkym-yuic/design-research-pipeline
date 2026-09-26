/**
 * 環境変数の取得・検証ヘルパー。
 *
 * GitHub Actions Secrets / Variables が未設定のまま実行されると、
 * DropboxやNotionのAPI呼び出しが分かりにくいエラーで落ちる。
 * 必須の環境変数は、処理を始める前にここでまとめて検証し、
 * 「どのSecrets/Variablesが足りないか」を一目で分かるようにする。
 */

/** true/false/1/0/yes/no を寛容にbooleanへ変換する。未設定はdefaultValueを返す */
export function envFlag(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return defaultValue;
  return ["true", "1", "yes", "on"].includes(raw.toLowerCase());
}

/** DRY_RUN判定。未設定時は安全側（true）に倒す */
export function isDryRun() {
  return envFlag("DRY_RUN", true);
}

export function optionalEnv(name, defaultValue = "") {
  const raw = process.env[name];
  return raw === undefined || raw === "" ? defaultValue : raw;
}

export function requireEnv(name) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") {
    throw new MissingEnvError([name]);
  }
  return raw;
}

export class MissingEnvError extends Error {
  constructor(names) {
    super(
      `必要な環境変数が設定されていません: ${names.join(", ")}\n` +
        "GitHub Secrets / Variables、またはローカルの環境変数を確認してください。",
    );
    this.name = "MissingEnvError";
    this.missing = names;
  }
}

/**
 * 複数の必須環境変数をまとめて検証する。
 * 1つずつthrowすると原因特定に時間がかかるため、足りない分を全部集めてから
 * まとめて分かりやすいエラーメッセージを出す。
 */
export function requireEnvAll(names) {
  const missing = names.filter((name) => !process.env[name] || process.env[name] === "");
  if (missing.length > 0) {
    throw new MissingEnvError(missing);
  }
}
