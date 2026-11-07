// Exclusion model. A file is excluded when:
//   (it matches an active rule OR was manually excluded) AND it wasn't manually re-included,
//   OR its language is excluded.
// Files are sorted by path, so every folder is a contiguous [start, end) index range.

export const PRESETS = [
  { id: 'tests', label: 'Tests', patterns: ['test/', 'tests/', '__tests__/', 'spec/', 'specs/', 'e2e/', '*.test.*', '*.spec.*', '*_test.*', 'test_*.py', '*Test.java', '*Test.kt', '*Tests.swift', '*Tests.cs', '*_spec.rb', 'conftest.py'] },
  { id: 'fixtures', label: 'Fixtures & mocks', patterns: ['fixtures/', 'fixture/', '__fixtures__/', 'testdata/', 'test-data/', 'test_data/', '__snapshots__/', '*.snap', '__mocks__/', 'mocks/', 'goldens/', 'golden/'] },
  { id: 'docs', label: 'Docs', patterns: ['docs/', 'doc/', 'documentation/', '*.md', '*.mdx', '*.rst', '*.adoc'] },
  { id: 'examples', label: 'Examples', patterns: ['examples/', 'example/', 'samples/', 'sample/', 'demo/', 'demos/', 'playground/'] },
  { id: 'vendor', label: 'Vendored', patterns: ['vendor/', 'node_modules/', 'third_party/', 'third-party/', 'thirdparty/', 'external/', 'extern/', 'deps/', 'bower_components/'] },
  { id: 'generated', label: 'Generated', patterns: ['dist/', 'build/', '*.min.js', '*.min.css', '*.map', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'composer.lock', '*.pb.go', '*_pb2.py', '*.generated.*', '*.g.dart', '*.freezed.dart', '*.designer.cs'] },
];
const presetById = new Map(PRESETS.map((p) => [p.id, p]));

/**
 * gitignore-flavoured globs:
 *   "name"   matches a file or folder called name at any depth
 *   "a/b"    is anchored to the repo root
 *   "dir/"   matches folders only
 *   * ? **   as usual
 */
