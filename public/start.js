// Julefrokost – forsiden: deltag med koden fra tv'et, hold din egen fest, eller tilslut en storskærm.
'use strict';
const JF = document.documentElement.dataset;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const post = (p, b) => fetch(JF.base + p, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then(r => r.json());
// de fester, denne enhed er vært for (id, navn, værtskode) – så man kan finde tilbage til værtssiden
const mine = () => { try { return JSON.parse(localStorage.getItem('jf_mine') || '[]'); } catch { return []; } };

let info = { opretKode: false, fuldt: false }, view = 'start', err = '', made = null, busy = false;
function render() {
  const m = mine();
  let h = `<div style="text-align:center;padding-top:10px"><div class="kick">Festspil til storskærm og telefoner</div><h1 class="c">Julefrokost</h1></div>`;
  if (err) h += `<div class="err">${esc(err)}</div>`;
  if (view === 'made' && made) {
    // festen er oprettet: værtskoden vises kun her
    h += `<div class="paper made"><span class="kick">Festen er oprettet</span><h2>${esc(made.navn)}</h2>
      <p>Din <b>værtskode</b> – skriv den ned, den vises kun her:</p><div class="kode">${esc(made.kode)}</div>
      <p>Koden skal bruges, hvis du vil styre festen fra en anden enhed (fx din telefon), og når storskærmen skal tilsluttes. Gæsterne skal <b>ikke</b> have den – de får deres egen kode på storskærmen.</p></div>
      <a class="btn" href="${JF.base}/r/${esc(made.rum)}/vaert">Videre til værtssiden</a>`;
  } else if (view === 'ny') {
    h += `<div class="qhd"><h3>Hold din egen fest</h3><small class="dim">Du får en værtsside til at styre legene, en storskærm til tv'et og en kode, gæsterne deltager med fra telefonen. Gæster, julekupon og egne billeder lægger du ind bagefter.</small></div>
      <form id="nyf" class="col"><input id="navn" placeholder="Festens navn, fx Julefrokost hos Anna" maxlength="40" value="Julefrokost">
      ${info.opretKode ? '<input id="ok" placeholder="Kode til at oprette en fest" autocomplete="off">' : ''}
      <button class="btn" ${busy ? 'disabled' : ''}>Opret festen</button></form>
      ${info.opretKode ? '<small class="dim">Koden til at oprette en fest får du af den, der driver siden.</small>' : ''}
      <button class="btn alt" data-v="start">Tilbage</button>`;
  } else {
    h += `<form id="jf" class="col"><p class="dim" style="text-align:center;margin:0">Er du gæst? Skriv koden, der står på tv'et</p>
      <input id="kode" placeholder="KODE" maxlength="4" autocomplete="off" autocapitalize="characters" spellcheck="false" class="bigcode" value="${esc((new URLSearchParams(location.search).get('k') || '').toUpperCase())}">
      <button class="btn">Deltag</button></form>
      ${m.length ? `<div class="card"><small class="dim">Dine fester på denne enhed</small>${m.map(x => `<a class="wish" href="${JF.base}/r/${esc(x.rum)}/vaert"><span>${esc(x.navn || 'Julefrokost')}</span><span class="dim">Værtssiden →</span></a>`).join('')}</div>` : ''}
      <div class="col" style="margin-top:auto"><button class="btn alt" data-v="ny" ${info.fuldt ? 'disabled' : ''}>${ICO.star} Hold din egen fest</button>
      <a class="btn alt" href="${JF.base}/tv">${ICO.tv} Tilslut en storskærm (tv)</a>
      <small class="dim" style="text-align:center"><a href="${JF.base}/kilder">Billedkilder og licenser</a></small></div>`;
  }
  $('#app').innerHTML = h;
}
document.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) { view = b.dataset.v; err = ''; render(); } });
document.addEventListener('submit', async e => {
  e.preventDefault();
  if (busy) return;
  if (e.target.id === 'jf') {
    const k = $('#kode').value.trim().toUpperCase();
    if (k.length < 4) { err = 'Skriv de fire bogstaver fra tv\'et.'; return render(); }
    const r = await fetch(JF.base + '/api/find?k=' + encodeURIComponent(k)).then(x => x.json()).catch(() => ({ error: 'Ingen forbindelse.' }));
    if (r.error) { err = r.error; return render(); }
    location.href = JF.base + '/r/' + r.rum + '?k=' + encodeURIComponent(k);
  }
  if (e.target.id === 'nyf') {
    const navn = $('#navn').value.trim() || 'Julefrokost', ok = $('#ok') ? $('#ok').value : '';
    busy = true; render();
    const r = await post('/api/opret', { navn, opretKode: ok }).catch(() => ({ error: 'Ingen forbindelse.' }));
    busy = false;
    if (r.error) { err = r.error; return render(); }
    try {
      localStorage.setItem('jf_mine', JSON.stringify([{ rum: r.rum, navn }, ...mine().filter(x => x.rum !== r.rum)].slice(0, 10)));
      localStorage.setItem('jf_' + r.rum + '_kode', r.kode);
    } catch { }
    made = { ...r, navn }; view = 'made'; err = ''; render();
  }
});
if (new URLSearchParams(location.search).has('ukendt')) err = 'Den fest findes ikke (længere).';
render();
fetch(JF.base + '/api/info').then(r => r.json()).then(i => { info = i; if (view !== 'made') render(); }).catch(() => { });
