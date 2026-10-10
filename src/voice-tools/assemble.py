import asyncio, edge_tts, subprocess, os
V={'ava':'Ava','jenny':'Jenny','emma':'Emma','ana':'Ana'}
T={'hi':"Hi Anya! Let's read together.", 'tap':'Tap the letter that says', 'asin':'as in moon.', 'yes':'Yes!', 'mat':'Mat.'}
async def g(v,k,t):
    f=f'seg_{v}_{k}.mp3'
    if os.path.exists(f): return
    for _ in range(4):
        try: return await edge_tts.Communicate(t,f'en-US-{v}Neural',rate='-15%').save(f)
        except Exception: await asyncio.sleep(3)
async def main(): await asyncio.gather(*[g(v,k,t) for v in V.values() for k,t in T.items()])
asyncio.run(main())
def sil(ms,f):
    subprocess.run(['ffmpeg','-v','error','-y','-f','lavfi','-i',f'anullsrc=r=24000:cl=mono','-t',str(ms/1000),f])
for ms in (200,350,600,900): sil(ms,f'sil{ms}.wav')
for k,v in V.items():
    parts=[f'seg_{v}_hi.mp3','sil900.wav',f'seg_{v}_tap.mp3','sil200.wav',f'ph_{v}_m.mp3','sil350.wav',f'seg_{v}_asin.mp3','sil900.wav',
           f'seg_{v}_yes.mp3','sil350.wav',f'ph_{v}_m.mp3','sil350.wav',f'ph_{v}_a.mp3','sil350.wav',f'ph_{v}_t.mp3','sil600.wav',f'seg_{v}_mat.mp3']
    inp=sum([['-i',p] for p in parts],[]); n=len(parts)
    fc=''.join(f'[{i}:a]aresample=24000,aformat=channel_layouts=mono[a{i}];' for i in range(n))+''.join(f'[a{i}]' for i in range(n))+f'concat=n={n}:v=0:a=1[o]'
    out=f'/workspace/anya-reads-game/voice-samples/{["ava","jenny","emma","ana"].index(k)+1}-{k}-{v}Neural-natural-phonemes.mp3'
    subprocess.run(['ffmpeg','-v','error','-y',*inp,'-filter_complex',fc,'-map','[o]','-b:a','64k',out]); print(out)
