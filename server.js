'use strict';
// Julefrokost – serveren. Ren Node.js uden pakker:  node server.js
//
// Én server kan holde mange fester ("rum"). Hver fest har sin egen adresse (/r/<id>), sin egen deltagerkode (den, gæsterne
// skriver eller scanner), sin egen værtskode og sin egen mappe med tilstand og billeder (data/rum/<id>/).
//   /                 forside: deltag med kode, hold din egen fest, tilslut en storskærm
//   /tv               storskærm uden tastatur (smart-tv): viser en parringskode, som værten skriver på sin telefon
//   /r/<id>           gæsternes side (telefon)
//   /r/<id>/tv        storskærmen          (kræver værtskode eller parring)
//   /r/<id>/vaert     værtens fjernbetjening (kræver værtskode)
// Indstillinger: miljøvariabler eller config.json ved siden af denne fil – se README.md.
if (+process.versions.node.split('.')[0] < 18) { console.error('Julefrokost kræver Node.js 18 eller nyere (helst 20+) – du har ' + process.versions.node + '. Hent en ny på https://nodejs.org'); process.exit(1); }
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { createFest, randomCode } = require('./lib/fest');

// ---- indstillinger ----
let fileCfg = {};
try { fileCfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8')); } catch { }
const cfg = (env, key, d) => process.env[env] != null && process.env[env] !== '' ? process.env[env] : fileCfg[key] != null ? fileCfg[key] : d;
const PORT = +cfg('PORT', 'port', 8080);
// den adresse, gæsterne skal bruge udefra, fx https://fest.eksempel.dk – tom = find selv ud af det
const PUBLIC_URL = String(cfg('PUBLIC_URL', 'publicUrl', '')).replace(/\/+$/, '');
// ligger siden i en undermappe (https://eksempel.dk/julefrokost), er det stien her – ellers tom
const BASE = String(cfg('BASE', 'base', PUBLIC_URL ? new URL(PUBLIC_URL).pathname : '')).replace(/\/+$/, '');
const OPRET_KODE = String(cfg('OPRET_KODE', 'opretKode', '')); // sat = kun dem med koden kan oprette en fest
const TRUST_PROXY = /^(1|true|ja)$/i.test(String(cfg('TRUST_PROXY', 'trustProxy', ''))); // bag Cloudflare eller anden proxy
const MAX_RUM = +cfg('MAX_RUM', 'maxRum', 50);    // højst så mange fester på én gang
const RUM_DAGE = +cfg('RUM_DAGE', 'rumDage', 60); // en fest, ingen har rørt i så mange dage, slettes (med billeder)
const DATA = path.resolve(String(cfg('DATA', 'data', path.join(__dirname, 'data'))));
const PUB = path.join(__dirname, 'public');
const RUM_DIR = path.join(DATA, 'rum');
fs.mkdirSync(RUM_DIR, { recursive: true });

// de medfølgende billeder til årstalsquizzen (billeder/standard/kilder.json fortæller årstal, tekst og kilde)
const STD_DIR = path.join(__dirname, 'billeder', 'standard');
let STD = [];
try {
  STD = JSON.parse(fs.readFileSync(path.join(STD_DIR, 'kilder.json'), 'utf8'))
    .filter(x => x && /^[a-z0-9-]+\.(jpg|png|webp)$/.test(x.fil) && x.aar >= 1900 && fs.existsSync(path.join(STD_DIR, x.fil)));
} catch { }

// serverens egne ansigter til "Veer eller vellyst?": data/ansigter/foedsel og data/ansigter/porno. Ligger der billeder,
// har alle fester på serveren runden fra start (kan slås fra pr. fest). Mappen hører til data/ og er aldrig med i git.
const ANS_DIR = path.join(DATA, 'ansigter');

// hemmelighed til værtens adgangsbevis (laves første gang serveren starter)
const SECRET = (() => {
  const f = path.join(DATA, 'hemmelighed');
  try { const s = fs.readFileSync(f, 'utf8').trim(); if (s.length >= 32) return s; } catch { }
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s, { mode: 0o600 });
  return s;
})();

