/**
 * 既存のDISページを、新しい形に組み替える本番処理（--restructure --apply）。
 * 対象は、--page で指定した1ページだけ。順番（逆にしない）:
 *   0. 実行前に、ページのブロック一覧を、ローカル（outputs/dis/backup/）へ日時付きで保存する
 *   1. 画像20枚を、先にすべてアップロードする（ここで失敗しても、ページは変わらない）
 *   2. 各Unitの最後のブロックの直後へ、PC→SPの画像を挿入する
 *   3. 挿入が全部成功したときだけ、元の画像と見出し（末尾の「PC/SP Unit画像」）を消す。途中で失敗したら、消さずに止まる
 *   4. コールアウト・外部同期の1行・プロパティ2つを書き換える
 * 撮り直し画像・9軸の本文・28章の本文と画像には触らない。
 * deps: Notion・画像の入出力。テストで差し替える。
 */
import fs from "node:fs/promises";
import path from "node:path";
import { planRestructure, groupUnitImages, disCallout, dropboxPathProp, fixExternalSyncLine } from "./dis-page.mjs";

const norm = (id) => String(id || "").replace(/-/g, "").toLowerCase();
const btext = (b) => (b?.[b.type]?.rich_text || []).map((t) => t.plain_text ?? t.text?.content ?? "").join("");
const stamp = (d = new Date()) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");

/** 種類ごとのブロック数（書き換え前後の比較用）。 */
export function countBlocks(blocks) {
  const c = {};
  for (const b of blocks) c[b.type] = (c[b.type] || 0) + 1;
  return { total: blocks.length, byType: c };
}

