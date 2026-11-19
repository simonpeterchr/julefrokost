'use strict';
// Julefrokost – spilmotoren for ÉN fest (ét "rum"). Serveren (server.js) opretter én motor pr. fest med createFest().
// Storskærmen viser legene, gæsterne deltager fra telefonen (navn + evt. hold), værten styrer fra værtssiden.
// Aktiviteter: julekuponen (tip 13), Finsk polka (kendt hit i finsk humppa-udgave → originalen), "Hvornår var det nu det
// var?" (hvilket år er billedet fra), emoji-julefilm, tre enten/eller-runder ("Flaske eller frøken?" med citater,
// "Veer eller vellyst?" med ansigter og "Pony eller pornostjerne?" med navne), julemusik med ønsker, pakkeleg (værten
// siger "stjæl", derefter skjult tilfældig nedtælling), tilfældige skål, snapsealarm og piña colada-alarm.
// Al tilstand ligger i S og gemmes i <festens mappe>/state.json. Hver ændring går gennem changed(), som tæller versionen
// op og vækker de klienter, der venter på nyt (lang-polling, se server.js).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SONGS = [
  // Finsk polka: [svar, humppa-udgaven (Eläkeläiset, sunget på finsk), originalen, evt. start i sekunder for originalen].
  // Hvilken original hver humppa dækker, står på bandets albumsider på Wikipedia.
  ['Aqua – Barbie Girl', 's9cn4fV0GwQ', 'ZyhrYis509A'],
  ['Europe – The Final Countdown', 'NQ8ihnwjlb8', '9jK-NcRmVcw'],
  ['Queen – We Will Rock You', 'coheIAPy__g', '-tJYN-eG1zk'],
  ['Bon Jovi – Livin\' on a Prayer', '2WydbjejNQA', 'lDK9QqIzhwk'],
  ['Van Halen – Jump', 'LaxHrWLNfOQ', 'SwYN7mTi6HM'],
  ['Eagles – Hotel California', 'NocWTQNTZoQ', '09839DpTctU'],
  ['Deep Purple – Smoke on the Water', 'zEBxqKKm6po', 'Q2FzZSBD5LE'],
  ['The Police – Every Breath You Take', 'g5rAImchQIo', 'OMOGaugKpzs'],
  ['Carl Douglas – Kung Fu Fighting', 'Vuk_X3_ExKc', 'Bt4D8oA3mxU'],
  ['Elvis Presley – Suspicious Minds', 'pV1D5MyHF_A', 'WrMGGouem3c'],
  ['Guns N\' Roses – Welcome to the Jungle', 'CiK8C_NeYAY', 'o1tj2zJ2Wvg'],
  ['Nancy Sinatra – These Boots Are Made for Walkin\'', 'HsTdtiBPY6s', 'GM1kzbAgo_E'],
  ['The Cranberries – Zombie', 'fFVW2AA6ID4', '6Ejga4kJUts'],
  ['Nirvana – Smells Like Teen Spirit', 'JhhF3qSxMjY', 'hTWKbfoikeg'],
  ['Madonna – Like a Virgin', 'blcdGO2R1U8', 's__rX_WL100'],
];
// julemusik (officielle videoer på YouTube)
const JULEMUSIK = [
  ['Mariah Carey – All I Want for Christmas Is You', 'yXQViqx6GMY'], ['Wham! – Last Christmas', 'E8gmARGvPlI'],
  ['José Feliciano – Feliz Navidad', '0UVUW11FENs'], ['The Pogues – Fairytale of New York', 'j9jbdgZidu8'],
  ['Band Aid – Do They Know It\'s Christmas?', 'RH-xd5bPKTA'], ['Chris Rea – Driving Home for Christmas', 'DDt3u2Ev1cI'],
  ['Michael Bublé – It\'s Beginning to Look a Lot Like Christmas', '0bhsXykXxfg'], ['Brenda Lee – Rockin\' Around the Christmas Tree', 'TFsZy9t-qDc'],
  ['Bobby Helms – Jingle Bell Rock', 'ZnDmmiiFSUU'], ['Ariana Grande – Santa Tell Me', 'nlR0MkrRklg'],
  ['Kelly Clarkson – Underneath the Tree', 'EM2Fnp_qnE8'], ['Justin Bieber – Mistletoe', 'LUjn3RpkcKY'],
  ['Paul McCartney – Wonderful Christmastime', '94Ye-3C1FC8'], ['Elton John – Step Into Christmas', 'IbRtGMm96F8'],
  ['Shakin\' Stevens – Merry Christmas Everyone', 'N-PyWfVkjZc'], ['John & Yoko – Happy Xmas (War Is Over)', 'g_kj60DIq2M'],
  ['MC Einar – Jul det\' cool', 'FuyKWtF5aqU'], ['Jul på Vesterbro – Hjerternes fest', 'hvKzNNwbaM4'],
  ['Shu-bi-dua – Rap Jul', 'S9WLywQrDnc'], ['Rasmus Seebach – Der\' noget i december', 'Mv6FViYatkU'],
  ['Rasmus Seebach – Lille store verden', 'Ae3_eSWcNZc'], ['Slade – Merry Xmas Everybody', 'PTslBTBl1X8'],
  ['Wizzard – I Wish It Could Be Christmas Everyday', 'IJPc7esgvsA'], ['Michael Bublé – Holly Jolly Christmas', 'Dkq3LD-4pmM'],
  ['Ed Sheeran & Elton John – Merry Christmas', 'Q_yuO8UNGmY'], ['Eartha Kitt – Santa Baby', 'HTCFi4l3nkY'],
  ['Darlene Love – Christmas (Baby Please Come Home)', 'vf4ZXBzbAio'], ['Otto Brandenburg – Søren Banjomus', '-qYMNbydj5s'],
  ['Drengene fra Angora – Jul i Angora', 'SFpiOoWFNNg'], ['Et barn er født i Betlehem (DR fællessang)', 'xRyiOB4as9c'],
];
const SKAAL_AD = 'bMTkGzy6-yo'; // lyden til skålen: en julebryg-reklame (bryggeriets egen kanal på YouTube)

const EMOJI = [
  ['Alene hjemme', '🏠👦🏻😱✈️🪤'],
  ['Love Actually', '❤️🇬🇧🎄📝🎤'],
  ['Grinchen', '💚👹🎁🏔️🐕'],
  ['Die Hard', '👮‍♂️🏢💥🎄🔫'],
  ['Elf', '🧝‍♂️📏🍝🗽'],
  ['Polar Express', '🚂❄️🎅🔔🎫'],
  ['The Nightmare Before Christmas', '🎃💀🎄🎅'],
  ['Frost', '⛄❄️👸👸🦌'],
  ['Fars fede juleferie', '🚗🌲💡💡💡⚡🐿️'],
  ['Santa Clause', '🧔➡️🎅📜🛷'],
  ['Gremlins', '🐾💧🍔🌙😈'],
  ['Et juleeventyr', '👻👻👻💰🧓🔔'],
  ['Klaus', '📮🧔🪵🎁❄️'],
  ['Bad Santa', '🎅🍺🚬💰🏬'],
  ['The Holiday', '🏡🔁🇬🇧🇺🇸💕'],
  ['Nissebanden', '👹👹👹👹🎅🚔'],
  ['The Julekalender', '🧔🧔🧔🇬🇧🗣️🎅'],
  ['Jul i Valhal', '⚡🪓🧙‍♂️🎄'],
  ['Jul i Nøddebo Præstegård', '⛪🏡🎅🌨️💌'],
  ['Mr. Bean', '🧸🦃😬🎄'],
];

