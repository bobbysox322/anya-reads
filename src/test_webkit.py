"""WebKit (Safari engine) on an emulated iPad: 'Start with a speaking challenge' -> mic -> grown-up 👍 must show the next
arrow and advance, using real taps, with normal audio and with audio 'ended' events blocked. Also checks the debug log panel."""
import asyncio, sys
from playwright.async_api import async_playwright
sys.path.insert(0, '.'); from test_audio import BREAK_ENDED
URL = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/index.html?nosw=1'
# Linux WebKit has getUserMedia (mock device) but no MediaRecorder; stand in for Safari's recorder (audio/mp4 blob).
FAKE_REC = '''window.MediaRecorder = class { static isTypeSupported(t){ return t === 'audio/mp4'; } constructor(s, o){ if (o && o.mimeType && o.mimeType !== 'audio/mp4') throw new DOMException('type', 'NotSupportedError'); this.stream = s; this.state = 'inactive'; this.mimeType = 'audio/mp4'; }
  start(){ this.state = 'recording'; } stop(){ this.state = 'inactive'; fetch(Object.values(window.__anya.Clips.man.clips).map(f => 'audio/jenny/' + f)[0]).then(r => r.blob())
    .then(b => { this.ondataavailable && this.ondataavailable({data: new Blob([b], {type: 'audio/mp4'})}); this.onstop && this.onstop(); }); } };'''
# iOS 17+ audio-session behaviour: capture is refused while audioSession.type is 'playback', and getUserMedia must run
# inside the user gesture. Record what the page did at the moment it called getUserMedia.
IOS_SESSION = '''(() => { let sess = {type: 'auto'}; try { Object.defineProperty(navigator, 'audioSession', {value: sess, configurable: true}); } catch (e) {} sess = navigator.audioSession || sess; window.__nativeSession = !!navigator.audioSession && navigator.audioSession !== undefined;
  window.__gum = []; const MP = MediaDevices.prototype, origFn = MP.getUserMedia;  // patch the prototype: WebKit can drop expandos on the mediaDevices wrapper
  MP.getUserMedia = function (c) { const orig = x => origFn.call(this, x); const rec = {session: sess.type, gesture: !!(navigator.userActivation && navigator.userActivation.isActive), constraints: JSON.stringify(c)}; window.__gum.push(rec); try { localStorage.setItem('__gum', JSON.stringify(window.__gum)); } catch (e) {}
    if (sess.type === 'playback') return Promise.reject(new DOMException('capture not allowed in playback session', 'NotAllowedError'));
    if (!rec.gesture) return Promise.reject(new DOMException('not in a user gesture', 'NotAllowedError'));
    return orig(c); }; })()'''
