# Finnish Words PWA — Plan

A personal, mobile-first Progressive Web App for studying 200 high-frequency Finnish
words. Built with **vanilla HTML/CSS/JS** (no build step, no dependencies). Host-agnostic:
runs from any static host or locally.

## Data

Source: `Finnish_Frequency_200.xlsx` (sheet "Finnish 200").
Columns: `Index, Finnish Word, English Meaning, Finnish Sentence, English Sentence`.

- 294 entries total: main indices `1`–`200` plus alternative forms (e.g. `5a`, `200a`).
- Converted once to `words.json` (the app loads JSON, never the XLSX at runtime).
- Each entry: `{ index, fi, en, fiSentence, enSentence }`.

To regenerate `words.json` after editing the XLSX, re-run the conversion script
(openpyxl → JSON).

---

## Phase 1 — Word list (this phase)

**Goal:** browse and select words. No audio yet.

Features:
- List of all entries. Each row shows the **Finnish word** + its **index number** +
  a **checkbox**.
- **Tap a row** to expand it, revealing the English meaning + Finnish sentence +
  English sentence. Tap again to collapse.
- The checkbox selects the word (tapping the checkbox does not expand the row).
- **Search box** to filter by Finnish word, English meaning, or index.
- **Selection bar**: shows how many words are selected, with "Select all (filtered)"
  and "Clear" actions. In Phase 1 there is also a disabled **Play** button as a
  placeholder for Phase 2.
- Selections persist across reloads via `localStorage`.
- Installable PWA: web app manifest + service worker for offline use.
- Mobile-first, clean UI; works one-handed; respects light/dark via system theme.

Files:
- `index.html` — markup + meta (viewport, manifest, theme-color).
- `styles.css` — mobile-first styling, light/dark.
- `app.js` — load JSON, render list, search, selection, localStorage, expand/collapse.
- `words.json` — generated data.
- `manifest.webmanifest` — PWA metadata.
- `service-worker.js` — offline caching.
- `icons/` — app icons (192, 512).

---

## Phase 2 — Audio playback (later, with ElevenLabs)

**Goal:** listen to selected entries.

- Generate audio with the ElevenLabs API for each entry's parts:
  Finnish word → English meaning → Finnish sentence → English sentence.
- Pre-generate audio files (one per entry, or per part) stored in `audio/` and
  referenced from `words.json`. Keeps the API key off the device and works offline.
- **Play button** (already in the UI) becomes active: plays the audio for every
  selected entry in order, queuing the parts. Includes pause/stop and progress.
- Optional: per-row play button, playback speed, and choice of which parts to read.

API key handling: the ElevenLabs key is used **only at build/generation time** on the
Mac, never shipped in the PWA.

---

## Running it

Static files — serve the folder with any static server, e.g.:

```
python3 -m http.server 8000
```

then open `http://localhost:8000` (or the Mac's LAN IP on the phone). For full PWA
install + offline on a phone, deploy the folder to a free HTTPS host (GitHub Pages,
Netlify, etc.) later.
