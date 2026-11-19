// Julefrokost – værtens fjernbetjening (telefon eller tablet): styr legene, julekuponen, hold og point, og læg gæster
// og billeder ind. Siden kræver festens værtskode (én gang pr. enhed).
'use strict';
const JF = document.documentElement.dataset, ROOM = JF.base + '/r/' + JF.rum + '/', API = ROOM + 'api/', IMG = ROOM + 'img/';
const mem = { get: k => { try { return localStorage.getItem('jf_' + JF.rum + '_' + k); } catch { return null; } }, set: (k, v) => { try { v == null ? localStorage.removeItem('jf_' + JF.rum + '_' + k) : localStorage.setItem('jf_' + JF.rum + '_' + k, v); } catch { } } };
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let st = null, editing = false, draft = null, fails = 0, build = JF.build || '', off = 0, looping = false;

async function api(p, b, signal) {
  const r = await fetch(API + p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : { cache: 'no-store', signal });
  if (r.status === 401) { loginView(); throw new Error('auth'); }
  if (r.status === 404) { st = null; $('#app').innerHTML = `<h1>Festen findes ikke længere</h1><p><a class="btn alt" href="${JF.base}/">Til forsiden</a></p>`; throw new Error('auth'); }
  return r.json();
}
// de fester, denne enhed er vært for (til forsiden): navn = tilføj/ret, null = fjern
function mine(navn) {
  try {
    const l = JSON.parse(localStorage.getItem('jf_mine') || '[]').filter(x => x.rum !== JF.rum);
    localStorage.setItem('jf_mine', JSON.stringify((navn == null ? l : [{ rum: JF.rum, navn }, ...l]).slice(0, 10)));
  } catch { }
}
// ---------- adgang: værtskoden skrives én gang pr. enhed (eller står efter # i linket fra forsiden) ----------
async function login(kode) {
  const r = await fetch(API + 'login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode }) }).then(x => x.json()).catch(() => ({ error: 'Ingen forbindelse til serveren.' }));
  if (r.error) return loginView(r.error);
  mem.set('kode', kode.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^(.{4})(.+)$/, '$1-$2'));
  $('#app').innerHTML = '<h1>🎄</h1>'; loop();
}
function loginView(err) {
  st = null;
  $('#app').innerHTML = `<h1>Vært</h1><p>Skriv festens værtskode – den fik du, da festen blev oprettet.</p>
    <form id="lf" class="row"><input id="lk" placeholder="Værtskode" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn">Log ind</button></form>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}<p><small>Er du gæst? <a href="${ROOM}">Gå til gæsternes side</a>.</small></p>`;
  $('#lf').onsubmit = e => { e.preventDefault(); login($('#lk').value); };
}
const act = async (action, extra) => { const r = await api('host', { action, ...extra }).catch(() => ({ error: 'Ingen forbindelse til serveren.' })); if (r.error) toast(r.error); return poll1(); };
function toast(t) { const d = document.createElement('div'); d.className = 'toast'; d.textContent = t; document.body.appendChild(d); setTimeout(() => d.remove(), 3500); }

// mens man skriver i et felt, tegnes der ikke om (kun tallene opdateres) – det sker, når feltet forlades
// serveren sender klientfilernes version med: er den skiftet, siden siden blev åbnet, hentes den nye udgave
let recapT = null;
const take = s => {
  if (s.build) { if (!build) build = s.build; else if (s.build !== build && !editing && !sending) return location.reload(); }
  off = s.now - Date.now();
  if (!st || st.navn !== s.navn) mine(s.navn); // forsiden på denne enhed viser et link tilbage til værtssiden
  st = s; editing ? liveBits() : render();
  // quizzens eget resultat står kun et øjeblik på tv'et: når tiden er gået, viser kortet igen "Stillingen"
  clearTimeout(recapT);
  if (s.recap) recapT = setTimeout(() => { if (st === s) { st = { ...s, recap: null }; if (!editing) render(); } }, Math.max(0, s.recap.until - s.now) + 150);
};
async function poll1() { try { take(await api('host')); } catch { } }
// Lang-polling: serveren svarer først, når noget er ændret (eller efter 25 s), så værtssiden følger med uden forsinkelse
async function loop(again) {
  if (looping && !again) return; // kun én løkke ad gangen (også efter et nyt login)
  looping = true;
  const t0 = Date.now();
  const ctl = new AbortController(), giveUp = setTimeout(() => ctl.abort(), 40e3); // død forbindelse: prøv igen
  try { take(await api('host' + (st ? '?v=' + st.v : ''), null, ctl.signal)); fails = 0; } catch (e) { clearTimeout(giveUp); if (e.message === 'auth') { looping = false; return; } fails++; }
  clearTimeout(giveUp);
  setTimeout(loop, fails ? Math.min(8000, 1000 * fails) : Math.max(0, 250 - (Date.now() - t0)), true);
}

const MODE = { jukebox: 'Julemusik', lobby: 'Velkomst (QR)', music: 'Finsk polka', photo: 'Hvornår var det nu det var?', emoji: 'Emoji-julefilm', pagne: 'Flaske eller frøken?', face: 'Veer eller vellyst?', pony: 'Pony eller pornostjerne?', pak: 'Pakkeleg', score: 'Stillingen', tips: 'Julekuponen' };