export async function applyRestructure({ disId, lp, pageId, pageArg, oldPageId, folderPath, unitImageFiles, backupDir, deps, now = new Date() }) {
  if (!pageArg) throw new Error("--page（組み替える1ページのID）が必要です");
  if (norm(pageArg) !== norm(pageId)) throw new Error(`--page（${pageArg}）が、${disId} のDISページ（${pageId}）と一致しません。何も書いていません`);
  const { listBlocks, uploadImage, insertAfter, deleteBlock, updateBlock, updatePageProps, imageBlock } = deps;
  const result = { disId, pageId, inserted: [], deleted: [], steps: [] };

  // 0. 実行前の保存
  const before = await listBlocks(pageId);
  await fs.mkdir(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, `${disId}_${stamp(now)}_blocks-before.json`);
  await fs.writeFile(backupFile, `${JSON.stringify(before, null, 2)}\n`, { flag: "wx" });
  const beforeIds = new Set(before.map((b) => b.id));
  result.backupFile = backupFile; result.before = countBlocks(before);

  // 計画（読み取りだけ）と、安全の確認。合わなければ、何も書かずに止める
  const names = unitImageFiles.map((f) => f.name);
  const plan = planRestructure(before, groupUnitImages(names));
  if (!plan.oldImageHeadingIds.length) throw new Error(`${disId}: 末尾の「Unit画像」の見出しがありません（すでに組み替え済みか、形が違います）。何も書いていません`);
  const planned = plan.moves.reduce((n, m) => n + m.images.length, 0);
  if (!plan.moves.length || planned !== names.length) throw new Error(`${disId}: 画像${names.length}枚のうち、Unitの下へ置けるのは${planned}枚です（Unit見出し${plan.moves.length}件）。何も書いていません`);
  const grouped = groupUnitImages(names);
  const lacking = plan.moves.filter((m) => !((grouped[m.unit] || []).some((n) => n.startsWith("pc_")) && (grouped[m.unit] || []).some((n) => n.startsWith("sp_")))).map((m) => m.unit);
  if (lacking.length) throw new Error(`${disId}: PCかSPの画像が無いUnit: ${lacking.join(",")}。何も書いていません`);
  if (plan.oldImageBlockIds.length !== names.length) throw new Error(`${disId}: 末尾の元の画像が${plan.oldImageBlockIds.length}枚で、置く画像（${names.length}枚）と一致しません。何も書いていません`);
  if (plan.unitsWithoutImages.length) throw new Error(`${disId}: 画像が無いUnit: ${plan.unitsWithoutImages.join(",")}。何も書いていません`);
  result.plan = { moves: plan.moves.map((m) => ({ unit: m.unit, insertAfterBlockId: m.insertAfterBlockId, images: m.images })), oldImageBlocks: plan.oldImageBlockIds.length, oldHeadings: plan.oldImageHeadingIds.length };

  // 1. 先に、画像をすべてアップロード（失敗してもページは変わらない）
  const uploaded = {};
  for (const f of unitImageFiles) uploaded[f.name] = await uploadImage(f.path, f.name.replace(/\.png$/, ""));
  result.steps.push(`アップロード ${Object.keys(uploaded).length}枚`);

  // 2. 各Unitの直後へ挿入（PC→SPの順）。失敗したら、消さずに止まる
  for (const m of plan.moves) {
    try {
      const r = await insertAfter(pageId, m.images.map((n) => imageBlock(uploaded[n], n.replace(/\.png$/, ""))), m.insertAfterBlockId);
      result.inserted.push({ unit: m.unit, images: m.images, blockIds: (r?.results || []).map((b) => b.id).filter((id) => id && !beforeIds.has(id)) }); // Notionは、周辺のブロックも返すため、元からあったものは除く
    } catch (e) {
      const err = new Error(`${disId}: ${m.unit} の画像の挿入に失敗したため、元の画像は消さずに止めました（挿入済み: ${result.inserted.map((x) => x.unit).join(",") || "なし"}）: ${e.message}`);
      err.result = result; throw err;
    }
  }
  const afterInsert = await listBlocks(pageId);
  const added = afterInsert.length - before.length;
  if (added !== names.length) {
    const err = new Error(`${disId}: 挿入後のブロック数が、想定（+${names.length}）と違います（+${added}）。元の画像は消さずに止めました`);
    err.result = result; throw err;
  }
  result.steps.push(`挿入 ${names.length}枚（全Unit成功）`);

  // 3. 全部成功したときだけ、元の画像→見出しの順で消す
  for (const id of [...plan.oldImageBlockIds, ...plan.oldImageHeadingIds]) {
    try { await deleteBlock(id); result.deleted.push(id); }
    catch (e) { const err = new Error(`${disId}: 元のブロックの削除に失敗して止めました（削除済み ${result.deleted.length}件）: ${e.message}`); err.result = result; throw err; }
  }
  result.steps.push(`削除 画像${plan.oldImageBlockIds.length}枚＋見出し${plan.oldImageHeadingIds.length}件`);

  // 4. コールアウト・外部同期の1行・プロパティ
  const cur = await listBlocks(pageId);
  const callout = cur.find((b) => b.type === "callout" && btext(b).includes(`番号: ${disId}（DIS）`));
  if (callout) { await updateBlock(callout.id, { callout: { rich_text: disCallout({ disId, lp, oldPageId, dropboxFolderPath: folderPath }).callout.rich_text } }); result.steps.push("コールアウトを書き換え"); }
  else result.steps.push("WARNING: 冒頭のコールアウトが見つからず、書き換えていません");
  const sync = cur.find((b) => b.type === "bulleted_list_item" && /^外部同期:/.test(btext(b)));
  if (sync) {
    const fixed = fixExternalSyncLine(`- ${btext(sync)}`, { dropboxFolderPath: folderPath, lp }).replace(/^- /, "");
    await updateBlock(sync.id, { bulleted_list_item: { rich_text: [{ type: "text", text: { content: fixed } }] } });
    result.steps.push("外部同期の1行を書き換え");
  } else result.steps.push("WARNING: 「外部同期」の行が見つからず、書き換えていません");
  await updatePageProps(pageId, { "Dropbox正本パス": dropboxPathProp(folderPath), "Notion同期": { checkbox: true } });
  result.steps.push("プロパティ2つ（Dropbox正本パス・Notion同期）を書き換え");

  const after = await listBlocks(pageId);
  const afterFile = path.join(backupDir, `${disId}_${stamp(now)}_blocks-after.json`);
  await fs.writeFile(afterFile, `${JSON.stringify(after, null, 2)}\n`, { flag: "wx" });
  result.afterFile = afterFile; result.after = countBlocks(after);
  return result;
}
