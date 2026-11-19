// Sne i baggrunden. Holdt let: højst 30 billeder i sekundet, alle fnug tegnes i ét strøg, og sneen
// stopper helt, når fanen er skjult, eller når noget dækker den – snow(false), fx mens en video fylder tv-skærmen.
(function () {
  const c = document.getElementById('snow'); if (!c) return;
  const x = c.getContext('2d'), gap = 33;
  let W, H, F = [], on = true, last = 0;
  const size = () => { W = c.width = innerWidth; H = c.height = innerHeight; F = Array.from({ length: Math.min(140, Math.round(W * H / 9000)) }, () => ({ x: Math.random() * W, y: Math.random() * H, r: Math.random() * 2.4 + .6, s: Math.random() * .6 + .3, d: Math.random() * 6.28 })); };
  size(); addEventListener('resize', size);
  function loop(t) {
    if (!on) return;
    requestAnimationFrame(loop);
    if (t - last < gap) return;
    const k = Math.min(4, (t - last) / 16.7); last = t; // samme faldhastighed, uanset hvor tit der tegnes
    x.clearRect(0, 0, W, H); x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath();
    for (const f of F) {
      f.y += f.s * k; f.d += .01 * k; f.x += Math.sin(f.d) * .4 * k;
      if (f.y > H) { f.y = -4; f.x = Math.random() * W; }
      x.moveTo(f.x + f.r, f.y); x.arc(f.x, f.y, f.r, 0, 6.28);
    }
    x.fill();
  }
  requestAnimationFrame(loop);
  window.snow = v => { v = !!v; if (v === on) return; on = v; c.style.display = v ? '' : 'none'; if (v) { last = performance.now(); requestAnimationFrame(loop); } };
})();
