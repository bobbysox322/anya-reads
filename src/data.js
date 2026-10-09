// ===================== CURRICULUM DATA =====================
// Letter order: Mentava/UFLI-style quick start (continuous sounds + short a first), one new letter per level.
// tts = spelling fed to speechSynthesis to approximate the pure sound (see RESEARCH/README limitation notes).
const LETTERS = [
 {id:'a', tts:'aah', key:'apple',  stop:false, pics:[['apple','🍎'],['ant','🐜'],['axe','🪓']]},
 {id:'m', tts:'mmmm', key:'moon',  stop:false, pics:[['moon','🌙'],['monkey','🐒'],['mouse','🐭'],['milk','🥛']]},
 {id:'s', tts:'sss', key:'sun',    stop:false, pics:[['sun','☀️'],['sock','🧦'],['snake','🐍'],['star','⭐']]},
 {id:'t', tts:'tuh', key:'tiger',  stop:true,  pics:[['tiger','🐯'],['tent','⛺'],['turtle','🐢'],['tomato','🍅']]},
 {id:'p', tts:'puh', key:'pig',    stop:true,  pics:[['pig','🐷'],['pizza','🍕'],['penguin','🐧'],['pear','🍐']]},
 {id:'i', tts:'ih', key:'itchy',   stop:false, pics:[]},
 {id:'n', tts:'nnnn', key:'nose',  stop:false, pics:[['nose','👃'],['nut','🥜'],['net','🥅']]},
 {id:'f', tts:'fff', key:'fish',   stop:false, pics:[['fish','🐟'],['fox','🦊'],['frog','🐸']]},
 {id:'o', tts:'ah', key:'octopus', stop:false, pics:[['octopus','🐙'],['otter','🦦'],['ox','🐂']]},
 {id:'d', tts:'duh', key:'dog',    stop:true,  pics:[['dog','🐶'],['duck','🦆'],['drum','🥁'],['door','🚪']]},
 {id:'c', tts:'kuh', key:'cat',    stop:true,  pics:[['cat','🐱'],['car','🚗'],['cake','🍰'],['cow','🐮']]},
 {id:'g', tts:'guh', key:'goat',   stop:true,  pics:[['goat','🐐'],['gift','🎁'],['guitar','🎸'],['gorilla','🦍']]},
 {id:'u', tts:'uh', key:'up',      stop:false, pics:[['umbrella','☂️'],['up','⬆️']]},
 {id:'b', tts:'buh', key:'bus',    stop:true,  pics:[['bus','🚌'],['bee','🐝'],['banana','🍌'],['bear','🐻']]},
 {id:'e', tts:'eh', key:'egg',     stop:false, pics:[['egg','🥚'],['elephant','🐘'],['elf','🧝']]},
 {id:'h', tts:'huh', key:'hat',    stop:true,  pics:[['hat','🎩'],['horse','🐴'],['house','🏠'],['heart','❤️']]},
 {id:'r', tts:'rrrr', key:'rabbit',stop:false, pics:[['rabbit','🐇'],['rainbow','🌈'],['robot','🤖'],['rose','🌹']]},
 {id:'l', tts:'llll', key:'lion',  stop:false, pics:[['lion','🦁'],['leaf','🍃'],['lemon','🍋'],['log','🪵']]},
 {id:'k', tts:'kuh', key:'kite',   stop:true,  pics:[['kite','🪁'],['key','🔑'],['koala','🐨'],['kangaroo','🦘']]},
 {id:'j', tts:'juh', key:'juice',  stop:true,  pics:[['juice','🧃'],['jeans','👖'],['jar','🫙']]},
 {id:'w', tts:'wuh', key:'worm',   stop:false, pics:[['worm','🪱'],['watermelon','🍉'],['web','🕸️'],['wolf','🐺']]},
 {id:'y', tts:'yuh', key:'yarn',   stop:false, pics:[['yarn','🧶'],['yo-yo','🪀'],['yawn','🥱']]},
 {id:'v', tts:'vvvv', key:'van',   stop:false, pics:[['van','🚐'],['violin','🎻'],['volcano','🌋']]},
 {id:'x', tts:'ks', key:'box',     stop:true,  noTTS:true, endKey:true, pics:[]},
 {id:'z', tts:'zzzz', key:'zebra', stop:false, pics:[['zebra','🦓'],['zero','0️⃣']]},
 {id:'qu',tts:'kwuh', key:'queen', stop:true,  pics:[['queen','👸']]},
];
const LMAP = Object.fromEntries(LETTERS.map((l,i)=>[l.id,{...l,level:i+1}]));
const SAME_SOUND = {c:'k',k:'c'}; // never use as foils for each other

