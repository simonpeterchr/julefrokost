#!/usr/bin/env node
// Afprøver en hel aften mod en frisk server med en tom datamappe:  node tools/proev.js
// Opretter en fest, logger ind, lader fire gæster deltage og spiller alt igennem (kupon, alle quizzer, julemusik med
// ønsker, skål, snapsealarm, piña colada, pakkeleg), lægger billeder ind, parrer en storskærm og sletter festen igen.
// Intet her kræver YouTube eller internet – selve afspilningen skal ses i en browser.
'use strict';
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const PORT = 20000 + Math.floor(Math.random() * 20000), URL0 = 'http://localhost:' + PORT;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'julefrokost-proeve-'));
let n = 0, bad = 0;
const ok = (cond, what) => { n++; if (!cond) { bad++; console.log('  ✗ ' + what); } else if (process.env.VIS) console.log('  ✓ ' + what); };
const wait = ms => new Promise(r => setTimeout(r, ms));
async function call(p, { body, cookie, raw, type, headers } = {}) {
  const r = await fetch(URL0 + p, { method: body !== undefined || raw ? 'POST' : 'GET', redirect: 'manual', headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(raw ? { 'Content-Type': type || 'image/jpeg', 'X-JF': '1' } : {}), ...(cookie ? { Cookie: cookie } : {}), ...headers }, body: raw || (body !== undefined ? JSON.stringify(body) : undefined) });
  const text = await r.text(); let j = null; try { j = JSON.parse(text); } catch { }
  return { status: r.status, j: j || {}, text, cookie: (r.headers.get('set-cookie') || '').split(';')[0], head: r.headers };
}
const jpeg = size => { const b = Buffer.alloc(size, 7); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; b[3] = 0xe0; return b; };

