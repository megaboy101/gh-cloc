# gh·cloc

Count lines of code in any public GitHub repo, right in the browser. Shows cloc-style
code / comment / blank stats per language, and lets you exclude tests, fixtures, docs,
vendored code, custom glob patterns, individual folders/files, or whole languages.

## How it works

```
browser ──/api/tarball/owner/repo/ref──▶ Cloudflare Worker ──▶ codeload.github.com
   │                                    (streams bytes through; no parsing)
   └─ Web Worker: DecompressionStream(gzip) → streaming tar reader → line counter
```

- **All counting happens in the browser** via a non-blocking Web Worker.
- GitHub's code archive doesn't support CORS,
  so the browser can't download tarballs directly. A Cloudflare Worker exists to route downloads through on demand.
- Search and repo metadata call `api.github.com` directly from the browser. Rate
  limits (10 searches/min, 60 lookups/hr unauthenticated) apply per visitor.
- Filters persist in the URL, so filters view can be shared.

Note: Unlike `cloc`, this won't dedupe identical files, and it tracks string literals so comment markers inside strings aren't miscounted.

## Project Layout

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
npm install
npm run dev        # http://localhost:8787
npm run deploy     # first run will prompt you to log in to Cloudflare
```
