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
const SPEAKER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5v5h3.5L12 19V5L7.5 9.5H4z" fill="currentColor"/><path d="M15.5 8.5a4 4 0 0 1 0 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

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
  const audioCount = words.filter(w => w.hasAudio).length;
  els.total.textContent = `${audioCount}/${words.length} 🔊`;
  els.total.title = `${audioCount} of ${words.length} words have audio`;
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
      ${w.hasAudio ? `<span class="has-audio" title="Audio ready" aria-label="Audio ready">${SPEAKER_SVG}</span>` : ''}
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

  // Play / Stop
  els.play.addEventListener('click', () => {
    if (player.playing) stopPlayback();
    else startPlayback();
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
  const playable = selectedAudioWords().length;
  els.play.disabled = playable === 0 && !player.playing;
  els.play.title = playable === 0 ? 'Select words that have audio' : 'Play selected words';
}

/* ---------- Audio playback (Phase 2) ---------- */
const PART_ORDER = ['word', 'meaning', 'fi', 'en'];
const GAP_PART = 600;   // ms between parts of the same word
const GAP_WORD = 1200;  // ms between words

const player = { playing: false, queue: [], i: 0, audio: new Audio(), timer: null, currentIndex: null, autoOpened: null };

function audioSrc(index, part) {
  const safe = index.replace(/[^\w.-]/g, '_');
  return `audio/${safe}-${part}.mp3`;
}

// Selected words that have audio, kept in list order.
function selectedAudioWords() {
  return words.filter(w => selected.has(w.index) && w.hasAudio);
}

function buildQueue() {
  const q = [];
  const list = selectedAudioWords();
  list.forEach((w, wi) => {
    PART_ORDER.forEach((part, pi) => {
      const lastPartOfWord = pi === PART_ORDER.length - 1;
      const lastWord = wi === list.length - 1;
      let gapAfter = GAP_PART;
      if (lastPartOfWord) gapAfter = lastWord ? 0 : GAP_WORD;
      q.push({ index: w.index, fi: w.fi, part, src: audioSrc(w.index, part), gapAfter });
    });
  });
  return q;
}

function startPlayback() {
  player.queue = buildQueue();
  if (player.queue.length === 0) return;
  player.playing = true;
  player.i = 0;
  player.currentIndex = null;
  document.body.classList.add('is-playing');
  setPlayButton(true);
  playNext();
}

function playNext() {
  if (!player.playing) return;
  if (player.i >= player.queue.length) { stopPlayback(); return; }

  const item = player.queue[player.i];
  if (item.index !== player.currentIndex) {
    player.currentIndex = item.index;
    highlightPlaying(item.index);
  }

  const a = player.audio;
  a.src = item.src;
  a.onended = () => {
    if (!player.playing) return;
    player.timer = setTimeout(() => { player.i++; playNext(); }, item.gapAfter);
  };
  a.onerror = () => {
    if (!player.playing) return;
    player.i++; playNext(); // skip a missing/broken clip
  };
  a.play().catch(() => { /* autoplay blocked or interrupted */ if (player.playing) { player.i++; playNext(); } });
}

function stopPlayback() {
  player.playing = false;
  clearTimeout(player.timer);
  try { player.audio.pause(); } catch {}
  player.audio.onended = null;
  player.audio.onerror = null;
  player.i = 0;
  document.body.classList.remove('is-playing');
  highlightPlaying(null);
  setPlayButton(false);
  updateSelectionUI();
}

function setPlayButton(playing) {
  els.play.classList.toggle('playing', playing);
  els.play.disabled = false;
  els.play.innerHTML = playing
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg> Stop'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z" fill="currentColor"/></svg> Play';
}

function highlightPlaying(index) {
  // Collapse the card we auto-opened for the previous word (leave manually-opened ones).
  if (player.autoOpened) {
    setOpen(player.autoOpened, false);
    player.autoOpened = null;
  }
  els.list.querySelectorAll('.word-item.playing').forEach(el => el.classList.remove('playing'));
  if (index == null) return;

  const el = els.list.querySelector(`.word-item[data-index="${cssEscape(index)}"]`);
  if (el) {
    el.classList.add('playing');
    if (!el.classList.contains('open')) {
      setOpen(el, true);
      player.autoOpened = el; // remember so we can auto-collapse it next
    }
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

function setOpen(item, open) {
  item.classList.toggle('open', open);
  const btn = item.querySelector('.expand-btn');
  if (btn) btn.setAttribute('aria-expanded', open);
}

function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : s.replace(/["\\]/g, '\\$&');
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
