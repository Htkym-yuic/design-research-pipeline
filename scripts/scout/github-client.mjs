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
const SEARCH_MIN_INTERVAL_MS = 6500; // ~9 req/min。code-searchの上限(10/min)の下を保つ
const RATE_LIMIT_BACKOFF_MS = 60_000;

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

async function githubFetch(path, { search = false } = {}) {
  if (search) await throttleSearch();

  const response = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });

  if (response.status === 403 || response.status === 429) {
    const text = await response.text().catch(() => "");
    if (/rate limit/i.test(text) || response.status === 429) {
      console.error(`  ・レート制限に到達。${RATE_LIMIT_BACKOFF_MS / 1000}秒待機してリトライします...`);
      await sleep(RATE_LIMIT_BACKOFF_MS);
      lastSearchAt = Date.now();
      const retry = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
      if (!retry.ok) {
        const retryText = await retry.text().catch(() => "");
        throw new Error(`GitHub APIエラー（${retry.status} ${path}）: ${retryText}`);
      }
      return retry.json();
    }
    throw new Error(`GitHub APIエラー（${response.status} ${path}）: ${text}`);
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`GitHub APIエラー（${response.status} ${path}）: ${text}`);
  }

  return response.json();
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
