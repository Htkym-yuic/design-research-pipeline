#!/usr/bin/env node
/**
 * 旧形式（日付のID）の登録済み案件（DIS-xx-2026110n）の v2 分析から、CBS用ナレッジの下書きを作り、必要なら knowledge/ に新規配置する。
 * 案件フォルダ（Macのoutputs）が無くても、リポジトリ内の v2 分析（candidates/dis/）・台帳・対応表だけで作れる。ローカルのみ（外部書込みなし）。
 *   node scripts/dis/draft-legacy-knowledge.mjs --id DIS-WB-20261107 [--place]
 * 既定は、下書きの内容を表示するだけ（ファイルを書かない）。--place で knowledge/<媒体>/<番号>.json に新規配置（上書きしない）。
 * 種類の割り当てを直したときは --place --replace-draft（同じDISの、CBS未同期の下書きだけ置き換える。手で作ったナレッジは対象外）。
 * ライブラリー番号は data/dis-relations.json（dis:reserve-id で確保）から引く。Section の種類は scripts/dis/migration/roletypes.json を重ねる。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { buildKnowledgeDraft, placeKnowledge } from "./cbs-draft.mjs";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const readJson = async (f) => JSON.parse(await fs.readFile(f, "utf8"));

const SOURCE_NAMES = [[/bannnner\.com/, "Bannnner.com"], [/retrobanner\.net/, "Retro Banners"]];

/** notionProps（Notion用の列）から、CBSナレッジのタグを組み立てる。 */
export function tagsFromNotionProps(p = {}) {
  const arr = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const uniq = (xs) => [...new Set(xs.filter(Boolean))];
  return {
    industry_tags: uniq([p["サイト種別"], ...String(p["ブランド・商材"] || "").split("／").slice(1)]),
    product_tags: uniq([p["広告タイプ"]]),
    color_tags: uniq(arr(p["配色タグ"])),
    layout_tags: uniq([...arr(p["レイアウトタグ"]), ...arr(p["構成タイプ"])]),
    copy_types: [],
  };
}

export async function draftLegacy({ disId, root = REPO }) {
  const f = (p) => path.join(root, p);
  const ledger = (await readJson(f("data/dis-ledger.json"))).entries.find((e) => e.disId === disId);
  if (!ledger) throw new Error(`台帳に ${disId} がありません`);
  const rel = (await readJson(f("data/dis-relations.json"))).relations.find((r) => r.disId === disId) || null;
  if (!rel?.libraryId) throw new Error(`${disId} に、ライブラリー番号の対応がありません（先に dis:reserve-id）`);
  let a = null;
  for (const day of (await fs.readdir(f("candidates/dis")).catch(() => [])).sort().reverse()) {
    a = await readJson(f(`candidates/dis/${day}/${disId}.v2.analysis.json`)).catch(() => null);
    if (a) break;
  }
  if (!a) throw new Error(`v2分析が見つかりません: candidates/dis/<日付>/${disId}.v2.analysis.json`);
  const types = (await readJson(f("scripts/dis/migration/roletypes.json"))).roleTypes[disId] || {};
  const missing = (a.units || []).filter((u) => !types[u.id]);
  if (missing.length) throw new Error(`Sectionの種類が未指定のUnitがあります: ${missing.map((u) => u.id).join(", ")}（scripts/dis/migration/roletypes.json）`);
  a = { ...a, pageUrl: ledger.pageUrl, brand: a.brand && a.brand !== "AUTO" ? a.brand : ledger.brand, units: a.units.map((u) => ({ ...u, roleType: types[u.id] })) };
  const sourceName = SOURCE_NAMES.find(([re]) => re.test(ledger.pageUrl))?.[1] || "DIS日次学習（自動収集）";
  const draft = buildKnowledgeDraft({ a, item: { disId, sourceName, sourceDetailUrl: ledger.pageUrl }, rel, sizes: {}, tags: tagsFromNotionProps(a.notionProps), dropboxFolder: ledger.dropbox?.folder || null });
  return { draft, analysis: a };
}

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, place: { type: "boolean", default: false }, "replace-draft": { type: "boolean", default: false } } });
  if (!values.id) throw new Error("--id（例: DIS-WB-20261107）が必要です");
  const { draft } = await draftLegacy({ disId: values.id });
  console.log(JSON.stringify({ id: draft.id, mediaType: draft.mediaType, title: draft.title, dis_ids: draft.dis_ids, tags: { industry: draft.industry_tags, color: draft.color_tags, layout: draft.layout_tags }, primary_appeal: draft.primary_appeal, sections: draft.section_patterns.map((p) => `${p.id} ${p.role}｜${p.name}`), axes: draft.dis_evaluation.axes.map((x) => `${x.key}=${x.score}`).join(" "), cbs_sync: draft.cbs_sync }, null, 2));
  if (values.place) console.log(`配置しました: ${await placeKnowledge({ draft, replaceDraft: values["replace-draft"] })}（${values["replace-draft"] ? "同じDISの未同期の下書きのみ置き換え" : "新規のみ"}・CBS本体への同期はなし）`);
  else console.log("配置するには --place を付けてください（knowledge/ に新規作成）");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
