'use strict';
// Läuft mit: node tests/core.test.js [pfad/zur/umsatz.csv]
const fs = require('fs'), path = require('path'), assert = require('assert');
const Fin = require('../core.js');
let ok = 0; const t = (n, f) => { try { f(); ok++; console.log('ok  ', n); } catch (e) { console.error('FAIL', n, '\n   ', e.message); process.exitCode = 1; } };

t('Betrag und Datum', () => {
  const r = Fin.importCsv('Buchungstag;Betrag;Name Zahlungsbeteiligter;Verwendungszweck\n17.11.2026;-1.234,56;Aldi;Einkauf\n');
  assert.equal(r.txs[0].amount, -1234.56); assert.equal(r.txs[0].date, '2026-11-17');
});
t('Fehlende Spalten melden einen Fehler', () => assert.ok(Fin.importCsv('a;b\n1;2').error));
t('Doppelte Buchungen bleiben zwei, Re-Import gleiche IDs', () => {
  const c = 'Buchungstag;Betrag;Name Zahlungsbeteiligter;Verwendungszweck\n01.11.2026;-5,00;X;Y\n01.11.2026;-5,00;X;Y\n';
  const a = Fin.importCsv(c), b = Fin.importCsv(c);
  assert.equal(new Set(a.txs.map((x) => x.id)).size, 2); assert.deepEqual(a.txs.map((x) => x.id), b.txs.map((x) => x.id));
});
const cat = (o) => Fin.categorize(Object.assign({ amount: -10, purpose: '', name: '' }, o)).cat;
t('Regeln: Supermarkt, PayPal-Händler, Abo, Tanken', () => {
  assert.equal(cat({ name: 'ALDI SE U. CO. KG', purpose: 'ALDI SE U. CO. KG/KLAUSENSTR. 37/BURGHAUSEN/DE' }), 'lebensmittel');
  assert.equal(cat({ name: 'PayPal Europe S.a.r.l. et Cie S.C.A', purpose: '1054454152027/. Penny Musterstadt   , Ihr Einkauf bei Penny Musterstadt EREF: 1054454152027 MREF: 4D72 CRED: LU96 IBAN: LU89 BIC: PPLXLUL2' }), 'lebensmittel');
  assert.equal(cat({ name: 'Hommer Fitness GmbH', purpose: 'Basic Schueler' }), 'abos');
  assert.equal(cat({ name: 'ESSO', purpose: 'ESSO D7700 Burghausen' }), 'mobilitaet');
  assert.equal(cat({ name: 'DZ BANK AG', purpose: 'AMAZON. 2R0AY9QE5/38 Avenue John F Kennedy/LUXEMBOURG' }), 'shopping');
  assert.equal(cat({ name: 'X', purpose: 'Amazon Prime Mitgliedschaft' }), 'abos');
});
t('Unbekanntes landet in Sonstiges, positive in Sonstige Einnahmen', () => {
  assert.equal(cat({ name: 'Irgendwer', purpose: 'Zahlung' }), 'sonstiges');
  assert.equal(cat({ name: 'Irgendwer', purpose: 'Geschenk', amount: 30 }), 'sonstige-einnahmen');
});
t('Erstattung nur bei Einnahme; Umbuchung', () => {
  assert.equal(cat({ name: 'DZ BANK', purpose: 'Gutschrift von AMAZON. NJ3R50DW4', amount: 7.99 }), 'erstattung');
  assert.equal(cat({ name: 'PAYPAL', purpose: 'INSTANT TRANSFER EREF: 1', amount: 120 }), 'umbuchung');
});
t('Eigene Regel schlägt feste Regel, auch mit Betragsgrenze', () => {
  const rules = [{ id: 'r1', field: 'purpose', text: 'von dad', cat: 'einkommen', sign: 'in' }, { id: 'r2', field: 'name', text: 'penny', cat: 'essen', max: 5 }];
  assert.equal(Fin.categorize({ name: 'RICHTBERG MARTIN', purpose: 'Von Dad', amount: 590 }, { userRules: rules }).cat, 'einkommen');
  assert.equal(Fin.categorize({ name: 'Penny', purpose: '', amount: -4 }, { userRules: rules }).cat, 'essen');
  assert.equal(Fin.categorize({ name: 'Penny', purpose: '', amount: -40 }, { userRules: rules }).cat, 'lebensmittel');
});
t('Eigene IBAN = Umbuchung', () => assert.equal(Fin.categorize({ name: 'Ich', purpose: '', iban: 'DE00 1111', amount: -50 }, { ownIbans: ['DE001111'] }).cat, 'umbuchung'));

