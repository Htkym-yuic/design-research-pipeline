import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeUrl, brandKey, KnownIndex } from "./lib/dedupe.mjs";
import { selectOne, interleaveBySource, tieHash } from "./lib/select.mjs";
import { writesAllowed } from "./lib/write-guard.mjs";
import { emptyAnalysis, validateAnalysis, AXES, AXIS_KEYS, analysisToMarkdown } from "./lib/analysis-schema.mjs";
import { emptyAnnotations, validateAnnotations } from "./lib/annotations.mjs";
import { buildTextIndex, searchIndexes, tokenize } from "./lib/text-index.mjs";
import { idempotencyKey } from "./lib/ledger.mjs";
import { extractDetailLinks, parseDetail, collectFromSource, extractRdlpCards, parseRdlpDetail, cleanTitle, outboundHosts, looksLikeNonWork, isSponsoredUrl, pickBannerImage } from "./lib/collect.mjs";
import { loadConfig } from "./lib/config.mjs";
import { dropboxFolder, buildNotionProps, chunkText, buildNotionBlocks, markdownToBlocks, DEFAULT_PROPERTY_MAP, resolveSpec } from "./lib/adapters.mjs";

const here = path.dirname(new URL(import.meta.url).pathname);

test("normalizeUrl: utm/hash/www/末尾スラッシュを無視", () => {
  assert.equal(normalizeUrl("https://www.Example.com/a/?utm_source=x#top"), normalizeUrl("https://example.com/a"));
});
test("brandKey: 表記ゆれを吸収", () => assert.equal(brandKey("Dup Brand｜LP"), brandKey("dup brand lp")));

test("KnownIndex: URL一致は常に重複、ブランド一致は180日窓内のみ", () => {
  const k = new KnownIndex();
  k.add({ id: "A", url: "https://x.example/p", brand: "Old Brand", date: "2025-01-01" });
  k.add({ id: "B", url: "https://y.example/p", brand: "New Brand", date: "2026-10-01" });
  assert.equal(k.check({ pageUrl: "https://x.example/p/" }, { today: "2026-11-07" }).duplicate, true);
  assert.equal(k.check({ brand: "Old Brand" }, { today: "2026-11-07" }).duplicate, false);
  assert.equal(k.check({ brand: "New Brand" }, { today: "2026-11-07" }).duplicate, true);
});

test("selectOne: 規約不明・重複・取得不可を除外し最高スコアを選ぶ", () => {
  const w = { a: 50, b: 50 };
  const mk = (brand, v, extra = {}) => ({ brand, pageUrl: `https://${brand}.example/`, termsStatus: "known", signals: { a: v, b: v }, ...extra });
  const res = selectOne([mk("one", 0.9), mk("two", 0.95, { termsStatus: "unknown" }), mk("three", 0.99, { fetchError: "403" }), mk("four", 0.8)], {
    weights: w, minScore: 55, dupCheck: (c) => ({ duplicate: c.brand === "one", reason: "url", of: "X" }),
  });
  assert.equal(res.selected.brand, "four");
  assert.equal(selectOne([], { weights: w, minScore: 1, dupCheck: () => ({}) }).skippedReason, "候補なし");
});
test("selectOne: 最大5候補のみ比較", () => {
  const cands = Array.from({ length: 8 }, (_, i) => ({ brand: `b${i}`, pageUrl: `https://b${i}.example/`, termsStatus: "known", signals: { a: i === 7 ? 1 : 0.7 } }));
  const res = selectOne(cands, { weights: { a: 100 }, minScore: 1, maxCandidates: 5, dupCheck: () => ({ duplicate: false }) });
  assert.equal(res.evaluated.filter((e) => e.inComparison).length, 5);
  assert.notEqual(res.selected.brand, "b7");
});

test("writesAllowed: 3条件が揃うときのみ", () => {
  const on = { DIS_ENABLE_WRITES: "true", DRY_RUN: "false" };
  assert.equal(writesAllowed({ apply: true, env: on }), true);
  assert.equal(writesAllowed({ apply: false, env: on }), false);
  assert.equal(writesAllowed({ apply: true, env: { DRY_RUN: "false" } }), false);
  assert.equal(writesAllowed({ apply: true, env: { DIS_ENABLE_WRITES: "true" } }), false);
  assert.equal(writesAllowed({ apply: true, env: { DIS_ENABLE_WRITES: "true", DRY_RUN: "true" } }), false);
  assert.equal(writesAllowed({ apply: true, env: {} }), false);
});

const imp = (n) => ({ issue: `課題${n}`, evidence: `根拠${n}`, change: `変更${n}`, expected: `期待${n}`, metric: `指標${n}` });
function completeAnalysis() {
  const a = emptyAnalysis({ media: "lp", disId: "DIS-LP-20261107", pageUrl: "https://a.example/", brand: "A" });
  Object.assign(a, { status: "complete", summary: "s", selectionReason: "r", sourceImageRefs: ["pc_01.jpg"] });
  a.units = [{ id: "U1", name: "FV", sectionRef: "pc_01", role: "訴求の提示", observation: "o", evidence: "e", confidence: "medium", reuseStructure: "見出し＋ボタン", mustReplace: ["写真"], unknowns: [{ item: "動き", impact: "低", nextCheck: "実機確認" }], annotation: "n" }];
  a.sectionCoverage = { sourceUnitCount: 1, analyzedUnitCount: 1 };
  a.axes = AXES.map((x) => ({ key: x.key, label: x.label, score: 4, scope: "全体", evidence: "e", confidence: "medium", unverified: "なし" }));
  a.improvements = { top: [imp(1)], priority: [imp(2)], ideas: [imp(3)] };
  a.reproduction = Object.fromEntries(["Canva", "Photoshop", "Elementor"].map((k) => [k, { structureSteps: ["構造"], replaceSteps: ["差替"] }]));
  a.reuse = { reusableStructures: ["構造A"], mustReplaceElements: ["写真"] };
  return a;
}
function completeAnnotations(a) {
  const n = emptyAnnotations(a);
  n.annotations = a.units.map((u, i) => ({ id: `N${i + 1}`, unitId: u.id, image: "pc_01.jpg", bbox: { x: 0.1, y: 0.1, w: 0.5, h: 0.2 }, label: "見出し", evidence: "e", confidence: "low" }));
  return n;
}
test("validateAnalysis: テンプレートは不合格、完成形は合格", () => {
  assert.equal(validateAnalysis(emptyAnalysis({ media: "lp", disId: "x", pageUrl: "u", brand: "b" })).ok, false);
  assert.deepEqual(validateAnalysis(completeAnalysis()).errors, []);
});
test("9軸は原本の定義（目的適合・訴求・コピー など）", () => {
  assert.deepEqual(AXIS_KEYS, ["purpose_fit", "information_hierarchy", "visual_flow", "message_copy", "trust_safety", "color_legibility", "layout_spacing", "visual_brand", "implementation_reuse"]);
  assert.equal(AXES.find((x) => x.key === "purpose_fit").label, "目的適合");
});
test("validateAnalysis: 根拠・確信度・未確認事項・対象範囲が欠けると不合格", () => {
  const a = completeAnalysis(); a.axes[0].evidence = ""; a.axes[1].confidence = null; a.axes[2].unverified = ""; a.axes[3].scope = "";
  assert.equal(validateAnalysis(a).errors.length, 4);
});
test("validateAnalysis: score 0（評価不能）は理由が必須で、1〜5の範囲外・小数は拒否", () => {
  const a = completeAnalysis(); a.axes[0].score = 0;
  assert.equal(validateAnalysis(a).errors.length, 1);
  a.axes[0].notEvaluableReason = "画像から判断できない";
  assert.deepEqual(validateAnalysis(a).errors, []);
  a.axes[1].score = 6; a.axes[2].score = 3.5;
  assert.equal(validateAnalysis(a).errors.length, 2);
});
test("validateAnalysis: sectionCoverage（source＝analyzed＝units）が一致しないと不合格", () => {
  const a = completeAnalysis(); a.sectionCoverage = { sourceUnitCount: 3, analyzedUnitCount: 1 };
  assert.ok(validateAnalysis(a).errors.some((e) => e.includes("sectionCoverage")));
});
test("validateAnalysis: 改善案の5項目・再現手順の構造/差替・再利用構造・既存分析比較・外部同期の記録が必須", () => {
  const a = completeAnalysis(); a.improvements.top[0].metric = ""; a.reproduction.Canva.replaceSteps = []; a.reuse.reusableStructures = []; a.existingAnalysisComparison = { existing: false }; a.externalSync.notion = "";
  assert.equal(validateAnalysis(a).errors.length, 5);
});
test("validateAnalysis: 転用禁止・順位づけのフィールドを拒否／旧形式(dis-1.0)は公開不可", () => {
  const a = completeAnalysis(); a.verbatimCopy = "x"; a.totalScore = 30;
  assert.equal(validateAnalysis(a).errors.length, 2);
  const r = validateAnalysis({ schemaVersion: "dis-1.0" });
  assert.equal(r.ok, false); assert.match(r.errors[0], /旧形式/);
});
test("validateAnnotations: 座標は0〜1、全Unitに注釈、Unit/ID整合を検証", () => {
  const a = completeAnalysis();
  assert.deepEqual(validateAnnotations(completeAnnotations(a), a).errors, []);
  const n = completeAnnotations(a); n.annotations[0].bbox = { x: 0.8, y: 0.1, w: 0.5, h: 0.2 };
  assert.ok(validateAnnotations(n, a).errors.some((e) => e.includes("はみ出")));
  const m = completeAnnotations(a); m.annotations = [];
  assert.ok(validateAnnotations(m, a).errors.some((e) => e.includes("注釈がない")));
  const k = completeAnnotations(a); k.analysisRef = "OTHER"; k.annotations[0].unitId = "U9";
  assert.equal(validateAnnotations(k, a).errors.length, 3); // ID不一致・存在しないUnit・U1に注釈なし
});
test("text-index: 日本語・英語を含む索引を作り、自然言語の質問で近い分析を返す", () => {
  const a1 = completeAnalysis(); a1.summary = "キャンペーンLP。応募方法を番号付きの手順で見せる"; a1.disId = "DIS-LP-1";
  const a2 = completeAnalysis(); a2.summary = "ECサイト。大きな英語の見出しで商品を見せる"; a2.disId = "DIS-WB-1"; a2.media = "web";
  const idx = [buildTextIndex(a1), buildTextIndex(a2)];
  assert.ok(tokenize("応募方法").includes("応募") && tokenize("Design System").includes("design"));
  assert.equal(searchIndexes(idx, "応募方法の手順")[0].id, "DIS-LP-1");
  assert.equal(searchIndexes(idx, "商品 見出し")[0].id, "DIS-WB-1");
  assert.deepEqual(searchIndexes(idx, "まったく無関係な語zzz").length, 0);
});
test("analysisToMarkdown(v2): 主要項目を含み、9軸の表は6列", () => {
  const md = analysisToMarkdown(completeAnalysis());
  for (const w of ["分析版: 2.0", "元分析参照", "外部同期", "再利用構造と差替必須要素", "既存分析との比較", "Section / Unit（1/1）", "| 軸 | 評価 | 確信度 | 対象範囲 | 根拠 | 未確認 |", "課題: 課題1 ／ 根拠: 根拠1", "固有素材の差替"]) assert.ok(md.includes(w), w);
});

test("idempotencyKey: 日付によらず同一URLは同一キー", () => {
  assert.equal(idempotencyKey("lp", "https://A.example/x/?utm_a=1"), idempotencyKey("lp", "https://a.example/x"));
});

test("collect: 一覧から詳細リンク抽出・詳細パース", () => {
  const html = '<a href="/web/a/">A</a><a href="/web/a/">dup</a><a href="/tag/x/">t</a><a href="https://other.example/web/z">ext</a><a href="/web/b/">B</a>';
  const links = extractDetailLinks(html, { listUrl: "https://s.example/", detailPathIncludes: "/web/" });
  assert.deepEqual(links, ["https://s.example/web/a/", "https://s.example/web/b/"]);
  const d = parseDetail('<meta property="og:title" content="T"><meta property="og:image" content="/i.png"><a href="https://real.example/">go</a>', "https://s.example/web/a/");
  assert.deepEqual([d.title, d.image, d.pageUrl], ["T", "https://s.example/i.png", "https://real.example/"]);
});

