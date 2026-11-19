// Julefrokost – gæstens telefon: deltag med navn (+ hold), svar på quizzer, udfyld tipskuponen.
'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const JF = document.documentElement.dataset, API = JF.base + '/r/' + JF.rum + '/api/';
// det, telefonen husker (hvem man er), gemmes pr. fest
const store = { get: k => { try { return localStorage.getItem('jf_' + JF.rum + '_' + k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem('jf_' + JF.rum + '_' + k, v); } catch { } } };

let code = (new URLSearchParams(location.search).get('k') || store.get('code') || '').toUpperCase();
let token = store.get('token');
let st = null, tab = 'nu', err = '', pickedName = '', busy = false, ytQ = '', ytRes = null, shown = null, fails = 0, gone = false;

async function api(p, b, signal) {
  const r = await fetch(API + p, b ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) } : { cache: 'no-store', signal });
  if (r.status === 404) { gone = true; render(); throw new Error('gone'); } // festen er slettet
  return r.json();
}

// ny tilstand fra serveren
let build = JF.build || '', recapEnd = 0, recapT = null;
function take(s) {
  // serveren sender klientfilernes version med: er den skiftet, siden siden blev åbnet, hentes den nye udgave
  if (s.build) { if (!build) build = s.build; else if (s.build !== build) return location.reload(); }
  // nyt spil (ny kode): start forfra
  if (token && !s.me) { token = null; store.set('token', ''); }
  // nyt spørgsmål eller ny leg: tilbage til "Nu"
  if (st && (s.mode !== st.mode || (s.quiz && (!st.quiz || s.quiz.n !== st.quiz.n)))) tab = 'nu';
  if (!st && s.me && s.mode === 'lobby' && s.tips && s.tips.open && Object.keys(s.tips.mine || {}).length < s.tips.count) tab = 'tips';
  st = s;
  // quizzens eget resultat vises et øjeblik, før den samlede stilling (tiden regnes efter serverens ur)
  clearTimeout(recapT); recapEnd = s.recap ? Date.now() + (s.recap.until - s.now) : 0;
  if (recapEnd > Date.now()) recapT = setTimeout(render, recapEnd - Date.now() + 100);
  // mens man skriver (navn, søgning), tegnes der ikke om – det sker, når feltet forlades
  const typing = document.activeElement && /INPUT|SELECT/.test(document.activeElement.tagName);
  if (!typing) render();
}

// Lang-polling: serveren svarer først, når noget er ændret (eller efter 25 s). Telefonen reagerer med det samme på et nyt
// spørgsmål, og der bruges næsten ingen data, mens man venter.
async function poll() {
  const t0 = Date.now();
  const ctl = new AbortController(), giveUp = setTimeout(() => ctl.abort(), 40e3); // død forbindelse: prøv igen
  try {
    const tk = token || '', s = await api('state?t=' + encodeURIComponent(tk) + (st ? '&v=' + st.v : ''), null, ctl.signal);
    if (tk === (token || '')) take(s); // deltog man, mens kaldet ventede, gælder svaret den gamle (tomme) spiller – drop det
    fails = 0;
  } catch { fails++; }
  clearTimeout(giveUp);
  if (!gone) setTimeout(poll, fails ? Math.min(8000, 1000 * fails) : Math.max(0, 250 - (Date.now() - t0)));
}
document.addEventListener('focusout', () => setTimeout(() => { if (st) render(); }, 200));

