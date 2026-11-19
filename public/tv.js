// Julefrokost – storskærmen (tv, projektor eller en bærbar på HDMI): QR til at deltage, quizzer med musik, billeder,
// pakkeleg og skål. Siden kræver værtens adgang (værtskode eller parring fra /tv) og ét klik, før den må spille lyd.
'use strict';
const JF = document.documentElement.dataset, ROOM = JF.base + '/r/' + JF.rum + '/', API = ROOM + 'api/', IMG = ROOM + 'img/';
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let st = null, off = 0, scene = '', lastCmd = 0, booted = false, build = JF.build || '';
const P = {}; // YouTube-afspillere: A (skjult: polka-udgaven og klip ved svaret), B (synlig), C (skål-reklamen), D (skjult: stemningsmusik), S (skjult: snapsevisens YouTube-reserve), P (skjult: piña colada-sangen, ligger klar)
let ytReady = false, ytQueue = [];

// ---------- lyd (Web Audio) ----------
let AC = null;
const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
function tone(f, d, type = 'sine', vol = .25, at = 0) {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.value = f; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}
// en tone, der glider fra f0 til f1 (propknaldet)
function sweep(f0, f1, d, vol, at = 0) {
  try {
    const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + d);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    o.connect(g).connect(c.destination); o.start(t); o.stop(t + d);
  } catch (e) { }
}
// filtreret støj: smæld, brus og "chicka"
function noise(d, vol, at, type, freq, q = 1) {
  try {
    const c = ac(), n = Math.ceil(c.sampleRate * d), buf = c.createBuffer(1, n, c.sampleRate), ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) ch[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + at;
    src.buffer = buf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
    src.connect(f).connect(g).connect(c.destination); src.start(t);
  } catch (e) { }
}
// en basnode med wah-wah: filteret åbner og lukker hen over noden
function wah(f, d, at, vol = .42) {
  try {
    const c = ac(), t = c.currentTime + at, lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 8;
    lp.frequency.setValueAtTime(240, t); lp.frequency.exponentialRampToValueAtTime(1900, t + d * .45); lp.frequency.exponentialRampToValueAtTime(300, t + d);
    g.gain.setValueAtTime(.001, t); g.gain.exponentialRampToValueAtTime(vol, t + .02); g.gain.setValueAtTime(vol, t + d * .7); g.gain.exponentialRampToValueAtTime(.001, t + d);
    // oktaven ovenpå, så bassen også kan høres i tv'ets små højttalere
    for (const [k, type, v] of [[1, 'sawtooth', 1], [2, 'square', .35]]) { const o = c.createOscillator(), og = c.createGain(); o.type = type; o.frequency.value = f * k; og.gain.value = v; o.connect(og).connect(lp); o.start(t); o.stop(t + d + .02); }
    lp.connect(g).connect(c.destination);
  } catch (e) { }
}
const SFX = {
  // nødløsninger, hvis klippene ikke kan afspilles – champagneproppen: knald, smæld og brus
  pop: () => { sweep(1100, 150, .1, .8); noise(.05, .5, 0, 'bandpass', 1800, .8); noise(1.6, .14, .08, 'highpass', 5200); },
  // den frække bas: "bow – chicka – wow-wow", to gange
  bass: () => [0, 1.5].forEach(o => { wah(82.4, .34, o); noise(.05, .22, o + .42, 'bandpass', 2400, 2); noise(.05, .22, o + .57, 'bandpass', 2400, 2); wah(98, .3, o + .74); wah(o ? 82.4 : 110, .56, o + 1.08); }),
  tick: () => tone(1400, .05, 'square', .05),
  ding: () => { tone(880, .4); tone(1320, .6, 'sine', .2, .12); },
  gong: () => { tone(110, 2.5, 'sine', .5); tone(220, 2, 'triangle', .2); tone(330, 1.5, 'sine', .1); },
  alarm: () => { for (let i = 0; i < 8; i++) { tone(988, .18, 'square', .18, i * .25); tone(740, .18, 'square', .18, i * .25 + .12); } },
  fanfare: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .5, 'triangle', .25, i * .15)),
};

// ---------- YouTube ----------
window.onYouTubeIframeAPIReady = () => { ytReady = true; ytQueue.splice(0).forEach(f => f()); };
// hentes igen efter 5 s, hvis nettet lige var væk
(function load() { const s = document.createElement('script'); s.src = 'https://www.youtube.com/iframe_api'; s.onerror = () => { s.remove(); setTimeout(load, 5000); }; document.head.appendChild(s); })();
function yt(slot, el, id, start, onEnd, quiet) {
  const go = () => {
    const vars = { autoplay: 1, controls: 0, cc_load_policy: 0, rel: 0, playsinline: 1, modestbranding: 1, start: start || 0, origin: location.origin, iv_load_policy: 3, disablekb: 1 };
    if (slot !== 'C') kick(slot, id, start || 0, 0);
    if (P[slot] && P[slot].loadVideoById) { P[slot]._end = onEnd; quiet ? P[slot].mute() : P[slot].unMute(); P[slot].loadVideoById({ videoId: id, startSeconds: start || 0 }); return; }
    P[slot] = new YT.Player(el, {
      // de skjulte lyd-afspillere er bittesmå, så YouTube sender videoen i laveste opløsning (billedet ses jo ikke)
      host: 'https://www.youtube-nocookie.com', videoId: id, playerVars: vars, width: slot === 'B' ? '100%' : 64, height: slot === 'B' ? '100%' : 36,
      events: {
        onReady: e => { quiet ? e.target.mute() : e.target.unMute(); e.target.setVolume(100); e.target.playVideo(); },
        onStateChange: e => {
          if (e.data === 1) try { e.target.unloadModule('captions'); } catch (e) { } // ingen autogenererede undertekster hen over billedet
          if (e.data === 1 && slot === 'A') clipOn();
          if (e.data === 0 && P[slot]._end) P[slot]._end();
        },
        onError: e => { msg(st && st.mode === 'jukebox' ? 'Den video må ikke afspilles uden for YouTube – springer videre' : 'Videoen kan ikke afspilles (' + e.data + ') – tryk Næste'); if (P[slot]._end) P[slot]._end(true); },
      },
    });
    P[slot]._end = onEnd;
  };
  ytReady ? go() : ytQueue.push(go);
}
// Nogle tv'er har kun én hardware-dekoder. Er den ikke sluppet af den forrige video, når en ny starter, står den nye og
// "henter" uden lyd – så startes den igen (højst tre gange).
function kick(slot, id, start, n) {
  setTimeout(() => {
    try {
      const p = P[slot]; if (!p || p.getVideoData().video_id !== id) return;
      const s = p.getPlayerState();
      if ((s === 3 || s === -1) && n < 3) {
        // skulle den ventende snapsevise mod forventning holde hardware-dekoderen, slipper den her (så starter den koldt næste gang)
        try { if (!snapsOn && P.S && P.S._hot) { P.S._hot = false; P.S.stopVideo(); } } catch (e) { }
        try { if (!pinaOn && P.P && P.P._hot) { P.P._hot = false; P.P.stopVideo(); } } catch (e) { }
        p.loadVideoById({ videoId: id, startSeconds: start }); kick(slot, id, start, n + 1);
      }
    } catch (e) { }
  }, 5000);
}
const stop = slot => { try { P[slot] && P[slot].stopVideo(); } catch (e) { } };
const pause = slot => { try { P[slot] && P[slot].pauseVideo(); } catch (e) { } };
const play = slot => { try { P[slot] && P[slot].playVideo(); } catch (e) { } };
const playing = slot => { try { return P[slot] && P[slot].getPlayerState() === 1; } catch (e) { return false; } };

