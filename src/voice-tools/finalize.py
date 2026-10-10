"""Copy the chosen letter-sound cuts into audio/jenny and write manifest.json (TTS clips + phonemes)."""
import json, hashlib, pathlib, shutil, datetime
ROOT = pathlib.Path(__file__).resolve().parents[2]; OUT = ROOT / 'audio' / 'jenny'; W = pathlib.Path('/tmp/jenny-ph')
# letter id -> which cut to use (see phonemes.py CFG for carriers)
CHOICE = {**{x: x for x in 'aeioumsfnlrtpcbdjwyx'}, 'k': 'c', 'qu': 'qu', 'z': 'z2', 'g': 'g2', 'v': 'v4', 'h': 'h2'}
clips = json.load(open('/tmp/manifest-tts.json'))
for f in OUT.glob('ph-*.mp3'): f.unlink()
for lid, src in CHOICE.items():
    data = (W / f'ph-{src}.mp3').read_bytes(); name = f'ph-{lid}-{hashlib.sha1(data).hexdigest()[:8]}.mp3'
    (OUT / name).write_bytes(data); clips['ph:' + lid] = name
live = set(clips.values())
for f in OUT.glob('*.mp3'):
    if f.name not in live: f.unlink()
ver = hashlib.sha1(json.dumps(clips, sort_keys=True).encode()).hexdigest()[:10]
json.dump({'voice': 'en-US-JennyNeural', 'version': ver, 'generated': datetime.date.today().isoformat(), 'clips': clips}, open(OUT / 'manifest.json', 'w'), separators=(',', ':'), sort_keys=True)
tot = sum(f.stat().st_size for f in OUT.glob('*.mp3'))
print('clips', len(clips), 'files', len(list(OUT.glob('*.mp3'))), 'bytes', tot, 'version', ver)
