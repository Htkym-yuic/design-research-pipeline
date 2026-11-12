import fs from "node:fs/promises";

/** 複数の処理が同じJSONを同時に書き換えないための、簡易ロック（ディレクトリ作成が原子的なことを使う）。 */
export async function withLock(file, fn, { retries = 200, waitMs = 100 } = {}) {
  const lock = `${file}.lock`;
  for (let i = 0; ; i++) {
    try { await fs.mkdir(lock); break; } catch (e) {
      if (e.code !== "EEXIST") throw e;
      if (i >= retries) { // 古いロック（異常終了の残り）は、30秒を超えたら外す
        const st = await fs.stat(lock).catch(() => null);
        if (st && Date.now() - st.mtimeMs > 30000) { await fs.rmdir(lock).catch(() => {}); i = 0; continue; }
        throw new Error(`ロックを取得できません: ${file}`);
      }
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
  try { return await fn(); } finally { await fs.rmdir(lock).catch(() => {}); }
}

export async function updateJson(file, fallback, mutate) {
  return withLock(file, async () => {
    let cur;
    try { cur = JSON.parse(await fs.readFile(file, "utf8")); } catch { cur = fallback; }
    const out = (await mutate(cur)) ?? cur;
    await fs.writeFile(file, `${JSON.stringify(out, null, 2)}\n`);
    return out;
  });
}
