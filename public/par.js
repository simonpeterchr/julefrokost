// Julefrokost – tilslut en storskærm uden tastatur (smart-tv): skærmen viser seks tal, værten skriver dem på værtssiden
// (knappen "Tilslut et tv"), og så skifter skærmen selv til festens storskærm.
'use strict';
const JF = document.documentElement.dataset;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let par = null;
async function ny() {
  try {
    par = await fetch(JF.base + '/api/par', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.json());
    if (par.error) throw new Error(par.error);
    $('#stage').innerHTML = `<div class="kick">Julefrokost · tilslut storskærm</div><h1>Skriv tallene på værtens telefon</h1>
      <div class="parkode">${esc(par.kode.slice(0, 3))} ${esc(par.kode.slice(3))}</div>
      <p class="dim">På værtssiden: tryk <b>Tilslut et tv</b> og skriv de seks tal.<br>Har du ikke oprettet en fest endnu? Åbn <b>${esc(par.site)}</b> på din telefon og vælg <b>Hold din egen fest</b>.</p>`;
    vent();
  } catch (e) { $('#stage').innerHTML = `<h1>Ingen forbindelse</h1><p class="dim">${esc(e.message || '')} Prøver igen om lidt …</p>`; setTimeout(ny, 8000); }
}
async function vent() {
  try {
    const r = await fetch(JF.base + '/api/par?kode=' + par.kode + '&noegle=' + par.noegle, { cache: 'no-store' }).then(x => x.json());
    if (r.rum) { location.href = JF.base + '/r/' + r.rum + '/tv'; return; }
    if (r.udloebet) return ny(); // koden gælder et kvarter – så kommer der en ny
  } catch (e) { }
  setTimeout(vent, 2000);
}
ny();
