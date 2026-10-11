/**
 * GitHub REST APIの最小限のクライアント（fetchベース、`gh` CLI不使用）。
 *
 * 他スクリプト（dropbox-client.mjs、notion-client.mjs）と同じく、依存追加を避けて
 * Node標準のfetchだけで実装する。imsaif/design-with-claude のresearch-scout
 * ブランチは `gh` CLIのexecFileSyncで実装していたが、design-research-pipeline側は
 * CLIへの依存を増やさない方針に合わせてfetchへ置き換えた。
 *
 * 認証は GITHUB_TOKEN（GitHub Actionsが自動発行するトークン、またはローカルの
 * Personal Access Token）を使う。新しいSecretの追加は不要。
 */
import { requireEnv } from "../lib/env.mjs";

const API_BASE = "https://api.github.com";
// 【2026-10-11修正】実際にGitHub Actions上で動かしたところ、ドキュメント上の
// code-search上限（10/min）より厳しいsecondary rate limitに、間隔6.5秒・2回連続の
// リクエストだけで到達することを確認した（GITHUB_TOKENのsearch APIクォータは
// 想定より厳しいらしい）。間隔を広げ、リトライも1回限りではなく、サーバーが返す
// 「try again in Xs」またはRetry-Afterヘッダーに従って複数回まで粘るようにした。
const SEARCH_MIN_INTERVAL_MS = 10_000; // ~6 req/min。想定より厳しいレート制限への安全マージン
const RATE_LIMIT_BACKOFF_MS = 60_000; // Retry-After等が取得できない場合のフォールバック
const MAX_RATE_LIMIT_RETRIES = 4;

let lastSearchAt = 0;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function throttleSearch() {
  const wait = SEARCH_MIN_INTERVAL_MS - (Date.now() - lastSearchAt);
  if (wait > 0) await sleep(wait);
  lastSearchAt = Date.now();
}

function authHeaders() {
  const token = requireEnv("GITHUB_TOKEN");
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

/** レスポンスから待機すべき秒数を読み取る（Retry-Afterヘッダー優先、無ければ本文の"try again in Xs"を解析） */
function parseRetryAfterMs(response, bodyText) {
  const header = response.headers.get("retry-after");
  if (header && !Number.isNaN(Number(header))) return Number(header) * 1000;
  const match = bodyText.match(/try again in ([\d.]+)s/i);
  if (match) return Math.ceil(Number(match[1])) * 1000;
  return RATE_LIMIT_BACKOFF_MS;
}

async function githubFetch(path, { search = false } = {}) {
  if (search) await throttleSearch();

  for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt += 1) {
    const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
    if (response.ok) return response.json();

    const text = await response.text().catch(() => "");
    const isRateLimit = response.status === 429 || (response.status === 403 && /rate limit|try again/i.test(text));
    if (!isRateLimit || attempt === MAX_RATE_LIMIT_RETRIES) {
      throw new Error(`GitHub APIエラー（${response.status} ${path}）: ${text}`);
    }

    const waitMs = parseRetryAfterMs(response, text);
    console.error(`  ・レート制限に到達。${Math.ceil(waitMs / 1000)}秒待機してリトライします（${attempt + 1}/${MAX_RATE_LIMIT_RETRIES}）...`);
    await sleep(waitMs);
    lastSearchAt = Date.now();
  }

  // ここには到達しない（ループ内で必ずreturn/throwする）
  throw new Error(`GitHub APIエラー: リトライ上限に到達しました（${path}）`);
}

/**
 * 指紋（GitHub code-search修飾子）の directional な総件数（total_count）を取得する。
 * 揮発性が高く、リポジトリ単位ではなくインデックス済みファイル単位の数字であることに注意。
 */
export async function searchCount(query) {
  const data = await githubFetch(`/search/code?q=${encodeURIComponent(query)}&per_page=1`, { search: true });
  return data.total_count;
}

/**
 * 指紋に一致するユニークなリポジトリ名を`limit`件まで取得する（GitHub側の上限は1,000件）。
 * 必要なページ数だけ取得し、全件を取りに行かない。
 * 戻り値: { repos: string[], totalCount: number, hitCap: boolean }
 */
export async function searchRepos(query, limit) {
  const perPage = 100;
  const maxPages = Math.min(10, Math.ceil(limit / perPage) + 1); // GitHub側の上限は10ページ×100件
  const collected = [];
  let totalCount = 0;
  let hitCap = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const data = await githubFetch(
      `/search/code?q=${encodeURIComponent(query)}&per_page=${perPage}&page=${page}`,
      { search: true },
    );
    totalCount = data.total_count;
    const names = (data.items || []).map((item) => item.repository.full_name);
    collected.push(...names);
    if (names.length < perPage) break; // 最終ページ
    if (page === maxPages && maxPages === 10) hitCap = true;
    if (new Set(collected).size >= limit) break;
  }

  const repos = [...new Set(collected)];
  return { repos: repos.slice(0, limit), totalCount, hitCap };
}

/**
 * リポジトリ内の特定パスの最初のコミット日時を取得する（リポジトリ作成日ではない）。
 * GitHubは新しい順でコミットを返すため、最後まで辿った最古のコミットを採用する。
 * 取得できない場合（削除済み・空リポジトリ・レート制限等）はnullを返し、呼び出し側でスキップする。
 */
export async function firstCommitDate(repo, path) {
  if (!path) return null;
  const MAX_PAGES = 10; // 100件/ページ×10 = 最大1,000コミットまで遡る
  let oldest = null;
  try {
    for (let page = 1; page <= MAX_PAGES; page += 1) {
      const data = await githubFetch(
        `/repos/${repo}/commits?path=${encodeURIComponent(path)}&per_page=100&page=${page}`,
      );
      if (!Array.isArray(data) || data.length === 0) break;
      oldest = data[data.length - 1]?.commit?.committer?.date || oldest;
      if (data.length < 100) break; // 最終ページ
    }
  } catch {
    return null;
  }
  return oldest;
}
