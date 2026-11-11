#!/usr/bin/env node
/**
 * DISの分析（analysis.json）から、次の2つの下書きを、案件フォルダに作る（ローカルのみ・外部書込みなし）。
 *   1. cbs-knowledge-draft.json … CBS用ナレッジ（knowledge/lp/LP-nnnn.json）の下書き。cbs_sync は「下書き・未同期」。
 *   2. lp28-seed.md / lp28-seed.json … 28章分析（lp-deep-analyzer・章順v4.0）の、DISで埋められる章の下書きと、未作成の章の一覧。
 * LP番号（libraryId）は data/dis-relations.json から引く（同じLPの既存番号、または確保済みの番号）。
 * 既存のknowledge/lp/*.json・Notion・Dropboxには書かない。評価点（DISの9軸と、28章のヒューリスティック）は混ぜない。
 *
 * 使い方: node scripts/dis/cbs-draft.mjs --id DIS-LP-0001 [--tags <tags.json>] [--dir <案件フォルダ>]
 */
import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { tagsFromNotionProps } from "./lib/knowledge-tags.mjs";
import { isExcluded } from "./lib/cbs-exclusions.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, "../..");

const readJson = async (f, dflt = null) => { try { return JSON.parse(await fs.readFile(f, "utf8")); } catch { return dflt; } };
const short = (s, n = 140) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const cell = (s) => String(s ?? "").replace(/\|/g, "／").replace(/\n/g, " ");
const pad = (n, w = 2) => String(n).padStart(w, "0");

/** DISの媒体コード → CBSナレッジの媒体（mediaType・保存先ディレクトリ）。 */
export const KNOWLEDGE_MEDIA = { LP: { mediaType: "LP", dir: "lp" }, BN: { mediaType: "Banner", dir: "banner" }, WB: { mediaType: "Web", dir: "web" } };
export const mediaOf = (disId) => KNOWLEDGE_MEDIA[/^DIS-(LP|BN|WB)-/.exec(disId)?.[1]] || null;

/** DIS ID（DIS-LP-0001）から、案件フォルダを探す。 */
export async function findItemDir(disId, out = path.join(REPO, "outputs/dis")) {
  const m = /^DIS-(LP|BN|WB)-(\d{4})$/.exec(disId);
  if (!m) throw new Error(`DIS ID の形式が違います: ${disId}`);
  const subs = { LP: ["LP"], BN: ["バナー"], WB: ["Web", "ウェブ"] }[m[1]]; // 先頭が現在の名前。続くのは以前の名前（読み取りのみ）
  for (const sub of subs) {
    const base = path.join(out, sub);
    const hit = (await fs.readdir(base).catch(() => [])).find((d) => d.startsWith(`${m[2]}_`));
    if (hit) return path.join(base, hit);
  }
  throw new Error(`案件フォルダが見つかりません: ${path.join(out, subs[0])}/${m[2]}_*`);
}

async function imgSize(file) {
  try { const { default: sharp } = await import("sharp"); const m = await sharp(file, { limitInputPixels: false }).metadata(); return { width: m.width, height: m.height }; } catch { return null; }
}

