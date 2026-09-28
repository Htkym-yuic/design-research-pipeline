import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const candidatesPath = process.env.LP_CANDIDATES_FILE || "candidates/lp-archive/candidates.json";
const summaryPath = process.env.LP_CAPTURE_SUMMARY_FILE || "screenshots/lp-candidates/summary.json";
const outputPath = process.env.LP_LIGHTWEIGHT_ANALYSIS_FILE || "candidates/lp-archive/lightweight-analysis.json";

const candidatesData = JSON.parse(await fs.readFile(candidatesPath, "utf8"));
const captureSummary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
const existing = JSON.parse(await fs.readFile(outputPath, "utf8").catch(() => '{"version":1,"analyses":{}}'));
const captures = new Map();

for (const item of captureSummary.results || []) {
  if (item.status !== "captured") continue;
  if (!captures.has(item.id)) captures.set(item.id, {});
  captures.get(item.id)[item.device] = item;
}

function colorName({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  if (brightness > 224) return "白・明色中心";
  if (brightness < 58) return "黒・濃色中心";
  if (max - min < 24) return "ニュートラルカラー中心";
  if (r === max && g > b) return "黄・橙系";
  if (r === max) return "赤・桃系";
  if (g === max && b > r) return "緑・青緑系";
  if (g === max) return "緑系";
  return "青・紫系";
}

async function inspectImage(filePath) {
  if (!filePath) return null;
  try {
    const { channels } = await sharp(filePath, { limitInputPixels: false }).stats();
    return colorName({ r: channels[0].mean, g: channels[1].mean, b: channels[2].mean });
  } catch {
    return null;
  }
}

for (const candidate of candidatesData.candidates || []) {
  if (existing.analyses?.[candidate.id]) continue;

  const capture = captures.get(candidate.id) || {};
  const pcColor = await inspectImage(capture.pc?.screenshots?.notionFirstView || capture.pc?.screenshots?.firstView);
  const spColor = await inspectImage(capture.sp?.screenshots?.notionFirstView || capture.sp?.screenshots?.firstView);
  const category = candidate.metadata?.category || "分類確認中";
  const taste = candidate.metadata?.tasteTag || "テイスト確認中";
  const company = candidate.metadata?.company || candidate.title || "対象ブランド";
  const sectionRoles = (capture.pc?.sections || []).map((section) => section.role).filter(Boolean);
  const structure = sectionRoles.length > 0
    ? `${sectionRoles.join(" → ")} の順で分割確認。週末レビューで実際の役割名を確定する。`
    : "PC/SPのFVと全体画像を収集済み。週末レビューでセクション構成を確定する。";
  const palette = [...new Set([pcColor, spColor].filter(Boolean))].join("、") || "画像で要確認";
  const selectionReason = [
    `${candidate.sourceName || "参考元"}の新規候補で、既存ID・URLとの重複確認を通過したため。`,
    `${category}・${taste}の事例として分類でき、PC/SPのファーストビューと全体構成を比較できるため。`,
    "週末レビューで既存ナレッジとの差分や再利用可能な構造を評価する材料になるため。",
  ].join("");

  existing.analyses ||= {};
  existing.analyses[candidate.id] = {
    analysisMode: "automated_daily_first_pass",
    overview: `${company}の${category}に関するLP。${candidate.title || "対象ページ"}の訴求と画面構成を日次候補として収集した。`,
    selectionReason,
    mainAppeal: `${candidate.title || company}の主要価値を伝え、次の行動へつなげる構成`,
    fvImpression: `${taste}として掲載された事例。PC/SPのFV画像を確認でき、画面の主調色は${palette}。`,
    roughStructure: structure,
    tasteAndColor: `${taste}。主調色の自動判定は${palette}。`,
    usefulPoints: "PC/SPのFVと全体構成を比較でき、同業種の情報優先順位とレスポンシブ差の検討材料になる。",
    reviewPoints: "これは日次の自動一次分析。コピー、CTA、証拠、セクション役割の意味判断は週末の詳細レビューで再確認する。",
    deepDivePriority: "中。週末レビューでCBS既存ナレッジとの差分と不足領域を確認して優先度を確定する。",
    industryTags: [category],
    colorTags: palette === "画像で要確認" ? [] : palette.split("、"),
    layoutTags: ["長尺LP", "PC/SP比較"],
    generatedAt: new Date().toISOString()
  };
}

existing.version = 2;
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, JSON.stringify(existing, null, 2) + "\n");
console.log(`Lightweight analyses ready: ${Object.keys(existing.analyses || {}).length}`);