test("config: ユーザー承認済み(LPアーカイブ)以外はtermsStatus!=known／Notion collectionが仕様どおり", async () => {
  const cfg = await loadConfig();
  assert.deepEqual(cfg.sources.filter((s) => s.termsStatus === "known").map((s) => s.key).sort(), ["81-web", "awwwards", "banner-hiroba", "banner-library", "banner-matome", "bannnner", "cssda", "gdweb", "ikesai", "io3000", "kasou", "landbook", "lapaninja", "muuuuu", "onepagelove", "rdlp", "retrobanner", "s5-style", "sankou-web", "siteinspire", "wdc-web"]);
  assert.ok(cfg.sources.filter((s) => s.termsStatus === "known").every((s) => s.termsApproval));
  assert.ok(cfg.sources.filter((s) => s.termsStatus !== "known").every((s) => ["sankou-lp", "lp-advance", "wdc-lp", "lp-kanji"].includes(s.key) || cfg.media[s.media]));
  assert.equal(cfg.media.lp.notion.collection, "collection://39624d4f-a671-8094-ba0c-000b11fefbd0");
  assert.equal(cfg.media.banner.notion.collection, "collection://01516eed-b32f-464e-bbdf-68bf9e7b87f9");
  assert.equal(cfg.media.web.notion.collection, "collection://72c6fadb-ee7b-4721-a04c-e5a73126c09f");
  assert.equal(dropboxFolder(cfg, "lp", "2026-11-07", "DIS-LP-20261107", {}), "/design/Design_Research_Library/LP_Research_Library/99_Needs_Review/2026-11-07/dis-daily/DIS-LP-20261107");
});

test("buildNotionProps: スキーマにあるプロパティだけ設定", () => {
  const props = buildNotionProps({ "タイトル": { type: "title" }, "参考URL": { type: "url" } }, { disId: "D", title: "D B", brand: "B", pageUrl: "https://a.example/", date: "2026-11-07", summary: "s" });
  assert.deepEqual(Object.keys(props).sort(), ["タイトル", "参考URL"]);
});

/** 媒体別フォルダ（LP / バナー / ウェブ）の中の、最初の案件フォルダ（連番_日付_ブランド）。 */
async function itemDirOf(tmp, folder) {
  const base = path.join(tmp, "out", folder);
  const n = (await fs.readdir(base)).filter((x) => /^\d{4}_/.test(x)).sort()[0];
  return path.join(base, n);
}

test("E2E(ドライラン): フィクスチャで選定→テンプレ→検証→公開計画。外部書込み・台帳更新なし", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-e2e-"));
  const ledger = path.join(tmp, "ledger.json");
  const base = [path.join(here, "run.mjs"), "--fixture", path.join(here, "fixtures/sample-candidates.json"), "--snapshot", path.join(here, "fixtures/known-snapshot.json"), "--out", path.join(tmp, "out"), "--ledger", ledger, "--date", "2026-11-07"];
  const env = { ...process.env, DRY_RUN: "true", DIS_ENABLE_WRITES: "" };
  const run = (extra) => spawnSync(process.execPath, [...base, ...extra], { env, encoding: "utf8" });

  let r = run(["--stage", "collect,select,template,validate"]);
  assert.equal(r.status, 0, r.stderr);
  const s = JSON.parse(r.stdout);
  assert.match(s.media.lp.stages.select, /Alpha Dental LP/);
  assert.equal(s.media.banner.stages.select.startsWith("selected"), true);
  assert.equal(s.media.web.status, "skipped"); // 低スコアのみ→スキップ
  assert.match(s.media.web.reason, /^最高スコアが閾値\d+未満$/);
  assert.equal(s.media.lp.stages.validate.ok, false); // テンプレのまま

  const sel = JSON.parse(await fs.readFile(path.join(tmp, "out/2026-11-07/lp/selection.json"), "utf8"));
  assert.ok(sel.evaluated.find((e) => e.brand === "Dup Brand LP").blockers.some((b) => b.startsWith("重複")));
  assert.ok(sel.evaluated.find((e) => e.brand === "Unknown Terms LP").blockers.includes("参照元の利用条件が未確認"));

  // 完成分析を置いて公開(ドライラン)
  const a = completeAnalysis(); a.disId = "DIS-LP-0001"; a.pageUrl = sel.selected.pageUrl; a.brand = sel.selected.brand;
  await fs.writeFile(path.join(await itemDirOf(tmp, "LP"), "analysis.json"), JSON.stringify(a));
  // 注釈データがないと公開できない
  r = run(["--stage", "validate,publish", "--media", "lp"]);
  assert.equal(JSON.parse(r.stdout).media.lp.stages.publish, "blocked: analysis not complete");
  await fs.writeFile(path.join(await itemDirOf(tmp, "LP"), "annotations.json"), JSON.stringify(completeAnnotations(a)));
  // 選定基準（13/18点）が未判定のままでは公開できない
  r = run(["--stage", "validate,publish", "--media", "lp"]);
  assert.match(JSON.parse(r.stdout).media.lp.stages.publish, /選定基準13\/18点が未判定/);
  // 評価: 12点（基準未達）→ スキップ、18点 → 選定されて公開計画へ
  assert.equal(run(["--stage", "review", "--media", "lp"]).status, 0);
  const lpDir = path.join(tmp, "out/2026-11-07/lp");
  const rv = JSON.parse(await fs.readFile(path.join(lpDir, "review/review.json"), "utf8"));
  const mine = rv.items.find((i) => i.pageUrl === sel.selected.pageUrl);
  await fs.writeFile(path.join(lpDir, "learning.json"), JSON.stringify({ items: [{ no: mine.no, criteria: crit(2), reason: "総合的に良い" }] }));
  r = run(["--stage", "rescore", "--media", "lp"]);
  assert.equal(JSON.parse(r.stdout).media.lp.status, "skipped"); // 基準未達はその媒体だけスキップ
  assert.match(JSON.parse(r.stdout).media.lp.stages.rescore, /基準未達/);
  await fs.writeFile(path.join(lpDir, "learning.json"), JSON.stringify({ items: [{ no: mine.no, criteria: crit(3), reason: "非常に明快" }] }));
  r = run(["--stage", "rescore", "--media", "lp"]);
  assert.match(JSON.parse(r.stdout).media.lp.stages.rescore, /18\/18点/);
  r = run(["--stage", "validate,publish", "--media", "lp"]);
  assert.equal(r.status, 0, r.stderr);
  const pub = JSON.parse(await fs.readFile(path.join(await itemDirOf(tmp, "LP"), "publish-result.json"), "utf8"));
  assert.equal(pub.dryRun, true);
  assert.ok(pub.dropboxFolder.includes("/99_Needs_Review/2026-11-07/dis-daily/DIS-LP-0001"));
  for (const f of ["03_Analysis/annotations.json", "03_Analysis/text-index.json", "03_Analysis/analysis.json", "03_Analysis/analysis.md"]) assert.ok(pub.dropboxPlan.some((p) => p.endsWith(f)), f);
  await assert.rejects(fs.access(ledger)); // 台帳は書かれない

  // --apply だけでは書込めない（DIS_ENABLE_WRITES/DRY_RUN不足）→ドライランのまま
  r = run(["--stage", "publish", "--media", "lp", "--apply"]);
  assert.equal(JSON.parse(r.stdout).mode, "DRY_RUN");

  // 再実行で選定結果が再利用される（冪等）
  r = run(["--stage", "collect,select", "--media", "lp"]);
  assert.equal(JSON.parse(r.stdout).media.lp.stages.select, "reused");
});

test("rdlp: カード/詳細パース（カテゴリ一覧は拾わない）", async () => {
  const list = '<a href="/lp-archive/taste/beige/">ベージュ系のLPデザイン3,682件</a><div class="lp-card lp-show-wrap"><div class="lp-card-img"><a href="/lp-archive/foo-lp/"><img src="/t.jpg" alt="Foo"></a></div><div class="lp-card-label"><a href="/lp-archive/foo-lp/">Foo LPタイトル</a></div><span class="company">Foo社</span><input name="post_id" value="123"></div>';
  const cards = extractRdlpCards(list, "https://rdlp.jp/lp-archive/");
  assert.deepEqual(cards.map((c) => [c.url, c.title, c.postId, c.company]), [["https://rdlp.jp/lp-archive/foo-lp/", "Foo LPタイトル", "123", "Foo社"]]);
  const d = parseRdlpDetail('<a class="url_check" href="https://foo.example/lp"><img src="/pc.png"></a>', "https://rdlp.jp/lp-archive/foo-lp/");
  assert.deepEqual([d.pageUrl, d.image], ["https://foo.example/lp", "https://rdlp.jp/pc.png"]);
  assert.equal((await loadConfig()).sources.find((x) => x.key === "rdlp").parser, "rdlp");
});