const csv = process.argv[2] || [path.join(__dirname, '..', 'VR-Bank-Beispiel-CV')].find((p) => fs.existsSync(p));
if (csv) {
  const res = Fin.importCsv(fs.readFileSync(csv, 'utf8'));
  t('Beispiel-CSV: alles gelesen', () => { assert.ok(!res.error); assert.ok(res.txs.length >= 70); assert.equal(res.skipped, 0); assert.equal(res.accounts.length, 1); });
  const txs = res.txs.map((x) => { const r = Fin.categorize(x); return Object.assign(x, { cat: r.cat, label: Fin.displayName(x, r) }); });
  const rec = Fin.detectRecurring(txs);
  const byCat = {}; txs.forEach((x) => { byCat[x.cat] = (byCat[x.cat] || 0) + 1; });
  console.log('Kategorien:', byCat);
  console.log('Wiederkehrend:', rec.map((r) => `${r.name} ${r.amount} (${r.count}x, Tag ${r.day})`));
  console.log('Sonstiges:', [...new Set(txs.filter((x) => x.cat === 'sonstiges').map((x) => `${x.name} | ${Fin.cleanPurpose(x.purpose).slice(0, 40)}`))]);
  t('Beispiel-CSV: Mehrheit erkannt (< 25 % Sonstiges)', () => assert.ok((byCat.sonstiges || 0) / txs.length < 0.25, 'zu viel Sonstiges'));
  t('Beispiel-CSV: E.ON, Hommer/MDNS, Vodafone als wiederkehrend', () => {
    const names = rec.map((r) => r.name.toLowerCase()).join(' ');
    assert.ok(/e\.on|eon/.test(names)); assert.ok(/vodafone/.test(names));
  });
}