// Flaske eller frøken?: [citat, 0 = champagne / 1 = eskort, hvem citatet handler om, mere at grine af].
// Citaterne er korte uddrag fra vinanmeldelser og annoncer og har cirkuleret som selskabsquiz – se KILDER.md.
const DUO = { pagne: ['Champagne', 'Eskort'], face: ['Fødsel', 'Porno'], pony: ['Pony', 'Pornostjerne'] };
const PAGNE = [
  ['Giver en stor appetit og vil med garanti opleves kælen.', 1, 'Carolina, 23 år', 'Studinebabe fra København.'],
  ['Michelle er i dag i spidsen for det lille, familiedrevne hus. Her er der virkelig value for money.', 0, 'Drappier Carte d’Or Brut', 'Ca. 350 kr. pr. flaske.'],
  ['Frække pikanterier og topklasse, du ikke kan få nok af!', 1, 'Nikita', 'Kommer fra Rumænien og søger en dansk sugardaddy.'],
  ['Uovertruffen luksus. Konstant topkvalitet er uden sidestykke. På mange måder er Madame Lily stadig et ikon for den nuværende ledelse.', 0, 'Bollinger Special Cuvée', 'Kan fås for den smalle pris af 349 kr. pr. flaske.'],
  ['Drønlækker (…) lettere avanceret, men altid imødekommende.', 1, 'Angelina Angel', 'Britisk storbarmet model.'],
  ['Pæn kulør. Rund, juicy, delikat og meget selskabelig.', 1, 'Victoria Diamond', '“Skal ikke fanges, blot tæmmes.” Tilbyder i øvrigt “urin til ham”.'],
  ['Sprød, fast og velduftende. En forførende omgang fransk!', 1, 'Yasmin', 'Opfordrer til at lege med to fyre ad gangen. “Kom og leg”.'],
  ['Ingen over, ingen ved siden af! Skal opleves af alle mindst én gang i sit liv!', 0, 'Delamotte Champagne Brut', 'Byder på en flot blomsterbuket med et strejf af abrikos og kan købes for ca. 400 kr. flasken.'],
  ['Frisk og meget appetitvækkende, sansepirrende og indbydende i duften.', 0, 'Cava Reserva Sumarroca', 'Anmeldt således i Berlingske. En ambitiøs vin, som vil glæde selv den mest kræsne champagnekender.'],
  ['Dejlig varm og blid fransk … modnes og topper med tiden.', 1, 'Xenia fra Rusland', 'Dejlig blød og rund timeglasfigur med frække pikanterier.'],
  ['Fræk laksefarvet. Velbygget, tæt og glat. Halvtør og kraftig ‘charmetrold’.', 0, 'Le Fagot Rosé Brut Pinot Noir', 'Familien Fagot har brygget champagne siden 1928.'],
  ['En sand perle! En absolut uimodståelig lækker sag, som med garanti kan forføre dig.', 1, 'Ariana', 'All night: 8 timer med hende koster 15.000 kr.'],
  ['Høj kvalitet for pengene, som normalt vil koste 2 gange mere.', 0, 'Marcel Vézien L’Illustre Champagne N.V.', 'Koster kun 163 kr. Anmeldelsen kommer fra en bruger på Vivino.'],
  ['Genbesøgt for et par måneder siden. Samme oplevelse. Medium+.', 0, 'Julien Braud La Bulle de l’Ouest Pétillant Brut N.V.', 'På etiketten står der: “Den åbner hurtigere end sin egen skygge. Giver det mening? Nej vel, men det smager rigtig godt.”'],
  ['En perfekt blanding af elegance og lethed. Silkeblød og smager godt.', 1, 'Jackie, 27 år fra Østerbro', 'Lettere avanceret. Erotiske massager. Kærestesex. Modtager par.'],
];

// Pony eller pornostjerne?: [navn, 0 = My Little Pony / 1 = pornostjerne, lidt om hvem det er]. Navne og svar er fra den
// klassiske "Porn or Pony"-quiz (Brunching Shuttlecocks); forklaringerne er skrevet til lejligheden.
const PONY = [
  ['Sweetie Pie', 1, 'Medvirker i “Breastman’s American Butt Search”.'],
  ['Heart Throb', 0, 'En “So-Soft”-pegasus fra 80\'erne.'],
  ['Misty Rain', 1, 'Har dog en ponyforbindelse: hun var med i “Tracey at the Sex Derby”.'],
  ['Lucky Star', 1, 'Stjernen i “Pure Milk #2” – næppe så uskyldig, som den lyder.'],
  ['Ruby Lips', 0, 'Lyder som en pornostjerne, men er en ægte My Little Pony.'],
  ['Cherry Treats', 0, 'En “Sweetberry”-pony, der duftede af kirsebær.'],
  ['Honey Rose', 1, 'Medvirker i “Lethal Squirt”.'],
  ['Daisy Sweet', 0, 'En pony med duft – denne gang af parfume.'],
  ['Sunshine Blue', 1, 'Medvirker i “Fresh Flesh”.'],
  ['Love Melody', 0, 'En af “Twice as Fancy”-ponyerne – selv om navnet skriger pornostjerne.'],
  ['Chocolate Delight', 0, 'En “Soda-Sippin’”-pony, der drikker med sugerør.'],
  ['Green Eyes', 1, 'Medvirkede i “Hispanic Heatwave”.'],
];

const KINDS = ['music', 'photo', 'emoji', 'pagne', 'face', 'pony']; // quizzerne
const noneUsed = () => Object.fromEntries(KINDS.map(k => [k, []]));
const LIMIT = { music: 60e3, photo: 20e3, emoji: 20e3, pagne: 30e3, face: 15e3, pony: 15e3 };
const RECAP_MS = 14e3; // når en quiz slutter: så længe står quizzens eget resultat på tv'et, før den samlede stilling kommer
const SKAAL_MS = 26e3; // skål-skærmen, mens reklamens lyd (~20 s) spiller
const SNAPS_MS = 60e3; // snapsealarm: skærmen fuld af flasker, mens snapsevisen spiller (59 s + lidt til at starte den)
const PINA_MS = 5 * 60e3; // piña colada-alarm: opskriften står på tv'et, til sangen er slut (tv'et melder det) – højst fem minutter
const TIP_POINTS = 300;
const MAX_PICS = 300, MAX_FACES = 120, MAX_BYTES = 300e6; // loft pr. fest: egne billeder, ansigter og samlet plads
const FACE_DIRS = ['foedsel', 'porno']; // "Veer eller vellyst?": mappen er svaret
const PIC_RE = /\.(jpe?g|png|webp)$/i;

