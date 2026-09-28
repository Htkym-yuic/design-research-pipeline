import fs from "node:fs/promises";
import sharp from "sharp";

const summary = JSON.parse(await fs.readFile("screenshots/non-lp-candidates/summary.json", "utf8"));
const outputPath = "candidates/non-lp/lightweight-analysis.json";
const output = JSON.parse(await fs.readFile(outputPath, "utf8").catch(() => '{"version":1,"analyses":{}}'));

function colorName({ r, g, b }) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const brightness = (r + g + b) / 3;
  if (brightness > 220) return "明色・白基調";
  if (brightness < 60) return "暗色・黒基調";
  if (max - min < 25) return "ニュートラル";
  if (r === max && g > b) return "暖色・黄橙系";
  if (r === max) return "暖色・赤桃系";
  if (g === max) return "緑・青緑系";
  return "寒色・青紫系";
}

for (const item of summary.results || []) {
  if (output.analyses[item.id]) continue;
  let palette = "メタ情報のみ";
  const imagePath = item.files?.reference?.notionPath;
  if (imagePath) {
    try {
      const stats = await sharp(imagePath).stats();
      palette = colorName({ r: stats.channels[0].mean, g: stats.channels[1].mean, b: stats.channels[2].mean });
    } catch {}
  }
  const relation = item.mediaType === "Banner"
    ? item.landingUrl ? "バナーと遷移先FVを比較可能" : "遷移先URLを取得できず、バナー単体で保留"
    : item.mediaType === "Web" ? "PC/SPのFV・全体構成を比較可能"
    : item.mediaType === "Asset" ? `素材ID ${item.materialId || "未取得"} と素材ページURLを手動素材選定に利用可能。素材本体の保存・再配布は行わない`
    : item.mediaType === "Pattern" ? `${item.metadata?.rule || "日次収集から再利用可能な原則を抽出"} 根拠候補: ${(item.metadata?.evidenceIds || []).join(", ") || "要確認"}`
    : "単体ビジュアルの構成・余白・文字組みを確認可能";
  const selectionReasonByType = {
    Banner: `バナー単体の訴求・文字量・配色を確認でき${item.landingUrl ? "、遷移先FVとの表現の連続性も比較できる" : "る"}ため。`,
    Web: "PC/SPのファーストビューとページ構成を比較し、情報優先順位とレスポンシブ差を学べるため。",
    Graphic: "文字組み、配色、余白、視線誘導を完成作品単位で確認できるため。",
    Parts: "セクションまたはUI部品として切り出し、他案件へ転用できる構造かを検討できるため。",
    Canva: "テンプレート化しやすい構成、文字組み、配色、情報階層の型を確認できるため。",
    Asset: `素材IDと検索語を残し、${item.sourceName}で将来の制作条件に合う素材を手動選定しやすくするため。`,
    Pattern: "複数の収集事例に共通するデザイン原則を、再利用可能な判断基準として残すため。",
  };
  output.analyses[item.id] = {
    analysisMode: "automated_daily_first_pass",
    overview: `${item.sourceName}から収集した${item.mediaType}参考。${item.title}。`,
    selectionReason: `${item.sourceName}の新規候補として重複確認を通過。${selectionReasonByType[item.mediaType] || "日次リサーチの比較対象として有用なため。"}`,
    visualSummary: `${palette}。${item.metadata?.width || "?"}×${item.metadata?.height || "?"}の掲載画像を基準に確認。`,
    usefulPoints: relation,
    reviewPoints: item.status === "failed" ? item.error : item.metadata?.cautions || "コピー・権利・正確な訴求分類は週末レビューで確認する。",
    deepDivePriority: item.status === "captured" ? "中" : "要確認",
    generatedAt: new Date().toISOString()
  };
}

output.version = 2;
await fs.writeFile(outputPath, JSON.stringify(output, null, 2) + "\n");
console.log(`Non-LP lightweight analyses: ${Object.keys(output.analyses).length}`);
