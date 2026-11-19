#!/usr/bin/env node
// Skriver listen over de medfølgende billeder (billeder/standard/kilder.json) ind i KILDER.md – mellem de to mærker.
//   node tools/kilder.js      (kør igen, når billeder er lagt til eller fjernet)
'use strict';
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..'), md = path.join(root, 'KILDER.md');
const list = JSON.parse(fs.readFileSync(path.join(root, 'billeder', 'standard', 'kilder.json'), 'utf8')).sort((a, b) => a.aar - b.aar || a.fil.localeCompare(b.fil));
const cell = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\s+/g, ' ').trim();
const rows = list.map(x => `| ${x.aar} | ${cell(x.tekst)} | ${cell(x.foto) || 'ukendt'} | ${x.licensUrl ? `[${cell(x.licens)}](${x.licensUrl})` : cell(x.licens)} | [${cell(x.fil)}](${x.kilde}) |`);
const table = ['| År | Motiv | Foto | Licens | Kilde (Wikimedia Commons) |', '| --- | --- | --- | --- | --- |', ...rows].join('\n');
const A = '<!-- billeder:start -->', B = '<!-- billeder:slut -->';
const s = fs.readFileSync(md, 'utf8');
if (!s.includes(A) || !s.includes(B)) throw new Error('KILDER.md mangler mærkerne ' + A + ' og ' + B);
fs.writeFileSync(md, s.slice(0, s.indexOf(A) + A.length) + '\n' + table + '\n' + s.slice(s.indexOf(B)));
console.log(list.length + ' billeder skrevet til KILDER.md');