// ---------- klip ved svaret i Flaske eller frøken?: Champagne Galop (proppen!) eller den frække bas ----------
// Klippet hentes lydløst i den skjulte afspiller, mens I gætter, og står på pause – så starter det med det samme ved svaret.
const CLIP = [['EJsAtS1r3e0', 0, 14], ['nQIFQVzuOjo', 0, 10]]; // [video, start, antal sekunder]: 0 = champagne (Tivolis Symfoniorkester), 1 = eskort ("Love Muscle")
let clip = null, clipT = null;
function clipPrep(i) {
  clearTimeout(clipT); clipLive = false;
  clip = { i, go: false };
  yt('A', 'ytA', CLIP[i][0], CLIP[i][1], null, true);
}
// den skjulte afspiller er begyndt at spille: før svaret sættes den på pause ved starten, efter svaret får den lyd
function clipOn() {
  if (!clip) return;
  try { if (clip.go) { P.A.unMute(); P.A.setVolume(100); } else { P.A.pauseVideo(); P.A.seekTo(CLIP[clip.i][1], true); } } catch (e) { }
}
function clipPlay() {
  if (!clip || !ytReady || !P.A || !P.A.playVideo) return false;
  const c = clip; c.go = true;
  try { P.A.seekTo(CLIP[c.i][1], true); P.A.unMute(); P.A.setVolume(100); P.A.playVideo(); } catch (e) { return false; }
  clipLive = true; ambSync();
  // det sidste sekund toner klippet ud
  clearTimeout(clipT);
  clipT = setTimeout(function fade(v = 100) {
    if (clip !== c) return;
    try { if (v <= 0) { P.A.pauseVideo(); P.A.setVolume(100); clipLive = false; ambSync(); } else { P.A.setVolume(v); clipT = setTimeout(fade, 100, v - 10); } } catch (e) { }
  }, (CLIP[c.i][2] - 1) * 1000);
  return true;
}
function clipOff() { clearTimeout(clipT); clip = null; clipLive = false; }

// ---------- stemning: stille julemusik med pejseknitren, når tv'et ellers ville være tavst ----------
// Julemusikken og Finsk polka har deres egen lyd (afspilleren lukkes helt, så den ikke optager tv'ets dekoder);
// skål, snaps og klippet ved svaret holder en pause, og mens citatet læses op, skrues der helt ned.
const AMB = 'cmCiUi6cjlk', AMB_VOL = 18, AMB_DUCK = 5;
let ambState = 'off', ambPos = 0, clipLive = false;
function ambSync() {
  if (!st) return;
  const m = st.mode, want = m === 'jukebox' || m === 'music' ? 'off' : skaalOn || snapsOn || pinaOn || clipLive ? 'pause' : 'play';
  const vol = voice && !voice.paused && !voice.ended ? AMB_DUCK : AMB_VOL;
  try { if (P.D && P.D.setVolume) P.D.setVolume(vol); } catch (e) { }
  if (want === ambState) return;
  ambState = want;
  if (want === 'off') { try { ambPos = P.D.getCurrentTime() || ambPos; } catch (e) { } try { P.D && P.D.destroy(); } catch (e) { } P.D = null; // næste gang fortsætter den, hvor den slap
    $('#hpd').innerHTML = '<div id="ytD"></div>'; return; }
  if (P.D) { want === 'play' ? play('D') : pause('D'); return; }
  if (want === 'pause') { ambState = 'off'; return; } // intet at holde pause i – starter, når der bliver stille igen
  const go = () => {
    if (ambState === 'off' || P.D) return;
    P.D = new YT.Player('ytD', {
      host: 'https://www.youtube-nocookie.com', videoId: AMB, width: 64, height: 36,
      playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, start: Math.floor(ambPos), origin: location.origin, iv_load_policy: 3, disablekb: 1 },
      events: {
        onReady: e => { e.target.setVolume(voice && !voice.paused && !voice.ended ? AMB_DUCK : AMB_VOL); if (ambState === 'play') e.target.playVideo(); },
        onStateChange: e => { if (e.data === 0) { e.target.seekTo(0, true); e.target.playVideo(); } }, // forfra, når den er slut
        onError: () => { },
      },
    });
  };
  ytReady ? go() : ytQueue.push(go);
}

function msg(t, ms) { const m = $('#msg'); m.textContent = t; m.classList.remove('hidden'); clearTimeout(msg.t); msg.t = setTimeout(() => m.classList.add('hidden'), ms || 6000); }

// ---------- QR ----------
// tegnes én gang pr. kode og genbruges som billede, så velkomstskærmen kan tegnes om uden at QR-koden blinker
const qrCache = {};
function qrImg(text, size) {
  const k = size + text;
  if (!(k in qrCache)) {
    try { const d = document.createElement('div'); new QRCode(d, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); qrCache[k] = d.querySelector('canvas').toDataURL('image/png'); } catch (e) { qrCache[k] = ''; }
  }
  return qrCache[k] ? `<img src="${qrCache[k]}" alt="QR-kode">` : `<small>${esc(text)}</small>`;
}
let qrFor = '';
function corner(on) {
  $('#corner').classList.toggle('hidden', !on);
  if (on && st && qrFor !== st.code) { qrFor = st.code; $('#qrs').innerHTML = qrImg(st.join + st.code, 256); $('#code').textContent = st.code; $('#url').textContent = st.site; }
}

// ---------- scener ----------
// DOM'en røres kun, når indholdet faktisk er ændret (tv'ets chip er svag, og hver omtegning koster)
let stageHtml = null;
const stage = h => { if (h !== stageHtml) { stageHtml = h; $('#stage').innerHTML = h; } };
const put = (el, h) => { if (el && el._h !== h) { el._h = h; el.innerHTML = h; } };
function optsHtml(z) {
  return `<div class="opts">${z.options.map((o, i) => `<div class="opt o${i} ${z.phase === 'reveal' ? (z.answer === i ? 'right' : 'dimmed') : ''}"><span class="sw">${SHAPE[i]}</span>${esc(o)}</div>`).join('')}</div>`;
}
const pts = n => Number(n || 0).toLocaleString('da-DK');
const rightSum = r => r.right ? Object.values(r.right).reduce((a, b) => a + b, 0) : null;
function boardHtml(rows, key, max = 12) {
  return `<div class="board">${rows.slice(0, max).map((r, i) => { const k = rightSum(r); return `<div class="r"><span class="m">${i + 1}</span><span class="n">${esc(r.name)}${key && r.members != null ? ` <small>(${r.members})</small>` : ''}</span><span class="k">${k != null ? k + ' rigtige' : ''}</span><b>${pts(r.score)}</b></div>`; }).join('')}</div>`;
}
const QNAME = { music: 'Finsk polka', photo: 'Hvornår var det nu det var?', emoji: 'Emoji-julefilm', pagne: 'Flaske eller frøken?', face: 'Veer eller vellyst?', pony: 'Pony eller pornostjerne?' };
const QUNIT = { music: 'sang', photo: 'billede', emoji: 'film', pagne: 'citat', face: 'ansigt', pony: 'navn' };
// runder, der kræver billeder på serveren, vises kun, når billederne ligger der
const hasKind = (s, k) => (k !== 'photo' || s.pics) && (k !== 'face' || s.faces);
// aftenens program på velkomstskærmen: flueben for det, der er klaret, og "Næste" på det første, der mangler
function programHtml(s) {
  const d = s.done || {}, items = [['tips', 'Julekuponen'], ['music', QNAME.music], ['photo', QNAME.photo], ['emoji', QNAME.emoji], ['pagne', QNAME.pagne], ['face', QNAME.face], ['pony', QNAME.pony], ['pak', 'Pakkeleg'], ['jukebox', 'Julemusik og ønsker']].filter(([k]) => hasKind(s, k));
  const tipsFilled = s.tips && s.tips.count && !s.tips.open;
  const isDone = k => k === 'tips' ? (d.tips || tipsFilled) : d[k];
  const next = items.find(([k]) => !isDone(k));
  return `<div class="prg">${items.map(([k, t]) => `<div class="${isDone(k) ? 'done' : next && next[0] === k ? 'nxt' : ''}"><i>${isDone(k) ? ICO.check : ''}</i>${esc(t)}${next && next[0] === k ? '<em>Næste</em>' : ''}</div>`).join('')}</div>`;
}

