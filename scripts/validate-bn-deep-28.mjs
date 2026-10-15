import fs from 'node:fs';
import {fileURLToPath} from 'node:url';

const requiredLayerLabels = [
  'レイヤー番号・位置', '役割', '見出し・主要コピー（正確な読取り）',
  '価格・オファー', 'CTA', 'バッジ・ラベル', 'アイコン', 'カード・表', '装飾',
  '画像・人物・商品配置', '訴求意図・購入心理への作用', '媒体差', '証拠ソース',
  '確信度', '未確認事項・failure_reason'
];

export function validateBnDeep28(markdown) {
  const errors=[];
  const heads=[...markdown.matchAll(/^## 章(\d+)\b[^\n]*$/gm)];
  const indices=heads.map(m=>Number(m[1]));
  if (heads.length!==28 || indices.some((n,i)=>n!==i)) errors.push(`章0〜章27の順序・件数不一致: [${indices}]`);
  const chapter8Start=heads.find(m=>Number(m[1])===8);
  const chapter9Start=heads.find(m=>Number(m[1])===9);
  if (!chapter8Start || !chapter9Start || chapter8Start.index>=chapter9Start.index) {
    errors.push('章8または章9が存在しない');
    return {ok:false,errors,chapters:heads.length,layers:0};
  }
  const body=markdown.slice(chapter8Start.index,chapter9Start.index);
  const layers=[...body.matchAll(/^####\s+L\d+[^\n]*$/gm)];
  if(!layers.length) errors.push('章8にレイヤーがない');
  for(let i=0;i<layers.length;i++){
    const slice=body.slice(layers[i].index,i+1<layers.length?layers[i+1].index:body.length);
    const rows=[...slice.matchAll(/^\|\s*(\d{1,2})\.\s*([^|]+?)\s*\|/gm)];
    if(rows.length!==15){errors.push(`${layers[i][0]}: 項目数${rows.length}（必要15）`);continue;}
    for(let n=1;n<=15;n++){
      if(Number(rows[n-1][1])!==n || rows[n-1][2].trim()!==requiredLayerLabels[n-1]) errors.push(`${layers[i][0]}: ${n}の順序・ラベル不一致`);
    }
    if(!/failure_reason/i.test(slice)) errors.push(`${layers[i][0]}: failure_reason不足`);
  }
  const sections={};for(let n of [5,14,16,17]) {const m=heads.find(x=>Number(x[1])===n);const next=heads.find(x=>Number(x[1])===n+1);sections[n]=m?markdown.slice(m.index,next?.index??undefined):'';}
  if(!/\d{1,3}\s*\/\s*100/.test(sections[5])) errors.push('章5の100点評価がない');
  for(const p of ['P0','P1','P2']) if(!sections[14].includes(p)) errors.push(`章14の${p}不足`);
  if(!/rights_excluded|reference_only|rights_unknown|permission_confirmed/.test(sections[16])) errors.push('章16の権利区分不足');
  if(!/failure_reason/.test(sections[17])) errors.push('章17のfailure_reason不足');
  return {ok:errors.length===0,errors,chapters:heads.length,layers:layers.length};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const path=process.argv[2];
  if(!path){console.error('usage: node scripts/validate-bn-deep-28.mjs path/to/BN-0001.md');process.exit(2);}
  const result=validateBnDeep28(fs.readFileSync(path,'utf8'));
  console.log(JSON.stringify(result,null,2));
  if(!result.ok) process.exit(1);
}