export function buildKnowledgeDraft({ a, item, rel, sizes, tags = {}, dropboxFolder }) {
  const media = mediaOf(item.disId) || KNOWLEDGE_MEDIA.LP;
  const isLp = media.mediaType === "LP";
  const units = a.units || [];
  const by = (types) => units.filter((u) => types.includes(u.roleType));
  const brand = String(a.brand || "").replace(/のLPデザイン$/, "");
  const asset = (key, file) => ({ path: `01_Normal_Images/${file}`, ...(sizes[key] || {}), status: sizes[key] ? "captured_unverified" : "missing" });
  // 全媒体とも、ライブラリー番号（LP-nnnn／BN-nnnn／WB-nnnn）が主（CBSの鍵）。DISの番号は、dis_ids で持つ。
  // ライブラリー番号の対応（data/dis-relations.json）が先に必要。番号がないときは、DISの番号を代わりに使わない（同じ作品が2件になるため）。
  const id = rel?.libraryId;
  const knowledgePath = id ? `knowledge/${media.dir}/${id}.json` : null;
  return {
    id, dis_ids: [item.disId], mediaType: media.mediaType, media_type: media.mediaType, title: a.brand, brand,
    industry_tags: tags.industry_tags ?? [], product_tags: tags.product_tags ?? [], color_tags: tags.color_tags ?? [], layout_tags: tags.layout_tags ?? [], copy_types: tags.copy_types ?? [],
    primary_appeal: tags.primary_appeal ?? (isLp ? "（28章の分析で確定）" : short(a.summary, 200)), ...(isLp ? { offer: tags.offer ?? "（28章の分析で確定）" } : {}),
    captureUrl: a.pageUrl, sourceUrl: isLp ? "https://rdlp.jp/lp-archive/" : (item.sourceDetailUrl || a.pageUrl), sourceDetailUrl: item.sourceDetailUrl || a.pageUrl,
    source: { captured_url: a.pageUrl, reference_name: item.sourceName || (isLp ? "LPアーカイブ" : "手動指定"), reference_url: isLp ? "https://rdlp.jp/lp-archive/" : null, reference_detail_url: item.sourceDetailUrl || null, notion_url: rel?.libraryNotionPageId ? `https://app.notion.com/p/${rel.libraryNotionPageId.replace(/-/g, "")}` : null, dis_notion_url: rel?.disNotionPageId ? `https://app.notion.com/p/${rel.disNotionPageId.replace(/-/g, "")}` : null, dropbox_master_path: null, dis_dropbox_path: dropboxFolder, github_knowledge_path: knowledgePath, archive_post_id: String(rel?.canonicalKey || "").replace(/^rdlp:/, "") || null },
    ...(isLp ? { asset_status: { pc_full: asset("pc_full", `${item.disId}_PC_full.png`), pc_first_view: asset("pc_first_view", `${item.disId}_PC_first_view.png`), sp_full: asset("sp_full", `${item.disId}_SP_full.png`), sp_first_view: asset("sp_first_view", `${item.disId}_SP_first_view.png`), repository_crosscheck: "not_run" } } : {}),
    ...(isLp ? { funnel_structure: units.map((u, i) => ({ step: i + 1, role: u.roleType, pattern: u.name, description: short(u.role, 120) })) } : {}),
    section_patterns: units.map((u, i) => ({ id: `C${pad(i + 1)}`, source_section: u.id, name: u.name, role: u.roleType, reusable_structure: [u.reuseStructure].filter(Boolean), replace_required: u.mustReplace || [], rights_status: "reference_only" })),
    reusable_principles: [...(a.reuse?.reusableStructures || [])],
    ...(isLp ? { cta_patterns: by(["CTA"]).map((u) => ({ name: u.name, description: short(u.observation, 160) })),
    trust_patterns: by(["実績", "FAQ", "会社情報"]).map((u) => ({ name: u.name, description: short(u.observation, 160), required_caution: "実績・写真・数値は、案件ごとの権利と現在性の確認が必要。" })),
    pricing_patterns: by(["料金", "商品紹介"]).filter((u) => /円|価格|料金/.test(u.observation || "")).map((u) => ({ name: u.name, description: short(u.observation, 160), basis_status: "requires_verification" })) } : {}),
    visual_patterns: (a.axes || []).filter((x) => ["color_legibility", "visual_brand", "layout_spacing"].includes(x.key)).map((x) => ({ name: x.key, description: short(x.evidence, 200) })),
    rights_excluded: a.rights?.noReuse || [],
    unverified_claims: units.flatMap((u) => (u.unknowns || []).map((k) => ({ claim: typeof k === "string" ? k : k.item, status: "unverified", required_basis: [typeof k === "string" ? "" : k.nextCheck].filter(Boolean), source_unit: u.id }))),
    recommended_use_cases: tags.recommended_use_cases ?? [],
    analysis_notes: { completion_status: isLp ? "dis_analysis_done_28ch_pending" : "dis_analysis_done", dis_analysis_ref: item.disId, remaining_limits: [...(isLp ? ["タグ・訴求・オファーは、28章の分析で確定する", "ライブラリー側の取り込み・28章の分析は未実施（このファイルはDISからの下書き）"] : ["タグは、必要に応じて人が確認する（このファイルはDISからの下書き）"]), "CBS本体への実同期は未実施"] },
    // DISの評価（9軸）は、28章のヒューリスティックの総合点と別物。混ぜずに、方法を明記して持つ。
    dis_evaluation: { method: "DIS 9軸（各1〜5点、根拠・確信度つき）", axes: (a.axes || []).map((x) => ({ key: x.key, label: x.label, score: x.score, confidence: x.confidence })), note: "28章の総合点（ヒューリスティック/100）とは別の物差し。足したり平均したりしない。" },
    cbs_sync: { status: "draft_from_dis", knowledge_path: knowledgePath, exported_at: null, actual_cbs_import: "not_synced" },
  };
}

