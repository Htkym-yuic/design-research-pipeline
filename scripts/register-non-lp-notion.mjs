import fs from "node:fs/promises";
import { isDryRun, requireEnv } from "./lib/env.mjs";
import {
  appendBlockChildren,
  buildPropertyByType,
  createPage,
  findPageByProperty,
  getDataSource,
  headingBlock,
  imageUploadBlock,
  paragraphBlock,
  uploadFileForNotion
} from "./lib/notion-client.mjs";

const summary = JSON.parse(await fs.readFile("screenshots/non-lp-candidates/summary.json", "utf8"));
const uploads = JSON.parse(await fs.readFile("screenshots/non-lp-candidates/dropbox-upload-result.json", "utf8"));
const analyses = JSON.parse(await fs.readFile("candidates/non-lp/lightweight-analysis.json", "utf8"));
const dryRun = isDryRun();
const dateJst = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
const uploadById = new Map((uploads.results || []).map((item) => [item.id, item]));
const schemaCache = new Map();
const results = [];

if (!dryRun) requireEnv("NOTION_TOKEN");

function propertyType(property) {
  return property?.type || Object.keys(property || {}).find((key) => ["title", "rich_text", "url", "date", "select", "status", "checkbox", "multi_select"].includes(key));
}

function findProperty(properties, type, names = []) {
  for (const name of names) if (properties[name] && propertyType(properties[name]) === type) return name;
  return Object.entries(properties).find(([, property]) => propertyType(property) === type)?.[0] || null;
}

function setProperty(properties, schema, names, type, value) {
  const name = findProperty(schema, type, names);
  if (!name || value === null || value === undefined || value === "") return;
  if (["select", "status"].includes(type)) {
    const options = schema[name]?.[type]?.options || [];
    if (options.length > 0 && !options.some((option) => option.name === String(value))) return;
  }
  const built = buildPropertyByType(type, value);
  if (built) properties[name] = built;
}

for (const item of summary.results || []) {
  const dataSourceId = process.env[item.notionEnv];
  if (!dataSourceId) {
    results.push({ id: item.id, status: "skipped_missing_data_source", env: item.notionEnv });
    continue;
  }
  const upload = uploadById.get(item.id);
  const analysis = analyses.analyses?.[item.id] || {};
  try {
    let schema = schemaCache.get(dataSourceId);
    if (!schema && !dryRun) {
      const dataSource = await getDataSource(dataSourceId);
      schema = dataSource.properties || {};
      schemaCache.set(dataSourceId, schema);
    }
    if (dryRun) {
      results.push({ id: item.id, status: "dry_run", dataSourceId });
      continue;
    }

    const properties = {};
    const titleValue = `${item.id}｜${item.title}`;
    const titleName = findProperty(schema, "title", ["タイトル", "サイト名", "作品名", "パーツ名", "素材名"]);
    if (!titleName) throw new Error("Notionデータソースにtitleプロパティがありません");
    const existing = await findPageByProperty(dataSourceId, titleName, "title", titleValue);
    if (existing) {
      results.push({ id: item.id, status: "already_exists", pageId: existing.id });
      continue;
    }
    setProperty(properties, schema, ["タイトル", "サイト名", "作品名", "パーツ名", "素材名"], "title", titleValue);
    setProperty(properties, schema, ["広告ID", "サイトID", "作品ID", "パーツID", "素材ID", "候補ID"], "rich_text", item.materialId || item.id);
    setProperty(properties, schema, ["参考URL", "公式サイトURL", "素材ページURL", "参考元詳細URL"], "url", item.sourceDetailUrl || item.captureUrl);
    setProperty(properties, schema, ["出典", "取得元サイト", "参考元"], "rich_text", item.sourceName);
    setProperty(properties, schema, ["取得日"], "date", dateJst);
    setProperty(properties, schema, ["Dropbox正本パス", "Dropbox保存先", "保存先"], "rich_text", upload?.dropboxPath || "");
    setProperty(properties, schema, ["ステータス", "確認状態"], "status", "未着手");
    setProperty(properties, schema, ["Notion同期"], "checkbox", true);
    setProperty(properties, schema, ["分析完了"], "checkbox", false);
    setProperty(properties, schema, ["メイン訴求", "良い理由", "用途候補"], "rich_text", analysis.usefulPoints || "");
    if (item.mediaType === "Parts") {
      setProperty(properties, schema, ["分析状態"], "select", "再切り出し待ち");
      setProperty(properties, schema, ["画像精度"], "select", "未確認");
      setProperty(properties, schema, ["要確認点"], "rich_text", analysis.reviewPoints || "切り出し範囲とパーツ種別を確認する。");
    }
    if (item.mediaType === "Asset") {
      setProperty(properties, schema, ["素材種別"], "select", item.sourceName);
      setProperty(properties, schema, ["検索語"], "rich_text", item.searchTerm || "");
      setProperty(properties, schema, ["作者URL", "作者プロフィールURL", "制作者URL"], "url", item.authorProfileUrl || "");
    }

    const blocks = [
      headingBlock("日次軽量分析"),
      paragraphBlock(`概要: ${analysis.overview || "収集済み・軽量分析待ち"}`),
      paragraphBlock(`ビジュアル: ${analysis.visualSummary || "要確認"}`),
      paragraphBlock(`参考にできる点: ${analysis.usefulPoints || "要確認"}`),
      paragraphBlock(`要確認点: ${analysis.reviewPoints || "なし"}`),
      paragraphBlock(`詳細分析候補度: ${analysis.deepDivePriority || "要確認"}`),
      headingBlock("取得情報"),
      paragraphBlock(`参考元: ${item.sourceName}`),
      paragraphBlock(`参考元詳細URL: ${item.sourceDetailUrl || "取得できず"}`),
      ...(item.authorProfileUrl ? [paragraphBlock(`作者プロフィールURL: ${item.authorProfileUrl}`)] : []),
      paragraphBlock(`撮影対象URL: ${item.captureUrl || "メタ情報のみ"}`),
      paragraphBlock(`Dropbox正本パス: ${upload?.dropboxPath || "メタ情報のみ"}`)
    ];

    const page = await createPage(dataSourceId, properties, blocks);
    if (item.saveImage && item.files?.reference?.notionPath) {
      const fileId = await uploadFileForNotion(item.files.reference.notionPath);
      await appendBlockChildren(page.id, [headingBlock("参考画像"), imageUploadBlock(fileId, item.title)]);
    }
    for (const [label, filePath] of [
      ["PCファーストビュー", item.files?.page?.pcNotionFirstView || item.files?.landing?.pcNotionFirstView],
      ["SPファーストビュー", item.files?.page?.spNotionFirstView || item.files?.landing?.spNotionFirstView]
    ]) {
      if (!filePath) continue;
      const fileId = await uploadFileForNotion(filePath);
      await appendBlockChildren(page.id, [headingBlock(label), imageUploadBlock(fileId, label)]);
    }
    results.push({ id: item.id, status: "created", pageId: page.id });
  } catch (error) {
    results.push({ id: item.id, status: "failed", error: error.message });
  }
}

await fs.writeFile("screenshots/non-lp-candidates/notion-registration-result.json", JSON.stringify({ registeredAt: new Date().toISOString(), dryRun, results }, null, 2) + "\n");
const failed = results.filter((item) => item.status === "failed");
console.log(`Non-LP Notion: ${results.filter((item) => item.status === "created").length} created, ${failed.length} failed.`);
if (failed.length > 0) process.exitCode = 1;