// ---- hjælpere ----
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.json': 'application/json; charset=utf-8' };
// YouTube-afspilleren kræver en henvisning (ellers fejl 153) – derfor strict-origin-when-cross-origin og ikke no-referrer
const SEC = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' };
const CSP = "default-src 'self'; script-src 'self' https://www.youtube.com https://s.ytimg.com; frame-src https://www.youtube-nocookie.com https://www.youtube.com; img-src 'self' data: blob: https://i.ytimg.com; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'";
function send(res, code, body, type, extra) {
  if (res.headersSent || res.writableEnded) return;
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...SEC, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}
/** Læs forespørgslens indhold – højst max bytes (ellers fejl 413). */
function readBody(req, max) {
  return new Promise((ok, fail) => {
    const chunks = []; let n = 0, over = false;
    req.on('data', c => {
      n += c.length;
      if (n > max) { over = true; chunks.length = 0; if (n > max * 4 + 1e6) req.destroy(); } else if (!over) chunks.push(c);
    });
    req.on('end', () => over ? fail(Object.assign(new Error('for stor'), { status: 413 })) : ok(Buffer.concat(chunks)));
    req.on('error', fail);
  });
}
async function json(req) {
  const b = await readBody(req, 64e3);
  try { const o = JSON.parse(b.toString('utf8') || '{}'); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch { return {}; }
}
const clientIp = req => String((TRUST_PROXY && (req.headers['cf-connecting-ip'] || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim())) || req.socket.remoteAddress || '');
const isHttps = req => TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() === 'https';
const safeEq = (a, b) => { a = Buffer.from(String(a)); b = Buffer.from(String(b)); return a.length === b.length && crypto.timingSafeEqual(a, b); };
// højst max forsøg pr. nøgle inden for ms
const hits = new Map();
function limited(key, max, ms) {
  const t = Date.now(), l = (hits.get(key) || []).filter(x => t - x < ms);
  if (l.length >= max) { hits.set(key, l); return true; }
  l.push(t); hits.set(key, l);
  return false;
}
setInterval(() => { const t = Date.now(); for (const [k, l] of hits) if (!l.length || t - l[l.length - 1] > 3600e3) hits.delete(k); }, 600e3).unref();
// computerens adresse på hjemmenettet (til QR-koden, når storskærmen er åbnet på localhost)
function lanIp() {
  const all = Object.values(os.networkInterfaces()).flat().filter(a => a && a.family === 'IPv4' && !a.internal).map(a => a.address);
  return all.find(a => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a)) || all[0] || null;
}
/** Den adresse, gæsterne skal bruge (uden afsluttende skråstreg). */
function origin(req) {
  if (PUBLIC_URL) return PUBLIC_URL;
  const host = /^[a-z0-9.\-:[\]]+$/i.test(req.headers.host || '') ? req.headers.host : 'localhost:' + PORT;
  // åbnet på selve computeren: telefonerne skal bruge computerens adresse på nettet
  if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(host)) { const ip = lanIp(); if (ip) return 'http://' + ip + ':' + PORT + BASE; }
  return (isHttps(req) ? 'https' : 'http') + '://' + host + BASE;
}
// et POST fra en fremmed side afvises (browseren sender Origin med)
function sameOrigin(req) {
  const o = req.headers.origin;
  if (!o) return true;
  try { const h = new URL(o).host; return h === req.headers.host || (!!PUBLIC_URL && h === new URL(PUBLIC_URL).host); } catch { return false; }
}

