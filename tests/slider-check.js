'use strict';
// Prüft die gleitende Hinterlegung der Umschalter (Monat | Woche | Tag, Kategorien | Berichte | Verlauf), R7.17.
// Aufruf: NODE_PATH=<ordner mit playwright-core> node tests/slider-check.js
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const exe = (() => { const b = path.join(os.homedir(), '.cache/ms-playwright'); const d = fs.readdirSync(b).find((x) => /^chromium-\d+$/.test(x)); const f = path.join(b, d); const sub = fs.readdirSync(f).find((x) => x.startsWith('chrome-')); return path.join(f, sub, 'chrome'); })();
let fails = 0, oks = 0; const ok = (c, m) => { if (c) oks++; else { fails++; console.error('FAIL', m); } };
const geo = (p, id) => p.evaluate((id) => { const box = document.querySelector(`[data-slider="${id}"]`), ind = box.querySelector('.sl-ind'), cur = box.querySelector('[aria-current="page"]'); const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(ind.style.transform) || []; return { x: Number(m[1]), w: parseFloat(ind.style.width), h: parseFloat(ind.style.height), cx: cur.offsetLeft, cw: cur.offsetWidth, ch: cur.offsetHeight, n: box.querySelectorAll('.sl-ind').length }; }, id);
const samples = (p, id, ms = 700) => p.evaluate(([id, ms]) => new Promise((res) => { const out = []; const t0 = performance.now(); (function f() { const ind = document.querySelector(`[data-slider="${id}"] .sl-ind`); out.push(ind ? Math.round(new DOMMatrixReadOnly(getComputedStyle(ind).transform).m41) : -1); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res(out); })(); }), [id, ms]);
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const [w, h] of [[320, 640], [375, 667], [390, 844]]) for (const scheme of ['light', 'dark']) for (const reduce of [false, true]) {
    if (reduce && (w !== 375 || scheme !== 'dark')) continue;
    const tag = `${w}-${scheme}${reduce ? '-reduce' : ''}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, reducedMotion: reduce ? 'reduce' : 'no-preference', serviceWorkers: 'block', isMobile: true, hasTouch: true });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', (e) => errs.push(e.message));
    for (const [id, start, other, hrefs] of [['Zeitraum', '#/heute/monat', '#/heute/woche', ['#/heute/monat', '#/heute/woche', '#/heute/tag']], ['Ansicht', '#/umsaetze', '#/umsaetze/berichte', ['#/umsaetze', '#/umsaetze/berichte', '#/umsaetze/verlauf']]]) {
      await page.goto(base + start); await page.waitForSelector(`[data-slider="${id}"] .sl-ind`); await page.waitForTimeout(150);
      let g = await geo(page, id);
      ok(g.n === 1 && g.x === g.cx && g.w === g.cw && g.h === g.ch, `${tag} ${id}: Hinterlegung sitzt beim Start unter dem aktiven Eintrag (${g.x}/${g.w} statt ${g.cx}/${g.cw})`);
      const run = samples(page, id); await page.click(`[data-slider="${id}"] a[href="${other}"]`); const s = await run;
      g = await geo(page, id); const steps = s.filter((v, i) => i > 0 && v !== s[i - 1]).length;
      ok(g.x === g.cx && g.w === g.cw && g.n === 1, `${tag} ${id}: danach unter dem neuen Eintrag`);
      if (reduce) ok(new Set(s).size === 2, `${tag} ${id}: mit „Bewegung reduzieren“ springt sie sofort (${[...new Set(s)].join(', ')})`);
      else ok(steps >= 5 && s.some((v) => v > s[0] + 4 && v < g.cx - 4), `${tag} ${id}: gleitet in ${steps} Zwischenschritten (${s.filter((v, i) => i % 8 === 0).join(' → ')})`);
      // dritter Eintrag
      await page.click(`[data-slider="${id}"] a[href="${hrefs[2]}"]`); await page.waitForTimeout(500);
      g = await geo(page, id); ok(g.x === g.cx && g.w === g.cw, `${tag} ${id}: auch der dritte Eintrag`);
      // Seite verlassen und zurück: kein Altlast-Gleiten
      await page.evaluate(() => { location.hash = '#/einstellungen'; }); await page.waitForTimeout(200);
      await page.evaluate((x) => { location.hash = x; }, hrefs[2]); await page.waitForTimeout(150);
      g = await geo(page, id); ok(g.x === g.cx, `${tag} ${id}: nach dem Verlassen der Seite sofort an der richtigen Stelle`);
      // Größenänderung
      await page.setViewportSize({ width: w + 30, height: h }); await page.waitForTimeout(200);
      g = await geo(page, id); ok(g.x === g.cx && g.w === g.cw, `${tag} ${id}: nach Größenänderung stimmt die Position`);
      await page.setViewportSize({ width: w, height: h }); await page.waitForTimeout(150);
    }
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${tag}: kein horizontaler Scroll`);
    ok(errs.length === 0, `${tag}: JS-Fehler ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `${fails} FEHLER, ${oks} OK` : `Alles in Ordnung (${oks} Prüfungen)`); process.exit(fails ? 1 : 0);
})();