let timerT = null;
function timer(deadline, total) {
  clearInterval(timerT);
  const bar = document.querySelector('.timer'); if (!bar) return;
  const fg = document.querySelector('.ring .fg'), secs = document.getElementById('secs');
  const upd = () => {
    const left = Math.max(0, deadline - (Date.now() + off)), f = left / total;
    bar.style.width = f * 100 + '%';
    if (fg) fg.style.strokeDashoffset = 515 * (1 - f);
    if (secs) secs.textContent = Math.ceil(left / 1000);
  };
  upd(); timerT = setInterval(upd, 250);
}

let pakT = null, pakPhase = 0, jbPos = null, tipDing = '', recapT = null;
function draw() {
  const s = st, m = s.mode, z = s.quiz;
  const key = [m, m === 'jukebox' && s.jb ? s.jb.n : '', z && z.n, z && z.phase, s.pak && s.pak.phase, s.tips && s.tips.shown, m === 'score' || m === 'tips' || m === 'lobby' ? s.v : '', m === 'score' && s.recap && s.recap.until > Date.now() + off ? 'quiz' : ''].join(':');
  if (key === scene) return liveBits();
  const prev = scene; scene = key;
  // forlader vi julemusikken, huskes hvor sangen var, så den kan fortsætte bagefter
  if (prev && prev.startsWith('jukebox:') && m !== 'jukebox') try { jbPos = { id: P.B.getVideoData().video_id, t: Math.max(0, P.B.getCurrentTime() - 2) }; } catch (e) { jbPos = null; }
  // ryd det, der ikke hører til den nye scene
  if (!(z && (m === 'music' && z.phase === 'ask' || m === 'pagne'))) { stop('A'); clipOff(); }
  if (!(z && m === 'music' && z.phase === 'reveal') && m !== 'jukebox') { stop('B'); $('#vid').classList.add('hidden'); }
  if (!(z && m === 'pagne' && z.phase === 'ask')) hush();
  if (m !== 'pagne') spoke = '';
  clearInterval(pakT); pakT = null;
  clearInterval(timerT); timerT = null;
  clearTimeout(recapT);
  if (m !== 'tips') tipDing = '';
  corner(m === 'jukebox'); // QR-hjørnet står kun over julemusikken – velkomstskærmen har sin egen store QR-kode, og quizzerne skal have skærmen for sig selv

  if (m === 'lobby') {
    // før første point: QR + hvem der er med; derefter QR + stillingen
    const ps = s.board ? s.board.players : [], scored = ps.some(p => p.score), teams = s.board ? s.board.teams.filter(t => t.members) : [];
    const t = s.tips, filled = new Set(((t && t.table) || []).filter(p => p.filled >= t.count).map(p => p.name));
    const day = new Date().toLocaleDateString('da-DK', { weekday: 'long', day: 'numeric', month: 'long' });
    const join = `<div class="paper join"><div class="qrbig">${qrImg(s.join + s.code, 512)}</div><div><div class="t">Scan og vær med</div><div class="u">${esc(s.site)}</div></div><div class="c"><span>Kode</span><b>${esc(s.code)}</b></div></div>`;
    const notice = t && t.count && t.open ? `<div class="notice">${ICO.kupon}<div>Udfyld <b>julekuponen</b> på telefonen først${t.filled ? ` – ${t.filled} af ${ps.length} er færdige` : ''}.</div></div>` : '';
    const mid = scored
      ? `<div class="ph2"><h2>Stillingen</h2><span>${teams.length ? 'hold – gennemsnit pr. deltager' : ps.length + ' deltagere'}</span></div>${teams.length ? boardHtml(teams, true) : boardHtml(ps, false, 10)}`
      : `<div class="ph2"><h2>Med i aftenens leg</h2><span>${ps.length ? (t && t.count ? 'flueben = kuponen er udfyldt' : '') : 'scan koden for at være med'}</span></div><div class="names">${ps.map(p => `<span>${filled.has(p.name) ? ICO.check : ''}${esc(p.name)}</span>`).join('')}</div>`;
    stage(`<div class="lob"><header><div><div class="kick">${esc(day.charAt(0).toUpperCase() + day.slice(1))}</div><h1>${esc(s.navn)} <span>${new Date().getFullYear()}</span></h1></div>
      <div class="meta">${ICO.star}${ps.length} med på telefonen</div></header>
      <div class="grid"><section class="col">${join}${notice}</section><section class="panel">${mid}</section>
      <section class="col"><h2>Program</h2>${programHtml(s)}<div class="hint">OK på fjernbetjeningen (eller Enter) åbner menuen</div></section></div></div>`);
    return;
  }
  if (m === 'jukebox' && s.jb && s.jb.cur) {
    stage('');
    const n = s.jb.n;
    $('#vid').classList.remove('hidden');
    $('#vid').querySelector('.video-label') || $('#vid').insertAdjacentHTML('beforeend', '<section class="video-label"></section>');
    jbLabel();
    const from = jbPos && jbPos.id === s.jb.cur.id ? jbPos.t : 0; jbPos = null;
    yt('B', 'ytB', s.jb.cur.id, from, () => host('jbEnded', { n }));
    return;
  }
  if (m === 'score') {
    // en quiz er lige sluttet: først hvor mange rigtige (og point) hver fik i den – derefter den samlede stilling
    const rc = s.recap && s.recap.until > Date.now() + off ? s.recap : null;
    if (rc) {
      const rows = s.board.players.map(p => ({ name: p.name, right: { q: p.right[rc.kind] || 0 }, score: (p.pts || {})[rc.kind] || 0 })).sort((a, b) => b.right.q - a.right.q || b.score - a.score);
      stage(`<div class="kick">${esc(QNAME[rc.kind] || 'Quiz')} · ${rc.asked} spørgsmål</div><h1>Sådan gik quizzen</h1><div class="dim">Rigtige svar og point i denne quiz – den samlede stilling kommer om lidt</div>${boardHtml(rows, false, 10)}`);
      if (!prev.startsWith('score')) SFX.fanfare();
      recapT = setTimeout(() => { scene = ''; draw(); }, rc.until - (Date.now() + off) + 80);
      return;
    }
    const teams = s.board.teams.filter(t => t.members);
    stage(`<div class="kick">${esc(s.navn)} ${new Date().getFullYear()}</div><h1>Stillingen</h1>${teams.length ? `<div class="dim">Hold – gennemsnit pr. deltager</div>${boardHtml(teams, true)}` : boardHtml(s.board.players)}`);
    if (!prev.startsWith('score')) SFX.fanfare();
    return;
  }
  if (z && QNAME[m]) {
    const pg = (s.progress || {})[m], unit = QUNIT[m].charAt(0).toUpperCase() + QUNIT[m].slice(1), ask = z.phase === 'ask';
    const head = `<div class="qhead"><div><span class="kick">${QNAME[m]}</span><span class="sep"></span>${unit} ${z.n}${pg && pg[1] ? ' af ' + pg[1] : ''}</div><div id="cnt"></div></div>`;
    const right = z.phase === 'reveal' ? `<div class="right-names">${z.right.length ? 'Rigtigt: <b>' + z.right.map(esc).join(', ') + '</b>' : 'Ingen havde ret denne gang'}</div>` : '';
    const ring = `<div class="ring"><svg viewBox="0 0 190 190"><circle class="bg" cx="95" cy="95" r="82"/><circle class="fg" cx="95" cy="95" r="82"/></svg><div><b id="secs"></b><small>sekunder</small></div></div>`;
    // svaret: et pling – i Flaske eller frøken? i stedet Champagne Galop (champagne) eller den frække bas (eskort).
    // Kan klippet ikke afspilles (fx uden net), bruges de hjemmelavede lyde.
    if (z.phase === 'reveal') { if (m !== 'pagne') SFX.ding(); else if (!clipPlay()) (z.answer === 0 ? SFX.pop : SFX.bass)(); }
    if (m === 'music') {
      if (z.phase === 'ask') {
        stage(`${head}<div class="qask"><div><div class="qtitle"><div class="eq">${Array.from({ length: 9 }, (_, i) => `<b style="animation-delay:-${(i * 0.37) % 1}s;animation-duration:${.6 + (i % 4) * .15}s"></b>`).join('')}</div><h1>Hvilken sang er det?</h1></div><p>Et kendt hit i finsk polka-udgave – originalen spiller, når svaret vises. Hurtigst svar giver flest point.</p></div></div>${optsHtml(z)}`);
        yt('A', 'ytA', z.polka, 0, null);
      } else {
        stage('');
        $('#vid').classList.remove('hidden');
        $('#vid').querySelector('.video-label') || $('#vid').insertAdjacentHTML('beforeend', '<section class="video-label"></section>');
        put($('#vid .video-label'), `<h2>${esc(z.title)}</h2>${right}`);
        yt('B', 'ytB', z.original, z.start, null);
      }
      return liveBits();
    }
    if (m === 'photo') {
      // billedet har hele venstre side for sig selv; årstallene står i en smal spalte til højre, så intet dækker det.
      // De medfølgende billeder har en kort tekst om, hvad der sker (uden årstal), og fotografens navn ved svaret.
      stage(`${ask ? '<div class="timer"></div>' : ''}${head}<div class="pq"><div class="pic" style="background-image:url('${IMG}${z.img.split('/').map(encodeURIComponent).join('/')}')"></div><div class="side">${z.text ? `<p class="cap">${esc(z.text)}</p>` : ''}<h1>${ask ? 'Hvilket år?' : 'Det var i ' + esc(z.title)}</h1>${optsHtml(z)}${right}${z.credit ? `<small class="credit">Foto: ${esc(z.credit)}</small>` : ''}</div></div>`);
      if (z.phase === 'ask') timer(z.deadline, z.limit || 20e3);
      return liveBits();
    }
    if (m === 'face') {
      // Veer eller vellyst?: et ansigt i ramme – er det en fødsel eller en pornofilm?
      stage(`${ask ? '<div class="timer"></div>' : ''}${head}<div class="face"><img src="${IMG}${z.img.split('/').map(encodeURIComponent).join('/')}" alt=""></div><h1 class="duo">${ask ? 'Fødsel eller porno?' : 'Det var ' + esc(z.title.toLowerCase()) + '!'}</h1>${optsHtml(z)}${right}`);
      if (ask) timer(z.deadline, z.limit);
      return liveBits();
    }
    if (m === 'pony') {
      // Pony eller pornostjerne?: et navn – er det en figur fra My Little Pony eller en pornoskuespiller?
      stage(`${ask ? '<div class="timer"></div>' : ''}${head}<div class="qask"><div><h1 class="name">${esc(z.text)}</h1><p>${ask ? 'En pony fra My Little Pony – eller en pornostjerne?' : `<b>${esc(z.title)}</b>${z.more ? ' · ' + esc(z.more) : ''}`}</p></div>${ask ? ring : ''}</div>${optsHtml(z)}${right}`);
      if (ask) timer(z.deadline, z.limit);
      return liveBits();
    }
    if (m === 'pagne') {
      // Flaske eller frøken?: et citat – handler det om en champagne eller en eskortpige?
      const said = '“' + esc(z.text) + '”';
      stage(`${ask ? '<div class="timer"></div>' : ''}${head}<div class="qask"><div>${ask ? `<h1 class="quote">${said}</h1><p>Hvem bliver der talt om – en champagne eller en eskortpige?</p>` : `<p class="said">${said}</p><h1 class="quote">${esc(z.title)}</h1>${z.more ? `<p>${esc(z.more)}</p>` : ''}`}</div>${ask ? ring : ''}</div>${optsHtml(z)}${right}`);
      if (ask) timer(z.deadline, z.limit);
      if (ask && z.audio && spoke !== z.n + z.audio) { spoke = z.n + z.audio; say(z.audio, z.text); } // hvert citat læses op én gang
      if (ask) clipPrep(z.answer);
      return liveBits();
    }
    stage(`${z.phase === 'ask' ? '<div class="timer"></div>' : ''}${head}<div class="qask"><div><h1>${z.phase === 'ask' ? 'Hvilken julefilm?' : esc(z.title)}</h1><div class="emoji">${z.emoji}</div></div>${z.phase === 'ask' ? ring : ''}</div>${optsHtml(z)}${right}`);
    if (z.phase === 'ask') timer(z.deadline, 20e3);
    return liveBits();
  }
  if (m === 'pak' && s.pak) {
    const ph = s.pak.phase;
    if (ph === 1) stage(`<div class="pak">${ICO.gift}</div><h1>Pakkeleg!</h1><h2 class="dim">Slå en 6'er og tag en gave fra bunken</h2>`);
    if (ph === 2) stage(`<div class="pak">${ICO.devil}</div><h1>Nu må I stjæle!</h1><h2 class="dim">Slå en 6'er og stjæl fra de andre</h2>`);
    if (ph === 3) stage(`<div class="stop">STOP!</div><h1>Pakkelegen er slut – pak ud!</h1>`);
    if (ph !== pakPhase) { if (ph === 2) SFX.gong(); if (ph === 3) SFX.alarm(); pakPhase = ph; }
    if (ph < 3) pakT = setInterval(SFX.tick, 1000);
    return;
  }
  if (m === 'tips' && s.tips) {
    // ét "ding" pr. afsløret væddemål – ikke hver gang skærmen tegnes om
    const x = s.tips.questions[s.tips.shown], k = x && x.revealed ? String(s.tips.shown) : '';
    if (k && k !== tipDing) SFX.ding();
    tipDing = k;
    return stage(tipsHtml(s.tips));
  }
  stage('<h1>Glædelig jul</h1>');
}

