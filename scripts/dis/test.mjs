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
import { extractDetailLinks, parseDetail, collectFromSource, extractRdlpCards, parseRdlpDetail, cleanTitle } from "./lib/collect.mjs";
import { loadConfig } from "./lib/config.mjs";
import { dropboxFolder, buildNotionProps, chunkText, buildNotionBlocks, markdownToBlocks } from "./lib/adapters.mjs";

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
  assert.equal(res.evaluated.length, 5);
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
  const props = buildNotionProps({ "タイトル": { type: "title" }, "参考URL": { type: "url" } }, { disId: "D", brand: "B", pageUrl: "https://a.example/", date: "2026-11-07", summary: "s" });
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
  assert.equal(s.media.web.reason, "最高スコアが閾値55未満");
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
  assert.equal(sel.evaluated.filter((e) => !e.fetchError).length, 5);
  assert.ok(sel.selected);
});

test("cleanTitle: エンティティ復元と「｜サイト名」除去", () => {
  assert.equal(cleanTitle("Baseline Design | I/O 3000 | Webデザインギャラリー"), "Baseline Design");
  assert.equal(cleanTitle("おせち先行予約販売_400 x 400 | バナー広場 | まとめ"), "おせち先行予約販売_400 x 400");
  assert.equal(cleanTitle("A &amp; B"), "A & B");
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
