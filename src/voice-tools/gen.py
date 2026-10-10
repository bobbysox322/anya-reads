import asyncio, edge_tts
C = {'m':['mmm','mmmmm','Mmm.','hmm'], 's':['sss','sssss','Sss.','ss','sh'], 't':['t','tuh','t.','tt','Tuh.'], 'a':['a','aa','ah','æ','aah','ă','ae','at']}
V = ['Ava','Emma','Jenny','Ana','Andrew']
async def one(v, k, i, txt):
    await edge_tts.Communicate(txt, f'en-US-{v}Neural', rate='-20%').save(f'{v}_{k}_{i}.mp3')
async def main():
    jobs=[one(v,k,i,t) for v in V for k,ts in C.items() for i,t in enumerate(ts)]
    for j in range(0,len(jobs),10): await asyncio.gather(*jobs[j:j+10], return_exceptions=True)
asyncio.run(main())