test("collectFromSource: getterで403は回避せずfetchError、成功時は候補化", async () => {
  const src = { media: "lp", key: "k", name: "K", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/lp/" };
  const blocked = { robots: async () => true, get: async () => ({ ok: false, status: 403, text: "" }) };
  const r1 = await collectFromSource(src, { getter: blocked });
  assert.match(r1[0].fetchError, /403/);
  const pages = { "https://s.example/": '<a href="/lp/a/">a</a>', "https://s.example/lp/a/": '<meta property="og:title" content="A LP"><a href="https://real.example/lp">x</a>' };
  const ok = { robots: async () => true, get: async (u) => ({ ok: true, status: 200, text: pages[u] }) };
  const r2 = await collectFromSource(src, { getter: ok });
  assert.deepEqual([r2[0].brand, r2[0].pageUrl], ["A LP", "https://real.example/lp"]);
});

test("chunkText: 全文を落とさず1900文字以内に分割／長い1行も分割", () => {
  const text = Array.from({ length: 400 }, (_, i) => `行${i} ${"あ".repeat(40)}`).join("\n") + "\n" + "い".repeat(5000);
  const chunks = chunkText(text);
  assert.ok(chunks.every((c) => c.length <= 1900));
  assert.equal(chunks.join("\n").replace(/\n/g, "").length, text.replace(/\n/g, "").length);
});

test("markdownToBlocks: 見出し・箇条書き・番号・表を変換し、全文を落とさない", () => {
  const md = ["# タイトル", "", "## 概要", "本文", "", "- 項目A", "1. 手順1", "| 軸 | 評価 | 確信度 | 根拠 | 未確認 |", "|---|---|---|---|---|", "| 配色 | 4 | medium | 根拠**太字** | なし |", "**最優先**: やること", "x".repeat(4000)].join("\n");
  const b = markdownToBlocks(md);
  const types = b.map((x) => x.type);
  assert.ok(!types.includes("heading_1")); // 先頭H1は省く
  assert.deepEqual(types.slice(0, 5), ["heading_2", "paragraph", "bulleted_list_item", "numbered_list_item", "bulleted_list_item"]);
  const text = b.map((x) => x[x.type].rich_text[0].text.content).join("\n");
  assert.ok(text.includes("配色（評価 4 ／ 確信度 medium）根拠: 根拠太字 ／ 未確認: なし"));
  assert.ok(!text.includes("**"));
  assert.equal(b.filter((x) => x.type === "paragraph").map((x) => x.paragraph.rich_text[0].text.content).join("").replace("本文", "").replace("最優先: やること", "").length, 4000);
  assert.ok(b.every((x) => x[x.type].rich_text[0].text.content.length <= 1900));
});

test("buildNotionBlocks: 実際の分析Markdownを全て変換できる", async () => {
  const a = JSON.parse(await fs.readFile(path.join(here, "../../candidates/dis/2026-11-07/DIS-LP-20261107.analysis.json"), "utf8"));
  const { analysisToMarkdown } = await import("./lib/analysis-schema.mjs");
  const b = buildNotionBlocks(a, analysisToMarkdown(a));
  assert.ok(b.length > 50);
  assert.ok(b.some((x) => x.type === "heading_2"));
  assert.ok(!b.some((x) => /^#{1,3} /.test(x[x.type].rich_text[0].text.content)));
});

test("extractDetailLinks: detailPathRegexでカテゴリ・ナビを除外", () => {
  const html = '<a href="/web/a/">a</a><a href="/web/">idx</a><a href="/category/lp/">c</a><a href="/about/">ab</a><a href="/web/b/">b</a>';
  assert.deepEqual(extractDetailLinks(html, { listUrl: "https://s.example/", detailPathRegex: "^/web/[^/]+/?$", detailPathIncludes: "/web/" }), ["https://s.example/web/a/", "https://s.example/web/b/"]);
  assert.deepEqual(extractDetailLinks('<a href="/about/">x</a><a href="/news/">n</a><a href="/works/z/">z</a>', { listUrl: "https://s.example/", detailPathIncludes: "/" }), ["https://s.example/works/z/"]);
});

test("interleaveBySource: 参照元を交互に並べ、5件枠が1つの参照元に偏らない", () => {
  const mk = (k, n) => Array.from({ length: n }, (_, i) => ({ sourceKey: k, pageUrl: `https://${k}${i}.example/` }));
  const out = interleaveBySource([...mk("a", 3), ...mk("b", 3), ...mk("c", 3)]);
  const k = out.slice(0, 5).map((c) => c.sourceKey);
  assert.deepEqual(new Set(k.slice(0, 3)), new Set(["a", "b", "c"])); // 先頭3件は3参照元が1件ずつ
  assert.deepEqual(k.slice(0, 3), k.slice(3, 6).length === 3 ? k.slice(0, 3) : k.slice(0, 3));
  assert.deepEqual(k.slice(3, 5), k.slice(0, 2)); // 2巡目も同じ順で1件ずつ
});

test("selectOne: 同点は日付で決定的にばらける（同じ日は同じ結果）", () => {
  const cands = Array.from({ length: 5 }, (_, i) => ({ brand: `b${i}`, pageUrl: `https://b${i}.example/`, termsStatus: "known", signals: { a: 0.7 } }));
  const run = (seed) => selectOne(cands, { weights: { a: 100 }, minScore: 1, dupCheck: () => ({ duplicate: false }), tieSeed: seed }).selected.brand;
  assert.equal(run("2026-11-07"), run("2026-11-07"));
  const days = new Set(Array.from({ length: 10 }, (_, i) => run(`2026-11-${10 + i}`)));
  assert.ok(days.size > 1);
  assert.equal(tieHash("x", "y"), tieHash("x", "y"));
});

test("interleaveBySource: 参照元の順序が日替わりで回り、15サイトでも枠が固定されない", () => {
  const cands = Array.from({ length: 15 }, (_, i) => ({ sourceKey: `s${i}`, pageUrl: `https://s${i}.example/` }));
  const first5 = (seed) => interleaveBySource(cands, seed).slice(0, 5).map((c) => c.sourceKey).join(",");
  assert.equal(first5("2026-11-07"), first5("2026-11-07"));
  const seen = new Set();
  for (let d = 10; d < 40; d++) first5(`2026-11-${d}`).split(",").forEach((k) => seen.add(k));
  assert.equal(seen.size, 15); // 30日間で全サイトが一度は枠に入る
});

test("run: 取得失敗は枠を消費せず、fetchFailuresに記録される", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-fail-"));
  const fx = { lp: [], banner: [], web: [
    { media: "web", sourceKey: "bad", sourceName: "Bad", termsStatus: "known", fetchError: "HTTP 403（回避しない）" },
    ...Array.from({ length: 6 }, (_, i) => ({ media: "web", sourceKey: `s${i}`, sourceName: "S", termsStatus: "known", brand: `W${i}`, pageUrl: `https://w${i}.example/`, sourceDetailUrl: `https://d.example/${i}`, signals: { learningValue: 0.9, freshness: 0.9, originalSource: 1, assetsAvailable: 1, rightsClarity: 0.9 } }))] };
  await fs.writeFile(path.join(tmp, "fx.json"), JSON.stringify(fx));
  const r = spawnSync(process.execPath, [path.join(here, "run.mjs"), "--fixture", path.join(tmp, "fx.json"), "--out", path.join(tmp, "out"), "--ledger", path.join(tmp, "l.json"), "--date", "2026-11-07", "--media", "web", "--stage", "collect,select"], { env: { ...process.env, DRY_RUN: "true" }, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const sel = JSON.parse(await fs.readFile(path.join(tmp, "out/2026-11-07/web/selection.json"), "utf8"));
  assert.equal(sel.fetchFailures.length, 1);
  assert.equal(sel.evaluated.filter((e) => e.inComparison).length, 5);
  assert.ok(sel.selected);
});

test("cleanTitle: エンティティ復元と「｜サイト名」除去", () => {
  assert.equal(cleanTitle("Baseline Design | I/O 3000 | Webデザインギャラリー"), "Baseline Design");
  assert.equal(cleanTitle("おせち先行予約販売_400 x 400 | バナー広場 | まとめ"), "おせち先行予約販売_400 x 400");
  assert.equal(cleanTitle("A &amp; B"), "A & B");
  assert.equal(cleanTitle("SONYのバナー｜Bannnner.com"), "SONYのバナー"); // 全角バーは前後に空白がなくても区切る
});

test("collectFromSource: 既知URLは詳細取得前に除外して次を使う／バナーは原典なしでも画像があれば候補／reportを返す", async () => {
  const src = { media: "banner", key: "k", name: "K", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/archives/" };
  const pages = { "https://s.example/": ["a", "b", "c", "d"].map((x) => `<a href="/archives/${x}/">x</a>`).join("") };
  for (const x of ["c", "d"]) pages[`https://s.example/archives/${x}/`] = `<meta property="og:title" content="Banner ${x} | K"><meta property="og:image" content="/i${x}.png">`;
  const fetched = [];
  const getter = { robots: async () => true, get: async (u) => { fetched.push(u); return { ok: true, status: 200, text: pages[u] || "" }; } };
  const known = new Set(["https://s.example/archives/a/", "https://s.example/archives/b/"]);
  const out = await collectFromSource(src, { getter, detailLimit: 2, isKnown: (u) => known.has(u) });
  assert.deepEqual(out.map((c) => c.brand), ["Banner c", "Banner d"]);
  assert.ok(!fetched.includes("https://s.example/archives/a/"));
  assert.ok(out.every((c) => c.originUnresolved && c.pageUrl === c.sourceDetailUrl));
  assert.deepEqual([out.report.linksFound, out.report.skippedKnown, out.report.fetched], [4, 2, 2]);
});

test("collectFromSource: 詳細リンク0件は理由つきでreportに残る", async () => {
  const src = { media: "web", key: "k", name: "K", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/x/" };
  const out = await collectFromSource(src, { getter: { robots: async () => true, get: async () => ({ ok: true, status: 200, text: "<html></html>" }) } });
  assert.equal(out.length, 0);
  assert.match(out.report.error, /URL形式/);
});

test("selectOne: 重複・取得失敗は比較枠を消費せず、その後ろの有効候補が5件まで比較される", () => {
  const mk = (i, extra = {}) => ({ brand: `b${i}`, pageUrl: `https://b${i}.example/`, termsStatus: "known", signals: { a: i === 7 ? 1 : 0.7 }, ...extra });
  const cands = [mk(0), mk(1), mk(2), mk(3, { fetchError: "403" }), mk(4), mk(5), mk(6), mk(7), mk(8)];
  const res = selectOne(cands, { weights: { a: 100 }, minScore: 1, maxCandidates: 5, dupCheck: (c) => ({ duplicate: ["b0", "b1"].includes(c.brand), reason: "url", of: "X" }) });
  assert.deepEqual(res.evaluated.filter((e) => e.inComparison).map((e) => e.brand), ["b2", "b4", "b5", "b6", "b7"]);
  assert.equal(res.selected.brand, "b7");
});

test("collect: サイト共通の外部リンク（一覧にも出るホスト／複数ページに共通）を実ページURLにしない", async () => {
  const src = { media: "web", key: "k", name: "K", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/w/" };
  const chrome = '<a href="https://operator.example/">op</a>';
  const pages = {
    "https://s.example/": '<a href="/w/a/">a</a><a href="/w/b/">b</a><a href="/w/c/">c</a>' + chrome,
    "https://s.example/w/a/": '<meta property="og:title" content="A">' + chrome + '<a href="https://real-a.example/">go</a>',
    "https://s.example/w/b/": '<meta property="og:title" content="B">' + chrome + '<a href="https://shared.example/">x</a>',
    "https://s.example/w/c/": '<meta property="og:title" content="C">' + chrome + '<a href="https://shared.example/">x</a>',
  };
  const getter = { robots: async () => true, get: async (u) => ({ ok: !!pages[u], status: pages[u] ? 200 : 404, text: pages[u] || "" }) };
  const out = await collectFromSource(src, { getter, detailLimit: 3 });
  assert.deepEqual(out.map((c) => c.pageUrl), ["https://real-a.example/", null, null]); // 共通のoperator/sharedは外れ、Aは実サイトが残る
  assert.ok(outboundHosts(pages["https://s.example/"], "https://s.example/").has("operator.example"));
});

test("collect(banner): 共通リンクを外した後、画像があれば掲載元ページを実ページにして原典未確認と記録", async () => {
  const src = { media: "banner", key: "k", name: "K", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/b/" };
  const pages = { "https://s.example/": '<a href="/b/1/">1</a><a href="/b/2/">2</a>',
    "https://s.example/b/1/": '<meta property="og:title" content="B1"><meta property="og:image" content="/1.png"><a href="https://ops.example/">o</a>',
    "https://s.example/b/2/": '<meta property="og:title" content="B2"><meta property="og:image" content="/2.png"><a href="https://ops.example/">o</a>' };
  const getter = { robots: async () => true, get: async (u) => ({ ok: !!pages[u], status: 200, text: pages[u] || "" }) };
  const out = await collectFromSource(src, { getter, detailLimit: 2 });
  assert.ok(out.every((c) => c.originUnresolved && c.pageUrl === c.sourceDetailUrl));
});

test("looksLikeNonWork: トップ・一覧・問い合わせ・サイト名だけのタイトルは作品ではない", () => {
  const src = { name: "KASOU" };
  for (const bad of ["Webデザイン一覧（All Web Designs）", "Webサイト制作のご依頼・ご相談", "Webデザインを「探す」ならKASOU", "One Page Website Inspiration", "掲載制作会社一覧"]) assert.equal(looksLikeNonWork(bad, src, ""), true, bad);
  assert.equal(looksLikeNonWork("イケサイ WEBデザイナーのポータルサイト", { name: "IKESAI" }, ""), true);
  assert.equal(looksLikeNonWork("Home", { name: "X" }, "Home"), true);
  for (const good of ["Baseline Design", "MOGUTA", "Justin Jefferson - Awwwards SOTD", "FREDRIK ONLINE STORE"]) assert.equal(looksLikeNonWork(good, { name: "Awwwards" }, "Awwwards"), false, good);
});

test("isSponsoredUrl: ref= / utm_ 付きは広告・提携とみなす", () => {
  assert.equal(isSponsoredUrl("https://www.moving.parts/?ref=lapaninja"), true);
  assert.equal(isSponsoredUrl("https://a.example/?utm_source=x"), true);
  assert.equal(isSponsoredUrl("https://a.example/page?id=3"), false);
});

test("probe: 内部リンクのパターン集約と外部リンクの要約", async () => {
  const { summarizeListLinks, summarizeOutbound } = await import("./probe.mjs");
  const html = '<a href="/works/a/">1</a><a href="/works/b/">2</a><a href="/works/c/">3</a><a href="/about/">x</a><a href="https://other.example/">o</a>';
  const g = summarizeListLinks(html, "https://s.example/");
  assert.equal(g[0].pattern, "/works/*/");
  assert.equal(g[0].count, 3);
  const o = summarizeOutbound('<a class="visit" href="https://real.example/x?ref=a"><span>Visit site</span></a><a href="/in">i</a>', "https://s.example/w/1/");
  assert.deepEqual([o[0].host, o[0].text, o[0].class, o[0].query], ["real.example", "Visit site", "visit", "query付き"]);
});

test("collect: 言語トップ(/en/)や自サイト名入りのリンクは候補にしない", async () => {
  assert.deepEqual(extractDetailLinks('<a href="/en/">en</a><a href="/archives/1/">x</a>', { listUrl: "https://s.example/", detailPathIncludes: "/" }), ["https://s.example/archives/1/"]);
  assert.equal(looksLikeNonWork("Blue Landing Pages: 1179 Design Examples", { name: "Lapa Ninja" }, ""), true);
  const src = { media: "web", key: "lapaninja", name: "Lapa Ninja", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/p/" };
  const pages = { "https://s.example/": '<a href="/p/a/">a</a>', "https://s.example/p/a/": '<meta property="og:title" content="Real Work"><a href="https://try.webflow.com/lapaninja">ad</a><a href="https://real.example/">go</a>' };
  const out = await collectFromSource(src, { getter: { robots: async () => true, get: async (u) => ({ ok: !!pages[u], status: 200, text: pages[u] || "" }) } });
  assert.equal(out[0].pageUrl, "https://real.example/");
});

test("looksLikeNonWork: 運営者メッセージ・規約系ページも作品ではない", () => {
  for (const bad of ["運営者の想い| Webデザインギャラリー・参考サイト集・アワード", "利用規約", "広告掲載について"]) assert.equal(looksLikeNonWork(bad, { name: "MUUUUU.ORG" }, ""), true, bad);
  assert.equal(looksLikeNonWork("Baseline Design", { name: "I/O 3000" }, ""), false);
});

test("downloadBanner: 中身で形式判定（拡張子が違ってもOK）／画像でないデータは保存せず理由つきで失敗", async () => {
  const { downloadBanner, sniffImage } = await import("./lib/capture.mjs");
  const sharp = (await import("sharp")).default;
  const webp = await sharp({ create: { width: 50, height: 30, channels: 3, background: "#09f" } }).webp().toBuffer();
  const mk = (buf, type) => async () => ({ ok: true, status: 200, headers: { get: () => type }, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) });
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-bn-"));
  assert.equal(sniffImage(webp), "webp");
  const files = await downloadBanner("https://x.example/banner.png", tmp, mk(webp, "image/webp")); // 拡張子はpngだが中身はwebp
  assert.equal(files[0].rel, "01_Normal_Images/banner.webp");
  await fs.access(path.join(tmp, "02_Notion_Images/banner_notion.jpg"));
  const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), "dis-bn2-"));
  await assert.rejects(downloadBanner("https://x.example/b.png", tmp2, mk(Buffer.from("<html>blocked</html>"), "text/html")), /画像として読めない/);
  await assert.rejects(fs.access(path.join(tmp2, "01_Normal_Images/banner.png"))); // 保存されない
});

test("parseDetail/pickBannerImage: og:imageが無いときページ自身を画像にしない／ロゴ等を除いて本文画像を選ぶ", () => {
  const page = "https://s.example/banner_1/";
  const d = parseDetail('<meta property="og:title" content="T"><img src="/img/logo.png"><img src="/wp-content/uploads/2026/11/ad.png">', page);
  assert.equal(d.image, "https://s.example/wp-content/uploads/2026/11/ad.png");
  assert.equal(parseDetail('<meta property="og:title" content="T">', page).image, null); // 以前はページ自身のURLになっていた
  assert.equal(parseDetail('<meta property="og:image" content="' + page + '">', page).image, null); // og:imageがページ自身でも画像にしない
  assert.equal(pickBannerImage('<img src="/a-150x150.jpg"><img data-src="/real.webp">', page), "https://s.example/real.webp");
});

test("buildNotionProps: 列の型に合わせて組み立て、無い列・型違い・選択肢にない値は省く（理由を残す）", () => {
  const schema = {
    "タイトル": { type: "title" }, "公式サイトURL": { type: "url" }, "ドメイン": { type: "rich_text" },
    "参照元": { type: "select", select: { options: [{ name: "その他" }] } },
    "PC/SP": { type: "multi_select", multi_select: { options: [{ name: "PC" }, { name: "SP" }] } },
    "権利区分": { type: "multi_select", multi_select: { options: [{ name: "reference_only" }] } },
    "バナー画像": { type: "files" },
    "ステータス": { type: "select", select: { options: [{ name: "候補" }] } },
  };
  const map = { "タイトル": "title", "公式サイトURL": "pageUrl", "ドメイン": "domain", "参照元": "=その他", "PC/SP": ["PC", "SP"], "権利区分": ["reference_only", "unknown_x"], "ステータス": "=レビュー待ち", "存在しない列": "title", "バナー画像": "title" };
  const skipped = [];
  const p = buildNotionProps(schema, { title: "T", pageUrl: "https://a.example/", domain: "a.example" }, map, {}, skipped);
  assert.deepEqual(Object.keys(p).sort(), ["PC/SP", "ドメイン", "タイトル", "公式サイトURL", "参照元", "権利区分"].sort());
  assert.deepEqual(p["PC/SP"].multi_select.map((x) => x.name), ["PC", "SP"]);
  assert.deepEqual(p["権利区分"].multi_select.map((x) => x.name), ["reference_only"]); // 選択肢にない値は省く
  assert.ok(skipped.some((s) => s.col === "存在しない列") && skipped.some((s) => s.col === "ステータス") && skipped.some((s) => s.col === "バナー画像"));
  assert.equal(resolveSpec("=x", {}), "x");
});

test("buildNotionProps: analysis.notionProps（extra）も列の型・選択肢で検証される", () => {
  const schema = { "タイトル": { type: "title" }, "主要CTA": { type: "rich_text" }, "構成タイプ": { type: "multi_select", multi_select: { options: [{ name: "サービス理解型" }] } } };
  const p = buildNotionProps(schema, { title: "T" }, { "タイトル": "title" }, { "主要CTA": "Send", "構成タイプ": ["サービス理解型", "なし"] });
  assert.equal(p["主要CTA"].rich_text[0].text.content, "Send");
  assert.deepEqual(p["構成タイプ"].multi_select.map((x) => x.name), ["サービス理解型"]);
});

test("config: バナー・Webの登録先の列マップが、実在する列名を使っている", async () => {
  const cfg = await loadConfig();
  assert.equal(cfg.media.web.notion.propertyMap["公式サイトURL"], "pageUrl");
  assert.deepEqual(cfg.media.web.notion.urlProps, ["公式サイトURL"]);
  assert.equal(cfg.media.banner.notion.fileProp, "バナー画像");
  assert.equal(cfg.media.banner.notion.propertyMap["掲載元URL"], "detailUrl");
});

test("config: 取得できない参照元は enabled:false と理由つきで無効化されている", async () => {
  const cfg = await loadConfig();
  const off = cfg.sources.filter((s) => s.enabled === false).map((s) => s.key).sort();
  assert.deepEqual(off, ["awwwards", "cssda", "landbook", "lapaninja", "lp-advance", "lp-kanji", "onepagelove", "sankou-lp", "sankou-web", "siteinspire", "wdc-lp"]);
  // 運用方針: LPはrdlpのみ。Webは日本のサイトのみ（海外は無効）
  assert.deepEqual(cfg.sources.filter((s) => s.enabled !== false && s.media === "lp").map((s) => s.key), ["rdlp"]);
  assert.ok(cfg.sources.filter((s) => s.enabled === false).every((s) => s.disabledReason));
});

test("buildContactSheet: 番号付き一覧画像を作り、画像が取れない候補は空欄＋理由", async () => {
  const { buildContactSheet } = await import("./lib/review.mjs");
  const sharp = (await import("sharp")).default;
  const png = await sharp({ create: { width: 400, height: 300, channels: 3, background: "#09f" } }).png().toBuffer();
  const fetchImpl = async (u) => u.endsWith("ok.png")
    ? { ok: true, status: 200, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) }
    : u.endsWith("html") ? { ok: true, status: 200, arrayBuffer: async () => Buffer.from("<html>").buffer } : { ok: false, status: 404 };
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-rev-"));
  const out = path.join(tmp, "sheet.jpg");
  const res = await buildContactSheet([{ imageUrl: "https://a.example/ok.png" }, { imageUrl: "https://a.example/missing.png" }, { imageUrl: "https://a.example/html" }, { imageUrl: null }], out, { fetchImpl });
  assert.deepEqual(res.map((r) => r.image), ["あり", "なし（HTTP 404）", "なし（画像として読めない）", "なし（画像URLなし）"]);
  const meta = await sharp(out).metadata();
  assert.equal(meta.width, 10 + 3 * 370); // 3列
  assert.equal(meta.height, 10 + 2 * 250); // 4件＝2行
});

const crit = (n) => ({ clarity: n, uniqueness: n, reproducibility: n, practicality: n, materials: n, sourcing: n });
test("applyLearning: 6項目×0〜3点の合計を反映し、欠け・範囲外・理由なし・未知の候補は拒否", async () => {
  const { applyLearning } = await import("./lib/review.mjs");
  const cands = [{ pageUrl: "https://a.example/", signals: { learningValue: 0.5 } }, { pageUrl: "https://b.example/", signals: { learningValue: 0.5 } }];
  const review = [{ no: 1, pageUrl: "https://a.example/" }, { no: 2, pageUrl: "https://b.example/" }];
  const r = applyLearning(cands, { items: [{ no: 1, criteria: { ...crit(2), clarity: 3 }, reason: "構成が明快" }, { pageUrl: "https://b.example/", criteria: crit(1), reason: "既存と似る" }] }, review);
  assert.equal(r.applied, 2); assert.deepEqual(r.errors, []);
  assert.deepEqual([cands[0].reviewTotal, cands[1].reviewTotal, cands[0].reviewReason], [13, 6, "構成が明快"]);
  assert.equal(cands[0].signals.learningValue, 13 / 18);
  const bad = applyLearning(cands, { items: [{ no: 1, criteria: { ...crit(2), clarity: 4 }, reason: "x" }, { no: 2, criteria: crit(2), reason: "" }, { no: 9, criteria: crit(2), reason: "x" }, { no: 1, criteria: { clarity: 2 }, reason: "x" }, { no: 2, learningValue: 0.9, reason: "x" }] }, review);
  assert.equal(bad.applied, 0); assert.equal(bad.errors.length, 5);
});

test("suggestCriteria: 資料の十分さ・出典の健全さの目安", async () => {
  const { suggestCriteria } = await import("./lib/review.mjs");
  assert.deepEqual(suggestCriteria({ pageUrl: "https://a/", termsStatus: "known" }, "web"), { materials: 3, sourcing: 3 });
  assert.deepEqual(suggestCriteria({ pageUrl: "https://d/", originUnresolved: true, imageUrl: "https://i/", termsStatus: "known" }, "banner"), { materials: 3, sourcing: 1 });
  assert.deepEqual(suggestCriteria({ pageUrl: "https://d/", originUnresolved: true }, "banner"), { materials: 0, sourcing: 2 });
});

test("selectOne: 選定基準13/18点。評価済みで基準未達は選ばれず、reviewedOnlyでは評価なしも対象外（基準未達でスキップ）", () => {
  const w = { learningValue: 40 };
  const mk = (n, total) => ({ brand: `b${n}`, pageUrl: `https://b${n}.example/`, termsStatus: "known", signals: { learningValue: 0.5 }, ...(total == null ? {} : { reviewReason: "評価", reviewTotal: total }) });
  const common = { weights: w, minScore: 0, passScore: 13, dupCheck: () => ({ duplicate: false }) };
  assert.equal(selectOne([mk(1, 12), mk(2, 13), mk(3, 16)], common).selected.brand, "b3");
  assert.equal(selectOne([mk(1, 12), mk(2, 12)], { ...common, reviewedOnly: true }).selected, null);
  assert.match(selectOne([mk(1, 12), mk(2, null)], { ...common, reviewedOnly: true }).skippedReason, /基準未達/);
  assert.equal(selectOne([mk(1, 13), mk(2, null)], { ...common, reviewedOnly: true }).selected.brand, "b1");
});

test("E2E: review→learning.json→rescore で学習価値の高い候補に選定が切り替わる（公開済みは拒否）", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-resc-"));
  const sig = { learningValue: 0.5, freshness: 0.7, originalSource: 1, assetsAvailable: 0.3, rightsClarity: 0.5 };
  const mk = (n) => ({ media: "web", sourceKey: `s${n}`, sourceName: "S", termsStatus: "known", brand: `W${n}`, pageUrl: `https://w${n}.example/`, sourceDetailUrl: `https://d.example/${n}`, signals: { ...sig } });
  await fs.writeFile(path.join(tmp, "fx.json"), JSON.stringify({ lp: [], banner: [], web: [1, 2, 3, 4].map(mk) }));
  const run = (extra) => spawnSync(process.execPath, [path.join(here, "run.mjs"), "--fixture", path.join(tmp, "fx.json"), "--out", path.join(tmp, "out"), "--ledger", path.join(tmp, "l.json"), "--date", "2026-11-07", "--media", "web", ...extra], { env: { ...process.env, DRY_RUN: "true" }, encoding: "utf8" });
  let r = run(["--stage", "collect,select,review"]);
  assert.equal(r.status, 0, r.stderr);
  const dir = path.join(tmp, "out/2026-11-07/web");
  const review = JSON.parse(await fs.readFile(path.join(dir, "review/review.json"), "utf8"));
  assert.equal(review.items.length, 4);
  await fs.access(path.join(dir, "review/contact_sheet.jpg"));
  const before = JSON.parse(await fs.readFile(path.join(dir, "selection.json"), "utf8")).selected.brand;
  const target = review.items.find((i) => i.brand !== before); // 現在の選定とは別の候補を高評価にする
  await fs.writeFile(path.join(dir, "learning.json"), JSON.stringify({ items: [{ no: target.no, criteria: crit(3), reason: "構成が最も明快" }] }));
  r = run(["--stage", "rescore"]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(await fs.readFile(path.join(dir, "selection.json"), "utf8"));
  assert.equal(after.selected.brand, target.brand);
  assert.equal(after.selected.reviewReason, "構成が最も明快");
  assert.equal(after.selected.reviewTotal, 18);
  // 誤ったlearning.jsonは拒否
  await fs.writeFile(path.join(dir, "learning.json"), JSON.stringify({ items: [{ no: 1, learningValue: 2, reason: "x" }] })); // criteria なしは拒否
  assert.notEqual(run(["--stage", "rescore"]).status, 0);
});

test("collect: 候補の画像が参照元自身のog:imageと同じなら、サイト共通の画像として作品扱いしない", async () => {
  const src = { media: "web", key: "k", name: "Gallery Site", termsStatus: "known", listUrl: "https://s.example/", detailPathIncludes: "/w/" };
  const pages = {
    "https://s.example/": '<meta property="og:image" content="/site-ogp.png"><a href="/w/about/">a</a><a href="/w/work1/">w</a>',
    "https://s.example/w/about/": '<meta property="og:title" content="Our mission story"><meta property="og:image" content="/site-ogp.png"><a href="https://x.example/">x</a>',
    "https://s.example/w/work1/": '<meta property="og:title" content="Work One"><meta property="og:image" content="/work1.png"><a href="https://work1.example/">go</a>',
  };
  const getter = { robots: async () => true, get: async (u) => ({ ok: !!pages[u], status: pages[u] ? 200 : 404, text: pages[u] || "" }) };
  const out = await collectFromSource(src, { getter });
  assert.deepEqual(out.map((c) => c.brand), ["Work One"]);
  assert.equal(out.report.skippedNonWork, 1);
});

test("prepSummary: 媒体ごとの件数・スキップ理由を1行にまとめる", async () => {
  const { prepSummary } = await import("./prep-summary.mjs");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-sum-"));
  const put = async (m, files) => { for (const [f, data] of Object.entries(files)) { const p = path.join(tmp, "2026-11-08", m, f); await fs.mkdir(path.dirname(p), { recursive: true }); await fs.writeFile(p, JSON.stringify(data)); } };
  await put("lp", { "selection.json": { selected: null, skippedReason: "候補なし" } });
  await put("banner", { "selection.json": { selected: { brand: "B" } }, "review/review.json": { items: [1, 2, 3] } });
  assert.equal(await prepSummary(tmp, "2026-11-08"), "LP スキップ（候補なし） / バナー 3件 / Web 未実行/失敗");
});

test("daily-prep.sh: 書き込み系の環境変数を外し(DRY_RUN=true)、ログを残し、失敗は非0で返す", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-prep-"));
  const repo = path.resolve(here, "../..");
  const base = { ...process.env, DIS_NOTIFY: "0", DIS_ENABLE_WRITES: "true", DRY_RUN: "false" };
  // 子プロセス側で環境を出力するコマンドに差し替え
  const ok = spawnSync("bash", [path.join(here, "daily-prep.sh")], { env: { ...base, DIS_RUN_CMD: 'echo "W=${DIS_ENABLE_WRITES:-unset} D=$DRY_RUN"' }, encoding: "utf8" });
  assert.equal(ok.status, 0, ok.stderr);
  const date = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const logFile = path.join(repo, "outputs/dis/logs", `prep-${date}.log`);
  const log = await fs.readFile(logFile, "utf8");
  assert.match(log, /W=unset D=true/);
  assert.match(log, /終了コード 0/);
  const ng = spawnSync("bash", [path.join(here, "daily-prep.sh")], { env: { ...base, DIS_RUN_CMD: "exit 7" }, encoding: "utf8" });
  assert.equal(ng.status, 7);
  assert.match(await fs.readFile(logFile, "utf8"), /終了コード 7/);
  await fs.rm(logFile, { force: true });
});

test("シェルスクリプト: 変数の直後に日本語を置かない（macOSのBash 3.2は日本語を変数名に含めてしまう）", async () => {
  for (const f of ["daily-prep.sh", "install-schedule.sh"]) {
    const src = await fs.readFile(path.join(here, f), "utf8");
    const bad = src.split("\n").map((l, i) => [i + 1, l]).filter(([, l]) => /\$[A-Za-z_][A-Za-z0-9_]*[^\x00-\x7F]/.test(l.replace(/\$\{[^}]*\}/g, "")));
    assert.deepEqual(bad, [], `${f}: ${JSON.stringify(bad)}`);
  }
});

test("tileFit: 縦長は上端(north)を切り出し、横長・通常は全体を余白つきで収める（バナーの中央切り抜きを防ぐ）", async () => {
  const { tileFit } = await import("./lib/review.mjs");
  assert.deepEqual(tileFit({ width: 400, height: 3000 }), { fit: "cover", position: "north" });
  assert.equal(tileFit({ width: 728, height: 90 }).fit, "contain"); // 横長バナー
  assert.equal(tileFit({ width: 300, height: 250 }).fit, "contain");
  const sharp = (await import("sharp")).default;
  const { buildContactSheet } = await import("./lib/review.mjs");
  // 縦長: 上100pxが赤、残りが青 → 切り出し後の左上付近（バッジの外）は赤であること
  const tall = await sharp({ create: { width: 200, height: 1000, channels: 3, background: "#00f" } }).composite([{ input: await sharp({ create: { width: 200, height: 100, channels: 3, background: "#f00" } }).png().toBuffer(), left: 0, top: 0 }]).png().toBuffer();
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-fit-"));
  const out = path.join(tmp, "s.jpg");
  await buildContactSheet([{ imageUrl: "https://x/tall" }], out, { fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => tall.buffer.slice(tall.byteOffset, tall.byteOffset + tall.byteLength) }) });
  const { data } = await sharp(out).extract({ left: 10 + 180, top: 10 + 10, width: 1, height: 1 }).raw().toBuffer({ resolveWithObject: true });
  assert.ok(data[0] > 180 && data[2] < 80, `RGB=${[...data]}`); // 赤
});