function tipsHtml(t) {
  const x = t.questions[t.shown];
  if (x && x.revealed) {
    return `<div class="qhead"><div><span class="kick">Julekuponen</span><span class="sep"></span>Væddemål ${t.shown + 1} af ${t.questions.length}</div></div><div class="tipq">${esc(x.q)}</div>
      <div class="opts three">${['1', 'X', '2'].map((l, c) => `<div class="opt o${[0, 1, 2][c]} ${x.answer === c ? 'right' : 'dimmed'}"><span class="sw">${l}</span>${esc(x.opts[c])}</div>`).join('')}</div>
      <div class="right-names">${t.right && t.right.length ? 'Rigtigt: <b>' + t.right.map(esc).join(', ') + '</b>' : 'Ingen havde det rigtige'}</div>`;
  }
  // kuponen som på papir: væddemål, 1-X-2 (midten rød), resultater + hvem der fører
  const rows = t.questions.map((q, i) => `<tr><td class="vq">${esc(q.q)}</td>${q.opts.map((o, c) => `<td class="${c === 1 ? 'mid' : ''} ${q.revealed ? (q.answer === c ? 'hit' : 'miss') : ''}">${esc(o)}</td>`).join('')}</tr>`).join('');
  const lead = (t.table || []).slice(0, 10).map((p, i) => `<div class="r" style="grid-template-columns:2.6vw minmax(0,1fr) 3vw;font-size:1.4vw"><span class="m" style="width:2.2vw;height:2.2vw;font-size:1vw">${i + 1}</span><span class="n">${esc(p.name)}</span><b style="font-size:1.6vw">${p.right}</b></div>`).join('');
  return `<div class="kupon"><div class="khead"><h1>JULEKUPONEN</h1><small>${t.open ? `${t.filled} har udfyldt hele kuponen` : 'Kuponerne er lukket'}</small></div>
    <div style="display:flex;gap:2vw;align-items:flex-start"><table><tr><th>VÆDDEMÅL</th><th>1</th><th>X</th><th>2</th></tr>${rows}</table>
    ${lead ? `<div class="board" style="width:20vw"><h2 style="font-size:1.8vw;text-align:left">Flest rigtige</h2>${lead}</div>` : ''}</div></div>`;
}

