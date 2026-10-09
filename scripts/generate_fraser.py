#!/usr/bin/env python3
"""Voice the phrases in fraser.json with ElevenLabs (eleven_v4, Swedish).

Run from the "Finnish Words PWA" folder:
  python3 scripts/generate_fraser.py            # make all missing clips (asks before spending credits)
  python3 scripts/generate_fraser.py --dry-run  # show what would be made
  python3 scripts/generate_fraser.py --force    # re-make every clip

Röst 1 = zyfJspwEDo0sxPeFmtsn (same voice as the Harry Potter reader) -> audio/fraser/
Röst 2 = kPdGSxhZAqy4bmPAf9iJ                                          -> audio/fraser-2/
Key: ELEVENLABS_API_KEY in .env (this folder). Writes fraser_voices.json for the voice switcher."""
import json, os, re, sys, time, urllib.request, urllib.error
HERE = os.path.dirname(os.path.abspath(__file__))
PWA = os.path.dirname(HERE)
MODEL = 'eleven_v4'
VOICES = [('1', 'Röst 1', 'zyfJspwEDo0sxPeFmtsn', 'audio/fraser/'),
          ('2', 'Röst 2', 'kPdGSxhZAqy4bmPAf9iJ', 'audio/fraser-2/')]
args = sys.argv[1:]
data = json.load(open(os.path.join(PWA, 'fraser.json'), encoding='utf-8'))
items = [it for s in data['sections'] for it in s['items']]
todo = []
for key, name, vid, d in VOICES:
    os.makedirs(os.path.join(PWA, d), exist_ok=True)
    for it in items:
        out = os.path.join(PWA, d, it['id'] + '.mp3')
        if '--force' in args or not os.path.exists(out):
            todo.append((vid, out, it['sv']))
chars = sum(len(t) for _, _, t in todo)
print(f'{len(items)} phrases x {len(VOICES)} voices: {len(todo)} clips to make ({chars} characters).')
def write_voices():
    have = [{'key': k, 'name': n, 'dir': d} for k, n, _, d in VOICES
            if all(os.path.exists(os.path.join(PWA, d, it['id'] + '.mp3')) for it in items)]
    json.dump(have or [{'key': '1', 'name': 'Röst 1', 'dir': 'audio/fraser/'}],
              open(os.path.join(PWA, 'fraser_voices.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
if '--dry-run' in args or not todo:
    for vid, out, t in todo: print(' ', os.path.relpath(out, PWA), '-', t[:55])
    if not todo: write_voices(); print('Nothing to do.')
    sys.exit(0)
env = open(os.path.join(PWA, '.env'), encoding='utf-8').read()
key = re.search(r'ELEVENLABS_API_KEY\s*=\s*["\']?([^\s"\']+)', env).group(1)
if '--yes' not in args and input('Continue? [y/N] ').strip().lower() != 'y':
    sys.exit('Cancelled.')
for n, (vid, out, text) in enumerate(todo, 1):
    body = json.dumps({'text': text, 'model_id': MODEL, 'language_code': 'sv'}).encode()
    req = urllib.request.Request(f'https://api.elevenlabs.io/v1/text-to-speech/{vid}?output_format=mp3_44100_128', data=body,
                                 headers={'xi-api-key': key, 'Content-Type': 'application/json', 'Accept': 'audio/mpeg'})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                audio = r.read()
            if len(audio) < 100: raise RuntimeError('empty audio')
            open(out, 'wb').write(audio); break
        except urllib.error.HTTPError as e:
            msg = e.read().decode('utf-8', 'ignore')[:200]
            if e.code in (429, 500, 502, 503) and attempt < 2: time.sleep(5 * (attempt + 1)); continue
            write_voices(); sys.exit(f'Error {e.code}: {msg}')
    print(f'ok {n}/{len(todo)}', os.path.relpath(out, PWA), '-', text[:45])
write_voices()
print('Done. fraser_voices.json updated.')
