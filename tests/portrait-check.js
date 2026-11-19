'use strict';
// Prüft: kein Zoomen, nur Hochformat (Hinweis im Querformat). Aufruf: NODE_PATH=<ordner mit playwright-core> node tests/portrait-check.js
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const exe = (() => { const b = path.join(os.homedir(), '.cache/ms-playwright'); const d = fs.readdirSync(b).find((x) => /^chromium-\d+$/.test(x)); const f = path.join(b, d); const sub = fs.readdirSync(f).find((x) => x.startsWith('chrome-')); return path.join(f, sub, 'chrome'); })();
let fails = 0, oks = 0; const ok = (c, m) => { if (c) oks++; else { fails++; console.error('FAIL', m); } };
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const scheme of ['light', 'dark']) {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 700 }, colorScheme: scheme, serviceWorkers: 'block', isMobile: true, hasTouch: true });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message));
    await p.goto(base + '#/heute'); await p.waitForSelector('.hero'); const t = scheme;
    const vp = await p.getAttribute('meta[name=viewport]', 'content');
    ok(vp.includes('user-scalable=no') && vp.includes('maximum-scale=1'), `${t}: Viewport verbietet Zoomen`);
    ok(await p.evaluate(() => getComputedStyle(document.documentElement).touchAction) === 'pan-x pan-y', `${t}: touch-action pan-x pan-y`);
    ok(await p.evaluate(() => { const e = new Event('gesturestart', { cancelable: true }); document.dispatchEvent(e); return e.defaultPrevented; }), `${t}: iOS-Zoomgeste abgefangen`);
    ok((await p.evaluate(() => fetch('manifest.webmanifest').then((r) => r.json()))).orientation === 'portrait', `${t}: Manifest orientation portrait`);
    ok(!(await p.locator('#rotate-hint').isVisible()), `${t}: Hochformat ohne Hinweis`);
    await p.setViewportSize({ width: 375, height: 340 }); await p.waitForTimeout(150);
    ok(!(await p.locator('#rotate-hint').isVisible()), `${t}: Tastatur im Hochformat (375x340) ohne Hinweis`);
    await p.setViewportSize({ width: 667, height: 375 }); await p.waitForTimeout(200);
    const c = await p.evaluate(() => { const r = document.querySelector('#rotate-hint').getBoundingClientRect(); return { full: r.width === innerWidth && r.height === innerHeight, vis: getComputedStyle(document.getElementById('view')).visibility, shown: getComputedStyle(document.querySelector('#rotate-hint')).display !== 'none' }; });
    ok(c.shown && c.full && c.vis === 'hidden', `${t}: Querformat 667x375: Hinweis deckt die App ab`);
    await p.setViewportSize({ width: 1024, height: 768 }); await p.waitForTimeout(150);
    ok(!(await p.locator('#rotate-hint').isVisible()), `${t}: Tablet 1024x768 ohne Hinweis`);
    await p.setViewportSize({ width: 375, height: 700 }); await p.waitForTimeout(150);
    ok(await p.evaluate(() => getComputedStyle(document.getElementById('view')).visibility) === 'visible', `${t}: zurück im Hochformat sichtbar`);
    ok(errs.length === 0, `${t}: JS-Fehler ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(fails ? `${fails} FEHLER, ${oks} OK` : `Alles in Ordnung (${oks} Prüfungen)`); process.exit(fails ? 1 : 0);
})();