function jbLabel() {
  const j = st.jb, el = $('#vid .video-label'); if (!el || !j || !j.cur) return;
  put(el, `<div class="kick">Julemusik</div><h2>${esc(j.cur.title)}</h2>${j.cur.by ? `<div class="right-names">Ønsket af <b>${esc(j.cur.by)}</b></div>` : ''}${j.queue.length ? `<div class="right-names">Næste: ${j.queue.slice(0, 3).map(q => esc(q.title)).join(' · ')}</div>` : ''}<div class="right-names">Ønsk en sang på telefonen – <b>2 ønsker ad gangen</b> pr. person</div>`);
}

// småting, der ændrer sig uden ny scene (antal svar, ønskekøen)
function liveBits() {
  if (st.mode === 'jukebox') jbLabel();
  const z = st.quiz, c = $('#cnt');
  if (z) put(c, z.phase === 'ask' ? `<b>${z.answered}</b> af ${st.count} har svaret` : '');
}

// ---------- skål ----------
let skaalOn = false, resume = [];
function skaal() {
  if (st.skaal && !skaalOn) {
    skaalOn = true;
    resume = ['A', 'B'].filter(playing); resume.forEach(pause);
    // snevejr med SKÅL, der hopper ind, og to glas, der klinker – lyden er en julebryg-reklame (usynlig afspiller)
    $('#ad').innerHTML = `<div class="skaalscene"><div class="glass l">🍺</div><div class="glass r">🍺</div>
      <div class="skaalword">${[...'SKÅÅÅL!'].map((c, i) => `<span style="animation-delay:${.15 + i * .12}s">${c}</span>`).join('')}</div>
      <div class="skaalsub">Rejs jer og løft glasset</div>${Array.from({ length: 26 }, () => `<i class="foam" style="left:${45 + Math.random() * 10}vw;--dx:${Math.random() * 60 - 30}vw;--dy:${-20 - Math.random() * 40}vh;animation-delay:${1.1 + Math.random() * .4}s"></i>`).join('')}</div>`;
    $('#ad').classList.remove('hidden');
    $('#hpc').innerHTML = '<div id="ytC"></div>'; P.C = null;
    yt('C', 'ytC', st.ad, 0, () => SFX.fanfare());
  } else if (!st.skaal && skaalOn) {
    skaalOn = false; stop('C'); P.C = null;
    $('#ad').classList.add('hidden'); $('#ad').innerHTML = ''; $('#hpc').innerHTML = '';
    resume.forEach(play); resume = [];
  }
}

// ---------- snapsealarm: skærmen fyldes med snapseflasker i ét minut ----------
const BOTTLE = `<svg viewBox="0 0 80 260" xmlns="http://www.w3.org/2000/svg"><defs>
  <linearGradient id="gl" x1="0" x2="1"><stop offset="0" stop-color="#3d3e12"/><stop offset=".3" stop-color="#8b8a3a"/><stop offset=".45" stop-color="#a9a65a"/><stop offset=".7" stop-color="#6e6c26"/><stop offset="1" stop-color="#2e2f0c"/></linearGradient>
  <linearGradient id="cap" x1="0" x2="1"><stop offset="0" stop-color="#9a9a9a"/><stop offset=".4" stop-color="#f2f2f2"/><stop offset="1" stop-color="#8a8a8a"/></linearGradient></defs>
  <rect x="29" y="2" width="22" height="20" rx="2" fill="url(#cap)"/>
  <path d="M29 22h22v58c0 10 21 14 21 34v134c0 6-4 10-10 10H18c-6 0-10-4-10-10V114c0-20 21-24 21-34z" fill="url(#gl)"/>
  <rect x="29" y="22" width="22" height="16" fill="#fff"/><text x="40" y="30" text-anchor="middle" font-family="Arial" font-weight="700" font-size="4.6" fill="#c8102e">SNAPS</text><rect x="31" y="32" width="18" height="3.4" fill="#c8102e"/>
  <path d="M22 100c3-6 6-10 9-12" stroke="#ffffff55" stroke-width="3" fill="none" stroke-linecap="round"/>
  <rect x="12" y="124" width="56" height="20" fill="#fff"/><rect x="14" y="126" width="52" height="16" fill="none" stroke="#c8102e" stroke-width="1.2"/>
  <text x="40" y="138.5" text-anchor="middle" font-family="Arial" font-weight="700" font-size="8.4" fill="#c8102e" letter-spacing=".5">JULESNAPS</text>
  <path d="M14 150h52v62l-6 8H20l-6-8z" fill="#fbf8f2"/>
  <path d="M8 168l64-6v12l-64 6z" fill="#c8102e"/><text x="40" y="174" text-anchor="middle" font-family="Georgia,serif" font-weight="700" font-size="6.2" fill="#fff" transform="rotate(-5 40 172)">SKÅL · SKÅL · SKÅL</text>
  <circle cx="40" cy="194" r="7" fill="none" stroke="#d4af37" stroke-width="1.3"/><path d="M33 194h14M40 187v14" stroke="#c8102e" stroke-width="2.4"/>
  <text x="40" y="214" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="5" fill="#c8102e">Bunden i vejret</text></svg>`;
