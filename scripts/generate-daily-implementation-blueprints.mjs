import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function parseArgs(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    values[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return values;
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrap(value, max = 27) {
  const source = String(value ?? "");
  const lines = [];
  let current = "";
  for (const character of source) {
    current += character;
    if (current.length >= max || character === "。" || character === "／") {
      lines.push(current);
      current = "";
    }
  }
  if (current) lines.push(current);
  return lines;
}

function safeSlug(value) {
  return String(value || "untitled")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

function evenlySplit(height, labels) {
  return labels.map((label, index) => {
    const y = Math.round((height * index) / labels.length);
    const end = Math.round((height * (index + 1)) / labels.length);
    return { label, y, height: Math.max(1, end - y), confidence: "仮説" };
  });
}

function profileFor(type, height, sourceSections = []) {
  if (type === "LP" && sourceSections.length > 0) {
    return sourceSections.map((section, index) => ({
      label: `${String(index + 1).padStart(2, "0")}｜${String(section.role || "section").replace(" candidate", "")}`,
      y: section.yStart,
      height: Math.max(1, section.yEnd - section.yStart),
      confidence: "撮影時の位置索引"
    }));
  }
  if (type === "WB") {
    return evenlySplit(height, [
      "01｜Header・Hero（仮説）", "02｜導入・価値提示（仮説）", "03｜サービス・特徴（仮説）",
      "04｜利用方法・比較（仮説）", "05｜事例・証拠（仮説）", "06｜料金・不安解消（仮説）",
      "07｜CTA・問い合わせ（仮説）", "08｜Footer（仮説）"
    ]);
  }
  if (type === "BN") return evenlySplit(height, ["01｜コピー領域（仮説）", "02｜主ビジュアル（仮説）", "03｜オファー・CTA（仮説）"]);
  if (type === "PT") return evenlySplit(height, ["01｜パーツ外枠", "02｜主要要素（仮説）", "03｜補助要素・CTA（仮説）"]);
  return evenlySplit(height, ["01｜全体キャンバス", "02｜主画像・主見出し（仮説）", "03｜補足情報（仮説）", "04｜署名・CTA（仮説）"]);
}

function sectionRecipe(type, label) {
  const common = {
    direction: type === "BN" || type === "GR" || type === "CV" ? "Column（構図によりRow）" : "Column / 必要箇所のみRow",
    widgets: type === "BN" || type === "GR" || type === "CV"
      ? ["コンテナ", "画像", "見出し", "テキストエディター", "ボタン"]
      : ["コンテナ", "見出し", "テキストエディター", "画像", "ボタン"],
    pc: "親コンテナ→内部コンテナ→意味単位の子コンテナ",
    sp: "RowはColumnへ変更し、見出し→説明→画像→CTAの読み順を優先"
  };
  const lower = label.toLowerCase();
  if (lower.includes("hero") || lower.includes("fv")) {
    return { ...common, direction: "PC: Row / SP: Column", widgets: ["見出し(H1)", "テキストエディター", "ボタン", "画像"] };
  }
  if (lower.includes("faq")) return { ...common, widgets: ["見出し", "テキストエディター", "アコーディオン", "ボタン"] };
  if (lower.includes("料金") || lower.includes("price")) return { ...common, widgets: ["見出し", "内部コンテナ（料金カード）", "テキストエディター", "ボタン"] };
  if (lower.includes("footer")) return { ...common, direction: "PC: Row + Wrap / SP: Column", widgets: ["見出し", "テキストリンク", "アイコン", "ソーシャルアイコン"] };
  return common;
}

async function renderBlueprint({ id, type, title, imagePath, outputDir, sourceSections = [], sourceUrl = "" }) {
  const rawMetadata = await sharp(imagePath, { limitInputPixels: false }).metadata();
  const scale = rawMetadata.width < 900 ? 900 / rawMetadata.width : 1;
  const displayWidth = Math.round(rawMetadata.width * scale);
  const displayHeight = Math.round(rawMetadata.height * scale);
  const base = await sharp(imagePath, { limitInputPixels: false })
    .resize({ width: displayWidth, height: displayHeight })
    .png()
    .toBuffer();
  const railWidth = Math.max(620, Math.min(760, Math.round(displayWidth * 0.58)));
  const outputWidth = displayWidth + railWidth;
  const sections = profileFor(type, displayHeight, sourceSections.map((section) => ({
    ...section,
    yStart: Math.round(section.yStart * scale),
    yEnd: Math.round(section.yEnd * scale)
  })));
  const font = "Hiragino Sans, Noto Sans CJK JP, sans-serif";
  const svg = [
    `<rect x="${displayWidth}" y="0" width="${railWidth}" height="${displayHeight}" fill="#f5f7fa"/>`,
    `<line x1="${displayWidth}" y1="0" x2="${displayWidth}" y2="${displayHeight}" stroke="#1f2937" stroke-width="6"/>`
  ];

  for (const [index, section] of sections.entries()) {
    const y = Math.max(0, section.y);
    const sectionHeight = Math.min(section.height, displayHeight - y);
    const recipe = sectionRecipe(type, section.label);
    const color = index % 2 === 0 ? "#e53935" : "#f4511e";
    svg.push(`<rect x="5" y="${y + 5}" width="${displayWidth - 10}" height="${Math.max(1, sectionHeight - 10)}" fill="none" stroke="${color}" stroke-width="8"/>`);
    svg.push(`<rect x="14" y="${y + 14}" width="${Math.min(590, displayWidth - 28)}" height="48" rx="4" fill="${color}" fill-opacity="0.94"/>`);
    svg.push(`<text x="28" y="${y + 48}" fill="#fff" font-family="${font}" font-size="25" font-weight="700">${escapeXml(section.label)}</text>`);
    svg.push(`<rect x="${displayWidth + 18}" y="${y + 8}" width="${railWidth - 36}" height="${Math.max(1, sectionHeight - 16)}" rx="7" fill="#fff" stroke="#c7d0dc" stroke-width="2"/>`);
    svg.push(`<text x="${displayWidth + 40}" y="${y + 46}" fill="#172b4d" font-family="${font}" font-size="24" font-weight="700">${escapeXml(section.label)}</text>`);
    const lines = [
      `親: ${String(index + 1).padStart(2, "0")}_${safeSlug(section.label)}`,
      `方向: ${recipe.direction}`,
      `標準部品: ${recipe.widgets.join(" / ")}`,
      `PC: ${recipe.pc}`,
      `SP: ${recipe.sp}`,
      `確度: ${section.confidence}`
    ];
    let textY = y + 82;
    for (const line of lines) {
      for (const wrapped of wrap(line)) {
        if (textY > y + sectionHeight - 18) break;
        svg.push(`<text x="${displayWidth + 40}" y="${textY}" fill="#334e68" font-family="${font}" font-size="19">• ${escapeXml(wrapped)}</text>`);
        textY += 27;
      }
    }
  }

  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${outputWidth}" height="${displayHeight}">${svg.join("")}</svg>`);
  await fs.mkdir(outputDir, { recursive: true });
  const pngPath = path.join(outputDir, `${id}_elementor_brain_implementation.png`);
  const notionPath = path.join(outputDir, `${id}_elementor_brain_implementation_notion.jpg`);
  const jsonPath = path.join(outputDir, `${id}_elementor_implementation.json`);
  const markdownPath = path.join(outputDir, `${id}_elementor_implementation_guide.md`);
  await sharp({ create: { width: outputWidth, height: displayHeight, channels: 4, background: "#fff" } })
    .composite([{ input: base, left: 0, top: 0 }, { input: overlay, left: 0, top: 0 }])
    .png({ compressionLevel: 9 })
    .toFile(pngPath);
  await sharp(pngPath, { limitInputPixels: false })
    .resize({ width: 1200, withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true })
    .toFile(notionPath);

  const tree = sections.map((section, index) => {
    const number = String(index + 1).padStart(2, "0");
    const recipe = sectionRecipe(type, section.label);
    return {
      name: `${number}_${safeSlug(section.label)}`,
      label: section.label,
      confidence: section.confidence,
      parent: "Page_Root",
      children: [
        `${number}_01_Inner`,
        `${number}_01_01_Heading`,
        `${number}_01_02_Content`,
        `${number}_01_03_Visual`,
        `${number}_01_04_CTA`
      ],
      direction: recipe.direction,
      standardWidgets: recipe.widgets,
      desktop: { contentWidth: "Boxed", maxWidth: "1120-1200px（推奨値）", padding: "72-96px 24px（推奨値）", gap: "24-48px（推奨値）" },
      mobile: { direction: "Column", width: "100%", padding: "48-56px 20px（推奨値）", gap: "20-28px（推奨値）" }
    };
  });
  const guide = {
    schemaVersion: "elementor-daily-blueprint-1.0",
    analysisLevel: "daily_provisional",
    id,
    type,
    title,
    sourceUrl,
    generatedAt: new Date().toISOString(),
    sourceImage: imagePath,
    atomicElementsPolicy: "標準Elementorを優先。Atomic Elementsは標準機能で管理しにくい場合だけ補助案として使用。",
    cssPolicy: "原則CSSなし。ElementorのContainer、Gap、Padding、幅、レスポンシブ設定を優先。",
    caution: "日次の一次設計。コンテナ境界と数値は画像からの仮説を含み、詳細分析時に実測・確定する。",
    sections: tree
  };
  await fs.writeFile(jsonPath, JSON.stringify(guide, null, 2) + "\n");

  const treeText = tree.map((section) => `${section.name} [親コンテナ]\n├── ${section.children[0]} [内部コンテナ]\n│   ├── ${section.children[1]} [見出し]\n│   ├── ${section.children[2]} [テキスト/カード]\n│   ├── ${section.children[3]} [画像]\n│   └── ${section.children[4]} [ボタン]`).join("\n");
  const steps = tree.map((section, index) => `${index + 1}. \`${section.name}\`を作成し、その中に\`${section.children[0]}\`を置く。PCは${section.direction}、SPはColumnを基本にする。\n2. 内部に${section.standardWidgets.join("、")}を、画面上の読み順に配置する。\n3. PCは最大幅1120〜1200px、左右Padding 24pxを起点に調整する。SPは幅100%、左右Padding 20px、Gap 20〜28pxを起点にする。\n4. 固有の人物・ロゴ・コピーは複製せず、案件用素材へ差し替える。`).join("\n\n");
  const markdown = `# ${id} Elementor 脳内実装・日次一次設計\n\n## 位置づけ\n\n- 日次軽量分析に含める一次設計です。\n- 画像から読み取れる範囲で作成し、推測値は推奨値または仮説と明記しています。\n- 詳細分析時にセクション境界、数値、PC/SP差、実装可否を再確認して確定版へ更新します。\n- 標準Elementorを優先し、Atomic Elementsは補助案、CSSは原則不使用です。\n\n## ナビゲーターツリー\n\n\`\`\`text\nPage_Root\n${treeText}\n\`\`\`\n\n## 標準Elementorでの作成手順\n\n${steps}\n\n## 共通レスポンシブ手順\n\n1. PCのRow構成はSPでColumnへ切り替えます。\n2. 見出し→説明→画像→CTAの順序を優先します。\n3. カードはPC 2〜3列、タブレット2列、SP1列を基本にします。\n4. ボタンはSPで幅100%、高さ44px以上を目安にします。\n5. 余白はSpacerではなく、親ContainerのGapとPaddingを優先します。\n6. 絶対配置は装飾に限定し、主要情報には使いません。\n\n## Atomic ElementsとCSS\n\n- Atomic Elements: 標準Containerでは同じ構造が過度に深くなる場合だけ候補にします。\n- CSS: 標準のLayout、Style、Advanced、Responsiveで再現できないことを確認するまで追加しません。\n- CSSが必要な場合は、目的、対象クラス、標準機能での代替案を詳細分析に記録します。\n\n## 未確認\n\n- 実DOMのコンテナ境界\n- Elementor設定パネルの実数値\n- タブレット固有の調整値\n- 動き、Sticky、カルーセル、フォームの挙動\n- 使用素材のライセンスと差し替え条件\n\n## 参照\n\n- 対象URL: ${sourceUrl || "未確認"}\n- 元画像: ${imagePath}\n- 注釈画像: ${pngPath}\n`;
  await fs.writeFile(markdownPath, markdown);
  return { pngPath, notionPath, jsonPath, markdownPath, sections: tree.length, status: "generated_daily_provisional" };
}

async function generateLp() {
  const summaryPath = process.env.LP_CAPTURE_SUMMARY_FILE || "screenshots/lp-candidates/summary.json";
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  const byId = new Map();
  for (const item of summary.results || []) {
    if (item.status !== "captured") continue;
    if (!byId.has(item.id)) byId.set(item.id, {});
    byId.get(item.id)[item.device] = item;
  }
  summary.implementationResults = [];
  const analysisPath = process.env.LP_LIGHTWEIGHT_ANALYSIS_FILE || "candidates/lp-archive/lightweight-analysis.json";
  const analyses = JSON.parse(await fs.readFile(analysisPath, "utf8").catch(() => '{"version":2,"analyses":{}}'));
  for (const [id, captures] of byId) {
    const pc = captures.pc || captures.sp;
    const imagePath = pc?.screenshots?.fullPage;
    if (!imagePath) continue;
    const result = await renderBlueprint({
      id,
      type: "LP",
      title: pc.title,
      imagePath,
      outputDir: path.join(path.dirname(imagePath), "03_Implementation_Blueprint"),
      sourceSections: pc.sections || [],
      sourceUrl: pc.captureUrl
    });
    pc.implementation = result;
    summary.implementationResults.push({ id, ...result });
    analyses.analyses ||= {};
    analyses.analyses[id] ||= {};
    analyses.analyses[id].implementationBlueprint = result;
  }
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  await fs.writeFile(analysisPath, JSON.stringify(analyses, null, 2) + "\n");
  return summary.implementationResults;
}

function inferType(item) {
  return ({ Web: "WB", Banner: "BN", Graphic: "GR", Parts: "PT", Canva: "CV", UI: "UI" })[item.mediaType] || null;
}

async function generateNonLp() {
  const summaryPath = "screenshots/non-lp-candidates/summary.json";
  const summary = JSON.parse(await fs.readFile(summaryPath, "utf8"));
  const analysisPath = "candidates/non-lp/lightweight-analysis.json";
  const analyses = JSON.parse(await fs.readFile(analysisPath, "utf8").catch(() => '{"version":2,"analyses":{}}'));
  summary.implementationResults = [];
  for (const item of summary.results || []) {
    const type = inferType(item);
    if (!type || item.status !== "captured") continue;
    const imagePath = item.files?.page?.pcFull
      || item.files?.landing?.pcFirstView
      || item.files?.reference?.normalPath;
    if (!imagePath) continue;
    const result = await renderBlueprint({
      id: item.id,
      type,
      title: item.title,
      imagePath,
      outputDir: path.join(item.directory, "03_Implementation_Blueprint"),
      sourceUrl: item.captureUrl || item.sourceDetailUrl
    });
    item.files ||= {};
    item.files.implementation = result;
    summary.implementationResults.push({ id: item.id, ...result });
    analyses.analyses ||= {};
    analyses.analyses[item.id] ||= {};
    analyses.analyses[item.id].implementationBlueprint = result;
  }
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  await fs.writeFile(analysisPath, JSON.stringify(analyses, null, 2) + "\n");
  return summary.implementationResults;
}

const args = parseArgs(process.argv.slice(2));
const scope = args.scope || "all";
const output = {};
if (["all", "lp"].includes(scope)) output.lp = await generateLp();
if (["all", "non-lp"].includes(scope)) output.nonLp = await generateNonLp();
console.log(JSON.stringify({ scope, generated: Object.values(output).flat().length, ...output }, null, 2));