test("selectOne: 評価済みの候補は、機械的なスコアが低くても評価の高い順に選ばれ、閾値も免除される", () => {
  const w = { learningValue: 40, assetsAvailable: 15, freshness: 15 };
  const mk = (n, lv, assets, reviewed) => ({ brand: `b${n}`, pageUrl: `https://b${n}.example/`, termsStatus: "known", signals: { learningValue: lv, assetsAvailable: assets, freshness: 0.7 }, ...(reviewed ? { reviewReason: "評価" } : {}) });
  // b1: 評価0.8だが画像なし(スコア低)、b2: 評価0.7で画像あり(スコア高)
  const res = selectOne([mk(2, 0.7, 1, true), mk(1, 0.8, 0.3, true), mk(3, 0.5, 1, false)], { weights: w, minScore: 60, dupCheck: () => ({ duplicate: false }) });
  assert.equal(res.selected.brand, "b1");
  const b1 = res.evaluated.find((e) => e.brand === "b1");
  assert.ok(b1.score < 60); // 閾値未満でも評価済みなので選ばれる
  // 評価のない候補しかなければ、従来どおり閾値で足切り
  assert.equal(selectOne([mk(4, 0.5, 0.3, false)], { weights: w, minScore: 60, dupCheck: () => ({ duplicate: false }) }).selected, null);
  // 重複は、評価が高くても除外
  assert.equal(selectOne([mk(5, 1, 1, true)], { weights: w, minScore: 0, dupCheck: () => ({ duplicate: true, reason: "url", of: "X" }) }).selected, null);
});