// Forslag til julekuponen (knappen "Forslag til kupon" på værtssiden). Væddemål uden bud handler om gæsterne – de får tre
// tilfældige navne fra gæstelisten, som værten kan rette.
const KUPON = [
  ['Hvem kan stå længst tid på ét ben?'],
  ['Hvem folder den flotteste figur af sin serviet på 1 minut?'],
  ['Hvilken sang bliver spillet først?', 'Last Christmas', 'Jul i Angora', 'Et barn er født i Betlehem'],
  ['Hvem går først på toilettet?'],
  ['Hvem kan stable det højeste tårn på 60 sekunder?'],
  ['Læg en mønt på panden. Hvem kan hurtigst få den ned i munden uden at bruge hænderne?'],
  ['Hvem vinder Finsk polka?'],
  ['Hvem ønsker den første sang fra YouTube?'],
  ['Hvem gætter flest årstal i Hvornår var det nu det var?'],
  ['Hvem danser først?'],
  ['Hvem ender med flest gaver efter pakkelegen?'],
  ['Hvad bliver spildt først?', 'Rødvin', 'Øl', 'Snaps'],
  ['Hvem vinder emoji-julefilm-quizzen?'],
];
// Væddemål om en quiz ("Hvem vinder Finsk polka?") afgør sig selv, når quizzen slutter – se tipsAuto()
const TIP_QUIZ = { music: /finsk polka/i, photo: /hvornår var det nu|årstal/i, emoji: /emoji/i, pagne: /flaske eller frøken/i, face: /veer eller vellyst/i, pony: /pony eller porno/i };

const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const rnd = (a, b) => a + Math.random() * (b - a);
const clean = (v, n) => String(v == null ? '' : v).replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, n);
const randomCode = () => Array.from(crypto.randomBytes(4), b => 'ABCDEFGHJKLMNPQRSTUVWXYZ'[b % 24]).join('');
/** Hvilket billedformat er det? Kun JPEG, PNG og WebP tages imod (afgøres af indholdet, ikke af filnavnet). */
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 16) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return '.jpg';
  if (buf.readUInt32BE(0) === 0x89504e47 && buf.readUInt32BE(4) === 0x0d0a1a0a) return '.png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return '.webp';
  return null;
}

// YouTube-søgningen deles af alle fester på serveren: højst 40 søgninger i minuttet i alt
let searches = [];
const searchRoom = () => { const t = Date.now(); searches = searches.filter(x => t - x < 60e3); if (searches.length >= 40) return false; searches.push(t); return true; };

/**
 * Én fest. dir = festens egen mappe (tilstand og egne billeder), std = de medfølgende billeder
 * [{ fil, aar, tekst, foto, licens }] i mappen stdDir, newCode = giver en ledig deltagerkode.
 */
