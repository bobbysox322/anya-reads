"""Unmuted e2e: pre-made clips load and play (no 404s, no device-voice fallbacks), service worker caches
everything for offline, and a new build replaces the old one (versioned cache)."""
import asyncio, json, sys, shutil, re, pathlib, urllib.request
from playwright.async_api import async_playwright
sys.path.insert(0, '.'); import test_e2e as T
SRC = pathlib.Path('/workspace/anya-reads-game'); SERVE = pathlib.Path('/tmp/anya-serve'); PORT = 8766
BASE = f'http://localhost:{PORT}/'
def stage():
    if SERVE.exists(): shutil.rmtree(SERVE)
    SERVE.mkdir(); shutil.copy(SRC / 'index.html', SERVE); shutil.copy(SRC / 'sw.js', SERVE); shutil.copytree(SRC / 'audio', SERVE / 'audio')
async def main():
    stage()
    srv = await asyncio.create_subprocess_exec('python3', '-m', 'http.server', str(PORT), '--bind', '127.0.0.1', cwd=str(SERVE), stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    await asyncio.sleep(1)
    man = json.load(open(SERVE / 'audio/jenny/manifest.json'))
    missing = [f for f in man['clips'].values() if not (SERVE / 'audio/jenny' / f).exists()]
    print('manifest clips', len(man['clips']), 'missing files', missing)
    bad, audio_ok, errors = [], set(), []
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        ctx = await b.new_context(viewport={'width': 1180, 'height': 820}, has_touch=True)
        def on_resp(r):
            if r.status >= 400: bad.append((r.status, r.url))
            elif '/audio/' in r.url: audio_ok.add(r.url)
        ctx.on('response', on_resp)
        page = await ctx.new_page(); T.errors = errors
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await page.goto(BASE + 'index.html'); await page.wait_for_selector('#home.on')
        await page.evaluate("""(()=>{ window.__plays=[]; const a = __anya.Clips.player(); a.addEventListener('playing', () => __plays.push(a.src.startsWith('blob:') ? 'clip' : a.src.slice(0,20))); })()""")
        print('clips loaded in page:', await page.evaluate('__anya.Clips.ok'), 'build', await page.evaluate('__anya.BUILD'))
        await page.wait_for_function('navigator.serviceWorker.controller !== null', timeout=15000)
        print('service worker controlling page: yes')
        # session 1 (level 1), real audio
        T.URL = BASE
        await T.play_session(page, wrong_rate=0.3, max_steps=120); await page.wait_for_timeout(5000)
        await page.click('#fh'); await page.wait_for_selector('#home.on')
        # jump to level 16 for words, heart words, sentences, speaking
        await page.evaluate("""(()=>{const s=__anya.state; s.level=16; for(const l of LETTERS.slice(0,15)) s.intro['L:'+l.id]=s.intro['L:'+l.id]||Date.now();
          for(const h of HEARTS.filter(h=>h[1]<=16)) s.intro['H:'+h[0].toLowerCase()]=Date.now();
          for(const w of __anya.WORDS.filter(w=>w.level<=15)){ s.intro['W:'+w.w]=Date.now(); s.items['W:'+w.w]={a:3,c:3,h:[1,1,1],last:Date.now()-9e7,box:1,due:0}; } save();})()""")
        seen = set()
        for i in range(2):
            seen |= await T.play_session(page, wrong_rate=0.3, max_steps=120); await page.wait_for_timeout(4000)
            await page.click('#fh'); await page.wait_for_selector('#home.on')
        print('activities (unmuted)', sorted(seen))
        fb = await page.evaluate('window.__ttsFallback'); plays = await page.evaluate('__plays')
        print('clip plays', plays.count('clip'), 'other plays', [x for x in plays if x != 'clip'][:5])
        print('device-voice fallbacks:', sorted(set(fb)) or 'none')
        # wait for background precache of every clip
        n = await page.evaluate("""new Promise(res => { navigator.serviceWorker.addEventListener('message', e => e.data.type === 'audio-cached' && res(e.data.n));
            navigator.serviceWorker.controller.postMessage({type:'precache-audio'}); setTimeout(() => res(-1), 120000); })""")
        cached = await page.evaluate("caches.open('anya-audio-v1').then(c => c.keys()).then(k => k.length)")
        print('precache reported', n, 'audio entries cached', cached, 'caches', await page.evaluate('caches.keys()'))
        # offline
        await ctx.set_offline(True)
        await page.reload(); await page.wait_for_selector('#home.on')
        off = await page.evaluate("""(async () => { const C = __anya.Clips; const keys = ['ph:m','ph:qu','slow:mat','yes','as in apple', Object.keys(C.man.clips)[300]];
            const r = []; for (const k of keys) r.push([k, !!(await C.load(k))]); return {ok: C.ok, r}; })()""")
        print('OFFLINE reload: home shown, clips', off)
        seen2 = await T.play_session(page, wrong_rate=0.2, max_steps=120); await page.wait_for_timeout(3000)
        print('OFFLINE session completed; activities', sorted(seen2))
        await page.click('#fh'); await page.wait_for_selector('#home.on')
        await ctx.set_offline(False)
        # update path: publish a "new build" and make sure it reaches the page
        old = await page.evaluate('__anya.BUILD'); new = old + '-next'
        for f in ('index.html', 'sw.js'): (SERVE / f).write_text((SERVE / f).read_text().replace(old, new))
        await page.reload(); await page.wait_for_selector('#home.on'); got1 = await page.evaluate('__anya.BUILD')
        await page.wait_for_timeout(3000); await page.reload(); await page.wait_for_selector('#home.on'); got2 = await page.evaluate('__anya.BUILD')
        await page.wait_for_timeout(1500)
        print(f'UPDATE: old {old} -> after 1st reload {got1}, after 2nd reload {got2}; caches now', await page.evaluate('caches.keys()'))
        await b.close()
    srv.terminate()
    audio404 = [x for x in bad if '/audio/' in x[1]]
    print('HTTP errors:', bad or 'none'); print('audio files fetched OK:', len(audio_ok), 'audio 404s:', audio404 or 'none')
    print('CONSOLE ERRORS:', [e for e in errors if 'ERR_INTERNET_DISCONNECTED' not in e] or 'none')
asyncio.run(main())
