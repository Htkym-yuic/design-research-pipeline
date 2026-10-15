// RDBNR pilot: pure validation and output helpers. No network, images or writes outside outputs.
const SOURCE_URL = 'https://rdbnr.jp/archive/';
const SCORE_FIELDS = ['visual', 'clarity', 'originality', 'reusability', 'learning', 'diversity'];

export function jstDate(date = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', {timeZone: 'Asia/Tokyo', year:'numeric', month:'2-digit', day:'2-digit'}).format(date);
}
export function isAllowedSourceDetail(url) {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && u.hostname === 'rdbnr.jp' && /^\/archive\/\d+\/$/.test(u.pathname) && !u.username && !u.password && !u.search && !u.hash;
  } catch { return false; }
}
export function validateSeed(seed) {
  if (seed?.schema_version !== 'drs-1.0') throw new Error('drs-1.0以外の入力は禁止');
  if (!Array.isArray(seed.items) || seed.items.length !== 1) throw new Error('パイロットはBN-0001の1件だけ');
  const item = seed.items[0];
  if (item.asset_id !== 'BN-0001' || item.asset_type !== 'BN') throw new Error('対象IDがBN-0001でない');
  if (!isAllowedSourceDetail(item.source_detail_url)) throw new Error('許可されたRDBNR詳細URLではない');
  if (seed.run.category !== 'BN' || seed.run.source_url !== SOURCE_URL) throw new Error('カテゴリまたはソース不一致');
  if (!item.title || !item.brand || !item.selection) throw new Error('ID・タイトル・選定理由が不足');
  if (item.scout?.rank !== 'A' && item.scout?.rank !== 'B' && item.scout?.rank !== 'C') throw new Error('判定不正');
  const sum = SCORE_FIELDS.reduce((a, k) => {
    const n = item.scout?.score?.[k];
    if (!Number.isInteger(n) || n < 1 || n > 5) throw new Error(`6軸不正:${k}`);
    return a + n;
  }, 0);
  if (item.scout.score.total !== sum) throw new Error('6軸合計不一致');
  const rank = sum >= 24 ? 'A' : sum >= 18 ? 'B' : 'C';
  if (rank !== item.scout.rank) throw new Error('6軸とランク不一致');
  if (item.deep_analysis_candidate !== (rank !== 'C')) throw new Error('deep候補とランク不一致');
  for (const k of ['trigger', 'point', 'why_this', 'expected_use']) if (rank !== 'C' && !item.selection[k]) throw new Error(`selection.${k}不足`);
  if (item.rights?.image_saved !== false || item.storage?.image_saved !== false || item.rights?.rights_status !== 'rights_excluded') throw new Error('画像保存禁止・権利区分の不一致');
  return item;
}
export function limitedEvidence(observation) {
  const text = String(observation?.text || '');
  return {
    status: observation?.status ?? 0,
    final_url: String(observation?.final_url || '').slice(0, 300),
    document_title: String(observation?.document_title || '').slice(0, 180),
    h1: String(observation?.h1 || '').slice(0, 180),
    meta_description: String(observation?.meta_description || '').slice(0, 240),
    expected_name_present: /キットカット|KitKat/i.test(text),
    body_text_available: text.length > 80
  };
}
export function classifyObservation(candidateUrl, obs) {
  if (obs.error) return {status:'manual_review',failure_reason:`REQUEST_FAILED: ${String(obs.error).slice(0,180)}`};
  if (obs.status === 401 || obs.status === 403 || obs.status === 429) return {status:'manual_review',failure_reason:`ACCESS_RESTRICTED_HTTP_${obs.status}`};
  if (obs.status < 200 || obs.status >= 400) return {status:'manual_review',failure_reason:`HTTP_${obs.status}`};
  // Redirects outside the source or to other detail URLs are not accepted.
  if (!isAllowedSourceDetail(obs.final_url) || new URL(obs.final_url).pathname !== new URL(candidateUrl).pathname) return {status:'manual_review',failure_reason:'UNEXPECTED_REDIRECT'};
  const text = String(obs.text || '');
  if (/captcha|cloudflare.*checking|verify you are human|access denied/i.test(text.slice(0,6000))) return {status:'manual_review',failure_reason:'ACCESS_CHALLENGE_NO_BYPASS'};
  if (text.length < 80) return {status:'manual_review',failure_reason:'BODY_TEXT_UNAVAILABLE'};
  if (!/キットカット|KitKat/i.test([obs.h1,obs.document_title,obs.meta_description,text].join(' '))) return {status:'manual_review',failure_reason:'SOURCE_IDENTITY_UNCONFIRMED'};
  return {status:'verified_metadata',failure_reason:null};
}
export function buildResults(seed, observation, verdict, date = jstDate()) {
  validateSeed(seed);
  const checked = limitedEvidence(observation);
  const ok = verdict.status === 'verified_metadata';
  const item = ok ? structuredClone(seed.items[0]) : null;
  if (item) {
    item.rights = {rights_status:'rights_excluded', image_saved:false, distribution_allowed:false, third_party:true};
    item.storage = {...item.storage, path:'', image_saved:false};
    item.evidence = {...item.evidence, checked_at:date,
      retrieved_urls:[item.source_detail_url],
      robots_note:'事前承認済みRDBNRの公開ページを取得。ログイン・制限回避・画像取得は行わない。'};
    item.unconfirmed = [...new Set([...(item.unconfirmed || []), '実画像の独立目視', '広告バナー内の正確な文字列', 'CTA', '実寸', '画像保存の権利'])];
  }
  const items = item ? [item] : [];
  const notes = [
    'BN-0001の既存スカウト評価を引継ぎ。6軸とselectionは新規採点でなく2026-10-10再評価の暫定結果。',
    'RDBNR詳細ページの公開メタ情報へのアクセスと同一対象性だけを検証。画像の撮影・ダウンロード・Notion/Dropbox反映なし。',
    `pilot_status=${verdict.status}; failure_reason=${verdict.failure_reason || 'なし'}; image_saved=false; rights=rights_excluded.`,
    `自己点検: collected_count=${items.length}、対象1件以下、A/B/Cとスコア整合、画像保存なし。`
  ].join(' ');
  const drs = {schema_version:'drs-1.0', run:{
    run_id:`${date}_BN_RDBNR_PILOT_01`,collected_at:date,collected_by:'GitHub Actions（RDBNR検証・旧評価引継ぎ）',
    category:'BN',source_site:'RDBNR（バナーアーカイブ）',source_url:SOURCE_URL,target_count:1,
    collected_count:items.length,dedup_excluded:0,notes},items};
  const report={schema_version:'rdbnr-pilot-report-1.0',date,source_url:seed.items[0].source_detail_url,
    status:verdict.status,failure_reason:verdict.failure_reason??null,record_count:items.length,
    image_saved:false,notion_updated:false,dropbox_updated:false,metadata_observation:checked,
    next_action:ok?'原本画像の独立確認と権利検討を行い、次工程で28章・15項目とNotion同期を検証':'手動で公開ページとIDを確認。ログイン・CAPTCHA・アクセス制限の回避は行わない。'};
  return {drs,report};
}
export function validateResults(drs, report) {
  if (drs?.schema_version !== 'drs-1.0' || drs.run?.category !== 'BN') throw new Error('出力スキーマ不正');
  if (drs.run.collected_count !== drs.items.length || drs.run.target_count !== 1 || drs.items.length > 1) throw new Error('件数不一致');
  if (report.image_saved !== false || report.notion_updated !== false || report.dropbox_updated !== false) throw new Error('DRY_RUN安全ゲート違反');
  if (drs.items.length === 1) validateSeed({schema_version:'drs-1.0',run:{category:'BN',source_url:SOURCE_URL},items:drs.items});
  return true;
}
