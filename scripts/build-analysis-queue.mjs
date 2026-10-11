/**
 * API課金なし半自動化：分析待ちキューの構築。
 *
 * GitHub Actionsの日次収集（collect-non-lp-candidates.mjs等）が出力した
 * candidates/non-lp/candidates.json と、軽量分析 candidates/non-lp/lightweight-analysis.json
 * を読み込み、媒体別・日付別に分けて candidates/analysis-queue/<date>/<media>.json へ出力する。
 *
 * OpenAI/Anthropic APIキーは一切使わない（読み込み・並べ替えのみの純粋なローカル処理）。
 * 既存のLP日次フロー（capture-lp-candidates.mjs等）、既存のcandidates.json/lightweight-analysis.json
 * の生成ロジックには一切触れない。
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

const dateJst = args.date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const candidatesPath = args.candidates || "candidates/non-lp/candidates.json";
const analysisPath = args.analysis || "candidates/non-lp/lightweight-analysis.json";
const outDir = args.out || "candidates/analysis-queue";

const candidates = await readJson(candidatesPath, { candidateCount: 0, candidates: [] });
const lightweight = await readJson(analysisPath, { version: 1, analyses: {} });

const byMedia = new Map();
for (const item of candidates.candidates || []) {
  const mediaKey = mediaTypeToFileKey(item.mediaType);
  const analysis = lightweight.analyses?.[item.id] || null;
  const enriched = { ...item, lightweightAnalysis: analysis, needsDeepAnalysis: true };
  if (!byMedia.has(mediaKey)) byMedia.set(mediaKey, []);
  byMedia.get(mediaKey).push(enriched);
}

const dayDir = path.join(outDir, dateJst);
await fs.mkdir(dayDir, { recursive: true });

const written = [];
for (const [mediaKey, items] of byMedia) {
  const filePath = path.join(dayDir, `${mediaKey}.json`);
  await fs.writeFile(
    filePath,
    JSON.stringify({ dateJst, mediaKey, candidateCount: items.length, candidates: items }, null, 2) + "\n",
  );
  written.push({ mediaKey, filePath, count: items.length });
}

// note-ideas は現時点で自動収集元が無いため、人が追記するための空の器だけを用意する。
const noteIdeasPath = path.join(dayDir, "note-ideas.json");
const existingNoteIdeas = await readJson(noteIdeasPath, null);
if (!existingNoteIdeas) {
  await fs.writeFile(
    noteIdeasPath,
    JSON.stringify(
      {
        dateJst,
        mediaKey: "note-ideas",
        _comment: "note記事ネタの自動収集元はまだ無い。ChatGPT/Claudeとの対話や他媒体の分析結果から見つけたネタ案を、ここに手動で追記していく想定。",
        candidateCount: 0,
        candidates: [],
      },
      null,
      2,
    ) + "\n",
  );
  written.push({ mediaKey: "note-ideas", filePath: noteIdeasPath, count: 0 });
}

console.log(`分析待ちキューを ${dayDir} に作成しました。`);
for (const entry of written) {
  console.log(`  ${entry.mediaKey}: ${entry.count}件 -> ${entry.filePath}`);
}
if (written.length === 0) {
  console.log("  候補0件（candidates/non-lp/candidates.json が空、または未実行）。");
}

function mediaTypeToFileKey(mediaType) {
  const map = {
    Banner: "banner",
    Web: "web",
    Graphic: "graphic",
    Parts: "parts",
    Canva: "canva",
    Asset: "asset",
    Pattern: "pattern",
  };
  return map[mediaType] || String(mediaType || "unknown").toLowerCase();
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
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