test("validate: 分析のdisId・pageUrlは選定結果で上書きされ、brand=AUTOは選定のブランド名になる", async () => {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-auto-"));
  const sig = { learningValue: 0.9, freshness: 0.9, originalSource: 1, assetsAvailable: 1, rightsClarity: 0.9 };
  await fs.writeFile(path.join(tmp, "fx.json"), JSON.stringify({ lp: [], banner: [], web: [{ media: "web", sourceKey: "s", sourceName: "S", termsStatus: "known", brand: "Real Brand", pageUrl: "https://real.example/", sourceDetailUrl: "https://d.example/1", signals: sig }] }));
  const run = (extra) => spawnSync(process.execPath, [path.join(here, "run.mjs"), "--fixture", path.join(tmp, "fx.json"), "--out", path.join(tmp, "out"), "--ledger", path.join(tmp, "l.json"), "--date", "2026-11-09", "--media", "web", ...extra], { env: { ...process.env, DRY_RUN: "true" }, encoding: "utf8" });
  assert.equal(run(["--stage", "collect,select,template"]).status, 0); // 採番はテンプレート作成時
  const a = completeAnalysis(); a.media = "web"; a.disId = "WRONG"; a.pageUrl = "https://wrong.example/"; a.brand = "AUTO";
  const f = path.join(await itemDirOf(tmp, "ウェブ"), "analysis.json");
  await fs.writeFile(f, JSON.stringify(a));
  const r = run(["--stage", "validate"]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(await fs.readFile(f, "utf8"));
  assert.deepEqual([after.disId, after.pageUrl, after.brand], ["DIS-WB-0001", "https://real.example/", "Real Brand"]);
});

test("config: 参照元URLは原本レジストリに一致（BANNER LIBRARY・Banner Matome・GDWEB・IKESAI）", async () => {
  const cfg = await loadConfig();
  const url = (k) => cfg.sources.find((s) => s.key === k).listUrl;
  assert.equal(url("banner-library"), "https://design-library.jp/");
  assert.equal(url("banner-matome"), "http://bannermatome.com/");
  assert.equal(url("gdweb"), "https://www.gdweb.co.jp/");
  assert.equal(url("ikesai"), "https://www.ikesai.com/");
});

test("capture: SPの撮影幅は375px（原本のLP取り込み手順）", async () => {
  const src = await fs.readFile(path.join(here, "lib/capture.mjs"), "utf8");
  assert.ok(src.includes('["sp", { width: 375'));
});

test("captureFullPage + checkAssetSet: 原本の形（01_Normal_Images／02_Notion_Images、6＋4枚、幅・サイズ基準）で撮影でき、スマホ用設定のないページでもSPは375px幅になる", async () => {
  const http = await import("node:http");
  const { captureFullPage } = await import("./lib/capture.mjs");
  const { checkAssetSet } = await import("./lib/asset-check.mjs");
  const html = '<!doctype html><meta charset=utf-8><style>body{margin:0;font:40px sans-serif}section{height:1100px;display:flex;align-items:center;justify-content:center}</style>' + ["#e84", "#4a8", "#48e"].map((c, i) => `<section style="background:${c}">S${i}</section>`).join("");
  const server = http.createServer((q, r) => { r.setHeader("content-type", "text/html; charset=utf-8"); r.end(html); });
  await new Promise((res) => server.listen(0, "127.0.0.1", res));
  try {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-cap-"));
    const id = "DIS-WB-20261109";
    const files = await captureFullPage(`http://127.0.0.1:${server.address().port}/`, tmp, { id });
    const rels = files.map((f) => f.rel);
    for (const k of ["PC_full", "PC_first_view", "PC_sections", "SP_full", "SP_first_view", "SP_sections"]) assert.ok(rels.includes(`01_Normal_Images/${id}_${k}.png`), k);
    for (const k of ["PC_first_view", "PC_sections", "SP_first_view", "SP_sections"]) assert.ok(rels.includes(`02_Notion_Images/${id}_${k}_notion.jpg`), k);
    assert.ok(rels.some((r) => /^01_Normal_Images\/sections\/pc_01\.jpg$/.test(r)) && rels.some((r) => /^01_Normal_Images\/sections\/sp_01\.jpg$/.test(r)));
    assert.ok(files.warnings.some((w) => w.includes("再撮影"))); // スマホ用の設定がなく980px幅になったため
    assert.deepEqual(await checkAssetSet(tmp, { id, media: "web" }), { ok: true, errors: [], warnings: [] });
    await fs.rm(path.join(tmp, `01_Normal_Images/${id}_SP_first_view.png`)); // 欠けを検出できること
    const ng = await checkAssetSet(tmp, { id, media: "web" });
    assert.equal(ng.ok, false); assert.match(ng.errors[0], /SP_first_view/);
  } finally { server.close(); }
});

test("checkAssetSet(banner): 原本とNotion用JPEGが必要", async () => {
  const { checkAssetSet } = await import("./lib/asset-check.mjs");
  const sharp = (await import("sharp")).default;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-bn-chk-"));
  assert.equal((await checkAssetSet(tmp, { id: "X", media: "banner" })).ok, false);
  await fs.mkdir(path.join(tmp, "01_Normal_Images")); await fs.mkdir(path.join(tmp, "02_Notion_Images"));
  const img = await sharp({ create: { width: 300, height: 250, channels: 3, background: "#f00" } });
  await img.clone().png().toFile(path.join(tmp, "01_Normal_Images/banner.png"));
  await img.clone().jpeg().toFile(path.join(tmp, "02_Notion_Images/banner_notion.jpg"));
  assert.equal((await checkAssetSet(tmp, { id: "X", media: "banner" })).ok, true);
});

test("toNotionJpeg: 約720px幅（拡大しない）・5MB未満", async () => {
  const { toNotionJpeg } = await import("./lib/capture.mjs");
  const sharp = (await import("sharp")).default;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-nj-"));
  await sharp({ create: { width: 1440, height: 3000, channels: 3, background: "#369" } }).png().toFile(path.join(tmp, "a.png"));
  await toNotionJpeg(path.join(tmp, "a.png"), path.join(tmp, "a.jpg"));
  const m = await sharp(path.join(tmp, "a.jpg")).metadata();
  assert.equal(m.width, 720);
  await sharp({ create: { width: 375, height: 800, channels: 3, background: "#369" } }).png().toFile(path.join(tmp, "b.png"));
  await toNotionJpeg(path.join(tmp, "b.png"), path.join(tmp, "b.jpg"));
  assert.equal((await sharp(path.join(tmp, "b.jpg")).metadata()).width, 375);
  assert.ok((await fs.stat(path.join(tmp, "a.jpg"))).size < 5 * 1024 * 1024);
});

test("migrate v1→v2: 登録済み6件が、原本の9軸・注釈・検証を満たす形に移行できる（旧分析は変更しない）", async () => {
  const { migrate, bboxFromRef } = await import("./migrate-v1-to-v2.mjs");
  const root = path.resolve(here, "../..");
  const overlays = JSON.parse(await fs.readFile(path.join(here, "migration/overlays.json"), "utf8"));
  assert.equal(Object.keys(overlays).length, 6);
  for (const [id, ov] of Object.entries(overlays)) {
    const date = id.endsWith("20261107") ? "2026-11-07" : "2026-11-08";
    const v1 = JSON.parse(await fs.readFile(path.join(root, "candidates/dis", date, `${id}.analysis.json`), "utf8"));
    const before = JSON.stringify(v1);
    const { v2, annotations } = migrate(v1, ov, { now: new Date("2026-11-09T00:00:00Z") });
    assert.deepEqual(validateAnalysis(v2).errors, [], id);
    assert.deepEqual(validateAnnotations(annotations, v2).errors, [], id);
    assert.equal(JSON.stringify(v1), before); // 旧分析は変更しない
    assert.equal(v2.units.length, v1.units.length);
    assert.deepEqual(v2.axes.map((x) => x.key), AXIS_KEYS);
    assert.ok(v2.axes.every((x) => x.score <= 5));
    // 統合した「配色・可読性」は、旧2軸の平均の切り捨て
    const o = (n) => v1.axes.find((x) => x.axis === n).score;
    assert.equal(v2.axes.find((x) => x.key === "color_legibility").score, Math.floor((o("配色") + o("タイポグラフィ")) / 2));
    // 保存済みの出力が、最新の移行結果と一致している
    const saved = JSON.parse(await fs.readFile(path.join(root, "candidates/dis", date, `${id}.v2.analysis.json`), "utf8"));
    assert.deepEqual(saved.axes, v2.axes);
  }
  assert.deepEqual(bboxFromRef("pc_02 下部〜pc_03 上部"), { image: "pc_02.jpg", bbox: { x: 0, y: 0.6, w: 1, h: 0.4 } });
  assert.deepEqual(bboxFromRef("PC pc_01 最上部／SP sp_01 最上部").bbox, { x: 0, y: 0, w: 1, h: 0.15 });
  assert.equal(bboxFromRef("PC 後半（ピンクのパネル）"), null);
});

test("supplement: 台帳の実URL・IDで検証し、既存を触らず新規サブフォルダ向けの4ファイルを作る／書込みは三重ガード", async () => {
  const { buildSupplement, SUBDIR } = await import("./supplement.mjs");
  const root = path.resolve(here, "../..");
  const ledger = JSON.parse(await fs.readFile(path.join(root, "data/dis-ledger.json"), "utf8"));
  const legacy = ledger.entries.filter((e) => /-\d{8}$/.test(e.disId)); // v2ファイルがあるのは、旧形式（日付ID）の登録済み6件
  assert.equal(legacy.length, 6);
  for (const e of legacy) {
    const base = path.join(root, "candidates/dis", e.date, e.disId);
    const a = JSON.parse(await fs.readFile(`${base}.v2.analysis.json`, "utf8"));
    const n = JSON.parse(await fs.readFile(`${base}.v2.annotations.json`, "utf8"));
    const s = buildSupplement(e, a, n);
    assert.deepEqual(s.errors, [], e.disId);
    assert.equal(s.files.length, 4);
    assert.equal(JSON.parse(s.files[0].body).pageUrl, e.pageUrl);
    assert.ok(s.remoteDir.startsWith(e.dropbox.folder + "/") && s.remoteDir.endsWith(SUBDIR));
    assert.ok(!e.dropbox.uploaded.some((u) => u.startsWith(s.remoteDir))); // 既存ファイルと衝突しない
  }
  const r = spawnSync("node", [path.join(here, "supplement.mjs"), "--apply"], { env: { ...process.env, DRY_RUN: "true", DIS_ENABLE_WRITES: "" }, encoding: "utf8" });
  assert.match(r.stdout, /ドライラン/);
});

test("probe-all: 見える／要調整／見えない（403・robots禁止・通信エラー）を判定し、回避しない", async () => {
  const { probeSource, formatTable } = await import("./probe-all.mjs");
  const mk = (map, robots = true) => ({ robots: async () => robots, get: async (u) => { const r = map[u]; if (r instanceof Error) throw r; return r || { ok: false, status: 404, text: "" }; } });
  const src = { key: "x", media: "web", listUrl: "https://ex.test/list/", detailPathRegex: "^/work/" };
  const html = '<a href="/work/a1/">a</a><a href="/work/a2/">b</a>';
  assert.equal((await probeSource(src, mk({ "https://ex.test/list/": { ok: true, status: 200, text: html }, "https://ex.test/work/a1/": { ok: true, status: 200, text: "x" } }))).verdict, "見える");
  assert.equal((await probeSource(src, mk({ "https://ex.test/list/": { ok: true, status: 200, text: "<p>none</p>" } }))).verdict, "要調整");
  const r403 = await probeSource(src, mk({ "https://ex.test/list/": { ok: false, status: 403, text: "" } }));
  assert.equal(r403.verdict, "見えない"); assert.match(r403.note, /回避しない/);
  assert.equal((await probeSource(src, mk({}, false))).note, "robots.txtで禁止");
  assert.equal((await probeSource(src, mk({ "https://ex.test/list/": new Error("ECONNRESET") }))).verdict, "見えない");
  assert.match(formatTable([{ key: "x", media: "web", enabled: true, listStatus: "OK", links: 2, detailStatus: "OK", verdict: "見える", note: "" }]), /見える/);
});

test("manual: URL指定の候補を作り、重複・ID衝突だけ確認して選定する（基準は免除・拒否は回避しない）", async () => {
  const { buildManualCandidate, selectManual } = await import("./lib/manual.mjs");
  const html = '<html><head><title>テストLP｜Site</title><meta property="og:title" content="テストLP"><meta property="og:image" content="/ogp.png"></head></html>';
  const getter = (resp, robots = true) => ({ robots: async () => robots, get: async () => resp });
  const c = await buildManualCandidate("https://ex.test/lp/", "lp", getter({ ok: true, status: 200, text: html }));
  assert.equal(c.manual, true); assert.equal(c.pageUrl, "https://ex.test/lp/"); assert.equal(c.imageUrl, "https://ex.test/ogp.png"); assert.equal(c.brand, "テストLP");
  await assert.rejects(buildManualCandidate("https://ex.test/", "lp", getter({ ok: false, status: 403, text: "" })), /回避しません/);
  await assert.rejects(buildManualCandidate("https://ex.test/", "lp", getter(null, false)), /robots/);
  await assert.rejects(buildManualCandidate("ftp://ex.test/", "lp"), /http/);
  const b = await buildManualCandidate("https://ex.test/a/banner.png", "banner");
  assert.equal(b.imageUrl, "https://ex.test/a/banner.png");
  const ok = selectManual(c, { dupCheck: () => ({ duplicate: false }) });
  assert.equal(ok.selected.disId, null); assert.equal(ok.selected.manual, true); // IDは撮影/テンプレート時に連番で採番
  assert.match(selectManual(c, { dupCheck: () => ({ duplicate: true, reason: "同一URL" }) }).skippedReason, /重複/);
});

test("ids: 連番ID（媒体ごと0001から）。旧形式は連番に含めず、台帳と作業中の予約の最大値+1。欠番は再利用しない", async () => {
  const { formatDisId, nextSerial, isSerialId, reservedIdsFromOutputs } = await import("./lib/ids.mjs");
  assert.equal(formatDisId("DIS", "LP", 7), "DIS-LP-0007");
  assert.throws(() => formatDisId("DIS", "LP", 0));
  assert.equal(isSerialId("DIS-LP-0001", "DIS", "LP"), true);
  assert.equal(isSerialId("DIS-LP-20261107", "DIS", "LP"), false);
  const legacy = [{ disId: "DIS-LP-20261107" }, { disId: "DIS-BN-20261107" }];
  assert.equal(nextSerial({ ledgerEntries: legacy, prefix: "DIS", code: "LP" }), 1);
  assert.equal(nextSerial({ ledgerEntries: [...legacy, { disId: "DIS-LP-0003" }], prefix: "DIS", code: "LP" }), 4);
  assert.equal(nextSerial({ ledgerEntries: [{ disId: "DIS-LP-0001" }], reservedIds: ["DIS-LP-0005"], prefix: "DIS", code: "LP" }), 6);
  assert.equal(nextSerial({ ledgerEntries: [{ disId: "DIS-LP-0009" }], prefix: "DIS", code: "BN" }), 1); // 媒体ごと
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-ids-"));
  await fs.mkdir(path.join(tmp, "2030-01-01/lp"), { recursive: true });
  await fs.writeFile(path.join(tmp, "2030-01-01/lp/selection.json"), JSON.stringify({ selected: { disId: "DIS-LP-0002" } }));
  assert.deepEqual(await reservedIdsFromOutputs(tmp, "lp"), ["DIS-LP-0002"]);
  assert.deepEqual(await reservedIdsFromOutputs(tmp, "web"), []);
});

test("連番ID: 同じ日に手動指定（--url）を2件採番しても衝突せず、作業フォルダも分かれる", async () => {
  const { formatDisId } = await import("./lib/ids.mjs");
  assert.equal(formatDisId("DIS", "WB", 1), "DIS-WB-0001");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-serial-"));
  const ids = [];
  const run = (url, stage, date = "2026-11-10") => spawnSync(process.execPath, [path.join(here, "run.mjs"), "--url", url, "--out", path.join(tmp, "out"), "--ledger", path.join(tmp, "l.json"), "--date", date, "--media", "banner", "--stage", stage], { env: { ...process.env, DRY_RUN: "true", DIS_ENABLE_WRITES: "" }, encoding: "utf8" });
  for (const [u, date] of [["https://ex.test/a/1.png", "2026-11-10"], ["https://ex.test/a/2.png", "2026-11-10"], ["https://ex.test/a/3.png", "2026-11-11"]]) {
    const r = run(u, "collect,select,template", date);
    assert.equal(r.status, 0, r.stderr);
    const dirs = (await fs.readdir(path.join(tmp, "out", date))).filter((x) => x.startsWith("banner-url-"));
    const sels = await Promise.all(dirs.map(async (x) => JSON.parse(await fs.readFile(path.join(tmp, "out", date, x, "selection.json"), "utf8")).selected));
    ids.push(sels.find((x) => x.pageUrl === u).disId);
  }
  assert.deepEqual(ids, ["DIS-BN-0001", "DIS-BN-0002", "DIS-BN-0003"]);
  // 同じURLを再実行しても、番号は変わらない（採番は1回だけ）
  const again = run("https://ex.test/a/1.png", "collect,select,template");
  assert.equal(again.status, 0, again.stderr);
  assert.equal(JSON.parse(again.stdout).media.banner.stages.disId, undefined);
});

test("manual: まとめサイト（rdlp）の紹介ページが渡されたら実LPのURLを対象にする。他のまとめサイトは実URLを求める", async () => {
  const { buildManualCandidate } = await import("./lib/manual.mjs");
  const sources = [{ key: "rdlp", name: "LPアーカイブ", listUrl: "https://rdlp.jp/lp-archive/", parser: "rdlp" }, { key: "wdc-lp", name: "WDC", listUrl: "https://lp.webdesignclip.com/" }];
  const html = '<meta property="og:title" content="KAKEDASHIのLPデザイン"><a class="url_check" href="https://real.example/lp/"><img src="/t.jpg"></a>';
  const getter = { robots: async () => true, get: async () => ({ ok: true, status: 200, text: html }) };
  const c = await buildManualCandidate("https://rdlp.jp/archives/otherdesign/lp/229605", "lp", getter, sources);
  assert.equal(c.pageUrl, "https://real.example/lp/"); assert.equal(c.sourceDetailUrl, "https://rdlp.jp/archives/otherdesign/lp/229605"); assert.equal(c.sourceKey, "rdlp");
  await assert.rejects(buildManualCandidate("https://lp.webdesignclip.com/x/", "lp", getter, sources), /実際/);
  const none = { robots: async () => true, get: async () => ({ ok: true, status: 200, text: "<p>x</p>" }) };
  await assert.rejects(buildManualCandidate("https://rdlp.jp/archives/a/1", "lp", none, sources), /取り出せません/);
  const direct = await buildManualCandidate("https://real.example/lp/", "lp", { robots: async () => true, get: async () => ({ ok: true, status: 200, text: "<title>X</title>" }) }, sources);
  assert.equal(direct.pageUrl, "https://real.example/lp/");
});

test("archive: 紹介ページの全体画像(full_N)だけを取り出し、PC/SPの一式を作る（関連作品のサムネイルは対象外・回避しない）", async () => {
  const { parseArchiveFullImages, captureFromArchive } = await import("./lib/capture.mjs");
  const sharp = (await import("sharp")).default;
  const html = '<img src="/image/lp-archive/104201/full_1.jpg.webp"><img src="/image/lp-archive/104201/full_2.jpg.webp"><img src="https://rdlp.jp/image/lp-archive/104167/200x400.jpg.webp"><img src="/image/lp-archive/104167/full_1.jpg.webp">';
  const imgs = parseArchiveFullImages(html, "https://rdlp.jp/archives/otherdesign/lp/229605");
  assert.deepEqual(imgs.map((i) => i.url), ["https://rdlp.jp/image/lp-archive/104201/full_1.jpg.webp", "https://rdlp.jp/image/lp-archive/104201/full_2.jpg.webp"]);
  assert.deepEqual(parseArchiveFullImages("<p>x</p>", "https://rdlp.jp/a/"), []);
  const mk = async (w, h) => sharp({ create: { width: w, height: h, channels: 3, background: "#c33" } }).png().toBuffer();
  const pc = await mk(1200, 4000), sp = await mk(750, 6000);
  const fetchImpl = async (u) => {
    if (u.endsWith("/229605")) return { ok: true, status: 200, text: async () => html };
    const b = u.includes("full_1") ? pc : sp;
    return { ok: true, status: 200, arrayBuffer: async () => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) };
  };
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dis-arch-"));
  const files = await captureFromArchive("https://rdlp.jp/archives/otherdesign/lp/229605", out, { id: "DIS-LP-0001", fetchImpl });
  assert.ok(files.some((f) => f.rel === "01_Normal_Images/DIS-LP-0001_PC_full.png") && files.some((f) => f.rel === "01_Normal_Images/DIS-LP-0001_SP_full.png"));
  assert.ok(files.warnings.some((w) => /アーカイブ掲載の画像/.test(w)));
  const { checkAssetSet } = await import("./lib/asset-check.mjs");
  assert.equal((await checkAssetSet(out, { id: "DIS-LP-0001", media: "lp", archive: true })).ok, true);
  assert.equal((await checkAssetSet(out, { id: "DIS-LP-0001", media: "lp" })).ok, false); // SPが750pxのため、通常の基準では不足（アーカイブ時のみ警告扱い）
  const denied = async () => ({ ok: false, status: 403, text: async () => "" });
  await assert.rejects(captureFromArchive("https://rdlp.jp/a/", out, { id: "X", fetchImpl: denied }), /回避しない/);
});

