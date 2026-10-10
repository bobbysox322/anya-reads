import numpy as np, subprocess, sys, asyncio, edge_tts, os
def load(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32).copy()
for v in sys.argv[1:]:
    f=f'carrier_{v}_top.mp3'
    if not os.path.exists(f): asyncio.run(edge_tts.Communicate('top',f'en-US-{v}Neural',rate='-20%').save(f))
    a=load(f); env=np.convolve(np.abs(a),np.ones(160)/160,'same'); on=np.where(env>env.max()*0.03)[0][0]
    N=256; fr=np.fft.rfftfreq(N,1/16000); end=on
    for i in range(on, len(a)-N, 80):
        S=np.abs(np.fft.rfft(a[i:i+N]*np.hanning(N)))**2; lo=S[fr<900].sum()/S.sum()
        if lo>0.5 and i>on+400: end=i; break
    seg=a[max(0,on-80):end].copy(); n=min(80,len(seg)//4); seg[-n:]*=np.linspace(1,0,n)
    seg.astype(np.float32).tofile('t.raw')
    subprocess.run(['ffmpeg','-v','error','-y','-f','f32le','-ar','16000','-ac','1','-i','t.raw','-af','apad=pad_dur=0.05','-ar','24000','-b:a','48k',f'ph_{v}_t.mp3'])
    print(v,'t',round(len(seg)/16000,3),'s')
