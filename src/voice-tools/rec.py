import glob, subprocess, numpy as np, torch, sys
from transformers import AutoProcessor, AutoModelForCTC
name = 'facebook/wav2vec2-lv-60-espeak-cv-ft'
from transformers import Wav2Vec2FeatureExtractor
import json
from huggingface_hub import hf_hub_download
fe = Wav2Vec2FeatureExtractor.from_pretrained(name); vocab={v:k for k,v in json.load(open(hf_hub_download(name,'vocab.json'))).items()}
model = AutoModelForCTC.from_pretrained(name).eval()
def dec(ids):
    out=[];prev=None
    for i in ids:
        if i!=prev and vocab[i] not in ('<pad>','<s>','</s>','<unk>'): out.append(vocab[i])
        prev=i
    return ' '.join(out)
def load(f):
    raw = subprocess.run(['ffmpeg','-v','error','-i',f,'-ac','1','-ar','16000','-f','f32le','-'],capture_output=True).stdout
    a = np.frombuffer(raw, dtype=np.float32)
    return np.concatenate([np.zeros(4000,np.float32), a, np.zeros(4000,np.float32)])
C = {'m':['mmm','mmmmm','Mmm.','hmm'], 's':['sss','sssss','Sss.','ss','sh'], 't':['t','tuh','t.','tt','Tuh.'], 'a':['a','aa','ah','æ','aah','ă','ae','at']}
for f in sorted(glob.glob(sys.argv[1] if len(sys.argv)>1 else '*_*_*.mp3')):
    v,k,i = f[:-4].split('_'); x = fe(load(f), sampling_rate=16000, return_tensors='pt').input_values
    with torch.no_grad(): ids = model(x).logits.argmax(-1)
    print(f"{v:7s} /{k}/ {C[k][int(i)]!r:9s} -> {dec(ids[0].tolist())}")
