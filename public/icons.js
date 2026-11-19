// Julefrokost – fælles ikoner (streg-SVG) og svarformerne, der er ens på tv og telefon.
'use strict';
const ICO = (() => {
  const s = (d, extra = '') => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"${extra}>${d}</svg>`;
  return {
    star: s('<path d="M12 2.5l2.6 6.3 6.8.6-5.2 4.4 1.6 6.6L12 16.9l-5.8 3.5 1.6-6.6-5.2-4.4 6.8-.6z"/>'),
    music: s('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
    photo: s('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="2"/><path d="M21 16l-5-5-8 8"/>'),
    flute: s('<path d="M8.5 3h7l-.8 7.2a2.7 2.7 0 0 1-5.4 0z"/><path d="M12 13v7M9 21h6"/><circle cx="11" cy="6.5" r=".4"/><circle cx="13" cy="8.5" r=".4"/>'),
    face: s('<circle cx="12" cy="12" r="9"/><path d="M7.8 9.4l2.2 1M16.2 9.4l-2.2 1"/><ellipse cx="12" cy="15.3" rx="2.1" ry="2.6"/>'),
    film: s('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>'),
    kupon: s('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/>'),
    gift: s('<rect x="3" y="8" width="18" height="13" rx="1.5"/><path d="M12 8v13M3 12h18M12 8c-2-4-6-4-6-1.5S10 8 12 8zm0 0c2-4 6-4 6-1.5S14 8 12 8z"/>'),
    glass: s('<path d="M6 3h12l-1.5 17a1 1 0 0 1-1 1h-7a1 1 0 0 1-1-1z"/><path d="M6.6 9h10.8"/>'),
    siren: s('<path d="M6 18v-6a6 6 0 0 1 12 0v6"/><path d="M4 18h16v3H4zM12 2v2M4.2 5.2l1.4 1.4M19.8 5.2l-1.4 1.4"/>'),
    trophy: s('<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4"/>'),
    qr: s('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M14 14h3v3h-3zM20 14v.01M14 20h.01M17 20h4v-3"/>'),
    tree: s('<path d="M12 2l5 7h-3l4 6h-4l3 5H7l3-5H6l4-6H7z"/><path d="M12 20v2"/>'),
    check: s('<path d="M5 12.5l4.5 4.5L19 7.5"/>', ' stroke-width="3"'),
    eye: s('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    next: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    play: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5l12 7-12 7z"/></svg>',
    pause: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>',
    skip: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 5l10 7-10 7z"/><rect x="16" y="5" width="3" height="14" rx="1"/></svg>',
    tv: s('<rect x="2" y="5" width="20" height="13" rx="2"/><path d="M8 21h8"/>'),
    devil: s('<circle cx="12" cy="13" r="7"/><path d="M6 8L4 3l5 3M18 8l2-5-5 3M9 12h.01M15 12h.01M9 16c2 1.5 4 1.5 6 0"/>'),
  };
})();
// svarformerne: cirkel, trekant, firkant, rombe – samme farve og form på tv og telefon
const SHAPE = ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M12 3l10 18H2z', 'M4 4h16v16H4z', 'M12 2l10 10-10 10L2 12z']
  .map(d => `<svg class="shape" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="currentColor"/></svg>`);
// Ældre tv-browsere kender ikke "gap" i flex-opstillinger – så får de vigtigste rækker almindelige margener (se fest.css).
(function () {
  try {
    var d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;row-gap:1px;position:absolute;visibility:hidden';
    d.appendChild(document.createElement('div')); d.appendChild(document.createElement('div'));
    document.documentElement.appendChild(d);
    if (d.scrollHeight !== 1) document.documentElement.className += ' nogap';
    document.documentElement.removeChild(d);
  } catch (e) { }
})();
