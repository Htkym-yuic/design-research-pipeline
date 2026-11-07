import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { normalizeUrl, brandKey, KnownIndex } from "./lib/dedupe.mjs";
import { selectOne, interleaveBySource, tieHash } from "./lib/select.mjs";
import { writesAllowed } from "./lib/write-guard.mjs";
import { emptyAnalysis, validateAnalysis, AXES } from "./lib/analysis-schema.mjs";
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

function completeAnalysis() {
  const a = emptyAnalysis({ media: "lp", disId: "DIS-LP-20261107", pageUrl: "https://a.example/", brand: "A" });
  a.status = "complete"; a.summary = "s"; a.selectionReason = "r";
  a.units = [{ id: "U1", name: "FV", sectionRef: "0-900px", observation: "o", annotation: "n" }];
  a.axes = AXES.map((axis) => ({ axis, score: 4, evidence: "e", confidence: "medium", unverified: "なし" }));
  a.actions = { top: ["t"], priority: ["p"], ideas: ["i"] };
  a.reproduction = { Canva: ["c"], Photoshop: ["p"], Elementor: ["e"] };
  return a;
}
test("validateAnalysis: テンプレートは不合格、完成形は合格", () => {
  assert.equal(validateAnalysis(emptyAnalysis({ media: "lp", disId: "x", pageUrl: "u", brand: "b" })).ok, false);
  assert.deepEqual(validateAnalysis(completeAnalysis()).errors, []);
});
test("validateAnalysis: 根拠・確信度・未確認事項が欠けると不合格", () => {
  const a = completeAnalysis(); a.axes[0].evidence = ""; a.axes[1].confidence = null; a.axes[2].unverified = "";
  const { errors } = validateAnalysis(a);
  assert.equal(errors.length, 3);
});
test("validateAnalysis: 転用禁止フィールドを拒否", () => {
  const a = completeAnalysis(); a.verbatimCopy = "x";
  assert.equal(validateAnalysis(a).ok, false);
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
  const a = completeAnalysis(); a.disId = "DIS-LP-20261107"; a.pageUrl = sel.selected.pageUrl; a.brand = sel.selected.brand;
  await fs.writeFile(path.join(tmp, "out/2026-11-07/lp/analysis.json"), JSON.stringify(a));
  r = run(["--stage", "validate,publish", "--media", "lp"]);
  assert.equal(r.status, 0, r.stderr);
  const pub = JSON.parse(await fs.readFile(path.join(tmp, "out/2026-11-07/lp/publish-result.json"), "utf8"));
  assert.equal(pub.dryRun, true);
  assert.ok(pub.dropboxFolder.includes("/99_Needs_Review/2026-11-07/dis-daily/DIS-LP-20261107"));
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
  assert.equal(files[0].rel, "01_Original/banner.webp");
  await fs.access(path.join(tmp, "02_Preview/banner_preview.jpg"));
  const tmp2 = await fs.mkdtemp(path.join(os.tmpdir(), "dis-bn2-"));
  await assert.rejects(downloadBanner("https://x.example/b.png", tmp2, mk(Buffer.from("<html>blocked</html>"), "text/html")), /画像として読めない/);
  await assert.rejects(fs.access(path.join(tmp2, "01_Original/banner.png"))); // 保存されない
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
  assert.deepEqual(off, ["banner-library", "banner-matome", "cssda", "gdweb", "landbook", "sankou-web", "siteinspire"]);
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

test("applyLearning: 番号・pageUrlで反映し、範囲外・理由なし・未知の候補は拒否", async () => {
  const { applyLearning } = await import("./lib/review.mjs");
  const cands = [{ pageUrl: "https://a.example/", signals: { learningValue: 0.5 } }, { pageUrl: "https://b.example/", signals: { learningValue: 0.5 } }];
  const review = [{ no: 1, pageUrl: "https://a.example/" }, { no: 2, pageUrl: "https://b.example/" }];
  const r = applyLearning(cands, { items: [{ no: 1, learningValue: 0.9, reason: "構成が明快" }, { pageUrl: "https://b.example/", learningValue: 0.2, reason: "既存と似る" }] }, review);
  assert.equal(r.applied, 2); assert.deepEqual(r.errors, []);
  assert.deepEqual([cands[0].signals.learningValue, cands[1].signals.learningValue, cands[0].reviewReason], [0.9, 0.2, "構成が明快"]);
  const bad = applyLearning(cands, { items: [{ no: 1, learningValue: 1.5, reason: "x" }, { no: 2, learningValue: 0.5, reason: "" }, { no: 9, learningValue: 0.5, reason: "x" }] }, review);
  assert.equal(bad.applied, 0); assert.equal(bad.errors.length, 3);
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
  await fs.writeFile(path.join(dir, "learning.json"), JSON.stringify({ items: [{ no: target.no, learningValue: 1, reason: "構成が最も明快" }] }));
  r = run(["--stage", "rescore"]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(await fs.readFile(path.join(dir, "selection.json"), "utf8"));
  assert.equal(after.selected.brand, target.brand);
  assert.equal(after.selected.reviewReason, "構成が最も明快");
  // 誤ったlearning.jsonは拒否
  await fs.writeFile(path.join(dir, "learning.json"), JSON.stringify({ items: [{ no: 1, learningValue: 2, reason: "x" }] }));
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
  assert.equal(run(["--stage", "collect,select"]).status, 0);
  const a = completeAnalysis(); a.media = "web"; a.disId = "WRONG"; a.pageUrl = "https://wrong.example/"; a.brand = "AUTO";
  const f = path.join(tmp, "out/2026-11-09/web/analysis.json");
  await fs.writeFile(f, JSON.stringify(a));
  const r = run(["--stage", "validate"]);
  assert.equal(r.status, 0, r.stderr);
  const after = JSON.parse(await fs.readFile(f, "utf8"));
  assert.deepEqual([after.disId, after.pageUrl, after.brand], ["DIS-WB-20261109", "https://real.example/", "Real Brand"]);
});
