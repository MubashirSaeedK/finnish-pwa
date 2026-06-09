#!/usr/bin/env python3
"""
Phase 2 — ElevenLabs audio generation for the Finnish Words PWA.

For each word entry we generate FOUR short clips (so the player can insert
clear pauses between them, letting you distinguish each part):
    {index}-word.mp3      the Finnish word
    {index}-meaning.mp3   the English meaning
    {index}-fi.mp3        the Finnish example sentence
    {index}-en.mp3        the English example sentence

Symbols that would otherwise be read aloud (slashes, parentheses, semicolons,
brackets, etc.) are stripped before sending text to ElevenLabs.

Usage:
    python3 scripts/generate_audio.py            # first 5 entries (test run)
    python3 scripts/generate_audio.py --limit 10
    python3 scripts/generate_audio.py --all
    python3 scripts/generate_audio.py --force    # re-generate existing clips
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
AUDIO_DIR = ROOT / "audio"
WORDS_JSON = ROOT / "words.json"

MODEL_ID = "eleven_v3"
OUTPUT_FORMAT = "mp3_44100_128"
API_BASE = "https://api.elevenlabs.io/v1/text-to-speech"

# The four parts of each entry, in playback order: (suffix, source-field).
PARTS = [
    ("word", "fi"),
    ("meaning", "en"),
    ("fi", "fiSentence"),
    ("en", "enSentence"),
]


def clean_for_tts(text: str) -> str:
    """Remove symbols that shouldn't be spoken; keep words & sentence punctuation."""
    if not text:
        return ""
    t = text.strip()
    t = t.replace("/", " ")                       # he/she/it -> he she it
    t = t.replace(";", ", ")                       # semicolon -> spoken pause
    t = t.replace("(", " ").replace(")", " ")     # drop parens, keep words
    t = t.replace("[", " ").replace("]", " ")
    t = re.sub(r"[^\w\s.,!?'’\-]", " ", t, flags=re.UNICODE)
    t = re.sub(r"\s+([.,!?])", r"\1", t)           # " ," -> ","
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
        raise RuntimeError(
            f"ElevenLabs API {resp.status_code}: {resp.text[:500]}"
        )
    return resp.content


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=5, help="number of entries (default 5)")
    parser.add_argument("--all", action="store_true", help="process every entry")
    parser.add_argument("--force", action="store_true", help="overwrite existing clips")
    args = parser.parse_args()

    load_dotenv(ROOT / ".env")
    api_key = os.getenv("ELEVENLABS_API_KEY", "").strip()
    voice_id = os.getenv("ELEVENLABS_VOICE_ID", "").strip()
    if not api_key or not voice_id:
        print("ERROR: ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID missing in .env", file=sys.stderr)
        return 1

    words = json.loads(WORDS_JSON.read_text(encoding="utf-8"))
    entries = words if args.all else words[: args.limit]
    AUDIO_DIR.mkdir(exist_ok=True)

    print(f"Model: {MODEL_ID} | voice: {voice_id} | entries: {len(entries)}\n")

    made, skipped = 0, 0
    for w in entries:
        idx = w["index"]
        safe = re.sub(r"[^\w.-]", "_", idx)
        print(f"[{idx}] {w['fi']}")
        for suffix, field in PARTS:
            out = AUDIO_DIR / f"{safe}-{suffix}.mp3"
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

    WORDS_JSON.write_text(
        json.dumps(words, ensure_ascii=False, indent=0), encoding="utf-8"
    )
    print(f"\nDone. Generated {made} clip(s), skipped {skipped} existing. "
          f"Updated words.json (hasAudio flags).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