function createFest({ dir, std = [], stdDir = '', newCode = randomCode }) {
  const PICS = path.join(dir, 'billeder'); // billeder/<år>/<fil> og billeder/ansigter/<foedsel|porno>/<fil>
  const FILE = path.join(dir, 'state.json');
  fs.mkdirSync(PICS, { recursive: true });

  let S = { code: '', navn: 'Julefrokost', players: {}, teams: [], mode: 'lobby', quiz: null, recap: null, pak: null, skaal: null, autoSkaal: false, nextSkaal: 0, plan: { skaalMin: 12, skaalMax: 28, snapsEvery: 60 }, pina: null, snaps: null, autoSnaps: false, nextSnaps: 0, jb: { now: null, n: 0, played: [], wishes: [] }, done: {}, used: noneUsed(), tips: { questions: [], open: true, shown: -1 }, tipsAns: {}, guests: [], opt: { std: true }, v: 0 };
  try {
    const old = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    // en ældre gemt tilstand kan mangle felter – de får standardværdien
    S = { ...S, ...old, jb: { ...S.jb, ...old.jb }, used: { ...S.used, ...old.used }, plan: { ...S.plan, ...old.plan }, tips: { ...S.tips, ...old.tips }, opt: { ...S.opt, ...old.opt }, done: old.done || {}, tipsAns: old.tipsAns || {} };
  } catch { }
  if (!S.code) S.code = newCode();

  let saveT = null, wakeT = null, dead = false;
  const listeners = new Set();
  const save = () => { try { const t = FILE + '.tmp'; fs.writeFileSync(t, JSON.stringify(S)); fs.renameSync(t, FILE); } catch (e) { console.error('fest', e.message); } };
  /** Kaldes efter enhver ændring: ny version, gem (samlet, højst hvert halve sekund) og væk de ventende klienter. */
  function changed() {
    if (dead) return;
    S.v++;
    clearTimeout(saveT);
    saveT = setTimeout(save, 500);
    // flere ændringer i samme handling giver ét samlet svar
    if (!wakeT) wakeT = setImmediate(() => { wakeT = null; for (const f of [...listeners]) f(); });
  }
  const onChange = f => { listeners.add(f); };
  /** Gem med det samme (når serveren lukker). */
  function flush() { if (saveT) { clearTimeout(saveT); saveT = null; save(); } }
  /** Festen er slettet: stop med at gemme og vække. */
  function dispose() { dead = true; clearTimeout(saveT); listeners.clear(); }

  // ---- billeder ----
  // Egne billeder ligger i billeder/<år>/ (lagt ind fra værtssiden – eller kopieret direkte ind i mappen). De medfølgende
  // (std) har årstal, en kort tekst om begivenheden og kildeangivelse; de kan slås fra under Billeder.
  let picCache = null, picAt = 0;
  function ownPics() {
    const out = [];
    try {
      for (const y of fs.readdirSync(PICS)) {
        if (!/^\d{4}$/.test(y)) continue;
        for (const f of fs.readdirSync(path.join(PICS, y))) if (PIC_RE.test(f)) out.push({ year: +y, file: y + '/' + f, own: true });
      }
    } catch { }
    return out;
  }
  function pictures() {
    if (picCache && Date.now() - picAt < 60e3) return picCache;
    const out = ownPics();
    if (S.opt.std) for (const x of std) out.push({ year: x.aar, file: 'std/' + x.fil, text: x.tekst || '', credit: [x.foto, x.licens].filter(Boolean).join(' · ') });
    picAt = Date.now();
    return (picCache = out);
  }
  let faceCache = null, faceAt = 0;
  function faces() {
    if (faceCache && Date.now() - faceAt < 60e3) return faceCache;
    const out = [];
    FACE_DIRS.forEach((d, a) => {
      try { for (const f of fs.readdirSync(path.join(PICS, 'ansigter', d))) if (PIC_RE.test(f)) out.push({ a, file: 'ansigter/' + d + '/' + f }); } catch { }
    });
    faceAt = Date.now();
    return (faceCache = out);
  }
  const forget = () => { picCache = faceCache = null; };
  /** Filen bag en billedsti fra tilstanden: "std/…" er de medfølgende, alt andet festens egne. Aldrig uden for mapperne. */
  function picFile(rel) {
    rel = String(rel);
    const inside = (root, r) => { const f = path.join(root, path.normalize(r).replace(/^(\.\.[/\\])+/, '')); return f.startsWith(root + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null; };
    if (rel.startsWith('std/')) return stdDir && std.some(x => 'std/' + x.fil === rel) ? inside(stdDir, rel.slice(4)) : null;
    return inside(PICS, rel);
  }
  const ownBytes = () => { let n = 0; for (const p of [...ownPics(), ...faces()]) try { n += fs.statSync(path.join(PICS, p.file)).size; } catch { } return n; };
  /** Læg et billede ind: b = { aar } (årstalsquizzen) eller { ansigt: 'foedsel' | 'porno' }. buf = selve billedet. */
  function addPicture(b, buf) {
    const ext = sniff(buf);
    if (!ext) return { error: 'Det er ikke et billede, jeg kan bruge – gem det som JPG eller PNG.' };
    let sub;
    if (b.ansigt != null) {
      if (!FACE_DIRS.includes(b.ansigt)) return { error: 'Vælg, om ansigtet er fra en fødsel eller en film.' };
      forget(); if (faces().length >= MAX_FACES) return { error: 'Der er ikke plads til flere ansigter (' + MAX_FACES + ').' };
      sub = 'ansigter/' + b.ansigt;
    } else {
      const y = Math.round(+b.aar);
      if (!(y >= 1900 && y <= new Date().getFullYear())) return { error: 'Vælg et årstal mellem 1900 og i år.' };
      if (ownPics().length >= MAX_PICS) return { error: 'Der er ikke plads til flere billeder (' + MAX_PICS + ').' };
      sub = String(y);
    }
    if (ownBytes() + buf.length > MAX_BYTES) return { error: 'Festens billeder fylder for meget – slet nogle først.' };
    const name = crypto.randomBytes(8).toString('hex') + ext;
    try { fs.mkdirSync(path.join(PICS, sub), { recursive: true }); fs.writeFileSync(path.join(PICS, sub, name), buf); } catch (e) { return { error: 'Billedet kunne ikke gemmes.' }; }
    forget(); changed();
    return { ok: true, fil: sub + '/' + name };
  }
  /** Slet et af festens egne billeder (de medfølgende kan ikke slettes – kun slås fra). */
  function removePicture(rel) {
    rel = String(rel || '');
    const f = !rel.startsWith('std/') && picFile(rel);
    if (!f) return { error: 'Billedet findes ikke.' };
    try { fs.unlinkSync(f); } catch { return { error: 'Billedet kunne ikke slettes.' }; }
    forget(); changed();
    return { ok: true };
  }
  /** Ret årstallet på et af festens egne billeder (flytter filen til årets mappe). */
  function movePicture(rel, year) {
    rel = String(rel || '');
    const y = Math.round(+year), f = /^\d{4}\//.test(rel) && picFile(rel);
    if (!f) return { error: 'Billedet findes ikke.' };
    if (!(y >= 1900 && y <= new Date().getFullYear())) return { error: 'Vælg et årstal mellem 1900 og i år.' };
    const to = path.join(PICS, String(y), path.basename(f));
    try { fs.mkdirSync(path.dirname(to), { recursive: true }); if (to !== f) fs.renameSync(f, to); } catch { return { error: 'Årstallet kunne ikke rettes.' }; }
    forget(); changed();
    return { ok: true, fil: y + '/' + path.basename(f) };
  }
  function listPictures() {
    forget();
    return { egne: ownPics().map(p => ({ fil: p.file, aar: p.year })).sort((a, b) => a.aar - b.aar || a.fil.localeCompare(b.fil)), ansigter: faces().map(p => ({ fil: p.file, a: p.a })), std: std.length, brugStd: !!S.opt.std, max: MAX_PICS, maxAnsigter: MAX_FACES };
  }

  // ---- spørgsmål ----
  // hvad der kan spørges om – og hvor meget der er brugt. Sange og film huskes på titlen, så listerne kan rettes undervejs.
  const POOL = { music: () => SONGS.map(x => x[0]), emoji: () => EMOJI.map(x => x[0]), photo: () => pictures().map(p => p.file), pagne: () => PAGNE.map(x => x[0]), face: () => faces().map(p => p.file), pony: () => PONY.map(x => x[0]) };
  function progress(kind) {
    const pool = POOL[kind](), used = new Set(S.used[kind] || []);
    return [pool.filter(k => used.has(k)).length, pool.length];
  }
  // De tre forkerte årstal: helst andre år, der selv har billeder i samme bunke (egne eller medfølgende) og ligger tæt på
  // det rigtige – ellers tilfældige år i nærheden. Aldrig et år ude i fremtiden.
  function yearOptions(y, p) {
    const now = new Date().getFullYear(), span = 6;
    const near = shuffle([...new Set(pictures().filter(q => !!q.own === !!p.own).map(q => q.year))].filter(x => x !== y && Math.abs(x - y) <= span));
    const out = new Set(near.slice(0, 3));
    for (let i = 0; out.size < 3 && i < 500; i++) { const c = y - span + crypto.randomInt(2 * span + 1); if (c !== y && c <= now && c >= 1900) out.add(c); }
    return [y, ...out].sort((a, b) => a - b).map(String);
  }
  function makeQuestion(kind) {
    const used = new Set(S.used[kind] || []);
    if (kind === 'music' || kind === 'emoji') {
      const list = kind === 'music' ? SONGS : EMOJI, left = list.filter(x => !used.has(x[0]));
      if (!left.length) return null;
      const x = left[crypto.randomInt(left.length)];
      const options = shuffle([x[0], ...shuffle(list.filter(y => y !== x).map(y => y[0])).slice(0, 3)]);
      const q = { key: x[0], options, answer: options.indexOf(x[0]), title: x[0] };
      return kind === 'music' ? { ...q, polka: x[1], original: x[2], start: x[3] || 0 } : { ...q, emoji: x[1] };
    }
    if (kind === 'photo') {
      const left = pictures().filter(p => !used.has(p.file));
      if (!left.length) return null;
      // spred over årene: vælg først et år, så et billede fra det år
      const ly = [...new Set(left.map(p => p.year))], y = ly[crypto.randomInt(ly.length)];
      const fromYear = left.filter(p => p.year === y), p = fromYear[crypto.randomInt(fromYear.length)];
      const opts = yearOptions(y, p);
      return { key: p.file, options: opts, answer: opts.indexOf(String(y)), img: p.file, title: String(y), text: p.text || '', credit: p.credit || '' };
    }
    if (kind === 'pagne') {
      const left = PAGNE.filter(x => !used.has(x[0]));
      if (!left.length) return null;
      const x = left[crypto.randomInt(left.length)];
      // tv'et læser citatet op: enten browserens egen stemme eller lydfilen, der hedder efter citatets plads i listen
      // (lavet med tools/citatlyd.js)
      return { key: x[0], options: DUO.pagne, answer: x[1], text: x[0], title: x[2], more: x[3], audio: 'citat' + String(PAGNE.indexOf(x) + 1).padStart(2, '0') };
    }
    if (kind === 'pony') {
      const left = PONY.filter(x => !used.has(x[0]));
      if (!left.length) return null;
      const x = left[crypto.randomInt(left.length)];
      return { key: x[0], options: DUO.pony, answer: x[1], text: x[0], title: DUO.pony[x[1]], more: x[2] };
    }
    if (kind === 'face') {
      const left = faces().filter(p => !used.has(p.file));
      if (!left.length) return null;
      const p = left[crypto.randomInt(left.length)];
      return { key: p.file, options: DUO.face, answer: p.a, img: p.file, title: DUO.face[p.a] };
    }
  }

  function startQuiz(kind) {
    const q = makeQuestion(kind);
    if (!q) return kind === 'photo' && !pictures().length ? 'Der ligger ingen billeder – læg nogle ind under Billeder.' : kind === 'face' && !faces().length ? 'Der ligger ingen ansigter til runden – læg nogle ind under Billeder.' : 'Alle spørgsmål er brugt – nulstil under Indstillinger.';
    (S.used[kind] = S.used[kind] || []).push(q.key);
    const n = S.quiz && S.quiz.kind === kind ? S.quiz.n + 1 : 1;
    S.mode = kind;
    // Finsk polka har ingen tidsgrænse (deadline 0): sangen spiller, til værten viser svaret, eller alle har svaret
    S.quiz = { kind, n, q, phase: 'ask', started: Date.now(), deadline: kind === 'music' ? 0 : Date.now() + LIMIT[kind], answers: {} };
    changed();
  }

  function reveal() {
    const z = S.quiz;
    if (!z || z.phase !== 'ask') return;
    z.phase = 'reveal';
    z.revealed = Date.now();
    for (const [tok, a] of Object.entries(z.answers)) {
      const p = S.players[tok];
      if (!p) continue;
      a.points = a.c === z.q.answer ? Math.round(500 + 500 * Math.max(0, 1 - a.ms / LIMIT[z.kind])) : 0;
      p.score += a.points;
      // rigtige og point pr. quiz (til quizzens eget resultat og til julekuponen)
      if (a.points) { p.right = p.right || {}; p.right[z.kind] = (p.right[z.kind] || 0) + 1; p.pts = p.pts || {}; p.pts[z.kind] = (p.pts[z.kind] || 0) + a.points; }
    }
    changed();
  }

  function answer(tok, c) {
    const z = S.quiz, p = S.players[tok];
    if (!p) return { error: 'Ukendt spiller – deltag igen.' };
    if (!z || z.phase !== 'ask' || S.skaal || S.snaps || S.pina) return { error: 'Ikke nu.' };
    if (z.answers[tok]) return { ok: true };
    c = +c;
    if (!(c >= 0 && c < z.q.options.length)) return { error: 'Ugyldigt svar.' };
    z.answers[tok] = { c, ms: Date.now() - z.started - (z.paused || 0) };
    // alle har svaret: afslør med det samme (musikken får lov at spille lidt endnu)
    const n = Object.keys(S.players).length;
    if (Object.keys(z.answers).length >= n) z.deadline = Math.min(z.deadline || Infinity, Date.now() + (z.kind === 'music' ? 3e3 : 1e3));
    changed();
    return { ok: true };
  }

  // ---- pakkeleg: I tager fra bunken, til værten siger "stjæl" – derefter en skjult, tilfældig tid (2–12 min.) ----
  function startPak() {
    S.mode = 'pak';
    S.pak = { started: Date.now(), phase1End: 0, end: 0 }; // 0 = I tager stadig fra bunken
    changed();
  }
  function pakSteal() {
    if (!S.pak) startPak();
    const t = Date.now();
    S.mode = 'pak';
    S.pak.phase1End = t;
    S.pak.end = t + rnd(2, 12) * 60e3;
    changed();
  }
  function pakPhase() {
    const k = S.pak; if (!k) return null;
    return !k.phase1End ? 1 : Date.now() < k.end ? 2 : 3;
  }

  // ---- skål ----
  // afbrydelser (skål, snaps) sætter quizzens ur og pakkelegens nedtælling på pause
  function freeze(ms) {
    if (S.quiz && S.quiz.phase === 'ask') { if (S.quiz.deadline) S.quiz.deadline += ms; S.quiz.paused = (S.quiz.paused || 0) + ms; }
    if (S.pak && pakPhase() === 2) S.pak.end += ms;
  }
  function skaal() {
    if (S.skaal || S.snaps || S.pina) return;
    S.skaal = { at: Date.now(), until: Date.now() + SKAAL_MS };
    freeze(SKAAL_MS);
    planSkaal();
    changed();
  }
  // næste tilfældige skål: et sted mellem de to minuttal, værten har valgt (12–28, hvis intet er valgt)
  function planSkaal() { S.nextSkaal = S.autoSkaal ? Date.now() + rnd(S.plan.skaalMin, S.plan.skaalMax) * 60e3 : 0; S.skaalFixed = false; }
  // værten vælger et klokkeslæt ("TT:MM") for den næste skål eller snapsealarm: i dag, eller i morgen hvis det er passeret.
  // Klokken er serverens – ligger serveren i en anden tidszone end festen, sender værtssiden sit eget ur med (b.at).
  function clockTime(b) {
    if (b && +b.at > Date.now() && +b.at < Date.now() + 864e5) return Math.round(+b.at);
    const m = /^(\d{1,2}):(\d{2})$/.exec(String((b && b.time) || '')); if (!m || +m[1] > 23 || +m[2] > 59) return 0;
    const d = new Date(); d.setHours(+m[1], +m[2], 0, 0);
    return d.getTime() <= Date.now() ? d.getTime() + 864e5 : d.getTime();
  }

  // ---- piña colada-alarm: værten starter den; opskriften står på tv'et, mens hele sangen spiller ----
  function pina() {
    if (S.pina || S.skaal || S.snaps) return;
    S.pina = { at: Date.now(), until: Date.now() + PINA_MS };
    freeze(PINA_MS);
    changed();
  }
  // sangen er slut (eller værten stopper den): den tid, der ikke blev brugt, gives tilbage til quizzens ur og pakkelegen
  function pinaEnd() {
    if (!S.pina) return;
    freeze(Math.min(0, Date.now() - S.pina.until));
    S.pina = null;
    changed();
  }

  // ---- snapsealarm: ca. én gang i timen, på et tilfældigt minut ----
  function snaps() {
    if (S.snaps || S.skaal || S.pina) return;
    S.snaps = { at: Date.now(), until: Date.now() + SNAPS_MS };
    freeze(SNAPS_MS);
    planSnaps();
    changed();
  }
  function planSnaps(first) {
    S.snapsFixed = false;
    if (!S.autoSnaps) { S.nextSnaps = 0; return; }
    // ca. så tit, som værten har valgt (en gang i timen, hvis intet er valgt) – med lidt slør, så den ikke kan forudsiges;
    // første gang et sted inden for den første periode
    const e = S.plan.snapsEvery;
    S.nextSnaps = Date.now() + (first ? rnd(.15, 1) : rnd(.8, 1.2)) * e * 60e3;
  }

  // ur (serveren kalder tick() hvert halve sekund): afslør ved deadline, afslut skål, tilfældige skål (kun mens noget
  // kører – ikke på velkomstskærmen)
  let lastPak = null;
  function tick() {
    if (dead) return;
    const t = Date.now();
    if (S.skaal && t > S.skaal.until) { S.skaal = null; changed(); }
    if (S.snaps && t > S.snaps.until) { S.snaps = null; changed(); }
    if (S.pina && t > S.pina.until) { S.pina = null; changed(); }
    // falder snapsealarmen oven i en skål eller en piña colada, venter den, til de er færdige
    if (S.autoSnaps && S.nextSnaps && t > S.nextSnaps && !S.snaps) { const busy = S.skaal || S.pina; if (busy) S.nextSnaps = busy.until + 5e3; else snaps(); }
    if (S.quiz && S.quiz.phase === 'ask' && S.quiz.deadline && t > S.quiz.deadline) reveal();
    const ph = pakPhase();
    if (ph !== lastPak) { lastPak = ph; if (ph === 3) S.done.pak = true; if (ph) changed(); }
    if (S.autoSkaal && S.nextSkaal && t > S.nextSkaal && !S.skaal && !S.pina && (S.skaalFixed || S.mode !== 'lobby')) skaal(); // et valgt klokkeslæt gælder også på velkomstskærmen
  }

  // ---- tip 13'er (julekuponen): væddemål om gæsterne, kuponen udfyldes på telefonen i løbet af aftenen ----
  function tipsSet(qs) {
    const old = S.tips.questions;
    S.tips.questions = (Array.isArray(qs) ? qs : []).slice(0, 20).map((x, i) => {
      // et væddemål: spørgsmål + tre bud (1 / X / 2), fx tre gæster eller tre sange
      x = x || {};
      const q = clean(x.q, 160);
      const opts = (Array.isArray(x.opts) ? x.opts : []).slice(0, 3).map(o => clean(o, 30));
      if (!q || opts.length < 3 || opts.some(o => !o)) return null;
      const keep = old[i] && old[i].q === q && old[i].opts.join('|') === opts.join('|') ? old[i] : null;
      return { q, opts, answer: x.answer === '' || x.answer == null ? (keep ? keep.answer : null) : (+x.answer >= 0 && +x.answer < 3 ? +x.answer : null), revealed: keep ? !!keep.revealed : false };
    }).filter(Boolean);
    changed();
  }
  function tipsAnswer(tok, b) {
    if (!S.players[tok]) return { error: 'Ukendt spiller – deltag igen.' };
    if (!S.tips.open) return { error: 'Kuponerne er lukket.' };
    const a = S.tipsAns[tok] = S.tipsAns[tok] || {};
    const i = +b.i, c = +b.c;
    if (!(i >= 0 && i < S.tips.questions.length) || !(c >= 0 && c < S.tips.questions[i].opts.length)) return { error: 'Ugyldigt svar.' };
    if (S.tips.questions[i].revealed) return { error: 'Den kamp er afgjort.' };
    a[i] = c;
    changed();
    return { ok: true };
  }
  /** Afslør næste (eller et bestemt) spørgsmål på tv'et – kuponerne lukkes, og de rigtige får point. */
  function tipsReveal(i) {
    const T = S.tips, x = T.questions[i];
    if (!x) return 'Intet spørgsmål.';
    if (x.answer == null) return 'Vælg først det rigtige svar på spørgsmål ' + (i + 1) + '.';
    T.open = false; S.mode = 'tips'; T.shown = i;
    if (!x.revealed) {
      x.revealed = true;
      for (const [tok, a] of Object.entries(S.tipsAns)) if (S.players[tok] && a[i] === x.answer) S.players[tok].score += TIP_POINTS;
    }
    changed();
  }
  // Væddemål om en quiz ("Hvem vinder Finsk polka?") afgør sig selv, når quizzen slutter: det af de tre bud, der klarede
  // sig bedst i quizzen (flest rigtige, derefter flest point), bliver krydset af. Står to lige, eller er ingen af buddene
  // med i spillet, lader den væddemålet være. Værten viser stadig selv resultatet på tv'et (det er dér, pointene gives).
  function tipsAuto(kind) {
    const out = [], who = name => Object.values(S.players).find(p => p.name.toLowerCase() === String(name).trim().toLowerCase());
    S.tips.questions.forEach((x, i) => {
      if (x.revealed || !TIP_QUIZ[kind] || !TIP_QUIZ[kind].test(x.q)) return;
      const sc = x.opts.map(o => { const p = who(o); return p ? ((p.right || {})[kind] || 0) * 1e7 + ((p.pts || {})[kind] || 0) : -1; });
      const best = Math.max(...sc);
      if (best <= 0 || sc.filter(v => v === best).length !== 1) return;
      x.answer = sc.indexOf(best);
      out.push({ n: i + 1, name: x.opts[x.answer] });
    });
    return out;
  }
  function tipsView(role, tok) {
    const T = S.tips;
    const o = { open: T.open, shown: T.shown, count: T.questions.length, filled: Object.values(S.tipsAns).filter(a => Object.keys(a).length >= T.questions.length && T.questions.length).length };
    if (role === 'player') {
      o.questions = T.questions.map(x => ({ q: x.q, opts: x.opts, answer: x.revealed ? x.answer : null }));
      o.mine = S.tipsAns[tok] || {};
    } else {
      o.questions = T.questions;
      o.table = Object.entries(S.players).map(([t, p]) => ({ name: p.name, right: T.questions.filter((x, i) => x.revealed && (S.tipsAns[t] || {})[i] === x.answer).length, filled: Object.keys(S.tipsAns[t] || {}).length })).sort((a, b) => b.right - a.right || a.name.localeCompare(b.name));
    }
    const x = T.questions[T.shown];
    if (x && x.revealed) o.right = Object.entries(S.tipsAns).filter(([t, a]) => S.players[t] && a[T.shown] === x.answer).map(([t]) => S.players[t].name);
    return o;
  }

  // ---- julemusik: musikvideoer i fuld skærm, ønsker fra telefonerne går forrest ----
  // Ønsker er enten en sang fra listen eller en hvilken som helst video fra YouTube-søgningen.
  function jbNext() {
    const J = S.jb;
    if (J.wishes.length) {
      const w = J.wishes.shift();
      J.now = w.i != null ? { i: w.i, title: JULEMUSIK[w.i][0], id: JULEMUSIK[w.i][1], by: w.by } : { id: w.id, title: w.title, by: w.by };
    } else {
      const cur = J.now && J.now.i;
      let left = JULEMUSIK.map((x, k) => k).filter(k => !J.played.includes(k) && k !== cur);
      if (!left.length) { J.played = []; left = JULEMUSIK.map((x, k) => k).filter(k => k !== cur); }
      const i = left[crypto.randomInt(left.length)];
      J.now = { i, title: JULEMUSIK[i][0], id: JULEMUSIK[i][1], by: null };
    }
    if (J.now.i != null) J.played.push(J.now.i);
    J.n++;
    S.mode = 'jukebox';
    changed();
  }
  const found = new Map(); // spiller -> {id: titel} fra seneste søgning (kun dem må ønskes)
  function wish(tok, b) {
    const p = S.players[tok], J = S.jb;
    if (!p) return { error: 'Ukendt spiller – deltag igen.' };
    let w;
    if (b.id != null) {
      const id = String(b.id), title = (found.get(tok) || {})[id];
      if (!/^[\w-]{11}$/.test(id) || !title) return { error: 'Søg igen.' };
      w = { id, title, by: p.name };
    } else {
      const i = +b.i;
      if (!(i >= 0 && i < JULEMUSIK.length)) return { error: 'Ukendt sang.' };
      w = { i, by: p.name };
    }
    const key = x => x.i != null ? JULEMUSIK[x.i][1] : x.id;
    if (J.wishes.some(x => key(x) === key(w)) || (J.now && J.now.id === key(w))) return { error: 'Den er allerede ønsket.' };
    if (J.wishes.filter(x => x.by === p.name).length >= 2) return { error: 'Du har allerede to ønsker i køen.' };
    J.wishes.push(w);
    changed();
    return { ok: true };
  }
  // YouTube-søgning til ønskekoncerten (samme side som youtube.com viser – ingen nøgle)
  const lastSearch = new Map();
  async function ytSearch(tok, q) {
    if (!S.players[tok]) return { error: 'Ukendt spiller – deltag igen.' };
    q = String(q || '').trim().slice(0, 80);
    if (q.length < 2) return { results: [] };
    if (Date.now() - (lastSearch.get(tok) || 0) < 1500 || !searchRoom()) return { error: 'Lige et øjeblik …' };
    lastSearch.set(tok, Date.now());
    try {
      const r = await fetch('https://www.youtube.com/results?hl=da&gl=DK&search_query=' + encodeURIComponent(q), { headers: { 'Accept-Language': 'da,en', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130 Safari/537.36' }, signal: AbortSignal.timeout(8000) });
      const m = (await r.text()).match(/var ytInitialData = (\{.*?\});<\/script>/s);
      if (!m) return { error: 'YouTube svarede ikke – prøv igen.' };
      const out = [];
      const walk = o => {
        if (!o || typeof o !== 'object' || out.length >= 8) return;
        if (o.videoRenderer) {
          const v = o.videoRenderer, len = v.lengthText && v.lengthText.simpleText.replace(/\./g, ':'); // dansk: 2.56
          const secs = len ? len.split(':').reduce((a, x) => a * 60 + +x, 0) : 0;
          if (secs > 30 && secs <= 15 * 60) out.push({ id: v.videoId, title: ((v.title && v.title.runs && v.title.runs[0].text) || '').slice(0, 100), channel: (v.ownerText && v.ownerText.runs && v.ownerText.runs[0].text) || '', len });
          return;
        }
        for (const k in o) walk(o[k]);
      };
      walk(JSON.parse(m[1]));
      found.set(tok, Object.fromEntries(out.map(x => [x.id, x.title])));
      return { results: out };
    } catch { return { error: 'YouTube svarede ikke – prøv igen.' }; }
  }
  function jbView() {
    const J = S.jb, c = J.now;
    return { n: J.n, cur: c ? { i: c.i, title: c.title, id: c.id, by: c.by || null } : null, queue: J.wishes.map(w => ({ title: w.i != null ? JULEMUSIK[w.i][0] : w.title, by: w.by })), songs: JULEMUSIK.map(x => x[0]) };
  }

  // ---- stilling ----
  function board() {
    const ps = Object.entries(S.players).map(([tok, p]) => ({ id: tok.slice(0, 8), name: p.name, team: p.team, score: p.score, right: p.right || {}, pts: p.pts || {} })).sort((a, b) => b.score - a.score);
    const teams = S.teams.map(name => {
      const m = ps.filter(p => p.team === name);
      return { name, members: m.length, score: m.length ? Math.round(m.reduce((s, p) => s + p.score, 0) / m.length) : 0 };
    }).sort((a, b) => b.score - a.score);
    return { players: ps, teams };
  }

  // ---- visning: tv'et får det hele, telefonerne kun det, de må se ----
  function view(role, tok) {
    const z = S.quiz, out = { v: S.v, now: Date.now(), navn: S.navn, mode: S.mode, teams: S.teams, guests: S.guests, taken: Object.values(S.players).map(p => p.name), count: Object.keys(S.players).length, recap: S.mode === 'score' && S.recap && S.recap.until > Date.now() ? { kind: S.recap.kind, until: S.recap.until, asked: (S.used[S.recap.kind] || []).length, tips: S.recap.tips || [] } : null, skaal: S.skaal ? { until: S.skaal.until } : null, snaps: S.snaps ? { until: S.snaps.until } : null, pina: S.pina ? { until: S.pina.until } : null };
    if (z && S.mode === z.kind) {
      out.quiz = { kind: z.kind, n: z.n, phase: z.phase, deadline: z.deadline, limit: LIMIT[z.kind], options: z.q.options, answered: Object.keys(z.answers).length };
      if (z.kind === 'emoji') out.quiz.emoji = z.q.emoji;
      if (z.q.text) out.quiz.text = z.q.text; // citatet, navnet eller teksten til billedet står også på telefonen
      if (z.phase === 'reveal') {
        out.quiz.answer = z.q.answer; out.quiz.title = z.q.title; out.quiz.more = z.q.more;
        out.quiz.right = Object.entries(z.answers).filter(([, a]) => a.points > 0).sort((a, b) => a[1].ms - b[1].ms).map(([t]) => S.players[t] && S.players[t].name).filter(Boolean);
      }
    }
    if (S.tips.questions.length) out.tips = tipsView(role, tok);
    out.jb = jbView();
    if (S.mode === 'pak' && S.pak) out.pak = { phase: pakPhase(), started: S.pak.started };
    if (S.mode === 'score' || role !== 'player') out.board = board();
    if (role === 'player') {
      const p = S.players[tok];
      out.me = p ? { name: p.name, team: p.team, score: p.score, answer: z && z.answers[tok] ? z.answers[tok].c : null, points: z && z.answers[tok] ? z.answers[tok].points : null } : null;
      if (p && S.mode !== 'score') out.board = { players: board().players.map((x, i) => ({ ...x, i })).filter(x => x.name === p.name) };
      return out;
    }
    // tv og vært
    out.code = S.code;
    if (z && S.mode === z.kind) Object.assign(out.quiz, { polka: z.q.polka, original: z.q.original, start: z.q.start, img: z.q.img, credit: z.q.credit, audio: z.q.audio, title: z.q.title, more: z.q.more, answer: z.q.answer, waiting: Object.entries(S.players).filter(([t]) => !z.answers[t]).map(([, p]) => p.name) });
    out.ad = SKAAL_AD;
    const T = S.tips.questions;
    out.done = { ...S.done, tips: T.length > 0 && T.every(x => x.revealed) };
    const pg = out.progress = { ...Object.fromEntries(KINDS.map(k => [k, progress(k)])), tips: [T.filter(x => x.revealed).length, T.length] };
    out.pics = pictures().length;
    out.faces = faces().length;
    if (role === 'host') {
      out.autoSkaal = S.autoSkaal; out.nextSkaal = S.nextSkaal; out.autoSnaps = S.autoSnaps; out.nextSnaps = S.nextSnaps; out.plan = S.plan;
      out.left = Object.fromEntries(KINDS.map(k => [k, pg[k][1] - pg[k][0]]));
      out.tpl = KUPON;
      out.opt = S.opt;
      if (S.pak) out.pakInfo = { phase: pakPhase(), end: S.pak.end || null };
    }
    return out;
  }

  // ---- spillere ----
  const joins = new Map(); // ip -> [tider]
  function join(b, ip) {
    if (joins.size > 5000) joins.clear();
    const l = (joins.get(ip) || []).filter(t => Date.now() - t < 60e3);
    if (l.length > 20) return { error: 'For mange forsøg – vent et minut.' };
    l.push(Date.now()); joins.set(ip, l);
    if (String(b.code || '').toUpperCase() !== S.code) return { error: 'Forkert kode – scan QR-koden på tv\'et igen.' };
    const name = clean(b.name, 20);
    if (name.length < 1) return { error: 'Skriv dit navn.' };
    const team = S.teams.includes(b.team) ? b.team : (S.teams.length ? null : '');
    if (team === null) return { error: 'Vælg et hold.' };
    // samme navn igen (fx ny telefon eller ryddet browser): overtag spilleren
    let tok = b.token && S.players[b.token] ? b.token : Object.keys(S.players).find(t => S.players[t].name.toLowerCase() === name.toLowerCase());
    if (!tok) { if (Object.keys(S.players).length >= 40) return { error: 'Der er fuldt.' }; tok = crypto.randomBytes(16).toString('hex'); S.players[tok] = { name, team, score: 0, joined: Date.now() }; }
    else { S.players[tok].name = name; S.players[tok].team = team; }
    changed();
    return { ok: true, token: tok, code: S.code };
  }

  // ---- værten ----
  // afkrydsning: en quiz er klaret, når I går videre til noget andet efter at have spillet den
  function host(b) {
    b = b || {};
    const prev = S.mode, r = doHost(b);
    if (prev !== S.mode) {
      const played = KINDS.includes(prev) && (S.used[prev] || []).length > 0;
      if (played) S.done[prev] = true;
      // fra en quiz til stillingen: først quizzens eget resultat (rigtige og point i den), derefter den samlede stilling
      const ticked = played ? tipsAuto(prev) : []; // julekuponens væddemål om quizzen krydses af
      const recap = played && S.mode === 'score' ? { kind: prev, until: Date.now() + RECAP_MS, tips: ticked } : null;
      if (played || S.recap || recap) { S.recap = recap; changed(); }
    } else if (b.action === 'score' && S.recap) { S.recap = null; changed(); } // "Stillingen" igen: spring til den samlede stilling
    return r;
  }
  function doHost(b) {
    const a = String(b.action || '');
    switch (a) {
      case 'lobby': case 'score': S.mode = a; changed(); break;
      case 'music': case 'photo': case 'emoji': case 'pagne': case 'face': case 'pony': {
        const e = startQuiz(a);
        if (!e) break;
        // "Næste" efter quizzens sidste spørgsmål: quizzen er slut, så vis resultatet
        const pg = progress(a);
        if (S.mode === a && S.quiz && S.quiz.kind === a && S.quiz.phase === 'reveal' && pg[1] > 0 && pg[0] >= pg[1]) { S.mode = 'score'; changed(); break; }
        return { error: e };
      }
      case 'reveal': reveal(); break;
      case 'tipsSet': tipsSet(b.questions); break;
      case 'tipsOpen': S.tips.open = !!b.on; changed(); break;
      case 'tipsReveal': { const e = tipsReveal(+b.i); if (e) return { error: e }; break; }
      case 'tips': S.mode = 'tips'; changed(); break;
      case 'guests': S.guests = (Array.isArray(b.guests) ? b.guests : []).map(x => clean(x, 20)).filter(Boolean).slice(0, 40); changed(); break;
      // festens navn på velkomstskærmen
      case 'navn': S.navn = clean(b.navn, 40) || 'Julefrokost'; changed(); break;
      case 'opt': S.opt = { ...S.opt, std: !!b.std }; forget(); changed(); break; // de medfølgende billeder til og fra
      case 'pak': startPak(); break;
      case 'pakSteal': pakSteal(); break;
      case 'pakstop': S.pak = null; S.mode = 'score'; changed(); break;
      case 'skaal': skaal(); break;
      case 'autoskaal': S.autoSkaal = !!b.on; planSkaal(); changed(); break;
      // hvor tit: skål mellem to minuttal, snapsealarm ca. hvert N. minut
      case 'plan': {
        const n = (v, d) => { v = Math.round(+v); return v >= 1 && v <= 600 ? v : d; };
        const lo = n(b.skaalMin, S.plan.skaalMin), hi = n(b.skaalMax, S.plan.skaalMax);
        S.plan = { skaalMin: Math.min(lo, hi), skaalMax: Math.max(lo, hi), snapsEvery: n(b.snapsEvery, S.plan.snapsEvery) };
        planSkaal(); planSnaps(true); changed(); break;
      }
      // hvornår: næste skål eller snapsealarm på et bestemt klokkeslæt (derefter igen efter planen)
      case 'skaalAt': { const t = clockTime(b); if (!t) return { error: 'Skriv et klokkeslæt.' }; S.autoSkaal = true; S.nextSkaal = t; S.skaalFixed = true; changed(); break; }
      case 'snapsAt': { const t = clockTime(b); if (!t) return { error: 'Skriv et klokkeslæt.' }; S.autoSnaps = true; S.nextSnaps = t; S.snapsFixed = true; changed(); break; }
      case 'snaps': snaps(); break;
      case 'pina': pina(); break;
      case 'pinaEnd': pinaEnd(); break;
      case 'jukebox': if (S.jb.now && S.mode !== 'jukebox') { S.mode = 'jukebox'; changed(); } else jbNext(); break; // tilbage til julemusik: samme sang fortsætter
      case 'jbNext': jbNext(); break;
      case 'jbEnded': if (S.mode === 'jukebox' && +b.n === S.jb.n) jbNext(); break;
      case 'autosnaps': S.autoSnaps = !!b.on; planSnaps(true); changed(); break;
      case 'teams': {
        const t = (Array.isArray(b.teams) ? b.teams : []).map(x => clean(x, 20)).filter(Boolean).slice(0, 6);
        S.teams = t;
        for (const p of Object.values(S.players)) if (!t.includes(p.team)) p.team = t.length ? null : '';
        changed(); break;
      }
      case 'kick': { const tok = Object.keys(S.players).find(t => t.startsWith(String(b.id || '')) && b.id); if (tok) { delete S.players[tok]; changed(); } break; }
      case 'points': { const tok = Object.keys(S.players).find(t => t.startsWith(String(b.id || '')) && b.id); if (tok) { S.players[tok].score += Math.round(+b.points || 0); changed(); } break; }
      case 'resetScores': for (const p of Object.values(S.players)) { p.score = 0; p.right = {}; p.pts = {}; } changed(); break;
      case 'resetQuestions': S.used = noneUsed(); S.done = {}; changed(); break;
      case 'newGame': S = { ...S, code: newCode(), players: {}, tipsAns: {}, tips: { ...S.tips, open: true, shown: -1, questions: S.tips.questions.map(x => ({ ...x, revealed: false })) }, mode: 'lobby', quiz: null, recap: null, pak: null, skaal: null, snaps: null, pina: null, done: {}, used: noneUsed() }; found.clear(); changed(); break;
      case 'tv': if (!['pause', 'play', 'skip', 'vol', 'polka', 'say'].includes(b.cmd)) return { error: 'Ukendt' }; tvCmd(b.cmd, +b.arg || 0); break; // videresendes til tv-siden
      default: return { error: 'Ukendt handling' };
    }
    return { ok: true };
  }

  // tv-kommandoer fra værten (pause, +15 s, lydstyrke) – tv'et henter dem med sin tilstand
  let tvCmds = [], cmdN = Date.now(); // starter ved klokken, så numrene også stiger hen over en genstart af serveren
  function tvCmd(cmd, arg) { tvCmds.push({ n: ++cmdN, cmd, arg, at: Date.now() }); tvCmds = tvCmds.filter(c => Date.now() - c.at < 30e3); changed(); }
  function cmdsAfter(n) { return tvCmds.filter(c => c.n > n); }

  return { view, join, answer, tipsAnswer, wish, ytSearch, host, picFile, addPicture, removePicture, movePicture, listPictures, cmdsAfter, onChange, tick, flush, dispose, version: () => S.v, code: () => S.code, navn: () => S.navn, players: () => Object.keys(S.players).length };
}

module.exports = { createFest, randomCode, sniff, PAGNE };
