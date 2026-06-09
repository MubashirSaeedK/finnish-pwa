'use strict';

const STORAGE_KEY = 'suomi200.selected';

const els = {
  list: document.getElementById('list'),
  empty: document.getElementById('empty'),
  search: document.getElementById('search'),
  clearSearch: document.getElementById('clearSearch'),
  total: document.getElementById('totalCount'),
  selCount: document.getElementById('selCount'),
  selectAll: document.getElementById('selectAll'),
  clearSel: document.getElementById('clearSel'),
  play: document.getElementById('play'),
};

let words = [];
let selected = loadSelection();
let query = '';
let hasRendered = false;

const CHECK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 13l4 4L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const CHEV_SVG = '<svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

init();

async function init() {
  try {
    const res = await fetch('words.json');
    words = await res.json();
  } catch (e) {
    els.empty.hidden = false;
    els.empty.textContent = 'Could not load words.json';
    return;
  }
  els.total.textContent = `${words.length} words`;
  render();
  updateSelectionUI();
  bindEvents();
  registerSW();
}

/* ---------- Rendering ---------- */
function render() {
  const q = query.trim().toLowerCase();
  const matches = q
    ? words.filter(w =>
        w.fi.toLowerCase().includes(q) ||
        w.en.toLowerCase().includes(q) ||
        w.index.toLowerCase().includes(q))
    : words;

  els.empty.hidden = matches.length > 0;
  els.list.innerHTML = matches.map(w => rowHTML(w, q)).join('');

  // Play the entrance animation only on the very first paint.
  els.list.classList.toggle('animate-in', !hasRendered);
  hasRendered = true;
}

function rowHTML(w, q) {
  const isSel = selected.has(w.index);
  return `
  <li class="word-item${isSel ? ' selected' : ''}" data-index="${esc(w.index)}">
    <div class="row-main" role="button" tabindex="0" aria-pressed="${isSel}" aria-label="Select ${esc(w.fi)}">
      <span class="idx">${esc(w.index)}</span>
      <span class="fi-word">${highlight(w.fi, q)}</span>
      <button class="expand-btn" type="button" aria-expanded="false" aria-label="Show details" tabindex="0">
        ${CHEV_SVG}
      </button>
      <label class="check" aria-label="Select ${esc(w.fi)}">
        <input type="checkbox" tabindex="-1" ${isSel ? 'checked' : ''} />
        <span class="box">${CHECK_SVG}</span>
      </label>
    </div>
    <div class="detail">
      <div class="detail-inner">
        <div class="detail-body">
          <p class="meaning">${highlight(w.en, q)}</p>
          <p class="sentence fi"><span class="lbl">FI</span><b>${esc(w.fiSentence)}</b></p>
          <p class="sentence en"><span class="lbl">EN</span>${esc(w.enSentence)}</p>
        </div>
      </div>
    </div>
  </li>`;
}

/* ---------- Row interactions ---------- */
function toggleOpen(item) {
  const open = item.classList.toggle('open');
  const btn = item.querySelector('.expand-btn');
  if (btn) btn.setAttribute('aria-expanded', open);
}

function toggleSelect(item) {
  const cb = item.querySelector('input[type="checkbox"]');
  const idx = item.dataset.index;
  const next = !cb.checked;
  cb.checked = next;
  if (next) selected.add(idx);
  else selected.delete(idx);
  item.classList.toggle('selected', next);
  const main = item.querySelector('.row-main');
  if (main) main.setAttribute('aria-pressed', next);
  saveSelection();
  updateSelectionUI();
}

/* ---------- Events ---------- */
function bindEvents() {
  // Tap anywhere on the row (except the dropdown button) to select/deselect.
  // Tap the dropdown button to expand/collapse details.
  els.list.addEventListener('click', (e) => {
    const item = e.target.closest('.word-item');
    if (!item) return;

    if (e.target.closest('.expand-btn')) {
      toggleOpen(item);
      return;
    }

    // Only the main row toggles selection; clicks inside the open detail do nothing.
    if (!e.target.closest('.row-main')) return;
    toggleSelect(item);
  });

  // Keyboard: Enter/Space on the row selects; the dropdown button handles its own.
  els.list.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('.expand-btn')) return; // native button activation
    const main = e.target.closest('.row-main');
    if (!main) return;
    e.preventDefault();
    toggleSelect(main.closest('.word-item'));
  });

  // Search
  els.search.addEventListener('input', () => {
    query = els.search.value;
    els.clearSearch.hidden = query.length === 0;
    render();
  });
  els.clearSearch.addEventListener('click', () => {
    query = '';
    els.search.value = '';
    els.clearSearch.hidden = true;
    render();
    els.search.focus();
  });

  // Selection actions
  els.selectAll.addEventListener('click', () => {
    visibleWords().forEach(w => selected.add(w.index));
    saveSelection();
    render();
    updateSelectionUI();
  });
  els.clearSel.addEventListener('click', () => {
    selected.clear();
    saveSelection();
    render();
    updateSelectionUI();
  });

  // Phase 2 placeholder
  els.play.addEventListener('click', () => {
    // Audio playback will be implemented in Phase 2 (ElevenLabs).
  });
}

function visibleWords() {
  const q = query.trim().toLowerCase();
  if (!q) return words;
  return words.filter(w =>
    w.fi.toLowerCase().includes(q) ||
    w.en.toLowerCase().includes(q) ||
    w.index.toLowerCase().includes(q));
}

/* ---------- Selection state ---------- */
function updateSelectionUI() {
  const n = selected.size;
  els.selCount.textContent = n;
  els.play.disabled = n === 0; // stays effectively disabled until Phase 2 too
  els.play.title = n === 0 ? 'Select words first' : 'Audio coming in Phase 2';
  // In Phase 1 keep Play visually inert even when items are selected:
  els.play.disabled = true;
}

function loadSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}
function saveSelection() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...selected])); } catch {}
}

/* ---------- Helpers ---------- */
function esc(s) {
  return String(s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function highlight(text, q) {
  const safe = esc(text);
  if (!q) return safe;
  const idx = safe.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return safe;
  // Re-find on the escaped string length basis using a simple case-insensitive split
  const re = new RegExp(`(${q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'ig');
  return safe.replace(re, '<mark>$1</mark>');
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('service-worker.js').catch(() => {});
  }
}