async def run(p, broken, dev, mic=True, fake_rec=True, expect='recorded', brave=False):
    b = await p.webkit.launch()
    ctx = await b.new_context(**p.devices[dev], permissions=['microphone'] if mic else []); errs = []
    await ctx.add_init_script(IOS_SESSION)
    if brave: await ctx.add_init_script("Object.defineProperty(navigator, 'brave', {value: {isBrave: async () => true}})")
    if mic and fake_rec: await ctx.add_init_script(FAKE_REC)
    if broken: await ctx.add_init_script(BREAK_ENDED)
    page = await ctx.new_page(); page.on('pageerror', lambda e: errs.append(str(e)))
    await page.goto(URL); await page.wait_for_selector('#home.on')
    await page.evaluate("(()=>{ const s=__anya.state; s.settings.speakFirst = true; save(); })()")
    await page.tap('#startBtn')
    await page.wait_for_function("SESSION && SESSION.steps[SESSION.idx] && SESSION.steps[SESSION.idx].speak", timeout=20000)
    first = await page.evaluate("SESSION.steps[0].id + ' ' + SESSION.steps[0].act")
    await page.wait_for_selector('#stage .mic:not([disabled])', timeout=30000); await page.tap('#stage .mic')
    await page.wait_for_selector('#stage .gstrip .yes', timeout=40000)
    msg = await page.evaluate("(document.querySelector('#stage .asr') || {}).textContent || ''")
    vis = await page.evaluate("(()=>{ const y = document.querySelector('#stage .gstrip .yes').getBoundingClientRect(); const e = document.elementFromPoint(y.left + y.width/2, y.top + y.height/2); return e && e.closest('.yes') ? 'yes-button on top' : 'COVERED by ' + (e && e.outerHTML.slice(0,80)); })()")
    t0 = await page.evaluate('performance.now()'); await page.tap('#stage .gstrip .yes')
    await page.wait_for_selector('#next.show', timeout=5000); dt = round(await page.evaluate('performance.now()') - t0)
    arrow = await page.evaluate("(()=>{ const n = document.querySelector('#next').getBoundingClientRect(); const e = document.elementFromPoint(n.left + n.width/2, n.top + n.height/2); return {inViewport: n.bottom <= innerHeight && n.right <= innerWidth, onTop: !!(e && e.closest('#next'))}; })()")
    await page.tap('#next'); await page.wait_for_function('SESSION && SESSION.idx >= 1', timeout=5000)
    log = await page.evaluate("JSON.parse(localStorage.getItem('anyaReads.debug')).slice(-6)")
    spoken = await page.evaluate("Object.values(__anya.state.spoken).reduce((a, x) => a + x.a, 0)")
    usedMic = await page.evaluate("JSON.parse(localStorage.getItem('anyaReads.debug')).some(l => l.includes('mic record done ok'))")
    gum = await page.evaluate("JSON.parse(localStorage.getItem('__gum') || '[]')"); reloads = await page.evaluate('performance.getEntriesByType("navigation").map(n => n.type)'); how = await page.evaluate("(JSON.parse(localStorage.getItem('anyaReads.debug')).filter(l => l.includes('recorded ')).pop() || '').slice(9)")
    after = await page.evaluate('navigator.audioSession.type')
    print(f"   nav: {reloads} getUserMedia calls: {gum}; {how}; session after: {after}; on-screen note: {msg[:70]!r}")
    if expect == 'recorded': assert usedMic and gum and gum[0]['gesture'] and gum[0]['session'] == 'play-and-record' and after == 'playback', 'mic path failed'
    if expect == 'blocked': assert not usedMic and 'blocked' in msg and (('Brave' in msg) == brave)
    print(f"WEBKIT {dev} ({'ended blocked' if broken else 'normal audio'}, mic {'recorded' if usedMic else 'not available'}): first step {first}; 👍 {vis}; arrow after {dt} ms {arrow}; advanced to step 1; spoken attempts recorded {spoken}; page errors {errs or 'none'}")
    print('   debug log tail:', log[-4:])
    assert dt < 1500 and arrow['inViewport'] and arrow['onTop'] and not errs
    # debug panel renders
    await page.evaluate("SESSION.abort({aborted:true})"); await page.wait_for_timeout(300)
    if await page.is_visible('#finish.on'): await page.tap('#fh')
    await page.wait_for_selector('#home.on'); await page.evaluate("renderDash()"); await page.wait_for_selector('#dbgList')
    print('   dashboard debug panel lines:', await page.evaluate("document.querySelector('#dbgList').textContent.split('\\n').length"))
    await b.close()
async def main():
    async with async_playwright() as p:
        for dev in ('iPad (gen 7) landscape', 'iPad Pro 11'):
            for broken in (False, True): await run(p, broken, dev)
        await run(p, False, 'iPad Pro 11', fake_rec=False)              # no MediaRecorder -> Web Audio WAV recorder
        await run(p, False, 'iPad Pro 11', mic=False, expect='blocked')  # permission denied -> precise message
        await run(p, False, 'iPad Pro 11', mic=False, expect='blocked', brave=True)  # Brave on iPad -> Brave-specific steps
        await mic_test_button(p)
async def mic_test_button(p):
    b = await p.webkit.launch(); ctx = await b.new_context(**p.devices['iPad Pro 11'], permissions=['microphone'])
    await ctx.add_init_script(IOS_SESSION); await ctx.add_init_script(FAKE_REC)
    page = await ctx.new_page(); await page.goto(URL); await page.wait_for_selector('#home.on')
    await page.evaluate('renderDash()'); await page.wait_for_selector('#micTest'); await page.tap('#micTest')
    await page.wait_for_function("document.querySelector('#micRes').textContent.includes('works') || document.querySelector('#micRes').textContent.includes('✗')", timeout=20000)
    r = await page.text_content('#micRes'); print('MIC TEST BUTTON:', r[:160]); assert 'works' in r; await b.close()
if __name__ == "__main__": asyncio.run(main())
