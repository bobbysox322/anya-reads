# Anya Reads (web)

A phonics game: one HTML file plus a folder of pre-recorded audio. It works offline after the first visit. Open `index.html` from any web server.

- `index.html` is the whole app: CSS, JS, curriculum and the embedded Andika font, about 100 KB.
- `audio/jenny/` holds 590 pre-recorded clips (about 3.4 MB) in a natural neural voice (Microsoft en-US-JennyNeural via edge-tts): every instruction, feedback phrase, word (normal and slow), heart word, sentence and letter sound. `manifest.json` maps text to file. File names carry a content hash.
- `sw.js` is the service worker: offline use and update handling.
- `RESEARCH.md` has the research and how it maps to the design.
- `screenshots/` holds the screens from the headless test.
- `src/` holds the editable sources. Run `python3 src/build.py` to regenerate `index.html`. `src/test_e2e.py` is the Playwright test (muted, curriculum and UI). `src/test_audio.py` is the unmuted test: clips load and play, no 404s, offline, and updates. `src/voice-tools/` regenerates the audio: `node dump_texts.js > /tmp/texts.json`, then `gen_audio.py /tmp/texts.json`, then `phonemes.py`, then `finalize.py`.

Run locally with `python3 -m http.server 8765`, then open http://localhost:8765/. Adding `?mute=1` skips speech (used by the tests).

## How a session works
1. Tap the big green button. Every instruction is spoken, and the blue speaker button replays it.
2. About 15 items (8, 10, 15 or 20 in settings), with a soft cap of 10 minutes. After each item, a green arrow moves on. She controls the pace and nothing auto-advances.
3. Activities: meet a new letter, hear a sound and tap the letter, see a letter and pick the picture that starts with it, watch a blend, read a word and pick the picture, hear a word and tap it, build the word from tiles, meet and find heart words, read a sentence and pick the matching picture pair.
4. Speaking practice ("Say it"). Once she taps an item right at least twice, about 3 items per session ask her to say the sound or word into the mic: repeat after me, or read it aloud. Her recording plays next to the unicorn's model. A grown-up taps 👍 or 🔁, or self-check mode just counts it as practice. Speech recognition is only a hint. If mic permission is denied, she still says it aloud and the grown-up checks. Spoken accuracy has its own dashboard panel.
5. Correct on the first try: a 1–2 s unicorn animation (hop, twirl, mane toss, rainbow dash, sparkle trail, star bloom), never the same twice in a row. It's off when reduce-motion is on or the parent setting is unchecked.
6. Wrong answer: the right answer glows, is said and is modeled, and she taps it. The item comes back about 3 items later. Nothing is lost.
7. Finish screen: what she practiced, and the unicorn walks one step on the rainbow (20 steps per rainbow).

## Progress tracking (localStorage key `anyaReads.v1`)
- Per item (letter sound, word, heart word, sentence): tries, correct, last 10 results, first and last seen, sessions seen, Leitner box and due date, hint taps.
- Sessions: start, end, duration, items, correct, level, whether it finished, level-ups.
- An attempt log of the last 4,000 attempts: time, item, activity, correct, hints.
- Parent dashboard: tap **Grown-ups**, then answer an addition question. It shows level, letter mastery grid, words and heart words, accuracy per session, minutes per day over 14 days, items that need practice, session history, settings, letter-sound recording, and Export, Import and Reset.

## Audio
Priority: **a parent recording** (letter sounds, Grown-ups → Record) comes first, then **the pre-made clip**, then **the device voice** (speechSynthesis). The device voice only covers anything without a clip, for example the greeting when the child's name isn't "Anya". It can be turned off entirely under Grown-ups → Settings. Each session preloads its clips. After the first visit, the service worker downloads all clips in the background for offline use.

**Letter sounds** were cut out of Jenny saying real words. Continuous sounds (m, s, f, a…) are stretched to about half a second. Stop sounds (t, p, k, b, d, g, j) keep only the burst plus a very short vowel onset. Each was checked automatically with a phoneme recognizer, spectral analysis and vowel formants. Carriers: a-at, e-egg, i-it, o-odd, u-up, m-moon, s-sun, f-fun, n-nut, l-lap, r-red, h-hot, w-wet, y-yes, t-tub, p-pup, c/k-cub, b-bus, d-dug, j-jug, g-bu**gg**y, z-la**z**y, v-lo**ve**, x-o**x**, qu-**qu**ick. Only approximate: h (breathy, with a hint of vowel), v (word-final, a little devoiced, close to f), g and z (cut from mid-word, with a short lead-in), and the voiced stops b/d/g/j (a tiny "uh"). If one bothers you, record that sound yourself.

**Updates and caching:** the page and the audio manifest are network-first, so opening the app online always gets the newest version. Cached copies are used offline only. Audio files are immutable (content-hashed) and cache-first. Each build gets its own page cache, and old ones are deleted on activation.

## Known limitations
- **A few letter sounds are only approximate** (see Audio). Under Grown-ups → *Record letter sounds*, you can record any sound once (about 1.5 s). Recordings replace the clip everywhere, including in blending. They are stored on the device in IndexedDB and are **not** in the JSON export. Recording needs https or localhost.
- If clips can't load (first visit while offline), the device voice is used, and its letter sounds are poor.
- Speech recognition is only a hint in speaking practice. A grown-up (or self-check) decides.
- Picture names can be ambiguous (🍖 ham, 🥤 cup). Every word activity says the target word, or shows the letters, so she can check.
- Progress lives in one browser on one device. Safari can clear site data after about 7 days of not using a site. "Add to Home Screen" keeps the data, but gives it **separate** storage from the Safari tab, so pick one and stick with it. Export now and then.
- The curriculum covers single letters plus 23 heart words (about Mentava levels 1–20 / UFLI lessons 1–34). Digraphs (sh, ch, th, ck), blends and long vowels are not built yet.
