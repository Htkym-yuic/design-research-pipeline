#!/usr/bin/env node
/**
 * 登録済みの旧分析（dis-1.0・旧9軸）から、新形式（dis-2.0・原本の9軸）の分析と注釈を作る。
 * 旧分析は変更しない。出力は candidates/dis/<日付>/<ID>.v2.analysis.json と .v2.annotations.json。
 * 旧→新の対応: 情報設計→情報優先順位／視線誘導（＋旧CTA・導線の所見）→視線誘導／配色＋タイポグラフィ→配色・可読性／
 *              余白・レイアウト→レイアウト・余白／信頼性・根拠→信頼・安心／ブランド一貫性→ビジュアル・ブランド／再現性→実装・転用性。
（統合した軸の点数は、旧2軸の平均を切り捨てて控えめにする）
 *              目的適合・訴求・コピーは新設（overlays.json に記載した評価）。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AXES } from "./lib/analysis-schema.mjs";
import { validateAnalysis } from "./lib/analysis-schema.mjs";
import { validateAnnotations } from "./lib/annotations.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const RANK = { low: 0, medium: 1, high: 2 };
const lowest = (a, b) => (RANK[a] <= RANK[b] ? a : b);
const BLANK_UNKNOWN = { item: "実寸・色・フォントの数値", impact: "再現時は目測で代用することになる", nextCheck: "実機またはデザインツールで計測する" };
const MOTION_UNKNOWN = { item: "リンク先・開閉やスクロールなどの動き", impact: "導線・操作性の評価が静止画の範囲に限られる", nextCheck: "実機でクリック・スクロールして確認する" };

export function bboxFromRef(ref) {
  const first = String(ref).split("〜")[0].split("／")[0];
  const m = first.match(/(pc|sp)_(\d+)/i);
  if (!m) return null;
  const image = `${m[1].toLowerCase()}_${m[2].padStart(2, "0")}.jpg`;
  let y = 0, h = 1;
  if (first.includes("最上部")) { y = 0; h = 0.15; } else if (first.includes("最下部")) { y = 0.85; h = 0.15; }
  else if (first.includes("上部")) { y = 0; h = 0.4; } else if (first.includes("中段")) { y = 0.3; h = 0.4; }
  else if (first.includes("下部") || first.includes("下段")) { y = 0.6; h = 0.4; }
  return { image, bbox: { x: 0, y, w: 1, h } };
}

export function migrate(v1, ov, { now = new Date() } = {}) {
  const ax = (n) => v1.axes.find((x) => x.axis === n);
  const mapped = (key, ...names) => {
    const xs = names.map(ax);
    const label = AXES.find((a) => a.key === key).label;
    const score = Math.floor(xs.reduce((n, x) => n + x.score, 0) / xs.length); // 統合する軸は、控えめに切り捨てる
    return { key, label, score, scope: ov.scopeAll, evidence: xs.map((x, i) => (xs.length > 1 ? `${names[i]}: ` : "") + x.evidence).join(" "), confidence: xs.map((x) => x.confidence).reduce(lowest), unverified: [...new Set(xs.map((x) => x.unverified))].join("／") };
  };
  const added = (key) => { const [score, evidence, confidence, unverified] = ov.axes[key]; return { key, label: AXES.find((a) => a.key === key).label, score, scope: ov.scopeAll, evidence, confidence, unverified }; };
  const flow = mapped("visual_flow", "視線誘導");
  flow.evidence += ` 導線（旧「CTA・導線」の所見）: ${ax("CTA・導線").evidence}`;
  flow.unverified = [...new Set([flow.unverified, ax("CTA・導線").unverified])].join("／");
  const axes = [added("purpose_fit"), mapped("information_hierarchy", "情報設計"), flow, added("message_copy"), mapped("trust_safety", "信頼性・根拠"), mapped("color_legibility", "配色", "タイポグラフィ"), mapped("layout_spacing", "余白・レイアウト"), mapped("visual_brand", "ブランド一貫性"), mapped("implementation_reuse", "再現性")];
  const units = v1.units.map((u) => {
    const [role, reuseStructure, replace] = ov.units[u.id];
    const unknowns = [BLANK_UNKNOWN, ...(ov.interactive.includes(u.id) ? [MOTION_UNKNOWN] : [])];
    return { id: u.id, name: u.name, sectionRef: u.sectionRef, role, observation: u.observation, evidence: `${u.sectionRef} の画像で確認できる内容（観察欄のとおり）`, confidence: ov.lowConf.includes(u.id) ? "low" : "medium", reuseStructure, mustReplace: replace.split("・"), unknowns, annotation: u.annotation };
  });
  const replaceAll = [...new Set(units.flatMap((u) => u.mustReplace))].slice(0, 14);
  const tools = ["Canva", "Photoshop", "Elementor"];
  const toolReplace = { Canva: "色・書体は、自社ブランドの設定（ブランドキット）に置き換える", Photoshop: "素材はスマートオブジェクトにして、差し替えを容易にする", Elementor: "画像・文面はウィジェットの設定で差し替え、色・書体はグローバル設定にまとめる" };
  const v2 = {
    schemaVersion: "dis-2.0", analysisVersion: "2.0", sourceAnalysisRef: `${v1.disId} 分析v1（dis-1.0・旧9軸）。登録済みの 03_Analysis/analysis.json`,
    status: "complete", reviewState: "未レビュー", generatedAt: now.toISOString(),
    media: v1.media, disId: v1.disId, pageUrl: v1.pageUrl, brand: v1.brand, sourceImageRefs: ov.sourceImageRefs,
    summary: v1.summary, selectionReason: v1.selectionReason,
    sectionCoverage: { sourceUnitCount: units.length, analyzedUnitCount: units.length }, units, axes,
    improvements: { top: [ov.improvements.top], priority: ov.improvements.priority, ideas: ov.improvements.ideas },
    reproduction: Object.fromEntries(tools.map((t) => [t, { structureSteps: v1.reproduction[t], replaceSteps: [`固有素材（${replaceAll.slice(0, 8).join("・")} など）は、自社の素材に差し替える`, toolReplace[t]] }])),
    reuse: { reusableStructures: ov.reusable, mustReplaceElements: replaceAll },
    rights: { unverified: v1.rightsNotes.unverified, noReuse: v1.rightsNotes.noReuse },
    existingAnalysisComparison: {
      existing: true, note: "登録済みの分析v1との比較",
      matches: [`v1と同じUnit構成（${units.length}件）と観察を引き継いだ`, "v1の評価（点数・根拠・確信度）を、対応する新しい軸へ引き継いだ"],
      differences: ["9軸を原本の定義に組み替えた。旧「タイポグラフィ」と「配色」は「配色・可読性」に統合し、旧「CTA・導線」は「視線誘導」の所見と、新設の「目的適合」「訴求・コピー」に分けて反映した", "旧「情報設計」「信頼性・根拠」「ブランド一貫性」「再現性」は、「情報優先順位」「信頼・安心」「ビジュアル・ブランド」「実装・転用性」に対応させた"],
      additions: ov.additions,
    },
    externalSync: { cbs: "未同期（DISはCBSへ同期しない）", notion: "v1は登録済み。v2は未反映（既存ページは更新しない）", dropbox: "v1は保存済み。v2は新規ファイルとして追加予定" },
    notionProps: v1.notionProps,
  };
  const annotations = { schemaVersion: "dis-annotation-1.0", analysisRef: v1.disId, method: "目測の概算。PC画像（バナーは原画像）を基準に、Unitの位置を、画像の上下の範囲で示した。SPの注釈は未付与", annotations: [] };
  units.forEach((u, i) => {
    const o = ov.annOverride?.[u.id];
    const guess = o ? { image: o[0], bbox: { x: o[1][0], y: o[1][1], w: o[1][2], h: o[1][3] } } : bboxFromRef(u.sectionRef);
    if (!guess) throw new Error(`${v1.disId} ${u.id}: 位置を決められない（sectionRef=${u.sectionRef}）。overlays.json の annOverride を追加してください`);
    annotations.annotations.push({ id: `N${i + 1}`, unitId: u.id, image: guess.image, bbox: guess.bbox, label: u.name, evidence: `${u.sectionRef} の観察（目測の位置）`, confidence: "low" });
  });
  return { v2, annotations };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const overlays = JSON.parse(await fs.readFile(path.join(here, "migration/overlays.json"), "utf8"));
  let bad = 0;
  for (const [id, ov] of Object.entries(overlays)) {
    const dates = (await fs.readdir(path.join(root, "candidates/dis"))).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    let src = null;
    for (const d of dates) { const f = path.join(root, "candidates/dis", d, `${id}.analysis.json`); if (await fs.access(f).then(() => true, () => false)) src = { f, d }; }
    if (!src) { console.error(`旧分析が見つかりません: ${id}`); bad++; continue; }
    const v1 = JSON.parse(await fs.readFile(src.f, "utf8"));
    const { v2, annotations } = migrate(v1, ov);
    const va = validateAnalysis(v2);
    const vn = validateAnnotations(annotations, v2);
    console.log(`${id}: units=${v2.units.length} analysis=${va.ok ? "OK" : "NG " + va.errors.join(" / ")} annotations=${vn.ok ? "OK" : "NG " + vn.errors.join(" / ")}`);
    if (!va.ok || !vn.ok) { bad++; continue; }
    const out = path.join(root, "candidates/dis", src.d);
    await fs.writeFile(path.join(out, `${id}.v2.analysis.json`), JSON.stringify(v2, null, 2) + "\n");
    await fs.writeFile(path.join(out, `${id}.v2.annotations.json`), JSON.stringify(annotations, null, 2) + "\n");
  }
  process.exit(bad ? 1 : 0);
}
