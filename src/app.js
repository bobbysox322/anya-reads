'use strict';
// ===================== UTIL =====================
const $ = s => document.querySelector(s);
const QS = new URLSearchParams(location.search);
const MUTE = QS.has('mute');
// On-device debug log (Grown-ups → Debug log). Keeps the last 150 events and errors in localStorage so a parent can report them.
const DBG = { key:'anyaReads.debug', list:[],
  init(){ try { this.list = JSON.parse(localStorage.getItem(this.key) || '[]'); } catch(e){ this.list = []; }
    addEventListener('error', e => this.log('ERROR ' + (e.message || e) + (e.filename ? ' @' + String(e.lineno) : '')));
    addEventListener('unhandledrejection', e => this.log('PROMISE ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));
    const w = console.warn.bind(console), er = console.error.bind(console);
    console.warn = (...a) => { this.log('warn ' + a.map(String).join(' ')); w(...a); }; console.error = (...a) => { this.log('error ' + a.map(String).join(' ')); er(...a); }; },
  log(msg){ const t = new Date(); const line = `${t.toTimeString().slice(0,8)} ${String(msg).slice(0,300)}`; this.list.push(line); if (this.list.length > 150) this.list.splice(0, this.list.length - 150);
    try { localStorage.setItem(this.key, JSON.stringify(this.list)); } catch(e){}
    const o = document.getElementById('dbgOverlay'); if (o){ o.textContent = this.list.slice(-8).join('\n'); } } };
DBG.init();          // testing: skip speech
const sleep = ms => new Promise(r => setTimeout(r, MUTE ? Math.min(ms, 20) : ms));
const DAY = 864e5;
const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = a => a[Math.floor(Math.random() * a.length)];
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const MAXLEVEL = LETTERS.length;
function graphemes(word){ const w = word.toLowerCase(), out = []; for (let i = 0; i < w.length; i++){ if (w[i]==='q' && w[i+1]==='u'){ out.push('qu'); i++; } else out.push(w[i]); } return out; }
function wordLevel(w){ let m = 0; for (const g of graphemes(w)){ const L = LMAP[g]; if (!L) return 999; m = Math.max(m, L.level); } return m; }
const WORDS = WORDLIST.map(o => ({...o, level: wordLevel(o.w)})).filter(o => o.level <= MAXLEVEL);
const WMAP = Object.fromEntries(WORDS.map(o => [o.w, o]));
function tokenLevel(t){ const k = t.toLowerCase(); return HMAP[k] ? HMAP[k].level : wordLevel(k); }
const SENTS = SENTENCES.map(([s,a,b], i) => { const toks = s.replace(/[.!?,]/g,'').split(' '); return {id:'S:'+i, s, toks, a, b, hearts: toks.map(t => t.toLowerCase()).filter(t => HMAP[t]), level: Math.max(...toks.map(tokenLevel))}; }).filter(o => o.level <= MAXLEVEL);
const SMAP = Object.fromEntries(SENTS.map(o => [o.id, o]));

// ===================== STATE =====================
const KEY = 'anyaReads.v1';
function defaults(){ return { version:1, name:'Anya', level:1, created:Date.now(),
  settings:{ items:15, maxMin:10, voice:'', rate:0.85, soundMode:'tts', anim:true, speak:'on', speakN:3, clips:true },
  items:{}, intro:{}, sessions:[], log:[], rainbow:0, spoken:{} }; }
let state;
function load(){ try { state = JSON.parse(localStorage.getItem(KEY)) || defaults(); } catch(e){ state = defaults(); }
  const d = defaults(); for (const k in d) if (state[k] === undefined) state[k] = d[k];
  state.settings = {...d.settings, ...state.settings}; if (!state.spoken) state.spoken = {}; }
function save(){ try { localStorage.setItem(KEY, JSON.stringify(state)); } catch(e){ console.warn('save failed', e); } }

// Item helpers -------------------------------------------------------
// ids: L:m (letter sound), W:mat (decodable word), H:the (heart word), S:3 (sentence)
function itemLevel(id){ const [k, v] = [id[0], id.slice(2)];
  if (k==='L') return LMAP[v].level; if (k==='W') return WMAP[v].level; if (k==='H') return HMAP[v].level; if (k==='S') return SMAP[id].level; return 99; }
function itemLabel(id){ const [k, v] = [id[0], id.slice(2)]; if (k==='S') return '“'+SMAP[id].s+'”'; if (k==='H') return '♥ '+HMAP[v].w; return v; }
function rec(id){ return state.items[id] || (state.items[id] = {a:0, c:0, h:[], first:0, last:0, box:0, due:0, ns:0, ls:'', bs:'', help:0}); }
function recentAcc(it, n=5){ const h = it.h.slice(-n); return h.length ? h.reduce((x,y)=>x+y,0) / h.length : 0; }
function mastered(id){ const it = state.items[id]; return !!it && it.a >= 3 && it.ns >= 2 && recentAcc(it) >= 0.8; }
const INTERVALS = [0, 1, 2, 4, 7, 14];
function recordAttempt(id, correct, act, help){
  const it = rec(id), now = Date.now(), sid = SESSION ? SESSION.id : '';
  it.a++; if (correct) it.c++; it.h.push(correct ? 1 : 0); if (it.h.length > 10) it.h.shift();
  if (!it.first) it.first = now; it.last = now; it.help += help || 0;
  if (it.ls !== sid){ it.ns++; it.ls = sid; }
  if (correct){ if (it.bs !== sid){ it.box = Math.min(it.box + 1, 5); it.bs = sid; } }
  else it.box = Math.max(0, it.box - 2);
  it.due = now + INTERVALS[it.box] * DAY - 36e5; // an hour early so "tomorrow" means next day's session
  state.log.push([now, id, act, correct ? 1 : 0, help || 0]); if (state.log.length > 4000) state.log.splice(0, state.log.length - 4000);
  if (SESSION){ SESSION.n++; if (correct) SESSION.c++; const s = curSessRec(); if (s){ s.n = SESSION.n; s.c = SESSION.c; s.end = now; s.dur = Math.round((now - s.start)/1000); s.items[id] = (s.items[id]||0) + 1; } }
  save();
}
function recordSpoken(id, ok, act, heard){ // ok: true / false (grown-up check) or null (self-check practice)
  const it = state.spoken[id] || (state.spoken[id] = {a:0, c:0, chk:0, h:[], last:0});
  it.a++; it.last = Date.now(); if (ok !== null){ it.chk++; if (ok) it.c++; it.h.push(ok ? 1 : 0); if (it.h.length > 10) it.h.shift(); }
  state.log.push([Date.now(), id, act, ok === null ? -1 : ok ? 1 : 0, 0, heard || '']);
  const s = curSessRec(); if (s){ s.sp = (s.sp || 0) + 1; if (ok) s.spc = (s.spc || 0) + 1; if (ok !== null) s.spk = (s.spk || 0) + 1; }
  save(); }
function curSessRec(){ return SESSION && state.sessions.find(s => s.id === SESSION.id); }

// What exists at a level --------------------------------------------
function knownLetters(L){ return LETTERS.filter((l,i) => i + 1 <= L).map(l => l.id); }
function available(L){
  const out = [];
  for (const l of knownLetters(L)) out.push('L:'+l);
  for (const w of WORDS) if (w.level <= L) out.push('W:'+w.w);
  for (const h of HEARTS) if (h[1] <= L) out.push('H:'+h[0].toLowerCase());
  for (const s of SENTS) if (s.level <= L) out.push(s.id);
  return out;
}
function levelCheck(L){ // is level L done -> can advance?
  const lets = ['L:' + LETTERS[L-1].id];
  const hearts = HEARTS.filter(h => h[1] === L).map(h => 'H:' + h[0].toLowerCase());
  const words = WORDS.filter(w => w.level === L).map(w => 'W:' + w.w);
  const needW = Math.min(2, words.length);
  const okW = words.filter(mastered).length;
  return { ok: lets.every(mastered) && hearts.every(mastered) && okW >= needW, lets, hearts, words, okW, needW };
}

// ===================== SPEECH =====================
// Pre-recorded natural voice (Jenny) -----------------------------------
// Priority everywhere: parent recording > pre-made clip > device speechSynthesis.
const BUILD = '%%BUILD%%';
const SILENT = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAzAAAAAAAAAAAAAAD/84TAAAAAAAAAAAAASW5mbwAAAA8AAAAFAAACoABtbW1tbW1tbW1tbW1tbW1tbW1tkpKSkpKSkpKSkpKSkpKSkpKSkpK2tra2tra2tra2tra2tra2tra2ttvb29vb29vb29vb29vb29vb29vb//////////////////////////8AAAAATGF2YzYxLjE5AAAAAAAAAAAAAAAAJARQAAAAAAAAAqC9P8vrAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/80TEAAAAA0gAAAAATEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEUwAAA0gAAAAAMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy7/80TEpgAAA0gAAAAAMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/80TErAAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVU=';
const Clips = { man:null, base:'audio/jenny/', urls:{}, pending:{}, el:null, ok:false,
  async init(){ try { const r = await fetch(this.base + 'manifest.json', {cache:'no-cache'}); if (r.ok){ this.man = await r.json(); this.ok = true; } } catch(e){} },
  key(t){ return String(t).toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim(); },
  on(){ return this.ok && state.settings.clips !== false; },
  has(k){ return this.on() && !!this.man.clips[k]; },
  load(k){ if (!this.has(k)) return Promise.resolve(null); if (this.urls[k]) return Promise.resolve(this.urls[k]);
    return this.pending[k] || (this.pending[k] = fetch(this.base + this.man.clips[k]).then(r => r.ok ? r.blob() : null)
      .then(b => b ? (this.urls[k] = URL.createObjectURL(b)) : null).catch(() => null).finally(() => { delete this.pending[k]; })); },
  async preload(keys){ keys = [...new Set(keys)].filter(k => this.has(k) && !(this.urls[k] && AudioOut.bufs[this.urls[k]])); let i = 0;
    const worker = async () => { while (i < keys.length){ const u = await this.load(keys[i++]); if (u) await AudioOut.decode(u); } }; await Promise.all([1,2,3,4,5,6].map(worker)); },
  // One shared <audio> element, unlocked by a tap: iOS then lets it play later without a new gesture, and it ignores the mute switch like any media.
  player(){ if (!this.el){ this.el = new Audio(); this.el.preload = 'auto'; this.el.setAttribute('playsinline', ''); } return this.el; },
  unlock(){ const a = this.player(); if (this.unlocked) return; this.unlocked = true; try { a.src = SILENT; a.volume = 1; const p = a.play(); if (p) p.catch(() => { this.unlocked = false; }); } catch(e){} },
};
// All clips play through ONE Web Audio context that never goes idle. On iPad, the old way (a media element
// that went silent between clips) let iOS power the audio output down. Each new clip then started while the output
// was ramping back up, so the first words of every screen were quiet. A continuous, inaudible keep-alive signal
// (about -86 dBFS) keeps the output awake, so every clip starts at full level.
const SILENT_LOOP = 'data:audio/mpeg;base64,SUQzBAAAAAAAIlRTU0UAAAAOAAADTGF2ZjYxLjcuMTAzAAAAAAAAAAAAAAD/83DAAAAAAAAAAAAASW5mbwAAAA8AAAApAAAJFAAZGR8fJSUlKyswMDA2Njw8PEJCR0dNTU1TU1lZWV5eZGRkampwcHB1dXt7gYGBh4eMjIySkpiYmJ6eo6Opqamvr7W1tbq6wMDAxsbMzMzR0dfX3d3d4+Po6Oju7vT09Pr6//8AAAAATGF2YzYxLjE5AAAAAAAAAAAAAAAAJAPeAAAAAAAACRSa85HjAAAAAAAAAAAAAAAAAP/zIMQAAAADSAAAAABMQU1FMy4xMDBVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yLEJwAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMRPAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDEdgAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MgxJ0AAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVf/zIsTEAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MixNcAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yLE1wAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVf/zIsTXAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MixNcAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yLE1wAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVf/zIsTXAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//MixNcAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVTEFNRTMuMTAwVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVUxBTUUzLjEwMFVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8yLE1wAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/zIMTYAAADSAAAAABVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVX/8yDE2AAAA0gAAAAAVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//MgxNgAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';
const AudioOut = { ctx:null, bufs:{}, pend:{}, cur:null, loopEl:null,
  ensure(){ if (this.ctx) return this.ctx; const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null;
    try { this.ctx = new AC({latencyHint:'interactive'}); } catch(e){ try { this.ctx = new AC(); } catch(e2){ return null; } }
    const c = this.ctx, n = c.sampleRate, b = c.createBuffer(1, n, n), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.sin(2 * Math.PI * 20 * i / n) * 1e-3; // 20 Hz at -60 dBFS: inaudible, but not treated as silence
    const src = c.createBufferSource(); src.buffer = b; src.loop = true; src.connect(c.destination); src.start(0);
    document.addEventListener('visibilitychange', () => { if (!this.ctx) return; if (document.hidden) this.ctx.suspend().catch(() => {}); else this.ctx.resume().catch(() => {}); });
    return c; },
  // Called on every tap. Resumes the context and, on iOS, asks for "playback" audio so the mute switch doesn't silence it.
  unlock(){ const c = this.ensure(); if (!c) return;
    try { if (navigator.audioSession && navigator.audioSession.type !== 'playback') navigator.audioSession.type = 'playback'; } catch(e){}
    if (c.state !== 'running') c.resume().catch(() => {});
    if (!navigator.audioSession && /iP(ad|hone|od)|Macintosh/.test(navigator.userAgent) && 'ontouchend' in document && !this.loopEl){
      // older iOS: a looping silent media element makes Web Audio play even with the mute switch on
      const a = new Audio(SILENT_LOOP); a.loop = true; a.setAttribute('playsinline', ''); a.volume = 0.01; this.loopEl = a; a.play().catch(() => { this.loopEl = null; }); } },
  running(){ return this.ctx && this.ctx.state === 'running'; },
  decode(url){ if (this.bufs[url]) return Promise.resolve(this.bufs[url]); const c = this.ensure(); if (!c) return Promise.resolve(null);
    return this.pend[url] || (this.pend[url] = fetch(url).then(r => r.arrayBuffer())
      .then(ab => new Promise(res => { try { const p = c.decodeAudioData(ab, res, () => res(null)); if (p && p.catch) p.catch(() => res(null)); } catch(e){ res(null); } }))
      .then(buf => { if (buf) this.bufs[url] = buf; delete this.pend[url]; return buf; }).catch(() => { delete this.pend[url]; return null; })); },
  play(buf){ return new Promise(res => { const c = this.ctx; const src = c.createBufferSource(); src.buffer = buf; src.connect(c.destination);
      let done = false; const fin = () => { if (!done){ done = true; clearTimeout(to); if (this.cur && this.cur.src === src) this.cur = null; res(); } };
      // after a pause (a new screen), start on 300 ms of silence so any output ramp happens before the speech
      const idle = !this.lastEnd || performance.now() - this.lastEnd > 1200; const lead = idle ? 0.3 : 0.005;
      src.onended = () => { this.lastEnd = performance.now(); fin(); }; const to = setTimeout(fin, (buf.duration + lead) * 1000 + 1500); this.cur = {src, fin}; src.start(c.currentTime + lead); }); },
  stop(){ if (this.cur){ const {src, fin} = this.cur; this.cur = null; try { src.onended = null; src.stop(); } catch(e){} this.lastEnd = performance.now(); fin(); } },

};
window.__ttsFallback = [];
const Speech = {
  voice:null, voices:[], token:0, audio:null, recs:{},
  init(){ if (!('speechSynthesis' in window)) return; const load = () => { this.voices = speechSynthesis.getVoices().filter(v => /^en/i.test(v.lang)); this.choose(); };
    load(); speechSynthesis.onvoiceschanged = load; },
  choose(){ const want = state.settings.voice; let v = this.voices.find(v => v.voiceURI === want);
    if (!v){ const pref = ['Samantha','Ava','Allison','Susan','Zoe','Nicky','Google US English','Aria','Jenny','Ana','Karen','Moira','Serena','Tessa'];
      for (const p of pref){ v = this.voices.find(x => x.name.includes(p) && /en[-_]US/i.test(x.lang)) || this.voices.find(x => x.name.includes(p)); if (v) break; } }
    this.voice = v || this.voices.find(x => /en[-_]US/i.test(x.lang)) || this.voices[0] || null; },
  // Root cause of the "quiet start" on iPad: this used to speak a silent speechSynthesis utterance on every Start/Next tap
  // (a trick to unlock the device voice). On iOS, any speech synthesis ducks the app's other audio, and the duck releases
  // over about a second. So the first clip of every new screen played ducked and then got louder. The replay button
  // didn't do this, which is why replays sounded right. Now the device voice is only touched when it's actually needed.
  unlock(){ AudioOut.unlock(); Clips.unlock(); if (!Clips.on()) { if (!this._ttsUnlocked){ this._ttsUnlocked = true; try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); } catch(e){} } } },
  cancel(){ this.token++; try { if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel(); } catch(e){} this.stopAudio(); setTalking(false); },
  lastTTS: 0,
  stopAudio(){ AudioOut.stop(); if (this.audio){ try { this.audio.pause(); } catch(e){} if (this._fin) this._fin(); this.audio = null; } },
  // Speak text: a pre-made clip when there is one (slow clip for slow rates), else the device voice.
  async text(t, rate){ const k = Clips.key(t);
    if (!MUTE && Clips.on()){ const url = (rate && rate <= 0.6 && await Clips.load('slow:' + k)) || await Clips.load(k);
      if (url) return this.play(url); }
    return this.tts(t, rate); },
  tts(t, rate){ if (Clips.on() && !MUTE) window.__ttsFallback.push(t); return new Promise(res => {
      if (MUTE || !('speechSynthesis' in window)) return setTimeout(res, 10);
      const u = new SpeechSynthesisUtterance(t); if (this.voice) u.voice = this.voice; u.lang = this.voice ? this.voice.lang : 'en-US';
      u.rate = rate || state.settings.rate; u.pitch = 1.05; let done = false; const fin = () => { if (!done){ done = true; clearTimeout(to); res(); } };
      this._u = u; // keep a reference: iOS can garbage-collect utterances and never fire onend
      u.onend = () => { Speech.lastTTS = Date.now(); fin(); }; u.onerror = fin; const to = setTimeout(fin, 1800 + t.length * 110 / (u.rate || 1)); Speech.lastTTS = Date.now() + 60000;
      speechSynthesis.speak(u); }); },
  // Web Audio when possible (decoded buffer, steady level); the shared media element is only a fallback.
  async play(url){ if (MUTE || !url) return sleep(10);
    if (AudioOut.ensure()){ const my = this.token; if (!AudioOut.running()) AudioOut.unlock();
      const buf = await AudioOut.decode(url); if (my !== this.token) return;
      if (buf && AudioOut.running()){ const since = Date.now() - this.lastTTS; if (since < 900) await sleep(900 - Math.max(0, since)); // let an iOS speech duck release
        if (my !== this.token) return; this.stopAudio(); return AudioOut.play(buf); } }
    return this.playEl(url); },
  playEl(url){ return new Promise(res => { const a = Clips.player(); this.stopAudio();
      this.audio = a; let done = false; const fin = () => { if (!done){ done = true; clearTimeout(to); a.onended = a.onerror = null; if (this._fin === fin) this._fin = null; res(); } };
      this._fin = fin; a.onended = fin; a.onerror = fin; let to = setTimeout(fin, 8000);
      a.onloadedmetadata = () => { if (isFinite(a.duration)){ clearTimeout(to); to = setTimeout(fin, a.duration * 1000 + 1500); } };
      try { a.src = url; a.currentTime = 0; const p = a.play(); if (p) p.catch(fin); } catch(e){ fin(); } }); },
  // letter sound: parent recording > pre-made clip > device voice respelling
  async phon(id){ if (this.recs[id]) return this.play(this.recs[id]);
    const url = MUTE ? null : await Clips.load('ph:' + id); if (url) return this.play(url);
    return this.tts(LMAP[id].noTTS ? 'ks' : LMAP[id].tts, 0.7); },
  async say(parts){ const my = ++this.token; setTalking(true);
    try { if (!MUTE && (speechSynthesis.speaking || speechSynthesis.pending)){ speechSynthesis.cancel(); await new Promise(r => setTimeout(r, 60)); } } catch(e){} // Safari drops speak() right after cancel()
    this.stopAudio();
    for (const p of [].concat(parts)){ if (my !== this.token) return;
      const cap = ms => pr => Promise.race([pr, sleep(ms)]); // safety net if an audio end event never fires
      if (typeof p === 'string') await cap(2500 + p.length * 120)(this.text(p));
      else if (p.pause) await sleep(p.pause);
      else if (p.rec) await cap(5000)(this.play(this.recs[p.rec]));
      else if (p.ph) await cap(3000)(this.phon(p.ph));
      else if (p.t) await cap(2500 + p.t.length * 200)(this.text(p.t, p.rate)); }
    if (my === this.token) setTalking(false); }
};
function setTalking(on){ document.querySelectorAll('.speaker').forEach(b => b.classList.toggle('talking', on)); }
// The pure sound of a letter: parent recording > TTS approximation. withKey adds "as in apple".
function sound(id, withKey = true){
  const L = LMAP[id], keyPhrase = L.endKey ? 'like the end of ' + L.key : 'as in ' + L.key;
  if (Speech.recs[id]) return withKey ? [{rec:id}, {pause:200}, keyPhrase] : [{rec:id}];
  const clip = Clips.has('ph:' + id);
  if (state.settings.soundMode === 'word' || (L.noTTS && !clip)) return [L.endKey ? 'the sound at the end of ' + L.key : 'the first sound in ' + L.key];
  return withKey ? [{ph:id}, {pause:250}, keyPhrase] : [{ph:id}];
}
function pureSound(id){ return {ph:id}; }
// every clip a step might use, so a session can preload them
function stepClipKeys(step){ const k = step.id[0], v = step.id.slice(2), out = [];
  const w = x => { const c = Clips.key(x); out.push(c, 'slow:' + c); };
  if (k === 'L'){ const L = LMAP[v]; out.push('ph:' + v, 'as in ' + L.key, 'the first sound in ' + L.key, Clips.key(L.key)); L.pics.forEach(p => out.push(Clips.key(p[0]))); }
  else if (k === 'W'){ w(v); graphemes(v).forEach(g => out.push('ph:' + g)); const W = WMAP[v]; if (W && W.n) out.push(Clips.key(W.n)); }
  else if (k === 'H') w(HMAP[v].w);
  else if (k === 'S'){ const S = SMAP[step.id]; if (S){ out.push(Clips.key(S.s)); S.s.split(' ').forEach(x => out.push(Clips.key(x))); } }
  return out; }

