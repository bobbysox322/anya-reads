"""Headless end-to-end test: loads app, completes sessions, checks persistence, takes screenshots."""
import asyncio, json, sys, random
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/index.html?mute=1'
SHOTS = '/workspace/anya-reads-game/screenshots/'
errors = []

async def play_session(page, wrong_rate=0.15, shot_acts=None, max_steps=80):
    await page.click('#startBtn')
    seen = set()
    for _ in range(max_steps):
        await page.wait_for_timeout(60)
        if await page.is_visible('#finish.on'):
            return seen
        st = await page.evaluate("SESSION ? {act: SESSION.steps[SESSION.idx].shown || SESSION.steps[SESSION.idx].act, id: SESSION.steps[SESSION.idx].id} : null")
        if not st:
            await page.wait_for_timeout(100); continue
        nxt_visible = await page.evaluate("document.querySelector('#next') && document.querySelector('#next').classList.contains('show')")
        if nxt_visible:
            await page.click('#next'); continue
        act = st['act']; seen.add(act)
        if shot_acts is not None and act in shot_acts and act not in shot_acts['done']:
            await page.wait_for_timeout(300)
            await page.screenshot(path=SHOTS + shot_acts[act]); shot_acts['done'].add(act)
        if act == 'build':
            word = st['id'][2:]
            gs = await page.evaluate(f"graphemes({json.dumps(word)})")
            if random.random() < wrong_rate:
                wrong = await page.evaluate("[...document.querySelectorAll('#stage .row .tile')].map(b=>b.textContent)")
                cand = [w for w in wrong if w not in gs]
                if cand:
                    await page.click(f"#stage .row .tile:text-is('{cand[0]}')")
                    await page.wait_for_timeout(80)
            for g in gs:
                await page.click(f"#stage .row .tile:not(.used):text-is('{g}')")
                await page.wait_for_timeout(40)
            await page.wait_for_selector('#next.show', timeout=8000)
            continue
        oks = await page.query_selector_all('#stage .tile[data-ok="1"]')
        if oks:
            if random.random() < wrong_rate:
                bad = await page.query_selector_all('#stage .tile[data-ok="0"]:not([disabled])')
                if bad:
                    await bad[0].click(); await page.wait_for_timeout(80)
            await oks[0].click()
            await page.wait_for_selector('#next.show', timeout=8000)
            continue
        # teach steps: wait for arrow
        try:
            await page.wait_for_selector('#next.show', timeout=10000)
        except Exception:
            print('STUCK', st, errors[-5:], (await page.inner_html('#stage'))[:600]); raise
    raise RuntimeError('session did not finish')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width':1180,'height':820}, device_scale_factor=1, has_touch=True)
        page = await ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        await page.goto(URL); await page.wait_for_selector('#home.on')
        await page.wait_for_timeout(500)
        await page.screenshot(path=SHOTS + '01-home.png')
        # session 1
        seen = await play_session(page, shot_acts={'meet':'02-meet-letter.png','done':set()})
        await page.wait_for_timeout(2500)
        await page.screenshot(path=SHOTS + '05-finish.png')
        s1 = await page.evaluate("JSON.parse(localStorage.getItem('anyaReads.v1'))")
        print('session1 acts', seen, 'sessions', len(s1['sessions']), 'items', list(s1['items'].keys()), 'rainbow', s1['rainbow'])
        await page.reload(); await page.wait_for_selector('#home.on')
        s1b = await page.evaluate("JSON.parse(localStorage.getItem('anyaReads.v1'))")
        assert len(s1b['sessions']) == 1 and s1b['sessions'][0]['done'] and s1b['rainbow'] == 1, 'persist failed'
        print('PERSIST OK after reload')
        # many sessions to check progression
        levels = []
        for i in range(24):
            await page.click('#fh') if await page.is_visible('#finish.on') else None
            await page.wait_for_selector('#home.on')
            seen |= await play_session(page, wrong_rate=0.1)
            levels.append(await page.evaluate("__anya.state.level"))
        print('levels after each session', levels)
        print('activities seen', sorted(seen))
        # jump to level 16 for richer activity screenshots
        await page.click('#fh'); await page.wait_for_selector('#home.on')
        await page.evaluate("""(()=>{const s=__anya.state; s.level=16; for(const l of LETTERS.slice(0,15)) s.intro['L:'+l.id]=s.intro['L:'+l.id]||Date.now();
          for(const h of HEARTS.filter(h=>h[1]<=16)) s.intro['H:'+h[0].toLowerCase()]=Date.now();
          for(const w of __anya.WORDS.filter(w=>w.level<=15)) s.intro['W:'+w.w]=Date.now(); save();})()""")
        shots = {'readPic':'03-read-word-pick-picture.png','sentence':'04-read-sentence.png','build':'03b-build-word.png','hearTap':'02b-hear-sound-tap-letter.png','done':set()}
        for i in range(6):
            seen |= await play_session(page, wrong_rate=0.2, shot_acts=shots)
            await page.click('#fh'); await page.wait_for_selector('#home.on')
            if len(shots['done']) >= 4: break
        print('shots taken', shots['done'])
        # dashboard via gate
        await page.click('#gu')
        q = await page.text_content('.gate .q'); a, bb = [int(x) for x in q.split('=')[0].split('+')]
        for ch in str(a + bb): await page.click(f".pad button[data-k='{ch}']")
        await page.click(".pad button[data-k='✓']")
        await page.wait_for_selector('#dash.on'); await page.wait_for_timeout(300)
        await page.screenshot(path=SHOTS + '06-parent-dashboard.png', full_page=False)
        await page.evaluate("document.querySelector('#dash').scrollTo(0, 99999)"); await page.wait_for_timeout(200)
        await page.screenshot(path=SHOTS + '07-parent-settings.png')
        # export
        async with page.expect_download() as dl:
            await page.click('#exp')
        d = await dl.value; path = '/tmp/anya-export.json'; await d.save_as(path)
        data = json.load(open(path)); print('export ok, sessions:', len(data['sessions']), 'items:', len(data['items']))
        # import round trip
        await page.evaluate("localStorage.clear()")
        page.once('dialog', lambda dlg: asyncio.ensure_future(dlg.accept()))
        await page.set_input_files('#imp', path)
        await page.wait_for_timeout(500)
        n = await page.evaluate("JSON.parse(localStorage.getItem('anyaReads.v1')||'{}').sessions?.length")
        print('import ok, sessions:', n)
        # mobile portrait check
        page2 = await ctx.new_page(); await page2.set_viewport_size({'width':820,'height':1180})
        await page2.goto(URL); await page2.wait_for_selector('#home.on'); await page2.wait_for_timeout(300)
        await page2.screenshot(path='/tmp/portrait-home.png')
        await b.close()
    print('CONSOLE ERRORS:', errors if errors else 'none')

asyncio.run(main())