const openD = new Set(); // hvilke foldbare kort er åbne (overlever omtegning)
const TILES = [['tips', 'Kupon', 'Julekuponen på tv'], ['music', 'Quiz', 'Finsk polka'], ['photo', 'Quiz', 'Hvornår var det nu det var?'], ['emoji', 'Quiz', 'Emoji-julefilm'], ['pagne', 'Quiz', 'Flaske eller frøken?'], ['face', 'Quiz', 'Veer eller vellyst?'], ['pony', 'Quiz', 'Pony eller pornostjerne?'],
  ['pak', 'Leg', 'Pakkeleg'], ['jukebox', 'Musik', 'Julemusik og ønsker'], ['score', 'Visning', 'Stillingen'], ['lobby', 'Visning', 'Velkomst og QR']];
const UNIT = { music: 'sang', photo: 'billede', emoji: 'film', pagne: 'citat', face: 'ansigt', pony: 'navn' };
const RIGHT = [['music', 'M', 'finsk polka'], ['photo', 'B', 'billeder'], ['emoji', 'E', 'emoji'], ['pagne', 'F', 'flaske/frøken'], ['face', 'V', 'veer/vellyst'], ['pony', 'P', 'pony/porno']]; // rigtige svar pr. quiz

function nowCard(s) {
  const z = s.quiz, m = s.mode, q = z && m === z.kind;
  const pg = s.progress && s.progress[m];
  let title = MODE[m] || m, st2 = '', body = '', acts = '';
  if (q) {
    title += ` · ${UNIT[z.kind]} ${z.n}${pg && pg[1] ? ' af ' + pg[1] : ''}`;
    st2 = z.phase === 'ask' ? '<span id="ans"></span>' : 'Svaret er vist';
    // enten/eller-runderne: først hvilken af de to, så hvem eller hvad det var
    const ans = z.options.length === 2 && z.title !== z.options[z.answer] ? `${esc(z.options[z.answer])} – ${esc(z.title)}` : esc(z.title);
    body = `<div class="ans">${z.text ? `<small>${z.kind === 'pagne' ? '“' + esc(z.text) + '”' : esc(z.text)}</small><br>` : ''}Svar: <b>${ans}</b>${z.phase === 'ask' ? '<br><small id="wait"></small>' : ''}</div>`;
    acts = z.phase === 'ask'
      ? `<button class="btn" data-a="reveal" style="flex:2">${ICO.eye} Vis svaret</button><button class="btn soft" data-a="score">Til stillingen</button>`
      : `<button class="btn" data-a="${z.kind}" style="flex:2">Næste ${UNIT[z.kind]} ${ICO.next}</button><button class="btn out" data-a="score">Til stillingen</button>`;
    if (z.kind === 'pagne' && z.phase === 'ask') acts += `</div><div class="row"><button class="btn ctl" data-tv="say" style="flex:1">Læs citatet op igen</button>`;
    if (z.kind === 'music') acts += `</div><div class="row"><button class="btn ctl" data-tv="pause" aria-label="Pause">${ICO.pause}</button><button class="btn ctl" data-tv="play" aria-label="Afspil">${ICO.play}</button><button class="btn ctl" data-tv="skip" data-arg="15">+15 s</button><button class="btn ctl" data-tv="skip" data-arg="-10">−10 s</button><button class="btn ctl" data-tv="polka">Polkaen igen</button>`;
  } else if (m === 'jukebox' && s.jb && s.jb.cur) {
    st2 = '<span id="jbq"></span>';
    body = `<div class="ans">Spiller: <b>${esc(s.jb.cur.title)}</b>${s.jb.cur.by ? ` · ønsket af ${esc(s.jb.cur.by)}` : ''}</div>`;
    acts = `<button class="btn" data-a="jbNext" style="flex:2">${ICO.skip} Næste sang</button><button class="btn ctl" data-tv="pause" aria-label="Pause">${ICO.pause}</button><button class="btn ctl" data-tv="play" aria-label="Afspil">${ICO.play}</button><button class="btn ctl" data-tv="vol" data-arg="40">Lavere</button><button class="btn ctl" data-tv="vol" data-arg="100">Højere</button>`;
  } else if (m === 'pak' && s.pakInfo) {
    const ph = s.pakInfo.phase;
    st2 = ph === 1 ? 'Gaver fra bunken' : ph === 2 ? `Stopper hemmeligt kl. ${clock(s.pakInfo.end)}` : 'Slut!';
    acts = `${ph === 1 ? `<button class="btn" data-a="pakSteal" style="flex:2">${ICO.devil} Nu må I stjæle!</button>` : ''}<button class="btn out" data-a="pakstop">Afslut pakkelegen</button>`;
  } else if (m === 'score' && s.recap) {
    title = `${MODE[s.recap.kind] || 'Quiz'} · resultat`;
    st2 = 'Samlet stilling om lidt';
    body = `<div class="ans">Tv'et viser, hvor mange rigtige hver havde i quizzen. Bagefter kommer den samlede stilling af sig selv.${(s.recap.tips || []).map(t => `<br>Julekuponen: <b>${esc(t.name)}</b> er krydset af som vinder i væddemål ${t.n} – tryk <b>Vis resultat på tv</b> under Julekuponen, når I vil afsløre det.`).join('')}</div>`;
    acts = '<button class="btn" data-a="score" style="flex:2">Samlet stilling nu</button>';
  } else if (m === 'tips') {
    const t = s.tips || {};
    st2 = '<span class="kfilled"></span>';
    body = '<div class="ans">Vælg det rigtige bud under <b>Julekuponen</b> nedenfor og tryk <b>Vis resultat på tv</b>.</div>';
  } else if (m === 'lobby') {
    st2 = '<span class="cnt"></span> med på telefonen';
    body = '<div class="ans">Gæsterne scanner QR-koden og udfylder julekuponen.</div>';
  }
  return `<section class="paper now"><div class="t"><div><span class="kick">På skærmen nu</span><span class="title">${esc(title)}</span></div><span class="st">${st2}</span></div>${body}${acts ? `<div class="row">${acts}</div>` : ''}</section>`;
}

