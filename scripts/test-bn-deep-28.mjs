import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBnDeep28} from './validate-bn-deep-28.mjs';
const labels=['レイヤー番号・位置','役割','見出し・主要コピー（正確な読取り）','価格・オファー','CTA','バッジ・ラベル','アイコン','カード・表','装飾','画像・人物・商品配置','訴求意図・購入心理への作用','媒体差','証拠ソース','確信度','未確認事項・failure_reason'];
function fixture(){return [...Array(28)].map((_,i)=>{
 let s=`## 章${i} 見出し\n`;
 if(i===5) s+='総合評価：77/100（暫定）\n';
 if(i===8) s+='#### L01｜左側背景\n| 項目 | 内容 |\n|---|---|\n'+labels.map((l,k)=>`| ${k+1}. ${l} | ${k===14?'failure_reason=IMAGE_NOT_VISUALLY_VERIFIED':'未確認'} |`).join('\n')+'\n';
 if(i===14) s+='P0 / P1 / P2\n';
 if(i===16) s+='rights_excluded\n';
 if(i===17) s+='failure_reason=IMAGE_NOT_VISUALLY_VERIFIED\n';
 return s;
 }).join('\n');}
test('28章と章8の固定15項目を検証',()=>assert.deepEqual(validateBnDeep28(fixture()).ok,true));
test('章8の1項目抜けを拒否',()=>{const s=fixture().replace('| 7. アイコン | 未確認 |','');assert.equal(validateBnDeep28(s).ok,false);});
test('章8の番号・ラベル順を拒否',()=>{const s=fixture().replace('8. カード・表','9. カード・表');assert.equal(validateBnDeep28(s).ok,false);});
test('既存GitHub29章フォーマットをBN28章として受け入れない',()=>{const s=fixture()+'\n## 章28 更新履歴\n';assert.equal(validateBnDeep28(s).ok,false);});
