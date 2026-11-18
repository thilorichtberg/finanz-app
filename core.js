'use strict';
/* =====================================================================
   Finanzen – reine Logik ohne Oberfläche (läuft im Browser und in Node-Tests)
   CSV-Import, feste Kategorie-Regeln, Wiederkehrendes erkennen, Budget-Rechnung.
   Keine Netzwerkzugriffe, keine KI: alle Regeln sind hart codiert und für dich änderbar.
   ===================================================================== */
(function (root) {
  const Fin = {};

  /* ---------- Hilfen ---------- */
  const fold = (s) => String(s == null ? '' : s).toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  Fin.fold = fold;
  const pad = (n) => String(n).padStart(2, '0');
  const dkey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dparse = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const daysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();      // m: 0-11
  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  Fin.dkey = dkey; Fin.dparse = dparse; Fin.daysInMonth = daysInMonth; Fin.round2 = round2;
  Fin.addDays = (k, n) => { const d = dparse(k); d.setDate(d.getDate() + n); return dkey(d); };
  Fin.monthKey = (k) => k.slice(0, 7);
  Fin.weekStart = (k) => { const d = dparse(k); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); return dkey(d); };   // Montag

  // Schnelle, stabile Prüfsumme (cyrb53) für Umsatz-IDs
  Fin.hash = (str) => {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  };

  /* ---------- Kategorien ---------- */
  // kind: expense | income | refund (senkt Ausgaben) | transfer (zählt nirgends)
  // fixed: Fixkosten, werden vom Budget vorab abgezogen und zählen nicht als „variable" Ausgabe
  Fin.CATEGORIES = [
    { id: 'lebensmittel', name: 'Lebensmittel', icon: 'cart', kind: 'expense' },
    { id: 'drogerie', name: 'Drogerie & Haushalt', icon: 'bag', kind: 'expense' },
    { id: 'essen', name: 'Restaurant & Lieferdienst', icon: 'utensils', kind: 'expense' },
    { id: 'mobilitaet', name: 'Mobilität', icon: 'car', kind: 'expense' },
    { id: 'shopping', name: 'Shopping', icon: 'bag', kind: 'expense' },
    { id: 'freizeit', name: 'Freizeit & Unterhaltung', icon: 'film', kind: 'expense' },
    { id: 'reisen', name: 'Reisen', icon: 'plane', kind: 'expense' },
    { id: 'gesundheit', name: 'Gesundheit', icon: 'heart', kind: 'expense' },
    { id: 'bargeld', name: 'Bargeld', icon: 'cash', kind: 'expense' },
    { id: 'kreditkarte', name: 'Kreditkarte', icon: 'card', kind: 'expense' },
    { id: 'abos', name: 'Abos & Mitgliedschaften', icon: 'repeat', kind: 'expense', fixed: true },
    { id: 'wohnen', name: 'Wohnen & Energie', icon: 'home', kind: 'expense', fixed: true },
    { id: 'telefon', name: 'Telefon & Internet', icon: 'phone', kind: 'expense', fixed: true },
    { id: 'versicherung', name: 'Versicherung', icon: 'shield', kind: 'expense', fixed: true },
    { id: 'gebuehren', name: 'Bankgebühren', icon: 'landmark', kind: 'expense' },
    { id: 'sonstiges', name: 'Sonstiges', icon: 'dots', kind: 'expense' },
    { id: 'einkommen', name: 'Einkommen', icon: 'trend', kind: 'income' },
    { id: 'erstattung', name: 'Erstattung', icon: 'refund', kind: 'refund' },
    { id: 'sonstige-einnahmen', name: 'Sonstige Einnahmen', icon: 'gift', kind: 'income' },
    { id: 'umbuchung', name: 'Umbuchung', icon: 'swap', kind: 'transfer' },
  ];
  Fin.FALLBACK = { out: 'sonstiges', in: 'sonstige-einnahmen' };

  /* ---------- Feste Regeln (Reihenfolge = Vorrang) ----------
     kw: Suchwörter (ohne Umlaute, klein). Ein Leerzeichen am Rand erzwingt eine Wortgrenze.
     sign: 'in' nur Einnahmen, 'out' nur Ausgaben. label: schöner Anzeigename. */
  const R = (cat, label, kw, sign) => ({ cat, label, kw, sign });
  Fin.BUILTIN_RULES = [
    // Umbuchungen und Kreditkarten-Abrechnung zuerst, damit nichts anderes sie schluckt
    R('umbuchung', 'Umbuchung', ['umbuchung', 'instant transfer', 'eigenuebertrag', 'tagesgeld', 'uebertrag auf']),
    R('kreditkarte', 'Kreditkarten-Abrechnung', ['mastercard abrechnung', 'visa abrechnung', 'kreditkartenabrechnung', 'kreditkarte abrechnung'], 'out'),
    R('erstattung', 'Erstattung', ['gutschrift von amazon', 'rueckerstattung', 'erstattung', 'refund', 'retoure'], 'in'),
    R('gebuehren', 'Zinsen / Abschluss', ['abschluss per'], 'in'),
    R('gebuehren', 'Bankgebühr', ['kontofuehrung', 'kontoentgelt', 'entgelt', 'abschluss per', 'bankgebuehr', 'kartenpreis'], 'out'),
    R('einkommen', 'Gehalt', ['gehalt', 'lohn ', 'bezuege', 'entgelt abrechnung', 'bafoeg', 'kindergeld', 'stipendium', 'rentenversicherung bund', 'arbeitgeber'], 'in'),
    R('bargeld', 'Bargeld', ['geldautomat', 'bargeldauszahlung', 'bargeld'], 'out'),
    // Abos vor Shopping/Mobilität, damit „Amazon Prime" und MVG-Abo hier landen
    R('abos', 'Amazon Prime', ['amazon prime', 'prime video', 'amzn prime']),
    R('abos', 'Netflix', ['netflix']), R('abos', 'Spotify', ['spotify']), R('abos', 'Disney+', ['disney plus', 'disneyplus', 'disney+']),
    R('abos', 'YouTube Premium', ['youtube premium', 'youtubepremium']), R('abos', 'DAZN', ['dazn']), R('abos', 'Apple', ['apple.com/bill', 'itunes', 'icloud']),
    R('abos', 'Google', ['google play', 'google one', 'google storage']), R('abos', 'ChatGPT / OpenAI', ['openai', 'chatgpt']), R('abos', 'Claude', ['anthropic', 'claude.ai']),
    R('abos', 'GitHub', ['github']), R('abos', 'Dropbox', ['dropbox']), R('abos', 'Adobe', ['adobe']), R('abos', 'Microsoft 365', ['microsoft 365', 'office 365']),
    R('abos', 'Clever fit', ['cleverfit', 'clever fit']), R('abos', 'Fitnessstudio', ['fitnessstudio', 'fitness', 'sportstudio', 'mcfit', 'fitx', 'urban sports', 'gym ']),
    R('abos', 'MVG Abo', ['mvg abonnement', 'mvg abo', 'deutschlandticket', 'deutschland-ticket', 'mvv abo', 'bvg abo']),
    R('abos', 'Mitgliedschaft', ['mitgliedsbeitrag', 'mitgliedschaft', 'abonnement', 'verein ']),
    R('wohnen', 'E.ON', ['e.on', 'eon energie', 'e on energie']), R('wohnen', 'Stadtwerke', ['stadtwerke', 'vattenfall', 'enbw', 'swm ']),
    R('wohnen', 'Rundfunkbeitrag', ['rundfunk', 'beitragsservice', 'ard zdf']), R('wohnen', 'Miete', ['miete', 'nebenkosten', 'hausverwaltung', 'wohnungsbau', 'vermieter']),
    R('telefon', 'Vodafone', ['vodafone']), R('telefon', 'Telekom', ['telekom', 'deutsche telekom']), R('telefon', 'O2', ['telefonica', 'o2 ']),
    R('telefon', 'Internet / Mobilfunk', ['1&1', '1und1', 'congstar', 'alditalk', 'aldi talk', 'klarmobil', 'freenet', 'mobilcom', 'drillisch', 'netzclub', 'simyo']),
    R('versicherung', 'Versicherung', ['versicherung', 'allianz', 'huk-coburg', 'huk coburg', 'devk', 'signal iduna', 'axa ', 'krankenkasse', 'techniker kasse', 'barmer', 'aok ', 'dak ']),
    R('lebensmittel', 'Aldi', ['aldi']), R('lebensmittel', 'Lidl', ['lidl']), R('lebensmittel', 'Rewe', [' rewe']), R('lebensmittel', 'Edeka', ['edeka']),
    R('lebensmittel', 'Penny', ['penny']), R('lebensmittel', 'Netto', [' netto ']), R('lebensmittel', 'Kaufland', ['kaufland']), R('lebensmittel', 'Denn\'s Biomarkt', ['denns', 'alnatura', 'biomarkt']),
    R('lebensmittel', 'Metzgerei', ['metzgerei', 'metzger ', 'fleischerei']), R('lebensmittel', 'Bäckerei', ['baeckerei', 'baecker ', 'backshop', 'backwerk']),
    R('lebensmittel', 'Supermarkt', ['norma ', 'tegut', 'nahkauf', 'globus', 'marktkauf', 'getraenkemarkt', 'hofladen', 'wochenmarkt', 'supermarkt']),
    R('drogerie', 'dm', ['dm-drogerie', 'dm drogerie', ' dm fil']), R('drogerie', 'Rossmann', ['rossmann']), R('drogerie', 'Müller', ['mueller drogerie', 'mueller handels']),
    R('gesundheit', 'Apotheke', ['apotheke', 'apothek']), R('gesundheit', 'Arzt', [' arzt', ' praxis', 'zahnarzt', 'klinik', 'physiother', 'optiker', 'fielmann']),
    R('essen', 'Lieferdienst', ['lieferando', 'wolt', 'uber eats', 'ubereats', 'foodpanda', 'flink', 'gorillas']),
    R('essen', 'Restaurant', ['mcdonald', 'burger king', 'kfc', 'subway', 'starbucks', 'pizza', 'mama mia', 'restaurant', 'ristorante', 'imbiss', 'doener', 'kebab', 'bistro', 'gasthof', 'gasthaus', 'cafe ', 'mensa', 'sushi', 'trattoria', 'brauerei']),
    R('mobilitaet', 'Tankstelle', [' esso', 'shell ', ' aral', 'jet tank', 'agip', 'avia ', 'tankstelle']),
    R('mobilitaet', 'Uber', [' uber']), R('mobilitaet', 'Bahn', ['db vertrieb', 'deutsche bahn', 'bahn.de', 'flixbus', 'flixtrain', 'bahncard', 'oebb']),
    R('mobilitaet', 'ÖPNV', ['mvg', 'mvv', 'bvg', 'hvv', 'vgn', 'oepnv']), R('mobilitaet', 'Auto', ['sixt', 'parkhaus', 'parkgebuehr', 'parkticket', 'adac', 'tuev', 'werkstatt', 'kfz', 'bolt ', 'lime ', 'tier ']),
    R('reisen', 'Reisen', ['booking.com', 'airbnb', 'ryanair', 'lufthansa', 'easyjet', 'eurowings', 'expedia', 'hotel', 'hostel', ' tui ']),
    R('freizeit', 'Freizeit', ['kino', 'cinema', 'cinemaxx', ' steam', 'playstation', 'nintendo', 'xbox', 'eventim', 'ticketmaster', 'theater', 'museum', 'konzert', 'bowling', 'freibad', 'schwimmbad', 'therme']),
    R('shopping', 'Amazon', ['amazon', 'amzn']), R('shopping', 'Zalando', ['zalando']), R('shopping', 'eBay', ['ebay']), R('shopping', 'Otto', [' otto ']),
    R('shopping', 'IKEA', ['ikea']), R('shopping', 'MediaMarkt / Saturn', ['mediamarkt', 'media markt', 'saturn ']), R('shopping', 'Mode', ['h&m', 'zara', 'c&a', 'about you', 'primark', 'decathlon', 'temu', 'shein', 'aliexpress']),
  ];

  /* ---------- Text aus einem Umsatz aufbereiten ---------- */
  // Schneidet technische Anhängsel ab (EREF, MREF, IBAN …) und holt bei PayPal den Händler heraus
  Fin.cleanPurpose = (p) => {
    let s = String(p || '').replace(/\s+/g, ' ').trim();
    const cut = s.search(/\s(EREF|MREF|CRED|KREF|SVWZ|ABWA|IBAN|BIC)[:+ ]/);
    if (cut > 0) s = s.slice(0, cut).trim();
    return s;
  };
  Fin.paypalMerchant = (purpose) => {
    const s = Fin.cleanPurpose(purpose);
    const m = s.match(/Ihr Einkauf bei\s*(.*)$/i);
    if (m && m[1].trim()) return m[1].trim();
    const m2 = s.match(/\/\.\s*([^,]+?)\s*,/);                         // „…/. Davor Blazevic e.K.   , Ihr Einkauf …"
    if (m2 && m2[1].trim()) return m2[1].trim();
    return '';
  };
  Fin.haystack = (tx) => {
    const purpose = Fin.cleanPurpose(tx.purpose);
    const isPaypal = /paypal/i.test(tx.name || '');
    const merchant = isPaypal ? Fin.paypalMerchant(tx.purpose) : '';
    return fold(` ${merchant} ${tx.name || ''} ${purpose} `);
  };
  const kwHit = (hay, kw) => hay.includes(kw);

  /* ---------- Kategorisieren ----------
     Reihenfolge: 1) eigene Regeln  2) feste Regeln  3) wiederkehrend erkannt  4) Sonstiges
     userRules: [{id, field:'all'|'name'|'purpose'|'iban', text, cat, sign?, min?, max?}] */
  Fin.userRuleHit = (rule, tx) => {
    const t = fold(rule.text).trim();
    if (!t) return false;
    if (rule.sign === 'in' && tx.amount <= 0) return false;
    if (rule.sign === 'out' && tx.amount >= 0) return false;
    const abs = Math.abs(tx.amount);
    if (rule.min != null && rule.min !== '' && abs < Number(rule.min)) return false;
    if (rule.max != null && rule.max !== '' && abs > Number(rule.max)) return false;
    const f = rule.field || 'all';
    let hay;
    if (f === 'name') hay = fold(tx.name);
    else if (f === 'purpose') hay = fold(Fin.cleanPurpose(tx.purpose) + ' ' + Fin.paypalMerchant(tx.purpose));
    else if (f === 'iban') hay = fold(tx.iban).replace(/\s/g, '');
    else hay = Fin.haystack(tx) + ' ' + fold(tx.iban);
    return hay.includes(t.replace(/\s/g, f === 'iban' ? '' : ' '));
  };
  Fin.categorize = (tx, opts = {}) => {
    const { userRules = [], ownIbans = [], recurringKeys = null } = opts;
    for (const r of userRules) if (Fin.userRuleHit(r, tx)) return { cat: r.cat, label: r.label || '', by: 'user', rule: r.id };
    if (tx.iban && ownIbans.some((i) => i && i.replace(/\s/g, '') === tx.iban.replace(/\s/g, ''))) return { cat: 'umbuchung', label: 'Umbuchung', by: 'builtin' };
    const hay = Fin.haystack(tx);
    for (const r of Fin.BUILTIN_RULES) {
      if (r.sign === 'in' && tx.amount <= 0) continue;
      if (r.sign === 'out' && tx.amount >= 0) continue;
      if (r.kw.some((k) => kwHit(hay, k))) {
        const cat = Fin.CATEGORIES.find((c) => c.id === r.cat);
        if (cat.kind === 'income' && tx.amount < 0) continue;
        return { cat: r.cat, label: r.label, by: 'builtin' };
      }
    }
    if (recurringKeys && tx.amount < 0 && recurringKeys.has(Fin.merchantKey(tx))) return { cat: 'abos', label: '', by: 'recurring' };
    return { cat: tx.amount >= 0 ? Fin.FALLBACK.in : Fin.FALLBACK.out, label: '', by: 'none' };
  };

  // Anzeigename: Regel-Label, sonst Händler, sonst Name
  Fin.displayName = (tx, res) => {
    if (res && res.label) return res.label;
    const isPaypal = /paypal/i.test(tx.name || '');
    if (isPaypal) { const m = Fin.paypalMerchant(tx.purpose); return m || 'PayPal'; }
    return (tx.name || '').trim() || Fin.cleanPurpose(tx.purpose).slice(0, 40) || 'Unbekannt';
  };

  /* ---------- Wiederkehrendes erkennen ---------- */
  // Schlüssel eines Zahlungspartners (stabil über Monate: Nummern und Datumsangaben fliegen raus)
  Fin.merchantKey = (tx) => {
    const isPaypal = /paypal/i.test(tx.name || '');
    const base = isPaypal ? (Fin.paypalMerchant(tx.purpose) || 'paypal') : (tx.name || Fin.cleanPurpose(tx.purpose));
    return fold(base).replace(/[0-9]+/g, '').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ');
  };
  // Liefert Kandidaten: gleicher Partner, mindestens 3 Buchungen in verschiedenen Monaten, Abstand etwa ein Monat, Betrag ähnlich
  Fin.detectRecurring = (txs) => {
    const groups = new Map();
    for (const t of txs) {
      if (t.cat === 'umbuchung') continue;
      const key = Fin.merchantKey(t);
      if (!key) continue;
      const g = groups.get(key) || { key, items: [] };
      g.items.push(t); groups.set(key, g);
    }
    const out = [];
    for (const g of groups.values()) {
      const items = g.items.slice().sort((a, b) => a.date.localeCompare(b.date));
      const months = new Set(items.map((i) => i.date.slice(0, 7)));
      const fixedCat = ['abos', 'wohnen', 'telefon', 'versicherung'].includes(items[items.length - 1].cat);
      const minN = fixedCat ? 2 : 3;                                  // bekannte Fixkosten-Kategorien genügen schon mit zwei Monaten
      if (items.length < minN) continue;
      const sign = Math.sign(items[items.length - 1].amount);
      const same = items.filter((i) => Math.sign(i.amount) === sign);
      if (same.length < minN) continue;
      const amts = same.map((i) => Math.abs(i.amount)).sort((a, b) => a - b);
      const med = amts[Math.floor(amts.length / 2)];
      const near = same.filter((i) => Math.abs(Math.abs(i.amount) - med) <= Math.max(2, med * 0.2));
      if (near.length < minN) continue;
      const gaps = [];
      for (let i = 1; i < near.length; i++) gaps.push((dparse(near[i].date) - dparse(near[i - 1].date)) / 864e5);
      const monthly = gaps.filter((d) => d >= 24 && d <= 37).length;
      if (monthly < Math.max(minN - 1, Math.ceil(gaps.length * 0.6))) continue;
      const last = near[near.length - 1];
      out.push({ key: g.key, name: last.label || Fin.displayName(last, null), amount: round2(med * sign), day: dparse(last.date).getDate(), cat: last.cat, count: near.length, last: last.date, kind: sign >= 0 ? 'income' : 'expense' });
    }
    return out.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  };

  /* ---------- CSV ---------- */
  Fin.parseCsv = (text, delim) => {
    text = String(text).replace(/^﻿/, '');
    if (!delim) {
      const first = text.split(/\r?\n/, 1)[0] || '';
      delim = ((first.match(/;/g) || []).length >= (first.match(/,/g) || []).length) ? ';' : ',';
    }
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c;
      } else if (c === '"') q = true;
      else if (c === delim) { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else if (c !== '\r') cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((x) => String(x).trim() !== ''));
  };
  const parseAmount = (s) => {
    let v = String(s == null ? '' : s).replace(/[^\d,.\-+]/g, '');
    if (!v) return NaN;
    if (v.includes(',') && v.includes('.')) v = v.lastIndexOf(',') > v.lastIndexOf('.') ? v.replace(/\./g, '').replace(',', '.') : v.replace(/,/g, '');
    else if (v.includes(',')) v = v.replace(',', '.');
    else if (/^[+-]?\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');          // „2.500" = 2500, „12.5" bleibt 12,5
    return Number(v);
  };
  const parseDate = (s) => {
    s = String(s || '').trim();
    let m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/); if (m) return `${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{2})$/); if (m) return `20${m[3]}-${pad(m[2])}-${pad(m[1])}`;
    return '';
  };
  Fin.parseAmount = parseAmount; Fin.parseDate = parseDate;
  // Spaltennamen verschiedener Banken (VR, Sparkasse, ING, DKB, Comdirect …)
  const COLS = {
    date: ['buchungstag', 'buchungsdatum', 'buchung', 'datum', 'valuta', 'valutadatum', 'booking date'],
    name: ['name zahlungsbeteiligter', 'beguenstigter/zahlungspflichtiger', 'beguenstigter / zahlungspflichtiger', 'auftraggeber/empfaenger', 'zahlungsempfaenger', 'auftraggeber / begunstigter', 'name', 'empfaenger', 'beguenstigter'],
    purpose: ['verwendungszweck', 'buchungstext', 'beschreibung', 'zweck', 'verwendung'],
    type: ['buchungstext', 'umsatzart', 'buchungsart', 'art'],
    amount: ['betrag', 'betrag (eur)', 'umsatz', 'amount'],
    iban: ['iban zahlungsbeteiligter', 'kontonummer/iban', 'iban', 'iban empfaenger'],
    acctIban: ['iban auftragskonto', 'auftragskonto'],
    acctName: ['bezeichnung auftragskonto'],
    bank: ['bankname auftragskonto'],
    balance: ['saldo nach buchung', 'saldo'],
    valuta: ['valutadatum', 'valuta', 'wertstellung'],
  };
  const pick = (head, names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  /* Liefert { txs, accounts, skipped, error }. Umsätze haben noch keine Kategorie (das macht der Aufrufer). */
  Fin.importCsv = (text, fallbackAccount) => {          // fallbackAccount: {id, name, useId?} für Exporte ohne Kontospalte
    const rows = Fin.parseCsv(text);
    // Kopfzeile suchen (manche Banken schreiben vorher Kontoinfos)
    let h = rows.findIndex((r) => { const f = r.map(fold); return pick(f, COLS.date) >= 0 && pick(f, COLS.amount) >= 0; });
    if (h < 0) return { txs: [], accounts: [], skipped: 0, error: 'Keine Spalten „Buchungstag" und „Betrag" gefunden. Ist das ein Umsatz-Export als CSV?' };
    const head = rows[h].map((x) => fold(x).trim());
    const ix = {}; for (const k of Object.keys(COLS)) ix[k] = pick(head, COLS[k]);
    if (ix.purpose === ix.type) ix.type = -1;
    const txs = [], accounts = new Map(), seen = new Map(); let skipped = 0;
    for (const r of rows.slice(h + 1)) {
      const date = parseDate(r[ix.date]); const amount = parseAmount(r[ix.amount]);
      if (!date || !isFinite(amount)) { skipped++; continue; }
      const acctIban = ix.acctIban >= 0 ? String(r[ix.acctIban] || '').replace(/\s/g, '') : '';
      const acctKey = acctIban || (fallbackAccount && fallbackAccount.id) || 'konto';
      const acctId = !acctIban && fallbackAccount && fallbackAccount.useId ? fallbackAccount.id : 'acc_' + Fin.hash(acctKey);
      if (!accounts.has(acctId)) accounts.set(acctId, { id: acctId, name: (ix.acctName >= 0 && r[ix.acctName]) || (fallbackAccount && fallbackAccount.name) || 'Konto', iban: acctIban, bank: ix.bank >= 0 ? r[ix.bank] || '' : '', kind: 'giro' });
      const name = (ix.name >= 0 ? r[ix.name] : '') || '';
      const purpose = ((ix.purpose >= 0 ? r[ix.purpose] : '') || '').replace(/\s+/g, ' ').trim();
      const type = ix.type >= 0 ? (r[ix.type] || '').trim() : '';
      const iban = ix.iban >= 0 ? String(r[ix.iban] || '').replace(/\s/g, '') : '';
      const base = [acctId, date, amount.toFixed(2), fold(name), fold(purpose).slice(0, 120)].join('|');
      const n = (seen.get(base) || 0) + 1; seen.set(base, n);                    // zwei identische Buchungen am selben Tag bleiben zwei
      const t = { id: 'tx_' + Fin.hash(base) + (n > 1 ? '_' + n : ''), acct: acctId, date, amount: round2(amount), name: name.trim(), purpose, type, iban };
      if (ix.balance >= 0) { const b = parseAmount(r[ix.balance]); if (isFinite(b)) t.balance = b; }
      txs.push(t);
    }
    return { txs, accounts: [...accounts.values()], skipped, error: '', noAccountColumn: ix.acctIban < 0 };
  };

  /* ---------- Budget ----------
     Variable Ausgabe = Ausgabe in Kategorien, die nicht „fixed" sind (Fixkosten werden vorab abgezogen).
     Verfügbar im Monat = Einnahmen (Plan) − Fixkosten (Plan) − geplante Zahlungen (noch offen) − Sparrate.
     Tageslimit = (Verfügbar − bisher ausgegeben vor heute) / verbleibende Tage inkl. heute.
     Überziehst du heute, sinkt das Limit für alle Folgetage automatisch (die Formel rechnet jeden Tag neu). */
  Fin.catMap = (cats) => { const m = new Map(); for (const c of cats) m.set(c.id, c); return m; };
  // fixKeys: Händler-Schlüssel übernommener Fixposten; deren Buchungen zählen als Fixkosten, egal in welcher Kategorie sie liegen
  Fin.isFixedTx = (tx, cmap, fixKeys) => {
    if (tx.amount >= 0) return false;
    const c = cmap.get(tx.cat);
    return !!(c && c.fixed) || !!(fixKeys && fixKeys.has(tx.mkey || Fin.merchantKey(tx)));
  };
  Fin.variableSpend = (tx, cmap, fixKeys) => {
    const c = cmap.get(tx.cat) || { kind: tx.amount < 0 ? 'expense' : 'income' };
    if (tx.ignore || tx.autoIgnore || c.kind === 'transfer' || c.kind === 'income') return 0;
    if (c.kind === 'refund') return tx.amount > 0 ? -tx.amount : 0;
    if (Fin.isFixedTx(tx, cmap, fixKeys)) return 0;
    return tx.amount < 0 ? -tx.amount : 0;
  };
  // Geplante Zahlung gilt als erledigt, wenn ein passender Umsatz kommt: Betrag ±5 %, Datum ±10 Tage, Name (erstes Wort) kommt vor
  // Ohne Namenswort (mindestens 3 Buchstaben) wird nie automatisch abgehakt; ein Umsatz erledigt nur eine Zahlung (used: Set der schon verbrauchten Umsatz-IDs)
  Fin.matchPlanned = (p, txs, used) => {
    const want = Math.abs(p.amount), word = Fin.fold(p.name).split(/[^a-z0-9]+/).filter((w) => w.length >= 3)[0];
    if (!word) return null;
    const a = Fin.addDays(p.due, -10), z = Fin.addDays(p.due, 10);
    const hit = txs.find((t) => t.amount < 0 && !t.ignore && !t.autoIgnore && t.date >= a && t.date <= z && !(used && used.has(t.id)) && Math.abs(Math.abs(t.amount) - want) <= want * 0.05 + 0.005 && (t.hay || Fin.haystack(t)).includes(word));
    if (hit && used) used.add(hit.id);
    return hit || null;
  };
  // Startwert für eine Regel aus einem Umsatz: PayPal-Händler oder Name. Abrechner (Karten-Dienstleister) und PayPal ohne Händler ergeben nichts, sonst würde die Regel alles treffen
  Fin.groupSeed = (t) => {
    const name = (t.name || '').trim();
    if (/paypal/i.test(name)) return Fin.paypalMerchant(t.purpose);
    if (/^(dz bank|nexi|payone|concardis|worldline|visa|mastercard|sumup|stripe)\b/i.test(name)) return '';
    return name;
  };
  // Budgetzeitraum: beginnt am Tag startDay (zum Beispiel 30, wenn der Unterhalt um den 30. kommt). Kürzere Monate nutzen ihren letzten Tag.
  Fin.periodStart = (y, m, startDay) => dkey(new Date(y, m, Math.min(Math.max(1, Math.round(startDay) || 1), daysInMonth(y, m))));
  Fin.period = (today, startDay = 1) => {
    const d = dparse(today), y = d.getFullYear(), m = d.getMonth();
    const thisStart = Fin.periodStart(y, m, startDay);
    const from = today >= thisStart ? thisStart : Fin.periodStart(m === 0 ? y - 1 : y, m === 0 ? 11 : m - 1, startDay);
    const nextStart = today >= thisStart ? Fin.periodStart(m === 11 ? y + 1 : y, m === 11 ? 0 : m + 1, startDay) : thisStart;
    return { from, to: Fin.addDays(nextStart, -1) };
  };
  Fin.budget = ({ txs, cats, fixed = [], planned = [], settings = {}, today }) => {
    const cmap = Fin.catMap(cats);
    const d = dparse(today), per = Fin.period(today, settings.periodStart || 1);
    const ms = per.from, me = per.to, dim = Math.round((dparse(me) - dparse(ms)) / 864e5) + 1;
    const dayNo = Math.round((d - dparse(ms)) / 864e5) + 1, daysLeft = dim - dayNo + 1;
    const active = fixed.filter((f) => f.active !== false && !f.deleted);
    const fixKeys = new Set(active.filter((f) => f.kind !== 'income' && f.key).map((f) => f.key));
    const income = round2(active.filter((f) => f.kind === 'income').reduce((s, f) => s + Math.abs(f.amount), 0));
    const fixedPlan = round2(active.filter((f) => f.kind !== 'income').reduce((s, f) => s + Math.abs(f.amount), 0));
    // Ist-Fixkosten dieses Monats: ungeplante Abos oder Rechnungen sollen das Budget trotzdem mindern
    const fixedActual = round2(txs.reduce((s, t) => (t.date >= ms && t.date <= me && !t.ignore && !t.autoIgnore && Fin.isFixedTx(t, cmap, fixKeys) ? s - t.amount : s), 0));
    const fixedSum = Math.max(fixedPlan, fixedActual);
    // Offene geplante Zahlungen: fällig bis Monatsende, auch überfällige (so lange nicht abgehakt oder im Umsatz gefunden)
    const plannedOpen = planned.filter((p) => !p.deleted && !p.done && p.due <= me && !(p.matched));
    const plannedSum = round2(plannedOpen.reduce((s, p) => s + Math.abs(p.amount), 0));
    const savings = round2(Number(settings.savingsTarget) || 0);
    const disposable = round2(income - fixedSum - plannedSum - savings);
    const spendOn = (a, b) => round2(txs.reduce((s, t) => (t.date >= a && t.date <= b ? s + Fin.variableSpend(t, cmap, fixKeys) : s), 0));
    const spentMonth = spendOn(ms, today), spentToday = spendOn(today, today), spentBeforeToday = round2(spentMonth - spentToday);
    const limitToday = Math.max(0, round2((disposable - spentBeforeToday) / daysLeft));
    const wStart = Fin.weekStart(today), wEnd = Fin.addDays(wStart, 6);
    const wFrom = wStart < ms ? ms : wStart, wTo = wEnd > me ? me : wEnd;
    const spentWeek = spendOn(wFrom, today), spentWeekBefore = round2(spentWeek - spentToday);
    const daysLeftWeek = Math.round((dparse(wTo) - d) / 864e5) + 1;
    const weekBudget = round2(spentWeekBefore + limitToday * daysLeftWeek);
    const pace = dayNo > 0 ? spentMonth / dayNo : 0;
    return {
      today, from: ms, to: me, dim, dayNo, daysLeft, daysLeftWeek, income, fixed: fixedSum, fixedPlan, fixedActual, planned: plannedSum, savings, disposable,
      month: { budget: disposable, spent: spentMonth, left: round2(disposable - spentMonth) },
      week: { budget: weekBudget, spent: spentWeek, left: round2(weekBudget - spentWeek), from: wFrom, to: wTo },
      day: { limit: limitToday, spent: spentToday, left: round2(limitToday - spentToday) },
      // Limit für morgen, wenn heute so bleibt (zeigt, wie stark Überziehen die Resttage kostet)
      tomorrow: daysLeft > 1 ? Math.max(0, round2((disposable - spentMonth) / (daysLeft - 1))) : null,
      forecast: round2(pace * dim),
    };
  };
  // Ausgaben je Kategorie in einem Zeitraum (nur echte Ausgaben, Rückzahlungen werden abgezogen)
  Fin.byCategory = (txs, cats, from, to) => {
    const cmap = Fin.catMap(cats); const sums = new Map();
    for (const t of txs) {
      if (t.date < from || t.date > to || t.ignore || t.autoIgnore) continue;
      const c = cmap.get(t.cat); if (!c || c.kind === 'transfer' || c.kind === 'income') continue;
      const v = c.kind === 'refund' ? -t.amount : (t.amount < 0 ? -t.amount : 0);
      if (!v) continue;
      const sk = c.kind === 'refund' ? 'erstattung' : t.cat; sums.set(sk, (sums.get(sk) || 0) + v);
    }
    return [...sums.entries()].map(([id, v]) => ({ id, total: round2(v) })).filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
  };
  // Einnahmen/Ausgaben je Monat (ohne Umbuchungen)
  Fin.monthly = (txs, cats, months) => {
    const cmap = Fin.catMap(cats);
    return months.map((mk) => {
      let inc = 0, exp = 0;
      for (const t of txs) {
        if (t.ignore || t.autoIgnore || !t.date.startsWith(mk)) continue;
        const c = cmap.get(t.cat) || { kind: t.amount < 0 ? 'expense' : 'income' };
        if (c.kind === 'transfer') continue;
        if (c.kind === 'refund') exp -= t.amount; else if (t.amount > 0) inc += t.amount; else exp -= t.amount;
      }
      return { month: mk, income: round2(inc), expense: round2(exp), net: round2(inc - exp) };
    });
  };
  // Nächste Fälligkeit eines Fixpostens (Tag im Monat, auf Monatsende gekürzt)
  Fin.nextDue = (day, today) => {
    const d = dparse(today); let y = d.getFullYear(), m = d.getMonth();
    const mk = (yy, mm) => dkey(new Date(yy, mm, Math.min(day, daysInMonth(yy, mm))));
    let k = mk(y, m); if (k < today) { m++; if (m > 11) { m = 0; y++; } k = mk(y, m); }
    return k;
  };
  Fin.eur = (n, opts = {}) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', ...opts }).format(n || 0);
  Fin.eurShort = (n) => new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n || 0);

  if (typeof module !== 'undefined' && module.exports) module.exports = Fin; else root.Fin = Fin;
})(typeof self !== 'undefined' ? self : this);
