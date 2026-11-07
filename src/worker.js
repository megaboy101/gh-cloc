// Cloudflare Worker: serves the static site and proxies GitHub tarballs.
// codeload.github.com doesn't send CORS headers, so the browser can't fetch archives
// directly. This proxy only streams bytes through (no parsing), so it stays cheap.

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._\/-]{1,255}$/;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/tarball/')) return tarball(url, request);
    if (url.pathname.startsWith('/api/')) return text('Not found', 404);
    return env.ASSETS.fetch(request);
  },
};

async function tarball(url, request) {
  if (request.method !== 'GET') return text('Method not allowed', 405);
  const [owner, repo, ...rest] = url.pathname.slice('/api/tarball/'.length).split('/').map(decodeURIComponent);
  const ref = rest.join('/') || 'HEAD';
  if (!OWNER.test(owner ?? '') || !REPO.test(repo ?? '') || !REF.test(ref) || ref.includes('..')) {
    return text('Invalid repository', 400);
  }

  const upstream = await fetch(`https://codeload.github.com/${owner}/${repo}/tar.gz/${ref}`, {
    headers: { 'User-Agent': 'github-cloc' },
    // Commit SHAs are immutable; branch names get a short edge cache.
    cf: { cacheEverything: true, cacheTtl: /^[0-9a-f]{40}$/.test(ref) ? 86400 : 300 },
  });
  if (!upstream.ok) return text(upstream.status === 404 ? 'Not found' : 'Upstream error', upstream.status);

  const headers = new Headers({
    'Content-Type': 'application/gzip',
    'Cache-Control': 'public, max-age=300',
  });
  const len = upstream.headers.get('Content-Length');
  if (len) headers.set('Content-Length', len);
  return new Response(upstream.body, { headers });
}

function text(body, status) {
  return new Response(body, { status, headers: { 'Content-Type': 'text/plain' } });
}
