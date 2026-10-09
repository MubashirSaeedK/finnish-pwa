'use strict';
/* Fraser — 20 YKI phrases for Berätta 1–5, ElevenLabs eleven_v4 audio in audio/fraser/ (+ fraser-2/) */
const $ = (s, r = document) => r.querySelector(s);
const player = $('#player');
const KEY = 'fraser-pwa';
const ST = Object.assign({ rate: 1, gap: false, en: true, loop: false, skip: {}, hideKnown: false, voice: '1' }, (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } })());
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(ST)); } catch (e) {} };
let DATA = null, ALL = [], BY = {}, VOICES = [];
let Q = null;        // { ids, i, src }  src = 'item:<id>' | 'sec:<id>' | 'all'
let waitT = null;    // timer while waiting between phrases
let waiting = false; // true during the "repeat" pause

function esc(s) { return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

async function load() {
  const res = await fetch('fraser.json');
  DATA = await res.json();
  VOICES = [{ key: '1', name: 'Röst 1', dir: DATA.audioDir }];
  try { const v = await (await fetch('fraser_voices.json', { cache: 'no-cache' })).json(); if (Array.isArray(v) && v.length) VOICES = v; } catch (e) {}
  buildVoiceSeg();
  const main = $('#sections');
  main.innerHTML = DATA.sections.map(s => `
    <section class="fr-sec" id="sec-${s.id}">
      <div class="fr-sec-h">
        <input type="checkbox" class="fr-cb fr-cb-sec" data-sec="${s.id}" aria-label="Include whole section">
        <span class="fr-sec-n">${s.n || '★'}</span>
        <div class="fr-sec-t"><b>${esc(s.sv)}</b><span>${esc(s.en)} · <em class="fr-cnt" id="cnt-${s.id}"></em></span></div>
        <button type="button" class="fr-pb" data-sec="${s.id}" aria-label="Play section">▶</button>
      </div>
      <ul class="fr-items">${s.items.map(it => `
        <li class="fr-it" id="it-${it.id}">
          <input type="checkbox" class="fr-cb" data-id="${it.id}" aria-label="Include in playback">
          <span class="fr-no">${it.no || ''}</span>
          <button type="button" class="fr-pb" data-id="${it.id}" aria-label="Play">▶</button>
          <div class="fr-txt"><div class="fr-sv">${it.h}</div><div class="fr-en">${esc(it.en)}</div></div>
        </li>`).join('')}
      </ul>
    </section>`).join('');
  DATA.sections.forEach(s => s.items.forEach(it => { const o = Object.assign({ sec: s, idx: ALL.length }, it); ALL.push(o); BY[it.id] = o; }));
  main.addEventListener('change', e => {
    const c = e.target.closest('.fr-cb'); if (!c) return;
    if (c.dataset.id) setSkip([c.dataset.id], !c.checked);
    else { const s = DATA.sections.find(x => x.id === c.dataset.sec); setSkip(s.items.map(i => i.id), !c.checked); }
  });
  syncChecks();
  main.addEventListener('click', e => {
    const b = e.target.closest('.fr-pb'); if (!b) return;
    if (b.dataset.id) toggleOrStart('item:' + b.dataset.id, [b.dataset.id]);
    else { const s = DATA.sections.find(x => x.id === b.dataset.sec); toggleOrStart('sec:' + s.id, s.items.map(i => i.id)); }
  });
}

/* ---------- playback ---------- */
function toggleOrStart(src, ids) {
  if (Q && Q.src === src) { togglePause(); return; }
  if (Q && src.startsWith('item:') && Q.ids[Q.i] === src.slice(5)) { togglePause(); return; } // same phrase inside a section run
  start(src, ids);
}
const isSkip = id => !!ST.skip[id];
function voiceFor(it) {
  if (ST.voice === 'mix') return VOICES[it.idx % VOICES.length];
  return VOICES.find(v => v.key === ST.voice) || VOICES[0];
}
function buildVoiceSeg() {
  const seg = $('#voiceSeg');
  if (VOICES.length < 2) { seg.hidden = true; return; }
  if (ST.voice !== 'mix' && !VOICES.some(v => v.key === ST.voice)) ST.voice = VOICES[0].key;
  seg.hidden = false;
  seg.innerHTML = VOICES.map(v => `<button type="button" data-voice="${v.key}" title="${esc(v.name)}">${esc(v.name.split(/[\s-]/)[0])}</button>`).join('') +
    '<button type="button" data-voice="mix" title="Alternate voices phrase by phrase">Mix</button>';
  markVoice();
}
function markVoice() { document.querySelectorAll('#voiceSeg button').forEach(b => b.classList.toggle('active', b.dataset.voice === ST.voice)); }
function firstFrom(i, dir = 1) { // next index (in the queue) that is not marked as known
  if (!Q) return -1; const n = Q.ids.length;
  if (n === 1) return i >= 0 && i < n ? i : -1;
  for (let k = i; k >= 0 && k < n; k += dir) if (!isSkip(Q.ids[k])) return k;
  return -1;
}
function start(src, ids) {
  clearWait(); Q = { src, ids, i: 0 };
  const f = firstFrom(0);
  if (f < 0) { Q = null; flash('Alla fraser här är markerade som kända – bocka i någon för att spela.'); icons(); return; }
  Q.i = f; playCurrent();
}
function flash(t) { const m = $('#offlineMsg'); m.textContent = t; $('#offlineMsg').scrollIntoView({ block: 'nearest' }); setTimeout(() => { if (m.textContent === t) m.textContent = ''; }, 5000); }
function setSkip(ids, skip) { ids.forEach(id => { if (skip) ST.skip[id] = true; else delete ST.skip[id]; }); save(); syncChecks(); if (Q) updateMeta(); }
function syncChecks() {
  document.querySelectorAll('.fr-cb[data-id]').forEach(c => { c.checked = !isSkip(c.dataset.id); c.closest('.fr-it').classList.toggle('known', !c.checked); });
  DATA.sections.forEach(s => {
    const on = s.items.filter(i => !isSkip(i.id)).length, c = document.querySelector(`.fr-cb-sec[data-sec="${s.id}"]`);
    c.checked = on === s.items.length; c.indeterminate = on > 0 && on < s.items.length;
    document.getElementById('cnt-' + s.id).textContent = on === s.items.length ? `${on} fraser` : `${on} av ${s.items.length} att öva`;
  });
  const known = Object.keys(ST.skip).length; $('#knownTog').textContent = (ST.hideKnown ? 'Visa kända' : 'Göm kända') + (known ? ` (${known})` : '');
}
function updateMeta() {
  const it = BY[Q.ids[Q.i]], act = Q.ids.filter(id => !isSkip(id) || Q.ids.length === 1), pos = act.indexOf(it.id) + 1;
  const vn = VOICES.length > 1 && Q.v ? ' · ' + Q.v.name : '';
  $('#nowMeta').textContent = `${it.sec.sv} · ${pos > 0 ? pos : '–'}/${act.length}${ST.rate !== 1 ? ' · ' + ST.rate + '×' : ''}${vn}`;
}
function clearWait() { if (waitT) clearTimeout(waitT); waitT = null; waiting = false; document.querySelectorAll('.fr-it.echo').forEach(e => e.classList.remove('echo')); }
function playCurrent() {
  const it = BY[Q.ids[Q.i]];
  const v = voiceFor(it); Q.v = v; Q.fellBack = false;
  player.src = v.dir + it.id + '.mp3';
  player.defaultPlaybackRate = ST.rate; player.playbackRate = ST.rate;
  player.preservesPitch = true; player.webkitPreservesPitch = true;
  player.play().catch(() => {});
  document.querySelectorAll('.fr-it.cur').forEach(e => e.classList.remove('cur'));
  const row = document.getElementById('it-' + it.id);
  row.classList.add('cur');
  if (Q.ids.length > 1) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  $('#dock').hidden = false;
  $('#nowSv').innerHTML = it.h;
  updateMeta();
  if ('mediaSession' in navigator) {
    try { navigator.mediaSession.metadata = new MediaMetadata({ title: it.sv, artist: it.en, album: 'YKI fraser · ' + it.sec.sv, artwork: [{ src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' }] }); } catch (e) {}
  }
  icons();
}
function next() {
  clearWait(); if (!Q) return;
  let n = firstFrom(Q.i + 1);
  if (n < 0) { if (ST.loop && Q.ids.length > 1) n = firstFrom(0); if (n < 0) { stop(); return; } }
  Q.i = n; playCurrent();
}
function prev() { clearWait(); if (!Q) return; const p = firstFrom(Q.i - 1, -1); if (p >= 0) Q.i = p; playCurrent(); }
function stop() {
  clearWait(); player.pause(); Q = null;
  document.querySelectorAll('.fr-it.cur').forEach(e => e.classList.remove('cur'));
  $('#dock').hidden = true; icons();
}
function togglePause() {
  if (!Q) return;
  if (waiting) { clearWait(); Q.pausedGap = true; icons(); return; }          // pause during the repeat gap
  if (Q.pausedGap) { Q.pausedGap = false; next(); return; }                    // resume after the gap
  if (player.paused) player.play().catch(() => {}); else player.pause();
}
player.addEventListener('ended', () => {
  if (!Q) return;
  const more = firstFrom(Q.i + 1) >= 0 || (ST.loop && Q.ids.length > 1 && firstFrom(0) >= 0);
  if (ST.gap && more) {
    const dur = (isFinite(player.duration) ? player.duration : 2) / ST.rate;
    waiting = true; document.getElementById('it-' + Q.ids[Q.i]).classList.add('echo');
    waitT = setTimeout(next, Math.max(1500, dur * 1100 + 600));
    icons();
  } else if (more) waitT = setTimeout(next, 350);
  else if (ST.loop && Q.ids.length === 1) { player.currentTime = 0; player.play(); }
  else stop();
});
player.addEventListener('play', icons);
player.addEventListener('pause', icons);
player.addEventListener('error', () => {
  if (!Q) return;
  if (!Q.fellBack && Q.v && Q.v.dir !== VOICES[0].dir) {       // this voice lacks the clip → use voice 1
    Q.fellBack = true; Q.v = VOICES[0]; updateMeta(); player.src = VOICES[0].dir + Q.ids[Q.i] + '.mp3';
    player.defaultPlaybackRate = ST.rate; player.playbackRate = ST.rate; player.play().catch(() => {}); return;
  }
  $('#nowMeta').textContent = 'Ljudfilen saknas: ' + DATA.audioDir + Q.ids[Q.i] + '.mp3';
  waitT = setTimeout(() => { if (Q && Q.ids.length > 1) next(); }, 1200);
});
function icons() {
  const curId = Q ? Q.ids[Q.i] : null;
  const playing = Q && !player.paused && !Q.pausedGap;
  document.querySelectorAll('.fr-pb').forEach(b => {
    const active = Q && ((b.dataset.id && b.dataset.id === curId && Q.src.startsWith('item:')) || (b.dataset.sec && Q.src === 'sec:' + b.dataset.sec) || (b.dataset.id === curId));
    b.textContent = active && (playing || waiting) ? '❚❚' : '▶';
    b.classList.toggle('on', !!(active && (playing || waiting)));
    b.classList.toggle('paused', !!(active && !(playing || waiting)));
  });
  const all = $('#playAll');
  all.textContent = Q && Q.src === 'all' ? ((playing || waiting) ? '❚❚ Pausa' : '▶ Fortsätt') : '▶ Spela allt';
  $('#ppBtn').textContent = (playing || waiting) ? '❚❚' : '▶';
  if ('mediaSession' in navigator) try { navigator.mediaSession.playbackState = Q ? ((playing || waiting) ? 'playing' : 'paused') : 'none'; } catch (e) {}
}

/* ---------- controls ---------- */
function setRate(r) {
  ST.rate = r; save(); player.defaultPlaybackRate = r; player.playbackRate = r;
  document.querySelectorAll('#rateSeg button').forEach(b => b.classList.toggle('active', +b.dataset.rate === r));
  if (Q) updateMeta();
}
function applyToggles() {
  $('#gapTog').classList.toggle('on', ST.gap);
  $('#enTog').classList.toggle('on', ST.en); document.body.classList.toggle('hide-en', !ST.en);
  $('#loopTog').classList.toggle('on', ST.loop);
  document.body.classList.toggle('hide-known', ST.hideKnown); $('#knownTog').classList.toggle('on', ST.hideKnown);
}
$('#voiceSeg').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  ST.voice = b.dataset.voice; save(); markVoice();
  if (Q && !player.paused && !waiting) playCurrent(); // switch the current phrase to the new voice
});
$('#rateSeg').addEventListener('click', e => { const b = e.target.closest('button'); if (b) setRate(+b.dataset.rate); });
$('#gapTog').onclick = () => { ST.gap = !ST.gap; save(); applyToggles(); };
$('#enTog').onclick = () => { ST.en = !ST.en; save(); applyToggles(); };
$('#loopTog').onclick = () => { ST.loop = !ST.loop; save(); applyToggles(); };
$('#knownTog').onclick = () => { ST.hideKnown = !ST.hideKnown; save(); applyToggles(); if (DATA) syncChecks(); };
$('#playAll').onclick = () => toggleOrStart('all', ALL.map(i => i.id));
$('#ppBtn').onclick = togglePause;
$('#nextBtn').onclick = next;
$('#prevBtn').onclick = prev;
$('#stopBtn').onclick = stop;
if ('mediaSession' in navigator) {
  const h = (a, f) => { try { navigator.mediaSession.setActionHandler(a, f); } catch (e) {} };
  h('play', () => togglePause()); h('pause', () => togglePause());
  h('nexttrack', next); h('previoustrack', prev); h('stop', stop);
}

/* ---------- offline ---------- */
$('#offlineBtn').onclick = async () => {
  const m = $('#offlineMsg');
  if (!('caches' in window)) { m.textContent = 'Offline-lagring stöds inte här.'; return; }
  const c = await caches.open('fraser-audio'); let n = 0, fail = 0;
  const urls = []; VOICES.forEach(v => ALL.forEach(it => urls.push(v.dir + it.id + '.mp3')));
  for (const url of urls) {
    try { if (!(await c.match(url))) { const r = await fetch(url); if (!r.ok) throw 0; await c.put(url, r); } n++; } catch (e) { fail++; }
    m.textContent = `${n + fail}/${urls.length} …`;
  }
  m.textContent = fail ? `Klart: ${n} sparade, ${fail} saknas.` : `Klart! Alla ${n} ljudfiler (${VOICES.length} röster) finns offline.`;
};

setRate(ST.rate); applyToggles();
load().catch(e => { $('#sections').innerHTML = '<p class="fr-foot">Kunde inte läsa fraser.json.</p>'; console.error(e); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(() => {});