test("url-capture.sh: 書込みを無効に固定し、媒体・URL・アーカイブ指定からコマンドを組み立てる。不正な入力は実行しない", async () => {
  const sh = path.join(here, "url-capture.sh");
  const base = { ...process.env, DIS_NOTIFY: "0", DIS_NO_GUI: "1", DIS_NO_OPEN: "1", DIS_ENABLE_WRITES: "true", DRY_RUN: "false" };
  const run = (env) => spawnSync("bash", [sh], { env: { ...base, ...env }, encoding: "utf8", input: "" });
  const ok = run({ DIS_PRINT_ONLY: "1", DIS_MEDIA: "lp", DIS_URL: " https://rdlp.jp/archives/otherdesign/lp/229605 ", DIS_FROM_ARCHIVE: "1" });
  assert.equal(ok.status, 0, ok.stderr + ok.stdout);
  assert.match(ok.stdout, /--media lp --url "https:\/\/rdlp\.jp\/archives\/otherdesign\/lp\/229605" --from-archive --stage collect,select,capture,template --capture/);
  const guard = run({ DIS_MEDIA: "web", DIS_URL: "https://ex.test/", DIS_RUN_CMD: 'echo "W=${DIS_ENABLE_WRITES:-unset} D=$DRY_RUN"' });
  assert.match(guard.stdout, /W=unset D=true/);
  assert.notEqual(run({ DIS_MEDIA: "lp", DIS_URL: "javascript:alert(1)" }).status, 0);
  assert.notEqual(run({ DIS_MEDIA: "movie", DIS_URL: "https://ex.test/" }).status, 0);
  const fail = run({ DIS_MEDIA: "lp", DIS_URL: "https://ex.test/", DIS_RUN_CMD: "exit 7" });
  assert.equal(fail.status, 7);
  const src = await fs.readFile(sh, "utf8");
  assert.ok(!/\$[A-Za-z_]+[^\x00-\x7F]/.test(src.replace(/\$\{[^}]*\}/g, "")), "bash 3.2: $VAR の直後に日本語を置かない（${VAR}を使う）");
});