/** 28章のうち、DISで埋められる章の下書きと、未作成の章の一覧。 */
export function buildLp28Seed({ a, item, rel, sizes, files, dropboxFolder }) {
  const units = a.units || [];
  const H = { pc: sizes.pc_full?.height, sp: sizes.sp_full?.height };
  const px = (u, d) => (H[d] && u.regions?.[d] && u.regions[d].y1 > u.regions[d].y0 ? `${Math.round(u.regions[d].y0 * H[d]).toLocaleString()}–${Math.round(u.regions[d].y1 * H[d]).toLocaleString()}` : "未指定");
  const L = [];
  const id = rel?.libraryId || "（未採番）";
  const note = rel?.relation === "same_lp" ? "既存のライブラリー番号を維持（同一LP。新しい番号なし）" : `確保済み（ライブラリーの最新 LP-0244 の次。確保日 ${rel?.establishedAt || "—"}）`;
  L.push(`# ${id}｜${a.brand}｜28章 下書き（DISから）`, "", "> このファイルは、DISの分析から、28章のうち埋められる章を下書きにしたもの。`【DIS】` は、DISの観察・評価の引用。28章の分析は、画像を読み直して、未作成の章を書き、DISの内容を確認して完成させる。", "",
    "## ヘッダーメタ（必須17項目のうち、DISで埋まるもの）", "",
    `- LP番号: ${id}（${note}）`, `- ステータス: 下書き（28章は未完成）`, `- URL: ${a.pageUrl}`, `- Archive URL: ${item.sourceDetailUrl}`,
    `- PC・SP: PC ${sizes.pc_full ? `${sizes.pc_full.width}×${sizes.pc_full.height}` : "なし"}／SP ${sizes.sp_full ? `${sizes.sp_full.width}×${sizes.sp_full.height}` : "なし"}`, `- 権利区分: reference_only／rights_unknown`, `- 取得日: ${item.date || ""}`, `- 検証状態: 下書き`, `- Scout元: ${item.sourceName || "LPアーカイブ"}（手動指定）`, `- 形式基準: 統一28章 v4.0`,
    `- 未入力（28章で確定）: サムネイル／オファーカテゴリ／コピータイプ／業種カテゴリ／商材／主要CV`, "", "---", "",
    "## 1. 基本情報", "", "| 項目 | 内容 |", "| --- | --- |",
    `| LP-ID | ${id} |`, `| 正式名称 | ${cell(a.brand)} |`, `| URL | ${cell(a.pageUrl)} |`, `| Archive URL | ${cell(item.sourceDetailUrl)} |`, `| 画像の出どころ | ${cell(a.captureSource || "実ページの撮影")} |`,
    `| PC/SP | PC ${sizes.pc_full ? `${sizes.pc_full.width}×${sizes.pc_full.height}` : "—"} px / SP ${sizes.sp_full ? `${sizes.sp_full.width}×${sizes.sp_full.height}` : "—"} px |`, `| DIS | ${item.disId}（Dropbox: ${cell(dropboxFolder)}） |`, `| 要約【DIS】 | ${cell(short(a.summary, 400))} |`, "",
    "---", "", "## 3. Section位置索引（実テーブル。DISのUnitから）", "", "| Section | PC y範囲(px) | SP y範囲(px) | 役割 / 主要内容 | 対応画像 |", "| --- | --- | --- | --- | --- |",
    ...units.map((u, i) => `| ${pad(i + 1)} | ${px(u, "pc")} | ${px(u, "sp")} | ${cell(`${u.roleType}｜${u.name}：${short(u.role, 80)}`)} | sections_by_unit/pc_${pad(i + 1)}_${u.roleType}.png${sizes.sp_full ? ` / sp_${pad(i + 1)}_${u.roleType}.png` : ""} |`), "",
    "---", "", "## 8. 全Section分析（固定15項目。DISの観察から、一部を下書き）", "");
  units.forEach((u, i) => {
    L.push(`### Section ${pad(i + 1)}｜${u.name}`, "",
      `1. Section番号・位置: ${pad(i + 1)}／PC ${px(u, "pc")}px／SP ${px(u, "sp")}px`, `2. 役割: ${u.role}`, `3. 見出し・主要コピー: 【DIS・観察より。正確な読取りを、画像で確認して書き直す】`, `4. 価格・オファー: （未作成）`, `5. CTA: （未作成）`, `6. バッジ・ラベル: （未作成）`, `7. アイコン: （未作成）`, `8. カード・表・FAQ: （未作成）`, `9. 装飾: （未作成）`, `10. 画像・人物・商品配置: （未作成）`,
      `11. 訴求意図・購入心理への作用: （未作成）`, `12. PC/SP差: 【DIS・観察より】${short(u.observation, 300)}`, `13. 証拠ソース: ${u.evidence}`, `14. 確信度: ${u.confidence}`,
      `15. 未確認事項・failure_reason: ${(u.unknowns || []).map((k) => (typeof k === "string" ? k : `${k.item}（影響: ${k.impact}／次: ${k.nextCheck}）`)).join(" ／ ") || "なし"}`, "");
  });
  const imp = a.improvements || {};
  const row = (p, x) => `| ${p} | ${cell(x.issue)} | ${cell(x.evidence)} | ${cell(x.change)} | ${cell(x.expected)} | ${cell(x.metric)} |`;
  L.push("---", "", "## 14. P0/P1/P2改善案（DISの改善案を対応づけ。最優先→P0、優先→P1、アイデア→P2）", "", "| 優先 | 課題 | 根拠 | 修正案 | 期待効果 | 検証指標 |", "| --- | --- | --- | --- | --- | --- |",
    ...(imp.top || []).map((x) => row("P0", x)), ...(imp.priority || []).map((x) => row("P1", x)), ...(imp.ideas || []).map((x) => row("P2", x)), "",
    "---", "", "## 15. 再利用価値のあるパーツ候補（DISの再利用構造）", "", ...(a.reuse?.reusableStructures || []).map((s) => `- ${s}`), "",
    "---", "", "## 16. 権利・再利用ルール", "", "- reference_only: 情報の順序・余白の比率・構造・配色の傾向", `- rights_excluded: ${(a.rights?.noReuse || []).join("、")}`, ...(a.rights?.unverified || []).map((s) => `- 未確認: ${s}`), "",
    "---", "", "## 17. 未確認・failure_reason・次工程（DISのUnitごとの未確認）", "", "| 対象 | 未確認 | 影響 | 次に必要な確認 |", "| --- | --- | --- | --- |",
    ...units.flatMap((u) => (u.unknowns || []).map((k) => `| ${u.id} ${cell(u.name)} | ${cell(typeof k === "string" ? k : k.item)} | ${cell(typeof k === "string" ? "" : k.impact)} | ${cell(typeof k === "string" ? "" : k.nextCheck)} |`)), "",
    "---", "", "## 23. 証拠・ファイル台帳（DISの案件フォルダ）", "", ...files.map((f) => `- ${f}`), "",
    "---", "", "## 28. 実行・重複防止記録", "", `- 番号の根拠: ${id} ${note}`, `- 対応: ${item.disId} ↔ ${id}（data/dis-relations.json）`, `- 既存分析: ${rel?.relation === "same_lp" ? "あり（ライブラリーの既存ページ。DISは別ルートの再分析。既存を上書きしない）" : "なし（ライブラリー未登録。この28章が初版になる）"}`, "",
    "---", "", "## 未作成の章（画像を読み直して書く）", "",
    "- 2（全体マップ：6枠の実画像）、4（役割分担）、5（エグゼクティブサマリー・総合NN/100）、6（ペルソナ・購入心理）、7（構成骨格・視線誘導）、8の未作成の項目（4〜11）、9（コピー・オファー・価格・CTA）、10（信頼形成・反論処理）、11（PC/SP差）、12（配色・タイポグラフィ）、13（良い点・機会損失）、18〜22（レイアウト・配色の参照プロファイル、異業種転用、評価ルール、DB項目）、24〜27（更新記録・Sources・切り出し指示書・返却用依頼文）", "",
    "- 完了条件: 1〜28章がすべて存在し、名称・順序が v4.0 どおり／ヘッダーメタ17項目／章2の6枠に実画像／1ページ完全版HTML／末尾に『✅ 分析表記済み』");
  return L.join("\n");
}