function render() {
  const h = html();
  // kun ved ændringer: ellers kan et tryk gå tabt, fordi knappen blev skiftet ud under fingeren
  if (h === shown) return;
  // det, man er ved at skrive eller har valgt, overlever omtegningen
  const keep = ['name', 'code', 'team', 'ytq'].map(id => [id, ($('#' + id) || {}).value]);
  shown = h; $('#app').innerHTML = h;
  for (const [id, v] of keep) { const el = $('#' + id); if (el && v && !el.value) el.value = v; }
}
function html() {
  if (gone) return `<h1 class="c">Festen er slut</h1><p class="big">Den her fest findes ikke længere.</p><a class="btn alt" href="${JF.base}/">Til forsiden</a>`;
  if (!st) return '<h1 class="c">Julefrokost</h1>';
  if (!token || !st.me) return joinView();
  const me = st.me, rank = st.board && st.board.players[0] && st.board.players[0].i != null ? st.board.players[0].i + 1 : null;
  const ini = me.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const tipsOpen = st.tips && st.tips.count;
  let h = `<div class="top"><div class="me"><span class="av">${esc(ini)}</span><div><b>${esc(me.name)}</b><small>${rank && me.score ? `Nr. ${rank} · ` : ''}${Number(me.score).toLocaleString('da-DK')} point${me.team ? ' · ' + esc(me.team) : ''}</small></div></div>
    ${tipsOpen ? `<nav class="tabs" aria-label="Faner"><button class="${tab === 'nu' ? 'on' : ''}" data-tab="nu">Nu</button><button class="${tab === 'tips' ? 'on' : ''}" data-tab="tips">Kupon</button></nav>` : ''}</div>`;
  h += tab === 'tips' && tipsOpen ? tipsView() : nowView();
  if (st.skaal) h += `<div class="skaal">Skål!</div>`;
  if (st.snaps) h += `<div class="skaal" style="background:#7a0010">Snaps!</div>`;
  if (st.pina) h += `<div class="skaal" style="background:#c2702c">Piña colada!<small style="display:block;font-size:20px;font-style:normal;margin-top:10px">Opskriften står på tv'et</small></div>`;
  return h;
}

function joinView() {
  const taken = new Set((st.taken || []).map(n => n.toLowerCase()));
  const names = (st.guests || []).map(n => `<button class="btn alt name ${pickedName === n ? 'on' : ''}" data-name="${esc(n)}" ${taken.has(n.toLowerCase()) && pickedName !== n ? 'style="opacity:.45"' : ''}>${esc(n)}</button>`).join('');
  return `<div style="text-align:center;padding-top:10px"><div class="kick">Velkommen til</div><h1 class="c">${esc(st.navn)} ${new Date().getFullYear()}</h1></div>
    <p class="dim" style="text-align:center;margin:0">${names ? 'Tryk på dit navn' : 'Skriv dit navn for at være med'}</p>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}
    <div class="names2">${names}</div>
    <input id="name" placeholder="${names ? '… eller skriv et andet navn' : 'Dit navn'}" maxlength="20" value="${esc(pickedName && !(st.guests || []).includes(pickedName) ? pickedName : '')}" autocomplete="off">
    ${st.teams && st.teams.length ? `<select id="team"><option value="">Vælg hold …</option>${st.teams.map(t => `<option ${store.get('team') === t ? 'selected' : ''}>${esc(t)}</option>`).join('')}</select>` : ''}
    ${code ? '' : '<input id="code" placeholder="Kode fra tv\'et" maxlength="6" style="text-transform:uppercase">'}
    <button class="btn" id="join">Deltag</button>`;
}

// quizzerne: [overskrift over spørgsmålet, spørgsmålet]
const QUIZ = { music: ['Finsk polka · sang', 'Hvilken sang er det?'], photo: ['Hvornår var det nu det var? · billede', 'Hvilket år er billedet fra?'], emoji: ['Emoji-julefilm · film', 'Hvilken julefilm?'],
  pagne: ['Flaske eller frøken? · citat', 'Champagne eller eskortpige?'], face: ['Veer eller vellyst? · ansigt', 'Fødsel eller porno?'], pony: ['Pony eller pornostjerne? · navn', 'Pony eller pornostjerne?'] };
