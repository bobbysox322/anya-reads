// Emits every clip the game can ask for: [{key, text, kind, rate}] -> stdout JSON
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/../data.js', 'utf8').replace(/^const /gm, 'var '));
const key = t => t.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim();
const out = {}; const add = (text, kind, rate, k) => { k = k || key(text); if (!out[k]) out[k] = {key:k, text, kind, rate}; };
const NAME = 'Anya';
const P = ["Do you want to stop?", "Listen, then say the sound.", "Listen, then say the word.", "Now you. Tap the microphone and say it.",
 "Can you read this sound out loud? Tap the microphone and say it.", "Can you read this word out loud? Tap the microphone and say it.",
 "Listen to you.", "And the unicorn.", "Listen to the unicorn.", "Yes!", "Good practice. We'll try it again another day.", "Let's try again. Listen.",
 "Your turn. Tap the microphone.", "Here is a new letter.", "This letter says", "Say it with me.", "Tap the letter to hear it again.",
 "Tap the letter that says", "That one says", "We want", "starts with", "That is", "Listen.", "What sound does this letter make?",
 "Tap the picture that starts with that sound.", "Let's blend a new word. Watch and listen.", "Now you. Tap each letter, then say the word.",
 "That picture is", "Read the word. Then tap the picture that matches.", "You can tap the letters to hear their sounds.", "That word is", "Find",
 "Tap the word", "Let's spell", "Tap the letters in order.", "There it is.", "That says", "This is a heart word.",
 "The part with the heart is tricky. We learn it by heart.", "Find the heart word", "Not quite. Listen.",
 "Read the sentence. Then tap the picture that matches.", "Let's blend.", "The unicorn walked one step on the rainbow.",
 "Next time, you will meet a new letter.", `Hi ${NAME}! Tap the big green button to start reading with the unicorn.`, `Hi ${NAME}! Let's read.`,
 `All done for today, ${NAME}!`, "like the end of box", "the sound at the end of box"];
P.forEach(t => add(t, 'p', '-10%'));
for (let n = 1; n <= 40; n++) add(`You read ${n} ${n > 1 ? 'words' : 'word'}.`, 'p', '-10%');
for (let n = 1; n <= 10; n++) add(`And ${n} ${n > 1 ? 'sentences' : 'sentence'}.`, 'p', '-10%');
for (const L of LETTERS){ add('as in ' + L.key, 'p', '-10%'); add('the first sound in ' + L.key, 'p', '-10%'); }
// words: practice words (normal + slow), heart words, sentence words, picture & key names
const words = new Set();
WORDLIST.forEach(o => { words.add(o.w); add(o.w, 'ws', '-55%', 'slow:' + key(o.w)); });
HEARTS.forEach(h => words.add(h[0]));
SENTENCES.forEach(s => s[0].replace(/[.!?,]/g, '').split(' ').forEach(w => words.add(w)));
LETTERS.forEach(L => { words.add(L.key); L.pics.forEach(p => words.add(p[0])); });
const SAY = {a: 'uh', i: 'I'}; // the word "a" is said "uh" in connected speech
for (const w of words){ const k = key(w); add(SAY[k] || w, 'w', '-10%', k); }
SENTENCES.forEach(s => add(s[0], 's', '-15%'));
process.stdout.write(JSON.stringify(Object.values(out), null, 0));
