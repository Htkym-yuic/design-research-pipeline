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
import { ROLE_TYPES } from "./dis/lib/crop.mjs"; // DISのSectionの種類（正本）

const args = parseArgs(process.argv.slice(2));
const knowledgeDir = args.knowledge || "knowledge";
const outDir = args.out || "exports/creative-brief-studio-ai";

const entries = await collectKnowledgeFiles(knowledgeDir);

const items = [];
const knowledgeDocs = new Map();
const skipped = [];
for (const filePath of entries) {
  const relPath = path.relative(".", filePath);
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const data = JSON.parse(raw);
    items.push(toIndexItem(data, relPath));
    knowledgeDocs.set(relPath, data);
  } catch (err) {
    skipped.push({ path: relPath, reason: err.message });
  }
}

await fs.mkdir(outDir, { recursive: true });

// Sectionの型の索引（種類ごとに、各ナレッジの該当Sectionを集める）。DISの分析由来の種類（FV・悩み提起…）と、旧来の自由な役割名を、両方そのまま扱う。
const sectionPatterns = buildSectionPatternIndex(items, knowledgeDocs);

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
await fs.writeFile(
  path.join(outDir, "section-patterns.json"),
  JSON.stringify({ generatedAt: manifest.generatedAt, note: "Sectionの種類ごとに、各ナレッジの該当Section（名前・再利用できる構造・差し替え必須の要素）を集めた索引。controlled=true は、DISの種類の一覧（FV・悩み提起など）にある種類。", types: sectionPatterns }, null, 2) + "\n",
);

console.log(`exports/creative-brief-studio-ai/ を更新しました。`);
console.log(`  manifest.json / index.json: ${items.length}件`);
console.log(`  section-patterns.json: ${sectionPatterns.length}種類`);
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
  const sections = (data.section_patterns || []).map((p) => ({ type: p.role || null, name: p.name || null }));
  return {
    id: data.id || path.basename(knowledgePath, ".json"),
    mediaType: data.mediaType || data.media_type || null,
    title: data.title || null,
    tags,
    summary: data.primary_appeal || data.analysis?.overview || null,
    knowledgePath,
    // DISの層（あれば）。評価点（DISの9軸）は、28章のヒューリスティックの総合点と混ぜず、別項目として持つ。
    disId: data.analysis_notes?.dis_analysis_ref || data.dis_ids?.[0] || null,
    disIds: data.dis_ids || (data.analysis_notes?.dis_analysis_ref ? [data.analysis_notes.dis_analysis_ref] : []),
    disEvaluation: data.dis_evaluation ? { method: data.dis_evaluation.method || null, axes: (data.dis_evaluation.axes || []).map((x) => ({ key: x.key, score: x.score, confidence: x.confidence })) } : null,
    sectionTypes: [...new Set(sections.map((x) => x.type).filter(Boolean))],
    sections,
    reusablePrinciples: data.reusable_principles || [],
    rightsExcluded: data.rights_excluded || [],
    cbsSyncStatus: data.cbs_sync?.status || null,
  };
}

function buildSectionPatternIndex(items, docs) {
  const byType = new Map();
  for (const item of items) {
    const data = docs.get(item.knowledgePath);
    for (const p of data?.section_patterns || []) {
      const type = p.role || "（種類なし）";
      if (!byType.has(type)) byType.set(type, []);
      byType.get(type).push({ id: item.id, title: item.title, sectionId: p.id || null, sectionName: p.name || null, reusableStructure: p.reusable_structure || [], replaceRequired: p.replace_required || [], rightsStatus: p.rights_status || null, knowledgePath: item.knowledgePath });
    }
  }
  return [...byType.entries()]
    .map(([type, examples]) => ({ type, controlled: ROLE_TYPES.includes(type), count: examples.length, examples }))
    .sort((a, b) => Number(b.controlled) - Number(a.controlled) || b.count - a.count || a.type.localeCompare(b.type));
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