// musikønsker: søg på YouTube eller vælg en julesang. Ønskerne spilles, når julemusikken kører.
function wishHtml() {
  const j = st.jb; if (!j) return '';
  const queued = new Set(j.queue.map(q => q.title)), mine = j.queue.filter(q => st.me && q.by === st.me.name).length, now = j.cur && j.cur.title;
  return `<small class="dim">Du må have 2 ønsker i køen ad gangen${mine ? ` – du har ${mine}` : ''}</small>
      ${j.queue.length ? `<div class="card"><small class="dim">Ønskekøen</small>${j.queue.map(q => `<div>${esc(q.title)} <small class="dim">– ${esc(q.by)}</small></div>`).join('')}</div>` : ''}
      ${err ? `<div class="err">${esc(err)}</div>` : ''}
      <h3 style="margin:6px 0 0">Ønsk hvad som helst fra YouTube</h3>
      <form id="ytf" style="display:flex;gap:8px"><input id="ytq" placeholder="Kunstner eller sang" value="${esc(ytQ)}" autocomplete="off" enterkeyhint="search"><button class="btn" style="width:auto">Søg</button></form>
      ${ytRes ? (ytRes.length ? ytRes.map(r => `<div class="wish"><span>${esc(r.title)}<br><small class="dim">${esc(r.channel)} · ${esc(r.len)}</small></span><button data-ytwish="${esc(r.id)}">Ønsk</button></div>`).join('') : '<small class="dim">Ingen resultater.</small>') : ''}
      <h3 style="margin:10px 0 0">… eller vælg en julesang</h3>${j.songs.map((t, i) => `<div class="wish"><span>${esc(t)}</span>${t === now || queued.has(t) ? '<small class="dim">i køen</small>' : `<button data-wish="${i}">Ønsk</button>`}</div>`).join('')}`;
}
// på skærme uden et spørgsmål i gang (velkomst, stilling, pakkeleg, kuponen afsløres) kan man også ønske musik
const idleWish = () => st.jb && st.me ? `<div class="qhd" style="margin-top:22px;border-top:1px solid var(--line);padding-top:18px"><span class="kick">Julemusik</span><h1 style="font-size:26px">Ønsk en sang</h1><small class="dim">${st.jb.cur && st.mode === 'jukebox' ? '' : 'Ønskerne spilles, når julemusikken kører.'}</small></div>${wishHtml()}` : '';

