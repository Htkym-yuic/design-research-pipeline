/**
 * API課金なし半自動化：分析依頼Markdownの生成。
 *
 * candidates/analysis-queue/<date>/*.json を読み込み、ChatGPT/Claudeへそのまま貼り付けられる
 * 分析依頼Markdownを outputs/analysis-requests/<date>-design-research-request.md へ出力する。
 *
 * OpenAI/Anthropic APIは呼ばない。文字列を組み立てるだけの純粋なローカル処理。
 */
import fs from "node:fs/promises";
import path from "node:path";

const args = parseArgs(process.argv.slice(2));

const dateJst = args.date || new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const queueDir = path.join(args["queue-dir"] || "candidates/analysis-queue", dateJst);
const outDir = args.out || "outputs/analysis-requests";
const outPath = path.join(outDir, `${dateJst}-design-research-request.md`);

const files = await listJsonFiles(queueDir);
if (files.length === 0) {
  console.log(`${queueDir} に分析待ちキューが見つかりません。先に npm run queue:build を実行してください。`);
  process.exit(0);
}

const sections = [];
let totalCount = 0;

for (const file of files) {
  const data = await readJson(file);
  if (!data || !Array.isArray(data.candidates) || data.candidates.length === 0) continue;
  totalCount += data.candidates.length;
  sections.push(renderMediaSection(data.mediaKey, data.candidates));
}

const header = renderHeader(dateJst, totalCount);
const body = sections.length > 0 ? sections.join("\n\n---\n\n") : "（本日の分析待ち候補はありません。）";

await fs.mkdir(outDir, { recursive: true });
await fs.writeFile(outPath, `${header}\n\n${body}\n`);

console.log(`分析依頼Markdownを ${outPath} に作成しました（候補 ${totalCount} 件）。`);

function renderHeader(date, count) {
  return [
    `# デザインリサーチ 分析依頼（${date}）`,
    "",
    "このMarkdownは、GitHub Actionsが自動収集した候補のうち、まだ深い分析をしていないものを",
    "ChatGPT / Claude に貼り付けて分析してもらうための依頼文です。OpenAI/Anthropic APIの",
    "呼び出しは行わず、人がこの内容をコピーしてチャットへ貼り付けることを前提にしています。",
    "",
    "## 使い方",
    "",
    "1. このファイル全体をChatGPT（またはClaude）に貼り付ける。",
    "2. 候補ごとに回答してもらった分析結果を確認する。",
    `3. Claude Codeに「このMarkdownと回答を渡すので knowledge/<media>/<ID>.json へ反映して」と依頼する。`,
    "4. Note記事化の観点で良い案が出たら `outputs/note-drafts/` へタイトル案・メモとして残す。",
    "5. 変更はPRで確認する（mainへの直接pushはしない）。",
    "",
    `候補件数: ${count}件`,
  ].join("\n");
}

function renderMediaSection(mediaKey, items) {
  const title = mediaLabel(mediaKey);
  const blocks = items.map((item) => renderCandidateBlock(mediaKey, item));
  return [`## ${title}（${items.length}件）`, "", blocks.join("\n\n")].join("\n");
}

function renderCandidateBlock(mediaKey, item) {
  const la = item.lightweightAnalysis || {};
  const lines = [
    `### 候補ID: ${item.id}`,
    "",
    `- 媒体種別: ${mediaLabel(mediaKey)}`,
    `- タイトル: ${item.title || "（未取得）"}`,
    `- URL: ${item.captureUrl || item.sourceDetailUrl || "（未取得）"}`,
    `- 参考元URL（詳細）: ${item.sourceDetailUrl || "（なし）"}`,
    `- スクリーンショット: ${item.saveImage === false ? "保存なし（メタ情報のみ）" : "Dropboxアップロード後に確認（この時点では未アップロード）"}`,
    `- 参考元: ${item.sourceName || "（不明）"}`,
    `- 取得日: ${item.evidence?.checkedAt || new Date().toISOString().slice(0, 10)}`,
  ];
  if (la.overview) lines.push(`- 軽量分析の概要: ${la.overview}`);
  if (la.visualSummary) lines.push(`- 軽量分析（配色・サイズ）: ${la.visualSummary}`);
  lines.push("", "#### 分析してほしい観点", "", ...analysisPrompts(mediaKey).map((line) => `- ${line}`));
  lines.push(
    "",
    "#### CBS（Creative Brief Studio AI）用JSONでほしい項目",
    "",
    ...cbsFieldPrompts(mediaKey).map((line) => `- ${line}`),
  );
  lines.push(
    "",
    "#### Note記事化の観点",
    "",
    "- この事例から得られる学び・発見は何か（タイトル案も1つ提示してほしい）",
    "- 既出のネタと重複していないか（新規性があるか）",
    "- 誰向けの記事になりそうか（制作者・担当者・経営者 等）",
  );
  return lines.join("\n");
}

function analysisPrompts(mediaKey) {
  const common = [
    "構図・情報優先順位・視線誘導（Z型/F型等）",
    "配色・コントラスト・タイポグラフィの特徴",
    "再利用できる構造・パターン（他業種に転用する際の注意点も含めて）",
    "権利上の注意点（素材・コピー・ロゴ等、直接模倣してはいけない部分）",
  ];
  const byMedia = {
    banner: ["コピーの訴求構造とCTA", "遷移先ページとの整合性（分かる場合）"],
    web: ["PC/SPでの情報設計の違い", "問い合わせ・CV導線の配置"],
    graphic: ["文字組み・グリッド・余白設計", "印刷/展開を想定した再現性"],
    parts: ["このパーツの役割と前後の文脈での使われ方", "切り出し境界の妥当性"],
    canva: ["差し替え容易性（テンプレートとしての量産性）", "情報階層の固定度"],
    asset: ["検索語・用途適合性（素材自体の権利は転載しないこと前提）"],
    pattern: ["この原則が成立する条件・反例・失敗しやすいケース"],
  };
  return [...common, ...(byMedia[mediaKey] || [])];
}

function cbsFieldPrompts(mediaKey) {
  return [
    "id / mediaType / title",
    "industry_tags / color_tags / layout_tags / copy_types（既存のknowledge/lp/*.jsonと同じ語彙系）",
    "primary_appeal（主訴求とその理由）",
    "reusable_principles（他案件に転用できる原則。配列）",
    "rights_excluded（直接模倣してはいけない要素。配列）",
    "source（captureUrl / sourceUrl / sourceDetailUrl）",
    `媒体が${mediaLabel(mediaKey)}であることを踏まえた、その媒体特有の追加項目があれば提案してほしい`,
  ];
}

function mediaLabel(mediaKey) {
  const labels = {
    banner: "バナー",
    web: "Webサイト",
    graphic: "グラフィックデザイン",
    parts: "デザインパーツ",
    canva: "Canvaテンプレート",
    asset: "素材探索",
    pattern: "デザイン原則・パターン",
    "note-ideas": "note記事ネタ",
  };
  return labels[mediaKey] || mediaKey;
}

async function listJsonFiles(dir) {
  try {
    const entries = await fs.readdir(dir);
    return entries.filter((name) => name.endsWith(".json")).map((name) => path.join(dir, name));
  } catch {
    return [];
  }
}

async function readJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
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
