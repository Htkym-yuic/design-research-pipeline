import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    if (!argv[index].startsWith("--")) continue;
    const key = argv[index].slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith("--") ? argv[++index] : true;
  }
  return args;
}

function escapeXml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function wrapText(value, maxChars = 28) {
  const lines = [];
  let current = "";
  for (const token of String(value).split(/(?=[／・＋])/)) {
    if (current && current.length + token.length > maxChars) {
      lines.push(current);
      current = token;
    } else {
      current += token;
    }
  }
  if (current) lines.push(current);
  return lines;
}

const args = parseArgs(process.argv.slice(2));
if (!args.config) {
  console.error("Usage: node scripts/generate-elementor-blueprint.mjs --config <config.json>");
  process.exit(2);
}

const config = JSON.parse(await fs.readFile(args.config, "utf8"));
const input = path.resolve(config.input);
const output = path.resolve(config.output);
const notionOutput = path.resolve(config.notionOutput);
const metadata = await sharp(input).metadata();
const screenshotWidth = metadata.width;
const height = metadata.height;
const railWidth = config.railWidth || 620;
const width = screenshotWidth + railWidth;
const font = "Hiragino Sans, Noto Sans CJK JP, sans-serif";

const fragments = [
  `<rect x="${screenshotWidth}" y="0" width="${railWidth}" height="${height}" fill="#f5f7fa"/>`,
  `<line x1="${screenshotWidth}" y1="0" x2="${screenshotWidth}" y2="${height}" stroke="#172b4d" stroke-width="6"/>`
];

for (const section of config.sections) {
  const y = Math.max(0, section.y);
  const sectionHeight = Math.min(section.height, height - y);
  const color = section.color || "#ff3b30";
  fragments.push(`<rect x="5" y="${y + 5}" width="${screenshotWidth - 10}" height="${Math.max(1, sectionHeight - 10)}" fill="none" stroke="${color}" stroke-width="8"/>`);
  fragments.push(`<rect x="12" y="${y + 12}" width="${Math.min(560, screenshotWidth - 24)}" height="48" rx="4" fill="${color}" fill-opacity="0.94"/>`);
  fragments.push(`<text x="28" y="${y + 46}" fill="#ffffff" font-family="${font}" font-size="25" font-weight="700">${escapeXml(section.label)}</text>`);

  fragments.push(`<rect x="${screenshotWidth + 20}" y="${y + 8}" width="${railWidth - 40}" height="${Math.max(1, sectionHeight - 16)}" rx="8" fill="#ffffff" stroke="#c7d0dc" stroke-width="2"/>`);
  fragments.push(`<text x="${screenshotWidth + 42}" y="${y + 48}" fill="#172b4d" font-family="${font}" font-size="25" font-weight="700">${escapeXml(section.label)}</text>`);
  let textY = y + 82;
  for (const line of section.lines) {
    for (const wrapped of wrapText(line)) {
      if (textY > y + sectionHeight - 20) break;
      fragments.push(`<text x="${screenshotWidth + 44}" y="${textY}" fill="#334e68" font-family="${font}" font-size="20">• ${escapeXml(wrapped)}</text>`);
      textY += 29;
    }
  }
}

for (const detail of config.details || []) {
  fragments.push(`<rect x="${detail.x}" y="${detail.y}" width="${detail.width}" height="${detail.height}" fill="none" stroke="#005bd8" stroke-width="5" stroke-dasharray="14 9"/>`);
  fragments.push(`<rect x="${detail.x + 8}" y="${detail.y + 8}" width="${detail.labelWidth || 280}" height="38" rx="4" fill="#005bd8" fill-opacity="0.92"/>`);
  fragments.push(`<text x="${detail.x + 20}" y="${detail.y + 35}" fill="#ffffff" font-family="${font}" font-size="20" font-weight="700">${escapeXml(detail.label)}</text>`);
}

const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${fragments.join("")}</svg>`);
await fs.mkdir(path.dirname(output), { recursive: true });
await sharp({ create: { width, height, channels: 4, background: "#ffffff" } })
  .composite([{ input, left: 0, top: 0 }, { input: overlay, left: 0, top: 0 }])
  .png({ compressionLevel: 9 })
  .toFile(output);
await sharp(output)
  .resize({ width: 1200, withoutEnlargement: true })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(notionOutput);

console.log(JSON.stringify({ input, output, notionOutput, width, height, sections: config.sections.length }, null, 2));
