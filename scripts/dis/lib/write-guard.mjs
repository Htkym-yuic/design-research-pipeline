import { envFlag } from "../../lib/env.mjs";

/**
 * 外部書込み（Dropbox/Notion）の許可判定。次の全てを満たす場合のみ true。
 *  1. CLIで --apply が明示された
 *  2. 環境変数 DIS_ENABLE_WRITES=true
 *  3. DRY_RUN=false を明示（未設定はdry-run扱い）
 */
export function writesAllowed({ apply = false, env = process.env } = {}) {
  const flag = (n) => ["true", "1", "yes", "on"].includes(String(env[n] ?? "").toLowerCase());
  return Boolean(apply) && flag("DIS_ENABLE_WRITES") && env.DRY_RUN !== undefined && env.DRY_RUN !== "" && !flag("DRY_RUN");
}

export function assertWritesAllowed(opts) {
  if (!writesAllowed(opts)) throw new Error("外部書込みは無効です（--apply かつ DIS_ENABLE_WRITES=true かつ DRY_RUN=false が必要）");
}

export { envFlag };