test("library: 媒体別フォルダ(LP/バナー/ウェブ)に連番_日付_ブランドで並び、item.json・INDEX.mdで一覧できる。自動も手動も同じ連番", async () => {
  const { itemFolderName, safeBrand, itemRelDir, writeIndex, reservedFromLibrary } = await import("./lib/library.mjs");
  assert.equal(itemFolderName({ disId: "DIS-LP-0001", date: "2026-11-10", brand: "KAKEDASHIのLPデザイン" }), "0001_20261110_KAKEDASHIのLPデザイン");
  assert.equal(safeBrand('A/B: C*?"<>|  D'), "A_B_C_D");
  assert.equal(Array.from(safeBrand("あ".repeat(50))).length, 24);
  assert.equal(safeBrand("///"), "untitled");
  const cfg = await loadConfig();
  assert.deepEqual(["lp", "banner", "web"].map((m) => cfg.media[m].localFolder), ["LP", "バナー", "ウェブ"]);
  assert.equal(itemRelDir(cfg, "banner", { disId: "DIS-BN-0002", date: "2026-11-10", brand: "X" }), path.join("バナー", "0002_20261110_X"));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-lib-"));
  const mkItem = async (folder, name, item, extra = {}) => {
    const d = path.join(tmp, folder, name); await fs.mkdir(d, { recursive: true });
    await fs.writeFile(path.join(d, "item.json"), JSON.stringify(item));
    for (const [f, c] of Object.entries(extra)) { await fs.mkdir(path.dirname(path.join(d, f)), { recursive: true }); await fs.writeFile(path.join(d, f), c); }
  };
  await mkItem("LP", "0001_20261110_A", { disId: "DIS-LP-0001", media: "lp", date: "2026-11-10", mode: "手動", brand: "A", pageUrl: "https://a/" }, { "files/x": "1", "analysis.md": "m" });
  await mkItem("LP", "0002_20261110_B", { disId: "DIS-LP-0002", media: "lp", date: "2026-11-10", mode: "自動", brand: "B", pageUrl: "https://b/" });
  assert.deepEqual(await reservedFromLibrary(tmp, cfg, "lp"), ["DIS-LP-0001", "DIS-LP-0002"]);
  const rows = await writeIndex(tmp, cfg, { entries: [{ disId: "DIS-LP-0001" }] });
  assert.deepEqual(rows.map((r) => [r.disId, r.status, r.mode]), [["DIS-LP-0001", "登録済み", "手動"], ["DIS-LP-0002", "未撮影", "自動"]]);
  assert.match(await fs.readFile(path.join(tmp, "INDEX.md"), "utf8"), /DIS-LP-0002 \| 2026-11-10 \| lp \| 自動 \| B/);
});

test("archive: 選定済みの案件を後からアーカイブ画像モードに切り替えられる（rdlp由来のLP/Webのみ）", async () => {
  const { applyArchiveMode } = await import("./lib/manual.mjs");
  const sel = { sourceKey: "rdlp" };
  assert.equal(applyArchiveMode(sel, { fromArchive: false, media: "lp" }), false);
  assert.equal(applyArchiveMode(sel, { fromArchive: true, media: "lp" }), true);
  assert.equal(sel.captureMode, "archive");
  assert.equal(applyArchiveMode(sel, { fromArchive: true, media: "lp" }), false); // 切り替え済み
  assert.throws(() => applyArchiveMode({ sourceKey: "x" }, { fromArchive: true, media: "lp" }), /rdlp/);
  assert.throws(() => applyArchiveMode({ sourceKey: "rdlp" }, { fromArchive: true, media: "banner" }), /rdlp/);
});

test("archive: 番号なしの全体画像（full.jpg）1枚でも取り出せ、PCのみの一式を作る（SPなしは警告）", async () => {
  const { parseArchiveFullImages, captureFromArchive } = await import("./lib/capture.mjs");
  const sharp = (await import("sharp")).default;
  const html = '<img src="/image/lp-archive/17012/full.jpg.webp"><img src="https://rdlp.jp/image/lp-archive/17064/200x400.jpg.webp">';
  assert.deepEqual(parseArchiveFullImages(html, "https://rdlp.jp/archives/otherdesign/lp/16359").map((i) => i.url), ["https://rdlp.jp/image/lp-archive/17012/full.jpg.webp"]);
  const png = await sharp({ create: { width: 900, height: 3000, channels: 3, background: "#39c" } }).png().toBuffer();
  const fetchImpl = async (u) => u.includes("/lp/16359") ? { ok: true, status: 200, text: async () => html } : { ok: true, status: 200, arrayBuffer: async () => png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength) };
  const out = await fs.mkdtemp(path.join(os.tmpdir(), "dis-arch1-"));
  const files = await captureFromArchive("https://rdlp.jp/archives/otherdesign/lp/16359", out, { id: "DIS-LP-0001", fetchImpl });
  assert.ok(files.some((f) => f.rel.endsWith("DIS-LP-0001_PC_full.png")));
  assert.ok(!files.some((f) => f.rel.includes("_SP_")));
  assert.ok(files.warnings.some((w) => /1枚だけ/.test(w)));
  const { checkAssetSet } = await import("./lib/asset-check.mjs");
  const ac = await checkAssetSet(out, { id: "DIS-LP-0001", media: "lp", archive: true });
  assert.equal(ac.ok, true, ac.errors.join(";"));
  assert.equal((await checkAssetSet(out, { id: "DIS-LP-0001", media: "lp" })).ok, false); // 通常撮影ではSPが必須
});

test("import-analysis: 案件フォルダへ分析と注釈を取り込む。分析済みは上書きしない（--replaceのみ）", async () => {
  const { importAnalysis } = await import("./import-analysis.mjs");
  const root = path.resolve(here, "../..");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-imp-"));
  const item = path.join(tmp, "out", "LP", "0001_20261110_X");
  await fs.mkdir(item, { recursive: true });
  await fs.writeFile(path.join(item, "item.json"), JSON.stringify({ disId: "DIS-LP-0001" }));
  await fs.writeFile(path.join(item, "analysis.json"), JSON.stringify({ status: "template" }));
  const opts = { disId: "DIS-LP-0001", outDir: path.join(tmp, "out"), srcDir: path.join(root, "candidates/dis") };
  const r = await importAnalysis(opts);
  assert.equal(r.dir, item);
  const a = JSON.parse(await fs.readFile(path.join(item, "analysis.json"), "utf8"));
  assert.equal(a.status, "complete"); assert.equal(a.disId, "DIS-LP-0001"); assert.equal(a.sectionCoverage.analyzedUnitCount, 6);
  await assert.rejects(importAnalysis(opts), /上書きしません/);
  assert.ok((await importAnalysis({ ...opts, replace: true })).dir);
  await assert.rejects(importAnalysis({ ...opts, disId: "DIS-LP-9999" }), /案件フォルダが見つかりません/);
});

test("選定理由: 手動は「ユーザーが選定」、自動は候補レビューの良い点＋6項目の点数が自動で入る。空のまま検証しても補われる", async () => {
  const { defaultSelectionReason } = await import("./lib/review.mjs");
  assert.equal(defaultSelectionReason({ manual: true }), "良い点: （分析時に記入）（ユーザーが選定）");
  assert.match(defaultSelectionReason({ manual: true, captureMode: "archive" }), /^良い点: （分析時に記入）（ユーザーが選定。実ページは取得できなかったため、LPアーカイブ掲載の画像のみを根拠とする）$/); // 良い点が先頭、注記は最後
  // 「良い点」が未記入のままでは、検証が通らない
  const base = completeAnalysis(); base.selectionReason = defaultSelectionReason({ manual: true });
  assert.ok(validateAnalysis(base).errors.some((e) => /良い点/.test(e)));
  base.selectionReason = "良い点: 見出しの型が統一され、再現しやすい。（ユーザーが選定）";
  assert.equal(validateAnalysis(base).ok, true);
  const auto = defaultSelectionReason({ reviewReason: "見出しの型が明快で、再現しやすい", reviewTotal: 15, reviewCriteria: { clarity: 3, uniqueness: 2, reproducibility: 3, practicality: 3, materials: 2, sourcing: 2 } });
  assert.match(auto, /見出しの型が明快で、再現しやすい（選定評価 15\/18: 構成の明快さ 3・独自性・再発見性 2・再現可能性 3/);
  assert.match(defaultSelectionReason({ score: 72 }), /機械的スコア 72\/100/);
  assert.equal(emptyAnalysis({ media: "lp", disId: "X", pageUrl: "u", brand: "b", selectionReason: "理由" }).selectionReason, "理由");
});

