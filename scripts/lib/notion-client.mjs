/**
 * Notion API（データソース対応版、Notion-Version: 2025-09-03）の最小限のクライアント。
 *
 * 「データソースID」は、1つのデータベースが複数データソースを持てるようになった
 * 新しいNotion APIの概念。ページの作成先は database_id ではなく data_source_id で指定する。
 *
 * プロパティ名・型は `config/notion-lp-properties.json` から読み込む。
 * 実際のNotion側のプロパティ名が異なる場合は、コードではなくそのJSONを直す。
 */

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireEnv } from "./env.mjs";

const NOTION_VERSION = "2025-09-03";
const API_BASE = "https://api.notion.com/v1";

const propertyConfigPath = fileURLToPath(new URL("../../config/notion-lp-properties.json", import.meta.url));

let cachedLpPropertyConfig = null;

/** config/notion-lp-properties.json を読み込む（プロセス内キャッシュ） */
export async function loadLpPropertyConfig() {
  if (cachedLpPropertyConfig) return cachedLpPropertyConfig;
  const raw = await fs.readFile(propertyConfigPath, "utf8");
  cachedLpPropertyConfig = JSON.parse(raw);
  return cachedLpPropertyConfig;
}

async function notionFetch(path, options = {}) {
  const token = requireEnv("NOTION_TOKEN");

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = data?.message || JSON.stringify(data);
    throw new Error(`Notion API エラー（${response.status} ${path}）: ${message}`);
  }

  return data;
}

/**
 * 値の型に応じてNotionのプロパティ値オブジェクトを組み立てる。
 * 値がnull/undefined/空文字/空配列の場合はプロパティ自体を省略する
 * （空で上書きして既存の値を消してしまわないため）。
 */
function buildPropertyValue(type, value) {
  if (value === null || value === undefined || value === "") return undefined;
  if (Array.isArray(value) && value.length === 0) return undefined;

  switch (type) {
    case "title":
      return { title: [{ text: { content: String(value) } }] };
    case "rich_text":
      return { rich_text: [{ text: { content: String(value) } }] };
    case "url":
      return { url: String(value) };
    case "date":
      return { date: { start: String(value) } };
    case "select":
      return { select: { name: String(value) } };
    case "status":
      return { status: { name: String(value) } };
    case "checkbox":
      return { checkbox: Boolean(value) };
    case "multi_select":
      return { multi_select: (Array.isArray(value) ? value : [value]).map((name) => ({ name: String(name) })) };
    default:
      throw new Error(`未対応のNotionプロパティ型です: ${type}`);
  }
}

/**
 * `{ lpId: "LP-0223", title: "...", ... }` のような素の値オブジェクトを、
 * config/notion-lp-properties.json の対応表に沿ってNotion API用のproperties形へ変換する。
 * 対応表に無いキーは無視する（タイプミスに気づけるよう戻り値にunknownKeysも含める）。
 */
export function buildLpProperties(config, values) {
  const properties = {};
  const unknownKeys = [];

  for (const [key, value] of Object.entries(values)) {
    const fieldConfig = config.properties[key];
    if (!fieldConfig) {
      unknownKeys.push(key);
      continue;
    }
    const propertyValue = buildPropertyValue(fieldConfig.type, value);
    if (propertyValue !== undefined) {
      properties[fieldConfig.notionName] = propertyValue;
    }
  }

  return { properties, unknownKeys };
}

/** data_source_id配下から、指定したrich_text/titleプロパティが一致するページを1件探す */
export async function findPageByMatchProperty(dataSourceId, config, matchValue) {
  const matchFieldKey = Object.entries(config.properties).find(
    ([, fieldConfig]) => fieldConfig.notionName === config.matchProperty,
  )?.[0];
  const fieldConfig = matchFieldKey ? config.properties[matchFieldKey] : null;
  if (!fieldConfig) {
    throw new Error(`config.matchProperty（${config.matchProperty}）に対応するプロパティ定義が見つかりません`);
  }

  const filterType = fieldConfig.type === "title" ? "title" : "rich_text";
  const matchOperator = config.matchOperator === "contains" ? "contains" : "equals";
  const result = await notionFetch(`/data_sources/${dataSourceId}/query`, {
    method: "POST",
    body: JSON.stringify({
      filter: {
        property: config.matchProperty,
        [filterType]: { [matchOperator]: matchValue },
      },
      page_size: 1,
    }),
  });

  return result.results?.[0] || null;
}

export async function createPage(dataSourceId, properties, children = []) {
  return notionFetch("/pages", {
    method: "POST",
    body: JSON.stringify({
      parent: { type: "data_source_id", data_source_id: dataSourceId },
      properties,
      children,
    }),
  });
}

export async function updatePageProperties(pageId, properties) {
  return notionFetch(`/pages/${pageId}`, {
    method: "PATCH",
    body: JSON.stringify({ properties }),
  });
}

export async function appendBlockChildren(pageId, children) {
  return notionFetch(`/blocks/${pageId}/children`, {
    method: "PATCH",
    body: JSON.stringify({ children }),
  });
}

/** 20 MiB未満のローカルファイルをNotionへ直接アップロードする。 */
export async function uploadFileForNotion(filePath, contentType = "image/jpeg") {
  const filename = path.basename(filePath);
  const upload = await notionFetch("/file_uploads", {
    method: "POST",
    body: JSON.stringify({ mode: "single_part", filename, content_type: contentType }),
  });

  const form = new FormData();
  const buffer = await fs.readFile(filePath);
  form.append("file", new Blob([buffer], { type: contentType }), filename);

  const token = requireEnv("NOTION_TOKEN");
  const response = await fetch(upload.upload_url || `${API_BASE}/file_uploads/${upload.id}/send`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_VERSION,
    },
    body: form,
  });
  const sent = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Notion画像アップロードに失敗しました（${response.status}）: ${sent?.message || JSON.stringify(sent)}`);
  }
  return sent.id || upload.id;
}

/** 未分析の自動取り込みページだけを、安全に日次内容へ差し替える。 */
export async function replaceIntakePageChildren(pageId, children) {
  let cursor;
  do {
    const query = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const result = await notionFetch(`/blocks/${pageId}/children${query}`);
    for (const block of result.results || []) {
      if (["child_page", "child_database", "meeting_notes"].includes(block.type)) continue;
      await notionFetch(`/blocks/${block.id}`, { method: "DELETE" });
    }
    cursor = result.has_more ? result.next_cursor : null;
  } while (cursor);

  return appendBlockChildren(pageId, children);
}

/** 段落ブロックを組み立てる小さなヘルパー */
export function paragraphBlock(text) {
  return {
    object: "block",
    type: "paragraph",
    paragraph: { rich_text: [{ type: "text", text: { content: text } }] },
  };
}

export function headingBlock(text, level = 2) {
  const type = `heading_${Math.min(Math.max(level, 1), 3)}`;
  return {
    object: "block",
    type,
    [type]: { rich_text: [{ type: "text", text: { content: text } }] },
  };
}

export function imageUploadBlock(fileUploadId, caption = "") {
  return {
    object: "block",
    type: "image",
    image: {
      type: "file_upload",
      file_upload: { id: fileUploadId },
      caption: caption ? [{ type: "text", text: { content: caption } }] : [],
    },
  };
}
