'use strict';
// Prüft die Oberfläche in Handy-Viewports (hell/dunkel): Fehler in der Konsole, horizontaler Scroll, Abläufe.
// Aufruf: NODE_PATH=<ordner mit playwright-core> node tests/ui-check.js [Ausgabeordner] [csv]
const { chromium } = require('playwright-core');
const http = require('http'), fs = require('fs'), path = require('path'), os = require('os');
const root = path.join(__dirname, '..'), out = process.argv[2] || fs.mkdtempSync(path.join(os.tmpdir(), 'finanz-ui-'));
const csv = process.argv[3] || path.join(root, 'VR-Bank-Beispiel-CV');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const srv = http.createServer((q, s) => { let p = path.join(root, decodeURIComponent(q.url.split('?')[0])); if (p.endsWith('/')) p += 'index.html'; fs.readFile(p, (e, d) => { if (e) { s.writeHead(404); s.end(); return; } s.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' }); s.end(d); }); });
const exe = (() => { const b = path.join(os.homedir(), '.cache/ms-playwright'); const d = fs.readdirSync(b).find((x) => /^chromium-\d+$/.test(x)); const f = path.join(b, d); const sub = fs.readdirSync(f).find((x) => x.startsWith('chrome-')); return path.join(f, sub, 'chrome'); })();
let fails = 0; const bad = (m) => { fails++; console.error('FAIL', m); };
(async () => {
  await new Promise((r) => srv.listen(0, '127.0.0.1', r)); const base = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
  for (const [w, h] of [[375, 667], [390, 844]]) for (const scheme of ['light', 'dark']) {
    const tag = `${w}-${scheme}`, ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: scheme, serviceWorkers: 'block', deviceScaleFactor: 1 });
    await ctx.route(/supabase\.co/, (r) => r.abort());
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message)); page.on('console', (m) => { if (m.type() === 'error' && !/supabase|Failed to load resource|ERR_FAILED/.test(m.text())) errs.push('console: ' + m.text()); });
    await page.goto(base + '#/heute'); await page.waitForSelector('.hero');
    const check = async (name) => {
      await page.waitForTimeout(120);
      const o = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, small: [...document.querySelectorAll('button,a.btn,a.tx,.chip-filter,.seg a,select,input:not([type=checkbox])')].filter((e) => { const r = e.getBoundingClientRect(); return r.width && r.height && !e.classList.contains('infolink') && (r.height < 43.5) && !e.closest('[hidden]') && getComputedStyle(e).visibility !== 'hidden'; }).map((e) => (e.getAttribute('aria-label') || e.textContent || e.id).trim().slice(0, 30)) }));
      if (o.sw > o.iw) bad(`${tag} ${name}: horizontaler Scroll (${o.sw} > ${o.iw})`);
      if (o.small.length) bad(`${tag} ${name}: Tippfläche < 44 px: ${[...new Set(o.small)].join(', ')}`);
      await page.screenshot({ path: path.join(out, `${tag}-${name}.png`), fullPage: true });
    };
    const nav = async (hash, name) => { await page.evaluate((x) => { location.hash = x; }, hash); await page.waitForTimeout(60); await check(name); };
    await check('heute-leer');
    // 1. Import
    await page.setInputFiles('#csv-file', csv); await page.waitForSelector('#sheet[open]'); await check('import-fertig'); await page.click('#sheet [data-sheet-close].btn');
    // 2. Einkommen + Fixposten anlegen
    await nav('#/neu/einkommen', 'form-einkommen');
    await page.fill('#f-name', 'Zuschuss Dad'); await page.fill('#f-amount', '590'); await page.fill('#f-day', '30'); await page.fill('#f-tol', '2'); await page.fill('#f-match', 'richtberg martin'); await page.click('.gform [type=submit]'); await page.waitForSelector('.kv');
    await nav('#/neu/fix', 'form-fix2'); await page.click('.gform [type=submit]'); // leer: Fehler
    if (!(await page.textContent('#e-name')).includes('Bitte')) bad(`${tag} Formularfehler fehlt`);
    // Beispiel-Abbuchung wählen: Entwurf bleibt erhalten, Erkennung wird vorbelegt
    await page.fill('#f-name', 'Strom'); await page.click('[data-act=open-picker]'); await page.waitForSelector('#pklist .tx'); await check('beispiel-wahl');
    await page.click('#pklist .tx'); await page.waitForSelector('#f-example', { state: 'attached' }); await check('form-fix-mit-beispiel');
    if (!(await page.inputValue('#f-example'))) bad(`${tag} Beispiel-Buchung nicht übernommen`);
    if ((await page.inputValue('#f-name')) !== 'Strom') bad(`${tag} Entwurf (Name) ging verloren`);
    if (!(await page.inputValue('#f-match')).trim()) bad(`${tag} Erkennungstext nicht vorbelegt`);
    await page.fill('#f-amount', '1,5'); await page.fill('#f-day', '3'); await page.click('.gform [type=submit]');
    for (const r of ['heute/tag', 'heute/woche', 'heute/monat', 'umsaetze', 'umsaetze/verlauf', 'umsaetze/berichte', 'plan', 'plan/geplant', 'plan/ziele', 'zuordnen', 'rueckblick', 'neu', 'neu/ausgabe', 'neu/einnahme', 'neu/geplant', 'neu/einkommen', 'neu/ziel', 'neu/regel', 'einstellungen', 'einstellungen/konto', 'einstellungen/warnungen', 'einstellungen/bank', 'einstellungen/konten', 'einstellungen/regeln', 'einstellungen/kategorien', 'einstellungen/budget']) await nav('#/' + r, r.replace('/', '-'));
    // 3. Umsatz öffnen, Regel anlegen
    await nav('#/umsaetze/verlauf', 'verlauf'); await page.fill('#q', 'dad'); await page.waitForTimeout(60); await page.click('#txlist a.tx');
    await page.waitForSelector('#tx-form'); await check('tx-detail'); await page.selectOption('#f-cat', 'einkommen'); await page.check('#f-rule'); await check('tx-regel'); await page.click('#tx-form [type=submit]');
    await page.waitForSelector('#txlist'); await nav('#/einstellungen/regeln', 'regeln-nach'); if (!(await page.textContent('#view')).includes('Einkommen')) bad(`${tag} Regel nicht in der Liste`);
    // 3b. Zuordnen: Regel für eine Gruppe merken
    await nav('#/zuordnen', 'zuordnen-liste'); const hasGroup = await page.$('[data-act=group-rule]'); if (hasGroup) { await page.click('[data-act=group-rule]'); await page.waitForTimeout(100); }
    // 3c. Sparziel und Einzahlen als eigene Seite
    await nav('#/neu/ziel', 'form-ziel'); await page.fill('#f-name', 'Urlaub'); await page.fill('#f-target', '2.500'); await page.fill('#f-saved', '100'); await page.click('.gform [type=submit]'); await page.waitForSelector('.goal');
    if (!(await page.textContent('.goal')).includes('2.500,00')) bad(`${tag} 2.500 als Zielbetrag falsch gelesen`);
    await page.click('.goal a.btn'); await page.waitForSelector('#f-amount'); await check('form-einzahlung'); await page.fill('#f-amount', '50'); await page.click('.gform [type=submit]'); await page.waitForSelector('.goal');
    // 4. Geplante Zahlung
    await nav('#/neu/geplant', 'form-geplant'); await page.fill('#f-name', 'Klarna'); await page.fill('#f-amount', '80'); await page.click('.gform [type=submit]'); await page.waitForSelector('.tx'); await check('plan-geplant');
    await nav('#/heute/tag', 'heute-mit-plan');
    const big = await page.textContent('.hero .big'); console.log(tag, 'Heute übrig:', big.trim());
    // Verlauf: Filter hinter dem Knopf; Fixkosten ab 3 hinter „Mehr anzeigen“
    await nav('#/umsaetze/verlauf', 'verlauf-filter-zu');
    if (!(await page.isHidden('#filter-menu'))) bad(`${tag} Filter-Menü ist offen, obwohl es zu sein sollte`);
    await page.click('[data-act=filter-toggle]'); await page.waitForTimeout(120); await check('verlauf-filter-menue');
    if (await page.isHidden('#filter-menu')) bad(`${tag} Filter-Knopf öffnet das Menü nicht`);
    await page.click('[data-act=filter][data-k=ausgaben]'); await page.waitForTimeout(120);
    if (!(await page.isHidden('#filter-menu'))) bad(`${tag} Menü schließt sich nach der Auswahl nicht`);
    if (!(await page.textContent('.filter-btn .count')).trim()) bad(`${tag} Filter-Zähler fehlt`);
    await page.click('[data-act=filter-toggle]'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    if (!(await page.isHidden('#filter-menu'))) bad(`${tag} Escape schließt das Menü nicht`);
    await page.click('[data-act=filter-toggle]'); await page.click('[data-act=filter][data-k=alle]'); await page.waitForTimeout(80);
    for (const nm of ['Fix A', 'Fix B', 'Fix C', 'Fix D']) { await nav('#/neu/fix', 'form-fix-x'); await page.fill('#f-name', nm); await page.fill('#f-amount', '10'); await page.fill('#f-day', '5'); await page.click('.gform [type=submit]'); await page.waitForTimeout(150); }
    await nav('#/plan', 'plan-fix-mehr');
    if ((await page.$$eval('.list-block .tx', (e) => e.length)) < 1) bad(`${tag} Plan zeigt keine Fixkosten`);
    if (!(await page.$('.tease'))) bad(`${tag} angeschnittene nächste Fixkosten-Karte fehlt`);
    const mehr = await page.$('[data-act=fix-more]'); if (!mehr) bad(`${tag} „Mehr anzeigen“ fehlt bei mehr als 3 Fixkosten`); else { await mehr.click(); await page.waitForTimeout(80); await check('plan-fix-alle'); await page.click('[data-act=fix-more]'); }
    // Torte: Antippen zeigt den Namen; Zurück-Verhalten (Übersicht → Kategorien → Kategorie → Umsatz → zurück / speichern)
    await nav('#/umsaetze/kategorien', 'torte-start');
    const sliceName = await page.getAttribute('.pie .slice', 'data-name'); await page.click('.pie .slice');
    if ((await page.textContent('.pie .pc-main')).trim() !== sliceName) bad(`${tag} Torte zeigt den Namen nicht`);
    await check('torte-gewaehlt'); await page.click('.pie .slice');
    await page.click('a.catrow'); await page.waitForSelector('a.tx'); const catHash = await page.evaluate(() => location.hash);
    await page.click('a.tx'); await page.waitForSelector('#tx-form'); await page.click('.page-head .back'); await page.waitForTimeout(150);
    if ((await page.evaluate(() => location.hash)) !== catHash) bad(`${tag} Zurück führte nicht zur Kategorie-Seite`);
    await page.click('a.tx'); await page.waitForSelector('#tx-form'); await page.click('#tx-form [type=submit]'); await page.waitForTimeout(250);
    if ((await page.evaluate(() => location.hash)) !== catHash) bad(`${tag} Nach dem Speichern nicht zurück bei der Kategorie-Seite`);
    await page.click('.page-head .back'); await page.waitForTimeout(150);
    if (!(await page.evaluate(() => location.hash)).startsWith('#/umsaetze/kategorien')) bad(`${tag} Zurück von der Kategorie führte nicht zur Kategorien-Übersicht`);
    // Budget blättern: Woche und Monat zurück, wieder auf jetzt
    await nav('#/heute/woche', 'budget-woche'); await page.click('[data-act=bnav][data-k="-1"]'); await page.waitForTimeout(100); await check('budget-woche-zurueck');
    if (await page.isDisabled('[data-act=bnow]')) bad(`${tag} Jetzt-Knopf nach dem Blättern deaktiviert`);
    await page.click('[data-act=bnow]'); await page.waitForTimeout(100);
    if (!(await page.isDisabled('[data-act=bnow]'))) bad(`${tag} Jetzt-Knopf bei aktuellem Zeitraum nicht deaktiviert`);
    await nav('#/heute/monat', 'budget-monat'); await page.click('[data-act=bnav][data-k="-1"]'); await page.waitForTimeout(100); await check('budget-monat-zurueck'); await page.click('[data-act=bnow]');
    await nav('#/heute/tag', 'budget-tag');
    // Eigene Regel mit Beispiel-Umsatz
    await nav('#/neu/regel', 'form-regel'); await page.click('[data-act=open-picker]'); await page.waitForSelector('#pklist .tx'); await check('beispiel-wahl-regel');
    await page.click('#pklist .tx'); await page.waitForSelector('#f-example', { state: 'attached' }); await check('form-regel-mit-beispiel');
    if (!(await page.inputValue('#f-example'))) bad(`${tag} Regel: Beispiel nicht übernommen`);
    if (!(await page.inputValue('#f-text')).trim()) bad(`${tag} Regel: Suchtext nicht vorbelegt`);
    await page.selectOption('#f-cat', 'essen'); await page.click('.gform [type=submit]'); await page.waitForTimeout(250);
    // Fenster „So setzt sich das Budget zusammen“ für Tag, Woche, Monat
    for (const rg of ['tag', 'woche', 'monat']) { await nav('#/heute/' + rg, 'budget-' + rg); await page.click('[data-act=budget-info]'); await page.waitForSelector('#sheet[open]'); await check('budget-info-' + rg); await page.keyboard.press('Escape'); await page.waitForTimeout(100); }
    // Warnungen ausblenden, wieder einblenden, löschen
    await nav('#/einstellungen/warnungen', 'warn-liste');
    if (await page.$('[data-act=warn-hide]')) {
      const n0 = await page.$$eval('.warn-card', (c) => c.length);
      await page.click('[data-act=warn-hide]'); await page.waitForTimeout(100);
      if (!(await page.textContent('#warn-hidden summary')).includes('(1)')) bad(`${tag} Ausgeblendet-Zähler zeigt nicht 1`);
      await page.click('#warn-hidden summary'); await page.waitForTimeout(100); await check('warn-ausgeblendet');
      await page.click('[data-act=warn-show]'); await page.waitForTimeout(100);
      if ((await page.$$eval('.warn-card', (c) => c.length)) !== n0) bad(`${tag} Einblenden stellt die Warnung nicht wieder her`);
      await page.click('[data-act=warn-del]'); await page.waitForTimeout(100);
      if (await page.$('.warn-card [data-act=warn-hide]')) bad(`${tag} Gelöschte Warnung steht noch in der Liste`);
    } else bad(`${tag} keine Warnung zum Testen vorhanden`);
    if (errs.length) bad(`${tag}: ${errs.join(' | ')}`);
    await ctx.close();
  }
  await browser.close(); srv.close(); console.log('Screenshots:', out); process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
