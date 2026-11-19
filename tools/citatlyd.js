#!/usr/bin/env node
// Laver oplæsningen til "Flaske eller frøken?" som lydfiler: én pr. citat i public/lyd/citatNN.m4a (NN = citatets plads
// i PAGNE-listen i lib/fest.js). Kører kun på en Mac (bruger "say" med en dansk stemme og "afconvert").
//   node tools/citatlyd.js            (STEMME=Sara TEMPO=165 kan ændres med miljøvariabler)
// Det er valgfrit: uden lydfilerne læser browserens egen danske stemme citaterne op. Filerne er til eget brug – macOS'
// stemmer må ikke deles videre offentligt, og mappen public/lyd/ er derfor holdt ude af git.
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const VOICE = process.env.STEMME || 'Sara', RATE = process.env.TEMPO || '165';
const { PAGNE } = require('../lib/fest');
const out = path.join(__dirname, '..', 'public', 'lyd');
fs.mkdirSync(out, { recursive: true });
for (const f of fs.readdirSync(out)) if (/^citat\d+\.m4a$/.test(f)) fs.unlinkSync(path.join(out, f));
PAGNE.forEach(([text], i) => {
  // det, stemmen ikke kan sige: udeladelsen bliver en pause, plusset bliver læst op
  const spoken = text.replace(/\(…\)/g, ', [[slnc 350]]').replace(/…/g, ', [[slnc 350]]').replace(/\+/g, ' plus').replace(/[‘’]/g, '');
  const tmp = path.join(os.tmpdir(), 'citat' + i + '.aiff'), file = path.join(out, 'citat' + String(i + 1).padStart(2, '0') + '.m4a');
  // et kort stille stykke først, så det første ord ikke klippes
  execFileSync('say', ['-v', VOICE, '-r', RATE, '-o', tmp, '[[slnc 400]] ' + spoken]);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac@44100', '-c', '1', '-b', '64000', tmp, file]); // 44,1 kHz mono
  fs.unlinkSync(tmp);
  console.log(path.basename(file), Math.round(fs.statSync(file).size / 1024) + ' kB', text.slice(0, 50));
});
