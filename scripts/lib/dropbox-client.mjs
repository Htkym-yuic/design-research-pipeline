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
 * Dropbox上に1ファイルをアップロードする（mode: overwrite）。
 * 150MBを超える大きいファイルは扱わない想定（スクリーンショット・JSON程度のみ）。
 *
 * @param {string} dropboxPath 例: "/design/Design_Research_Library/LP_Research_Library/.../LP-0223_PC_full.png"
 * @param {Buffer} fileBuffer
 */
export async function uploadFile(dropboxPath, fileBuffer) {
  const accessToken = await getAccessToken();

  const apiArg = JSON.stringify({
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

/** フォルダを作成する（既に存在する場合のエラーは無視する） */
export async function ensureFolder(dropboxPath) {
  const accessToken = await getAccessToken();

  const response = await fetch(CREATE_FOLDER_URL, {
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