const cats = Fin.CATEGORIES;
t('Budget: Tageslimit sinkt nach Überziehen', () => {
  const base = { cats, fixed: [{ kind: 'income', amount: 1000 }, { kind: 'expense', amount: 400 }], planned: [], settings: {} };
  const day1 = Fin.budget({ ...base, txs: [], today: '2026-11-01' });      // 600 / 30 Tage = 20
  assert.equal(day1.day.limit, 20); assert.equal(day1.disposable, 600);
  const txs = [{ date: '2026-11-01', amount: -80, cat: 'lebensmittel' }];   // 60 zu viel
  const day2 = Fin.budget({ ...base, txs, today: '2026-11-02' });           // (600-80)/29
  assert.equal(day2.day.limit, Fin.round2(520 / 29)); assert.ok(day2.day.limit < 20);
  const sameDay = Fin.budget({ ...base, txs, today: '2026-11-01' });
  assert.equal(sameDay.day.left, -60); assert.equal(sameDay.tomorrow, Fin.round2(520 / 29));
});
t('Budget: Umbuchung zählt nicht, Erstattung mindert', () => {
  const base = { cats, fixed: [{ kind: 'income', amount: 1000 }], planned: [], settings: {} };
  const txs = [{ date: '2026-11-03', amount: -60, cat: 'wohnen' }, { date: '2026-11-03', amount: -500, cat: 'umbuchung' }, { date: '2026-11-03', amount: -10, cat: 'essen' }, { date: '2026-11-03', amount: 4, cat: 'erstattung' }];
  assert.equal(Fin.budget({ ...base, txs, today: '2026-11-03' }).month.spent, 66);   // 60 Wohnen + 10 Essen - 4 Erstattung, Umbuchung zählt nicht
});
t('Budget: geplante Zahlung senkt das Limit, erledigte nicht', () => {
  const base = { cats, fixed: [{ kind: 'income', amount: 900 }], settings: {}, txs: [], today: '2026-11-01' };
  assert.equal(Fin.budget({ ...base, planned: [{ amount: -300, due: '2026-11-20' }] }).disposable, 600);
  assert.equal(Fin.budget({ ...base, planned: [{ amount: -300, due: '2026-11-20', done: true }] }).disposable, 900);
  assert.equal(Fin.budget({ ...base, planned: [{ amount: -300, due: '2026-12-02' }] }).disposable, 900);
});
t('Budget: letzter Tag im Monat und Woche am Monatsrand', () => {
  const b = Fin.budget({ cats, fixed: [{ kind: 'income', amount: 300 }], planned: [], settings: {}, txs: [{ date: '2026-11-29', amount: -20, cat: 'essen' }], today: '2026-11-30' });
  assert.equal(b.daysLeft, 1); assert.equal(b.tomorrow, null); assert.equal(b.day.limit, 280); assert.equal(b.week.to, '2026-11-30');
});
t('Beträge: Tausenderpunkt und Dezimalkomma', () => {
  assert.equal(Fin.parseAmount('2.500'), 2500); assert.equal(Fin.parseAmount('1.234,56'), 1234.56); assert.equal(Fin.parseAmount('12.5'), 12.5); assert.equal(Fin.parseAmount('1.000.000'), 1000000); assert.equal(Fin.parseAmount('-20'), -20); assert.equal(Fin.parseAmount('12,50'), 12.5);
});
t('Geplant: überfällig zählt weiter, Treffer im Umsatz erledigt es', () => {
  const base = { cats, fixed: [{ kind: 'income', amount: 900 }], settings: {}, txs: [], today: '2026-11-10' };
  assert.equal(Fin.budget({ ...base, planned: [{ amount: -100, due: '2026-11-05', name: 'Klarna' }] }).planned, 100);
  const tx = { date: '2026-11-06', amount: -100.5, name: 'Klarna Bank AB', purpose: 'Rate', cat: 'sonstiges' };
  assert.ok(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'Klarna' }, [tx]));
  assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'Klarna' }, [{ ...tx, amount: -150 }]), null);
});
t('Budget: automatisch ignorierte Umsätze (Tagesgeld) zählen nicht', () => {
  const b = Fin.budget({ cats, fixed: [{ kind: 'income', amount: 900 }], planned: [], settings: {}, txs: [{ date: '2026-11-03', amount: -40, cat: 'essen', autoIgnore: true }], today: '2026-11-03' });
  assert.equal(b.month.spent, 0);
});
t('CSV ohne Kontospalte nutzt das gewählte Konto', () => {
  const r = Fin.importCsv('Buchungstag;Betrag;Name\n01.11.2026;-5,00;X\n', { id: 'acc_vorhanden', name: 'Giro', useId: true });
  assert.ok(r.noAccountColumn); assert.equal(r.txs[0].acct, 'acc_vorhanden');
});
t('matchPlanned: ohne Namenswort nie, ein Umsatz nur einmal, keine positiven oder ignorierten', () => {
  const tx = { id: 'a', date: '2026-11-06', amount: -100, name: 'Klarna Bank', purpose: '', cat: 'sonstiges' }, used = new Set();
  assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'X1' }, [tx]), null);
  assert.ok(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'Klarna' }, [tx], used)); assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-06', name: 'Klarna' }, [tx], used), null);
  assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'Klarna' }, [{ ...tx, amount: 100 }]), null);
  assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-05', name: 'Klarna' }, [{ ...tx, autoIgnore: true }]), null);
  assert.equal(Fin.matchPlanned({ amount: -100, due: '2026-11-30', name: 'Klarna' }, [tx]), null);
});
t('groupSeed: PayPal-Händler, Abrechner leer, normaler Name', () => {
  assert.equal(Fin.groupSeed({ name: 'PayPal Europe S.a.r.l.', purpose: '1/. Penny Musterstadt , Ihr Einkauf bei Penny Musterstadt EREF: 1' }), 'Penny Musterstadt');
  assert.equal(Fin.groupSeed({ name: 'PayPal Europe', purpose: '1/PP.6959.PP/. , Ihr Einkauf bei EREF: 1' }), '');
  assert.equal(Fin.groupSeed({ name: 'DZ BANK AG', purpose: 'AMAZON. X' }), ''); assert.equal(Fin.groupSeed({ name: 'Rasty Pizza', purpose: '' }), 'Rasty Pizza'); assert.equal(Fin.groupSeed({ name: '', purpose: 'x' }), '');
});
t('Beträge: weitere Schreibweisen', () => { assert.equal(Fin.parseAmount('+5'), 5); assert.equal(Fin.parseAmount('-1.234'), -1234); assert.equal(Fin.parseAmount('1,234.56'), 1234.56); });
t('Budget: Ist über Plan bei Fixkosten nimmt den höheren Wert', () => {
  const b = Fin.budget({ cats, fixed: [{ kind: 'income', amount: 1000 }, { kind: 'expense', amount: -30, match: 'x', active: true }], planned: [], settings: {}, txs: [{ date: '2026-11-02', amount: -80, cat: 'abos', name: 'x' }], today: '2026-11-03' });
  assert.equal(b.fixed, 30);
});
t('Budgetzeitraum ab Tag 30', () => {
  assert.deepEqual(Fin.period('2026-11-18', 30), { from: '2026-10-30', to: '2026-11-29' });
  assert.deepEqual(Fin.period('2026-11-30', 30), { from: '2026-11-30', to: '2026-12-29' });
  assert.deepEqual(Fin.period('2027-02-10', 30), { from: '2027-01-30', to: '2027-02-27' });     // Februar: Start am 28.
  assert.deepEqual(Fin.period('2027-02-28', 30), { from: '2027-02-28', to: '2027-03-29' });
  assert.deepEqual(Fin.period('2026-01-05', 30), { from: '2025-12-30', to: '2026-01-29' });
  assert.deepEqual(Fin.period('2026-11-18', 1), { from: '2026-11-01', to: '2026-11-30' });
});
t('Budget mit Start am 30.: Ausgaben ab 30.10. zählen, davor nicht, Resttage stimmen', () => {
  const txs = [{ date: '2026-10-29', amount: -500, cat: 'essen' }, { date: '2026-10-31', amount: -40, cat: 'essen' }];
  const b = Fin.budget({ cats, fixed: [{ kind: 'income', amount: 590 }], planned: [], settings: { periodStart: 30 }, txs, today: '2026-11-18' });
  assert.equal(b.from, '2026-10-30'); assert.equal(b.to, '2026-11-29'); assert.equal(b.dim, 31); assert.equal(b.daysLeft, 12);
  assert.equal(b.month.spent, 40); assert.equal(b.day.limit, Fin.round2((590 - 40) / 12));
});
t('Unterhalt um den 30./1. wird als wiederkehrend erkannt (auch bei zwei Zahlungen im selben Monat)', () => {
  const mk = (d) => ({ id: d, date: d, amount: 590, name: 'RICHTBERG MARTIN', purpose: 'Von Dad', cat: 'sonstige-einnahmen', label: '' });
  const rec = Fin.detectRecurring([mk('2026-09-01'), mk('2026-10-01'), mk('2026-10-30')]);
  assert.equal(rec.length, 1); assert.equal(rec[0].kind, 'income'); assert.equal(rec[0].amount, 590);
});
t('Wiederkehrend: Doppelbuchung (zwei Monate auf einmal) bricht die Erkennung nicht, Name statt Regelbezeichnung', () => {
  const mk = (d, a) => ({ id: d, date: d, amount: a, name: 'Hommer Fitness GmbH', purpose: 'Basic', cat: 'abos', label: 'Fitnessstudio' });
  const rec = Fin.detectRecurring([mk('2026-09-01', -29.9), mk('2026-10-01', -59.8), mk('2026-11-02', -29.9)]);
  assert.equal(rec.length, 1); assert.equal(rec[0].amount, -29.9); assert.equal(rec[0].name, 'Hommer Fitness GmbH');
});
t('Wiederkehrend: Nachzahlung über zwei Monate (43 €, dann 86 € nach zwei Monaten) wird als 43 € monatlich erkannt', () => {
  const mk = (d, a) => ({ id: d, date: d, amount: a, name: 'Muenchner Verkehrsgesellschaft', purpose: 'MVG ABONNEMENT', cat: 'abos', label: 'MVG Abo' });
  const rec = Fin.detectRecurring([mk('2026-09-01', -43), mk('2026-11-02', -86)]);
  assert.equal(rec.length, 1); assert.equal(rec[0].amount, -43);
});
t('Einkommen mit Toleranz: Tag 1 ± 2 nimmt eine Zahlung vom 30. des Vormonats, zu früh oder zu spät fällt heraus', () => {
  const dad = (d, a = 590) => ({ date: d, amount: a, name: 'RICHTBERG MARTIN', purpose: 'Von Dad', cat: 'einkommen' });
  const fixed = [{ id: 'f', kind: 'income', name: 'Unterhalt', amount: 590, day: 1, tol: 2, active: true, match: 'richtberg martin' }];
  const run = (txs, today) => Fin.incomeCheck({ txs, fixed, settings: {}, today })[0];
  assert.equal(run([dad('2026-10-01'), dad('2026-10-30')], '2026-11-18').status, 'ok');         // 30.10. liegt im Fenster 30.10.–3.11.
  assert.equal(run([dad('2026-10-01'), dad('2026-10-28')], '2026-11-18').status, 'late');       // zu früh: gehört nicht zu November
  assert.equal(run([dad('2026-10-01')], '2026-11-03').status, 'pending'); assert.equal(run([dad('2026-10-01')], '2026-11-04').status, 'late');
  assert.equal(run([dad('2026-10-01'), dad('2026-11-03', 500)], '2026-11-18').status, 'diff');
});
t('Rückblick: letzter Budgetzeitraum, Summen, Top-Kategorien, gehalten oder nicht', () => {
  const txs = [{ date: '2026-10-05', amount: -100, cat: 'lebensmittel' }, { date: '2026-10-06', amount: -50, cat: 'essen' }, { date: '2026-10-07', amount: 600, cat: 'einkommen' },
    { date: '2026-10-08', amount: -999, cat: 'umbuchung' }, { date: '2026-09-10', amount: -30, cat: 'lebensmittel' }];
  const r = Fin.review({ txs, cats, fixed: [{ kind: 'income', amount: 500, active: true }], settings: {}, today: '2026-11-18' });
  assert.equal(r.from, '2026-10-01'); assert.equal(r.to, '2026-10-31'); assert.equal(r.income, 600); assert.equal(r.expense, 150); assert.equal(r.net, 450); assert.equal(r.saveRate, 75);
  assert.equal(r.spent, 150); assert.equal(r.kept, true); assert.equal(r.top[0].id, 'lebensmittel'); assert.equal(r.top[0].prev, 30); assert.equal(r.prevExpense, 30);
  assert.equal(Fin.review({ txs, cats, fixed: [{ kind: 'income', amount: 100, active: true }], settings: {}, today: '2026-11-18' }).kept, false);
});
t('Fixkosten: fester Betrag, passende Buchungen zählen nicht als Ausgabe, doppelte Abbuchung bringt nichts durcheinander', () => {
  const fixed = [{ kind: 'income', amount: 1000 }, { kind: 'expense', amount: -43, match: 'verkehrs', active: true }, { kind: 'expense', amount: -29.9, match: 'hommer', active: true }];
  const tx = (n, a, d = '2026-11-02') => ({ date: d, amount: a, cat: 'abos', name: n, purpose: '' });
  const b = (txs) => Fin.budget({ cats, fixed, planned: [], settings: {}, txs, today: '2026-11-03' });
  assert.equal(b([]).fixed, 72.9);                                                     // nichts gebucht: der feste Betrag gilt trotzdem
  assert.equal(b([tx('Muenchner Verkehrsgesellschaft', -86), tx('Hommer Fitness', -29.9)]).fixed, 72.9);   // doppelt abgebucht: Betrag bleibt
  assert.equal(b([tx('Muenchner Verkehrsgesellschaft', -86), tx('Hommer Fitness', -29.9)]).month.spent, 0); // und zählt nicht als Ausgabe
  assert.equal(b([tx('Netflix', -13)]).month.spent, 13);                               // ohne Fixposten bleibt es eine normale Ausgabe
  assert.equal(b([tx('Hommer Fitness', 5)]).month.spent, 0);
});
t('Warnungen: nur bei echter Erhöhung, nicht bei verschobener Doppelbuchung', () => {
  const item = { id: 'f', kind: 'expense', name: 'MVG', amount: -43, match: 'verkehrs', active: true };
  const tx = (d, a) => ({ date: d, amount: a, cat: 'abos', name: 'Muenchner Verkehrsgesellschaft', purpose: '' });
  const w = (txs, today = '2026-11-18') => Fin.warnings({ txs, cats, fixed: [item], settings: { periodStart: 30 }, today }).filter((x) => x.kind === 'fix');
  assert.equal(w([tx('2026-09-01', -43), tx('2026-11-02', -86)]).length, 0);           // Oktober ausgefallen, November doppelt: alles gut
  assert.equal(w([tx('2026-09-01', -50), tx('2026-10-01', -50), tx('2026-11-02', -50)]).length, 1);   // dauerhaft 50 statt 43
  assert.equal(w([tx('2026-11-02', -80)]).length, 1);                                  // erste Buchung gleich zu hoch
  assert.equal(w([tx('2026-11-02', -43)]).length, 0);
  assert.equal(w([]).length, 0);
});
t('Warnungen: Kategorie-Budget ab Schwelle', () => {
  const c2 = cats.map((c) => (c.id === 'essen' ? { ...c, budget: 100 } : c));
  const out = Fin.warnings({ txs: [{ date: '2026-11-05', amount: -85, cat: 'essen' }], cats: c2, fixed: [], settings: {}, today: '2026-11-18' });
  assert.equal(out.length, 1); assert.equal(out[0].kind, 'cat'); assert.equal(out[0].level, 'warn');
});
t('Gehalt-Abweichung: ok, abweichend, ausstehend, überfällig, Teilzahlungen werden summiert', () => {
  const dad = (d, a) => ({ date: d, amount: a, name: 'RICHTBERG MARTIN', purpose: 'Von Dad', cat: 'einkommen' });
  const fixed = [{ id: 'f', kind: 'income', name: 'Unterhalt', amount: 590, day: 30, active: true, match: 'richtberg martin' }], st = { periodStart: 30 };
  const run = (txs, today) => Fin.incomeCheck({ txs, fixed, settings: st, today })[0];
  assert.equal(run([dad('2026-10-30', 590)], '2026-11-18').status, 'ok');
  assert.equal(run([dad('2026-10-30', 520)], '2026-11-18').status, 'diff'); assert.equal(run([dad('2026-10-30', 520)], '2026-11-18').diff, -70);
  assert.equal(run([dad('2026-10-30', 300), dad('2026-11-02', 290)], '2026-11-18').status, 'ok');
  const alt = [dad('2026-09-30', 590)];
  assert.equal(run(alt, '2026-11-02').status, 'pending'); assert.equal(run(alt, '2026-11-18').status, 'late'); assert.equal(run([], '2026-11-18').status, 'unknown');
  assert.equal(Fin.incomeCheck({ txs: [], fixed: [{ kind: 'income', amount: 100, day: 1 }], settings: {}, today: '2026-11-18' })[0].status, 'unknown');
});
t('Im Minus: Tageslimit wird negativ statt bei 0 zu stoppen', () => {
  const base = { cats, fixed: [{ kind: 'income', amount: 300 }], planned: [], settings: {}, txs: [{ date: '2026-11-02', amount: -400, cat: 'essen' }] };
  const b = Fin.budget({ ...base, today: '2026-11-03' });                    // 300 - 400 = -100 über 28 Tage
  assert.equal(b.day.limit, Fin.round2(-100 / 28)); assert.ok(b.day.left < 0); assert.ok(b.tomorrow < 0);
});
t('Vergangene Tage, Wochen und Budgetmonate sind abrufbar', () => {
  const txs = [{ date: '2026-10-20', amount: -30, cat: 'essen' }, { date: '2026-11-05', amount: -50, cat: 'essen' }, { date: '2026-11-06', amount: -20, cat: 'essen' }, { date: '2026-11-12', amount: -10, cat: 'essen' }];
  const ctx = { txs, cats, fixed: [{ kind: 'income', amount: 600 }], planned: [], settings: {}, today: '2026-11-12' };
  const d1 = Fin.rangeView(ctx, 'tag', -6);                                     // 6. November: 20 € ausgegeben, Limit nach dem 5. (50 € weg): (600-50)/25
  assert.equal(d1.from, '2026-11-06'); assert.equal(d1.spent, 20); assert.equal(d1.limit, Fin.round2((600 - 50) / 25));
  const w = Fin.rangeView(ctx, 'woche', -1);                                    // Woche 2.-8. November
  assert.equal(w.from, '2026-11-02'); assert.equal(w.to, '2026-11-08'); assert.equal(w.spent, 70); assert.equal(w.limit, Fin.round2(Fin.round2(600 / 29) * 7));   // Tageslimit am 2. November mal 7 Tage
  const m = Fin.rangeView(ctx, 'monat', -1);                                    // Oktober
  assert.equal(m.from, '2026-10-01'); assert.equal(m.to, '2026-10-31'); assert.equal(m.spent, 30); assert.equal(m.left, 570);
  const now = Fin.rangeView(ctx, 'monat', 0); assert.equal(now.current, true); assert.equal(now.spent, 80);
});
t('Einkommen zählt immer genau einem Monat: dem nächstliegenden (Tag 1: 30.10. zählt zum November)', () => {
  assert.equal(Fin.incomeDateFor('2026-10-30', 1), '2026-11-01'); assert.equal(Fin.incomeDateFor('2026-10-01', 1), '2026-10-01');
  assert.equal(Fin.incomeDateFor('2026-11-02', 1), '2026-11-01'); assert.equal(Fin.incomeDateFor('2026-12-29', 1), '2027-01-01');
  assert.equal(Fin.incomeDateFor('2026-11-14', 30), '2026-10-30');         // 14.11. liegt näher am 30.10. (15 Tage) als am 30.11. (16 Tage)
  const dad = (d) => ({ date: d, amount: 590, name: 'RICHTBERG MARTIN', purpose: 'Von Dad', cat: 'einkommen' }), m = Fin.incomeMatcher([{ kind: 'income', day: 1, match: 'richtberg martin', active: true }]);
  const txs = [dad('2026-10-01'), dad('2026-10-30'), { date: '2026-10-19', amount: 280, name: 'Ich', purpose: '', cat: 'sonstige-einnahmen' }].map((t) => { const it = m(t); return it ? { ...t, incomeDate: Fin.incomeDateFor(t.date, it.day) } : t; });
  const mo = Fin.monthly(txs, cats, ['2026-10', '2026-11']);
  assert.equal(mo[0].income, 590 + 280); assert.equal(mo[1].income, 590);
  assert.equal(Fin.rangeTotals(txs, cats, '2026-11-01', '2026-11-30').income, 590);
});
t('Nächste Fälligkeit kürzt auf Monatsende', () => { assert.equal(Fin.nextDue(31, '2026-02-10'), '2026-02-28'); assert.equal(Fin.nextDue(5, '2026-11-18'), '2026-12-05'); });
console.log(`\n${ok} Tests bestanden`);