let snapsOn = false, snapsT = null, bottles = [];
const MAX_BOTTLES = 200;
// Snapsevisen ("Haps, haps, haps"). Har festen sin egen lydfil – billeder/lyd/snaps.mp3 i festens mappe på serveren –
// spilles den: den starter i samme øjeblik, alarmen går, og kræver hverken YouTube eller dekoder. Ellers bruges
// YouTube-udgaven (pladeselskabets egen: [video, start, antal sekunder]), som ligger startet-og-sat-på-pause i sin egen
// skjulte afspiller. Kan ingen af dem spille, hyler sirenen.
const SNAPS_FILE = IMG + 'lyd/snaps.mp3', SNAPS_SONG = ['kkKxVfTQC68', 0, 59];
let snapsAudio = null, snapsFile = null; // null = ved det ikke endnu, true = filen er hentet, false = den findes ikke
function snapsLoad() {
  const a = snapsAudio = new Audio(SNAPS_FILE); a.preload = 'auto';
  a.oncanplaythrough = () => { snapsFile = true; };
  a.onerror = () => { if (snapsAudio === a && snapsFile !== true) { snapsFile = false; snapsWarm(); } }; // ingen fil: gør YouTube-udgaven klar
  a.load();
}
snapsLoad();
let snapsSiren = false, snapsB = null, snapsA = null, snapsLag = null, snapsResume = [];
// Uden lydfilen ligger YouTube-udgaven klar i sin egen skjulte afspiller (S): startet lydløst og sat på pause ved første
// tone, så den spiller straks, når alarmen går. (En ny afspiller er flere sekunder om at komme i gang på tv'et.)
function snapsWarm() {
  if (snapsFile !== false || P.S) return;
  if (!ytReady) { if (!snapsWarm.waits) { snapsWarm.waits = true; ytQueue.push(snapsWarm); } return; }
  P.S = new YT.Player('ytS', {
    host: 'https://www.youtube-nocookie.com', videoId: SNAPS_SONG[0], width: 64, height: 36,
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, start: SNAPS_SONG[1], origin: location.origin, iv_load_policy: 3, disablekb: 1 },
    events: {
      onReady: e => { e.target._ok = true; if (snapsOn) { e.target.unMute(); e.target.setVolume(100); } else e.target.mute(); e.target.playVideo(); },
      // uden for alarmen: så snart den spiller, sættes den på pause ved starten – nu er den varm
      onStateChange: e => { if (e.data === 1 && !snapsOn) { e.target.pauseVideo(); e.target.seekTo(SNAPS_SONG[1], true); e.target._hot = true; } },
      onError: () => { if (snapsOn && !snapsSiren) { snapsSiren = true; siren(); } },
    },
  });
}
const siren = () => { for (let i = 0; i < 6; i++) { tone(660, .45, 'sawtooth', .12, i * .9); tone(990, .45, 'sawtooth', .12, i * .9 + .45); } };
function snaps() {
  const el = $('#snaps');
  if (st.snaps && !snapsOn) {
    snapsOn = true;
    // det, der spiller (julemusik, originalen eller polkaen), holder pause imens
    snapsResume = ['A', 'B'].filter(playing); snapsResume.forEach(pause);
    snapsA = snapsB = null;
    el.innerHTML = `<div class="snaps-head">🚨 SNAPSEALARM! 🚨<small>Fyld glassene – skål!</small></div>`;
    el.classList.remove('hidden');
    // snapsevisen: lydfilen, ellers YouTube-udgaven, der ligger klar – og kan ingen af dem spille, hyler sirenen
    const t0 = Date.now(), file = snapsFile === true && snapsAudio; snapsLag = null;
    const cold = () => { P.S.unMute(); P.S.setVolume(100); P.S.loadVideoById({ videoId: SNAPS_SONG[0], startSeconds: SNAPS_SONG[1] }); };
    snapsSiren = !file && !(P.S && P.S._ok);
    if (file) { file.volume = 1; file.play().catch(() => { if (snapsOn) { snapsSiren = true; siren(); } }); }
    else if (!snapsSiren) try { if (P.S._hot) { P.S.seekTo(SNAPS_SONG[1], true); P.S.unMute(); P.S.setVolume(100); P.S.playVideo(); } else cold(); } catch (e) { snapsSiren = true; }
    if (snapsSiren) siren();
    let n = 0;
    // flaskerne vælter ind, til skærmen er fyldt
    snapsT = setInterval(() => {
      for (let k = 0; k < 3; k++) {
        const b = document.createElement('div'); b.className = 'bottle';
        const w = 4 + Math.random() * 4;
        b.style.cssText = `left:${Math.random() * 100 - w / 2}vw;width:${w}vw;--r:${Math.random() * 60 - 30}deg;--y:${20 + Math.random() * 85}vh;animation-delay:${Math.random() * .3}s`;
        b.innerHTML = BOTTLE; el.appendChild(b); bottles.push(b);
      }
      if (++n % 20 === 0 && snapsSiren) siren();
      while (bottles.length > MAX_BOTTLES) bottles.shift().remove();
      if (snapsSiren) return;
      if (file) {
        if (snapsLag == null && !file.paused && file.currentTime > 0) snapsLag = Date.now() - t0; // så længe gik der, før visen spillede
        // visen toner ud det sidste sekund og stopper efter de 59
        const left = SNAPS_SONG[2] - file.currentTime; if (left <= 1) file.volume = Math.max(0, Math.min(1, left)); if (left <= 0) file.pause();
        return;
      }
      try {
        const ps = P.S.getPlayerState();
        if (ps === 1 && snapsLag == null) snapsLag = Date.now() - t0; // så længe gik der, før visen spillede
        // Visen er ikke kommet i gang efter 3 sekunder: så er tv'ets hardware-dekoder nok optaget af det, der står på pause.
        // Det slipper dekoderen helt (og fortsætter bagefter, hvor det slap), og visen startes igen.
        if ((n === 12 || n === 26) && snapsLag == null) {
          if (!snapsA && !snapsB) {
            const park = k => { try { const ps = P[k].getPlayerState(); if (ps === 1 || ps === 2 || ps === 3) { const v = { id: P[k].getVideoData().video_id, t: Math.max(0, P[k].getCurrentTime() - 1), play: snapsResume.includes(k) }; P[k].stopVideo(); return v; } } catch (e) { } return null; };
            snapsA = park('A'); snapsB = park('B'); snapsResume = [];
          }
          cold();
        }
        // visen toner ud det sidste sekund og stopper efter de 59
        const left = SNAPS_SONG[1] + SNAPS_SONG[2] - P.S.getCurrentTime(); if (left <= 1) P.S.setVolume(Math.max(0, Math.round(left * 100))); if (left <= 0) P.S.pauseVideo();
      } catch (e) { }
    }, 250);
  } else if (!st.snaps && snapsOn) {
    snapsOn = false; clearInterval(snapsT); bottles = [];
    // visen stopper og gøres klar til næste alarm (lydfilen hentes frisk fra browserens lager; YouTube-udgaven sættes
    // lydløst på pause ved starten)
    try { snapsAudio.pause(); } catch (e) { }
    snapsLoad();
    try { P.S.pauseVideo(); P.S.mute(); P.S.seekTo(SNAPS_SONG[1], true); } catch (e) { }
    snapsResume.forEach(play); snapsResume = [];
    el.classList.add('hidden'); el.innerHTML = '';
    // måtte noget slippe dekoderen undervejs, hentes det igen – hvis skærmen stadig viser det, og der ikke er startet andet imens
    const a = snapsA, b = snapsB; snapsA = snapsB = null;
    const back = (k, v) => { const ps = P[k].getPlayerState(); if (ps !== 1 && ps !== 3) v.play ? P[k].loadVideoById({ videoId: v.id, startSeconds: v.t }) : P[k].cueVideoById({ videoId: v.id, startSeconds: v.t }); };
    try {
      const z = st.quiz;
      if (a && z && st.mode === 'music' && z.phase === 'ask') back('A', a);          // polkaen fortsætter
      else if (a && z && st.mode === 'pagne' && z.phase === 'ask') clipPrep(z.answer); // klippet til svaret gøres klar igen
    } catch (e) { }
    try {
      const shows = st.mode === 'jukebox' || (st.quiz && st.mode === 'music' && st.quiz.phase === 'reveal');
      if (b && shows) back('B', b);
    } catch (e) { }
  }
}

