"""Generate all non-phoneme clips with edge-tts (Jenny), trim silence, hash-name them, and write a partial manifest."""
import asyncio, edge_tts, json, hashlib, subprocess, os, re, sys, pathlib
VOICE = 'en-US-JennyNeural'
ROOT = pathlib.Path(__file__).resolve().parents[2]; OUT = ROOT / 'audio' / 'jenny'; RAW = pathlib.Path('/tmp/jenny-raw'); RAW.mkdir(exist_ok=True); OUT.mkdir(parents=True, exist_ok=True)
texts = json.load(open(sys.argv[1]))
def slug(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:40] or 'x'
async def tts(item, sem):
    raw = RAW / (hashlib.sha1((item['text'] + item['rate']).encode()).hexdigest()[:12] + '.mp3')
    if raw.exists() and raw.stat().st_size > 1000: return raw
    async with sem:
        for i in range(6):
            try:
                await edge_tts.Communicate(item['text'], VOICE, rate=item['rate']).save(str(raw))
                if raw.stat().st_size > 1000: return raw
            except Exception as e: err = e
            await asyncio.sleep(2 + i * 2)
    print('FAILED', item['key'], file=sys.stderr); return None
TRIM = 'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.04,areverse,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06,areverse'
async def main():
    sem = asyncio.Semaphore(6); raws = await asyncio.gather(*[tts(t, sem) for t in texts])
    man = {}
    for t, raw in zip(texts, raws):
        if not raw: continue
        tmp = RAW / 'trim.mp3'
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(raw), '-af', TRIM, '-ac', '1', '-ar', '24000', '-b:a', '48k', str(tmp)], check=True)
        data = tmp.read_bytes(); h = hashlib.sha1(data).hexdigest()[:8]
        name = f"{t['kind']}-{slug(t['key'].replace('slow:', ''))}-{h}.mp3"; (OUT / name).write_bytes(data); man[t['key']] = name
    json.dump(man, open('/tmp/manifest-tts.json', 'w'), indent=0)
    print('clips', len(man), 'of', len(texts))
asyncio.run(main())
