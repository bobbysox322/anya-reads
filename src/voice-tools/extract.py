import asyncio, edge_tts, subprocess, numpy as np, torch, json, sys
from transformers import Wav2Vec2FeatureExtractor, AutoModelForCTC
from huggingface_hub import hf_hub_download
name='facebook/wav2vec2-lv-60-espeak-cv-ft'
fe=Wav2Vec2FeatureExtractor.from_pretrained(name); vocab={v:k for k,v in json.load(open(hf_hub_download(name,'vocab.json'))).items()}
model=AutoModelForCTC.from_pretrained(name).eval()
def load(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).copy()
def frames(a):
    x=fe(a,sampling_rate=16000,return_tensors='pt').input_values
    with torch.no_grad(): lg=model(x).logits[0]
    return lg.softmax(-1).numpy()
def dec(a):
    p=frames(np.concatenate([np.zeros(4000,np.float32),a,np.zeros(4000,np.float32)])).argmax(-1); out=[];prev=None
    for i in p:
        if i!=prev and vocab[i] not in('<pad>','<s>','</s>','<unk>'): out.append(vocab[i])
        prev=i
    return ' '.join(out)
# target phone, carrier word, which occurrence label set
JOBS={'m':('moon',['m','n']),'s':('sun',['s']),'a':('at',['æ','a','aː','ɛ']),'t':('at',['t','d'])}
V=sys.argv[1:] or ['Ava','Jenny','Emma']
async def gen(v,w,f):
    import os
    if os.path.exists(f): return
    for _ in range(4):
        try:
            return await edge_tts.Communicate(w,f'en-US-{v}Neural',rate='-20%').save(f)
        except Exception as e: await asyncio.sleep(3)
for v in V:
    for ph,(w,labs) in JOBS.items():
        f=f'carrier_{v}_{w}.mp3'; asyncio.run(gen(v,w,f)); a=load(f); P=frames(a); am=P.argmax(-1)
        peaks=[]; prev=None
        for fi,i in enumerate(am):
            if i!=prev and vocab[i] not in('<pad>','<s>','</s>','<unk>'): peaks.append((fi,vocab[i]))
            prev=i
        ti=[j for j,(fi,l) in enumerate(peaks) if l in labs]
        if not ti: print(v,ph,'not found', peaks); continue
        j=ti[0] if ph!='t' else ti[-1]; hop=320
        env=np.convolve(np.abs(a),np.ones(320)/320,'same'); on=np.where(env>env.max()*0.03)[0]; onset,offset=on[0],on[-1]
        s0=onset if j==0 else int((peaks[j-1][0]+peaks[j][0])/2*hop)
        s1=offset if j==len(peaks)-1 else int((peaks[j][0]+peaks[j+1][0])/2*hop)
        if ph=='t': s0=int((peaks[j][0]-1)*hop); s1=offset
        seg=a[s0:s1].copy(); n=min(160,len(seg)//4); seg[:n]*=np.linspace(0,1,n); seg[-n:]*=np.linspace(1,0,n)
        raw=f'ph_{v}_{ph}.raw'; seg.astype(np.float32).tofile(raw)
        dur=(s1-s0)/16000; tgt=0.55; k=max(0.25,min(1,dur/tgt)); filt=(f'atempo={max(0.5,k):.3f}'+(f',atempo={k/0.5:.3f}' if k<0.5 else '')) if ph in 'msa' else 'anull'
        out=f'ph_{v}_{ph}.mp3'
        subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','16000','-ac','1','-i',raw,'-af',filt+',apad=pad_dur=0.05','-ar','24000','-b:a','48k',out])
        print(f'{v:6s} /{ph}/ from {w!r}: {len(seg)/16000:.2f}s -> heard as [{dec(load(out))}]')
