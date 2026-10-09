# Anya Reads (web)

A self-contained phonics game: one file, no build step, no network needed. Open `index.html` from any web server.

- `index.html` is the whole app: CSS, JS, curriculum and the embedded Andika font, about 100 KB.
- `RESEARCH.md` has the research and how it maps to the design.
- `src/` holds the editable sources. Run `python3 src/build.py` to regenerate `index.html`. `src/test_e2e.py` is the Playwright test.

Run locally with `python3 -m http.server 8765`, then open http://localhost:8765/. Adding `?mute=1` skips speech (used by the tests).

## How a session works
1. Tap the big green button. Every instruction is spoken, and the blue speaker button replays it.
2. About 15 items (8, 10, 15 or 20 in settings), with a soft cap of 10 minutes. After each item, a green arrow moves on. She controls the pace and nothing auto-advances.
3. Activities: meet a new letter, hear a sound and tap the letter, see a letter and pick the picture that starts with it, watch a blend, read a word and pick the picture, hear a word and tap it, build the word from tiles, meet and find heart words, read a sentence and pick the matching picture pair.
4. Wrong answer: the right answer glows, is said and is modeled, and she taps it. The item comes back about 3 items later. Nothing is lost.
5. Finish screen: what she practiced, and the unicorn walks one step on the rainbow (20 steps per rainbow).

## Progress tracking (localStorage key `anyaReads.v1`)
- Per item (letter sound, word, heart word, sentence): tries, correct, last 10 results, first and last seen, sessions seen, Leitner box and due date, hint taps.
- Sessions: start, end, duration, items, correct, level, whether it finished, level-ups.
- An attempt log of the last 4,000 attempts: time, item, activity, correct, hints.
- Parent dashboard: tap **Grown-ups**, then answer an addition question. It shows level, letter mastery grid, words and heart words, accuracy per session, minutes per day over 14 days, items that need practice, session history, settings, letter-sound recording, and Export, Import and Reset.

## Known limitations
- **Letter sounds through TTS are imperfect.** Web Speech can't reliably make pure phonemes. The app speaks a respelling ("mmmm", "sss", "tuh", "aah") plus a keyword ("as in moon"). Stop sounds come out with an added "uh". Short a and short o sound alike. x is described in words ("the sound at the end of box"). **Fix:** under Grown-ups → *Record letter sounds*, record each sound once (about 1.5 s each). Recordings replace TTS everywhere, including in blending. They are stored on the device in IndexedDB and are **not** in the JSON export. Recording needs https or localhost.
- Voice quality depends on the device. On iPad, download an Enhanced/Premium voice (Settings → Accessibility → Spoken Content → Voices → English → e.g. Ava Enhanced), then pick it in the app's settings.
- No speech recognition. She answers by tapping, so it measures recognition and decoding, not reading aloud. Sit with her and have her say the sounds and words out loud.
- Picture names can be ambiguous (🍖 ham, 🥤 cup). Every word activity says the target word, or shows the letters, so she can check.
- Progress lives in one browser on one device. Safari can clear site data after about 7 days of not using a site. "Add to Home Screen" keeps the data, but gives it **separate** storage from the Safari tab, so pick one and stick with it. Export now and then.
- The curriculum covers single letters plus 23 heart words (about Mentava levels 1–20 / UFLI lessons 1–34). Digraphs (sh, ch, th, ck), blends and long vowels are not built yet.
