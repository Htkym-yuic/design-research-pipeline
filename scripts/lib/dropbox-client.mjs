/**
 * Dropbox API（v2）の最小限のクライアント。
 *
 * 依存追加を避けるため、Node標準のfetchだけで実装する
 * （Node 18以降で利用可能。GitHub Actions側はNode 24を使用）。
 *
 * 認証は「リフレッシュトークン方式」を前提にする。
 * DROPBOX_REFRESH_TOKENは長期間有効で、実行のたびに
 * DROPBOX_APP_KEY / DROPBOX_APP_SECRET を使って短命なアクセストークンへ交換する。
 * これにより、アクセストークン自体をSecretsへ保存する必要がない
 * （アクセストークンは数時間で失効するため、漏洩時の被害を抑えられる）。
 */

import { requireEnvAll } from "./env.mjs";

const TOKEN_URL = "https://api.dropboxapi.com/oauth2/token";
const UPLOAD_URL = "https://content.dropboxapi.com/2/files/upload";
const CREATE_FOLDER_URL = "https://api.dropboxapi.com/2/files/create_folder_v2";
const CURRENT_ACCOUNT_URL = "https://api.dropboxapi.com/2/users/get_current_account";

let cachedAccessToken = null;

/** リフレッシュトークンから短命アクセストークンを取得する（プロセス内でキャッシュする） */
async function getAccessToken() {
  if (cachedAccessToken) return cachedAccessToken;

  requireEnvAll(["DROPBOX_APP_KEY", "DROPBOX_APP_SECRET", "DROPBOX_REFRESH_TOKEN"]);

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: process.env.DROPBOX_REFRESH_TOKEN,
    client_id: process.env.DROPBOX_APP_KEY,
    client_secret: process.env.DROPBOX_APP_SECRET,
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Dropboxのアクセストークン取得に失敗しました（${response.status}）: ${text}`);
  }

  const data = await response.json();
  cachedAccessToken = data.access_token;
  return cachedAccessToken;
}

/**
 * Dropbox-API-Arg ヘッダー用のJSON。ヘッダーはASCIIのみのため、日本語など非ASCIIの文字を \uXXXX にエスケープする
 * （Dropbox側では、エスケープ前と同じ文字列として解釈される）。
 */
/** 書込み系のAPI用。制限（429 too_many_write_operations）や一時的なサーバーエラーは、待って再試行する（最大8回。間隔は 1〜30秒ほどに伸ばす）。 */
async function dbxFetch(url, init) {
  let res;
  for (let attempt = 0; ; attempt++) {
    res = await fetch(url, init);
    if (![429, 500, 502, 503, 504].includes(res.status) || attempt >= 8) return res;
    const ra = Number(res.headers.get("retry-after")) || 0;
    const wait = Math.max(ra, Math.min(30, 2 ** attempt)) + Math.random();
    await new Promise((r) => setTimeout(r, wait * 1000));
  }
}

export function dropboxApiArg(obj) {
  return JSON.stringify(obj).replace(/[\u0080-\uffff]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/**
 * Dropbox上に1ファイルをアップロードする（mode: overwrite）。
 * 150MBを超える大きいファイルは扱わない想定（スクリーンショット・JSON程度のみ）。
 *
 * @param {string} dropboxPath 例: "/design/Design_Research_Library/LP_Research_Library/.../LP-0223_PC_full.png"
 * @param {Buffer} fileBuffer
 */
export async function uploadFile(dropboxPath, fileBuffer) {
  const accessToken = await getAccessToken();

  const apiArg = dropboxApiArg({
    path: dropboxPath,
    mode: "overwrite",
    autorename: false,
    mute: true,
  });

  const response = await fetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": apiArg,
    },
    body: fileBuffer,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Dropboxアップロードに失敗しました（${response.status}） path=${dropboxPath}: ${text}`);
  }

  return response.json();
}

/**
 * 認証のみを確認する読み取り専用チェック。書き込みは一切行わない。
 * リフレッシュトークンからのアクセストークン交換が通るか、
 * その先の最小限のAPI呼び出し（アカウント情報取得）が通るかだけを見る。
 */
