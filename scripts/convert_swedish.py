#!/usr/bin/env python3
"""Convert Swedish.csv into swedish.json (same shape as words.json).

CSV columns:
    Index, Article, Swedish Word, English Meaning,
    Part of Speech, Swedish Sentence, English Sentence

The article (att / en / ett) is merged into the displayed word, e.g.
"vara" + "att" -> "att vara", "stol" + "en" -> "en stol", which is how
Swedish learners want to see verbs (infinitive) and nouns (gender).

A "spoken" variant has an index like "1s" (spoken form of word 1, e.g.
"och" -> "å"). These are NOT separate list entries; each is folded into
its base word as a `spoken` list so it can be shown inside the dropdown.

Output entry shape matches the Finnish data so the app renders both
identically (here `fi`/`fiSentence` hold the *target* word/sentence):
    { index, fi, en, fiSentence, enSentence, pos, hasAudio,
      spoken?: [ { fi, fiSentence } ] }
"""

import csv
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CSV_PATH = ROOT / "Swedish.csv"
OUT_PATH = ROOT / "swedish.json"

SPOKEN_RE = re.compile(r"^(\d+)s$")


def main() -> int:
    base = []          # list entries, in file order
    by_index = {}      # index -> entry (base words only)
    spoken_rows = []   # (base_index, {fi, fiSentence}) to attach after first pass

    with CSV_PATH.open(encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # header
        for raw in reader:
            if not raw or not any(cell.strip() for cell in raw):
                continue
            cells = (raw + [""] * 7)[:7]  # pad short rows
            index, article, word, meaning, pos, sv_sentence, en_sentence = (
                c.strip() for c in cells
            )
            if not index or not word:
                continue
            display = f"{article} {word}".strip() if article else word

            m = SPOKEN_RE.match(index)
            if m:
                spoken_rows.append((m.group(1), {"fi": display, "fiSentence": sv_sentence}))
                continue

            entry = {
                "index": index,
                "fi": display,
                "en": meaning,
                "fiSentence": sv_sentence,
                "enSentence": en_sentence,
                "pos": pos,
                "hasAudio": False,
            }
            base.append(entry)
            by_index[index] = entry

    folded = 0
    for base_index, spoken in spoken_rows:
        host = by_index.get(base_index)
        if host is None:
            continue
        host.setdefault("spoken", []).append(spoken)
        folded += 1

    OUT_PATH.write_text(
        json.dumps(base, ensure_ascii=False, indent=0), encoding="utf-8"
    )
    print(f"Wrote {len(base)} entries ({folded} spoken forms folded in) "
          f"-> {OUT_PATH.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