export function globToRegExp(pattern) {
  let p = pattern.trim();
  const dirOnly = p.endsWith('/');
  p = p.replace(/^\/+|\/+$/g, '');
  if (!p) return null;
  const anchored = p.includes('/') || pattern.trim().startsWith('/');
  let body = '';
  for (let i = 0; i < p.length; i++) {
    const ch = p[i];
    if (ch === '*') {
      if (p[i + 1] === '*') {
        i++;
        if (p[i + 1] === '/') { i++; body += '(?:.*/)?'; } else body += '.*';
      } else body += '[^/]*';
    } else if (ch === '?') body += '[^/]';
    else body += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  const head = anchored ? '^' : '(?:^|/)';
  const tail = dirOnly ? '/' : '(?:/|$)';
  return new RegExp(head + body + tail);
}

export class FilterModel {
  /** @param {Array<{path, lang, code, comment, blank}>} files sorted by path */
  constructor(files) {
    this.files = files;
    const n = files.length;
    this.presets = new Set();
    this.patterns = [];
    this.langs = new Set();
    this.manualEx = new Set();
    this.manualIn = new Set();
    this.matchCache = new Map();
    this.ruleHit = new Uint8Array(n);
    this.pathEx = new Uint8Array(n);
    this.excluded = new Uint8Array(n);
    this.pathExPrefix = new Int32Array(n + 1);
    this.codePrefix = new Float64Array(n + 1);
    this.recompute();
  }

  /** Bitmap of files matching one glob (cached). */
  matches(pattern) {
    let m = this.matchCache.get(pattern);
    if (!m) {
      m = new Uint8Array(this.files.length);
      const re = globToRegExp(pattern);
      if (re) this.files.forEach((f, i) => { if (re.test(f.path)) m[i] = 1; });
      this.matchCache.set(pattern, m);
    }
    return m;
  }

  activePatterns() {
    return [...[...this.presets].flatMap((id) => presetById.get(id)?.patterns ?? []), ...this.patterns];
  }

  countMatches(patterns) {
    const hit = new Uint8Array(this.files.length);
    for (const p of patterns) { const m = this.matches(p); for (let i = 0; i < m.length; i++) hit[i] |= m[i]; }
    return hit.reduce((a, b) => a + b, 0);
  }

  recompute() {
    const { files, ruleHit, pathEx, excluded, pathExPrefix, codePrefix } = this;
    ruleHit.fill(0);
    for (const p of this.activePatterns()) {
      const m = this.matches(p);
      for (let i = 0; i < m.length; i++) ruleHit[i] |= m[i];
    }
    // Drop re-includes that no longer override anything.
    for (const path of this.manualIn) {
      const i = this.indexOf(path);
      if (i === -1 || !ruleHit[i]) this.manualIn.delete(path);
    }
    for (let i = 0; i < files.length; i++) {
      const f = files[i];
      pathEx[i] = (ruleHit[i] || this.manualEx.has(f.path)) && !this.manualIn.has(f.path) ? 1 : 0;
      excluded[i] = pathEx[i] || this.langs.has(f.lang) ? 1 : 0;
      pathExPrefix[i + 1] = pathExPrefix[i] + pathEx[i];
      codePrefix[i + 1] = codePrefix[i] + (excluded[i] ? 0 : f.code);
    }
  }

  indexOf(path) {
    // Binary search; files are sorted by path.
    let lo = 0, hi = this.files.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const p = this.files[mid].path;
      if (p === path) return mid;
      if (p < path) lo = mid + 1; else hi = mid - 1;
    }
    return -1;
  }

  /** 'on' | 'off' | 'mixed' for the path-level checkbox of a range. */
  rangeState(start, end) {
    const ex = this.pathExPrefix[end] - this.pathExPrefix[start];
    return ex === 0 ? 'on' : ex === end - start ? 'off' : 'mixed';
  }

  rangeCode(start, end) { return this.codePrefix[end] - this.codePrefix[start]; }

  /** Toggle a file or folder: fully included → exclude all, otherwise include all. */
  toggleRange(start, end) {
    const exclude = this.rangeState(start, end) === 'on';
    for (let i = start; i < end; i++) {
      const path = this.files[i].path;
      if (exclude) {
        this.manualIn.delete(path);
        this.manualEx.add(path);
      } else {
        this.manualEx.delete(path);
        if (this.ruleHit[i]) this.manualIn.add(path);
      }
    }
    this.recompute();
  }

  togglePreset(id) {
    this.presets.has(id) ? this.presets.delete(id) : this.presets.add(id);
    this.recompute();
  }

  addPattern(pattern) {
    const p = pattern.trim();
    if (!p || this.patterns.includes(p) || !globToRegExp(p)) return false;
    this.patterns.push(p);
    this.recompute();
    return true;
  }

  removePattern(p) {
    this.patterns = this.patterns.filter((x) => x !== p);
    this.recompute();
  }

  toggleLang(lang) {
    this.langs.has(lang) ? this.langs.delete(lang) : this.langs.add(lang);
    this.recompute();
  }

  reset() {
    this.presets.clear(); this.patterns = []; this.langs.clear();
    this.manualEx.clear(); this.manualIn.clear();
    this.recompute();
  }

  get isFiltered() {
    return this.presets.size || this.patterns.length || this.langs.size || this.manualEx.size || this.manualIn.size;
  }

  // --- URL (de)serialisation. Manual path sets are compressed to whole folders where possible.

  writeParams(params) {
    for (const k of ['p', 'x', 'l', 'me', 'mi']) params.delete(k);
    if (this.presets.size) params.set('p', [...this.presets].join(','));
    for (const x of this.patterns) params.append('x', x);
    for (const l of this.langs) params.append('l', l);
    for (const p of this.compress(this.manualEx)) params.append('me', p);
    for (const p of this.compress(this.manualIn)) params.append('mi', p);
  }

  readParams(params) {
    this.presets = new Set((params.get('p') ?? '').split(',').filter((id) => presetById.has(id)));
    this.patterns = params.getAll('x').filter((x) => globToRegExp(x));
    this.langs = new Set(params.getAll('l'));
    this.manualEx = this.expand(params.getAll('me'));
    this.manualIn = this.expand(params.getAll('mi'));
    // manualIn is only meaningful against rules, which are now set.
    this.recompute();
  }

  compress(set) {
    if (!set.size) return [];
    const out = [];
    const walk = (dir, start, end) => {
      // dir: "" for root or "a/b/"; files[start..end) all live under it.
      let all = true;
      for (let i = start; i < end; i++) if (!set.has(this.files[i].path)) { all = false; break; }
      if (all && dir) { out.push(dir); return; }
      let i = start;
      while (i < end) {
        const rest = this.files[i].path.slice(dir.length);
        const slash = rest.indexOf('/');
        if (slash === -1) {
          if (set.has(this.files[i].path)) out.push(this.files[i].path);
          i++;
          continue;
        }
        const sub = dir + rest.slice(0, slash + 1);
        let j = i;
        while (j < end && this.files[j].path.startsWith(sub)) j++;
        walk(sub, i, j);
        i = j;
      }
    };
    walk('', 0, this.files.length);
    return out;
  }

  expand(entries) {
    const set = new Set();
    for (const e of entries) {
      if (e.endsWith('/')) { for (const f of this.files) if (f.path.startsWith(e)) set.add(f.path); }
      else if (this.indexOf(e) !== -1) set.add(e);
    }
    return set;
  }
}

/** Sort comparator that keeps every folder's files contiguous. */
export const byPath = (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
