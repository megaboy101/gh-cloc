# gh·cloc

Count lines of code in any public GitHub repo, right in the browser. Shows cloc-style
code / comment / blank stats per language, and lets you exclude tests, fixtures, docs,
vendored code, custom glob patterns, individual folders/files, or whole languages.

Tip: swap `github.com` for your deployed domain in any repo URL, e.g. `https://<your-domain>/facebook/react`.

## How it works

```
browser ──/api/tarball/owner/repo/ref──▶ Cloudflare Worker ──▶ codeload.github.com
   │                                    (streams bytes through; no parsing)
   └─ Web Worker: DecompressionStream(gzip) → streaming tar reader → line counter
```

- **The Worker is just a CORS proxy.** GitHub's archive host doesn't send CORS headers,
  so the browser can't download tarballs directly. The Worker only streams bytes, which
  keeps it well under free-tier CPU limits.
- **All counting happens in the browser**, in a Web Worker, so the UI never blocks.
  Plain JS handles tens of MB/s, and download speed is the real bottleneck, so WASM wasn't worth a build step.
- Search and repo metadata call `api.github.com` directly from the browser, so rate
  limits (10 searches/min, 60 lookups/hr unauthenticated) apply per visitor.
- Filters live in the URL, so any filtered view can be shared.

Accuracy: within ~0.5% of `cloc --skip-uniqueness` on the repos tested. Unlike cloc,
it doesn't dedupe identical files, and it tracks string literals so comment markers
inside strings aren't miscounted.

## Layout

```
public/              static site (no build step)
  index.html
  styles.css         vanilla CSS: layers, nesting, light-dark(), oklch, container queries
  js/app.js          UI, routing, autocomplete
  js/analyzer.worker.js  Web Worker entry
  js/analyze.js      tarball → per-file stats
  js/tar.js          streaming tar reader
  js/counter.js      code/comment/blank classifier
  js/languages.js    language definitions (add more here)
  js/filters.js      exclusion model + presets + URL state
  js/tree.js         lazy folder tree
src/worker.js        Cloudflare Worker (tarball proxy + static assets)
```

## Develop & deploy

```sh
npm install        # only dependency: wrangler
npm run dev        # http://localhost:8787
npm run deploy     # first run will prompt you to log in to Cloudflare
```
