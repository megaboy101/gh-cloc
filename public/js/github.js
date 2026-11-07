// GitHub helpers. Search + metadata hit api.github.com directly (CORS-enabled),
// so rate limits apply per visitor rather than to a shared server IP.

const API = 'https://api.github.com';

/**
 * Parse anything a person might paste: "owner/repo", full URLs, /tree/<ref> URLs,
 * SSH remotes, or a path on this site ("/owner/repo").
 * @returns {{ owner: string, repo: string, ref?: string } | null}
 */
export function parseRepoInput(input) {
  let s = input.trim();
  if (!s) return null;
  s = s.replace(/^git@github\.com:/i, '')
    .replace(/^(?:https?:\/\/)?(?:www\.)?github\.com\//i, '')
    .replace(/[?#].*$/, '')
    .replace(/^\/+|\/+$/g, '');
  const parts = s.split('/');
  if (parts.length < 2) return null;
  const owner = parts[0];
  const repo = parts[1].replace(/\.git$/i, '');
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  // github.com/o/r/tree/<ref> or /commit/<sha>; a ref may itself contain slashes.
  let ref;
  if ((parts[2] === 'tree' || parts[2] === 'commit' || parts[2] === 'blob') && parts[3]) {
    ref = parts[2] === 'blob' ? parts[3] : parts.slice(3).join('/');
  }
  return { owner, repo, ref };
}

const searchCache = new Map();

/** Repo search for autocomplete. Returns [] on error or rate limiting. */
export async function searchRepos(query, signal) {
  const q = query.trim();
  if (searchCache.has(q)) return searchCache.get(q);
  const res = await fetch(`${API}/search/repositories?q=${encodeURIComponent(q)}&per_page=8`, {
    signal,
    headers: { Accept: 'application/vnd.github+json' },
  });
  if (res.status === 403 || res.status === 429) {
    const err = new Error('GitHub search rate limit reached; paste a URL or owner/repo instead.');
    err.rateLimited = true;
    throw err;
  }
  if (!res.ok) return [];
  const { items = [] } = await res.json();
  const out = items.map((r) => ({
    fullName: r.full_name,
    description: r.description,
    stars: r.stargazers_count,
    language: r.language,
  }));
  searchCache.set(q, out);
  return out;
}

/** Repo metadata, or null if unavailable (e.g. rate limited) — analysis still works. */
export async function getRepo(owner, repo) {
  try {
    const res = await fetch(`${API}/repos/${owner}/${repo}`, {
      headers: { Accept: 'application/vnd.github+json' },
    });
    if (res.status === 404) return { notFound: true };
    if (!res.ok) return null;
    const r = await res.json();
    return {
      fullName: r.full_name,
      description: r.description,
      stars: r.stargazers_count,
      defaultBranch: r.default_branch,
      htmlUrl: r.html_url,
      sizeKb: r.size,
      private: r.private,
    };
  } catch {
    return null;
  }
}
