// Anya Reads service worker. Build 20261009-2238.
// - The page (index.html) and audio/jenny/manifest.json are network-first, so a new version reaches the iPad
//   the next time the app is opened online. The cached copy is only used offline.
// - Audio clips have content hashes in their file names, so they're cached forever (cache-first) and
//   entries no longer in the manifest are pruned.
// - Old page caches are deleted when a new build activates.
const BUILD = '20261009-2238';
const STATIC = 'anya-static-' + BUILD;
const AUDIO = 'anya-audio-v1';
const MANIFEST = 'audio/jenny/manifest.json';
self.addEventListener('install', e => {
  e.waitUntil(caches.open(STATIC).then(c => c.addAll([new Request('./', {cache: 'reload'}), new Request(MANIFEST, {cache: 'reload'})])).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('anya-static-') && k !== STATIC) await caches.delete(k);
    await self.clients.claim();
  })());
});
async function networkFirst(req, cacheKey){
  const c = await caches.open(STATIC);
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 5000);
    const r = await fetch(req, {signal: ctl.signal, cache: 'no-cache'}); clearTimeout(t);
    if (r.ok) c.put(cacheKey || req, r.clone());
    return r;
  } catch (err) {
    const hit = await c.match(cacheKey || req, {ignoreSearch: true});
    if (hit) return hit;
    throw err;
  }
}
async function cacheFirst(req){
  const c = await caches.open(AUDIO); const hit = await c.match(req);
  if (hit) return hit;
  const r = await fetch(req); if (r.ok) c.put(req, r.clone()); return r;
}
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== location.origin) return;
  const scope = new URL(self.registration.scope).pathname; const path = url.pathname.slice(scope.length);
  if (req.mode === 'navigate' || path === '' || path === 'index.html') e.respondWith(networkFirst(req, './'));
  else if (path === MANIFEST) e.respondWith(networkFirst(req, MANIFEST));
  else if (path.startsWith('audio/') && path.endsWith('.mp3')) e.respondWith(cacheFirst(req));
});
// Page asks us to download every clip in the background, for offline use. Prunes clips no longer listed.
let precaching = null;
self.addEventListener('message', e => {
  if (!e.data || e.data.type !== 'precache-audio' || precaching) return;
  precaching = (async () => {
    try {
      const m = await (await networkFirst(new Request(MANIFEST), MANIFEST)).json();
      const want = new Set(Object.values(m.clips).map(f => new URL('audio/jenny/' + f, self.registration.scope).href));
      const c = await caches.open(AUDIO);
      for (const r of await c.keys()) if (!want.has(r.url)) await c.delete(r);
      const have = new Set((await c.keys()).map(r => r.url)); const todo = [...want].filter(u => !have.has(u)); let i = 0;
      const worker = async () => { while (i < todo.length){ const u = todo[i++]; try { const r = await fetch(u); if (r.ok) await c.put(u, r); } catch (err) {} } };
      await Promise.all([1, 2, 3, 4].map(worker));
      const all = await self.clients.matchAll(); all.forEach(cl => cl.postMessage({type: 'audio-cached', n: want.size}));
    } finally { precaching = null; }
  })();
  e.waitUntil(precaching);
});
