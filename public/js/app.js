import { parseRepoInput, searchRepos, getRepo } from './github.js';
import { FilterModel, PRESETS, byPath } from './filters.js';
import { rootNode, children, compact } from './tree.js';

// ------------------------------------------------------------------ helpers

const $ = (sel) => document.querySelector(sel);
const fmt = new Intl.NumberFormat();
const short = new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 });
const pct = (n, d) => (d ? (n / d) * 100 : 0);
const pctText = (n, d) => { const p = pct(n, d); return p > 0 && p < 0.1 ? '<0.1%' : `${p.toFixed(1)}%`; };
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="#i-${name}"/></svg>`;
const SERIES_SLOTS = 8;

const els = {
  intro: $('#intro'), examples: $('#examples'), form: $('#search-form'), q: $('#q'), list: $('#suggestions'),
  status: $('#status'), statusTitle: $('#status-title'), statusDetail: $('#status-detail'), cancel: $('#cancel'),
  error: $('#error'), results: $('#results'), repoCard: $('#repo-card'), summary: $('#summary-bar'),
  stats: $('#stats'), segbar: $('#segbar'), readout: $('#segbar-readout'), langTable: $('#lang-table'),
  presets: $('#presets'), patternForm: $('#pattern-form'), pattern: $('#pattern'), patterns: $('#patterns'),
  tree: $('#tree'), ignoredNote: $('#ignored-note'),
};

/** Current repo view. */
let state = null;
const cache = new Map(); // "owner/repo@ref" -> analysis result
let loadSeq = 0;
let worker = null;
let rejectWorker = null;

// ------------------------------------------------------------------ routing

function routeFromLocation() {
  if (location.pathname.length <= 1) return null;
  const target = parseRepoInput(decodeURIComponent(location.pathname));
  if (!target) return null;
  const params = new URLSearchParams(location.search);
  if (params.get('ref')) target.ref = params.get('ref');
  return { target, params };
}

function pathFor({ owner, repo, ref }, params = new URLSearchParams()) {
  if (ref) params.set('ref', ref);
  const qs = params.toString().replace(/%2F/gi, '/').replace(/%2C/gi, ',');
  return `/${owner}/${repo}${qs ? `?${qs}` : ''}`;
}

function syncUrl() {
  if (!state) return;
  const params = new URLSearchParams();
  state.model.writeParams(params);
  const url = pathFor({ owner: state.owner, repo: state.repo, ref: state.refExplicit ? state.ref : null }, params);
  if (url !== location.pathname + location.search) history.replaceState(null, '', url);
}

function go(target) {
  history.pushState(null, '', pathFor(target));
  load(target);
}

globalThis.addEventListener('popstate', () => {
  const route = routeFromLocation();
  if (route) load(route.target, route.params);
  else showHome();
});

// ------------------------------------------------------------------ loading

function showHome() {
  cancelWorker();
  state = null;
  els.intro.hidden = false;
  els.results.hidden = true;
  els.status.hidden = true;
  els.error.hidden = true;
  els.q.value = '';
  document.title = 'gh·cloc — count lines of code in any GitHub repo';
}

function showStatus(title, detail = '') {
  els.status.hidden = false;
  els.statusTitle.textContent = title;
  els.statusDetail.textContent = detail;
}

function showError(message) {
  els.status.hidden = true;
  els.error.hidden = false;
  els.error.textContent = message;
}

function cancelWorker() {
  worker?.terminate();
  worker = null;
  rejectWorker?.(Object.assign(new Error('Cancelled'), { cancelled: true }));
  rejectWorker = null;
}

function runWorker(owner, repo, ref) {
  cancelWorker();
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL('./analyzer.worker.js', import.meta.url), { type: 'module' });
    worker = w;
    rejectWorker = reject;
    const finish = () => { w.terminate(); if (worker === w) { worker = null; rejectWorker = null; } };
    w.onmessage = ({ data }) => {
      if (data.type === 'progress') {
        showStatus('Counting lines…', `${(data.bytes / 1e6).toFixed(1)} MB downloaded · ${fmt.format(data.files)} files`);
      } else if (data.type === 'done') { finish(); resolve(data); }
      else { finish(); reject(new Error(data.message)); }
    };
    w.onerror = (e) => { finish(); reject(new Error(e.message || 'Analysis failed')); };
    w.postMessage({ owner, repo, ref });
  });
}

async function load(target, params = null) {
  const seq = ++loadSeq;
  hideSuggestions();
  els.q.value = `${target.owner}/${target.repo}`;
  els.q.blur();
  els.intro.hidden = true;
  els.error.hidden = true;
  els.results.hidden = true;
  showStatus('Downloading…', `${target.owner}/${target.repo}`);
  document.title = `${target.owner}/${target.repo} · gh·cloc`;

  const key = `${target.owner}/${target.repo}@${target.ref ?? ''}`.toLowerCase();
  let data = cache.get(key);
  if (!data) {
    // Metadata (for the default branch name, stars, …) and the archive download run in parallel.
    const metaP = getRepo(target.owner, target.repo);
    try {
      const result = await runWorker(target.owner, target.repo, target.ref ?? 'HEAD');
      const meta = await metaP;
      result.files.sort(byPath);
      const [owner, repo] = (meta?.fullName ?? `${target.owner}/${target.repo}`).split('/');
      data = { ...result, owner, repo, meta, ref: target.ref ?? meta?.defaultBranch ?? 'HEAD', refExplicit: !!target.ref };
      cache.set(key, data);
    } catch (err) {
      if (seq !== loadSeq || err.cancelled) return;
      const meta = await metaP;
      showError(meta?.notFound ? `Couldn't find ${target.owner}/${target.repo}. Is it a public repository?` : err.message);
      return;
    }
  }
  if (seq !== loadSeq) return;
  addRecent(`${data.owner}/${data.repo}`);
  showResults(data, params);
}

