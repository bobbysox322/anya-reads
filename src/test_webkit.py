"""WebKit (Safari engine) on emulated iPads: speaking practice without a microphone. With 'Start each lesson with a
speaking challenge', the first item shows the say-it cue, plays the model, counts as practice and auto-advances with no
taps, also when audio 'ended' events never fire. Nothing may call getUserMedia (no mic permission prompt)."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0, '.'); from test_audio import BREAK_ENDED, NO_MIC
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html?nosw=1'
async def run(p, broken, dev):
    b = await p.webkit.launch(); ctx = await b.new_context(**p.devices[dev]); errs = []
    await ctx.add_init_script(NO_MIC)
    if broken: await ctx.add_init_script(BREAK_ENDED)
    page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(URL); await page.wait_for_selector('#home.on')
    await page.evaluate("(()=>{ const s=__anya.state; s.settings.speakFirst = true; save(); })()")
    await page.tap('#startBtn')
    await page.wait_for_function("SESSION && SESSION.steps[0].speak", timeout=20000)
    first = await page.evaluate("SESSION.steps[0].id + ' ' + SESSION.steps[0].act")
    t0 = await page.evaluate('performance.now()')
    await page.wait_for_selector('#stage .saycue.on', timeout=30000)
    await page.wait_for_selector('#next.show', timeout=30000)
    arrow = await page.evaluate("(()=>{ const n = document.querySelector('#next').getBoundingClientRect(); const e = document.elementFromPoint(n.left + n.width/2, n.top + n.height/2); return n.bottom <= innerHeight && !!(e && e.closest('#next')); })()")
    await page.wait_for_function('SESSION && SESSION.idx >= 1', timeout=5000)  # auto-advance, no tap
    dt = round((await page.evaluate('performance.now()') - t0) / 1000, 1)
    gum = await page.evaluate('window.__gum'); spoken = await page.evaluate("Object.values(__anya.state.spoken).reduce((a, x) => a + x.a, 0)")
    dash_mic = await page.evaluate("(() => { renderDash(); return /microphone|Test microphone|Record letter/i.test(document.querySelector('#dash').innerText.replace(/no microphone/ig, '')); })()")
    print(f"WEBKIT {dev} ({'ended blocked' if broken else 'normal audio'}): first {first}; cue shown; arrow visible+on top {arrow}; auto-advanced after {dt} s; spoken counted {spoken}; getUserMedia calls {gum}; mic UI in dashboard {dash_mic}; page errors {errs or 'none'}")
    assert arrow and gum == 0 and spoken == 1 and not dash_mic and not errs and dt < (30 if broken else 16)
    await b.close()
async def main():
    async with async_playwright() as p:
        for dev in ('iPad (gen 7) landscape', 'iPad Pro 11'):
            for broken in (False, True): await run(p, broken, dev)
if __name__ == '__main__': asyncio.run(main())