export async function checkAuth() {
  const accessToken = await getAccessToken();

  // users/get_current_accountは引数を取らないAPI。Dropbox公式のcurl例もContent-Type/ボディなし
  // で呼んでおり、Content-Type: application/jsonを付けて空ボディで送ると
  // サーバー側で500 "unexpected error occurred"になることを確認したため付けない。
  const response = await fetch(CURRENT_ACCOUNT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Dropbox認証チェックに失敗しました（${response.status}）: ${text}`);
  }

  const data = await response.json();
  return { email: data.email, accountId: data.account_id };
}

/** フォルダを作成する（既に存在する場合のエラーは無視する） */
export async function ensureFolder(dropboxPath) {
  const accessToken = await getAccessToken();

  const response = await dbxFetch(CREATE_FOLDER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ path: dropboxPath, autorename: false }),
  });

  if (response.ok) return true;

  const data = await response.json().catch(() => ({}));
  const isAlreadyExists = data?.error_summary?.startsWith("path/conflict/folder");
  if (isAlreadyExists) return true;

  const text = JSON.stringify(data);
  throw new Error(`Dropboxフォルダ作成に失敗しました（${response.status}） path=${dropboxPath}: ${text}`);
}

/** 指定パスが存在するか（読み取りのみ）。DIS: 新規フォルダー作成前の衝突確認に使用。 */
export async function pathExists(dropboxPath) {
  const accessToken = await getAccessToken();
  const response = await fetch("https://api.dropboxapi.com/2/files/get_metadata", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ path: dropboxPath }),
  });
  if (response.ok) return true;
  const data = await response.json().catch(() => ({}));
  if (data?.error_summary?.startsWith("path/not_found")) return false;
  throw new Error(`Dropbox存在確認に失敗しました（${response.status}） path=${dropboxPath}: ${JSON.stringify(data)}`);
}

/** 上書きしないアップロード（mode: add, autorename: false → 既存と衝突したらエラー）。 */
export async function uploadFileNoOverwrite(dropboxPath, fileBuffer) {
  const accessToken = await getAccessToken();
  const response = await dbxFetch(UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/octet-stream",
      "Dropbox-API-Arg": dropboxApiArg({ path: dropboxPath, mode: "add", autorename: false, mute: true }),
    },
    body: fileBuffer,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Dropbox新規アップロードに失敗しました（${response.status}） path=${dropboxPath}: ${text}`);
  }
  return response.json();
}

/** フォルダの直下の一覧（読み取りのみ）。[{ tag: "file"|"folder", name, path }] */
export async function listFolder(dropboxPath) {
  const accessToken = await getAccessToken();
  const out = [];
  let res = await fetch("https://api.dropboxapi.com/2/files/list_folder", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ path: dropboxPath, recursive: false, limit: 2000 }) });
  for (;;) {
    if (!res.ok) throw new Error(`Dropbox一覧の取得に失敗しました（${res.status}） path=${dropboxPath}: ${await res.text().catch(() => "")}`);
    const data = await res.json();
    for (const e of data.entries || []) out.push({ tag: e[".tag"], name: e.name, path: e.path_display || e.path_lower, size: e.size });
    if (!data.has_more) break;
    res = await fetch("https://api.dropboxapi.com/2/files/list_folder/continue", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ cursor: data.cursor }) });
  }
  return out;
}

/** ファイルの取得（読み取りのみ）。Buffer を返す。 */
export async function downloadFile(dropboxPath) {
  const accessToken = await getAccessToken();
  const res = await fetch("https://content.dropboxapi.com/2/files/download", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Dropbox-API-Arg": dropboxApiArg({ path: dropboxPath }) } });
  if (!res.ok) throw new Error(`Dropboxからの取得に失敗しました（${res.status}） path=${dropboxPath}: ${await res.text().catch(() => "")}`);
  return Buffer.from(await res.arrayBuffer());
}

/** 名前の検索（読み取りのみ）。フォルダ名の先頭一致などは、呼び出し側で絞る。 */
export async function searchNames(query, scopePath) {
  const accessToken = await getAccessToken();
  const res = await fetch("https://api.dropboxapi.com/2/files/search_v2", { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ query, options: { path: scopePath, max_results: 50, file_status: "active", filename_only: true } }) });
  if (!res.ok) throw new Error(`Dropbox検索に失敗しました（${res.status}）: ${await res.text().catch(() => "")}`);
  const data = await res.json();
  return (data.matches || []).map((m) => m.metadata?.metadata).filter(Boolean).map((e) => ({ tag: e[".tag"], name: e.name, path: e.path_display }));
}