els.cancel.addEventListener('click', () => {
  loadSeq++;
  cancelWorker();
  els.status.hidden = true;
  if (!state) { showHome(); history.replaceState(null, '', '/'); return; }
  // Go back to the repo that was showing before.
  els.results.hidden = false;
  els.q.value = `${state.owner}/${state.repo}`;
  document.title = `${state.owner}/${state.repo} · gh·cloc`;
  syncUrl();
});

// ------------------------------------------------------------------ results

function langTotals(files, mask) {
  const m = new Map();
  for (let i = 0; i < files.length; i++) {
    if (mask && mask[i]) continue;
    const f = files[i];
    let t = m.get(f.lang);
    if (!t) m.set(f.lang, (t = { lang: f.lang, files: 0, code: 0, comment: 0, blank: 0 }));
    t.files++; t.code += f.code; t.comment += f.comment; t.blank += f.blank;
  }
  return m;
}

function sumTotals(map) {
  const s = { files: 0, code: 0, comment: 0, blank: 0 };
  for (const t of map.values()) { s.files += t.files; s.code += t.code; s.comment += t.comment; s.blank += t.blank; }
  return s;
}

function showResults(data, params) {
  const { files } = data;
  const model = new FilterModel(files);
  if (params) model.readParams(params);

  const all = langTotals(files);
  // Colour follows the language, assigned once by unfiltered rank, so filtering never repaints.
  const ranked = [...all.values()].sort((a, b) => b.code - a.code);
  const colors = new Map(ranked.map((t, i) => [t.lang, i < SERIES_SLOTS ? `var(--series-${i + 1})` : 'var(--series-other)']));

  const totalCode = new Float64Array(files.length + 1);
  files.forEach((f, i) => { totalCode[i + 1] = totalCode[i] + f.code; });

  state = { ...data, model, all, allSum: sumTotals(all), colors, totalCode, root: rootNode(files), pinnedLang: null };

  els.status.hidden = true;
  els.results.hidden = false;
  renderRepoCard();
  renderPresets();
  renderTree();
  els.ignoredNote.textContent = data.ignored
    ? `${fmt.format(data.ignored)} binary or unrecognized files not counted.`
    : '';
  update();
}

/** Re-render everything that depends on the filter state. */
function update() {
  const { model, files } = state;
  const visible = langTotals(files, model.excluded);
  const sum = sumTotals(visible);
  state.visible = visible;
  state.sum = sum;
  renderStats(sum);
  renderLanguages(visible, sum);
  renderPatterns();
  for (const btn of els.presets.querySelectorAll('[data-preset]')) {
    btn.setAttribute('aria-pressed', model.presets.has(btn.dataset.preset));
  }
  updateTree();
  syncUrl();
}