function nowView() {
  const m = st.mode, z = st.quiz;
  if (z && QUIZ[m]) {
    const label = QUIZ[m][1], kick = QUIZ[m][0] + ' ' + z.n;
    const mine = st.me.answer;
    let h = `<div class="qhd"><span class="kick">${kick}</span><h1>${label}</h1>${z.phase === 'ask' && mine == null ? '<small class="dim">Jo hurtigere, jo flere point</small>' : ''}</div>`;
    if (z.text) h += m === 'pagne' ? `<p class="said">“${esc(z.text)}”</p>` : m === 'photo' ? `<p class="said">${esc(z.text)}</p>` : `<p class="said name">${esc(z.text)}</p>`;
    if (z.phase === 'ask' && mine == null) return h + `<div class="opts">${z.options.map((o, i) => `<button class="opt o${i}" data-c="${i}"><span class="sw">${SHAPE[i]}</span>${esc(o)}</button>`).join('')}</div>`;
    h += `<div class="opts">${z.options.map((o, i) => `<div class="opt o${i} ${mine === i ? 'picked' : 'dimmed'} ${z.phase === 'reveal' && z.answer === i ? 'right' : ''}"><span class="sw">${SHAPE[i]}</span>${esc(o)}</div>`).join('')}</div>`;
    if (z.phase === 'ask') return h + `<p class="big">Dit svar er låst – kig på tv'et.</p>`;
    const ok = mine === z.answer;
    if ((m === 'pagne' || m === 'photo') && z.title) h += `<p class="big">${m === 'photo' ? 'Det var i ' : ''}${esc(z.title)}</p>`;
    return h + `<div class="result ${ok ? 'ok' : 'no'}">${mine == null ? 'Du nåede ikke at svare' : ok ? `Rigtigt! +${st.me.points}` : 'Desværre – næste gang'}</div>`;
  }
  if (m === 'pak' && st.pak) {
    const t = { 1: ['Pakkeleg!', 'Slå en 6\'er og tag en gave fra bunken.'], 2: ['Nu må I stjæle!', 'Slå en 6\'er og stjæl en gave fra de andre.'], 3: ['STOP!', 'Pakkelegen er slut – pak ud!'] }[st.pak.phase];
    return `<div class="qhd" style="text-align:center;padding-top:30px"><span class="kick">Pakkeleg</span><h1 class="c">${t[0]}</h1></div><p class="big">${t[1]}</p>` + idleWish();
  }
  if (m === 'jukebox' && st.jb && st.jb.cur) {
    const j = st.jb;
    return `<div class="qhd"><span class="kick">Julemusik</span><h1>Ønsk en sang</h1></div><div class="paper" style="padding:16px"><small style="color:var(--ink2)">Spiller nu</small><br><b style="font-size:18px">${esc(j.cur.title)}</b>${j.cur.by ? `<br><small class="dim">ønsket af ${esc(j.cur.by)}</small>` : ''}</div>${wishHtml()}`;
  }
  if (m === 'tips' && st.tips) return `<div class="qhd" style="text-align:center;padding-top:30px"><span class="kick">Julekuponen</span><h1 class="c">Svarene afsløres på tv'et</h1></div>` + (st.tips.count ? '<button class="btn alt" data-tab="tips">Se din kupon</button>' : '') + idleWish();
  if (m === 'score' && st.board) {
    const i = st.board.players.findIndex(p => p.name === st.me.name), me = st.board.players[i];
    // en quiz er lige sluttet: først ens eget resultat i den
    if (st.recap && recapEnd > Date.now() && me && QUIZ[st.recap.kind]) {
      const k = st.recap.kind, n = (me.right || {})[k] || 0;
      return `<div class="qhd" style="text-align:center;padding-top:30px"><span class="kick">${esc(QUIZ[k][0].split(' · ')[0])}</span><h1 class="c">Du havde <span class="gold">${n}</span> rigtige</h1></div><p class="big">af ${st.recap.asked} spørgsmål · ${Number((me.pts || {})[k] || 0).toLocaleString('da-DK')} point i denne quiz</p><p class="dim" style="text-align:center">Den samlede stilling kommer om lidt …</p>`;
    }
    return `<div class="qhd" style="text-align:center;padding-top:30px"><span class="kick">Stillingen</span><h1 class="c">Du er nr. <span class="gold">${i + 1}</span></h1></div><p class="big">af ${st.board.players.length} deltagere</p>` + idleWish();
  }
  const left = st.tips && st.tips.open ? st.tips.count - Object.keys(st.tips.mine || {}).length : 0;
  return `<div class="qhd" style="text-align:center;padding-top:30px"><span class="kick">Du er med</span><h1 class="c">Glædelig jul!</h1></div>` + (left > 0 ? `<p class="big">Start med at udfylde julekuponen – der mangler ${left}.</p><button class="btn" data-tab="tips">Udfyld julekuponen</button>` : `<p class="big">Kig på tv'et – næste leg starter snart.</p>`) + idleWish();
}

