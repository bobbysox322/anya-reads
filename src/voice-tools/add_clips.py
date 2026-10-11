"""Incremental update: generate clips that dump_texts.js lists but manifest.json lacks (Jenny, trimmed, loudness-matched
to -20 dBFS active RMS like normalize.py), and drop phrase clips no longer listed. Usage: node dump_texts.js > /tmp/texts.json; python3 add_clips.py /tmp/texts.json"""
import asyncio, edge_tts, json, subprocess, sys, pathlib, hashlib, re, numpy as np
OUT = pathlib.Path(__file__).resolve().parents[2] / 'audio' / 'jenny'; VOICE = 'en-US-JennyNeural'
texts = json.load(open(sys.argv[1])); m = json.load(open(OUT / 'manifest.json')); clips = m['clips']
want = {t['key']: t for t in texts}
TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse'
def load(f):
    return np.frombuffer(subprocess.run(['ffmpeg','-v','error','-i',str(f),'-ac','1','-ar','24000','-f','f32le','-'],capture_output=True).stdout, np.float32)
async def make(t):
    raw = pathlib.Path('/tmp') / ('add-' + hashlib.sha1(t['text'].encode()).hexdigest()[:10] + '.mp3')
    for i in range(6):
        try: await edge_tts.Communicate(t['text'], VOICE, rate=t['rate']).save(str(raw)); break
        except Exception: await asyncio.sleep(2 + 2*i)
    trim = raw.with_suffix('.t.mp3'); subprocess.run(['ffmpeg','-v','error','-y','-i',str(raw),'-af',TRIM,'-ac','1','-ar','24000','-b:a','48k',str(trim)], check=True)
    a = load(trim); fr = a[:len(a)//480*480].reshape(-1,480); db = 20*np.log10(np.sqrt((fr**2).mean(1))+1e-9); act = fr[db > db.max()-35]
    g = min(-20 - 20*np.log10(np.sqrt((act**2).mean())), -1 - 20*np.log10(np.abs(a).max()))
    fin = raw.with_suffix('.n.mp3'); subprocess.run(['ffmpeg','-v','error','-y','-i',str(trim),'-af',f'volume={g:.2f}dB','-ac','1','-ar','24000','-b:a','48k',str(fin)], check=True)
    data = fin.read_bytes(); slug = re.sub(r'[^a-z0-9]+','-',t['key'].replace('slow:','')).strip('-')[:40]
    name = f"{t['kind']}-{slug}-{hashlib.sha1(data).hexdigest()[:8]}.mp3"; (OUT / name).write_bytes(data); clips[t['key']] = name; print('added', t['key'], name, f'gain {g:+.1f} dB')
async def main():
    for k in [k for k in want if k not in clips]: await make(want[k])
    for k in [k for k in clips if k not in want and not k.startswith('ph:')]:
        print('dropped', k); clips.pop(k)
    live = set(clips.values())
    for f in OUT.glob('*.mp3'):
        if f.name not in live: f.unlink()
    m['version'] = hashlib.sha1(json.dumps(clips, sort_keys=True).encode()).hexdigest()[:10]
    json.dump(m, open(OUT / 'manifest.json', 'w'), separators=(',', ':'), sort_keys=True); print('clips', len(clips), 'version', m['version'])
asyncio.run(main())
