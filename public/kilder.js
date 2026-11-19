// Julefrokost – de medfølgende billeder til "Hvornår var det nu det var?" med fotograf, licens og link til kilden.
'use strict';
const JF = document.documentElement.dataset;
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const http = u => /^https?:\/\//.test(u || '') ? u : '';
fetch(JF.base + '/api/kilder').then(r => r.json()).then(l => {
  document.querySelector('#app').innerHTML = `<h1>Billedkilder</h1>
    <p><small>De medfølgende billeder til årstalsquizzen kommer fra Wikimedia Commons og må deles videre på de vilkår, der står ved hvert billede. Billederne er skaleret ned. Pas på: årstallene står her – kig ikke, hvis du selv skal gætte med.</small></p>
    ${l.length ? `<div class="klist">${l.map(x => `<figure><img loading="lazy" src="${JF.base}/std/${esc(x.fil)}" alt=""><figcaption><b>${esc(x.aar)} · ${esc(x.tekst)}</b><small>Foto: ${esc(x.foto || 'ukendt')} · ${http(x.licensUrl) ? `<a href="${esc(http(x.licensUrl))}" rel="noopener">${esc(x.licens)}</a>` : esc(x.licens)}${http(x.kilde) ? ` · <a href="${esc(http(x.kilde))}" rel="noopener">kilde</a>` : ''}</small></figcaption></figure>`).join('')}</div>` : '<p>Der følger ingen billeder med denne installation.</p>'}
    <p><small><a href="${JF.base}/">Til forsiden</a></small></p>`;
}).catch(() => { });
