import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));
export const MEDIA_KEYS = ["lp", "banner", "web"];

export async function readJson(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (e) {
    if (e?.code === "ENOENT" && fallback !== undefined) return fallback;
    throw e;
  }
}

export async function loadConfig(file = `${REPO_ROOT}config/dis-daily.json`) {
  const cfg = await readJson(file);
  for (const k of MEDIA_KEYS) if (!cfg.media?.[k]) throw new Error(`config.media.${k} がありません`);
  for (const s of cfg.sources) if (!cfg.media[s.media]) throw new Error(`source ${s.key}: 不明なmedia ${s.media}`);
  return cfg;
}

export function jstDate(now = new Date()) {
  return new Date(now.getTime() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
