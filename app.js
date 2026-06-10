'use strict';

const STORAGE_KEY = 'suomi200.selected';
const SKIP_KEY = 'suomi200.sentenceSkip';
const MODE_KEY = 'suomi200.mode';

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
  chips: document.getElementById('chips'),
  npWord: document.getElementById('npWord'),
  npMeta: document.getElementById('npMeta'),
  npParts: document.getElementById('npParts'),
  npPrev: document.getElementById('npPrev'),
  npNext: document.getElementById('npNext'),
  modeSeg: document.getElementById('modeSeg'),
};

let words = [];
let selected = loadSelection();
let sentenceSkip = loadSentenceSkip(); // { index: { fi: true, en: true } } — true means skip
let query = '';
let filter = 'all'; // 'all' | 'selected' | 'audio'
let mode = loadMode(); // 'listen' | 'quiz' | 'produce'
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
  updateModeUI();
  bindEvents();
  registerSW();
}

/* ---------- Rendering ---------- */
function render() {
  const q = query.trim().toLowerCase();
  const matches = visibleWords();

  els.empty.hidden = matches.length > 0;
  if (matches.length === 0) {
    els.empty.textContent = (filter === 'selected' && !q)
      ? 'Nothing selected yet — tap words to add them.'
      : 'No matches.';
  }
  els.list.innerHTML = matches.map(w => rowHTML(w, q)).join('');

  // Play the entrance animation only on the very first paint.
  els.list.classList.toggle('animate-in', !hasRendered);
  hasRendered = true;

  // Re-apply playing highlight/auto-expand lost in the DOM rebuild.
  if (player.playing && player.currentIndex != null) {
    player.autoOpened = null;
    highlightPlaying(player.currentIndex);
  }
}