function renderRepoCard() {
  const { owner, repo, meta, ref, commit, ms, bytes } = state;
  const url = meta?.htmlUrl ?? `https://github.com/${owner}/${repo}`;
  const commitLink = commit
    ? `<span>${icon('commit')}<a href="${esc(url)}/commit/${esc(commit)}"><code>${esc(commit.slice(0, 7))}</code></a></span>`
    : '';
  els.repoCard.innerHTML = `
    <h2><a href="${esc(url)}" target="_blank" rel="noopener"><span class="owner">${esc(owner)}/</span>${esc(repo)}</a></h2>
    <button type="button" class="btn btn-outline btn-sm" id="share">${icon('link')}<span>Share</span></button>
    ${meta?.description ? `<p class="desc">${esc(meta.description)}</p>` : ''}
    <div class="meta">
      <span>${icon('branch')}${esc(ref)}</span>
      ${commitLink}
      ${meta?.stars != null ? `<span>${icon('star')}${short.format(meta.stars)}</span>` : ''}
      <span>${icon('clock')}${(ms / 1000).toFixed(1)}s · ${(bytes / 1e6).toFixed(1)} MB</span>
    </div>`;
  $('#share').addEventListener('click', share);
}

async function share(e) {
  const btn = e.currentTarget;
  const url = location.href;
  if (navigator.share && matchMedia('(pointer: coarse)').matches) {
    try { await navigator.share({ title: `${state.owner}/${state.repo} lines of code`, url }); } catch {}
    return;
  }
  await navigator.clipboard.writeText(url);
  btn.querySelector('span').textContent = 'Copied';
  setTimeout(() => { btn.querySelector('span').textContent = 'Share'; }, 1500);
}

function renderStats(sum) {
  const all = state.allSum;
  const filtered = state.model.isFiltered;
  const lines = sum.code + sum.comment + sum.blank;
  const tile = (label, value, total, cls = '') => `
    <div class="card stat ${cls}">
      <div class="label">${label}</div>
      <div class="value">${fmt.format(value)}</div>
      <div class="sub">${filtered ? `of ${fmt.format(total)}` : label === 'Files' ? '' : `${pctText(value, lines)} of lines`}</div>
    </div>`;
  els.stats.innerHTML =
    tile('Code', sum.code, all.code, 'hero') +
    tile('Comments', sum.comment, all.comment) +
    tile('Blank', sum.blank, all.blank) +
    tile('Files', sum.files, all.files);
}

function renderLanguages(visible, sum) {
  const { colors, model, all } = state;

  // Bar: one segment per coloured language, everything past the palette folds into "Other".
  const rows = [...visible.values()].sort((a, b) => b.code - a.code);
  const segs = [];
  const other = { lang: 'Other', code: 0, color: 'var(--series-other)' };
  for (const t of rows) {
    if (!t.code) continue;
    const color = colors.get(t.lang);
    if (color === 'var(--series-other)') other.code += t.code;
    else segs.push({ lang: t.lang, code: t.code, color });
  }
  if (other.code) segs.push(other);
  els.segbar.innerHTML = segs
    .map((s) => `<span style="flex-grow:${s.code};--c:${s.color}" data-lang="${esc(s.lang)}" data-code="${s.code}"></span>`)
    .join('');
  els.segbar.setAttribute('aria-label', `Code by language: ${segs.map((s) => `${s.lang} ${pctText(s.code, sum.code)}`).join(', ')}`);
  setReadout(state.pinnedLang);

  // Table: visible languages by current size, excluded languages at the bottom.
  const excludedPathOnly = model.langs.size ? langTotals(state.files, model.pathEx) : null;
  const off = [...model.langs].filter((l) => all.has(l))
    .map((l) => excludedPathOnly.get(l) ?? { lang: l, files: 0, code: 0, comment: 0, blank: 0 })
    .sort((a, b) => b.code - a.code);
  const row = (t, isOff) => `
    <tr data-lang="${esc(t.lang)}" class="${isOff ? 'off' : ''}${state.pinnedLang === t.lang ? ' hot' : ''}">
      <td><div class="lang-cell">
        <input type="checkbox" class="check" ${isOff ? '' : 'checked'} aria-label="Include ${esc(t.lang)}">
        <span class="swatch" style="--c:${colors.get(t.lang)}"></span>
        <span class="lang-name">${esc(t.lang)}</span>
      </div></td>
      <td>${fmt.format(t.files)}</td>
      <td class="extra">${fmt.format(t.comment)}</td>
      <td class="extra">${fmt.format(t.blank)}</td>
      <td>${fmt.format(t.code)}</td>
      <td class="pct">${isOff ? '—' : pctText(t.code, sum.code)}</td>
    </tr>`;
  els.langTable.innerHTML = `
    <thead><tr><th scope="col">Language</th><th scope="col">Files</th><th scope="col" class="extra">Comment</th><th scope="col" class="extra">Blank</th><th scope="col">Code</th><th scope="col"><span class="visually-hidden">Share</span></th></tr></thead>
    <tbody>${rows.map((t) => row(t, false)).join('')}${off.map((t) => row(t, true)).join('')}</tbody>
    <tfoot><tr><td>Total</td><td>${fmt.format(sum.files)}</td><td class="extra">${fmt.format(sum.comment)}</td><td class="extra">${fmt.format(sum.blank)}</td><td>${fmt.format(sum.code)}</td><td></td></tr></tfoot>`;
}