// ---- klientfilerne ----
// Version af klientfilerne: skifter, når en fil i public/ er ændret. Den står i adressen på script og css (som så kan
// gemmes længe af browser og proxy), og den sendes med tilstanden, så åbne sider genindlæser sig selv efter en opdatering.
let buildV = '', buildAt = 0;
function build() {
  if (Date.now() - buildAt < 5000) return buildV;
  let h = 7;
  const walk = d => { for (const f of fs.readdirSync(d).sort()) { const s = fs.statSync(path.join(d, f)); if (s.isDirectory()) walk(path.join(d, f)); else h = (h * 31 + s.size + Math.round(s.mtimeMs / 1000)) % 2147483647; } };
  try { walk(PUB); } catch { }
  buildAt = Date.now();
  return (buildV = h.toString(36));
}
function file(res, f, cache, type) {
  fs.readFile(f, (e, b) => e ? send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8') : send(res, 200, b, type || MIME[path.extname(f).toLowerCase()] || 'application/octet-stream', { 'Cache-Control': cache }));
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
/** En af siderne i public/ med adresserne sat ind: {{base}} = sidens rod, {{s}} = klientfilerne, {{rum}} = festens id. */
function page(res, name, rum, code) {
  fs.readFile(path.join(PUB, name), 'utf8', (e, html) => {
    if (e) return send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8');
    const v = build();
    html = html.replace(/\{\{base\}\}/g, BASE).replace(/\{\{s\}\}/g, BASE + '/s/' + v).replace(/\{\{rum\}\}/g, esc(rum || '')).replace(/\{\{build\}\}/g, v);
    send(res, code || 200, html, MIME['.html'], { 'Cache-Control': 'no-cache', 'Content-Security-Policy': CSP });
  });
}

// ---- festerne ----
const rooms = new Map(); // id -> { id, dir, meta, fest, waiting }
const ID_ABC = 'abcdefghjkmnpqrstuvwxyz23456789', KODE_ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const pick = (abc, n) => Array.from({ length: n }, () => abc[crypto.randomInt(abc.length)]).join('');
const pretty = k => k.slice(0, 4) + '-' + k.slice(4);
const normKode = k => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
const hashKode = (kode, salt) => crypto.scryptSync(kode, salt, 32).toString('hex');
// deltagerkoden (fire bogstaver) skal være entydig på tværs af festerne – forsiden finder festen ud fra den
function freeCode() { for (;;) { const c = randomCode(); if (![...rooms.values()].some(r => r.fest.code() === c)) return c; } }
const saveMeta = r => { try { const t = path.join(r.dir, 'rum.json.tmp'); fs.writeFileSync(t, JSON.stringify(r.meta)); fs.renameSync(t, path.join(r.dir, 'rum.json')); } catch (e) { console.error('rum', e.message); } };
function openRoom(id, meta) {
  const dir = path.join(RUM_DIR, id);
  const r = { id, dir, meta, waiting: new Set(), fest: createFest({ dir, std: STD, stdDir: STD_DIR, ansDir: ANS_DIR, newCode: freeCode }) };
  r.fest.onChange(() => { for (const go of [...r.waiting]) go(); });
  rooms.set(id, r);
  return r;
}
function createRoom(navn) {
  let id; do { id = pick(ID_ABC, 5); } while (rooms.has(id) || fs.existsSync(path.join(RUM_DIR, id)));
  const kode = pick(KODE_ABC, 8), salt = crypto.randomBytes(16).toString('hex');
  fs.mkdirSync(path.join(RUM_DIR, id), { recursive: true });
  const r = openRoom(id, { id, oprettet: Date.now(), aktiv: Date.now(), salt, hash: hashKode(kode, salt) });
  saveMeta(r);
  if (navn) r.fest.host({ action: 'navn', navn });
  return { r, kode };
}
function deleteRoom(r) {
  r.fest.dispose();
  rooms.delete(r.id);
  for (const go of [...r.waiting]) go();
  // kun en mappe direkte under data/rum, og kun den, der hedder som festen
  if (path.dirname(r.dir) === RUM_DIR && path.basename(r.dir) === r.id) fs.rmSync(r.dir, { recursive: true, force: true });
}
// værten har rørt festen: husk hvornår (skrives højst én gang i timen)
function touch(r) { const t = Date.now(); if (t - r.meta.aktiv > 3600e3) { r.meta.aktiv = t; saveMeta(r); } }
for (const id of fs.readdirSync(RUM_DIR)) {
  try { const meta = JSON.parse(fs.readFileSync(path.join(RUM_DIR, id, 'rum.json'), 'utf8')); if (meta.id === id && meta.hash) openRoom(id, meta); } catch { }
}
// gamle fester ryddes væk – ved start og én gang i døgnet
function purge() {
  for (const r of [...rooms.values()]) if (Date.now() - r.meta.aktiv > RUM_DAGE * 864e5) { console.log('Sletter festen ' + r.id + ' – ikke brugt i ' + RUM_DAGE + ' dage'); deleteRoom(r); }
}
purge();
setInterval(purge, 864e5).unref();
setInterval(() => { for (const r of rooms.values()) r.fest.tick(); }, 500);

// værtens adgangsbevis: en cookie, der kun gælder festens egne adresser. Den afhænger af værtskoden, så en ny kode
// lukker alle gamle ude.
const token = r => crypto.createHmac('sha256', SECRET).update(r.id + '|' + r.meta.hash).digest('hex');
function isHost(req, r) {
  const m = new RegExp('(?:^|;\\s*)jf_' + r.id + '=([a-f0-9]{64})').exec(req.headers.cookie || '');
  return !!m && safeEq(m[1], token(r));
}
const cookie = (req, r, on) => ({ 'Set-Cookie': 'jf_' + r.id + '=' + (on ? token(r) : '') + '; Path=' + BASE + '/r/' + r.id + '; Max-Age=' + (on ? 90 * 86400 : 0) + '; HttpOnly; SameSite=Lax' + (isHttps(req) ? '; Secure' : '') });

// Lang-polling: klienten sender den version, den allerede har (?v=). Er der intet nyt, venter svaret, til noget ændrer sig
// (højst 25 s). Så reagerer tv og telefoner med det samme, og de spørger kun, når der er noget at hente.
let waitingAll = 0;
function hold(r, res, u, make) {
  const v = u.searchParams.get('v');
  if (v === null || +v !== r.fest.version() || r.waiting.size >= 150 || waitingAll >= 3000) return send(res, 200, make());
  let t = null;
  const done = () => { clearTimeout(t); if (r.waiting.delete(go)) waitingAll--; };
  const go = () => { done(); rooms.get(r.id) === r ? send(res, 200, make()) : send(res, 404, { error: 'Festen findes ikke længere.', gone: true }); };
  t = setTimeout(go, 25e3);
  r.waiting.add(go); waitingAll++;
  res.on('close', done);
}

// storskærm uden tastatur: tv'et viser en parringskode, værten skriver den på sin telefon, og tv'et får adgang til festen
const pairs = new Map(); // kode -> { noegle, at, rum }
const PAR_MS = 15 * 60e3;
setInterval(() => { for (const [k, p] of pairs) if (Date.now() - p.at > PAR_MS) pairs.delete(k); }, 60e3).unref();

// ---- forespørgsler ----
async function handle(req, res) {
  const u = new URL(req.url, 'http://x');
  let p = u.pathname;
  try { p = decodeURIComponent(p); } catch { return send(res, 400, 'Ugyldig adresse', 'text/plain; charset=utf-8'); }
  if (BASE) { if (p !== BASE && !p.startsWith(BASE + '/')) return send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8'); p = p.slice(BASE.length) || '/'; }
  const get = req.method === 'GET' || req.method === 'HEAD', post = req.method === 'POST', ip = clientIp(req);
  if (!get && !post) return send(res, 405, { error: 'Ukendt' });
  if (post && !sameOrigin(req)) return send(res, 403, { error: 'Afvist' });

  // klientfiler: /s/<version>/<fil>
  let m = /^\/s\/([a-z0-9]+)\/((?:vendor\/)?[A-Za-z0-9-]+(?:\.[a-z0-9]+)+)$/.exec(p);
  if (m && get) return m[2].endsWith('.html') ? send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8') : file(res, path.join(PUB, m[2]), m[1] === build() ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (get && p === '/') return page(res, 'index.html');
  if (get && p === '/tv') return page(res, 'par.html');
  if (get && p === '/kilder') return page(res, 'kilder.html');
  if (get && p === '/favicon.ico') return file(res, path.join(PUB, 'ikon.svg'), 'public, max-age=86400');
  // de medfølgende billeder (til kildesiden) og oplæsningen af citater, hvis lydfilerne er lavet (tools/citatlyd.js)
  if (get && (m = /^\/std\/([a-z0-9-]+\.(?:jpg|png|webp))$/.exec(p))) return STD.some(x => x.fil === m[1]) ? file(res, path.join(STD_DIR, m[1]), 'public, max-age=86400') : send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8');
  if (get && (m = /^\/lyd\/([a-z0-9]+\.m4a)$/.exec(p))) return file(res, path.join(PUB, 'lyd', m[1]), 'public, max-age=86400');

  if (p.startsWith('/api/')) {
    if (post && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Forkert format' });
    const key = (get ? 'GET' : 'POST') + ' ' + p;
    if (key === 'GET /api/info') return send(res, 200, { opretKode: !!OPRET_KODE, fuldt: rooms.size >= MAX_RUM, std: STD.length, build: build() });
    if (key === 'GET /api/kilder') return send(res, 200, STD);
    // forsiden: find festen ud fra deltagerkoden på tv'et
    if (key === 'GET /api/find') {
      if (limited('find ' + ip, 30, 60e3)) return send(res, 429, { error: 'For mange forsøg – vent et minut.' });
      const k = String(u.searchParams.get('k') || '').toUpperCase(), r = [...rooms.values()].find(x => x.fest.code() === k);
      return r ? send(res, 200, { rum: r.id }) : send(res, 200, { error: 'Den kode kender jeg ikke – tjek koden på tv\'et.' });
    }
    if (key === 'POST /api/opret') {
      const b = await json(req);
      if (OPRET_KODE) {
        if (limited('opretkode ' + ip, 10, 15 * 60e3)) return send(res, 429, { error: 'For mange forsøg – vent et kvarter.' });
        if (!safeEq(String(b.opretKode || '').trim(), OPRET_KODE)) return send(res, 200, { error: 'Forkert kode til at oprette en fest.' });
      }
      if (limited('opret ' + ip, 6, 3600e3)) return send(res, 429, { error: 'Du har oprettet mange fester – vent lidt.' });
      if (rooms.size >= MAX_RUM) return send(res, 200, { error: 'Der er ikke plads til flere fester lige nu.' });
      const { r, kode } = createRoom(String(b.navn || ''));
      return send(res, 200, { rum: r.id, kode: pretty(kode) }, null, cookie(req, r, true));
    }
    // storskærmen beder om en parringskode …
    if (key === 'POST /api/par') {
      if (limited('par ' + ip, 20, 10 * 60e3) || pairs.size > 5000) return send(res, 429, { error: 'For mange forsøg – vent lidt.' });
      let kode; do { kode = String(crypto.randomInt(1e6)).padStart(6, '0'); } while (pairs.has(kode));
      const noegle = crypto.randomBytes(16).toString('hex');
      pairs.set(kode, { noegle, at: Date.now(), rum: null });
      return send(res, 200, { kode, noegle, site: origin(req).replace(/^https?:\/\//, '') });
    }
    // … og spørger, om værten har skrevet den
    if (key === 'GET /api/par') {
      const kode = String(u.searchParams.get('kode') || ''), pr = pairs.get(kode);
      if (!pr || !safeEq(pr.noegle, String(u.searchParams.get('noegle') || '')) || Date.now() - pr.at > PAR_MS) return send(res, 200, { udloebet: true });
      const r = pr.rum && rooms.get(pr.rum);
      if (!r) return send(res, 200, { venter: true });
      pairs.delete(kode);
      return send(res, 200, { rum: r.id }, null, cookie(req, r, true));
    }
    return send(res, 404, { error: 'Ukendt' });
  }

  // ---- en bestemt fest: /r/<id>/… ----
  m = /^\/r\/([a-z0-9]{3,12})(?:\/(.*))?$/.exec(p);
  if (!m) return get ? page(res, 'index.html', '', 404) : send(res, 404, { error: 'Ukendt' });
  const r = rooms.get(m[1]), rest = m[2] || '';
  if (!r) return rest.startsWith('api/') || rest.startsWith('img/') ? send(res, 404, { error: 'Festen findes ikke længere.', gone: true }) : (res.writeHead(302, { Location: BASE + '/?ukendt=1', ...SEC }), res.end());
  const F = r.fest, key = (get ? 'GET' : 'POST') + ' ' + rest; // HEAD behandles som GET
  if (get && rest === '') return page(res, 'player.html', r.id);
  if (key === 'GET tv') return page(res, 'tv.html', r.id);
  if (key === 'GET vaert') return page(res, 'host.html', r.id);
  if (post && rest !== 'api/billede' && !(req.headers['content-type'] || '').includes('application/json')) return send(res, 415, { error: 'Forkert format' });

  // gæsterne – uden login, men med festens deltagerkode
  if (key === 'POST api/join') return send(res, 200, F.join(await json(req), ip));
  if (key === 'POST api/answer') { const b = await json(req); return send(res, 200, F.answer(String(b.token || ''), b.c)); }
  if (key === 'POST api/wish') { const b = await json(req); return send(res, 200, F.wish(String(b.token || ''), b)); }
  if (key === 'POST api/search') { const b = await json(req); return send(res, 200, await F.ytSearch(String(b.token || ''), b.q)); }
  if (key === 'POST api/tip') { const b = await json(req); return send(res, 200, F.tipsAnswer(String(b.token || ''), b)); }
  if (key === 'GET api/state') { const tok = String(u.searchParams.get('t') || ''); return hold(r, res, u, () => ({ ...F.view('player', tok), build: build() })); }
  // værten logger ind med værtskoden
  if (key === 'POST api/login') {
    if (limited('login ' + ip, 10, 15 * 60e3) || limited('login rum ' + r.id, 60, 15 * 60e3)) return send(res, 429, { error: 'For mange forsøg – vent et kvarter.' });
    const b = await json(req);
    if (!safeEq(hashKode(normKode(b.kode), r.meta.salt), r.meta.hash)) return send(res, 200, { error: 'Forkert værtskode.' });
    touch(r);
    return send(res, 200, { ok: true }, null, cookie(req, r, true));
  }
  if (key === 'POST api/logud') return send(res, 200, { ok: true }, null, cookie(req, r, false));

  // resten kun for værten (og storskærmen)
  if (!isHost(req, r)) return send(res, 401, { error: 'Skriv værtskoden.', login: true });
  touch(r);
  const links = () => ({ join: origin(req) + '/r/' + r.id + '?k=', site: origin(req).replace(/^https?:\/\//, ''), rum: r.id, build: build() });
  if (key === 'GET api/tv') { const c = +u.searchParams.get('c') || 0; return hold(r, res, u, () => ({ ...F.view('tv'), cmds: F.cmdsAfter(c), ...links() })); }
  if (key === 'GET api/host') return hold(r, res, u, () => ({ ...F.view('host'), ...links() }));
  if (key === 'POST api/host') return send(res, 200, F.host(await json(req)));
  // værten skriver koden, der står på en storskærm uden tastatur
  if (key === 'POST api/par') {
    if (limited('parvaert ' + r.id, 20, 10 * 60e3)) return send(res, 429, { error: 'For mange forsøg – vent lidt.' });
    const b = await json(req), pr = pairs.get(String(b.kode || '').replace(/\D/g, ''));
    if (!pr || Date.now() - pr.at > PAR_MS) return send(res, 200, { error: 'Den kode står ikke på nogen skærm lige nu – tjek tallene på tv\'et.' });
    pr.rum = r.id;
    return send(res, 200, { ok: true });
  }
  if (key === 'GET api/billeder') return send(res, 200, F.listPictures());
  if (key === 'POST api/billeder') {
    const b = await json(req);
    return send(res, 200, b.slet != null ? F.removePicture(b.slet) : b.flyt != null ? F.movePicture(b.flyt, b.aar) : { error: 'Ukendt' });
  }
  // et billede lægges ind: selve billedet er indholdet (JPG, PNG eller WebP – værtssiden skalerer det ned først)
  if (key === 'POST api/billede') {
    if (req.headers['x-jf'] !== '1') return send(res, 403, { error: 'Afvist' });
    if (limited('billede ' + r.id, 900, 3600e3)) return send(res, 429, { error: 'Mange billeder på kort tid – vent lidt.' });
    const buf = await readBody(req, 4e6);
    const a = u.searchParams.get('ansigt');
    return send(res, 200, F.addPicture(a != null ? { ansigt: a } : { aar: u.searchParams.get('aar') }, buf));
  }
  // ny værtskode (den gamle holder op med at virke – også på storskærmen, som skal tilsluttes igen)
  if (key === 'POST api/kode') {
    const kode = pick(KODE_ABC, 8);
    r.meta.salt = crypto.randomBytes(16).toString('hex'); r.meta.hash = hashKode(kode, r.meta.salt); saveMeta(r);
    return send(res, 200, { kode: pretty(kode) }, null, cookie(req, r, true));
  }
  if (key === 'POST api/slet') {
    const b = await json(req);
    if (b.bekraeft !== 'SLET') return send(res, 200, { error: 'Skriv SLET for at slette festen.' });
    deleteRoom(r);
    return send(res, 200, { ok: true }, null, cookie(req, r, false));
  }
  if (get && rest.startsWith('img/')) {
    const f = F.picFile(rest.slice(4));
    return f ? file(res, f, 'private, max-age=86400') : send(res, 404, 'Ikke fundet', 'text/plain; charset=utf-8');
  }
  return send(res, 404, { error: 'Ukendt' });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch(e => {
    if (e && e.status === 413) return send(res, 413, { error: 'Det er for stort.' });
    console.error(req.method, req.url.split('?')[0], e);
    send(res, 500, { error: 'Fejl på serveren' });
  });
});
server.listen(PORT, () => {
  const ip = lanIp();
  console.log('Julefrokost kører (' + rooms.size + (rooms.size === 1 ? ' fest' : ' fester') + ', ' + STD.length + ' medfølgende billeder).');
  console.log('  Åbn på denne computer:      http://localhost:' + PORT + BASE);
  if (PUBLIC_URL) console.log('  Gæsterne bruger:            ' + PUBLIC_URL);
  else if (ip) console.log('  Telefoner på samme wifi:    http://' + ip + ':' + PORT + BASE + '   (QR-koden på storskærmen peger herhen)');
  if (OPRET_KODE) console.log('  Kun dem med opret-koden kan oprette en fest.');
});
// gem alt, før serveren lukker
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { for (const r of rooms.values()) r.fest.flush(); process.exit(0); });