async function main() {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA, PUBLIC_URL: '', OPRET_KODE: '', BASE: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv.stdout.once('data', r));
  try {
    console.log('Forside og oprettelse');
    let r = await call('/'); ok(r.status === 200 && /start\.js/.test(r.text), 'forsiden svarer');
    ok(/default-src 'self'/.test(r.head.get('content-security-policy') || ''), 'siderne har indholdspolitik (CSP)');
    r = await call('/api/info'); ok(r.j.opretKode === false, 'alle må oprette en fest, når der ikke er sat en opret-kode');
    const std = r.j.std;
    r = await call('/api/opret', { body: { navn: 'Prøvefest' } });
    const rum = r.j.rum, kode = r.j.kode, R = '/r/' + rum + '/'; let vaert = r.cookie;
    ok(/^[a-z0-9]{5}$/.test(rum) && /^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(kode) && vaert, 'festen er oprettet med værtskode og adgang');
    ok(/HttpOnly/.test(r.head.get('set-cookie')) && new RegExp('Path=/r/' + rum).test(r.head.get('set-cookie')), 'adgangen gælder kun festens egne adresser');

    console.log('Adgang');
    for (const p of ['api/host', 'api/tv', 'api/billeder', 'img/std/x.jpg']) ok((await call(R + p)).status === 401, p + ' kræver værtskode');
    ok((await call(R + 'api/host', { body: { action: 'skaal' } })).status === 401, 'handlinger kræver værtskode');
    ok((await call(R + 'api/login', { body: { kode: 'AAAA-AAAA' } })).j.error, 'forkert værtskode afvises');
    r = await call(R + 'api/login', { body: { kode: kode.toLowerCase().replace('-', ' ') } }); ok(r.j.ok && r.cookie === vaert, 'rigtig værtskode (små bogstaver, mellemrum) giver adgang');
    ok((await call(R + 'api/host', { body: { action: 'skaal' }, cookie: vaert, headers: { Origin: 'https://ond.example' } })).status === 403, 'kald fra en fremmed side afvises');
    for (const p of ['img/../rum.json', 'img/%2e%2e/state.json', 'img/..%2f..%2fhemmelighed', 'img/std/../../server.js']) ok((await call(R + p, { cookie: vaert })).status === 404, 'ingen vej ud af billedmappen: ' + p);
    const H = (action, extra) => call(R + 'api/host', { body: { action, ...extra }, cookie: vaert }).then(x => x.j);
    const host = () => call(R + 'api/host', { cookie: vaert }).then(x => x.j);
    const tv = () => call(R + 'api/tv', { cookie: vaert }).then(x => x.j);

    console.log('Opsætning: gæster og kupon');
    let s = await host();
    ok(s.navn === 'Prøvefest' && s.guests.length === 0 && !s.tips, 'en ny fest er tom: ingen gæster og ingen kupon');
    ok(s.mode === 'lobby' && /^[A-Z]{4}$/.test(s.code) && s.join.endsWith('/r/' + rum + '?k='), 'velkomst med deltagerkode og link til QR-koden');
    ok(s.pics === std && s.faces === 0, 'billedquizzen har de medfølgende billeder (' + std + '), og der er ingen ansigter');
    await H('guests', { guests: ['Anna', 'Bo', 'Carla', 'Dennis'] });
    ok((await H('menu')).error, 'der er ingen menu-skærm i denne udgave');
    s = await host();
    const names = ['Anna', 'Bo', 'Carla', 'Dennis'];
    await H('tipsSet', { questions: s.tpl.map(([q, ...o], i) => ({ q, opts: o.length ? o : [names[i % 4], names[(i + 1) % 4], names[(i + 2) % 4]] })) });
    s = await host(); ok(s.tips.count === 13, 'julekuponen har 13 væddemål');

    console.log('Gæsterne deltager');
    ok((await call(R + 'api/join', { body: { code: 'XXXX', name: 'Snyder' } })).j.error, 'forkert deltagerkode afvises');
    const P = [];
    for (const name of names) { r = await call(R + 'api/join', { body: { code: s.code, name } }); ok(r.j.token, name + ' er med'); P.push(r.j.token); }
    ok((await call('/api/find?k=' + s.code)).j.rum === rum, 'forsiden finder festen ud fra koden på tv\'et');
    const me = i => call(R + 'api/state?t=' + P[i]).then(x => x.j);
    let m = await me(0);
    ok(m.me.name === 'Anna' && !m.code && !m.tpl && !m.progress, 'telefonen får sin egen tilstand – uden værtens oplysninger');
    for (let i = 0; i < 4; i++) for (let q = 0; q < 13; q++) await call(R + 'api/tip', { body: { token: P[i], i: q, c: (i + q) % 3 } });
    ok((await host()).tips.filled === 4, 'alle fire har udfyldt kuponen');

    console.log('Quizzer');
    const play = async (kind, rounds) => {
      for (let k = 0; k < rounds; k++) {
        const e = await H(kind); if (e.error) return e.error;
        const t = await tv(), z = t.quiz;
        ok(z && z.kind === kind && z.phase === 'ask' && z.options.length >= 2, kind + ': spørgsmål ' + (k + 1) + ' er på skærmen');
        const p0 = await me(0); ok(p0.quiz && p0.quiz.answer === undefined && p0.quiz.title === undefined && p0.quiz.img === undefined, kind + ': telefonen kender ikke svaret');
        if (z.img) { const im = await call(R + 'img/' + z.img, { cookie: vaert }); ok(im.status === 200 && /^image\//.test(im.head.get('content-type')), kind + ': billedet kan hentes af storskærmen'); ok((await call(R + 'img/' + z.img)).status === 401, kind + ': billedet kan ikke hentes uden adgang'); }
        // Anna og Bo svarer rigtigt, Carla forkert, Dennis svarer ikke
        await call(R + 'api/answer', { body: { token: P[0], c: z.answer } });
        await call(R + 'api/answer', { body: { token: P[1], c: z.answer } });
        await call(R + 'api/answer', { body: { token: P[2], c: (z.answer + 1) % z.options.length } });
        await H('reveal');
        const t2 = await tv(); ok(t2.quiz.phase === 'reveal' && t2.quiz.right.length === 2, kind + ': svaret er vist, to havde ret');
        const p1 = await me(0); ok(p1.me.points >= 500 && p1.quiz.answer === z.answer, kind + ': den hurtige får point og ser svaret');
      }
      await H('score');
      const t = await tv(); ok(t.mode === 'score' && t.recap && t.recap.kind === kind && t.recap.asked === rounds, kind + ': quizzens eget resultat vises før stillingen');
      await H('score'); ok(!(await tv()).recap, kind + ': derefter den samlede stilling');
      return null;
    };
    ok(!(await play('music', 2)), 'Finsk polka spillet');
    s = await host(); ok(s.done.music && s.left.music === 13, 'Finsk polka er krydset af, 13 sange tilbage');
    const pol = s.tips.questions.find(x => /Finsk polka/.test(x.q)); ok(pol.answer != null || !pol.opts.some(o => ['Anna', 'Bo'].includes(o)) || pol.opts.includes('Anna') && pol.opts.includes('Bo'), 'kuponens væddemål om Finsk polka er krydset af (når vinderen er entydig)');
    ok(!(await play('emoji', 2)), 'Emoji-julefilm spillet');
    ok(!(await play('pagne', 1)), 'Flaske eller frøken? spillet');
    ok(!(await play('pony', 1)), 'Pony eller pornostjerne? spillet');

    console.log('Billeder');
    ok((await H('face')).error, 'Veer eller vellyst? kan ikke startes uden ansigter');
    ok((await call(R + 'api/billede?aar=2019', { raw: jpeg(2000) })).status === 401, 'upload kræver værtskode');
    ok((await call(R + 'api/billede?aar=2019', { raw: Buffer.from('<html><script>alert(1)</script>'.padEnd(200)), cookie: vaert })).j.error, 'en fil, der ikke er et billede, afvises');
    ok((await call(R + 'api/billede?aar=1700', { raw: jpeg(2000), cookie: vaert })).j.error, 'et umuligt årstal afvises');
    ok((await call(R + 'api/billede?aar=2019', { raw: jpeg(5e6), cookie: vaert })).status === 413, 'et alt for stort billede afvises');
    const up = [];
    for (const y of [2018, 2019, 2019, 2021]) { r = await call(R + 'api/billede?aar=' + y, { raw: jpeg(3000 + y), cookie: vaert }); ok(r.j.ok && r.j.fil.startsWith(y + '/'), 'eget billede lagt ind under ' + y); up.push(r.j.fil); }
    r = await call(R + 'api/billeder', { cookie: vaert }); ok(r.j.egne.length === 4 && r.j.std === std, 'listen viser de fire egne billeder');
    r = await call(R + 'api/billeder', { body: { flyt: up[0], aar: 2020 }, cookie: vaert }); ok(r.j.fil && r.j.fil.startsWith('2020/'), 'årstallet kan rettes');
    ok((await call(R + 'api/billeder', { body: { slet: up[1] }, cookie: vaert })).j.ok, 'et billede kan slettes');
    ok((await call(R + 'api/billeder', { body: { slet: 'std/' + 'x.jpg' }, cookie: vaert })).j.error, 'de medfølgende billeder kan ikke slettes');
    await H('opt', { std: false });
    s = await host(); ok(s.pics === 3, 'med de medfølgende billeder slået fra er der kun de tre egne');
    ok(!(await play('photo', 3)), '"Hvornår var det nu det var?" spillet med egne billeder');
    ok(/brugt/.test(await play('photo', 1) || ''), 'når billederne er brugt, siger den til');
    if (std) {
      await H('opt', { std: true }); s = await host(); ok(s.pics === 3 + std, 'de medfølgende billeder slået til igen');
      await H('photo'); const z = (await tv()).quiz; ok(z.img.startsWith('std/') && z.text && z.credit && !new RegExp(z.title).test(z.text), 'medfølgende billede har tekst (uden årstal) og kildeangivelse');
      ok(z.options.every(o => Math.abs(+o - +z.title) <= 6 && +o <= new Date().getFullYear()), 'årstallene ligger tæt på det rigtige');
      await H('lobby');
    }
    ok((await call(R + 'api/billede?ansigt=foedsel', { raw: jpeg(3000), cookie: vaert })).j.ok && (await call(R + 'api/billede?ansigt=porno', { raw: jpeg(3100), cookie: vaert })).j.ok, 'to ansigter lagt ind');
    ok((await host()).faces === 2, 'Veer eller vellyst? er nu med i programmet');
    ok(!(await play('face', 2)), 'Veer eller vellyst? spillet');

    console.log('Julemusik, skål og alarmer');
    await H('jukebox'); let t = await tv(); ok(t.mode === 'jukebox' && t.jb.cur && /^[\w-]{11}$/.test(t.jb.cur.id), 'julemusikken spiller: ' + t.jb.cur.title);
    const other = t.jb.songs.findIndex(x => x !== t.jb.cur.title);
    ok((await call(R + 'api/wish', { body: { token: P[2], i: other } })).j.ok, 'Carla ønsker en sang');
    ok((await call(R + 'api/wish', { body: { token: P[3], i: other } })).j.error, 'samme sang kan ikke ønskes to gange');
    await H('jbEnded', { n: t.jb.n }); t = await tv(); ok(t.jb.cur.by === 'Carla', 'ønsket spilles som det næste');
    await H('skaal'); t = await tv(); ok(t.skaal && t.ad, 'skål på skærmen'); ok((await me(1)).skaal, 'skål på telefonerne');
    ok(!(await tv()).snaps && (await H('snaps')).ok && !(await tv()).snaps, 'snapsealarmen venter, mens der skåles');
    await wait(27e3); t = await tv(); ok(!t.skaal, 'skålen er slut efter 26 sekunder');
    await H('snaps'); ok((await tv()).snaps, 'snapsealarm');
    ok((await call(R + 'img/lyd/snaps.mp3', { cookie: vaert })).status === 404, 'ingen egen snapsevise: storskærmen bruger YouTube-udgaven');
    await H('pina'); ok(!(await tv()).pina, 'piña colada venter, mens snapsealarmen kører');
    await H('autoskaal', { on: true }); await H('autosnaps', { on: true }); await H('plan', { skaalMin: 5, skaalMax: 9, snapsEvery: 30 });
    s = await host(); ok(s.autoSkaal && s.nextSkaal > Date.now() && s.nextSnaps > Date.now() && s.plan.snapsEvery === 30, 'tilfældige skål og snapsealarm er planlagt');
    await H('skaalAt', { time: '23:59' }); ok(new Date((await host()).nextSkaal).getMinutes() === 59, 'næste skål på et valgt klokkeslæt');
    await H('autoskaal', { on: false }); await H('autosnaps', { on: false });

    console.log('Pakkeleg og kupon');
    await H('pak'); ok((await tv()).pak.phase === 1, 'pakkeleg: tag fra bunken');
    await H('pakSteal'); s = await host(); ok(s.pakInfo.phase === 2 && s.pakInfo.end - Date.now() > 110e3 && s.pakInfo.end - Date.now() < 13 * 60e3, 'nu må I stjæle: skjult nedtælling på 2–12 minutter');
    ok((await me(0)).pak.phase === 2 && !(await tv()).pakInfo, 'tv og telefoner kender ikke sluttiden');
    await H('pakstop');
    s = await host(); const qi = s.tips.questions.findIndex(x => /spildt/.test(x.q)), before = s.board.players.find(p => p.name === 'Anna').score;
    const qs = s.tips.questions.map(x => ({ ...x })); qs[qi].answer = (0 + qi) % 3; // Annas kryds
    await H('tipsSet', { questions: qs }); await H('tipsReveal', { i: qi });
    s = await host(); ok(s.board.players.find(p => p.name === 'Anna').score === before + 300 && !s.tips.open, 'kuponens resultat giver 300 point og lukker kuponerne');
    ok((await tv()).tips.right.includes('Anna'), 'storskærmen viser, hvem der havde ret');

    console.log('Storskærm uden tastatur (parring)');
    r = await call('/api/par', { body: {} }); const par = r.j; ok(/^\d{6}$/.test(par.kode), 'tv\'et får en parringskode');
    ok((await call('/api/par?kode=' + par.kode + '&noegle=' + par.noegle)).j.venter, 'tv\'et venter på værten');
    ok((await call('/api/par?kode=' + par.kode + '&noegle=forkert')).j.udloebet, 'koden kan ikke hentes af andre');
    ok((await call(R + 'api/par', { body: { kode: '000000' }, cookie: vaert })).j.error || par.kode === '000000', 'en forkert parringskode afvises');
    ok((await call(R + 'api/par', { body: { kode: par.kode.slice(0, 3) + ' ' + par.kode.slice(3) }, cookie: vaert })).j.ok, 'værten skriver koden');
    r = await call('/api/par?kode=' + par.kode + '&noegle=' + par.noegle); ok(r.j.rum === rum && r.cookie === vaert, 'tv\'et får adgang til festen');
    ok((await call(R + 'api/tv', { cookie: r.cookie })).status === 200, 'og kan vise storskærmen');

    console.log('Genstart, ny kode og sletning');
    r = await call(R + 'api/kode', { body: {}, cookie: vaert }); ok(r.j.kode && r.j.kode !== kode && r.cookie !== vaert, 'ny værtskode');
    ok((await call(R + 'api/host', { cookie: vaert })).status === 401, 'den gamle adgang virker ikke længere'); vaert = r.cookie;
    await wait(700); // tilstanden gemmes højst hvert halve sekund
    const saved = JSON.parse(fs.readFileSync(path.join(DATA, 'rum', rum, 'state.json'), 'utf8')); ok(Object.keys(saved.players).length === 4 && saved.navn === 'Prøvefest', 'tilstanden ligger i festens egen mappe');
    ok(fs.readdirSync(path.join(DATA, 'rum', rum, 'billeder')).length >= 3, 'billederne ligger i festens egen mappe');
    r = await call('/api/opret', { body: { navn: 'Naboens fest' } }); const rum2 = r.j.rum, v2 = r.cookie;
    ok((await call(R + 'api/host', { cookie: v2 })).status === 401, 'værten for én fest har ikke adgang til en anden');
    const s2 = (await call('/r/' + rum2 + '/api/host', { cookie: v2 })).j; ok(s2.count === 0 && s2.code !== saved.code && s2.pics === std, 'den anden fest er sin egen (egne gæster, kode og billeder)');
    await H('newGame'); s = await host(); ok(s.count === 0 && s.code !== saved.code && s.guests.length === 4 && s.tips.count === 13, 'nyt spil: ny kode og ingen deltagere, men gæsteliste og kupon består');
    ok((await call(R + 'api/slet', { body: { bekraeft: 'nej' }, cookie: vaert })).j.error, 'festen slettes kun med bekræftelse');
    ok((await call(R + 'api/slet', { body: { bekraeft: 'SLET' }, cookie: vaert })).j.ok && !fs.existsSync(path.join(DATA, 'rum', rum)), 'festen og dens billeder er slettet');
    ok((await call(R + 'api/state')).status === 404 && (await call(R, {})).status === 302, 'den slettede fest findes ikke mere');
    ok((await call('/r/' + rum2 + '/api/host', { cookie: v2 })).status === 200, 'den anden fest er uberørt');
  } finally { srv.kill(); await wait(200); fs.rmSync(DATA, { recursive: true, force: true }); }

  // samme server sat op som på et domæne: undermappe, opret-kode og https bag en proxy
  console.log('På et domæne (undermappe, opret-kode, proxy)');
  const DATA2 = fs.mkdtempSync(path.join(os.tmpdir(), 'julefrokost-proeve-'));
  // serveren har sine egne ansigter (data/ansigter): så har alle fester "Veer eller vellyst?" fra start
  for (const [d, n] of [['foedsel', 2], ['porno', 1]]) { fs.mkdirSync(path.join(DATA2, 'ansigter', d), { recursive: true }); for (let i = 0; i < n; i++) fs.writeFileSync(path.join(DATA2, 'ansigter', d, 'a' + i + '.jpg'), jpeg(2000)); }
  const srv2 = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT), DATA: DATA2, PUBLIC_URL: 'https://fest.example/jul', OPRET_KODE: 'kun-for-venner', TRUST_PROXY: '1', BASE: '' }, stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(r => srv2.stdout.once('data', r));
  try {
    const px = { 'X-Forwarded-Proto': 'https', 'CF-Connecting-IP': '203.0.113.7' };
    ok((await call('/')).status === 404, 'uden for undermappen findes intet');
    let r = await call('/jul/', { headers: px }); ok(r.status === 200 && /href="\/jul\/s\/[a-z0-9]+\/fest\.css"/.test(r.text), 'siderne henter deres filer fra undermappen');
    ok((await call('/jul/api/info')).j.opretKode === true, 'forsiden ved, at der kræves en kode for at oprette');
    ok((await call('/jul/api/opret', { body: { navn: 'X' }, headers: px })).j.error, 'ingen fest uden opret-koden');
    ok((await call('/jul/api/opret', { body: { navn: 'X', opretKode: 'forkert' }, headers: px })).j.error, 'ingen fest med forkert opret-kode');
    r = await call('/jul/api/opret', { body: { navn: 'Vennefest', opretKode: 'kun-for-venner' }, headers: px });
    ok(r.j.rum && /Path=\/jul\/r\//.test(r.head.get('set-cookie')) && /; Secure/.test(r.head.get('set-cookie')), 'med koden oprettes festen, og adgangen er bundet til undermappen og https');
    const s = (await call('/jul/r/' + r.j.rum + '/api/host', { cookie: r.cookie, headers: px })).j;
    ok(s.join === 'https://fest.example/jul/r/' + r.j.rum + '?k=' && s.site === 'fest.example/jul', 'QR-koden peger på den offentlige adresse');
    ok((await call('/jul/r/' + r.j.rum + '/api/host', { body: { action: 'skaal' }, cookie: r.cookie, headers: { ...px, Origin: 'https://fest.example' } })).j.ok, 'kald fra den offentlige adresse er i orden');
    const R2 = '/jul/r/' + r.j.rum + '/', H2 = (action, extra) => call(R2 + 'api/host', { body: { action, ...extra }, cookie: r.cookie, headers: px }).then(x => x.j);
    ok(s.faces === 3, 'serverens tre ansigter er med i en ny fest');
    let b = (await call(R2 + 'api/billeder', { cookie: r.cookie })).j; ok(b.srvAnsigter === 3 && b.brugAns && b.ansigter.length === 0, 'værtssiden ved, at de er serverens (ikke festens egne)');
    await wait(27e3); // skålen ovenfor skal være slut, før en quiz kan besvares
    await H2('face'); let z = (await call(R2 + 'api/tv', { cookie: r.cookie })).j.quiz;
    ok(z && z.img.startsWith('srv/') && (await call(R2 + 'img/' + z.img, { cookie: r.cookie })).status === 200, 'runden spiller med serverens ansigter');
    ok((await call(R2 + 'img/' + z.img)).status === 401 && (await call(R2 + 'img/srv/../hemmelighed', { cookie: r.cookie })).status === 404, 'serverens ansigter kræver værtsadgang, og der er ingen vej ud af mappen');
    ok((await call(R2 + 'api/billeder', { body: { slet: z.img }, cookie: r.cookie })).j.error && fs.readdirSync(path.join(DATA2, 'ansigter', 'foedsel')).length === 2, 'en fest kan ikke slette serverens ansigter');
    await H2('lobby'); await H2('opt', { ans: false });
    b = (await call(R2 + 'api/host', { cookie: r.cookie })).j; ok(b.faces === 0 && b.opt.std === true, 'festen kan slå serverens ansigter fra (uden at røre de medfølgende billeder)');
    await H2('opt', { ans: true });
    let blocked = false;
    for (let i = 0; i < 12 && !blocked; i++) blocked = (await call('/jul/api/opret', { body: { opretKode: 'gæt' + i }, headers: px })).status === 429;
    ok(blocked, 'gætteri på opret-koden spærres');
    ok(!(await call('/jul/api/opret', { body: { navn: 'Y', opretKode: 'kun-for-venner' }, headers: { ...px, 'CF-Connecting-IP': '203.0.113.8' } })).j.error, 'spærringen gælder kun den, der gættede');
    blocked = false;
    for (let i = 0; i < 12 && !blocked; i++) blocked = (await call('/jul/r/' + r.j.rum + '/api/login', { body: { kode: 'AAAA' + String(i).padStart(4, '2') }, headers: { ...px, 'CF-Connecting-IP': '203.0.113.9' } })).status === 429;
    ok(blocked, 'gætteri på værtskoden spærres');
  } finally { srv2.kill(); await wait(200); fs.rmSync(DATA2, { recursive: true, force: true }); }
  console.log(bad ? '\n' + bad + ' af ' + n + ' kontroller FEJLEDE' : '\nAlle ' + n + ' kontroller bestået');
  process.exit(bad ? 1 : 0);
}
main().catch(e => { console.error(e); process.exit(1); });