function setReadout(lang) {
  const seg = lang && [...els.segbar.children].find((s) => s.dataset.lang === lang);
  if (!seg) {
    els.readout.textContent = '';
    for (const tr of els.langTable.querySelectorAll('tr.hot')) tr.classList.remove('hot');
    return;
  }
  const code = Number(seg.dataset.code);
  els.readout.innerHTML = `<strong>${esc(lang)}</strong> · ${fmt.format(code)} lines · ${pctText(code, state.sum.code)}`;
  for (const tr of els.langTable.querySelectorAll('tbody tr')) tr.classList.toggle('hot', tr.dataset.lang === lang);
}

els.segbar.addEventListener('pointerover', (e) => { if (e.target.dataset.lang) setReadout(e.target.dataset.lang); });
els.segbar.addEventListener('pointerleave', () => setReadout(state?.pinnedLang));
els.segbar.addEventListener('click', (e) => {
  const lang = e.target.dataset.lang;
  if (!lang) return;
  state.pinnedLang = state.pinnedLang === lang ? null : lang;
  setReadout(state.pinnedLang);
});

els.langTable.addEventListener('click', (e) => {
  const tr = e.target.closest('tbody tr');
  if (!tr) return;
  state.model.toggleLang(tr.dataset.lang);
  update();
});

// ------------------------------------------------------------------ filters

function renderPresets() {
  els.presets.innerHTML = PRESETS.map((p) => {
    const n = state.model.countMatches(p.patterns);
    return `<button type="button" class="chip" data-preset="${p.id}" aria-pressed="false" ${n ? '' : 'disabled'}
      title="${esc(p.patterns.join('  '))}">${esc(p.label)} <span class="count">${fmt.format(n)}</span></button>`;
  }).join('');
}

els.presets.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-preset]');
  if (!btn) return;
  state.model.togglePreset(btn.dataset.preset);
  update();
});

function renderPatterns() {
  els.patterns.innerHTML = state.model.patterns.map((p) => `
    <span class="chip">${esc(p)} <span class="count">${fmt.format(state.model.countMatches([p]))}</span>
      <button type="button" data-remove="${esc(p)}" aria-label="Remove ${esc(p)}">${icon('x')}</button>
    </span>`).join('');
}

els.patternForm.addEventListener('submit', (e) => {
  e.preventDefault();
  let added = false;
  for (const p of els.pattern.value.split(/[,\s]+/)) added = state.model.addPattern(p) || added;
  if (added) { els.pattern.value = ''; update(); }
});

els.patterns.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-remove]');
  if (!btn) return;
  state.model.removePattern(btn.dataset.remove);
  update();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('[data-reset]')) return;
  state.model.reset();
  update();
});

