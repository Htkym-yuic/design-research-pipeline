import fs from "node:fs/promises";

const counters = JSON.parse(await fs.readFile("data/id-counters.json", "utf8"));
const sources = JSON.parse(await fs.readFile("data/non-lp-sources.json", "utf8"));
const nonLpReservations = JSON.parse(await fs.readFile("candidates/non-lp/intake-reservations.json", "utf8").catch(() => '{"reserved":[]}'));
const lpReservations = JSON.parse(await fs.readFile("candidates/lp-archive/intake-reservations.json", "utf8").catch(() => '{"reserved":[]}'));
const errors = [];

function numericId(id, prefix) {
  const match = String(id || "").match(new RegExp(`^${prefix}-(\\d{4})$`));
  return match ? Number(match[1]) : null;
}

function checkUnique(items, key, label) {
  const seen = new Set();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    if (seen.has(value)) errors.push(`${label}が重複しています: ${value}`);
    seen.add(value);
  }
}

for (const source of sources) {
  const counter = counters[source.key];
  if (!counter) {
    errors.push(`data/id-counters.jsonに${source.key}がありません`);
    continue;
  }
  if (counter.prefix !== source.prefix) errors.push(`${source.key}のprefixが不一致です: ${counter.prefix} != ${source.prefix}`);
  if (counter.nextNumber !== counter.existingMax + 1) errors.push(`${source.key}のnextNumberが連続していません`);
  const reservedMax = Math.max(0, ...(nonLpReservations.reserved || []).map((item) => numericId(item.id, source.prefix) || 0));
  if (reservedMax > counter.existingMax) errors.push(`${source.key}の予約済み最大ID ${reservedMax} がexistingMax ${counter.existingMax}を超えています`);
}

for (const [key, counter] of Object.entries(counters)) {
  if (counter.nextNumber !== counter.existingMax + 1) errors.push(`${key}のnextNumberがexistingMax + 1ではありません`);
}

const lpReservedMax = Math.max(0, ...(lpReservations.reserved || []).map((item) => numericId(item.id, "LP") || 0));
if (lpReservedMax > counters.lp.existingMax) errors.push(`LP予約済み最大ID ${lpReservedMax} がexistingMax ${counters.lp.existingMax}を超えています`);

checkUnique(nonLpReservations.reserved || [], (item) => item.id, "非LP ID");
checkUnique(lpReservations.reserved || [], (item) => item.id, "LP ID");
checkUnique(
  nonLpReservations.reserved || [],
  (item) => item.sourceName && item.materialId ? `${item.sourceName}:${item.materialId}` : null,
  "素材ID"
);

if (errors.length > 0) {
  console.error("採番・設定監査で問題が見つかりました:");
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`採番・設定監査: OK（LP次回 ${String(counters.lp.nextNumber).padStart(4, "0")}、非LP収集元 ${sources.length}件）`);