// ---------- piña colada-alarm: værten starter den; opskriften står på skærmen, mens hele sangen spiller ----------
// Sangen (Rupert Holmes – "Escape (The Piña Colada Song)") ligger klar i sin egen skjulte afspiller (P): startet lydløst
// og sat på pause ved første tone, så den spiller straks. Når den er slut, melder tv'et det, og skærmen forsvinder.
const PINA_SONG = 'tkGSubR4B6Q';
let pinaOn = false, pinaResume = [];
function pinaWarm() {
  if (P.P) return;
  // YouTube-koden er ikke hentet endnu: gør sangen klar, så snart den er (ellers går der op til 25 s, til næste tilstand kommer)
  if (!ytReady) { if (!pinaWarm.waits) { pinaWarm.waits = true; ytQueue.push(pinaWarm); } return; }
  P.P = new YT.Player('ytP', {
    host: 'https://www.youtube-nocookie.com', videoId: PINA_SONG, width: 64, height: 36,
    playerVars: { autoplay: 0, controls: 0, rel: 0, playsinline: 1, origin: location.origin, iv_load_policy: 3, disablekb: 1 },
    events: {
      // er alarmen allerede gået, når afspilleren er klar, spiller sangen med lyd med det samme
      onReady: e => { e.target._ok = true; if (pinaOn) { e.target.unMute(); e.target.setVolume(100); } else e.target.mute(); e.target.playVideo(); },
      onStateChange: e => {
        if (e.data === 1 && !pinaOn) { e.target.pauseVideo(); e.target.seekTo(0, true); e.target._hot = true; }
        if (e.data === 0 && pinaOn) host('pinaEnd'); // sangen er slut
      },
      onError: () => { if (pinaOn) SFX.fanfare(); },
    },
  });
}
function pina() {
  const el = $('#pina');
  if (st.pina && !pinaOn) {
    pinaOn = true;
    pinaResume = ['A', 'B'].filter(playing); pinaResume.forEach(pause);
    el.innerHTML = `<div class="fruit">${Array.from({ length: 14 }, (_, i) => `<i style="left:${(i * 7.3 + 2) % 96}vw;animation-delay:-${(i * 1.7) % 9}s;animation-duration:${8 + i % 5}s;font-size:${3 + i % 3}vw">${['🍍', '🥥', '🍹'][i % 3]}</i>`).join('')}</div>
      <div class="card"><div class="kick">Piña colada-alarm</div><h1>Piña colada <span>med Malibu</span></h1>
        <div class="cols"><div><h3>Til 2 stk. skal du bruge</h3><ul><li><b>5 cl</b> Malibu</li><li><b>8 cl</b> ananasjuice</li><li><b>3 cl</b> kokoscreme</li><li><b>1 håndfuld</b> isterninger</li></ul></div>
        <div><h3>Sådan gør du</h3><ol><li>Hæld det hele i en shaker, og ryst godt.</li><li>Hæld over i et højt glas, og sæt et sugerør i.</li><li>Skål – og syng med!</li></ol></div></div></div>`;
    el.classList.remove('hidden');
    try {
      if (P.P && P.P._hot) { P.P.seekTo(0, true); P.P.unMute(); P.P.setVolume(100); P.P.playVideo(); }
      else if (P.P && P.P._ok) { P.P.unMute(); P.P.setVolume(100); P.P.loadVideoById({ videoId: PINA_SONG, startSeconds: 0 }); }
      else SFX.fanfare();
    } catch (e) { }
  } else if (!st.pina && pinaOn) {
    pinaOn = false;
    el.classList.add('hidden'); el.innerHTML = '';
    // sangen gøres klar til næste gang: lydløs og på pause ved starten
    try { P.P.pauseVideo(); P.P.mute(); P.P.seekTo(0, true); } catch (e) { }
    pinaResume.forEach(play); pinaResume = [];
  }
}

// ---------- kommandoer fra værten ----------
// ---------- oplæsning (Flaske eller frøken?): tv'et læser citatet højt, når det kommer på skærmen ----------
// Ligger der lydfiler på serveren (public/lyd/citatNN.m4a, lavet med tools/citatlyd.js), bruges de. Ellers læser
// browserens egen danske stemme op – og har den ingen dansk stemme, står citatet bare på skærmen.
let voice = null, spoke = '', lydfiler = true;
try { window.speechSynthesis && speechSynthesis.getVoices(); } catch (e) { } // stemmerne hentes i baggrunden – bed om dem i god tid
function say(file, text) {
  hush();
  if (!lydfiler) return speak(text);
  const a = voice = new Audio(JF.base + '/lyd/' + file + '.m4a');
  a.onended = ambSync;
  a.onerror = () => { lydfiler = false; if (voice === a) { voice = null; speak(text); } };
  a.play().catch(() => { });
  ambSync();
}
function speak(text) {
  try {
    const v = window.speechSynthesis && speechSynthesis.getVoices().find(x => /^da\b/i.test(x.lang));
    if (!v || !text) return ambSync();
    const u = new SpeechSynthesisUtterance(text.replace(/\(…\)|…/g, ', ').replace(/\+/g, ' plus').replace(/[‘’“”]/g, ''));
    u.voice = v; u.lang = v.lang; u.rate = .95;
    // samme form som en lydfil, så stemningsmusikken skruer ned imens (se ambSync)
    const me = voice = { paused: false, ended: false, pause() { this.paused = true; try { speechSynthesis.cancel(); } catch (e) { } } };
    u.onend = u.onerror = () => { me.ended = true; if (voice === me) ambSync(); };
    speechSynthesis.cancel(); speechSynthesis.speak(u);
  } catch (e) { }
  ambSync();
}
function hush() { if (voice) { voice.pause(); voice = null; ambSync(); } }

function commands(list) {
  for (const c of list || []) {
    lastCmd = Math.max(lastCmd, c.n);
    const slot = st.mode === 'jukebox' || playing('B') || (st.quiz && st.mode === st.quiz.kind && st.quiz.phase === 'reveal') ? 'B' : 'A';
    try {
      if (c.cmd === 'pause') pause(slot);
      if (c.cmd === 'play') play(slot);
      if (c.cmd === 'skip') P[slot].seekTo(P[slot].getCurrentTime() + (c.arg || 15), true);
      if (c.cmd === 'vol') ['A', 'B', 'C'].forEach(k => P[k] && P[k].setVolume(Math.max(0, Math.min(100, c.arg))));
      if (c.cmd === 'polka' && st.quiz) { P.A && P.A.seekTo(0, true); play('A'); }
      if (c.cmd === 'say' && st.quiz && st.mode === 'pagne' && st.quiz.audio) say(st.quiz.audio, st.quiz.text);
    } catch (e) { }
  }
}