// ------------------------------------------------------------------ file tree

let treeNodes = [];

function renderTree() {
  treeNodes = [];
  els.tree.innerHTML = '';
  const top = compact(state.files, state.root);
  renderChildren(top, els.tree, 0);
}

function renderChildren(node, container, depth) {
  const frag = document.createDocumentFragment();
  for (const kid of children(state.files, node)) {
    const n = kid.dir ? compact(state.files, kid) : kid;
    const id = treeNodes.push(n) - 1;
    const row = document.createElement('div');
    row.className = `tree-row${n.dir ? ' dir' : ''}`;
    row.role = 'treeitem';
    row.dataset.n = id;
    row.style.setProperty('--depth', depth);
    row.setAttribute('aria-level', depth + 1);
    if (n.dir) row.setAttribute('aria-expanded', 'false');
    row.innerHTML = `
      ${n.dir ? `<button type="button" class="toggle" tabindex="-1" aria-hidden="true">${icon('chevron')}</button>` : '<span class="spacer"></span>'}
      <input type="checkbox" class="check" aria-label="Include ${esc(n.name)}">
      <span class="name" title="${esc(n.path)}">${esc(n.name)}</span>
      <span class="lines"></span>`;
    n.row = row;
    updateRow(n);
    frag.append(row);
    if (n.dir) {
      const group = document.createElement('div');
      group.role = 'group';
      group.hidden = true;
      n.group = group;
      frag.append(group);
    }
  }
  container.append(frag);
}

function updateRow(n) {
  const { model, totalCode } = state;
  const s = model.rangeState(n.start, n.end);
  const box = n.row.querySelector('.check');
  box.checked = s === 'on';
  box.indeterminate = s === 'mixed';
  n.row.classList.toggle('off', s === 'off');
  const lines = s === 'off' ? totalCode[n.end] - totalCode[n.start] : model.rangeCode(n.start, n.end);
  const cell = n.row.querySelector('.lines');
  cell.textContent = short.format(lines);
  cell.title = `${fmt.format(lines)} lines of code`;
}

function updateTree() {
  for (const n of treeNodes) if (n.row.isConnected) updateRow(n);
}

function toggleFolder(n) {
  const open = n.row.getAttribute('aria-expanded') !== 'true';
  if (open && !n.group.childElementCount) renderChildren(n, n.group, Number(n.row.style.getPropertyValue('--depth')) + 1);
  n.row.setAttribute('aria-expanded', open);
  n.group.hidden = !open;
}

els.tree.addEventListener('click', (e) => {
  const row = e.target.closest('.tree-row');
  if (!row) return;
  const n = treeNodes[row.dataset.n];
  if (e.target.matches('.check') || (!n.dir && e.target.closest('.name'))) {
    state.model.toggleRange(n.start, n.end);
    update();
  } else if (n.dir && (e.target.closest('.toggle') || e.target.closest('.name'))) {
    toggleFolder(n);
  }
});

// ------------------------------------------------------------------ search + autocomplete

let suggestions = [];
let active = -1;
let searchTimer = 0;
let searchAbort = null;

const recents = () => { try { return JSON.parse(localStorage.getItem('recent') ?? '[]'); } catch { return []; } };
function addRecent(name) {
  const list = [name, ...recents().filter((r) => r.toLowerCase() !== name.toLowerCase())].slice(0, 6);
  localStorage.setItem('recent', JSON.stringify(list));
}

function hideSuggestions() {
  els.list.hidden = true;
  els.q.setAttribute('aria-expanded', 'false');
  els.q.removeAttribute('aria-activedescendant');
  active = -1;
}

function renderSuggestions(items, { label = '', note = '' } = {}) {
  suggestions = items;
  active = -1;
  els.q.removeAttribute('aria-activedescendant');
  if (!items.length && !note) return hideSuggestions();
  els.list.innerHTML =
    (label ? `<li class="suggestion-label" role="presentation">${esc(label)}</li>` : '') +
    items.map((s, i) => `
      <li class="suggestion" role="option" id="sug-${i}" data-i="${i}" aria-selected="false">
        <span class="name">${s.kind === 'direct' ? 'Open ' : ''}${esc(s.fullName)}${s.target?.ref ? ` <span class="muted">@ ${esc(s.target.ref)}</span>` : ''}</span>
        ${s.stars != null ? `<span class="meta">${icon('star')}${short.format(s.stars)}</span>` : '<span></span>'}
        ${s.language || s.description ? `<span class="desc">${[s.language, s.description].filter(Boolean).map(esc).join(' · ')}</span>` : ''}
      </li>`).join('') +
    (note ? `<li class="suggestion-note" role="presentation">${esc(note)}</li>` : '');
  els.list.hidden = false;
  els.q.setAttribute('aria-expanded', 'true');
}