// Siden er delt i stykker, og kun de stykker, der faktisk er ændret, skiftes ud. Ellers kan et tryk gå tabt, fordi
// knappen blev skiftet ud under fingeren (der kommer en ny tilstand, hver gang en gæst svarer eller krydser af).
const PARTS = ['head', 'now', 'tiles', 'quick', 'autos', 'kupon', 'more', 'people'], drawn = {};
function render() {
  const s = st;
  const tiles = TILES.filter(([k]) => (k !== 'photo' || s.pics) && (k !== 'face' || s.faces)).map(([k, tag, name]) => {
    const now = s.mode === k, done = s.done && s.done[k], left = s.left && s.left[k] != null ? s.left[k] : null;
    return `<button class="tile ${now ? 'now' : ''} ${done ? 'done' : ''}" data-a="${k}"><span class="tg">${now ? 'I gang' : left != null ? `${tag} · ${left} tilbage` : tag}${done ? ICO.check : ''}</span><span class="nm">${esc(name)}</span></button>`;
  }).join('');
  const filled = new Set(((s.tips && s.tips.table) || []).filter(p => p.filled >= s.tips.count).map(p => p.name));
  const people = s.board.players.map((p, i) => `<div class="pl ${i === 0 && p.score ? 'first' : ''}"><div class="a"><div><b>${esc(p.name)}${p.team ? ` <small>${esc(p.team)}</small>` : ''}</b><small>rigtige ${RIGHT.map(r => r[1]).join('·')} ${RIGHT.map(r => p.right[r[0]] || 0).join('·')}</small></div>
    ${s.tips && s.tips.count ? `<span class="k ${filled.has(p.name) ? 'on' : ''}" title="Julekuponen">K</span>` : '<span></span>'}<span class="p">${p.score ? Number(p.score).toLocaleString('da-DK') : '–'}</span></div>
    <div class="x"><button data-pts="100" data-id="${p.id}">+100</button><button data-pts="-100" data-id="${p.id}">−100</button><button data-kick="${p.id}">Fjern</button></div></div>`).join('');
  const det = (id, title, inner) => `<details class="card" data-d="${id}"><summary>${title}</summary>${inner}</details>`;
  const part = {
    head: `<header class="hhead"><h1>Vært <small>${esc(s.navn)}</small></h1><div class="hstat"><span class="dot"></span><span>Kode <b>${esc(s.code)}</b> · <span class="cnt"></span> med</span><a class="btn alt" href="${ROOM}tv" target="_blank" rel="noopener">${ICO.tv} Åbn storskærm her</a><button class="btn alt" data-a="pairTv">Tilslut et tv</button></div></header>`,
    now: nowCard(s),
    tiles: `<h2 class="kick">Program</h2><div class="tiles">${tiles}</div>`,
    quick: `<div class="quick">
      <button class="qb gold" data-a="skaal"><b>Skål nu</b><span>${s.autoSkaal && s.nextSkaal ? `Næste tilfældige skål ca. kl. ${clock(s.nextSkaal)}` : 'Julebryg-jingle og SKÅL på tv'}</span></button>
      <button class="qb pina" data-a="${s.pina ? 'pinaEnd' : 'pina'}"><b>${s.pina ? 'Stop piña colada' : 'Piña colada-alarm'}</b><span>${s.pina ? 'Fjerner opskriften og stopper sangen' : 'Opskriften på tv\'et, mens hele sangen spiller'}</span></button>
      <button class="qb red" data-a="snaps"><b>Snapsealarm</b><span>${s.autoSnaps && s.nextSnaps ? `Automatisk ca. kl. ${clock(s.nextSnaps)}` : 'Flasker og snapsevise i ét minut'}</span></button>
      ${s.mode === 'pak' && s.pakInfo && s.pakInfo.phase === 1 ? `<button class="qb gold" data-a="pakSteal"><b>Nu må I stjæle!</b><span>Starter den skjulte nedtælling (2–12 min)</span></button>`
        : `<div class="mini"><div class="i"><small>Julemusik</small><b>${s.jb && s.jb.cur ? esc(s.jb.cur.title) : 'Ikke startet'}</b></div>${s.mode === 'jukebox' ? `<button class="rb" data-tv="pause" aria-label="Pause">${ICO.pause}</button><button class="rb" data-a="jbNext" aria-label="Næste sang">${ICO.skip}</button>` : `<button class="rb" data-a="jukebox" aria-label="Start julemusik">${ICO.play}</button>`}</div>`}
    </div>`,
    autos: (p => `<div class="autos">
      <div class="au"><label><input type="checkbox" id="auto" ${s.autoSkaal ? 'checked' : ''}> Tilfældige skål</label><span>hver <input type="number" id="skMin" min="1" max="600" inputmode="numeric" value="${p.skaalMin}">–<input type="number" id="skMax" min="1" max="600" inputmode="numeric" value="${p.skaalMax}"> min.</span><span>næste kl. <input type="time" id="skAt" value="${s.autoSkaal && s.nextSkaal ? hhmm(s.nextSkaal) : ''}"></span></div>
      <div class="au"><label><input type="checkbox" id="autosnaps" ${s.autoSnaps ? 'checked' : ''}> Snapsealarm</label><span>ca. hver <input type="number" id="snEvery" min="1" max="600" inputmode="numeric" value="${p.snapsEvery}"> min.</span><span>næste kl. <input type="time" id="snAt" value="${s.autoSnaps && s.nextSnaps ? hhmm(s.nextSnaps) : ''}"></span></div>
      <small>Sæt flueben for at slå dem til. Minutterne bestemmer, hvor tit de kommer. Vil du have den næste på et bestemt tidspunkt, så vælg klokkeslættet – derefter følger de igen minutterne.</small></div>`)(s.plan || { skaalMin: 12, skaalMax: 28, snapsEvery: 60 }),
    kupon: tipsCard(),
    more: `${det('pak', 'Om pakkelegen', '<small>Start pakkelegen fra programmet. Først tager I fra bunken, så længe I vil. Når du trykker "Nu må I stjæle!", starter en skjult nedtælling på 2–12 minutter. Tv\'et viser ingen tid, og til sidst lyder alarmen.</small>')}
    ${det('hold', 'Hold', `<input id="teams" value="${esc(s.teams.join(', '))}" placeholder="Tomt = alle mod alle. Fx Nisserne, Rensdyrene, Englene">
      <div class="row" style="margin-top:8px"><button class="btn alt" data-a="saveTeams">Gem hold</button></div>
      <small>Med hold vælger man hold, når man deltager. Holdets point er gennemsnittet pr. deltager, så små hold ikke straffes.</small>`)}
    ${det('gaester', 'Gæster', `<input id="guests" value="${esc(s.guests.join(', '))}" placeholder="Fx Anna, Bo, Carla, Dennis"><div class="row" style="margin-top:8px"><button class="btn alt" data-a="saveGuests">Gem gæster</button></div><small>Skriv navnene med komma imellem. De bliver til navneknapper, når man deltager, og bruges som bud på julekuponen.</small>`)}
    ${picsCard(s)}
    ${det('indst', 'Indstillinger', `<label><small>Festens navn (står på velkomstskærmen)</small><input id="navn" value="${esc(s.navn)}" maxlength="40"></label>
      <div class="row" style="margin-top:8px"><button class="btn alt" data-a="saveNavn">Gem navn</button></div>
      <div class="row" style="margin-top:14px"><button class="btn alt" data-a="resetScores" data-confirm="Nulstil alle point?">Nulstil point</button><button class="btn alt" data-a="resetQuestions" data-confirm="Må alle sange, film og billeder bruges igen?">Brug spørgsmål igen</button><button class="btn alt" data-a="newGame" data-confirm="Nyt spil? Alle skal deltage igen (ny kode).">Nyt spil</button></div>
      <h3 style="margin-top:18px">Adgang</h3>
      <p><small>Gæsterne: <b>${esc(s.site)}</b> og koden <b>${esc(s.code)}</b> – eller QR-koden på storskærmen.<br>
      Storskærm: knappen <b>Åbn storskærm her</b> øverst, hvis det er denne enhed, der er sat til tv'et. På et smart-tv åbner du <b>${esc(s.site)}/tv</b> i tv'ets browser og trykker <b>Tilslut et tv</b> her.<br>
      Værtssiden på en anden enhed: <b>${esc(s.site)}/r/${esc(s.rum)}/vaert</b> og værtskoden${mem.get('kode') ? ` <b>${esc(mem.get('kode'))}</b>` : ' (den du fik, da festen blev oprettet)'}.</small></p>
      <div class="row"><button class="btn alt" data-a="newKode" data-confirm="Ny værtskode? Den gamle holder op med at virke, og storskærmen skal tilsluttes igen.">Ny værtskode</button><button class="btn alt" data-a="logud">Log ud her</button><button class="btn alt" data-a="sletFest">Slet festen</button></div>
      <p><small><a href="${JF.base}/kilder" target="_blank" rel="noopener">Billedkilder og licenser</a></small></p>`)}`,
    people: `<div class="people"><div class="h"><h3>Deltagere</h3><small><span class="cnt"></span> med</small></div>
    <div class="leg">${RIGHT.map(r => `<span>${r[1]} = ${r[2]}</span>`).join('')}${s.tips && s.tips.count ? '<span>K = kupon udfyldt</span>' : ''}</div>
    ${people || '<small>Ingen endnu – vis QR-koden på tv\'et.</small>'}</div>`,
  };
  const app = $('#app');
  if (!app.querySelector('[data-s]')) {
    app.innerHTML = `<div data-s="head"></div><div class="hgrid"><main>${PARTS.slice(1, 7).map(k => `<div data-s="${k}"></div>`).join('')}</main><aside><div data-s="people"></div></aside></div>`;
    for (const k of PARTS) drawn[k] = null;
  }
  for (const k of PARTS) if (drawn[k] !== part[k]) { drawn[k] = part[k]; app.querySelector(`[data-s="${k}"]`).innerHTML = part[k]; }
  // åbne/lukkede kort sættes bagefter, så det at folde et kort ud ikke i sig selv får stykket skiftet ud (og det, man har skrevet, slettet)
  for (const d of app.querySelectorAll('details[data-d]')) { const o = openD.has(d.dataset.d); if (d.open !== o) d.open = o; }
  liveBits();
}
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.dataset || !d.dataset.d) return;
  d.open ? openD.add(d.dataset.d) : openD.delete(d.dataset.d);
  // billedkortet åbnes: hent listen over festens billeder (højst hvert tredje sekund – kortet åbnes også, når siden tegnes om)
  if (d.open && d.dataset.d === 'billeder' && !sending && Date.now() - picsAt > 3000) { picsAt = Date.now(); picsLoad(); }
}, true);
const clock = t => new Date(t).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
// klokkeslæt til et tidsfelt (TT:MM)
const hhmm = t => { const d = new Date(t); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };

