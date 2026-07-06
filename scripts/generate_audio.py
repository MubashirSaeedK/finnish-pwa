#!/usr/bin/env python3
"""
Phase 2 — ElevenLabs audio generation for the Finnish/Swedish Words PWA.

For each word entry we generate short per-part clips so the player can insert
clear pauses between them. Parts differ by language:

  Finnish (--lang fi, default): word, meaning, fi-sentence, en-sentence
  Swedish (--lang sv):          word, meaning, sv-sentence   (NO English sentence)

Clips are written to the language's audio dir with names {index}-{part}.mp3:
    {index}-word.mp3      the target-language word
    {index}-meaning.mp3   the English meaning
    {index}-fi.mp3        the target-language example sentence
    {index}-en.mp3        the English example sentence   (Finnish only)

Symbols that would otherwise be read aloud (slashes, parentheses, semicolons,
brackets, etc.) are stripped before sending text to ElevenLabs.

Usage:
    python3 scripts/generate_audio.py                      # Finnish, first 5 (test)
    python3 scripts/generate_audio.py --lang sv --limit 100
    python3 scripts/generate_audio.py --lang sv --all
    python3 scripts/generate_audio.py --force              # re-generate existing clips
"""

import argparse
import json
import os
import re
import sys
import time
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent

MODEL_ID = "eleven_v3"
OUTPUT_FORMAT = "mp3_44100_128"
API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"

# Per-language config. `parts` is a list of (suffix, source-field) in any order;
# `voice_env` is the .env var holding that language's ElevenLabs voice id.
LANGS = {
    "fi": {
        "json": "words.json",
        "audio_dir": "audio",
        "voice_env": "ELEVENLABS_VOICE_ID",
        "parts": [
            ("word", "fi"),
            ("meaning", "en"),
            ("fi", "fiSentence"),
            ("en", "enSentence"),
        ],
    },
    "sv": {
        "json": "swedish.json",
        "audio_dir": "audio/sv",
        "voice_env": "ELEVENLABS_VOICE_ID_SV",
        # No English sentence for Swedish — word, meaning, Swedish sentence only.
        "parts": [
            ("word", "fi"),
            ("meaning", "en"),
            ("fi", "fiSentence"),
        ],
    },
    # Swedish "in-progress" study tabs. Same parts as sv (word, meaning,
    # Swedish sentence). All three tabs share ONE audio pool (audio/svp) keyed
    # by index: every row comes from the same Sheet2, so a given index has
    # identical text everywhere and its clips only need to exist once. Running
    # the three tabs in sequence naturally de-duplicates via the skip-existing
    # check below.
    "svp1": {
        "json": "svp/learn-today.json",
        "audio_dir": "audio/svp",
        "voice_env": "ELEVENLABS_VOICE_ID_SV",
        "parts": [("word", "fi"), ("meaning", "en"), ("fi", "fiSentence")],
    },
    "svp2": {
        "json": "svp/learn-today-2.json",
        "audio_dir": "audio/svp",
        "voice_env": "ELEVENLABS_VOICE_ID_SV",
        "parts": [("word", "fi"), ("meaning", "en"), ("fi", "fiSentence")],
    },
    "svpy": {
        "json": "svp/yellow.json",
        "audio_dir": "audio/svp",
        "voice_env": "ELEVENLABS_VOICE_ID_SV",
        "parts": [("word", "fi"), ("meaning", "en"), ("fi", "fiSentence")],
    },
}


def clean_for_tts(text: str) -> str:
    """Remove symbols that shouldn't be spoken; keep words & sentence punctuation."""
    if not text:
        return ""
    t = text.strip()
    t = t.replace("/", " ")                        # he/she/it -> he she it
    t = t.replace(";", ", ")                        # semicolon -> spoken pause
    t = t.replace("(", " ").replace(")", " ")      # drop parens, keep words
    t = t.replace("[", " ").replace("]", " ")
    t = re.sub(r"[^\w\s.,!?'’\-]", " ", t, flags=re.UNICODE)
    t = re.sub(r"\s+([.,!?])", r"\1", t)            # " ," -> ","
    t = re.sub(r"\s{2,}", " ", t).strip(" ,.-")
    return t


def synthesize(text: str, api_key: str, voice_id: str) -> bytes:
    url = f"{API_BASE}/{voice_id}?output_format={OUTPUT_FORMAT}"
    headers = {
        "xi-api-key": api_key,
        "Content-Type": "application/json",
        "Accept": "audio/mpeg",
    }
    payload = {
        "text": text,
        "model_id": MODEL_ID,
        "voice_settings": {"stability": 0.5, "similarity_boost": 0.75},
    }
    resp = requests.post(url, headers=headers, json=payload, timeout=60)
    if resp.status_code != 200:
        raise RuntimeError(f"ElevenLabs API {resp.status_code}: {resp.text[:500]}")
    return resp.content


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lang", choices=sorted(LANGS), default="fi",
                        help="language dataset to voice (default fi)")
    parser.add_argument("--limit", type=int, default=5, help="number of entries (default 5)")
    parser.add_argument("--all", action="store_true", help="process every entry")
    parser.add_argument("--force", action="store_true", help="overwrite existing clips")
    args = parser.parse_args()

    cfg = LANGS[args.lang]
    words_json = ROOT / cfg["json"]
    audio_dir = ROOT / cfg["audio_dir"]
    parts = cfg["parts"]

    load_dotenv(ROOT / ".env")
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv(cfg["voice_env"], "").strip()
    if not api_key:
        print("ERROR: ELEVENLABS_API_KEY missing in .env", file=sys.stderr)
        return 1
    if not voice_id:
        print(f"ERROR: {cfg['voice_env']} missing in .env (voice for --lang {args.lang})",
              file=sys.stderr)
        return 1

    words = json.loads(words_json.read_text(encoding="utf-8"))
    entries = words if args.all else words[: args.limit]
    audio_dir.mkdir(parents=True, exist_ok=True)

    part_names = ", ".join(p[0] for p in parts)
    print(f"Lang: {args.lang} | model: {MODEL_ID} | voice: {voice_id}")
    print(f"Parts: {part_names} | entries: {len(entries)} -> {cfg['audio_dir']}/\n")

    made, skipped = 0, 0
    for w in entries:
        idx = w["index"]
        safe = re.sub(r"[^\w.-]", "_", idx)
        print(f"[{idx}] {w['fi']}")
        for suffix, field in parts:
            out = audio_dir / f"{safe}-{suffix}.mp3"
            if out.exists() and not args.force:
                skipped += 1
                continue
            text = clean_for_tts(w.get(field, ""))
            if not text:
                print(f"    - {suffix}: (empty, skipped)")
                continue
            try:
                audio = synthesize(text, api_key, voice_id)
            except Exception as e:
                print(f"    ! {suffix}: {e}", file=sys.stderr)
                return 2
            out.write_bytes(audio)
            made += 1
            print(f"    ✓ {suffix}: \"{text}\"  ({len(audio)//1024} KB)")
            time.sleep(0.3)  # be gentle on rate limits
        w["hasAudio"] = True

    words_json.write_text(
        json.dumps(words, ensure_ascii=False, indent=0), encoding="utf-8"
    )
    print(f"\nDone. Generated {made} clip(s), skipped {skipped} existing. "
          f"Updated {cfg['json']} (hasAudio flags).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