function setActive(i) {
  const opts = els.list.querySelectorAll('[role="option"]');
  if (!opts.length) return;
  active = (i + opts.length) % opts.length;
  opts.forEach((o, j) => o.setAttribute('aria-selected', j === active));
  els.q.setAttribute('aria-activedescendant', `sug-${active}`);
  opts[active].scrollIntoView({ block: 'nearest' });
}

function onInput() {
  const v = els.q.value.trim();
  clearTimeout(searchTimer);
  searchAbort?.abort();

  if (!v) {
    const r = recents().map((name) => ({ kind: 'recent', fullName: name, target: parseRepoInput(name) }));
    return renderSuggestions(r, { label: r.length ? 'Recent' : '' });
  }

  const direct = parseRepoInput(v);
  const base = direct ? [{ kind: 'direct', fullName: `${direct.owner}/${direct.repo}`, target: direct }] : [];
  // Keep the previous results on screen while a new search is in flight (avoids flicker).
  if (base.length || els.list.hidden) renderSuggestions(base);

  // Pasted URLs don't need a search round-trip.
  if (v.length < 2 || /github\.com|^git@|^https?:/i.test(v)) return;
  searchTimer = setTimeout(async () => {
    searchAbort = new AbortController();
    try {
      const items = await searchRepos(v.replace(/\//g, ' '), searchAbort.signal);
      if (els.q.value.trim() !== v) return;
      const list = items.map((it) => ({ kind: 'repo', ...it, target: parseRepoInput(it.fullName) }));
      // Promote an exact owner/repo hit (with its rich metadata) over the bare "Open …" row.
      const exact = direct && list.findIndex((it) => it.fullName.toLowerCase() === base[0].fullName.toLowerCase());
      if (exact > -1) { const [hit] = list.splice(exact, 1); renderSuggestions([hit, ...list]); }
      else renderSuggestions([...base, ...list]);
    } catch (err) {
      if (err.name !== 'AbortError') renderSuggestions(base, { note: err.rateLimited ? err.message : '' });
    }
  }, 250);
}

els.q.addEventListener('input', onInput);
els.q.addEventListener('focus', () => { if (!els.q.value) onInput(); });
els.q.addEventListener('blur', () => setTimeout(hideSuggestions, 100));
els.q.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); if (els.list.hidden) onInput(); else setActive(active + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(active - 1); }
  else if (e.key === 'Escape') hideSuggestions();
  else if (e.key === 'Enter' && active > -1 && !els.list.hidden) { e.preventDefault(); go(suggestions[active].target); }
});
els.list.addEventListener('mousedown', (e) => e.preventDefault()); // keep input focus
els.list.addEventListener('click', (e) => {
  const li = e.target.closest('[data-i]');
  if (li) go(suggestions[li.dataset.i].target);
});

els.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const v = els.q.value.trim();
  if (!v) return;
  const direct = parseRepoInput(v);
  if (direct) return go(direct);
  // A bare search term: take the top result.
  try {
    const [top] = await searchRepos(v);
    if (top) return go(parseRepoInput(top.fullName));
    showError(`No repositories match "${v}".`);
  } catch (err) {
    showError(err.message);
  }
});

els.examples.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-repo]');
  if (btn) go(parseRepoInput(btn.dataset.repo));
});

document.addEventListener('keydown', (e) => {
  if (e.key === '/' && !e.target.closest('input, textarea, [contenteditable]')) {
    e.preventDefault();
    els.q.focus();
    els.q.select();
  }
});

// ------------------------------------------------------------------ boot

const initial = routeFromLocation();
if (initial) load(initial.target, initial.params);
