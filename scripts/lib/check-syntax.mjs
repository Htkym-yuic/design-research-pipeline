/**
 * scripts/配下の全.mjsファイルに対して `node --check` を実行する構文チェック。
 * 依存パッケージのインストールやAPI疎通は不要なので、CI以外でも素早く回せる。
 */
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL("..", import.meta.url));

function collectMjsFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectMjsFiles(fullPath);
    return entry.name.endsWith(".mjs") ? [fullPath] : [];
  });
}

const files = collectMjsFiles(scriptsDir);
let hasError = false;

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "pipe", encoding: "utf8" });
  if (result.status !== 0) {
    hasError = true;
    console.error(`✗ ${path.relative(process.cwd(), file)}`);
    console.error(result.stderr);
  } else {
    console.log(`✓ ${path.relative(process.cwd(), file)}`);
  }
}

if (hasError) {
  console.error(`\n構文エラーがあります（${files.length}ファイル中）。`);
  process.exit(1);
}

console.log(`\n${files.length}ファイル、構文エラーなし。`);