// Parent recordings of letter sounds (IndexedDB) ------------------------
const AudioDB = {
  db:null,
  open(){ return new Promise(res => { if (!window.indexedDB) return res(null); const r = indexedDB.open('anyaReadsAudio', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('sounds'); r.onsuccess = () => { this.db = r.result; res(this.db); }; r.onerror = () => res(null); }); },
  async loadAll(){ if (!this.db) return; await new Promise(res => { const tx = this.db.transaction('sounds'); const st = tx.objectStore('sounds');
    const rq = st.openCursor(); rq.onsuccess = () => { const c = rq.result; if (c){ Speech.recs[c.key] = URL.createObjectURL(c.value); c.continue(); } else res(); }; rq.onerror = res; }); },
  put(k, blob){ return new Promise(res => { const tx = this.db.transaction('sounds','readwrite'); tx.objectStore('sounds').put(blob, k); tx.oncomplete = res; tx.onerror = res; }); },
  del(k){ return new Promise(res => { const tx = this.db.transaction('sounds','readwrite'); tx.objectStore('sounds').delete(k); tx.oncomplete = res; tx.onerror = res; }); },
};

// ===================== UNICORN ART =====================
function unicornSVG(cls = ''){ return `<svg class="uni ${cls}" viewBox="0 0 220 200" aria-hidden="true">
 <defs><linearGradient id="hornG" x1="0" x2="1"><stop offset="0" stop-color="#f7d98b"/><stop offset="1" stop-color="#e9b85a"/></linearGradient></defs>
 <g class="body">
  <path d="M40 112 C10 100 8 140 28 150 C18 128 36 124 40 122Z" fill="#f8c8dc"/><path d="M42 118 C22 120 20 160 44 162 C32 146 44 136 46 128Z" fill="#cdb8ec"/><path d="M44 126 C34 140 40 170 58 168 C48 156 52 142 52 134Z" fill="#c4e1f7"/>
  <rect x="62" y="140" width="16" height="44" rx="8" fill="#fff" stroke="#ddd0ee" stroke-width="3"/><rect x="84" y="144" width="16" height="42" rx="8" fill="#fff" stroke="#ddd0ee" stroke-width="3"/>
  <rect x="122" y="144" width="16" height="42" rx="8" fill="#fff" stroke="#ddd0ee" stroke-width="3"/><rect x="142" y="140" width="16" height="44" rx="8" fill="#fff" stroke="#ddd0ee" stroke-width="3"/>
  <rect x="62" y="176" width="16" height="9" rx="4" fill="#cdb8ec"/><rect x="84" y="178" width="16" height="9" rx="4" fill="#cdb8ec"/><rect x="122" y="178" width="16" height="9" rx="4" fill="#cdb8ec"/><rect x="142" y="176" width="16" height="9" rx="4" fill="#cdb8ec"/>
  <ellipse cx="108" cy="128" rx="64" ry="38" fill="#fff" stroke="#ddd0ee" stroke-width="3"/>
 </g>
 <g class="head">
  <path d="M132 112 C130 86 140 70 152 62 L176 86 C164 96 160 108 158 126Z" fill="#fff" stroke="#ddd0ee" stroke-width="3"/>
  <ellipse cx="170" cy="62" rx="32" ry="27" fill="#fff" stroke="#ddd0ee" stroke-width="3"/>
  <ellipse cx="192" cy="76" rx="18" ry="14" fill="#fdeef5" stroke="#ddd0ee" stroke-width="3"/>
  <circle cx="196" cy="74" r="2.2" fill="#d79ab8"/>
  <path d="M154 42 L148 22 L166 36Z" fill="#fff" stroke="#ddd0ee" stroke-width="3" stroke-linejoin="round"/>
  <path d="M172 38 L184 4 L190 42Z" fill="url(#hornG)" stroke="#e0b062" stroke-width="2" stroke-linejoin="round"/>
  <path d="M175 30 L188 27 M178 20 L186 18" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".8"/>
  <path d="M168 60 Q174 54 180 60" stroke="#3b3352" stroke-width="3.5" fill="none" stroke-linecap="round"/>
  <path d="M182 60 L186 56 M178 57 L180 52" stroke="#3b3352" stroke-width="2" stroke-linecap="round"/>
  <circle cx="176" cy="72" r="6" fill="#f8c8dc" opacity=".8"/>
  <path d="M186 86 Q192 90 198 86" stroke="#c98aa8" stroke-width="2.5" fill="none" stroke-linecap="round"/>
  <circle cx="150" cy="44" r="11" fill="#f8c8dc"/><circle cx="140" cy="58" r="11" fill="#cdb8ec"/><circle cx="136" cy="74" r="11" fill="#c4e1f7"/>
  <circle cx="134" cy="90" r="10" fill="#f8c8dc"/><circle cx="134" cy="104" r="9" fill="#cdb8ec"/><circle cx="160" cy="36" r="9" fill="#fbe9ad"/>
 </g></svg>`; }
function setUni(cls){ document.querySelectorAll('#play .uni').forEach(u => { u.classList.remove('nod','tilt'); if (cls){ void u.offsetWidth; u.classList.add(cls); setTimeout(() => u.classList.remove(cls), 1400); } }); }
const SPEAKER = `<svg viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#3b3352"/><path d="M16 8.5c1.2 1 1.8 2.2 1.8 3.5s-.6 2.5-1.8 3.5M18.5 6c2 1.6 3 3.6 3 6s-1 4.4-3 6" stroke="#3b3352" stroke-width="2" fill="none" stroke-linecap="round"/></svg>`;
const ARROW = `<svg viewBox="0 0 24 24"><path d="M5 12h12M12 6l6 6-6 6" stroke="#fff" stroke-width="3.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const PLAYICON = `<svg viewBox="0 0 24 24"><path d="M7 4.5v15l13-7.5z" fill="#3b3352" stroke="#3b3352" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

// End-of-lesson celebration (about 4 s): the unicorn gallops along the rainbow arc to her new step in three
// bouncy strides, leaving sparkles, then twirls, and stars bloom around her. Calm, with no points.
// With reduced motion, or animations off, the unicorn just appears on the new step.
function finishCelebration(fromSteps, toSteps, per = 20){
  const u = document.querySelector('#finish #rbUni'); if (!u) return;
  const svg = u.ownerSVGElement, cx = 300, cy = 250, R = 236;
  const at = k => { const t = Math.PI - (k / (per - 1)) * Math.PI; return [cx + R * Math.cos(t), cy - R * Math.sin(t)]; };
  const k1 = toSteps % per; const a0 = Math.max(-1, k1 - 4); // a short run-up along the steps she's walked, so the gallop is visible even for one step
  const place = (x, y, rot = 0, sc = 1) => { u.setAttribute('x', x); u.setAttribute('y', y + 12); u.setAttribute('transform', `rotate(${rot} ${x} ${y}) translate(${x} ${y}) scale(${sc}) translate(${-x} ${-y})`); };
  const dot = svg.querySelectorAll('circle')[(k1 + per - 1) % per];
  if (!motionOK()){ const [x, y] = at(k1); place(x, y); return; }
  const mk = (x, y, cls, txt = '✦', extra = '') => { const e = document.createElementNS('http://www.w3.org/2000/svg', 'text'); e.setAttribute('x', x); e.setAttribute('y', y);
    e.setAttribute('text-anchor', 'middle'); e.setAttribute('class', cls); e.textContent = txt; if (extra) e.setAttribute('style', extra); svg.appendChild(e); return e; };
  const span = Math.max(1, k1 - a0), GALLOP = 2400, TWIRL = 900, strides = 3; let t0 = null, lastStride = -1;
  place(...at(a0), 0, 1);
  const frame = t => { if (!document.body.contains(u)) return; if (t0 === null) t0 = t; const e = t - t0;
    if (e < GALLOP){ const p = e / GALLOP, ease = p < .5 ? 2*p*p : 1 - Math.pow(-2*p + 2, 2) / 2; const k = a0 + span * ease; const [x, y] = at(k);
      const stride = Math.floor(p * strides), sp = (p * strides) % 1; const hop = Math.sin(sp * Math.PI) * 26;
      place(x, y - hop, Math.sin(sp * Math.PI * 2) * -8, 1.35);
      if (stride !== lastStride){ lastStride = stride; const s = mk(x, y + 18, 'rb-spark'); setTimeout(() => s.remove(), 1400); }
      requestAnimationFrame(frame); return; }
    const [x, y] = at(k1);
    if (e < GALLOP + TWIRL){ const p = (e - GALLOP) / TWIRL; place(x, y - Math.sin(p * Math.PI) * 10, p * 360, 1.35 - .15 * p); requestAnimationFrame(frame); return; }
    place(x, y, 0, 1.2);
    if (dot) dot.classList.add('rb-pop');
    for (let i = 0; i < 10; i++){ const ang = i * Math.PI / 5; const s = mk(x, y, 'rb-bloom', '✦', `--dx:${(Math.cos(ang) * 46).toFixed(1)}px;--dy:${(-Math.sin(ang) * 40).toFixed(1)}px;animation-delay:${i * 35}ms`); setTimeout(() => s.remove(), 1700); }
  };
  setTimeout(() => requestAnimationFrame(frame), 500);
}
function rainbowSVG(steps, per = 20, animateFrom = null){
  const cx = 300, cy = 250, R = 210; const bands = ['#f8c8dc','#fdd5c0','#fbe9ad','#c4ecd9','#c4e1f7','#cdb8ec'];
  let s = `<svg viewBox="0 0 600 270" style="width:100%">`;
  bands.forEach((c,i) => { const r = R - i*14; s += `<path d="M${cx-r} ${cy} A${r} ${r} 0 0 1 ${cx+r} ${cy}" stroke="${c}" stroke-width="14" fill="none"/>`; });
  const pos = k => { const t = Math.PI - (k/(per-1))*Math.PI; const r = R + 26; return [cx + r*Math.cos(t), cy - r*Math.sin(t)]; };
  const cur = steps % per;
  for (let k = 0; k < per; k++){ const [x,y] = pos(k); s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${k < cur ? 7 : 5}" fill="${k < cur ? '#b9a2e0' : '#e8e1f2'}"/>`; }
  const [ux,uy] = pos(cur); const from = animateFrom != null ? pos(animateFrom % per) : null;
  s += `<text id="rbUni" x="${(from||[ux,uy])[0]}" y="${(from||[ux,uy])[1]+12}" font-size="40" text-anchor="middle" data-tx="${ux}" data-ty="${uy+12}">🦄</text>`;
  const done = Math.floor(steps / per); if (done) s += `<text x="300" y="262" font-size="20" text-anchor="middle" fill="#7a7290">rainbows walked: ${done}</text>`;
  return s + '</svg>';
}

// ===================== SCREENS =====================
function show(id){ document.querySelectorAll('.screen').forEach(s => s.classList.toggle('on', s.id === id)); }
function renderHome(){
  $('#home').innerHTML = `<div class="stars"></div>
   <button class="speaker speaker-home" aria-label="Hear instructions">${SPEAKER}</button>
   <button class="grownup" id="gu">Grown-ups</button>
   <h1>${esc(state.name)} Reads</h1>
   <div class="uni-wrap">${unicornSVG()}</div>
   <button class="big-start" id="startBtn" aria-label="Start">${PLAYICON}</button>
   <div class="rainbow-box">${rainbowSVG(state.rainbow)}</div>`;
  $('#startBtn').onclick = () => { Speech.unlock(); startSession(); };
  $('#home .speaker').onclick = () => { Speech.unlock(); Speech.say([`Hi ${state.name}! Tap the big green button to start reading with the unicorn.`]); };
  $('#gu').onclick = openGate;
  show('home');
}

// ---------------- session planning ----------------
let SESSION = null;
function chooseAct(id, rep){
  const k = id[0], v = id.slice(2), it = state.items[id];
  if (k === 'L'){ const hasPics = LMAP[v].pics.length > 0; return (hasPics && rep > 0 && it && it.a >= 2 && Math.random() < 0.4) ? 'letterPic' : 'hearTap'; }
  if (k === 'H') return 'heartPick';
  if (k === 'S') return 'sentence';
  if (k === 'W'){ const w = WMAP[v], nAvail = WORDS.filter(x => x.level <= state.level).length; const opts = [];
    if (w.e){ opts.push('readPic','readPic'); }
    if (nAvail >= 3) opts.push('hearPick');
    if (!(rep === 0 && !(it && it.a))) opts.push('build'); else if (!opts.length) opts.push('build');
    return pick(opts); }
}
function priority(id){
  const it = state.items[id], now = Date.now(), L = state.level; let p = Math.random() * 1.5;
  if (itemLevel(id) === L) p += 3; else if (itemLevel(id) >= L - 2) p += 1;
  if (!it || !it.a) p += 1.5;
  else { p += (1 - recentAcc(it)) * 4; if (it.due <= now) p += 2 + Math.min(3, (now - it.due) / DAY); if (mastered(id)) p -= 1.5; }
  if (id[0] === 'S') p += 0.5; return p;
}
function buildPlan(){
  const L = state.level, N = state.settings.items, avail = available(L);
  const entries = []; const count = {}; const add = (id, needIntro) => { entries.push({id, rep: count[id] || 0, needIntro}); count[id] = (count[id] || 0) + 1; };
  // 1. new letters + heart words for this level (taught, then retrieved 3x / 2x spaced)
  const newL = knownLetters(L).filter(l => !state.intro['L:'+l]).map(l => 'L:'+l);
  const newH = HEARTS.filter(h => h[1] <= L && !state.intro['H:'+h[0].toLowerCase()]).map(h => 'H:'+h[0].toLowerCase()).slice(0, 2);
  const newW = shuffle(WORDS.filter(w => (newL.length ? w.level < L : w.level <= L) && !state.intro['W:'+w.w])).sort((a,b) => b.level - a.level).slice(0, newL.length ? 1 : 3).map(w => 'W:'+w.w);
  newL.forEach(id => { add(id, true); add(id); add(id); });
  newH.forEach(id => { add(id, true); add(id); });
  newW.forEach(id => { add(id, true); add(id); });
  // 2. review: spaced, weakest/due first. Small pools repeat more (early levels).
  const heartReady = h => state.intro['H:'+h] || newH.includes('H:'+h);
  const pool = avail.filter(id => state.intro[id] || newL.includes(id) || newH.includes(id) || newW.includes(id) || (id[0] === 'S' && SMAP[id].hearts.every(heartReady)));
  const cap = pool.length < 4 ? 5 : pool.length < 10 ? 3 : 2;
  const ranked = pool.map(id => [id, priority(id)]).sort((a,b) => b[1] - a[1]).map(x => x[0]);
  let guard = 0;
  while (entries.length < N && guard++ < 200){ let added = false;
    for (const id of ranked){ if (entries.length >= N) break; if ((count[id] || 0) < cap && (count[id] || 0) < 1 + Math.floor(guard / 2)){ add(id); added = true; } }
    if (!added && guard > 12) break; }
  // 3. order: interleave, keep same item >=2 apart, teach step before first use with a gap
  const steps = [], introAt = {}; let pending = entries.slice(), last = [];
  const scored = () => steps.filter(s => !s.teach).length;
  // put the earliest-needed intros first
  while (pending.length){
    const intros = pending.filter(e => e.needIntro && !(e.id in introAt));
    const canUse = e => !last.includes(e.id) && (!(newL.includes(e.id) || newH.includes(e.id) || newW.includes(e.id)) || (e.id in introAt && steps.length - introAt[e.id] >= 2));
    let elig = pending.filter(e => !e.needIntro && canUse(e));
    const lastTeach = steps.length && steps[steps.length-1].teach;
    if (intros.length && (!lastTeach) && (steps.length === 0 || Math.random() < 0.5 || !elig.length)){
      const e = intros[0]; introAt[e.id] = steps.length; const k = e.id[0];
      steps.push({teach:true, id:e.id, act: k === 'L' ? 'meet' : k === 'H' ? 'heartMeet' : 'blendModel'});
      e.needIntro = false; last = [e.id]; continue; }
    if (!elig.length) elig = pending.filter(e => !e.needIntro && (e.id in introAt || !(newL.includes(e.id)||newH.includes(e.id)||newW.includes(e.id))) && !last.includes(e.id));
    if (!elig.length) elig = pending.filter(e => !e.needIntro);
    if (!elig.length){ const e = pending.find(e => e.needIntro); if (!e) break; introAt[e.id] = steps.length; steps.push({teach:true, id:e.id, act: e.id[0]==='L'?'meet':e.id[0]==='H'?'heartMeet':'blendModel'}); e.needIntro = false; continue; }
    // prefer items whose reps are behind (spread reps), slight randomness
    elig.sort((a,b) => a.rep - b.rep || Math.random() - .5);
    const e = elig[0]; pending.splice(pending.indexOf(e), 1);
    steps.push({id:e.id, act: chooseAct(e.id, e.rep)}); last = [...last, e.id].slice(-2);
  }
  // 4. speaking practice: only for items she already knows receptively (>= 2 correct taps), mixed into the 2nd half
  if (state.settings.speak !== 'off' && state.settings.speakFirst){ // parent/debug option: open with a speaking item
    const known = avail.filter(id => 'LW'.includes(id[0]) && state.items[id] && state.items[id].c >= 1);
    const id = known.length ? pick(known) : 'L:' + knownLetters(Math.max(1, L))[0];
    steps.unshift({id, act:'sayRepeat', speak:true}); }
  if (state.settings.speak !== 'off'){
    const cands = avail.filter(id => 'LWH'.includes(id[0]) && state.items[id] && state.items[id].c >= 2)
      .map(id => [id, (state.spoken[id] ? state.spoken[id].a : 0) + Math.random() * 1.5 - (state.spoken[id] && state.spoken[id].chk && recentAccSp(state.spoken[id]) < .8 ? 1 : 0)])
      .sort((a,b) => a[1] - b[1]).slice(0, state.settings.speakN).map(x => x[0]);
    cands.forEach((id, i) => { const sp = state.spoken[id]; const act = (sp && sp.a >= 1) || mastered(id) ? pick(['readAloud','readAloud','sayRepeat']) : 'sayRepeat';
      const at = Math.min(steps.length, Math.floor(steps.length * (0.45 + 0.5 * (i + 1) / (cands.length + 1)))); steps.splice(at, 0, {id, act, speak:true}); });
  }
  return steps;
}
function recentAccSp(it){ const h = it.h.slice(-5); return h.length ? h.reduce((a,b)=>a+b,0)/h.length : 0; }

// ---------------- session runner ----------------
async function startSession(){
  const steps = buildPlan();
  SESSION = { id: 's' + Date.now().toString(36), start: Date.now(), steps, idx: 0, n: 0, c: 0, requeued: {}, abort: null, practiced: new Set() };
  state.sessions.push({ id: SESSION.id, start: SESSION.start, end: SESSION.start, dur: 0, n: 0, c: 0, level: state.level, done: false, items: {} });
  if (state.sessions.length > 1000) state.sessions.shift();
  save();
  renderPlay(); show('play'); dbgOverlay(); DBG.log('session start ' + BUILD + ' ctx=' + (AudioOut.ctx && AudioOut.ctx.state));
  if (Clips.on()){ // preload this session's audio: greeting first, then each step in order
    const first = [Clips.key(`Hi ${state.name}! Let's read.`)]; await Promise.race([Clips.preload(first), sleep(1500)]);
    const common = ['yes', 'listen', 'not quite listen', 'that word is', 'find', 'that is', 'that picture is', 'that says', 'there it is', 'starts with', 'that one says', 'we want'];
    Clips.preload([...common, ...steps.flatMap(stepClipKeys)]); }
  let abortRes; SESSION.abortP = new Promise(r => abortRes = r); SESSION.abort = abortRes;
  await Speech.say([`Hi ${state.name}! Let's read.`]);
  for (SESSION.idx = 0; SESSION.idx < SESSION.steps.length; SESSION.idx++){
    const minutes = (Date.now() - SESSION.start) / 6e4;
    if (minutes >= state.settings.maxMin && SESSION.n >= 5) break;
    const step = SESSION.steps[SESSION.idx]; drawDots(); DBG.log(`step ${SESSION.idx} ${step.id} ${step.act}`);
    // forceP lets a handler (e.g. the grown-up 👍) finish the step even if something inside the activity never resolves
    const forceP = new Promise(res => { SESSION.force = v => { DBG.log('force-advance ' + step.id); res(v); }; });
    const r = await Promise.race([Promise.resolve().then(() => runStep(step)).catch(e => { console.warn('step failed', e && (e.stack || e)); return {}; }), SESSION.abortP, forceP]);
    SESSION.force = null; DBG.log('step done ' + JSON.stringify(r || {}).slice(0, 80));
    if (r && r.aborted) return endSession(true);
    if (r && r.scored){ recordAttempt(step.id, r.correct, step.act, r.help); SESSION.practiced.add(step.id);
      if (!r.correct && !SESSION.requeued[step.id]){ SESSION.requeued[step.id] = 1; const at = Math.min(SESSION.idx + 3, SESSION.steps.length);
        SESSION.steps.splice(at, 0, {id: step.id, act: step.act === 'build' ? 'readPicOrHear' : step.act}); } }
    if (r && r.spoken) try { recordSpoken(step.id, r.ok, step.act, r.heard); } catch(e){ console.warn(e); }
    if (r && r.teach){ state.intro[step.id] = Date.now(); save(); }
    let nx; try { nx = await Promise.race([waitNext(r && r.spoken ? 1500 : 0), SESSION.abortP]); } catch(e){ console.warn('next failed', e); nx = {}; } if (nx && nx.aborted) return endSession(true);
  }
  endSession(false);
}
function runStep(step){ Speech.cancel(); setUni(null); $('#stage').innerHTML = ''; hideNext();
  let act = step.act; if (act === 'readPicOrHear') act = (step.id[0]==='W' && WMAP[step.id.slice(2)].e) ? 'readPic' : 'hearPick';
  if (act === 'hearPick' && WORDS.filter(x => x.level <= state.level).length < 3) act = WMAP[step.id.slice(2)].e ? 'readPic' : 'build';
  step.shown = act; return ACTS[act](step); }
function dbgOverlay(){ let o = document.getElementById('dbgOverlay');
  if (state.settings.debugOverlay){ if (!o){ o = document.createElement('pre'); o.id = 'dbgOverlay'; document.body.appendChild(o); } o.textContent = DBG.list.slice(-8).join('\n'); }
  else if (o) o.remove(); }
function renderPlay(){
  $('#play').innerHTML = `<div class="topbar"><button class="homebtn" id="quit" aria-label="Stop">✕</button><div class="dots" id="dots"></div><div style="width:56px"></div></div>
   <div class="playmain"><div class="leftcol"><button class="speaker" id="replay" aria-label="Hear it again">${SPEAKER}</button></div>
   <div id="stage"></div><div class="rightcol"><button class="next" id="next" aria-label="Next">${ARROW}</button></div></div>
   <div class="uni-corner">${unicornSVG()}</div>`;
  $('#replay').onclick = () => { if (PROMPT) PROMPT(); };
  $('#quit').onclick = confirmQuit;
}
function drawDots(){ const d = $('#dots'); if (!d) return; const n = SESSION.steps.length; let h = '';
  for (let i = 0; i < n; i++) h += `<i class="${i < SESSION.idx ? 'done' : i === SESSION.idx ? 'cur' : ''}"></i>`; d.innerHTML = h; }
let PROMPT = null;
function prompt(fn){ PROMPT = fn; return fn(); }
function hideNext(){ const n = $('#next'); if (n) n.classList.remove('show'); }
// auto: after a grown-up check the step moves on by itself (the arrow still shows, for anyone who taps first)
function waitNext(auto = 0){ return new Promise(res => { let n = $('#next'); if (!n){ renderPlay(); n = $('#next'); }
  n.classList.add('show'); DBG.log('next arrow shown');
  let done = false; const go = () => { if (done) return; done = true; n.onclick = n.onpointerup = null; try { Speech.unlock(); } catch(e){} hideNext(); res({}); };
  n.onclick = go; n.onpointerup = go; if (auto) setTimeout(() => { if (!done) DBG.log('auto-advance'); go(); }, auto); }); }
function confirmQuit(){
  const m = $('#modal'); m.innerHTML = `<div class="card gate"><div class="q" style="font-size:24px">Stop for today?</div>
   <div class="row" style="gap:20px"><button class="tile small" id="qy" aria-label="Yes, stop">✓</button><button class="tile small" id="qn" aria-label="No, keep going">↩</button></div></div>`;
  m.classList.add('on'); Speech.say(['Do you want to stop?']);
  $('#qy').onclick = () => { m.classList.remove('on'); SESSION && SESSION.abort && SESSION.abort({aborted:true}); };
  $('#qn').onclick = () => { m.classList.remove('on'); Speech.cancel(); };
}
function endSession(aborted){
  Speech.cancel(); const s = curSessRec(); const ses = SESSION; SESSION = null; PROMPT = null;
  if (!s) return renderHome();
  s.end = Date.now(); s.dur = Math.round((s.end - s.start) / 1000);
  const total = ses.steps.filter(x => !x.teach && !x.speak).length;
  s.done = !aborted || s.n >= Math.ceil(total * 0.6);
  if (s.n === 0 && aborted){ state.sessions = state.sessions.filter(x => x.id !== s.id); save(); return renderHome(); }
  const prevRainbow = state.rainbow; if (s.done) state.rainbow++;
  let leveled = false;
  if (s.done && state.level < MAXLEVEL && levelCheck(state.level).ok){ state.level++; leveled = true; s.levelUp = state.level; }
  save();
  renderFinish(s, ses, prevRainbow, leveled);
}
function renderFinish(s, ses, prevRainbow, leveled){
  const prac = [...ses.practiced]; const words = prac.filter(id => id[0]==='W' || id[0]==='H').map(id => itemLabel(id).replace('♥ ',''));
  const lets = prac.filter(id => id[0]==='L').map(id => id.slice(2)); const sents = prac.filter(id => id[0]==='S').length;
  $('#finish').innerHTML = `<div class="stars"></div><h2>All done for today, ${esc(state.name)}!</h2>
   <div style="width:min(70vw,560px)">${rainbowSVG(state.rainbow, 20, s.done ? prevRainbow : null)}</div>
   <div class="summary">${lets.map(l => `<span class="chip">${l}</span>`).join('')}${words.slice(0,12).map(w => `<span class="chip">${esc(w)}</span>`).join('')}</div>
   ${leveled ? `<div style="font-size:24px;color:var(--muted)">Next time: a new letter!</div>` : ''}
   <button class="homebig" id="fh">🏠</button>`;
  show('finish');
  if (s.done) finishCelebration(prevRainbow, state.rainbow);
  const parts = [`All done for today, ${state.name}!`];
  if (words.length) parts.push(`You read ${words.length} word${words.length>1?'s':''}.`);
  if (words.length && sents) parts.push(`And ${sents} sentence${sents>1?'s':''}.`);
  if (s.done) parts.push('The unicorn walked one step on the rainbow.');
  if (leveled) parts.push('Next time, you will meet a new letter.');
  $('#fh').onclick = () => { Speech.cancel(); renderHome(); };
  Speech.say(parts);
}

// ===================== ACTIVITIES =====================
// Each returns a Promise resolving {scored, correct, help} or {teach:true}.
function motionOK(){ return state.settings.anim && !matchMedia('(prefers-reduced-motion: reduce)').matches; }
// Per-answer feedback: three tiny sparkles at the corner of the right answer, about 0.5 s. The unicorn stays still.
function sparkle(el){ if (!el || !motionOK()) return; const s = document.createElement('div'); s.className = 'sparkle';
  [[88,-4],[100,18],[76,-14]].forEach(([x,y],i) => { const sp = document.createElement('span'); sp.textContent = '✦'; sp.style.left = x+'%'; sp.style.top = y+'%'; sp.style.animationDelay = (i*60)+'ms'; s.appendChild(sp); });
  el.appendChild(s); setTimeout(() => s.remove(), 700); }
function tileBtn(html, cls = ''){ const b = document.createElement('button'); b.className = 'tile ' + cls; b.innerHTML = html; return b; }
// Generic multiple-choice: options [{html, ok, onWrongSay}], returns promise after correct tap (errorless correction)
function choose(container, opts, {cls = '', onRight, onWrong}){
  return new Promise(res => { let first = true; const btns = [];
    opts.forEach(o => { const b = tileBtn(o.html, cls); b.dataset.ok = o.ok ? 1 : 0; btns.push(b); container.appendChild(b);
      b.onclick = async () => { if (b.disabled) return;
        if (o.ok){ btns.forEach(x => x.disabled = true); b.classList.remove('hint'); b.classList.add('good'); sparkle(b); setUni('nod');
          await (onRight ? onRight(first) : null); res({scored:true, correct:first}); }
        else { b.classList.add('miss'); b.disabled = true; setUni('tilt'); const right = btns.find(x => x.dataset.ok === '1');
          if (first){ first = false; } right.classList.add('hint'); if (onWrong) await onWrong(o); } }; });
  }); }
function lettersFoils(target, n){
  const known = knownLetters(state.level).filter(l => l !== target && SAME_SOUND[target] !== l);
  let f = shuffle(known).slice(0, n);
  if (f.length < n){ const more = LETTERS.map(l => l.id).filter(l => l !== target && !f.includes(l) && SAME_SOUND[target] !== l && !known.includes(l)); f = f.concat(more.slice(0, n - f.length)); }
  return f;
}
function wordBox(word, {tappable = true, heart = null, sm = false} = {}){
  const box = document.createElement('div'); box.className = 'word' + (sm ? ' sm' : '');
  const gs = graphemes(word); const ws = word; let ci = 0; let help = 0;
  gs.forEach((g, i) => { const sp = document.createElement('span'); sp.className = 'g'; const disp = ws.slice(ci, ci + g.length); ci += g.length; sp.textContent = disp;
    if (heart && heart.includes(i)) sp.classList.add('heart');
    if (tappable && LMAP[g] && !(heart && heart.includes(i))){ sp.onclick = () => { help++; sp.classList.add('lit'); Speech.say([pureSound(g)]).then(() => sp.classList.remove('lit')); }; }
    box.appendChild(sp); });
  const sw = document.createElement('div'); sw.className = 'sweep'; box.appendChild(sw);
  box.getHelp = () => help; return box;
}
// Model blending: light each letter + its sound, then sweep and say the word (slow, then normal)
async function modelBlend(box, word){ const spans = [...box.querySelectorAll('.g')], gs = graphemes(word);
  for (let i = 0; i < gs.length; i++){ spans[i].classList.add('lit'); await Speech.say([pureSound(gs[i])]); await sleep(150); spans[i].classList.remove('lit'); }
  const sw = box.querySelector('.sweep'); sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go'); spans.forEach(s => s.classList.add('lit'));
  await Speech.say([{t: word, rate: 0.5}, {pause: 250}, {t: word}]); spans.forEach(s => s.classList.remove('lit')); sw.classList.remove('go'); }
function pictureFoils(target, n){ // emoji words, prefer ones sharing letters/positions with the target
  const t = WMAP[target]; const cands = WORDS.filter(w => w.e && w.w !== target && w.e !== t.e);
  const score = w => { let s = 0; const a = graphemes(w.w), b = graphemes(target); for (let i = 0; i < Math.min(a.length,b.length); i++) if (a[i] === b[i]) s += 2; for (const g of a) if (b.includes(g)) s += 1; return s + Math.random() * 1.5; };
  const out = []; const used = new Set([t.e]);
  for (const w of cands.sort((x,y) => score(y) - score(x))){ if (!used.has(w.e)){ out.push(w); used.add(w.e); } if (out.length >= n) break; }
  return out; }
function wordFoils(target, n){ const avail = WORDS.filter(w => w.level <= state.level && w.w !== target).map(w => w.w);
  const diff = (a,b) => { const x = graphemes(a), y = graphemes(b); if (x.length !== y.length) return 9; let d = 0; for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) d++; return d; };
  const ranked = shuffle(avail).sort((a,b) => diff(a,target) - diff(b,target)); return ranked.slice(0, n); }

// ---------------- celebrations ----------------
const CELEB = ['hop','twirl','mane','dash','trailspark','bloom']; let lastCeleb = '';
function celebrate(kind){
  if (!state.settings.anim || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve();
  if (!kind){ const pool = CELEB.filter(k => k !== lastCeleb); kind = pick(pool); } lastCeleb = kind;
  const dur = {hop:1300, twirl:1300, mane:1200, dash:1600, trailspark:1600, bloom:1400}[kind];
  const host = document.getElementById('celebrate'); host.className = 'c-' + kind; host.style.setProperty('--d', dur + 'ms');
  let h = (kind === 'dash' ? '<div class="trail"></div>' : '') + `<div class="cu">${unicornSVG()}</div>`;
  if (kind === 'trailspark') for (let i = 0; i < 7; i++) h += `<span class="sp" style="left:${20 + i*6}%;bottom:${8 + (i%2)*5}vh;animation-delay:${i*180}ms">✦</span>`;
  if (kind === 'bloom'){ h += '<div class="ring">'; for (let i = 0; i < 8; i++){ const a = i * Math.PI / 4; h += `<span style="--x:${Math.cos(a)*16}vmin;--y:${-Math.sin(a)*14}vmin;animation-delay:${i*40}ms">✦</span>`; } h += '</div>'; }
  host.innerHTML = h; document.body.classList.add('celebrating');
  clearTimeout(celebrate.t); celebrate.t = setTimeout(() => { host.innerHTML = ''; host.className = ''; document.body.classList.remove('celebrating'); }, dur + 50);
  return sleep(dur);
}
// ---------------- speaking practice ----------------
// Speaking practice, no microphone. She says it aloud; nothing records or grades it.
// mode 'repeat': the unicorn models it first. mode 'read': she tries first.
// Then "Say it out loud!", a visible ~2 s pause, the model ("It says … mat!"), and the item counts as practiced.
async function speakFlow(step, mode){
  const k = step.id[0], v = step.id.slice(2), st = $('#stage');
  const text = k === 'H' ? HMAP[v].w : v; let target;
  if (k === 'L'){ target = document.createElement('div'); target.className = 'bigletter'; target.style.fontSize = 'min(24vmin,190px)'; target.textContent = v; }
  else target = wordBox(text, {tappable:false, heart: k === 'H' ? HMAP[v].heart : null, sm:true});
  st.appendChild(target);
  const model = async () => { if (k === 'L') await Speech.say(sound(v, false)); else if (k === 'W') await modelBlend(target, v); else await Speech.say([{t:text, rate:0.7}]); };
  const cue = document.createElement('div'); cue.className = 'saycue'; cue.innerHTML = '<span class="bubble">🗣️</span><span class="dots"><i></i><i></i><i></i></span>';
  st.appendChild(cue);
  const run = async () => {
    cue.classList.remove('on', 'done');
    if (mode === 'repeat'){ await Speech.say(['Listen.']); await model(); await sleep(250); }
    await Speech.say(['Say it out loud!']);
    cue.classList.add('on'); await sleep(2200); cue.classList.remove('on'); cue.classList.add('done');
    await Speech.say(['It says']); await model(); };
  PROMPT = run;
  try { await run(); } catch(e){ console.warn('speak flow', e); }
  sparkle(target);
  return {spoken:true, ok:true}; }
const ACTS = {
  sayRepeat(step){ return speakFlow(step, 'repeat'); },
  readAloud(step){ return speakFlow(step, 'read'); },
  // ---- teach a new letter sound ----
  async meet(step){ const id = step.id.slice(2), L = LMAP[id], st = $('#stage');
    const big = document.createElement('button'); big.className = 'bigletter'; big.innerHTML = `${id}<span class="upper">${id === 'qu' ? 'Qu' : id.toUpperCase()}</span>`; st.appendChild(big);
    if (L.pics[0]){ const p = document.createElement('div'); p.className = 'tile pic'; p.textContent = L.pics[0][1]; st.appendChild(p); }
    big.onclick = () => { big.classList.add('good'); Speech.say(sound(id)).then(() => big.classList.remove('good')); };
    await prompt(() => Speech.say(['Here is a new letter.', {pause:300}, 'This letter says', {pause:200}, ...sound(id), {pause:400}, 'Say it with me.', {pause:200}, ...sound(id, false), {pause:500}, 'Tap the letter to hear it again.']));
    return {teach:true}; },
  // ---- hear a sound, tap the letter ----
  async hearTap(step){ const id = step.id.slice(2), st = $('#stage'); const n = state.level <= 3 ? 1 : 2;
    const opts = shuffle([id, ...lettersFoils(id, n)]).map(l => ({html:l, ok:l === id, l}));
    const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const say = () => Speech.say(['Tap the letter that says', {pause:200}, ...sound(id)]);
    const p = choose(row, opts, { onRight: () => Speech.say(['Yes!', ...sound(id, false)]),
      onWrong: o => Speech.say(['That one says', ...sound(o.l, false), {pause:300}, 'We want', ...sound(id, false)]) });
    prompt(say); return p; },
  // ---- see a letter, pick the picture that starts with its sound ----
  async letterPic(step){ const id = step.id.slice(2), L = LMAP[id], st = $('#stage');
    const big = document.createElement('div'); big.className = 'bigletter'; big.style.fontSize = 'min(24vmin,190px)'; big.textContent = id; st.appendChild(big);
    const [tn, te] = pick(L.pics);
    const foils = shuffle(LETTERS.filter(x => x.id !== id && SAME_SOUND[id] !== x.id && x.pics.length)).slice(0, 2).map(x => pick(x.pics));
    const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const opts = shuffle([{html:te, ok:true, n:tn}, ...foils.map(([n2,e2]) => ({html:e2, ok:false, n:n2}))]);
    const p = choose(row, opts, { cls:'pic', onRight: () => Speech.say(['Yes!', tn, 'starts with', ...sound(id, false)]),
      onWrong: o => Speech.say(['That is', o.n, {pause:300}, 'Listen.', tn, 'starts with', ...sound(id, false)]) });
    prompt(() => Speech.say(['What sound does this letter make?', {pause:250}, 'Tap the picture that starts with that sound.'])); return p; },
  // ---- model blending a new word ----
  async blendModel(step){ const w = step.id.slice(2), st = $('#stage'); const box = wordBox(w); st.appendChild(box);
    const run = async () => { await Speech.say(["Let's blend a new word. Watch and listen."]); await modelBlend(box, w); await Speech.say(['Now you. Tap each letter, then say the word.']); };
    await prompt(run); return {teach:true}; },
  // ---- read a word, pick the picture ----
  async readPic(step){ const w = step.id.slice(2), W = WMAP[w], st = $('#stage'); const box = wordBox(w); st.appendChild(box);
    const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const opts = shuffle([{html:W.e, ok:true, w}, ...pictureFoils(w, 2).map(f => ({html:f.e, ok:false, w:f.w}))]);
    const tip = state.level <= 8 ? [{pause:300}, 'You can tap the letters to hear their sounds.'] : [];
    const p = choose(row, opts, { cls:'pic', onRight: async () => { await modelBlend(box, w); },
      onWrong: async o => { await Speech.say(['That picture is', o.w, {pause:300}, 'Listen.']); await modelBlend(box, w); } });
    prompt(() => Speech.say(['Read the word. Then tap the picture that matches.', ...tip]));
    const r = await p; r.help = box.getHelp(); return r; },
  // ---- hear a word, pick the written word ----
  async hearPick(step){ const w = step.id.slice(2), st = $('#stage'); const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const opts = shuffle([w, ...wordFoils(w, 2)]).map(x => ({html:esc(x), ok:x === w, w:x}));
    const p = choose(row, opts, { cls:'wordt', onRight: () => Speech.say(['Yes!', w]),
      onWrong: o => Speech.say(['That word is', o.w, {pause:300}, 'Find', {t:w, rate:0.6}]) });
    prompt(() => Speech.say(['Tap the word', {pause:200}, {t:w, rate:0.7}])); return p; },
  // ---- build (spell) the word from letter tiles ----
  async build(step){ const w = step.id.slice(2), W = WMAP[w], st = $('#stage'), gs = graphemes(w);
    if (W.e){ const pic = document.createElement('button'); pic.className = 'tile pic'; pic.textContent = W.e; pic.onclick = () => Speech.say([{t:w, rate:0.5}]); st.appendChild(pic); }
    const slots = document.createElement('div'); slots.className = 'slots'; gs.forEach(() => { const s = document.createElement('div'); s.className = 'slot'; slots.appendChild(s); }); st.appendChild(slots);
    const extra = lettersFoils(gs[0], 6).filter(l => !gs.includes(l)).slice(0, gs.length > 2 ? 2 : 1);
    const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    let pos = 0, errs = 0, slotErr = 0;
    prompt(() => Speech.say(["Let's spell", {t:w, rate:0.7}, {pause:200}, 'Tap the letters in order.']));
    return new Promise(res => {
      shuffle([...gs, ...extra]).forEach(g => { const b = tileBtn(g, 'small'); row.appendChild(b);
        b.onclick = async () => { if (b.classList.contains('used')) return;
          if (g === gs[pos]){ const s = slots.children[pos]; s.textContent = g; s.classList.add('filled'); b.classList.add('used'); pos++; slotErr = 0;
            row.querySelectorAll('.hint').forEach(x => x.classList.remove('hint')); Speech.say([pureSound(g)]);
            if (pos === gs.length){ setUni(errs ? null : 'nod'); sparkle(slots); await sleep(500);
              const box = wordBox(w, {tappable:false, sm:true}); st.insertBefore(box, row); row.remove();
              await Promise.all([(async () => { await Speech.say([errs ? 'There it is.' : 'Yes!']); await modelBlend(box, w); })(), errs ? null : sparkle(box)]);
              res({scored:true, correct: errs === 0}); } }
          else { errs++; slotErr++; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); setUni('tilt');
            await Speech.say(['That says', pureSound(g), {pause:250}, 'Listen.', {t:w, rate:0.5}]);
            if (slotErr >= 2){ const right = [...row.children].find(x => x.textContent === gs[pos] && !x.classList.contains('used')); if (right) right.classList.add('hint'); } } }; });
    }); },
  // ---- teach a heart word ----
  async heartMeet(step){ const k = step.id.slice(2), H = HMAP[k], st = $('#stage'); const box = wordBox(H.w, {heart:H.heart, tappable:false}); st.appendChild(box);
    await prompt(() => Speech.say(['This is a heart word.', {pause:300}, {t:H.w, rate:0.7}, {pause:400}, 'The part with the heart is tricky. We learn it by heart.', {pause:300}, 'Say it with me.', {t:H.w, rate:0.7}]));
    return {teach:true}; },
  // ---- find the heart word ----
  async heartPick(step){ const k = step.id.slice(2), H = HMAP[k], st = $('#stage'); const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const others = shuffle([...HEARTS.filter(h => h[1] <= state.level && h[0].toLowerCase() !== k).map(h => h[0]), ...WORDS.filter(w => w.level <= state.level && w.w.length <= 4).map(w => w.w)]).filter(x => x.toLowerCase() !== k);
    const foils = [...new Set(others)].slice(0, 2);
    const opts = shuffle([H.w, ...foils]).map(x => ({html:esc(x), ok:x === H.w, w:x}));
    const p = choose(row, opts, { cls:'wordt', onRight: () => Speech.say(['Yes!', {t:H.w, rate:0.8}]),
      onWrong: o => Speech.say(['That word is', o.w, {pause:300}, 'Find', {t:H.w, rate:0.7}]) });
    prompt(() => Speech.say(['Find the heart word', {pause:200}, {t:H.w, rate:0.7}])); return p; },
  // ---- read a decodable sentence, pick the matching picture pair ----
  async sentence(step){ const S = SMAP[step.id], st = $('#stage'); let help = 0;
    const box = document.createElement('div'); box.className = 'sentence';
    const words = S.s.split(' ').map(t => { const sp = document.createElement('span'); sp.className = 'w'; sp.textContent = t; const clean = t.replace(/[.!?,]/g,'');
      sp.onclick = () => { help++; sp.classList.add('lit'); Speech.say([{t:clean, rate:0.75}]).then(() => sp.classList.remove('lit')); }; box.appendChild(sp); return [sp, clean]; });
    st.appendChild(box);
    const subjPool = [...new Set(SENTS.map(x => x.a))].filter(e => e !== S.a), objPool = [...new Set(SENTS.map(x => x.b))].filter(e => e !== S.b && e !== S.a);
    const d1 = [S.a, pick(objPool)], d2 = [pick(subjPool.filter(e => e !== S.b)), S.b];
    const row = document.createElement('div'); row.className = 'row'; st.appendChild(row);
    const readAloud = async () => { for (const [sp, clean] of words){ sp.classList.add('lit'); await Speech.say([{t:clean, rate:0.8}]); sp.classList.remove('lit'); }
      if (Clips.has(Clips.key(S.s))){ await sleep(300); box.classList.add('lit-all'); await Speech.say([S.s]); box.classList.remove('lit-all'); } };
    const opts = shuffle([{html:S.a + S.b, ok:true}, {html:d1.join(''), ok:false}, {html:d2.join(''), ok:false}]);
    const p = choose(row, opts, { cls:'pair', onRight: async () => { await Speech.say(['Yes!']); await readAloud(); },
      onWrong: async () => { await Speech.say(['Not quite. Listen.']); await readAloud(); } });
    prompt(() => Speech.say(['Read the sentence. Then tap the picture that matches.']));
    const r = await p; r.help = help; return r; },
};

// ===================== PARENT GATE + DASHBOARD =====================
function openGate(){
  const a = 6 + Math.floor(Math.random() * 7), b = 5 + Math.floor(Math.random() * 8); let val = '';
  const m = $('#modal'); m.innerHTML = `<div class="card gate"><div class="note">For grown-ups</div><div class="q">${a} + ${b} = ?</div><div class="ans" id="ga"></div>
   <div class="pad">${[1,2,3,4,5,6,7,8,9,'⌫',0,'✓'].map(k => `<button data-k="${k}">${k}</button>`).join('')}</div><button class="btn alt" id="gc" style="margin-top:12px">Cancel</button></div>`;
  m.classList.add('on');
  m.querySelectorAll('.pad button').forEach(btn => btn.onclick = () => { const k = btn.dataset.k;
    if (k === '⌫') val = val.slice(0, -1); else if (k === '✓'){ if (+val === a + b){ m.classList.remove('on'); renderDash(); } else { val = ''; $('#ga').classList.add('shake'); setTimeout(() => $('#ga').classList.remove('shake'), 400); } }
    else if (val.length < 3) val += k; $('#ga').textContent = val; });
  $('#gc').onclick = () => m.classList.remove('on');
}
function fmtDate(t){ const d = new Date(t); return d.toLocaleDateString(undefined, {month:'short', day:'numeric'}) + ' ' + d.toLocaleTimeString(undefined, {hour:'numeric', minute:'2-digit'}); }
function dayKey(t){ const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0'); }
function lineChart(points){ // points: [{x:label, y:0..1}]
  const W = 520, H = 180, P = 30; if (!points.length) return '<div class="note">No sessions yet.</div>';
  const n = points.length, xs = i => P + (n === 1 ? (W-2*P)/2 : i * (W - 2*P) / (n - 1)), ys = y => H - P - y * (H - 2*P);
  let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%">`;
  [0, .5, .8, 1].forEach(g => s += `<line x1="${P}" x2="${W-P}" y1="${ys(g)}" y2="${ys(g)}" stroke="${g === .8 ? '#c4ecd9' : '#eee'}" stroke-width="${g === .8 ? 2 : 1}"/><text x="2" y="${ys(g)+4}" font-size="11" fill="#999">${Math.round(g*100)}%</text>`);
  s += `<polyline fill="none" stroke="#9b82c9" stroke-width="3" points="${points.map((p,i) => xs(i)+','+ys(p.y)).join(' ')}"/>`;
  points.forEach((p,i) => s += `<circle cx="${xs(i)}" cy="${ys(p.y)}" r="4" fill="#e391b5"><title>${esc(p.x)}: ${Math.round(p.y*100)}%</title></circle>`);
  return s + `<text x="${P}" y="${H-6}" font-size="11" fill="#999">${esc(points[0].x)}</text><text x="${W-P}" y="${H-6}" font-size="11" fill="#999" text-anchor="end">${esc(points[n-1].x)}</text></svg>`; }
function barChart(days){ const W = 520, H = 170, P = 26, n = days.length, max = Math.max(5, ...days.map(d => d.min));
  const bw = (W - 2*P) / n; let s = `<svg viewBox="0 0 ${W} ${H}" style="width:100%">`;
  days.forEach((d,i) => { const h = (d.min / max) * (H - 2*P); const x = P + i*bw;
    s += `<rect x="${x+3}" y="${H-P-h}" width="${bw-6}" height="${h}" rx="4" fill="#c4e1f7"><title>${d.label}: ${d.n} session(s), ${d.min.toFixed(1)} min</title></rect>`;
    if (d.n) s += `<text x="${x+bw/2}" y="${H-P-h-4}" font-size="11" text-anchor="middle" fill="#7a7290">${d.n}</text>`;
    if (i % 2 === 0 || n <= 7) s += `<text x="${x+bw/2}" y="${H-8}" font-size="10" text-anchor="middle" fill="#999">${d.label}</text>`; });
  return s + `<text x="2" y="14" font-size="11" fill="#999">min/day (number = sessions)</text></svg>`; }
function renderDash(){
  const L = state.level, sess = state.sessions.filter(s => s.n > 0);
  const lc = levelCheck(L);
  const letterGrid = LETTERS.map((l,i) => { const id = 'L:'+l.id, it = state.items[id]; const cls = mastered(id) ? 'mast' : (it && it.a) ? 'learn' : '';
    return `<div class="lg ${cls} ${i+1 === L ? 'cur' : ''}" title="${l.id}: ${it ? it.c+'/'+it.a+' correct' : 'not yet'}">${l.id}</div>`; }).join('');
  const wordsAvail = WORDS.filter(w => w.level <= L), hearts = HEARTS.filter(h => h[1] <= L);
  const wordChips = wordsAvail.map(w => { const id = 'W:'+w.w, it = state.items[id]; return `<span class="${mastered(id) ? 'm' : ''}" title="${it ? it.c+'/'+it.a : 'not yet'}">${w.w}</span>`; }).join('');
  const heartChips = hearts.map(h => { const id = 'H:'+h[0].toLowerCase(); return `<span class="${mastered(id) ? 'm' : ''}">♥ ${h[0]}</span>`; }).join('') || '<span class="note">none yet</span>';
  const nMastW = wordsAvail.filter(w => mastered('W:'+w.w)).length;
  const struggles = Object.entries(state.items).filter(([id,it]) => it.a >= 2).map(([id,it]) => [id, it, recentAcc(it, 6)]).filter(x => x[2] < 0.8).sort((a,b) => a[2] - b[2] || b[1].a - a[1].a).slice(0, 10);
  const pts = sess.slice(-30).map(s => ({x: new Date(s.start).toLocaleDateString(undefined, {month:'short', day:'numeric'}), y: s.n ? s.c / s.n : 0}));
  const days = []; for (let i = 13; i >= 0; i--){ const t = Date.now() - i*DAY, k = dayKey(t); const ds = sess.filter(s => dayKey(s.start) === k);
    days.push({label: new Date(t).toLocaleDateString(undefined, {month:'numeric', day:'numeric'}), n: ds.length, min: ds.reduce((a,s) => a + s.dur/60, 0)}); }
  const totalMin = sess.reduce((a,s) => a + s.dur/60, 0), totAtt = sess.reduce((a,s) => a + s.n, 0), totC = sess.reduce((a,s) => a + s.c, 0);
  const voices = Speech.voices.map(v => `<option value="${esc(v.voiceURI)}" ${Speech.voice && v.voiceURI === Speech.voice.voiceURI ? 'selected' : ''}>${esc(v.name)} (${v.lang})</option>`).join('');
  const levelOpts = LETTERS.map((l,i) => `<option value="${i+1}" ${i+1 === L ? 'selected' : ''}>Level ${i+1}: ${l.id}</option>`).join('');
  $('#dash').innerHTML = `
   <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><h2>${esc(state.name)}’s reading progress</h2>
   <div class="sub">Level ${L} of ${MAXLEVEL} · newest letter <b>${LETTERS[L-1].id}</b> · ${sess.length} sessions · ${totalMin.toFixed(0)} min total · ${totAtt ? Math.round(100*totC/totAtt) : 0}% correct overall</div></div>
   <button class="btn" id="dclose">Back to ${esc(state.name)}’s screen</button></div>
   <div class="grid">
    <div class="panel"><h3>Letter sounds</h3><div class="lgrid">${letterGrid}</div>
      <div class="legend"><span style="background:var(--mint);padding:0 6px;border-radius:4px">mastered</span> <span style="background:var(--butter);padding:0 6px;border-radius:4px">learning</span> outlined = current level. Mastered = at least 80% of the last 5 tries, 3+ tries over 2+ sessions.</div>
      <div class="note" style="margin-top:8px">To unlock level ${L+1}: letter <b>${LETTERS[L-1].id}</b> ${lc.lets.every(mastered) ? '✓' : '…'}${lc.hearts.length ? ` · heart words ${lc.hearts.map(h => h.slice(2)).join(', ')} ${lc.hearts.every(mastered) ? '✓' : '…'}` : ''}${lc.needW ? ` · ${lc.okW}/${lc.needW} new words mastered` : ''}</div></div>
    <div class="panel"><h3>Accuracy per session</h3>${lineChart(pts)}<div class="legend">Green line = 80% mastery target. Scored on first try; a hint tap still counts as correct.</div></div>
    <div class="panel"><h3>Practice over the last 14 days</h3>${barChart(days)}</div>
    <div class="panel"><h3>Needs practice</h3>${struggles.length ? `<table><tr><th>Item</th><th>Recent</th><th>Tries</th><th>Last seen</th></tr>${struggles.map(([id,it,acc]) => `<tr><td>${esc(itemLabel(id))}</td><td>${Math.round(acc*100)}%</td><td>${it.a}</td><td>${fmtDate(it.last)}</td></tr>`).join('')}</table>` : '<div class="note">Nothing below 80% right now.</div>'}<div class="legend">These come back more often automatically.</div></div>
    <div class="panel"><h3>Words (${nMastW} mastered of ${wordsAvail.length} unlocked)</h3><div class="chips">${wordChips || '<span class="note">Words start at level 2 (am).</span>'}</div>
      <h3 style="margin-top:14px">Heart words</h3><div class="chips">${heartChips}</div></div>
    <div class="panel"><h3>Session history</h3><table><tr><th>When</th><th>Min</th><th>Items</th><th>Correct</th><th>Level</th></tr>
      ${sess.slice(-15).reverse().map(s => `<tr><td>${fmtDate(s.start)}</td><td>${(s.dur/60).toFixed(1)}</td><td>${s.n}</td><td>${s.n ? Math.round(100*s.c/s.n) : 0}%</td><td>${s.level}${s.levelUp ? ' → '+s.levelUp : ''}${s.done ? '' : ' (stopped early)'}</td></tr>`).join('') || '<tr><td colspan=5 class="note">No sessions yet.</td></tr>'}</table></div>
    <div class="panel"><h3>Speaking practice</h3>${spokenPanel()}</div>
    <div class="panel"><h3>Settings</h3>
      <label>Child’s name</label><input id="sName" value="${esc(state.name)}">
      <label>Items per session</label><select id="sItems">${[8,10,15,20].map(n => `<option ${n === state.settings.items ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label>Stop after (minutes)</label><select id="sMin">${[5,7,10,15].map(n => `<option ${n === state.settings.maxMin ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label><input type="checkbox" id="sClips" ${state.settings.clips !== false ? 'checked' : ''}> Use the recorded unicorn voice (natural voice${Clips.ok ? '' : ' (not loaded on this device yet)'})</label>
      <label>Device voice (backup, only used for anything without a recording)</label><select id="sVoice"><option value="">Auto</option>${voices}</select>
      <label>Device voice speed: <span id="rv">${state.settings.rate}</span></label><input id="sRate" type="range" min="0.6" max="1.1" step="0.05" value="${state.settings.rate}">
      <label>How to say letter sounds (when no recording)</label><select id="sMode"><option value="tts" ${state.settings.soundMode==='tts'?'selected':''}>Say the sound + "as in apple"</option><option value="word" ${state.settings.soundMode==='word'?'selected':''}>Keyword only ("the first sound in apple")</option></select>
      <div><button class="btn alt" id="sTest">Test voice</button></div>
      <label>Speaking practice (she says sounds and words out loud; no microphone)</label><select id="sSpeak"><option value="on" ${state.settings.speak!=='off'?'selected':''}>On</option><option value="off" ${state.settings.speak==='off'?'selected':''}>Off</option></select>
      <label>Speaking items per session</label><select id="sSpeakN">${[1,2,3,5].map(n => `<option ${n === state.settings.speakN ? 'selected' : ''}>${n}</option>`).join('')}</select>
      <label><input type="checkbox" id="sSpeakFirst" ${state.settings.speakFirst ? 'checked' : ''}> Start each lesson with a speaking challenge (handy for trying it out)</label>
      <label><input type="checkbox" id="sAnim" ${state.settings.anim ? 'checked' : ''}> Short unicorn animation after a correct answer</label>
      <label>Level (move if ${esc(state.name)} already knows letters, or needs a step back)</label><select id="sLevel">${levelOpts}</select>
      <div><button class="btn" id="sSave">Save settings</button> <span id="saved" class="note"></span></div></div>
    <div class="panel"><h3>Debug log</h3>
      <div class="note">If something gets stuck, open this and send a photo or copy of the last lines.</div>
      <label><input type="checkbox" id="sDbgOv" ${state.settings.debugOverlay ? 'checked' : ''}> Show the last log lines on screen during lessons (then tap Save settings)</label>
      <pre class="dbglog" id="dbgList">${esc(DBG.list.slice(-60).reverse().join('\n') || '(empty)')}</pre>
      <button class="btn alt" id="dbgCopy">Copy log</button> <button class="btn alt" id="dbgClear">Clear log</button>
      <div class="note">${esc(navigator.userAgent)}</div></div>
    <div class="panel"><h3>Backup &amp; devices</h3>
      <div class="note">Progress is saved in this browser only. Use Export/Import to move it to another device or browser.</div>
      <button class="btn" id="exp">Export progress (.json)</button><label class="btn alt" style="display:inline-block;cursor:pointer">Import…<input type="file" id="imp" accept=".json,application/json" style="display:none"></label>
      <button class="btn danger" id="rst">Reset all progress</button>
      <div class="note">App version ${BUILD} · unicorn voice ${Clips.ok ? 'clips ' + Clips.man.version + ' (' + Object.keys(Clips.man.clips).length + ')' : 'not loaded, using device voice'}</div>
      <div class="note" style="margin-top:10px">Tip: 1–2 short sessions a day, sitting next to ${esc(state.name)}, works best. Do them at different times, not back to back.</div></div>
   </div>`;
  show('dash');
  $('#dclose').onclick = () => { Speech.cancel(); renderHome(); };
  $('#sRate').oninput = e => $('#rv').textContent = e.target.value;
  $('#dbgCopy').onclick = () => { const t = `Anya Reads ${BUILD}\n${navigator.userAgent}\n` + DBG.list.join('\n'); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => $('#dbgCopy').textContent = 'Copied ✓').catch(() => { const r = document.createRange(); r.selectNodeContents($('#dbgList')); getSelection().removeAllRanges(); getSelection().addRange(r); }); };
  $('#dbgClear').onclick = () => { DBG.list = []; try { localStorage.removeItem(DBG.key); } catch(e){} $('#dbgList').textContent = '(empty)'; };
  $('#sTest').onclick = () => { Speech.unlock(); state.settings.clips = $('#sClips').checked; state.settings.voice = $('#sVoice').value; state.settings.rate = +$('#sRate').value; state.settings.soundMode = $('#sMode').value; Speech.choose(); Speech.say(['Tap the letter that says', ...sound('m'), {pause:300}, 'Let\'s blend. ', pureSound('s'), pureSound('a'), pureSound('t'), {t:'sat', rate:0.5}, 'sat']); };
  $('#sSave').onclick = () => { state.name = $('#sName').value.trim() || 'Anya'; state.settings.items = +$('#sItems').value; state.settings.maxMin = +$('#sMin').value;
    state.settings.voice = $('#sVoice').value; state.settings.rate = +$('#sRate').value; state.settings.soundMode = $('#sMode').value; Speech.choose();
    state.settings.clips = $('#sClips').checked; state.settings.speakFirst = $('#sSpeakFirst').checked; state.settings.debugOverlay = $('#sDbgOv').checked; state.settings.speak = $('#sSpeak').value; state.settings.speakN = +$('#sSpeakN').value; state.settings.anim = $('#sAnim').checked;
    const nl = +$('#sLevel').value; if (nl !== state.level){ state.level = nl; for (let i = 0; i < nl - 1; i++) state.intro['L:'+LETTERS[i].id] = state.intro['L:'+LETTERS[i].id] || Date.now(); }
    save(); renderDash(); setTimeout(() => { const s = $('#saved'); if (s) s.textContent = 'Saved ✓'; }, 0); };
  $('#exp').onclick = () => { const blob = new Blob([JSON.stringify(state, null, 1)], {type:'application/json'}); const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = `anya-reads-progress-${dayKey(Date.now())}.json`; document.body.appendChild(a); a.click(); a.remove(); };
  $('#imp').onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result);
      if (!d || d.version !== 1 || !d.items) throw new Error('not an Anya Reads file'); if (!confirm('Replace current progress with the imported file?')) return;
      state = d; load2(); save(); renderDash(); alert('Imported.'); } catch(err){ alert('Could not import: ' + err.message); } }; r.readAsText(f); };
  $('#rst').onclick = () => { if (confirm('Erase ALL progress for ' + state.name + '? This cannot be undone. (Export first if unsure.)')){ const nm = state.name, st = state.settings; state = defaults(); state.name = nm; state.settings = st; save(); renderDash(); } };
}
function spokenPanel(){
  const ent = Object.entries(state.spoken || {}); const tot = ent.reduce((a,[,x]) => a + x.a, 0);
  if (!tot) return `<div class="note">No speaking practice yet. It starts once an item has 2+ correct taps.</div>`;
  const recent = ent.sort((a,b) => b[1].last - a[1].last).slice(0, 14).map(([id]) => `<span class="chip">${esc(itemLabel(id))}</span>`).join('');
  return `<div class="sub" style="margin:0 0 8px">${tot} items said out loud (${ent.length} different)</div><div class="chips">${recent}</div><div class="legend">Most recent first. Nothing is recorded.</div>`; }
function load2(){ const d = defaults(); for (const k in d) if (state[k] === undefined) state[k] = d[k]; state.settings = {...d.settings, ...state.settings}; }
// ===================== BOOT =====================
document.addEventListener('pointerdown', () => AudioOut.unlock(), {capture:true, passive:true});
(async function boot(){
  load(); DBG.log('boot ' + BUILD + ' ' + navigator.userAgent); Speech.init(); await Promise.all([AudioDB.open().then(() => AudioDB.loadAll()), Clips.init()]);
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !QS.has('nosw')){
    navigator.serviceWorker.register('./sw.js').then(reg => { const ask = () => navigator.serviceWorker.controller && navigator.serviceWorker.controller.postMessage({type:'precache-audio'});
      if (navigator.serviceWorker.controller) setTimeout(ask, 4000); else navigator.serviceWorker.addEventListener('controllerchange', () => setTimeout(ask, 1000), {once:true}); reg.update().catch(() => {}); }).catch(() => {}); }
  try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch(e){} // ask the browser not to evict progress
  renderHome();
  window.__anya = { get state(){ return state; }, Clips, AudioOut, stepClipKeys, BUILD, celebrate, buildPlan, levelCheck, mastered, available, SENTS, WORDS };
})();