function tipsView() {
  const t = st.tips, mine = t.mine || {}, n = Object.keys(mine).length, all = t.questions.length;
  let h = `<div class="paper kup"><div class="kh"><b>JULEKUPONEN</b><small>Tip 13 · ${new Date().getFullYear()} · 300 point pr. rigtig</small></div>`;
  h += t.questions.map((q, i) => `<div class="tip"><div class="q"><i>${i + 1}</i><span>${esc(q.q)}</span></div><div class="row">${['1', 'X', '2'].map((l, c) => `<button data-tip="${i}" data-c="${c}" aria-pressed="${mine[i] === c}" class="${mine[i] === c ? 'on' : ''} ${q.answer === c ? 'right' : ''}" ${t.open && q.answer == null ? '' : 'disabled'}><b>${l}</b>${esc(q.opts[c])}</button>`).join('')}</div></div>`).join('');
  h += '</div>';
  h += `<div class="kfoot"><div class="l"><span>${n} af ${all} udfyldt</span><span>${t.open ? 'Kan rettes, til værten lukker' : 'Kuponerne er lukket'}</span></div><div class="prog"><i style="width:${all ? Math.round(n / all * 100) : 0}%"></i></div>
    ${t.open ? (n >= all ? `<button class="btn" data-tab="nu">Færdig – kuponen er afleveret</button>` : `<button class="btn alt" data-tab="nu">${all - n} mangler – fortsæt senere</button>`) : `<button class="btn alt" data-tab="nu">Tilbage</button>`}</div>`;
  return h;
}

document.addEventListener('click', async e => {
  const b = e.target.closest('button'); if (!b || busy) return;
  if (b.dataset.tab) { tab = b.dataset.tab; render(); scrollTo(0, 0); return; }
  if (b.dataset.name) { pickedName = b.dataset.name; const n = $('#name'); if (n) n.value = ''; render(); return; }
  if (b.id === 'join') {
    const typed = ($('#name') || {}).value || '';
    const name = typed.trim() || pickedName, team = ($('#team') || {}).value || '';
    if (!code) code = (($('#code') || {}).value || '').trim().toUpperCase();
    busy = true;
    const r = await api('join', { code, name, team, token }).catch(() => ({ error: 'Ingen forbindelse.' }));
    busy = false;
    if (r.error) { err = r.error; if (/kode/i.test(r.error)) code = ''; return render(); }
    token = r.token; code = r.code; err = ''; tab = 'tips'; // julekuponen udfyldes som det første
    store.set('token', token); store.set('code', code); if (team) store.set('team', team);
    history.replaceState(null, '', location.pathname);
    return poll1();
  }
  if (b.dataset.ytwish) {
    const r = await api('wish', { token, id: b.dataset.ytwish }).catch(() => ({ error: 'Ingen forbindelse.' }));
    err = r.error || ''; if (!r.error) { ytRes = null; ytQ = ''; const q = $('#ytq'); if (q) q.value = ''; if (navigator.vibrate) navigator.vibrate(40); }
    return poll1();
  }
  if (b.dataset.wish != null) {
    const r = await api('wish', { token, i: +b.dataset.wish }).catch(() => ({ error: 'Ingen forbindelse.' }));
    err = r.error || ''; return poll1();
  }
  if (b.dataset.tip != null) {
    const i = +b.dataset.tip, c = +b.dataset.c;
    st.tips.mine = { ...st.tips.mine, [i]: c }; render();
    const r = await api('tip', { token, i, c }).catch(() => ({ error: 'Ingen forbindelse – krydset blev ikke gemt. Prøv igen.' }));
    if (r.error) { alert(r.error); return poll1(); } // vis det, serveren faktisk har
    return;
  }
  if (b.dataset.c != null) {
    st.me.answer = +b.dataset.c; render();
    if (navigator.vibrate) navigator.vibrate(40);
    const r = await api('answer', { token, c: +b.dataset.c }).catch(() => ({ error: 1 }));
    if (r.error) poll1(); // svaret kom ikke igennem: vis knapperne igen
  }
});
document.addEventListener('submit', async e => {
  if (e.target.id !== 'ytf') return;
  e.preventDefault();
  ytQ = $('#ytq').value.trim(); if (!ytQ) return;
  document.activeElement && document.activeElement.blur();
  const r = await api('search', { token, q: ytQ }).catch(() => ({ error: 'Ingen forbindelse.' }));
  err = r.error || ''; ytRes = r.results || null; render();
});
async function poll1() { try { take(await api('state?t=' + encodeURIComponent(token || ''))); } catch { } render(); }

render();
poll();