test("外部同期: 登録の時点で、分析内の外部同期が「登録済み・保存済み」になる（CBSは対象外のまま）", async () => {
  const { withRegisteredSync, analysisToMarkdown } = await import("./lib/analysis-schema.mjs");
  const a = completeAnalysis();
  const b = withRegisteredSync(a, "2026-11-10");
  assert.equal(b.externalSync.notion, "登録済み（2026-11-10）");
  assert.equal(b.externalSync.dropbox, "保存済み（2026-11-10）");
  assert.equal(b.externalSync.cbs, a.externalSync.cbs);
  assert.match(analysisToMarkdown(b), /Notion=登録済み（2026-11-10） ／ Dropbox=保存済み（2026-11-10）/);
  assert.notEqual(a.externalSync.notion, b.externalSync.notion); // 元は変更しない
});

test("crop: 意味ごと（Sectionの種類つきのファイル名）に切り出す。境界は余白に吸着し、機械的な分割（sections/）は残る", async () => {
  const { cropSections, snapBoundary, rowVariance, ROLE_TYPES, SECTION_DIR } = await import("./lib/crop.mjs");
  const sharp = (await import("sharp")).default;
  // 400x1000: 0-300 赤の模様, 300-320 白(余白), 320-700 青の模様, 700-720 白, 720-1000 緑の模様
  const W = 400, H = 1000;
  const raw = Buffer.alloc(W * H * 3, 255);
  const paint = (y0, y1, rgb) => { for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const stripe = (x + y) % 40 < 20; const i = (y * W + x) * 3; const c = stripe ? rgb : rgb.map((v) => v * 0.4); raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; } };
  paint(0, 300, [220, 40, 40]); paint(320, 700, [40, 40, 220]); paint(720, 1000, [40, 200, 40]);
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-crop-"));
  const normal = path.join(tmp, "files", "01_Normal_Images");
  await fs.mkdir(path.join(normal, "sections"), { recursive: true });
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(normal, "DIS-LP-0009_PC_full.png"));
  await fs.writeFile(path.join(normal, "sections", "pc_01.jpg"), "x"); // 既存の機械的な分割
  // 目測の境界は、実際の余白（300〜320, 700〜720）から少しずれている（0.31 / 0.69）
  const analysis = { units: [
    { id: "U1", roleType: "FV", regions: { pc: { y0: 0, y1: 0.31 } } },
    { id: "U2", roleType: "悩み提起", regions: { pc: { y0: 0.31, y1: 0.71 } } },
    { id: "U3", roleType: "CTA", regions: { pc: { y0: 0.71, y1: 1 } } },
    { id: "U4", roleType: "その他" }, // regions なし → 切り出さない
  ] };
  const { produced, warnings } = await cropSections(tmp, analysis, { id: "DIS-LP-0009" });
  assert.deepEqual(produced.map((p) => path.basename(p.local)), ["pc_01_FV.png", "pc_02_悩み提起.png", "pc_03_CTA.png"]);
  assert.deepEqual(warnings, []);
  const h = await Promise.all(produced.map(async (p) => (await sharp(p.local).metadata()).height));
  assert.equal(h.reduce((a, b) => a + b, 0), H); // 隙間も重なりもなく、全体を覆う
  assert.ok(produced[0].y1 >= 295 && produced[0].y1 <= 325, `境界が余白に吸着: ${produced[0].y1}`); // 300〜320の余白付近
  assert.ok(produced[1].y1 >= 695 && produced[1].y1 <= 725, `境界が余白に吸着: ${produced[1].y1}`);
  assert.equal(produced[0].y1, produced[1].y0); // 隣り合うSectionの境界は、1つだけ
  assert.equal(produced[0].rel, `01_Normal_Images/${SECTION_DIR}/pc_01_FV.png`);
  assert.equal(await fs.readFile(path.join(normal, "sections", "pc_01.jpg"), "utf8"), "x"); // 機械的な分割は、そのまま残る
  assert.ok(ROLE_TYPES.includes("FV") && ROLE_TYPES.includes("悩み提起") && ROLE_TYPES.includes("共感"));
  const st = await rowVariance(path.join(normal, "DIS-LP-0009_PC_full.png"));
  assert.equal(snapBoundary(0, st), 0); assert.equal(snapBoundary(1, st), H);
});

test("roleType・regions の検証: 旧形式（キーなし）は通り、キーがあるのに未選択・不正・範囲外はNG", async () => {
  const base = completeAnalysis();
  assert.equal(validateAnalysis(base).ok, true); // 旧形式（roleType なし）
  const a = JSON.parse(JSON.stringify(base));
  a.units[0].roleType = "";
  assert.ok(validateAnalysis(a).errors.some((e) => /roleType/.test(e)));
  a.units[0].roleType = "FV"; a.units[0].regions = { pc: { y0: 0, y1: 0.2 }, sp: { y0: 0, y1: 0 } };
  assert.equal(validateAnalysis(a).ok, true);
  a.units[0].regions = { pc: { y0: 0.5, y1: 0.2 } };
  assert.ok(validateAnalysis(a).errors.some((e) => /regions\.pc/.test(e)));
  const t = emptyAnalysis({ media: "lp", disId: "X", pageUrl: "u", brand: "b" });
  assert.ok(validateAnalysis(t, { requireComplete: false }).errors.some((e) => /roleType/.test(e))); // テンプレートは未選択のため、記入が必要
});

test("crop: 吸着は、近くに余白があるときだけ（上限px）。余白がなければ目測の位置のまま（縦に長いページ・写真と帯の境目でも飛ばない）", async () => {
  const { snapBoundary, rowVariance, cropSections, MAX_SNAP_PX } = await import("./lib/crop.mjs");
  const sharp = (await import("sharp")).default;
  // 幅300・高さ12000（縦に長いページ）。y=3000付近は、写真（模様）から紺の帯に変わる境目で、余白なし。余白の行は、y=3500〜3600にだけある（境界から500px離れている）
  const W = 300, H = 12000;
  const raw = Buffer.alloc(W * H * 3, 255);
  const paint = (y0, y1, f) => { for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) { const c = f(x, y); const i = (y * W + x) * 3; raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; } };
  paint(0, 3000, (x, y) => ((x * 7 + y * 3) % 50 < 25 ? [200, 120, 60] : [40, 90, 160])); // 写真（模様）
  paint(3000, 3500, () => [20, 30, 110]); // 紺の帯（均一・色が一定）
  paint(3600, H, (x, y) => ((x + y) % 40 < 20 ? [30, 160, 60] : [220, 220, 40]));
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-crop2-"));
  const normal = path.join(tmp, "files", "01_Normal_Images");
  await fs.mkdir(normal, { recursive: true });
  await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toFile(path.join(normal, "DIS-LP-0008_PC_full.png"));
  const st = await rowVariance(path.join(normal, "DIS-LP-0008_PC_full.png"));
  // 写真と帯の境目（y=3000）付近: 余白の行（均一な行）が、上限より遠く（帯の中は均一だが、境目より下側）にある
  const est = 2990 / H; // 目測は、境目の少し手前
  const snapped = snapBoundary(est, st);
  assert.ok(Math.abs(snapped - 2990) <= MAX_SNAP_PX + st.scale, `上限を超えて動いていない: ${snapped}`);
  // 余白が全くない場所（写真の中）では、目測のまま
  assert.equal(snapBoundary(1500 / H, st), 1500);
  // 実際のSection切り出しでも、各Sectionの高さは目測と大きくずれない
  const analysis = { units: [{ id: "U1", roleType: "FV", regions: { pc: { y0: 0, y1: 2990 / H } } }, { id: "U2", roleType: "CTA", regions: { pc: { y0: 2990 / H, y1: 3550 / H } } }, { id: "U3", roleType: "その他", regions: { pc: { y0: 3550 / H, y1: 1 } } }] };
  const { produced } = await cropSections(tmp, analysis, { id: "DIS-LP-0008" });
  const hs = produced.map((p) => p.y1 - p.y0);
  assert.ok(Math.abs(hs[0] - 2990) < 150, `FV: ${hs[0]}`);
  assert.ok(Math.abs(hs[1] - 560) < 200, `CTA: ${hs[1]}（31pxのような極端な縮みがない）`);
  assert.equal(hs.reduce((a, b) => a + b, 0), H);
});

test("supplement-crops: 登録済み案件の既存フォルダに、sections_by_unit/ を新規で追加する計画を作る（既存は触らない・画像がなければ止まる）", async () => {
  const { planCropUpload } = await import("./supplement-crops.mjs");
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-sc-"));
  const dir = path.join(tmp, "files", "01_Normal_Images", "sections_by_unit");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "pc_01_FV.png"), "x"); await fs.writeFile(path.join(dir, "sp_01_FV.png"), "x"); await fs.writeFile(path.join(dir, "index.json"), "[]"); await fs.writeFile(path.join(dir, "memo.txt"), "no");
  const entry = { disId: "DIS-LP-0002", dropbox: { folder: "/d/LP/99_Needs_Review/2026-11-10/dis-daily/DIS-LP-0002" } };
  const plan = await planCropUpload({ entry, itemDir: tmp });
  assert.equal(plan.remoteDir, "/d/LP/99_Needs_Review/2026-11-10/dis-daily/DIS-LP-0002/01_Normal_Images/sections_by_unit");
  assert.deepEqual(plan.files.map((f) => path.basename(f.remote)), ["index.json", "pc_01_FV.png", "sp_01_FV.png"]); // memo.txt は対象外
  assert.ok(plan.files.every((f) => f.remote.startsWith(plan.remoteDir + "/")));
  await assert.rejects(planCropUpload({ entry: {}, itemDir: tmp }), /Dropboxの保存先/);
  await assert.rejects(planCropUpload({ entry, itemDir: path.join(tmp, "none") }), /切り出し画像がありません/);
  const r = spawnSync(process.execPath, [path.join(here, "supplement-crops.mjs"), "--id", "DIS-LP-9999"], { env: { ...process.env, DRY_RUN: "true", DIS_ENABLE_WRITES: "" }, encoding: "utf8" });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /台帳に DIS-LP-9999 がありません/);
});

test("dropbox-client: Dropbox-API-Arg は日本語のパスでもASCIIのみになり、元のJSONに戻る", async () => {
  const { dropboxApiArg } = await import("../lib/dropbox-client.mjs");
  const arg = { path: "/design/DIS-LP-0002/01_Normal_Images/sections_by_unit/pc_03_悩み提起.png", mode: "add", autorename: false, mute: true };
  const h = dropboxApiArg(arg);
  assert.ok(/^[\x20-\x7e]*$/.test(h), "ヘッダーにASCII以外が残っている");
  assert.deepEqual(JSON.parse(h), arg);
  assert.equal(dropboxApiArg({ path: "/a/b.png" }), JSON.stringify({ path: "/a/b.png" })); // ASCIIのみは、従来と同じ
});

test("overview: Sectionごとの切り出しを、ラベルつき1枚の全体図にまとめる（PC優先・なければSP・切り出しがなければ作らない）", async () => {
  const { buildUnitOverview, OVERVIEW_KEY } = await import("./lib/overview.mjs");
  const sharp = (await import("sharp")).default;
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "dis-overview-"));
  const mk = async (name, w, h, rgb) => { const p = path.join(tmp, name); await sharp({ create: { width: w, height: h, channels: 3, background: rgb } }).png().toFile(p); return p; };
  const produced = [
    { unitId: "U1", device: "pc", local: await mk("pc_01.png", 1440, 900, "#cc3333") },
    { unitId: "U1", device: "sp", local: await mk("sp_01.png", 375, 800, "#33cc33") }, // PCがあるので、使わない
    { unitId: "U2", device: "sp", local: await mk("sp_02.png", 375, 1200, "#3333cc") }, // PCがない → SP
    { unitId: "U3", device: "pc", local: await mk("pc_03.png", 1440, 3000, "#cccc33") }, // 縦に長い
  ];
  const analysis = { disId: "DIS-LP-0009", brand: "テスト", units: [{ id: "U1", roleType: "FV" }, { id: "U2", roleType: "共感" }, { id: "U3", roleType: "ベネフィット" }, { id: "U4", roleType: "CTA" }] };
  const r = await buildUnitOverview(tmp, analysis, { id: "DIS-LP-0009", produced });
  assert.equal(r.tiles, 3); // U4 は切り出しなし → 載せない
  assert.equal(r.rel, `02_Notion_Images/DIS-LP-0009_${OVERVIEW_KEY}_notion.jpg`);
  assert.equal(r.local, path.join(tmp, "files", "02_Notion_Images", `DIS-LP-0009_${OVERVIEW_KEY}_notion.jpg`));
  const meta = await sharp(r.local).metadata();
  assert.equal(meta.format, "jpeg");
  assert.equal(meta.width, r.width);
  assert.ok(r.bytes < 5 * 1024 * 1024, "Notionの上限（5MB）未満");
  assert.ok(meta.height >= 340 * 3000 / 1440, "最も縦に長いSectionが、全体に入る");
  assert.equal(await buildUnitOverview(tmp, analysis, { id: "DIS-LP-0009", produced: [] }), null);
});
