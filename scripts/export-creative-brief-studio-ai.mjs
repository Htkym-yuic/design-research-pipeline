#!/usr/bin/env node
/**
 * Creative Brief Studio AI向けエクスポートパッケージの生成。
 *
 * knowledge/**\/*.json（README.md・.gitkeepは除く）を走査し、
 * exports/creative-brief-studio-ai/manifest.json と index.json を生成する。
 * 本番同期（CBS側への実際の反映）はここでは行わない。検索用の軽量インデックスを
 * 作るところまで。
 *
 * OpenAI/Anthropic APIは呼ばない。ローカルのファイル読み込みのみ。
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));
const knowledgeDir = args.knowledge || "knowledge";
const outDir = args.out || "exports/creative-brief-studio-ai";

const entries = await collectKnowledgeFiles(knowledgeDir);

const items = [];
const skipped = [];
for (const filePath of entries) {
  const relPath = path.relative(".", filePath);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    items.push(toIndexItem(data, relPath));
  } catch (err) {
    skipped.push({ path: relPath, reason: err.message });
  }
}

await fs.mkdir(outDir, { recursive: true });

const manifest = {
  generatedAt: new Date().toISOString(),
  itemCount: items.length,
  skippedCount: skipped.length,
  mediaTypes: [...new Set(items.map((item) => item.mediaType).filter(Boolean))].sort(),
  source: "design-research-pipeline/knowledge/",
  note: "このmanifest/indexはCBS側が検索に使う軽量インデックス。本番同期（CBS本体への反映）は別工程で、ユーザー確認後に行う。",
};

await fs.writeFile(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n");
await fs.writeFile(
  path.join(outDir, "index.json"),
  JSON.stringify({ generatedAt: manifest.generatedAt, items }, null, 2) + "\n",
);

console.log(`exports/creative-brief-studio-ai/ を更新しました。`);
console.log(`  manifest.json / index.json: ${items.length}件`);
if (skipped.length > 0) {
  console.log(`  スキップ: ${skipped.length}件`);
  for (const s of skipped) console.log(`    - ${s.path}: ${s.reason}`);
}

function toIndexItem(data, knowledgePath) {
  const tags = [
    ...(data.industry_tags || data.tags?.industry || []),
    ...(data.color_tags || data.tags?.color || []),
    ...(data.layout_tags || data.tags?.layout || []),
    ...(data.copy_types || data.tags?.copy || []),
  ];
  return {
    id: data.id || path.basename(knowledgePath, ".json"),
    mediaType: data.mediaType || data.media_type || null,
    title: data.title || null,
    tags,
    summary: data.primary_appeal || data.analysis?.overview || null,
    knowledgePath,
  };
}

async function collectKnowledgeFiles(dir) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await collectKnowledgeFiles(entryPath)));
    } else if (entry.isFile() && entry.name.endsWith(".json")) {
      results.push(entryPath);
    }
  }
  return results;
}

function parseArgs(argv) {
  const result = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      result[key] = next;
      i += 1;
    } else {
      result[key] = true;
    }
  }
  return result;
}