function rowHTML(w, q) {
  const isSel = selected.has(w.index);
  return `
  <li class="word-item${isSel ? ' selected' : ''}" data-index="${esc(w.index)}">
    <div class="row-main" role="button" tabindex="0" aria-pressed="${isSel}" aria-label="Select ${esc(w.fi)}">
      <span class="idx">${esc(w.index)}</span>
      <span class="fi-word">${highlight(w.fi, q)}</span>
      ${w.hasAudio ? `<span class="has-audio" role="button" title="Tap to play this word" aria-label="Play ${esc(w.fi)}">${SPEAKER_SVG}</span>` : ''}
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
          <label class="sentence-row">
            <input type="checkbox" class="sent-check" data-part="fi" ${skipped(w.index, 'fi') ? '' : 'checked'} aria-label="Include Finnish sentence in playback" />
            <span class="sbox">${CHECK_SVG}</span>
            <span class="sentence fi"><span class="lbl">FI</span><b>${esc(w.fiSentence)}</b></span>
          </label>
          <label class="sentence-row">
            <input type="checkbox" class="sent-check" data-part="en" ${skipped(w.index, 'en') ? '' : 'checked'} aria-label="Include English sentence in playback" />
            <span class="sbox">${CHECK_SVG}</span>
            <span class="sentence en"><span class="lbl">EN</span>${esc(w.enSentence)}</span>
          </label>
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
  buzz();
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

    // Speaker icon: play just this word once — or jump the running loop to it.
    if (e.target.closest('.has-audio')) {
      const w = words.find(x => x.index === item.dataset.index);
      if (w && w.hasAudio) {
        buzz();
        if (player.playing && !player.once) {
          const qi = player.queue.findIndex(it => it.index === w.index);
          if (qi !== -1) jumpTo(qi);
        } else {
          if (player.playing) stopPlayback();
          startPlayback(queueForWords([w]), true);
        }
      }
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

  // Per-sentence include/skip checkboxes (inside the expanded detail).
  els.list.addEventListener('change', (e) => {
    if (!e.target.classList.contains('sent-check')) return;
    const item = e.target.closest('.word-item');
    const idx = item.dataset.index;
    const part = e.target.dataset.part; // 'fi' or 'en'
    setSkipped(idx, part, !e.target.checked);
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

  // Filter chips
  els.chips.addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    buzz();
    filter = chip.dataset.filter;
    els.chips.querySelectorAll('.chip').forEach(c => c.classList.toggle('active', c === chip));
    render();
  });

  // Selection actions
  els.selectAll.addEventListener('click', () => {
    buzz();
    visibleWords().forEach(w => selected.add(w.index));
    saveSelection();
    render();
    updateSelectionUI();
  });
  els.clearSel.addEventListener('click', () => {
    buzz();
    selected.clear();
    saveSelection();
    render();
    updateSelectionUI();
  });

  // Play / Stop
  els.play.addEventListener('click', () => {
    buzz();
    if (player.playing) stopPlayback();
    else startPlayback();
  });

  // Skip to previous / next word while playing
  els.npPrev.addEventListener('click', () => { if (player.playing) { buzz(); jumpTo(wordBoundary(-1)); } });
  els.npNext.addEventListener('click', () => { if (player.playing) { buzz(); jumpTo(wordBoundary(1)); } });

  // Playback mode — applies immediately, even mid-loop (restarts the current word).
  els.modeSeg.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-mode]');
    if (!btn || btn.dataset.mode === mode) return;
    buzz();
    mode = btn.dataset.mode;
    saveMode();
    updateModeUI();
    if (player.playing && !player.once) {
      clearTimeout(player.timer);
      player.queue = buildQueue();
      if (player.queue.length === 0) { stopPlayback(); return; }
      const qi = player.queue.findIndex(it => it.index === player.currentIndex);
      jumpTo(qi !== -1 ? qi : 0);
    }
  });
}

function visibleWords() {
  let list = words;
  if (filter === 'selected') list = list.filter(w => selected.has(w.index));
  else if (filter === 'audio') list = list.filter(w => w.hasAudio);
  const q = query.trim().toLowerCase();
  if (!q) return list;
  return list.filter(w =>
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
  updateChipCounts();
}

function updateChipCounts() {
  const set = (f, v) => {
    const el = els.chips.querySelector(`[data-filter="${f}"] .n`);
    if (el) el.textContent = v;
  };
  set('all', words.length);
  set('selected', selected.size);
  set('audio', words.filter(w => w.hasAudio).length);
}

/* ---------- Audio playback (Phase 2) ---------- */
// Each mode defines the clip order within a word and the silent gap (ms)
// AFTER each part. Quiz and Produce leave a long recall gap before the answer:
//   listen  — word, meaning right away (passive listening)
//   quiz    — word … pause to recall the meaning … meaning (recognition)
//   produce — meaning … pause to say it in Finnish … word (production)
const MODE_CONFIG = {
  listen:  { parts: ['word', 'meaning', 'fi', 'en'], gaps: { word: 300,  meaning: 600, fi: 300 } },
  quiz:    { parts: ['word', 'meaning', 'fi', 'en'], gaps: { word: 2500, meaning: 600, fi: 300 } },
  produce: { parts: ['meaning', 'word', 'fi', 'en'], gaps: { meaning: 2500, word: 600, fi: 300 } },
};
const GAP_WORD = 1000;  // between one word's last part and the next word

const player = {
  playing: false, queue: [], i: 0, audio: new Audio(), timer: null,
  currentIndex: null, autoOpened: null,
  loop: 1,      // which pass of the auto-replay loop we're on
  once: false,  // true for single-word previews: play through once, no loop
};

function audioSrc(index, part) {
  const safe = index.replace(/[^\w.-]/g, '_');
  return `audio/${safe}-${part}.mp3`;
}

// Selected words that have audio, kept in list order.
function selectedAudioWords() {
  return words.filter(w => selected.has(w.index) && w.hasAudio);
}

function queueForWords(list) {
  const q = [];
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.listen;
  list.forEach((w, wi) => {
    // word & meaning always play; sentences only if their checkbox is on.
    const parts = cfg.parts.filter(p => {
      if (p === 'fi') return !skipped(w.index, 'fi');
      if (p === 'en') return !skipped(w.index, 'en');
      return true;
    });
    const lastWord = wi === list.length - 1;
    parts.forEach((part, pi) => {
      const lastPart = pi === parts.length - 1;
      // gap after this clip: word-boundary on the last part, else this part's gap
      let gapAfter = lastPart ? (lastWord ? 0 : GAP_WORD) : (cfg.gaps[part] ?? 0);
      q.push({
        index: w.index, fi: w.fi, part, src: audioSrc(w.index, part), gapAfter,
        wpos: wi + 1, wtotal: list.length,
      });
    });
  });
  return q;
}

function buildQueue() {
  return queueForWords(selectedAudioWords());
}

function startPlayback(queue, once = false) {
  player.queue = queue || buildQueue();
  if (player.queue.length === 0) return;
  player.playing = true;
  player.once = once;
  player.loop = 1;
  player.i = 0;
  player.currentIndex = null;
  document.body.classList.add('is-playing');
  setPlayButton(true);
  playNext();
}

function playNext() {
  if (!player.playing) return;
  if (player.i >= player.queue.length) {
    if (player.once) { stopPlayback(); return; }
    // Loop: rebuild (so selection/skip edits during playback take effect) and restart.
    player.queue = buildQueue();
    if (player.queue.length === 0) { stopPlayback(); return; }
    player.i = 0;
    player.currentIndex = null;
    player.loop++;
    player.timer = setTimeout(playNext, GAP_WORD);
    return;
  }

  const item = player.queue[player.i];
  if (item.index !== player.currentIndex) {
    player.currentIndex = item.index;
    highlightPlaying(item.index);
  }
  updateNowPlaying(item);

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
  player.once = false;
  clearTimeout(player.timer);
  try { player.audio.pause(); } catch {}
  player.audio.onended = null;
  player.audio.onerror = null;
  player.i = 0;
  document.body.classList.remove('is-playing');
  els.npParts.querySelectorAll('.active').forEach(p => p.classList.remove('active'));
  highlightPlaying(null);
  setPlayButton(false);
  updateSelectionUI();
}

/* ---------- Now-playing dock ---------- */
function updateNowPlaying(item) {
  els.npWord.textContent = item.fi;
  els.npMeta.textContent = player.once
    ? 'preview'
    : `${item.wpos}/${item.wtotal} · loop ${player.loop}`;
  els.npParts.querySelectorAll('[data-part]').forEach(p =>
    p.classList.toggle('active', p.dataset.part === item.part));
}

// Jump the loop to a given queue position (clip boundary).
function jumpTo(i) {
  clearTimeout(player.timer);
  player.i = i;
  player.currentIndex = null; // force re-highlight
  playNext();
}

// Queue position of the next (+1) or previous (-1) word's first clip, wrapping.
function wordBoundary(dir) {
  const q = player.queue;
  if (q.length === 0) return 0;
  const cur = q[Math.min(player.i, q.length - 1)].index;
  if (dir > 0) {
    let i = player.i;
    while (i < q.length && q[i].index === cur) i++;
    return i < q.length ? i : 0;
  }
  let start = Math.min(player.i, q.length - 1);
  while (start > 0 && q[start - 1].index === cur) start--;
  let p = start - 1;
  if (p < 0) p = q.length - 1;
  const prevIdx = q[p].index;
  while (p > 0 && q[p - 1].index === prevIdx) p--;
  return p;
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
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
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

/* ---------- Playback mode ---------- */
function updateModeUI() {
  els.modeSeg.querySelectorAll('[data-mode]').forEach(b =>
    b.classList.toggle('active', b.dataset.mode === mode));
  // Reorder the now-playing part pills to match this mode's playback order.
  const cfg = MODE_CONFIG[mode] || MODE_CONFIG.listen;
  cfg.parts.forEach(p => {
    const pill = els.npParts.querySelector(`[data-part="${p}"]`);
    if (pill) els.npParts.appendChild(pill);
  });
}
function loadMode() {
  try {
    const m = localStorage.getItem(MODE_KEY);
    return ['listen', 'quiz', 'produce'].includes(m) ? m : 'listen';
  } catch { return 'listen'; }
}
function saveMode() {
  try { localStorage.setItem(MODE_KEY, mode); } catch {}
}

/* ---------- Per-sentence skip state ---------- */
// Default = include both sentences. We only store the parts a word should SKIP.
function skipped(index, part) {
  return !!(sentenceSkip[index] && sentenceSkip[index][part]);
}
function setSkipped(index, part, skip) {
  if (skip) {
    sentenceSkip[index] = sentenceSkip[index] || {};
    sentenceSkip[index][part] = true;
  } else if (sentenceSkip[index]) {
    delete sentenceSkip[index][part];
    if (Object.keys(sentenceSkip[index]).length === 0) delete sentenceSkip[index];
  }
  saveSentenceSkip();
}
function loadSentenceSkip() {
  try {
    const raw = localStorage.getItem(SKIP_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function saveSentenceSkip() {
  try { localStorage.setItem(SKIP_KEY, JSON.stringify(sentenceSkip)); } catch {}
}

/* ---------- Helpers ---------- */
// Light haptic tick on devices that support it (Android); no-op elsewhere.
function buzz(ms = 8) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch {}
}

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
