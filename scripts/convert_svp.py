#!/usr/bin/env python3
"""Convert the in-progress study sheets of Swedish-Kelly.xlsx into JSON.

The "Swedish in-progress" mode of the PWA has three tabs, each backed by one
sheet of the Kelly workbook:

    Learn today    -> svp/learn-today.json      (tab "Learn Today")
    Learn today 2  -> svp/learn-today-2.json    (tab "Learn today 2")
    Yellow         -> svp/yellow.json           (tab "Yello")

Sheet columns (row 1 is a header):
    Index, Article, Swedish Word, English Meaning,
    Part of Speech, Swedish Sentence, English Sentence

The article (att / en / ett) is merged into the displayed word, e.g.
"vara" + "att" -> "att vara", "väg" + "en" -> "en väg" — matching how
swedish.json is built (see convert_swedish.py).

Output entry shape matches swedish.json so the app renders every dataset
identically (`fi`/`fiSentence` hold the *target* Swedish word/sentence):
    { index, fi, en, fiSentence, enSentence, pos, hasAudio }

`hasAudio` is left False here; generate_audio.py flips it to True once the
clips exist. All three tabs share one audio pool (audio/svp) keyed by index,
because every row comes from the same Sheet2 — so a given index has identical
word/meaning/sentence text wherever it appears.
"""

import json
from pathlib import Path

import openpyxl

ROOT = Path(__file__).resolve().parent.parent
XLSX = ROOT.parent / "Swedish-Kelly.xlsx"   # workbook lives next to the PWA folder
OUT_DIR = ROOT / "svp"

# sheet name -> output filename
SHEETS = {
    "Learn today": "learn-today.json",
    "Learn today 2": "learn-today-2.json",
    "Yellow": "yellow.json",
}


def rows_from_sheet(ws):
    entries = []
    for i, raw in enumerate(ws.iter_rows(values_only=True)):
        if i == 0:
            continue  # header
        if not raw or raw[0] is None:
            continue
        cells = (list(raw) + [None] * 7)[:7]
        index, article, word, meaning, pos, sv_sentence, en_sentence = (
            ("" if c is None else str(c).strip()) for c in cells
        )
        if not index or not word:
            continue
        display = f"{article} {word}".strip() if article else word
        entries.append({
            "index": index,
            "fi": display,
            "en": meaning,
            "fiSentence": sv_sentence,
            "enSentence": en_sentence,
            "pos": pos,
            "hasAudio": False,
        })
    return entries


def main() -> int:
    wb = openpyxl.load_workbook(XLSX, read_only=True, data_only=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    for sheet, filename in SHEETS.items():
        if sheet not in wb.sheetnames:
            print(f"! sheet {sheet!r} not found, skipping")
            continue
        entries = rows_from_sheet(wb[sheet])
        out = OUT_DIR / filename
        out.write_text(
            json.dumps(entries, ensure_ascii=False, indent=0), encoding="utf-8"
        )
        print(f"Wrote {len(entries):>3} entries  {sheet!r:>16} -> {out.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