// ---------- menu på tv'et: OK åbner, pilene vælger, OK starter, tilbage lukker (eller klik med mus) ----------
let menuOn = false, menuI = 0, menuItems = [], menuNow = 0;
const host = (action, extra) => fetch(API + 'host', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.assign({ action }, extra)) }).then(r => r.json()).then(r => { if (r.error) msg(r.error); }).catch(() => { });
function buildMenu() {
  const s = st, z = s.quiz, m = s.mode, now = [];
  // det oplagte næste skridt står først, så OK-OK gør det
  if (z && m === z.kind) now.push(z.phase === 'ask' ? [ICO.eye, 'Afslør svaret', 'reveal'] : [ICO.next, 'Næste ' + QUNIT[z.kind], z.kind]);
  if (m === 'pak' && s.pak && s.pak.phase === 1) now.push([ICO.devil, 'Nu må I stjæle!', 'pakSteal']);
  if (m === 'jukebox') now.push([ICO.skip, 'Næste sang', 'jbNext']);
  menuNow = now.length;
  return now.concat([
    [ICO.tree, 'Julemusik', 'jukebox'], [ICO.music, QNAME.music, 'music'], [ICO.photo, QNAME.photo, 'photo'], [ICO.film, QNAME.emoji, 'emoji'], [ICO.flute, QNAME.pagne, 'pagne'], [ICO.face, QNAME.face, 'face'], [ICO.star, QNAME.pony, 'pony'],
    [ICO.kupon, 'Julekuponen', 'tips'], [ICO.gift, 'Pakkeleg', 'pak'], [ICO.glass, 'Skål!', 'skaal'], [ICO.siren, 'Snapsealarm', 'snaps'],
    [ICO.trophy, 'Stillingen', 'score'], [ICO.qr, 'Velkomst / QR', 'lobby'],
  ]).filter(x => hasKind(s, x[2]));
}
function drawMenu() {
  let el = $('#menu');
  if (!menuOn) { if (el) el.remove(); return; }
  if (!el) { el = document.createElement('div'); el.id = 'menu'; el.className = 'menu'; $('#tv').appendChild(el); }
  const d = st.done || {}, pg = st.progress || {};
  el.innerHTML = `<h2>Hvad skal vi?</h2><div class="tiles">${menuItems.map((x, i) => {
    const p = pg[x[2]], done = d[x[2]] && i >= menuNow;
    return `<div class="tile ${i === menuI ? 'on' : ''} ${done ? 'done' : ''}" data-i="${i}">${done ? ICO.check.replace('class="ico"', 'class="ico check"') : ''}${x[0]}${esc(x[1])}${p && p[0] && i >= menuNow ? `<small>${p[0]}/${p[1]}</small>` : ''}</div>`;
  }).join('')}</div><small class="dim">Pilene vælger · OK starter · Tilbage lukker</small>`;
}
// mus eller pegefjernbetjening: et klik på skærmen åbner menuen, et klik på en flise starter den, et klik ved siden af lukker
document.addEventListener('click', e => {
  if (!st || !$('#start').classList.contains('hidden') || e.target.closest('form,a,button,input')) return;
  const t = e.target.closest('.menu .tile');
  if (menuOn) { menuOn = false; drawMenu(); if (t) host(menuItems[+t.dataset.i][2]); return; }
  menuItems = buildMenu(); menuI = 0; menuOn = true; drawMenu();
});
document.addEventListener('keydown', e => {
  const k = e.key;
  // startskærmen: OK/Enter gør det samme som et klik
  if (!$('#start').classList.contains('hidden')) { if (k === 'Enter' || k === ' ') { start(); e.preventDefault(); } return; }
  if (!st || e.target.matches('input')) return;
  if (!menuOn) {
    if (k === 'Enter' || k === ' ' || k === 'ContextMenu') { menuItems = buildMenu(); menuI = 0; menuOn = true; drawMenu(); e.preventDefault(); }
    return;
  }
  const cols = 4;
  if (k === 'ArrowRight') menuI = Math.min(menuItems.length - 1, menuI + 1);
  else if (k === 'ArrowLeft') menuI = Math.max(0, menuI - 1);
  else if (k === 'ArrowDown') menuI = Math.min(menuItems.length - 1, menuI + cols);
  else if (k === 'ArrowUp') menuI = Math.max(0, menuI - cols);
  else if (k === 'Escape' || k === 'Backspace') { menuOn = false; }
  else if (k === 'Enter' || k === ' ') { const a = menuItems[menuI][2]; menuOn = false; drawMenu(); host(a); return; }
  else return;
  e.preventDefault(); drawMenu();
});

// ---------- løkke ----------
// Lang-polling: serveren svarer først, når noget er ændret (eller efter 25 s), så tv'et reagerer med det samme
// og ellers står helt stille – det giver ro til videoen.
let fails = 0;
async function poll() {
  const t0 = Date.now();
  const ctl = window.AbortController ? new AbortController() : null, giveUp = setTimeout(() => ctl && ctl.abort(), 40e3); // død forbindelse: prøv igen
  try {
    const r = await fetch(API + 'tv?c=' + lastCmd + (st ? '&v=' + st.v : ''), { cache: 'no-store', signal: ctl ? ctl.signal : undefined });
    clearTimeout(giveUp);
    if (r.status === 401) return loginView(); // ikke tilsluttet festen (endnu): bed om værtskoden
    if (r.status === 404) { st = null; $('#start').classList.add('hidden'); return stage(`<h1>Festen findes ikke længere</h1><a class="btn alt" href="${JF.base}/">Til forsiden</a>`); }
    const s = await r.json();
    fails = 0;
    // ny udgave af siden på serveren: hent den
    if (s.build) { if (!build) build = s.build; else if (s.build !== build) return location.reload(); }
    off = s.now - Date.now(); st = s;
    // kommandoer, der lå der, da siden åbnede, er gamle og springes over – alle senere udføres
    if (!booted) { booted = true; if (s.cmds && s.cmds.length) lastCmd = Math.max(...s.cmds.map(c => c.n)); }
    else commands(s.cmds);
    draw(); skaal(); snaps(); pina(); ambSync(); snapsWarm(); pinaWarm();
    // sneen holder pause, når en video, et billede eller en alarm dækker den
    if (window.snow) snow(!(skaalOn || snapsOn || pinaOn || !$('#vid').classList.contains('hidden') || (s.mode === 'photo' && s.quiz)));
  } catch (e) { if (++fails === 4) msg('Ingen forbindelse til serveren – prøver igen …'); }
  clearTimeout(giveUp);
  setTimeout(poll, fails ? 1500 : Math.max(0, 250 - (Date.now() - t0)));
}

// ---------- adgang ----------
// Storskærmen skal have værtens adgang: enten er den åbnet fra værtssiden på samme enhed, parret fra /tv – eller også
// skrives værtskoden her. Koden kan også stå efter # i adressen (linket "storskærm" fra værtssiden).
async function login(kode) {
  const r = await fetch(API + 'login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kode }) }).then(x => x.json()).catch(() => ({ error: 'Ingen forbindelse til serveren.' }));
  if (r.error) return loginView(r.error);
  stageHtml = null; stage(''); poll();
}
function loginView(err) {
  st = null; $('#start').classList.add('hidden');
  stage(`<h1>Tilslut storskærmen</h1><p class="dim">Skriv festens værtskode. Har skærmen intet tastatur, så vælg parring i stedet.</p>
    <form id="lf" class="login"><input id="lk" placeholder="Værtskode" autocomplete="off" autocapitalize="characters" spellcheck="false"><button class="btn">Tilslut</button></form>
    ${err ? `<div class="err">${esc(err)}</div>` : ''}<a class="btn alt" href="${JF.base}/tv">Par med værtens telefon</a>`);
  $('#lf').onsubmit = e => { e.preventDefault(); try { ac().resume(); } catch (e) { } login($('#lk').value); };
  $('#lk').focus();
}

// browsere kræver ét klik (eller OK på fjernbetjeningen), før der må spilles lyd
// hold skærmen tændt, så længe storskærmen er åben (en bærbar ville ellers gå i dvale midt i festen)
let lock = null;
async function awake() { try { if (!lock && navigator.wakeLock) { lock = await navigator.wakeLock.request('screen'); lock.addEventListener('release', () => { lock = null; }); } } catch (e) { } }
document.addEventListener('visibilitychange', () => { if (!document.hidden) awake(); });
function start() {
  $('#start').classList.add('hidden');
  try { ac().resume(); } catch (e) { }
  awake();
  // YouTube afviser mange musikvideoer på sider, der er åbnet via en ip-adresse (fejl 150) – sig det med det samme
  if (/^\d+\.\d+\.\d+\.\d+$/.test(location.hostname)) msg('Storskærmen er åbnet via en IP-adresse – så afviser YouTube mange videoer. Åbn den via localhost på computeren eller via et domæne.', 20000);
  try { const d = document.documentElement, f = d.requestFullscreen || d.webkitRequestFullscreen; if (f) { const p = f.call(d); if (p && p.catch) p.catch(() => { }); } } catch (e) { }
}
$('#start').classList.remove('hidden');
$('#start').onclick = e => { e.stopPropagation(); start(); }; // (klikket skal ikke også åbne menuen)
if (location.hash.length > 4) { const k = decodeURIComponent(location.hash.slice(1)); history.replaceState(null, '', location.pathname); login(k); }
else poll();
