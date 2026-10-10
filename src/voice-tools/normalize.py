"""Even out loudness: every clip to the same active-speech RMS (-20 dBFS), peaks kept under -1 dBFS.
Rewrites files with new content-hash names and updates manifest.json. Run after finalize.py."""
import numpy as np, subprocess, json, hashlib, pathlib, datetime
OUT = pathlib.Path(__file__).resolve().parents[2] / 'audio' / 'jenny'; TARGET = -20.0; CEIL = -1.0
def load(f):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-ac', '1', '-ar', '24000', '-f', 'f32le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, np.float32)
m = json.load(open(OUT / 'manifest.json')); clips = m['clips']; done = {}; log = []
for k, name in list(clips.items()):
    if name in done: clips[k] = done[name]; continue
    f = OUT / name; a = load(f); fr = a[:len(a)//480*480].reshape(-1, 480); db = 20*np.log10(np.sqrt((fr**2).mean(1)) + 1e-9)
    act = fr[db > db.max() - 35]; rms = 20*np.log10(np.sqrt((act**2).mean())); peak = 20*np.log10(np.abs(a).max())
    g = min(TARGET - rms, CEIL - peak); new = name
    if abs(g) >= 0.5:
        tmp = OUT / 'tmp.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-af', f'volume={g:.2f}dB', '-ac', '1', '-ar', '24000', '-b:a', '48k', str(tmp)], check=True)
        data = tmp.read_bytes(); tmp.unlink(); stem = name.rsplit('-', 1)[0]; new = f'{stem}-{hashlib.sha1(data).hexdigest()[:8]}.mp3'
        (OUT / new).write_bytes(data); f.unlink(); log.append((name, round(g, 1)))
    done[name] = new; clips[k] = new
m['version'] = hashlib.sha1(json.dumps(clips, sort_keys=True).encode()).hexdigest()[:10]; m['generated'] = datetime.date.today().isoformat(); m['loudness'] = f'{TARGET} dBFS active RMS'
json.dump(m, open(OUT / 'manifest.json', 'w'), separators=(',', ':'), sort_keys=True)
print('adjusted', len(log), 'of', len(done), 'files; biggest changes', sorted(log, key=lambda x: -abs(x[1]))[:6], 'version', m['version'])
