"""Cut pure letter sounds out of Jenny's natural words, then check them automatically.
Method: CTC phoneme peaks (wav2vec2 espeak model) locate the boundary between the target sound and its neighbour;
continuous sounds are time-stretched (WSOLA/atempo) to ~0.5 s; stop sounds keep only the burst (+ a tiny vowel onset for voiced stops)."""
import asyncio, edge_tts, subprocess, numpy as np, torch, json, hashlib, pathlib, sys, os
from transformers import Wav2Vec2FeatureExtractor, AutoModelForCTC
from huggingface_hub import hf_hub_download
NAME = 'facebook/wav2vec2-lv-60-espeak-cv-ft'
fe = Wav2Vec2FeatureExtractor.from_pretrained(NAME); vocab = {v: k for k, v in json.load(open(hf_hub_download(NAME, 'vocab.json'))).items()}
model = AutoModelForCTC.from_pretrained(NAME).eval()
VOICE = 'en-US-JennyNeural'; ROOT = pathlib.Path(__file__).resolve().parents[2]; OUT = ROOT / 'audio' / 'jenny'; W = pathlib.Path('/tmp/jenny-ph'); W.mkdir(exist_ok=True)
SR = 16000; HOP = 320
VOW = set('aeiouæɑɐəɛɪʊʌɔɜ') 
# id: (carrier, kind, stretch_target_s, extra_ms, expected phone labels)
CFG = {
 'a':('at','vowel',.5,0,['æ','a','ɛ','aː']), 'e':('egg','vowel',.45,0,['ɛ','e','eː']), 'i':('it','vowel',.45,0,['ɪ','i','e']),
 'o':('odd','vowel',.5,0,['ɑ','ɑː','a','aː','ɔ']), 'u':('up','vowel',.45,0,['ʌ','ɐ','ə','a']),
 'm':('moon','init',.5,0,['m']), 's':('sun','init',.5,0,['s']), 'f':('fun','init',.5,0,['f']), 'n':('nut','init',.5,0,['n']),
 'l':('lap','init',.45,0,['l']), 'r':('red','init',.45,0,['ɹ','r']), 'v':('van','init',.45,0,['v']), 'z':('zip','init',.5,0,['z']),
 'h':('hut','init',.3,0,['h']),
 'z2':('lazy','label',.5,0,['z','s']), 'v2':('seven','label',.45,0,['v','f']), 'v3':('five','final',.45,0,['v','f']), 'v4':('love','final',.45,0,['v','f']), 'v5':('glove','final',.45,0,['v','f']), 'h3':('his','init',.3,0,['h']), 'f2':('off','final',.5,0,['f']), 'h2':('hot','init',.3,0,['h']), 'g2':('buggy','label',0,15,['ɡ','g','k']), 'qu2':('queen','init2',0,30,['k','w']),
 't':('tub','init',0,15,['t']), 'p':('pup','init',0,15,['p']), 'c':('cub','init',0,15,['k']), 'b':('bus','init',0,35,['b']),
 'd':('dug','init',0,35,['d']), 'g':('gum','init',0,35,['ɡ','g']), 'j':('jug','init',0,35,['dʒ']),
 'w':('wet','init',0,45,['w']), 'y':('yes','init',0,45,['j']),
 'x':('ox','final',0,0,['k','s']), 'qu':('quick','init2',0,30,['k','w']),
}
def load(f):
    raw = subprocess.run(['ffmpeg','-v','error','-i',str(f),'-ac','1','-ar',str(SR),'-f','f32le','-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.float32).copy()
def logits(a):
    x = fe(a, sampling_rate=SR, return_tensors='pt').input_values
    with torch.no_grad(): return model(x).logits[0].numpy()
def peaks(a):
    am = logits(a).argmax(-1); out = []; prev = None
    for fi, i in enumerate(am):
        if i != prev and vocab[i] not in ('<pad>','<s>','</s>','<unk>'): out.append((fi, vocab[i]))
        prev = i
    return out
def decode(a):
    pad = np.zeros(int(.3*SR), np.float32); return ' '.join(l for _, l in peaks(np.concatenate([pad, a, pad])))
def isvowel(l): return any(ch in VOW for ch in l)
def spectral(a):
    N = 400; H = 160; fr = [a[i:i+N] for i in range(0, max(1, len(a)-N), H)]
    E = np.array([np.sqrt((x**2).mean()) for x in fr]); act = E > E.max()*0.1; f = np.fft.rfftfreq(N, 1/SR); c = {'fric':0,'vowel':0,'nasal':0}
    for x, on in zip(fr, act):
        if not on: continue
        S = np.abs(np.fft.rfft(x*np.hanning(N)))**2 + 1e-12; cen = (S*f).sum()/S.sum(); lo = S[f<500].sum()/S.sum(); mid = S[(f>500)&(f<3000)].sum()/S.sum()
        if cen > 3500: c['fric'] += 1
        elif lo > .8: c['nasal'] += 1
        elif mid > .3: c['vowel'] += 1
    n = max(1, act.sum()); return {k: round(v/n, 2) for k, v in c.items()}
async def gen(text, f):
    for i in range(6):
        try:
            await edge_tts.Communicate(text, VOICE, rate='-20%').save(str(f));
            if f.stat().st_size > 500: return
        except Exception: pass
        await asyncio.sleep(2 + 2*i)
def cut(pid):
    carrier, kind, stretch, extra, labs = CFG[pid]
    f = W / f'carrier-{carrier}.mp3'
    if not f.exists(): asyncio.run(gen(carrier, f))
    a = load(f); P = peaks(a)
    env = np.convolve(np.abs(a), np.ones(160)/160, 'same'); act = np.where(env > env.max()*0.03)[0]; on, off = int(act[0]), int(act[-1])
    vi = [j for j, (_, l) in enumerate(P) if isvowel(l)]
    mid = lambda j: int((P[j][0] + P[j+1][0]) / 2 * HOP)
    jc = None
    if kind in ('init','init2'):
        cpk = P[0][0]*HOP; lo = max(0, cpk - int(.15*SR)); quiet = np.where(env[lo:cpk+1] > env.max()*0.004)[0]
        on = lo + int(quiet[0]) if len(quiet) else on
    if kind == 'label':
        jc = next(j for j, (_, l) in enumerate(P) if l in labs and j > 0)
        s0 = mid(jc-1) + int(.02*SR); s1 = (mid(jc) if jc+1 < len(P) else off) + int(extra/1000*SR)
    elif kind == 'vowel':
        j = vi[0]; s0 = on + int(.02*SR); s1 = mid(j) if j+1 < len(P) else off
    elif kind in ('init', 'init2'):
        j = vi[0]; s0 = max(0, on - int(.005*SR)); s1 = int((P[j-1][0] + P[j][0]) / 2 * HOP) if j > 0 else int(P[j][0]*HOP) - int(.04*SR)
        if kind == 'init' and pid in 'tpcbdgj': # stops: end where the vowel's voicing gets strong (spectral), not the CTC midpoint
            N = 256; ff = np.fft.rfftfreq(N, 1/SR)
            for i in range(s0 + int(.01*SR), len(a)-N, 40):
                S = np.abs(np.fft.rfft(a[i:i+N]*np.hanning(N)))**2 + 1e-12
                if S[(ff>300)&(ff<2500)].sum()/S.sum() > .6 and np.sqrt((a[i:i+N]**2).mean()) > env.max()*0.25: s1 = i; break
        if pid in ('h2','h3'): s1 = min(s1, int(P[0][0]*HOP + .025*SR)) # h: stop before the vowel's voicing takes over
        s1 += int(extra/1000*SR)
    else: # final cluster (x in "ox")
        j = vi[-1]; s0 = (mid(j) if j+1 < len(P) else int(P[j][0]*HOP)) + (int(.05*SR) if pid in ('v4','v5') else 0); s1 = off + int(.02*SR)
    seg = a[s0:s1].copy(); n = min(int(.008*SR), len(seg)//4); seg[:n] *= np.linspace(0, 1, n); seg[-n:] *= np.linspace(1, 0, n)
    raw = W / f'{pid}.raw'; seg.astype(np.float32).tofile(raw); dur = len(seg)/SR
    af = []
    if stretch and dur < stretch:
        k = max(.3, dur/stretch)
        while k < .5: af.append('atempo=0.5'); k /= .5
        af.append(f'atempo={k:.4f}')
    pk = float(np.abs(seg).max()) or 1; gain = (0.6 if pid in 'sfzhvx' else 0.7) / pk
    af += ['afade=t=in:d=0.01', 'areverse', 'afade=t=in:d=0.03', 'areverse', f'volume={gain:.3f}', 'apad=pad_dur=0.03']
    out = W / f'ph-{pid}.mp3'
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar',str(SR),'-ac','1','-i',str(raw),'-af',','.join(af),'-ar','24000','-b:a','48k',str(out)], check=True)
    return out, dur
def formants(a):
    # LPC formant estimate over the middle of the clip
    import scipy.signal as sg
    x = a[len(a)//4: 3*len(a)//4]; x = sg.lfilter([1, -0.63], 1, x) * np.hamming(len(x)); order = 14
    r = np.correlate(x, x, 'full')[len(x)-1:len(x)+order]
    from scipy.linalg import solve_toeplitz
    A = np.concatenate([[1], -solve_toeplitz(r[:-1], r[1:])]); roots = [z for z in np.roots(A) if z.imag > 0]
    fr = sorted(f for f, bw in ((np.angle(z)*SR/(2*np.pi), -SR/np.pi*np.log(abs(z))) for z in roots) if f > 250 and bw < 400)
    return [int(f) for f in fr[:3]]
def check(pid, out):
    carrier, kind, stretch, extra, labs = CFG[pid]; a = load(out); heard = decode(a); sp = spectral(a)
    # blend test: sound + "at" style vowel + t for consonants, or m + vowel + t for vowels
    ph = lambda x: load(W / f'ph-{x}.mp3')
    gap = np.zeros(int(.03*SR), np.float32)
    if kind == 'vowel': blend = np.concatenate([ph('m'), gap, a, gap, ph('t')]); bw = f'm-{pid}-t'
    elif kind == 'label' or kind == 'final' and False: blend = np.concatenate([a, gap, ph('a'), gap, ph('t')]); bw = f'{pid}-a-t'
    elif pid == 'x': blend = np.concatenate([ph('o'), gap, a]); bw = 'o-x'
    else: blend = np.concatenate([a, gap, ph('a'), gap, ph('t')]); bw = f'{pid}-a-t'
    bh = decode(blend); ok = any(l in heard.split() for l in labs); bok = any(l in bh.split()[:3] for l in labs) if pid != 'x' else ('k' in bh and 's' in bh)
    fm = formants(a) if kind == 'vowel' else None
    return dict(formants=fm, id=pid, dur=round(len(a)/SR, 2), heard=heard, blend=bw, blend_heard=bh, spectral=sp, alone_ok=ok, blend_ok=bok)
if __name__ == '__main__':
    ids = sys.argv[1:] or list(CFG)
    order = ['m','t','a'] + [i for i in ids if i not in ('m','t','a')]
    for pid in order:
        if pid in CFG: out, d = cut(pid); 
    res = [check(pid, W / f'ph-{pid}.mp3') for pid in order if pid in CFG]
    for r in res: print(f"{r['id']:3s} {r['dur']:.2f}s alone:[{r['heard']}] {'OK' if r['alone_ok'] else '--'}  blend {r['blend']}:[{r['blend_heard']}] {'OK' if r['blend_ok'] else '--'} {r['spectral']} {r['formants'] or ''}")
    json.dump(res, open(W / 'check.json', 'w'), indent=1)
