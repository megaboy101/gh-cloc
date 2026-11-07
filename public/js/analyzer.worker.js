// Web Worker: download the repo tarball via our proxy and count lines off the main thread.
import { analyzeTarball } from './analyze.js';

self.onmessage = async ({ data: { owner, repo, ref } }) => {
  try {
    const path = [owner, repo, ...(ref ? ref.split('/') : [])].map(encodeURIComponent).join('/');
    const res = await fetch(`/api/tarball/${path}`);
    if (!res.ok) {
      const msg = res.status === 404
        ? 'Repository or ref not found (is it public?)'
        : `Download failed (${res.status}) ${await res.text().catch(() => '')}`.trim();
      throw new Error(msg);
    }
    const t0 = performance.now();
    const result = await analyzeTarball(res.body, (p) => self.postMessage({ type: 'progress', ...p }));
    self.postMessage({ type: 'done', ...result, ms: Math.round(performance.now() - t0) });
  } catch (err) {
    self.postMessage({ type: 'error', message: err?.message ?? String(err) });
  }
};
