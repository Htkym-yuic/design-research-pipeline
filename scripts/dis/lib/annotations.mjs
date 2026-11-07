/**
 * DIS Annotation: 注釈は元画像を変更せず、座標・ラベル・根拠を別データで持つ（原本スキルの定め）。
 * bbox は、対象画像（image）の幅・高さを 1 とした正規化座標。目測の概算で、実測ではない（method に明記）。
 */
import { CONFIDENCE } from "./analysis-schema.mjs";

export function emptyAnnotations(analysis) {
  return { schemaVersion: "dis-annotation-1.0", analysisRef: analysis.disId, method: "目測の概算（画像から読み取った位置。実測ではない）", annotations: [] };
}

const str = (v) => typeof v === "string" && v.trim().length > 0;
const num01 = (v) => typeof v === "number" && v >= 0 && v <= 1;

export function validateAnnotations(ann, analysis) {
  const errors = [];
  const err = (m) => errors.push(m);
  if (ann?.schemaVersion !== "dis-annotation-1.0") err("annotations.schemaVersion は dis-annotation-1.0");
  if (ann?.analysisRef !== analysis.disId) err(`analysisRef が分析のID(${analysis.disId})と一致しない`);
  if (!str(ann?.method)) err("method（座標の取り方）が空");
  const list = Array.isArray(ann?.annotations) ? ann.annotations : [];
  const unitIds = new Set((analysis.units || []).map((u) => u.id));
  const ids = new Set();
  list.forEach((a, i) => {
    const p = `annotations[${i}]`;
    if (!str(a?.id)) err(`${p}.id が空`); else if (ids.has(a.id)) err(`${p}.id が重複`); else ids.add(a.id);
    if (!unitIds.has(a?.unitId)) err(`${p}.unitId が分析のUnitにない: ${a?.unitId}`);
    if (!str(a?.image)) err(`${p}.image（対象画像のファイル名）が空`);
    const b = a?.bbox;
    if (!(num01(b?.x) && num01(b?.y) && num01(b?.w) && num01(b?.h) && b.w > 0 && b.h > 0)) err(`${p}.bbox は x,y,w,h（0〜1、w・h>0）`);
    else if (b.x + b.w > 1.0001 || b.y + b.h > 1.0001) err(`${p}.bbox が画像の外にはみ出している`);
    if (!str(a?.label)) err(`${p}.label が空`);
    if (!str(a?.evidence)) err(`${p}.evidence（根拠）が空`);
    if (!CONFIDENCE.includes(a?.confidence)) err(`${p}.confidence は ${CONFIDENCE.join("/")}`);
  });
  for (const u of analysis.units || []) if (!list.some((a) => a?.unitId === u.id)) err(`Unit ${u.id} に注釈がない`);
  return { ok: errors.length === 0, errors };
}