function tipsCard() {
  const t = st.tips || { questions: [], open: true, count: 0 };
  const qs = draft || t.questions.map(q => ({ ...q }));
  return `<details class="card" data-d="kupon"><summary>Julekuponen (tip 13'er)</summary>
    <small>Hvert væddemål har tre bud: 1, X og 2. Gæsterne krydser af på telefonen. Når et væddemål er afgjort, vælger du det rigtige bud og trykker <b>Vis</b>, så kommer det på tv'et, og de rigtige får 300 point. Væddemål om, hvem der vinder en quiz, krydses af af sig selv, når quizzen slutter. <b>Tilfældige navne</b> sætter tre tilfældige gæster på hvert væddemål om personer – eller skriv selv navnene.</small>
    <datalist id="gl">${st.guests.map(g => `<option value="${esc(g)}">`).join('')}</datalist>
    <div id="tq">${qs.map((q, i) => `<div class="tq" data-i="${i}">
      <div class="row"><b style="flex:0 0 28px">${i + 1}.</b><input data-f="q" value="${esc(q.q)}" placeholder="Væddemålet, fx Hvem går sidst hjem?"></div>
      <div class="o">${['1', 'X', '2'].map((l, c) => `<label><input type="radio" name="r${i}" value="${c}" ${q.answer === c ? 'checked' : ''}><b>${l}</b><input data-o="${c}" list="gl" value="${esc((q.opts || [])[c] || '')}" style="padding:8px"></label>`).join('')}</div>
      ${t.questions[i] ? `<div class="row"><button class="btn ${t.questions[i].revealed ? 'alt' : ''}" data-reveal="${i}">${t.questions[i].revealed ? 'Vis igen' : 'Vis resultat på tv'}</button><button class="btn alt" data-del="${i}" style="flex:0 0 auto;width:auto">✕</button></div>` : `<div class="row"><button class="btn alt" data-del="${i}">Fjern</button></div>`}
    </div>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn alt" data-a="tipsAdd">+ Væddemål</button><button class="btn alt" data-a="tipsTpl">Forslag til kupon</button><button class="btn alt" data-a="tipsRandom">Tilfældige navne</button><button class="btn" data-a="tipsSave">Gem kuponen</button></div>
    <div class="row" style="margin-top:8px"><button class="btn alt" data-a="tipsToggle">${t.open ? 'Luk kuponerne' : 'Åbn kuponerne igen'}</button></div>
    <small>Gem kuponen, før gæsterne begynder at krydse af – rækkefølgen må ikke ændres bagefter.</small>
    ${t.count ? '<br><small><span class="kfilled"></span>.</small>' : ''}</details>`;
}

function readDraft() {
  return [...document.querySelectorAll('#tq .tq')].map(el => {
    const r = el.querySelector('input[type=radio]:checked');
    return { q: el.querySelector('[data-f="q"]').value, opts: [0, 1, 2].map(c => el.querySelector(`[data-o="${c}"]`).value), answer: r ? +r.value : null };
  });
}

// tal, der ændrer sig hele tiden, skrives direkte i deres felter (uden at skifte kortene ud)
function liveBits() {
  const z = st.quiz, t = st.tips || {}, q = st.jb ? st.jb.queue.length : 0;
  const set = (sel, text) => document.querySelectorAll(sel).forEach(el => { if (el.textContent !== text) el.textContent = text; });
  set('.cnt', String(st.count));
  set('.kfilled', `${t.filled || 0} har udfyldt hele kuponen`);
  set('#jbq', q ? `${q} ${q === 1 ? 'ønske' : 'ønsker'} i kø` : 'Ingen ønsker i kø');
  if (z) { set('#ans', `${z.answered} af ${st.count} har svaret`); set('#wait', z.waiting && z.waiting.length ? 'Mangler: ' + z.waiting.join(', ') : ''); }
}

document.addEventListener('focusin', e => { if (e.target.matches('input,select,textarea')) editing = true; });
document.addEventListener('focusout', () => setTimeout(() => { if (!document.activeElement || !document.activeElement.matches('input,select,textarea')) { editing = false; if (st) render(); } }, 300));
// et valgt klokkeslæt (TT:MM på værtens ur) regnet om til serverens ur – så passer det også, hvis serveren står i en anden tidszone
const atServer = hhmm => { const [h, m] = hhmm.split(':').map(Number), d = new Date(); d.setHours(h, m, 0, 0); return d.getTime() + (d.getTime() <= Date.now() ? 864e5 : 0) + off; };
document.addEventListener('change', e => {
  if (e.target.id === 'auto') act('autoskaal', { on: e.target.checked });
  if (e.target.id === 'autosnaps') act('autosnaps', { on: e.target.checked });
  // hvor tit og hvornår skål og snapsealarm kommer
  if (['skMin', 'skMax', 'snEvery'].includes(e.target.id)) act('plan', { skaalMin: $('#skMin').value, skaalMax: $('#skMax').value, snapsEvery: $('#snEvery').value });
  if (e.target.id === 'skAt' && e.target.value) act('skaalAt', { time: e.target.value, at: atServer(e.target.value) });
  if (e.target.id === 'snAt' && e.target.value) act('snapsAt', { time: e.target.value, at: atServer(e.target.value) });
  if (e.target.closest('#tq')) draft = readDraft();
  picsChange(e);
});
document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.confirm && !confirm(b.dataset.confirm)) return;
  const a = b.dataset.a;
  if (await picsClick(b)) return;
  if (b.dataset.tv) return api('host', { action: 'tv', cmd: b.dataset.tv, arg: +b.dataset.arg || 0 }).catch(() => toast('Ingen forbindelse til serveren.'));
  if (b.dataset.pts) return act('points', { id: b.dataset.id, points: +b.dataset.pts });
  if (b.dataset.kick) return confirm('Fjern deltageren?') && act('kick', { id: b.dataset.kick });
  if (b.dataset.reveal != null) {
    // gem først, så et nyvalgt resultat kommer med
    if (draft) { await api('host', { action: 'tipsSet', questions: readDraft() }); draft = null; }
    editing = false; return act('tipsReveal', { i: +b.dataset.reveal });
  }
  if (b.dataset.del != null) { draft = readDraft(); draft.splice(+b.dataset.del, 1); editing = true; return render(); }
  if (!a) return;
  if (a === 'pairTv') {
    // et tv uden tastatur: tv'et viser seks tal på <adressen>/tv, og de skrives her
    const k = prompt('Åbn ' + st.site + '/tv i tv\'ets browser.\nSkriv de seks tal, der står på tv\'et:');
    if (!k) return;
    const r = await api('par', { kode: k }).catch(() => ({ error: 'Ingen forbindelse til serveren.' }));
    return toast(r.error || 'Tv\'et er tilsluttet – det skifter til storskærmen om et øjeblik');
  }
  if (a === 'saveNavn') { editing = false; return act('navn', { navn: $('#navn').value }); }
  if (a === 'newKode') { const r = await api('kode', {}).catch(() => ({ error: 'Ingen forbindelse til serveren.' })); if (r.error) return toast(r.error); mem.set('kode', r.kode); alert('Ny værtskode: ' + r.kode + '\n\nSkriv den ned – den skal bruges på andre enheder.'); return poll1(); }
  if (a === 'logud') { await api('logud', {}).catch(() => { }); mem.set('kode', null); mine(null); return loginView(); }
  if (a === 'sletFest') {
    if (prompt('Slet festen med alle billeder, point og indstillinger? Det kan ikke fortrydes.\nSkriv SLET for at bekræfte:') !== 'SLET') return;
    const r = await api('slet', { bekraeft: 'SLET' }).catch(() => ({ error: 'Ingen forbindelse til serveren.' }));
    if (r.error) return toast(r.error);
    mem.set('kode', null); mine(null); location.href = JF.base + '/'; return;
  }
  if (a === 'saveTeams') { editing = false; return act('teams', { teams: $('#teams').value.split(',').map(x => x.trim()).filter(Boolean) }); }
  if (a === 'saveGuests') { editing = false; return act('guests', { guests: $('#guests').value.split(',').map(x => x.trim()).filter(Boolean) }); }
  if (a === 'tipsAdd') { openD.add('kupon'); draft = (draft || readDraft()).concat({ q: '', opts: ['', '', ''], answer: null }); editing = true; return render(); }
  if (a === 'tipsTpl') {
    // forslaget: 13 væddemål. Dem om gæsterne får tre tilfældige navne fra gæstelisten (hvis den er skrevet)
    if ((st.tips && st.tips.count) && !confirm('Erstat kuponen med forslaget?')) return;
    draft = (st.tpl || []).map(([q, ...opts]) => ({ q, opts: opts.length ? opts : ['', '', ''], answer: null }));
    const n = randomNames();
    editing = true; toast(n ? 'Ret til, hvis du vil, og tryk Gem kuponen' : 'Skriv gæsterne under Gæster og tryk Tilfældige navne – eller skriv selv de tre bud'); return render();
  }
  if (a === 'tipsRandom') {
    if (namePool().length < 3) return toast('Der skal være mindst tre gæster – skriv dem under Gæster.');
    draft = draft || readDraft();
    const n = randomNames();
    editing = true; toast(n ? `${n} væddemål har fået tilfældige navne – ret til, og tryk Gem kuponen` : 'Ingen væddemål om personer at sætte navne på'); return render();
  }
  if (a === 'tipsSave') { const q = readDraft(); const bad = q.filter(x => !x.q.trim() || x.opts.some(o => !o.trim())).length; draft = null; editing = false; toast(bad ? bad + ' væddemål mangler tekst eller bud og blev ikke gemt' : 'Kuponen er gemt'); return act('tipsSet', { questions: q }); }
  if (a === 'tipsToggle') return act('tipsOpen', { on: !(st.tips && st.tips.open) });
  return act(a);
});

// tre tilfældige gæster på hvert væddemål om personer i kladden – navnene deles ud, så alle kommer med nogenlunde lige tit
const namePool = () => [...new Set([...(st.guests || []), ...st.board.players.map(p => p.name)])];
function randomNames() {
  const pool = namePool(), low = pool.map(x => x.toLowerCase());
  if (pool.length < 3) return 0;
  const mix = l => l.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
  const person = x => /^\s*(hvem|første|sidste)\b/i.test(x.q) || x.opts.every(o => !o.trim() || low.includes(o.trim().toLowerCase()));
  let deck = [], n = 0;
  const take = got => { let i = deck.findIndex(v => !got.includes(v)); if (i < 0) { deck = deck.concat(mix(pool)); i = deck.findIndex(v => !got.includes(v)); } return deck.splice(i, 1)[0]; };
  draft = draft.map(x => { if (!person(x)) return x; n++; const got = []; while (got.length < 3) got.push(take(got)); return { ...x, opts: got, answer: null }; });
  return n;
}

// ---------- billeder: egne billeder til årstalsquizzen og ansigter til "Veer eller vellyst?" ----------
// Billederne skaleres ned i browseren (højst 1920 px, JPEG), før de sendes: det går hurtigt, drejningen bliver rigtig, og
// kameraets oplysninger (fx hvor billedet er taget) følger ikke med.
let pics = null, picsAt = 0, sending = false, upN = 0;
const upP = [], upF = []; // valgt, men ikke lagt ind endnu: { id, file, url, aar } og { id, file, url, cat }
const YEAR = new Date().getFullYear();
async function picsLoad() { try { pics = await api('billeder'); picsAt = Date.now(); } catch { } if (st && !editing) render(); }
function picsCard(s) {
  // listen hentes, første gang kortet åbnes – og igen, når antallet af billeder på serveren har ændret sig
  if (openD.has('billeder') && !sending && (!pics || pics.egne.length + (pics.brugStd ? pics.std : 0) !== s.pics || pics.ansigter.length !== s.faces) && Date.now() - picsAt > 1500) { picsAt = Date.now(); picsLoad(); }
  const p = pics || { egne: [], ansigter: [], std: 0, brugStd: true, max: 300 };
  const thumb = f => `${IMG}${f.split('/').map(encodeURIComponent).join('/')}`;
  const years = [...new Set(p.egne.map(x => x.aar))];
  return `<details class="card" data-d="billeder"><summary>Billeder</summary>
    <h3>Hvornår var det nu det var?</h3>
    <small>Gæsterne gætter, hvilket år billedet er fra. Læg jeres egne billeder ind – fx fra tidligere fester – og vælg årstallet for hvert billede.</small>
    ${p.std ? `<label class="chk"><input type="checkbox" id="stdOn" ${p.brugStd ? 'checked' : ''}> Brug også de ${p.std} medfølgende billeder af kendte begivenheder <a href="${JF.base}/kilder" target="_blank" rel="noopener">(se dem)</a></label>` : ''}
    <div class="row" style="margin-top:8px"><label class="btn alt filebtn">Vælg billeder<input type="file" id="pf" accept="image/*" multiple hidden></label></div>
    ${upP.length ? `<div class="ups">${upP.map(u => `<div class="up"><img src="${u.url}" alt=""><label>År <input type="number" inputmode="numeric" min="1900" max="${YEAR}" value="${u.aar || ''}" data-upy="${u.id}"></label><button class="x" data-updel="${u.id}" aria-label="Fjern">✕</button></div>`).join('')}</div>
      <div class="row"><label style="flex:0 0 auto">Samme år på alle: <input type="number" inputmode="numeric" id="upAll" min="1900" max="${YEAR}" style="width:96px"></label><button class="btn" data-a="upSend" ${sending ? 'disabled' : ''}>${sending ? 'Lægger ind …' : `Læg ${upP.length} ${upP.length === 1 ? 'billede' : 'billeder'} ind`}</button></div>` : ''}
    ${p.egne.length ? `<p><small>${p.egne.length} egne billeder fra ${years.length} ${years.length === 1 ? 'år' : 'forskellige år'} (plads til ${p.max}). Ret årstallet i feltet, eller slet billedet.</small></p>
      <div class="pgrid">${p.egne.map(x => `<figure><img loading="lazy" src="${thumb(x.fil)}" alt=""><figcaption><input type="number" inputmode="numeric" min="1900" max="${YEAR}" value="${x.aar}" data-move="${esc(x.fil)}" aria-label="Årstal"><button class="x" data-pdel="${esc(x.fil)}" aria-label="Slet billedet">✕</button></figcaption></figure>`).join('')}</div>` : '<p><small>Ingen egne billeder endnu.</small></p>'}
    <h3 style="margin-top:18px">Veer eller vellyst?</h3>
    <small>Et ansigt på skærmen – er det fra en fødsel eller fra en pornofilm? Runden kommer først frem i programmet, når der ligger ansigter her. Vælg for hvert billede, hvad det er. Brug kun billeder, I har lov til at bruge.</small>
    <div class="row" style="margin-top:8px"><label class="btn alt filebtn">Vælg ansigter<input type="file" id="ff" accept="image/*" multiple hidden></label></div>
    ${upF.length ? `<div class="ups">${upF.map(u => `<div class="up"><img src="${u.url}" alt=""><select data-upc="${u.id}"><option value="">Vælg …</option><option value="foedsel" ${u.cat === 'foedsel' ? 'selected' : ''}>Fødsel</option><option value="porno" ${u.cat === 'porno' ? 'selected' : ''}>Porno</option></select><button class="x" data-updel="${u.id}" aria-label="Fjern">✕</button></div>`).join('')}</div>
      <div class="row"><button class="btn" data-a="upSendF" ${sending ? 'disabled' : ''}>${sending ? 'Lægger ind …' : `Læg ${upF.length} ${upF.length === 1 ? 'ansigt' : 'ansigter'} ind`}</button></div>` : ''}
    ${p.ansigter.length ? `<div class="pgrid">${p.ansigter.map(x => `<figure><img loading="lazy" src="${thumb(x.fil)}" alt=""><figcaption><span>${x.a ? 'Porno' : 'Fødsel'}</span><button class="x" data-pdel="${esc(x.fil)}" aria-label="Slet billedet">✕</button></figcaption></figure>`).join('')}</div>` : ''}
  </details>`;
}
// årstallet fra billedets egne oplysninger (EXIF: hvornår det er taget) – ellers filens dato
async function exifYear(file) {
  try {
    const b = new DataView(await file.slice(0, 262144).arrayBuffer());
    if (b.getUint16(0) !== 0xffd8) return 0;
    for (let o = 2; o + 12 < b.byteLength;) {
      const mk = b.getUint16(o), len = b.getUint16(o + 2);
      if ((mk & 0xff00) !== 0xff00) break;
      if (mk === 0xffe1 && b.getUint32(o + 4) === 0x45786966) {
        const t = o + 10, le = b.getUint16(t) === 0x4949, u16 = p => b.getUint16(p, le), u32 = p => b.getUint32(p, le);
        const str = (p, n) => { let s = ''; for (let i = 0; i < n && p + i < b.byteLength; i++) s += String.fromCharCode(b.getUint8(p + i)); return s; };
        const find = (p, tags) => { const out = {}, n = u16(p); for (let i = 0; i < n; i++) { const e = p + 2 + i * 12; if (tags.includes(u16(e))) out[u16(e)] = e; } return out; };
        const a = find(t + u32(t + 4), [0x8769, 0x0132]);
        let date = '';
        if (a[0x8769]) { const x = find(t + u32(a[0x8769] + 8), [0x9003, 0x9004]), e = x[0x9003] || x[0x9004]; if (e) date = str(t + u32(e + 8), 19); }
        if (!date && a[0x0132]) date = str(t + u32(a[0x0132] + 8), 19);
        const y = +date.slice(0, 4);
        return y >= 1900 && y <= YEAR ? y : 0;
      }
      o += 2 + len;
    }
  } catch { }
  return 0;
}
async function shrink(file) {
  let img, w, h;
  try { img = await createImageBitmap(file, { imageOrientation: 'from-image' }); w = img.width; h = img.height; }
  catch { img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = URL.createObjectURL(file); }); w = img.naturalWidth; h = img.naturalHeight; }
  const k = Math.min(1, 1920 / Math.max(w, h)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return new Promise((ok, no) => c.toBlob(b => b ? ok(b) : no(new Error('tom')), 'image/jpeg', .85));
}
async function picsChange(e) {
  const t = e.target;
  if (t.id === 'stdOn') { await api('host', { action: 'opt', std: t.checked }).catch(() => { }); pics = null; return poll1(); }
  if (t.id === 'pf' || t.id === 'ff') {
    const files = [...t.files].slice(0, 60);
    for (const file of files) {
      const u = { id: ++upN, file, url: URL.createObjectURL(file) };
      if (t.id === 'pf') { u.aar = (await exifYear(file)) || new Date(file.lastModified || Date.now()).getFullYear(); upP.push(u); } else { u.cat = ''; upF.push(u); }
    }
    t.value = ''; editing = false; return render();
  }
  if (t.dataset.upy) { const u = upP.find(x => x.id === +t.dataset.upy); if (u) u.aar = +t.value; return; }
  if (t.dataset.upc) { const u = upF.find(x => x.id === +t.dataset.upc); if (u) u.cat = t.value; return; }
  if (t.id === 'upAll' && +t.value) { for (const u of upP) u.aar = +t.value; editing = false; return render(); }
  if (t.dataset.move) { const r = await api('billeder', { flyt: t.dataset.move, aar: +t.value }).catch(() => ({ error: 'Ingen forbindelse til serveren.' })); if (r.error) toast(r.error); editing = false; return picsLoad(); }
}
// knapperne i billedkortet; svarer true, hvis trykket hørte til her
async function picsClick(b) {
  if (b.dataset.updel) { for (const l of [upP, upF]) { const i = l.findIndex(x => x.id === +b.dataset.updel); if (i >= 0) { URL.revokeObjectURL(l[i].url); l.splice(i, 1); } } render(); return true; }
  if (b.dataset.pdel) {
    if (!confirm('Slet billedet?')) return true;
    const r = await api('billeder', { slet: b.dataset.pdel }).catch(() => ({ error: 'Ingen forbindelse til serveren.' }));
    if (r.error) toast(r.error);
    await picsLoad(); return true;
  }
  const face = b.dataset.a === 'upSendF';
  if (b.dataset.a !== 'upSend' && !face) return false;
  const list = face ? upF : upP;
  if (sending || !list.length) return true;
  if (face ? list.some(u => !u.cat) : list.some(u => !(u.aar >= 1900 && u.aar <= YEAR))) { toast(face ? 'Vælg Fødsel eller Porno for hvert ansigt.' : 'Skriv et årstal (1900–' + YEAR + ') for hvert billede.'); return true; }
  sending = true; render();
  let ok = 0; const bad = [];
  for (const u of list.slice()) {
    try {
      const blob = await shrink(u.file);
      const r = await fetch(API + 'billede?' + (face ? 'ansigt=' + u.cat : 'aar=' + u.aar), { method: 'POST', headers: { 'Content-Type': 'image/jpeg', 'X-JF': '1' }, body: blob }).then(x => x.json());
      if (r.error) { bad.push(r.error); if (/plads|fylder/.test(r.error)) break; continue; }
      ok++; URL.revokeObjectURL(u.url); list.splice(list.indexOf(u), 1);
    } catch { bad.push('Et billede kunne ikke læses (prøv at gemme det som JPG).'); }
  }
  sending = false;
  toast(bad.length ? `${ok} lagt ind – ${bad.length} mislykkedes: ${bad[0]}` : `${ok} ${ok === 1 ? 'billede' : 'billeder'} lagt ind`);
  await picsLoad(); await poll1(); return true;
}

if (location.hash.length > 4) { const k = decodeURIComponent(location.hash.slice(1)); history.replaceState(null, '', location.pathname); login(k); }
else loop();

// iPad/telefon: hold skærmen tændt, mens værtssiden er åben
let lock = null;
async function awake() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch { } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) awake(); });
document.addEventListener('click', awake, { once: true });
awake();
