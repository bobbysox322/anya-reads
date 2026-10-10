import numpy as np, subprocess, glob, sys
def load(f):
    raw=subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    return np.frombuffer(raw,dtype=np.float32)
def analyze(f):
    a=load(f); N=400; H=160; fr=[a[i:i+N] for i in range(0,len(a)-N,H)]
    E=np.array([np.sqrt((x**2).mean()) for x in fr]); act=E>E.max()*0.1
    freqs=np.fft.rfftfreq(N,1/16000); res={'s':0,'vowel':0,'nasal':0,'n':int(act.sum())}
    for x,on in zip(fr,act):
        if not on: continue
        S=np.abs(np.fft.rfft(x*np.hanning(N)))**2; c=(S*freqs).sum()/S.sum()
        lo=S[freqs<500].sum()/S.sum(); mid=S[(freqs>500)&(freqs<3000)].sum()/S.sum()
        if c>3500: res['s']+=1
        elif lo>0.8: res['nasal']+=1
        elif mid>0.3: res['vowel']+=1
    n=max(1,res['n']); return {k:round(v/n,2) for k,v in res.items() if k!='n'}, round(res['n']*0.01,2)
for f in sys.argv[1:]: print(f, *analyze(f))
