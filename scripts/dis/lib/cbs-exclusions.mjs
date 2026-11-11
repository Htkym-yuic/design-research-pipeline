import fs from "node:fs";

const FILE = "config/cbs-export-exclusions.json";

export function loadExclusions(file = FILE) {
  try {
    const j = JSON.parse(fs.readFileSync(file, "utf8"));
    return { ids: new Set(j.excludedDisIds || []), media: new Set((j.excludedDisMedia || []).map((m) => String(m).toLowerCase())) };
  } catch {
    return { ids: new Set(), media: new Set() };
  }
}

// DIS由来のナレッジだけが対象（DISのIDを持たない既存ナレッジは、影響を受けない）
export function isExcluded(disIds, mediaType, ex = loadExclusions()) {
  const ids = (disIds || []).filter(Boolean);
  if (ids.length === 0) return false;
  if (ids.some((id) => ex.ids.has(id))) return true;
  return ex.media.has(String(mediaType || "").toLowerCase());
}
