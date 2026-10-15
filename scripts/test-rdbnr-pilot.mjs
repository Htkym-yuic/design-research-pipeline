import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {isAllowedSourceDetail,validateSeed,classifyObservation,buildResults,validateResults} from './rdbnr-pilot-core.mjs';
const seed = JSON.parse(fs.readFileSync('data/rdbnr-pilot-reviewed.json','utf8'));
const url=seed.items[0].source_detail_url;
test('事前確認済みBN-0001シードは6軸・選定理由・権利区分に整合',()=>{
  assert.equal(validateSeed(seed).asset_id,'BN-0001');
  assert.equal(seed.items[0].scout.score.total,24);
});
test('詳細ページ以外や他サイトを拒否',()=>{
  assert.equal(isAllowedSourceDetail(url),true);
  for (const bad of ['http://rdbnr.jp/archive/190670/','https://evil.example/archive/190670/','https://rdbnr.jp/archive/','https://rdbnr.jp/archive/190670/?foo=bar','https://rdbnr.jp/archive/190670.evil/']) assert.equal(isAllowedSourceDetail(bad),false);
});
test('ログイン壁やCloudflareを回避しない',()=>{
  const restricted=classifyObservation(url,{status:403,final_url:url,text:'Blocked'});
  assert.equal(restricted.status,'manual_review');
  const challenge=classifyObservation(url,{status:200,final_url:url,text:'Cloudflare checking your browser'+'x'.repeat(100)});
  assert.equal(challenge.status,'manual_review');
});
test('対象ページが読めた場合だけ旧評価を継承し、画像保存なし',()=>{
  const obs={status:200,final_url:url,document_title:'キットカット 味くらべキャンペーン',h1:'キットカット',meta_description:'',text:'キットカット 味くらべキャンペーンの広告掲載情報'.repeat(10)};
  const verdict=classifyObservation(url,obs);
  assert.equal(verdict.status,'verified_metadata');
  const {drs,report}=buildResults(seed,obs,verdict,'2026-10-10');
  assert.equal(validateResults(drs,report),true);
  assert.equal(drs.run.collected_count,1);
  assert.deepEqual(drs.items[0].selection,seed.items[0].selection);
  assert.deepEqual(drs.items[0].scout.score,seed.items[0].scout.score);
  assert.equal(drs.items[0].rights.rights_status,'rights_excluded');
});
test('取得不能は0件とfailure_reasonを記録、旧情報を新規検証扱いしない',()=>{
  const obs={status:403,final_url:url,text:'Access Denied'};
  const verdict=classifyObservation(url,obs);
  const {drs,report}=buildResults(seed,obs,verdict,'2026-10-10');
  assert.equal(validateResults(drs,report),true);
  assert.equal(drs.run.collected_count,0);
  assert.equal(drs.items.length,0);
  assert.match(report.failure_reason,/ACCESS_RESTRICTED/);
});
test('出典詳細URLへの予期しないリダイレクトは禁止',()=>{
  const verdict=classifyObservation(url,{status:200,final_url:'https://rdbnr.jp/archive/190671/',text:'キットカット'.repeat(100)});
  assert.equal(verdict.failure_reason,'UNEXPECTED_REDIRECT');
});