/**
 * 下書きを knowledge/<媒体>/<ID>.json に配置する（新規のみ・上書きしない）。CBS本体への同期はしない（cbs_sync は下書き・未同期のまま）。
 * 配置の条件: IDがある／訴求・タグが確定している（LPは「（28章の分析で確定）」のままでは不可）／検証を通る／同名のファイルがない。
 */
export async function placeKnowledge({ draft, repo = REPO, replaceDraft = false }) {
  const media = Object.values(KNOWLEDGE_MEDIA).find((m) => m.mediaType === draft.mediaType);
  if (!media) throw new Error(`媒体が不明です: ${draft.mediaType}`);
  if (!draft.id) throw new Error("ライブラリー番号がありません。data/dis-relations.json に、DISの番号とライブラリー番号（LP-nnnn／BN-nnnn／WB-nnnn）の対応を追加してください");
  if (!new RegExp(`^${{ LP: "LP", Banner: "BN", Web: "WB" }[media.mediaType]}-\\d{4}$`).test(draft.id)) throw new Error(`ライブラリー番号の形式ではありません: ${draft.id}（DISの番号は、主のIDにしません）`);
  if (String(draft.primary_appeal || "").startsWith("（28章")) throw new Error("訴求・タグが未確定です。--tags で primary_appeal・タグ（industry_tags など）を指定してください");
  if (repo === REPO && isExcluded(draft.dis_ids, draft.mediaType)) throw new Error("一時除外の対象です（config/cbs-export-exclusions.json）。配置しません");
  const target = path.join(repo, "knowledge", media.dir, `${draft.id}.json`);
  const exists = await fs.access(target).then(() => true, () => false);
  let overwrite = false;
  if (exists) {
    // 置き換えてよいのは、同じDISの下書きで、CBSへ未同期のままのファイルだけ（手で作ったナレッジ・同期済みのものは、決して上書きしない）
    const cur = replaceDraft ? JSON.parse(await fs.readFile(target, "utf8").catch(() => "null")) : null;
    const ok = cur && cur.cbs_sync?.status === "draft_from_dis" && cur.cbs_sync?.actual_cbs_import === "not_synced" && (cur.dis_ids || []).some((d) => (draft.dis_ids || []).includes(d));
    if (!ok) throw new Error(`すでにあります（上書きしません）: knowledge/${media.dir}/${draft.id}.json`);
    overwrite = true;
  }
  const errors = [];
  for (const f of ["id", "mediaType", "title", "captureUrl", "sourceDetailUrl"]) if (!draft[f]) errors.push(`${f} が空`);
  if (draft.cbs_sync?.status !== "draft_from_dis" || draft.cbs_sync?.actual_cbs_import !== "not_synced") errors.push("cbs_sync が、下書き・未同期ではありません");
  if (media.mediaType === "LP") {
    const tmp = path.join(await fs.mkdtemp(path.join((await import("node:os")).tmpdir(), "dis-place-")), `${draft.id}.json`);
    await fs.writeFile(tmp, JSON.stringify(draft));
    const r = spawnSync(process.execPath, [path.join(REPO, "scripts/validate-lp-knowledge.mjs"), "--input", tmp], { encoding: "utf8" });
    if (r.status !== 0) errors.push(`LPナレッジの検証に失敗: ${(r.stdout + r.stderr).trim().split("\n").filter((l) => /ERROR/.test(l)).join(" / ") || "不明"}`);
  }
  if (errors.length) throw new Error(`配置できません: ${errors.join(" / ")}`);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(draft, null, 2)}\n`, { flag: overwrite ? "w" : "wx" });
  return path.relative(repo, target);
}

async function main() {
  const { values } = parseArgs({ options: { id: { type: "string" }, dir: { type: "string" }, tags: { type: "string" }, place: { type: "boolean", default: false }, "replace-draft": { type: "boolean", default: false }, appeal: { type: "string" }, "appeal-from-summary": { type: "boolean", default: false }, offer: { type: "string" }, "knowledge-root": { type: "string" } } });
  if (!values.id) throw new Error("--id（例: DIS-LP-0001）が必要です");
  const dir = values.dir || (await findItemDir(values.id));
  const a = await readJson(path.join(dir, "analysis.json"));
  const item = await readJson(path.join(dir, "item.json"), {});
  if (!a) throw new Error("analysis.json が読めません");
  const relations = (await readJson(path.join(REPO, "data/dis-relations.json"), { relations: [] })).relations;
  const rel = relations.find((r) => r.disId === values.id) || null;
  if (!rel) console.error(`注意: ${values.id} は data/dis-relations.json にありません（ライブラリー番号が未定のため、id は空になります。番号を確保・対応づけてから、--place してください）`);
  // タグは、--tags のファイルが優先。なければ、分析の notionProps（Notionの既存の選択肢）から作る。訴求・オファーは、指定（--appeal／--appeal-from-summary／--offer）があるときだけ入れる。
  const tags = { ...tagsFromNotionProps(a.notionProps, /^DIS-(LP|BN|WB)-/.exec(values.id)?.[1] || null), ...(values.tags ? await readJson(values.tags, {}) : {}) };
  if (values.appeal) tags.primary_appeal = values.appeal;
  else if (values["appeal-from-summary"] && !tags.primary_appeal) tags.primary_appeal = short(a.summary, 200);
  if (values.offer) tags.offer = values.offer;
  const n = path.join(dir, "files/01_Normal_Images");
  const sizes = {};
  for (const [k, f] of [["pc_full", "PC_full"], ["pc_first_view", "PC_first_view"], ["sp_full", "SP_full"], ["sp_first_view", "SP_first_view"]]) { const s = await imgSize(path.join(n, `${values.id}_${f}.png`)); if (s) sizes[k] = s; }
  const ledger = await readJson(path.join(REPO, "data/dis-ledger.json"), { entries: [] });
  const entry = (Array.isArray(ledger) ? ledger : ledger.entries || []).find((e) => e.disId === values.id);
  const dropboxFolder = entry?.dropbox?.folder || null;
  const files = [];
  for (const sub of ["01_Normal_Images", "01_Normal_Images/sections_by_unit", "02_Notion_Images"]) for (const f of (await fs.readdir(path.join(dir, "files", sub)).catch(() => [])).sort()) if (/\.(png|jpe?g)$/i.test(f)) files.push(`files/${sub}/${f}`);

  const draft = buildKnowledgeDraft({ a, item: { ...item, disId: values.id }, rel, sizes, tags, dropboxFolder });
  await fs.writeFile(path.join(dir, "cbs-knowledge-draft.json"), `${JSON.stringify(draft, null, 2)}\n`);
  const isLp = draft.mediaType === "LP";
  if (isLp) await fs.writeFile(path.join(dir, "lp28-seed.md"), `${buildLp28Seed({ a, item: { ...item, disId: values.id }, rel, sizes, files, dropboxFolder })}\n`);
  const placed = values.place ? await placeKnowledge({ draft, repo: values["knowledge-root"] || REPO, replaceDraft: values["replace-draft"] }) : null;
  console.log(JSON.stringify({ disId: values.id, knowledgeId: draft.id ?? null, dir, written: ["cbs-knowledge-draft.json", ...(isLp ? ["lp28-seed.md"] : [])], placed, units: (a.units || []).length, next: placed ? "git add でコミットし、cbs:export でインデックスを更新（CBS本体への同期は、確認後に別工程で行う）" : "knowledge/ に配置するなら --place（訴求・タグが確定していること）" }, null, 2));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