// Heart words: [word, level, indexes of the "heart" (irregular / not-yet-taught) letters]
const HEARTS = [
 ['the',4,[2]], ['I',6,[0]], ['is',7,[1]], ['a',7,[0]], ['to',9,[1]], ['was',11,[1,2]], ['of',13,[0,1]],
 ['you',14,[1,2]], ['said',15,[1,2]], ['he',16,[1]], ['she',16,[0,1,2]], ['we',17,[1]], ['me',17,[1]],
 ['be',18,[1]], ['are',18,[0,2]], ['do',20,[1]], ['go',21,[1]], ['no',21,[1]], ['so',22,[1]], ['my',22,[1]],
 ['see',23,[1,2]], ['look',25,[1,2]], ['like',26,[1,3]],
];
const HMAP = Object.fromEntries(HEARTS.map(([w,l,h])=>[w.toLowerCase(),{w,level:l,heart:h}]));

// Decodable words (short vowel, only taught letters). emoji optional (needed for picture activities).
const WORDLIST = `am at sat mat map:🗺️ tap:🚰 pat sap sip sit tip pit it pin:📌 nap:😴 pan:🍳 man:👨 ant:🐜 an in nip tin
fan fin fit fat fist:✊ on top:🔝 mop pot:🍲 not pop stop:🛑 dot dad pad mad:😠 sad:😢 did dip nod pod and
cat:🐱 cap:🧢 can:🥫 cot cop:👮 dog:🐶 pig:🐷 dig:⛏️ gas:⛽ tag:🏷️ got fog:🌫️ sun:☀️ cup:🥤 mug:☕ nut:🥜 gum up:⬆️
cut:✂️ dug tug fun mud bus:🚌 bat:🦇 bag:👜 bug:🐛 bib cub tub:🛁 big bud:🌱 cab:🚕 bun bin:🗑️ bed:🛏️ pen:🖊️ ten:🔟
net:🥅 pet beg egg:🥚 men get set tent:⛺ hat:🎩 hen:🐔 hot:🔥 hug:🤗 hop him hut:🛖 hit ham:🍖 rat:🐀 rug red:🔴
run:🏃 ram:🐏 rip rod:🎣 rib rub leg:🦵 log:🪵 lip:👄 lid lap let lot kid:🧒 kit jam jet:✈️ jog jug job web:🕸️ wig
wet:💧 win:🏆 wag yes:✅ yet yum:😋 yak van:🚐 vet fox:🦊 box:📦 six mix wax ox:🐂 fix zip zap:⚡ quit quiz:❓`
 .trim().split(/\s+/).map(s=>{const [w,e]=s.split(':');return {w,e:e||null};});

// Decodable sentences, answered by picking the matching picture pair [subject, thing].
const SENTENCES = [
 ['Dad can nap.','👨','😴'], ['The ant is on the map.','🐜','🗺️'], ['Dad is sad.','👨','😢'], ['Dad is mad.','👨','😠'],
 ['The cat is sad.','🐱','😢'], ['The cat can nap.','🐱','😴'], ['The pig is mad.','🐷','😠'], ['The dog can dig.','🐶','⛏️'],
 ['The pig can nap.','🐷','😴'], ['The sun is up.','☀️','⬆️'], ['The bug is on the cup.','🐛','🥤'], ['The bug is in the bag.','🐛','👜'],
 ['The cat is in the bag.','🐱','👜'], ['The bug was on the cup.','🐛','🥤'], ['The cat is on the bed.','🐱','🛏️'], ['The dog is on the bed.','🐶','🛏️'],
 ['The hen is on the bed.','🐔','🛏️'], ['The sun is hot.','☀️','🔥'], ['Dad got a hat.','👨','🎩'], ['The cat got a hat.','🐱','🎩'],
 ['I can hug Mom.','🤗','👩'], ['The rat can run.','🐀','🏃'], ['The hen is red.','🐔','🔴'], ['The bed is red.','🛏️','🔴'],
 ['The bus is red.','🚌','🔴'], ['I can run to the bus.','🏃','🚌'], ['The dog is on the log.','🐶','🪵'], ['The kid can hug the dog.','🤗','🐶'],
 ['The jet is up.','✈️','⬆️'], ['The fox is in the box.','🦊','📦'], ['The cat is in the box.','🐱','📦'], ['The dog is in the box.','🐶','📦'],
 ['You can pet the dog.','🫳','🐶'], ['The hen said yes.','🐔','✅'], ['We can see the sun.','👀','☀️'], ['Look at the big jet!','👀','✈️'],
];
