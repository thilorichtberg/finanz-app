'use strict';
/* =====================================================================
   Finanzen – Neu, Formulare, Plan (Geplant, Fixkosten, Sparziele), Einstellungen
   Alle Formulare sind eigene Seiten (R4.6), Eingaben bleiben beim Neuzeichnen erhalten (R9.5).
   ===================================================================== */

/* ---------- Neu ---------- */
VIEWS.neu = (r) => {
  if (r.a && FORM_DEFS[r.a]) return renderForm(r.a, r.b);
  const tile = (href, ic, name, meta, primary) => `<a class="tile ${primary ? 'primary' : ''}" href="${href}"><span class="ic-wrap">${icon(ic)}</span><span class="info"><span class="name">${name}</span><br><span class="meta">${meta}</span></span>${icon('right')}</a>`;
  return `<div class="view-wrap">${pageHead('Neu')}<div class="tiles">
    ${tile('#/neu/ausgabe', 'minus', 'Ausgabe erfassen', 'Barzahlung oder etwas, das nicht im Bankexport steht', true)}
    ${tile('#/neu/einnahme', 'plus', 'Einnahme erfassen', 'Einmalige Einnahme')}
    ${tile('#/neu/geplant', 'calendar', 'Geplante Zahlung', 'Zum Beispiel PayPal oder Klarna in 30 Tagen')}
    ${tile('#/neu/fix', 'repeat', 'Fixposten', 'Miete, Abo oder regelmäßiges Einkommen')}
    ${tile('#/neu/ziel', 'target', 'Sparziel', 'Ein Betrag, auf den du hinsparst')}
    ${tile('#/neu/regel', 'tag', 'Eigene Regel', 'Bestimmte Umsätze immer einer Kategorie zuordnen')}
    <button type="button" class="tile" data-act="import-csv"><span class="ic-wrap">${icon('upload')}</span><span class="info"><span class="name">CSV importieren</span><br><span class="meta">Umsatz-Export deiner Bank</span></span>${icon('right')}</button></div></div>`;
};

/* ---------- Formular-Baukasten ---------- */
const accOpts = () => [['', 'Kein Konto'], ...live('acct').map((a) => [a.id, a.name])];
const catOpts = (kinds) => derived().cats.filter((c) => kinds.includes(c.kind)).map((c) => [c.id, c.name]);
const money = (s) => { const n = Fin.parseAmount(s); return isFinite(n) ? n : NaN; };
const fmtIn = (n) => (n == null || n === '' ? '' : String(n).replace('.', ','));
function fieldHtml(f, v) {
  const id = `f-${f.n}`, fid = `data-fid="${id}"`, val = v == null ? '' : v, desc = `${f.hint ? `h-${f.n} ` : ''}e-${f.n}`.trim();
  const label = f.t === 'switch' ? '' : `<label for="${id}">${esc(f.l)}${f.opt ? ' <span class="hint">(optional)</span>' : ''}</label>`;
  let input;
  if (f.t === 'select') input = `<select id="${id}" ${fid} aria-describedby="${desc}"${f.dis ? ' disabled' : ''}>${f.o.map(([k, l]) => `<option value="${esc(k)}"${String(k) === String(val) ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
  else if (f.t === 'money') input = `<div class="amount-field"><input type="text" id="${id}" ${fid} inputmode="decimal" autocomplete="off" value="${esc(fmtIn(val))}" placeholder="0,00" aria-describedby="${desc}"><span class="unit" aria-hidden="true">€</span></div>`;
  else if (f.t === 'date') input = `<input type="date" id="${id}" ${fid} value="${esc(val)}" aria-describedby="${desc}">`;
  else if (f.t === 'area') input = `<textarea id="${id}" ${fid} maxlength="500" aria-describedby="${desc}">${esc(val)}</textarea>`;
  else if (f.t === 'day') input = `<input type="text" id="${id}" ${fid} inputmode="numeric" pattern="[0-9]*" maxlength="2" autocomplete="off" value="${esc(val)}" aria-describedby="${desc}">`;
  else if (f.t === 'switch') return `<div class="field"><label class="switch-row"><input type="checkbox" id="${id}" ${fid}${val ? ' checked' : ''}> ${esc(f.l)}</label>${f.hint ? `<p class="hint" id="h-${f.n}">${esc(f.hint)}</p>` : ''}<p class="err-field" id="e-${f.n}" role="alert"></p></div>`;
  else input = `<input type="text" id="${id}" ${fid} autocomplete="off"${f.ro ? ' readonly' : ''} value="${esc(val)}" placeholder="${esc(f.ph || '')}" aria-describedby="${desc}"${f.max ? ` maxlength="${f.max}"` : ''}>`;
  return `<div class="field">${label}${input}${f.hint ? `<p class="hint" id="h-${f.n}">${esc(f.hint)}</p>` : ''}<p class="err-field" id="e-${f.n}" role="alert"></p></div>`;
}
function renderForm(type, id) {
  const def = FORM_DEFS[type](id); if (!def) return pageHead('Nicht gefunden', { back: '#/neu' }) + emptyBlock('Nicht gefunden', 'Dieser Eintrag existiert nicht mehr.', '<a class="btn" href="#/neu">Zurück</a>');
  const vals = (draft && draft.type === type && draft.id === (id || '')) ? draft.vals : def.values;
  const del = def.del ? `<button type="button" class="btn danger" data-act="del-item" data-k="${def.del.kind}" data-id="${esc(id)}" data-back="${esc(def.back)}">${esc(def.del.label || 'Löschen')}</button>` : '';
  return `<div class="view-wrap form-wrap">${pageHead(def.title, { back: def.back, backLabel: 'Zurück' })}
    <form class="form-page gform" data-type="${type}" data-id="${esc(id || '')}" novalidate>
      ${def.intro ? `<p class="hint-line">${esc(def.intro)}</p>` : ''}${def.fields.map((f) => fieldHtml(f, vals[f.n])).join('')}
      <div class="actions"><button type="submit" class="btn primary" style="flex:1">${esc(def.submit || 'Speichern')}</button></div>${del}</form></div>`;
}
function readForm(form, def) {
  const vals = {}, errs = {};
  for (const f of def.fields) {
    const el = form.querySelector(`#f-${f.n}`); if (!el) continue;
    let v = f.t === 'switch' ? el.checked : el.value.trim(); vals[f.n] = v;
    const empty = f.t === 'switch' ? false : v === '';
    if (empty) { if (!f.opt) errs[f.n] = f.req || 'Bitte ausfüllen.'; continue; }
    if (f.t === 'money') { const n = money(v); if (!isFinite(n)) errs[f.n] = 'Bitte eine Zahl eingeben, zum Beispiel 12,50.'; else if (f.neg ? n === 0 : (n < 0 || (n === 0 && !f.zero))) errs[f.n] = f.zero ? 'Der Betrag darf nicht negativ sein.' : f.neg ? 'Der Betrag darf nicht 0 sein.' : 'Der Betrag muss größer als 0 sein.'; else vals[f.n] = Fin.round2(n); }
    if (f.t === 'date' && !Fin.parseDate(v)) errs[f.n] = 'Bitte ein gültiges Datum wählen.';
    if (f.t === 'day') { const n = Number(v); if (!(n >= 1 && n <= 31) || !Number.isInteger(n)) errs[f.n] = 'Bitte einen Tag zwischen 1 und 31 eingeben.'; else vals[f.n] = n; }
    if (f.t === 'num') { const n = Number(v.replace(',', '.')); if (!isFinite(n) || n < (f.min ?? -Infinity) || n > (f.max ?? Infinity)) errs[f.n] = f.err || 'Ungültige Zahl.'; else vals[f.n] = n; }
  }
  if (def.validate) Object.assign(errs, def.validate(vals));
  return { vals, errs };
}
function showErrors(form, def, errs) {
  form.querySelectorAll('.err-field').forEach((p) => { p.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((el) => el.removeAttribute('aria-invalid'));
  let first = null;
  for (const f of def.fields) if (errs[f.n]) { const el = form.querySelector(`#f-${f.n}`), p = form.querySelector(`#e-${f.n}`); if (p) p.textContent = errs[f.n]; if (el) { el.setAttribute('aria-invalid', 'true'); if (!first) first = el; } }
  if (first) first.focus();
}

/* ---------- Formular-Definitionen ---------- */
const todayStr = () => todayKey();
const FORM_DEFS = {
  ausgabe: () => ({ title: 'Ausgabe erfassen', back: '#/neu', submit: 'Ausgabe speichern', values: { date: todayStr(), acct: (live('acct')[0] || {}).id || '' },
    fields: [{ n: 'amount', t: 'money', l: 'Betrag' }, { n: 'name', t: 'text', l: 'Wofür?', ph: 'zum Beispiel Bäcker', max: 80 }, { n: 'date', t: 'date', l: 'Datum' },
      { n: 'cat', t: 'select', l: 'Kategorie', o: [['', 'Automatisch zuordnen'], ...catOpts(['expense'])] }, ...(live('acct').length ? [{ n: 'acct', t: 'select', l: 'Konto', o: accOpts() }] : [])],
    save: (v) => { put('tx', { id: uid('tx_m'), acct: v.acct || '', date: v.date, amount: -v.amount, name: v.name, purpose: '', type: 'Manuell', iban: '', manualEntry: true, manual: v.cat || undefined }); return { to: '#/heute', msg: `Ausgabe über ${eur(v.amount)} gespeichert` }; } }),
  einnahme: () => ({ title: 'Einnahme erfassen', back: '#/neu', submit: 'Einnahme speichern', values: { date: todayStr(), acct: (live('acct')[0] || {}).id || '' },
    fields: [{ n: 'amount', t: 'money', l: 'Betrag' }, { n: 'name', t: 'text', l: 'Von wem?', ph: 'zum Beispiel Verkauf', max: 80 }, { n: 'date', t: 'date', l: 'Datum' },
      { n: 'cat', t: 'select', l: 'Kategorie', o: [['', 'Automatisch zuordnen'], ...catOpts(['income', 'refund'])] }, ...(live('acct').length ? [{ n: 'acct', t: 'select', l: 'Konto', o: accOpts() }] : [])],
    save: (v) => { put('tx', { id: uid('tx_m'), acct: v.acct || '', date: v.date, amount: v.amount, name: v.name, purpose: '', type: 'Manuell', iban: '', manualEntry: true, manual: v.cat || undefined }); return { to: '#/umsaetze', msg: `Einnahme über ${eur(v.amount)} gespeichert` }; } }),
  geplant: (id) => { const it = id ? get('planned', id) : null; if (id && !it) return null;
    return { title: it ? 'Geplante Zahlung' : 'Zahlung planen', back: '#/plan', intro: 'Wird nur bei dir gespeichert, es wird nichts bezahlt. Ab dem Monat der Fälligkeit mindert sie das Budget, vorher steht sie unter „Als Nächstes fällig“. Kommt der passende Umsatz, hakt die App sie selbst ab.',
      values: it ? { name: it.name, amount: Math.abs(it.amount), due: it.due, note: it.note || '' } : { due: Fin.addDays(todayStr(), 30) },
      fields: [{ n: 'name', t: 'text', l: 'Wofür?', ph: 'zum Beispiel PayPal, Klarna', max: 80 }, { n: 'amount', t: 'money', l: 'Betrag' }, { n: 'due', t: 'date', l: 'Fällig am' }, { n: 'note', t: 'area', l: 'Notiz', opt: true }],
      del: it ? { kind: 'planned', label: 'Zahlung löschen' } : null,
      save: (v) => { put('planned', Object.assign(it || { id: uid('pl') }, { name: v.name, amount: -v.amount, due: v.due, note: v.note })); return { to: '#/plan', msg: 'Geplante Zahlung gespeichert' }; } }; },
  fix: (id) => { const it = id ? get('fixed', id) : null; if (id && !it) return null;
    return { title: it ? 'Fixposten' : 'Fixposten anlegen', back: '#/plan/fix', intro: 'Fixposten werden jeden Monat vom Budget abgezogen (Ausgaben) oder dazugerechnet (Einnahmen).',
      values: it ? { kind: it.kind, name: it.name, amount: Math.abs(it.amount), day: it.day, active: it.active !== false } : { kind: 'expense', active: true, day: '1' },
      fields: [{ n: 'kind', t: 'select', l: 'Art', o: [['expense', 'Ausgabe (zum Beispiel Miete, Abo)'], ['income', 'Einnahme (zum Beispiel Gehalt)']] }, { n: 'name', t: 'text', l: 'Name', ph: 'zum Beispiel Miete', max: 60 },
        { n: 'amount', t: 'money', l: 'Betrag pro Monat' }, { n: 'day', t: 'day', l: 'Tag im Monat', hint: 'Kürzere Monate nutzen den letzten Tag.' }, { n: 'active', t: 'switch', l: 'Aktiv', hint: 'Pausierte Posten zählen nicht im Budget.' }],
      del: it ? { kind: 'fixed', label: 'Fixposten löschen' } : null,
      save: (v) => { const rec = Object.assign(it || { id: uid('fx') }, { kind: v.kind, name: v.name, amount: v.kind === 'income' ? v.amount : -v.amount, day: v.day, active: v.active }); if (!rec.key) rec.key = Fin.merchantKey({ name: v.name, purpose: '' }); put('fixed', rec); return { to: '#/plan/fix', msg: 'Fixposten gespeichert' }; } }; },
  ziel: (id) => { const it = id ? get('goal', id) : null; if (id && !it) return null;
    return { title: it ? 'Sparziel' : 'Sparziel anlegen', back: '#/plan/ziele', values: it ? { name: it.name, target: it.target, saved: it.saved } : { saved: '0' },
      fields: [{ n: 'name', t: 'text', l: 'Wofür sparst du?', ph: 'zum Beispiel Urlaub', max: 60 }, { n: 'target', t: 'money', l: 'Zielbetrag' }, { n: 'saved', t: 'money', l: 'Schon gespart', zero: true }],
      del: it ? { kind: 'goal', label: 'Ziel löschen' } : null,
      save: (v) => { put('goal', Object.assign(it || { id: uid('go') }, { name: v.name, target: v.target, saved: v.saved })); return { to: '#/plan/ziele', msg: 'Sparziel gespeichert' }; } }; },
  regel: (id) => { const it = id ? get('rule', id) : null; if (id && !it) return null;
    return { title: it ? 'Eigene Regel' : 'Neue Regel', back: '#/einstellungen/regeln', intro: 'Trifft eine Regel zu, bekommt der Umsatz diese Kategorie. Eigene Regeln gehen vor den festen. Die neueste Regel gewinnt.',
      values: it ? { field: it.field, text: it.text, sign: it.sign || '', cat: it.cat, min: it.min ?? '', max: it.max ?? '' } : { field: 'all', sign: 'out', cat: 'sonstiges' },
      fields: [{ n: 'field', t: 'select', l: 'Suchen in', o: [['all', 'Name und Verwendungszweck'], ['name', 'Nur Name (Zahlungsbeteiligter)'], ['purpose', 'Nur Verwendungszweck'], ['iban', 'IBAN des Zahlungsbeteiligten']] },
        { n: 'text', t: 'text', l: 'Enthält', ph: 'zum Beispiel Cleverfit', max: 80 }, { n: 'sign', t: 'select', l: 'Gilt für', o: [['out', 'Nur Ausgaben'], ['in', 'Nur Einnahmen'], ['', 'Ausgaben und Einnahmen']] },
        { n: 'cat', t: 'select', l: 'Kategorie', o: derived().cats.map((c) => [c.id, c.name]) },
        { n: 'min', t: 'money', l: 'Betrag ab', opt: true, zero: true }, { n: 'max', t: 'money', l: 'Betrag bis', opt: true, zero: true }],
      del: it ? { kind: 'rule', label: 'Regel löschen' } : null,
      save: (v) => { put('rule', Object.assign(it || { id: uid('ru') }, { field: v.field, text: v.text, sign: v.sign, cat: v.cat, min: v.min === '' ? null : v.min, max: v.max === '' ? null : v.max })); return { to: '#/einstellungen/regeln', msg: 'Regel gespeichert und angewendet' }; } }; },
  kategorie: (id) => { const c = id ? derived().cats.find((x) => x.id === id) : null; if (id && !c) return null; const own = c && !c.builtin;
    return { title: c ? c.name : 'Neue Kategorie', back: c ? `#/kategorie/${c.id}` : '#/einstellungen/kategorien',
      intro: c && c.builtin ? 'Feste Kategorien lassen sich nicht umbenennen. Du kannst ein Monatsbudget setzen.' : '',
      values: c ? { name: c.name, kind: c.kind, fixed: !!c.fixed, budget: c.budget || '' } : { kind: 'expense' },
      fields: [{ n: 'name', t: 'text', l: 'Name', max: 40, ro: !!(c && c.builtin) }, ...(!c || own ? [{ n: 'kind', t: 'select', l: 'Art', o: [['expense', 'Ausgabe'], ['income', 'Einnahme']] }, { n: 'fixed', t: 'switch', l: 'Fixkosten-Kategorie', hint: 'Ausgaben hier gelten als Fixkosten und mindern das Tagesbudget nicht zusätzlich.' }] : []),
        ...(!c || c.kind === 'expense' ? [{ n: 'budget', t: 'money', l: 'Monatsbudget', opt: true, zero: true, hint: 'Warnung ab ' + settings().warnAt + ' %.' }] : [])],
      del: own ? { kind: 'cat', label: 'Kategorie löschen' } : null,
      save: (v) => {
        if (c && c.builtin) put('cat', Object.assign({}, S.cat[c.id] || {}, { id: c.id, budget: v.budget === '' ? 0 : v.budget }));
        else put('cat', Object.assign(c ? S.cat[c.id] : { id: uid('ca') }, { custom: true, name: v.name, kind: v.kind, fixed: !!v.fixed, icon: 'tag', budget: v.budget === '' ? 0 : v.budget || 0 }));
        return { to: c ? `#/kategorie/${c.id}` : '#/einstellungen/kategorien', msg: 'Kategorie gespeichert' }; } }; },
  konto: (id) => { const it = id ? get('acct', id) : null; if (id && !it) return null;
    return { title: it ? 'Konto' : 'Konto anlegen', back: '#/einstellungen/konten', values: it ? { name: it.name, kind: it.kind || 'giro', iban: it.iban || '' } : { kind: 'giro' }, intro: 'Die IBAN erkennt Überweisungen zwischen deinen eigenen Konten, damit sie nicht als Ausgabe zählen.',
      fields: [{ n: 'name', t: 'text', l: 'Name', max: 40 }, { n: 'kind', t: 'select', l: 'Art', o: [['giro', 'Girokonto'], ['tages', 'Tagesgeld'], ['kredit', 'Kreditkarte']] }, { n: 'iban', t: 'text', l: 'IBAN', opt: true, max: 40 }],
      del: it ? { kind: 'acct', label: 'Konto entfernen' } : null,
      validate: (v) => (v.iban && !/^[A-Za-z]{2}\d{2}[A-Za-z0-9 ]{10,30}$/.test(v.iban) ? { iban: 'Das sieht nicht nach einer IBAN aus.' } : {}),
      save: (v) => { put('acct', Object.assign(it || { id: uid('acc') }, { name: v.name, kind: v.kind, iban: (v.iban || '').replace(/\s/g, '').toUpperCase() })); return { to: '#/einstellungen/konten', msg: 'Konto gespeichert' }; } }; },
  einzahlung: (id) => { const g = id ? get('goal', id) : null; if (!g) return null;
    return { title: `Einzahlen: ${g.name}`, back: '#/plan/ziele', submit: 'Speichern', intro: `Gespart ${eur(g.saved)} von ${eur(g.target)}. Mit Minus zahlst du aus.`, values: {},
      fields: [{ n: 'amount', t: 'money', l: 'Betrag', neg: true }],
      save: (v) => { put('goal', Object.assign({}, g, { saved: Math.max(0, Fin.round2(g.saved + v.amount)) })); return { to: '#/plan/ziele', msg: `${eur(Math.abs(v.amount))} ${v.amount > 0 ? 'eingezahlt' : 'ausgezahlt'}` }; } }; },
  budget: () => { const s = settings();
    return { title: 'Budget & Sparrate', back: '#/einstellungen', intro: 'Einkommen und Fixkosten trägst du unter Plan → Fixkosten ein.', values: { savingsTarget: s.savingsTarget || '0', warnAt: s.warnAt, periodStart: s.periodStart || 1 },
      fields: [{ n: 'periodStart', t: 'day', l: 'Budgetmonat beginnt am Tag', hint: 'Zum Beispiel 30, wenn dein Geld um den 30. kommt. Dann läuft der Budgetmonat vom 30. bis zum 29. Kürzere Monate nutzen ihren letzten Tag.' }, { n: 'savingsTarget', t: 'money', l: 'Sparrate pro Monat', zero: true, hint: 'Wird vor dem Tagesbudget zurückgelegt.' }, { n: 'warnAt', t: 'num', l: 'Warnen ab (Prozent)', min: 50, max: 100, err: 'Bitte eine Zahl zwischen 50 und 100.', hint: 'Gilt für das Tages-, Wochen- und Kategorie-Budget.' }],
      save: (v) => { setSettings({ savingsTarget: v.savingsTarget, warnAt: v.warnAt, periodStart: v.periodStart }); return { to: '#/einstellungen', msg: 'Gespeichert' }; } }; },
};

document.addEventListener('input', (e) => {
  const form = e.target.closest && e.target.closest('.gform');
  if (form) draft = { type: form.dataset.type, id: form.dataset.id, vals: Object.fromEntries([...form.querySelectorAll('[id^="f-"]')].map((el) => [el.id.slice(2), el.type === 'checkbox' ? el.checked : el.value])) };
});
document.addEventListener('submit', (e) => {
  const form = e.target; e.preventDefault();
  if (form.id === 'tx-form') return submitTx(form);
  if (form.id === 'login-form') return submitLogin(form);
  if (!form.classList.contains('gform')) return;
  const def = FORM_DEFS[form.dataset.type](form.dataset.id || ''); if (!def) return;
  const { vals, errs } = readForm(form, def);
  if (Object.keys(errs).length) { showErrors(form, def, errs); return; }
  const btn = form.querySelector('[type="submit"]'); btn.disabled = true; btn.textContent = 'Speichern …';
  const res = def.save(vals); draft = null; toast(res.msg); go(res.to);
});

/* Zuordnung eines Umsatzes (Details-Seite) */
document.addEventListener('change', (e) => {
  if (e.target.id === 'f-rule') { const b = $('#rule-box'); b.hidden = !e.target.checked; if (e.target.checked) $('#f-rtext').focus(); }
  if (e.target.id === 'acct-f') { ui.acct = e.target.value; ui.limit = 60; $('#txlist').innerHTML = txListHtml(); }
});
function submitTx(form) {
  const id = form.dataset.id, t = get('tx', id); let ruleId = ''; if (!t) return;
  const cat = $('#f-cat').value, rule = $('#f-rule').checked, ignore = $('#f-ignore').checked, btn = form.querySelector('[type="submit"]');
  if (rule) {
    const text = $('#f-rtext').value.trim();
    if (!text) { $('#e-rtext').textContent = 'Bitte einen Suchbegriff eingeben, zum Beispiel den Händlernamen.'; $('#f-rtext').setAttribute('aria-invalid', 'true'); $('#f-rtext').focus(); return; }
    ruleId = uid('ru'); put('rule', { id: ruleId, field: $('#f-rfield').value, text, sign: $('#f-rsign').value, cat });
    delete t.manual;
  } else if (cat !== derived().txs.find((x) => x.id === id).cat) t.manual = cat;
  btn.disabled = true; btn.textContent = 'Speichern …';
  t.ignore = ignore; put('tx', t);
  const n = rule ? derived().txs.filter((x) => x.rule === ruleId).length : 0;
  toast(rule ? `Regel gespeichert, ${n} ${n === 1 ? 'Umsatz' : 'Umsätze'} zugeordnet` : 'Gespeichert'); go('#/umsaetze');
}

/* ---------- Plan ---------- */
const PL_SEG = (cur) => seg([{ id: 'geplant', label: 'Geplant', href: '#/plan' }, { id: 'fix', label: 'Fixkosten', href: '#/plan/fix' }, { id: 'ziele', label: 'Sparziele', href: '#/plan/ziele' }], cur, 'Plan');
VIEWS.plan = (r) => (r.a === 'fix' ? planFix() : r.a === 'ziele' ? planZiele() : planGeplant());
function planGeplant() {
  const all = derived().planned.sort((a, b) => a.due.localeCompare(b.due)), t = todayKey();
  const open = all.filter((x) => !x.done && !x.matched), done = all.filter((x) => x.done || x.matched), sum = open.reduce((s, x) => s + Math.abs(x.amount), 0);
  const row = (x) => `<div class="tx ${x.done ? 'muted-row' : ''}"><button type="button" class="icon-btn" data-act="toggle-planned" data-id="${esc(x.id)}" aria-label="${x.done ? 'Wieder offen setzen' : 'Als bezahlt markieren'}: ${esc(x.name)}" aria-pressed="${!!x.done}" style="margin-left:-10px"${x.matched ? ' disabled' : ''}><span class="check" style="${x.done || x.matched ? 'background:var(--accent);border-color:var(--accent);color:var(--on-accent)' : ''}">${icon('check')}</span></button>
    <a class="info" href="#/neu/geplant/${encodeURIComponent(x.id)}" style="color:inherit;text-decoration:none"><span class="name">${esc(x.name)}</span><br><span class="meta">${x.matched ? 'Im Umsatz gefunden' : x.done ? 'Bezahlt' : relDays(x.due)} · ${dateShort(x.due)}${!x.done && x.due < t ? ' · überfällig' : ''}</span></a>${amt(x.amount)}</div>`;
  return `<div class="view-wrap">${pageHead('Plan', { actions: `<a class="icon-btn add" href="#/neu/geplant" aria-label="Zahlung planen">${icon('plus')}</a>` })}${PL_SEG('geplant')}
    ${open.length ? `<dl class="kv" style="margin-bottom:var(--s3)"><div class="total"><dt class="k">Noch offen</dt><dd>${eur(sum)}</dd></div></dl><div class="list-block">${open.map(row).join('')}</div>`
      : emptyBlock('Nichts geplant', 'Trag zukünftige Zahlungen ein, zum Beispiel PayPal oder Klarna in 30 Tagen. Sie senken schon heute dein Tageslimit.', '<a class="btn primary" href="#/neu/geplant">Zahlung planen</a>')}
    <details class="fold"><summary>Bezahlt (${done.length})${icon('right', 'chev')}</summary><div class="list">${done.map(row).join('') || '<p class="hint-line" style="padding:0 var(--s2)">Noch nichts abgehakt.</p>'}</div></details></div>`;
}
function planFix() {
  const items = live('fixed'), inc = items.filter((x) => x.kind === 'income').sort((a, b) => a.day - b.day), exp = items.filter((x) => x.kind !== 'income').sort((a, b) => a.day - b.day);
  const sum = (l) => l.filter((x) => x.active !== false).reduce((s, x) => s + Math.abs(x.amount), 0), d = derived();
  const b = budget();
  // Was ist mit dem Posten in diesem Budgetmonat passiert? Zeigt veraltete Posten (nicht mehr abgebucht) und Sammelbuchungen (mehrere Monate auf einmal)
  const ic = new Map(Fin.incomeCheck({ txs: d.txs, fixed: items, settings: settings(), today: todayKey() }).map((x) => [x.id, x]));
  const state = (x) => {
    if (x.kind === 'income' && x.active !== false) {
      const c = ic.get(x.id); if (!c || c.status === 'unknown') return { text: 'Eingang nicht prüfbar: noch keine passende Zahlung gefunden', cls: '' };
      return { ok: { text: `Eingegangen ${eur(c.actual)}`, cls: '' }, diff: { text: `Eingegangen ${eur(c.actual)} statt ${eur(c.plan)}`, cls: 'warn-text' }, pending: { text: `Erwartet am ${dateShort(c.due)}`, cls: '' }, late: { text: `Noch nicht eingegangen, erwartet am ${dateShort(c.due)}`, cls: 'warn-text' } }[c.status];
    }
    if (x.kind === 'income' || !x.key || x.active === false) return { text: '', cls: '' };
    const mine = d.txs.filter((t) => t.mkey === x.key && t.amount < 0 && !t.ignore), now = mine.filter((t) => t.date >= b.from && t.date <= b.to);
    const paid = now.reduce((s, t) => s - t.amount, 0), plan = Math.abs(x.amount);
    if (paid > 0) return { text: paid >= plan * 1.8 ? `Gebucht ${eur(paid)}, das sind etwa ${Math.round(paid / plan)} Monate auf einmal` : `Gebucht ${eur(paid)}`, cls: paid >= plan * 1.8 ? 'warn-text' : '' };
    if (!mine.length) return { text: 'Noch nie in deinen Umsätzen gefunden. Noch aktuell?', cls: 'warn-text' };
    const gap = Math.round((Date.now() - Fin.dparse(mine[0].date)) / 864e5);
    return gap > 45 ? { text: `Zuletzt am ${dateShort(mine[0].date)} abgebucht. Noch aktuell?`, cls: 'warn-text' } : { text: 'Noch nicht abgebucht', cls: '' };
  };
  const row = (x) => { const st = state(x); return `<a class="tx ${x.active === false ? 'muted-row' : ''}" href="#/neu/fix/${encodeURIComponent(x.id)}"><span class="cat-ic">${icon(x.kind === 'income' ? 'trend' : 'repeat')}</span><span class="info"><span class="name">${esc(x.name)}</span><br><span class="meta">Am ${x.day}. jeden Monat${x.active === false ? ' · pausiert' : ''}</span>${st.text ? `<br><span class="meta ${st.cls}">${esc(st.text)}</span>` : ''}</span>${amt(x.amount)}</a>`; };
  const sug = d.suggestions.slice(0, 6).map((s) => `<div class="notice" style="margin-top:var(--s2)"><p><strong>${esc(s.name)}</strong> · ${eur(s.amount)} · um den ${s.day}. · ${s.count}× gesehen</p><div class="btn-row" style="display:flex;gap:var(--s2)"><button type="button" class="btn small" data-act="adopt" data-k="${esc(s.key)}">Übernehmen</button><button type="button" class="btn small ghost" data-act="dismiss" data-k="${esc(s.key)}">Ausblenden</button></div></div>`).join('');
  return `<div class="view-wrap">${pageHead('Plan', { actions: `<a class="icon-btn add" href="#/neu/fix" aria-label="Fixposten anlegen">${icon('plus')}</a>` })}${PL_SEG('fix')}
    <dl class="kv"><div><dt>Einnahmen pro Monat</dt><dd>${eur(sum(inc))}</dd></div><div><dt>Fixkosten pro Monat</dt><dd>${eur(sum(exp))}</dd></div><div class="total"><dt class="k">Bleibt übrig</dt><dd>${eur(sum(inc) - sum(exp))}</dd></div></dl>
    ${[...ic.values()].filter((c) => c.status === 'diff').map((c) => `<div class="notice warn" role="status"><p><strong>${esc(c.name)}</strong>: ${eur(c.actual)} eingegangen, geplant waren ${eur(c.plan)} (${signed(c.diff)}). Rechnest du ab jetzt mit dem neuen Betrag?</p><button type="button" class="btn small" data-act="fix-adjust" data-id="${esc(c.id)}">Plan auf ${eur(c.actual)} anpassen</button></div>`).join('')}
    <section class="section"><h2>Einnahmen <span class="amt in">${eur(sum(inc))}</span></h2>${inc.length ? `<div class="list-block">${inc.map(row).join('')}</div>` : '<p class="hint-line">Noch kein regelmäßiges Einkommen. Ohne Einkommen kann ich kein Tageslimit berechnen.</p><a class="btn primary" href="#/neu/fix">Einkommen eintragen</a>'}</section>
    <section class="section"><h2>Fixkosten <span class="amt">${eur(-sum(exp))}</span></h2>${exp.length ? `<div class="list-block">${exp.map(row).join('')}</div>` : '<p class="hint-line">Miete, Strom, Handy, Abos: alles, was jeden Monat gleich abgebucht wird.</p>'}</section>
    ${d.suggestions.length ? `<section class="section"><h2>Erkannt in deinen Umsätzen</h2><p class="hint-line">Diese Zahlungen kommen regelmäßig. Übernimm sie als Fixposten.</p>${sug}</section>` : ''}</div>`;
}
function planZiele() {
  const goals = live('goal');
  const card = (g) => { const p = pct(g.saved, g.target); return `<div class="goal"><div class="top"><span class="nm">${esc(g.name)}</span><span class="amt">${p} %</span></div>
    <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p)}" aria-label="${esc(g.name)}: ${p} Prozent"><i style="transform:scaleX(${Math.min(1, p / 100)})"></i></div>
    <div class="sub">${eur(g.saved)} von ${eur(g.target)}${g.saved >= g.target ? ' · Ziel erreicht' : ` · noch ${eur(g.target - g.saved)}`}</div>
    <div class="btn-row"><a class="btn" href="#/neu/einzahlung/${encodeURIComponent(g.id)}">${icon('plus')}Einzahlen</a><a class="btn" href="#/neu/ziel/${encodeURIComponent(g.id)}">${icon('edit')}Bearbeiten</a></div></div>`; };
  return `<div class="view-wrap">${pageHead('Plan', { actions: `<a class="icon-btn add" href="#/neu/ziel" aria-label="Sparziel anlegen">${icon('plus')}</a>` })}${PL_SEG('ziele')}
    ${goals.length ? `<div class="list-block">${goals.map(card).join('')}</div>` : emptyBlock('Noch kein Sparziel', 'Leg ein Ziel an, zum Beispiel Urlaub oder Notgroschen, und zahle ein, wenn du etwas zurücklegst.', '<a class="btn primary" href="#/neu/ziel">Sparziel anlegen</a>')}</div>`;
}

/* ---------- Einstellungen ---------- */
const ST = (href, ic, name, meta, extra = '') => `<a class="row-link-card" href="${href}"><span class="ic-wrap" style="width:40px;height:40px;border-radius:50%;background:var(--accent-soft);color:var(--accent);display:grid;place-items:center;flex:none">${icon(ic)}</span><span class="info"><span class="name">${name}</span><br><span class="meta">${meta}</span></span>${extra}${icon('right')}</a>`;
VIEWS.einstellungen = (r) => {
  const sub = r.a;
  if (sub === 'konto') return setKonto(); if (sub === 'bank') return setBank(); if (sub === 'konten') return setKonten(); if (sub === 'regeln') return setRegeln(); if (sub === 'kategorien') return setKategorien();
  if (sub === 'budget') return renderForm('budget');
  const st = settings(), d = derived();
  return `<div class="view-wrap">${pageHead('Einstellungen')}<div class="list-block">
    ${ST('#/einstellungen/konto', 'user', 'Konto & Cloud', cloud.user ? 'Angemeldet, Abgleich ' + (cloud.state === 'ok' ? 'aktuell' : cloud.state === 'error' ? 'fehlgeschlagen' : cloud.state === 'busy' ? 'läuft …' : 'bereit') : sb ? 'Nicht angemeldet, Daten nur auf diesem Gerät' : 'Cloud nicht verfügbar')}
    ${ST('#/einstellungen/bank', 'landmark', 'Bank & Import', bankUI.state === 'ready' ? bankStatus().text : 'CSV importieren, Bank verbinden', bankUI.state === 'login' ? '<span class="badge warn">Anmelden</span>' : bankUI.state === 'off' ? '<span class="badge">Bank bald</span>' : '')}
    ${ST('#/einstellungen/konten', 'wallet', 'Konten', `${live('acct').length} ${live('acct').length === 1 ? 'Konto' : 'Konten'}`)}
    ${ST('#/einstellungen/budget', 'target', 'Budget & Sparrate', `Budgetmonat ab dem ${st.periodStart || 1}. · Sparrate ${eur(st.savingsTarget)}`)}
    ${ST('#/einstellungen/kategorien', 'layers', 'Kategorien', `${d.cats.length} Kategorien, Budgets pro Kategorie`)}
    ${ST('#/einstellungen/regeln', 'tag', 'Eigene Regeln', `${live('rule').length} ${live('rule').length === 1 ? 'Regel' : 'Regeln'} für die Zuordnung`)}</div>
    <section class="section"><h2>Backup</h2><div class="panel"><p>Sichere alle Daten dieses Geräts als Datei oder spiele ein Backup zurück.</p><div class="btn-row"><button type="button" class="btn" data-act="export-json">${icon('download')}Exportieren</button><button type="button" class="btn" data-act="import-json">${icon('upload')}Importieren</button></div></div></section>
    <section class="section"><h2>Über die App</h2><div class="panel"><p>Version ${esc((document.querySelector('meta[name="app-version"]') || {}).content || 'unbekannt')}</p><div class="btn-row"><button type="button" class="btn" data-act="check-update">${icon('refresh')}Auf Updates prüfen</button><a class="btn" href="${esc(HABITS_URL)}">${icon('today')}Zu Habits</a></div></div></section></div>`;
};
function setKonto() {
  if (!sb) return pageHead('Konto & Cloud', { back: '#/einstellungen' }) + emptyBlock('Cloud nicht verfügbar', 'Die Cloud-Bibliothek wurde nicht geladen. Die App arbeitet lokal weiter.', '');
  const body = cloud.user ? `<div class="panel"><div class="sync-line"><span class="pill-dot ${cloud.state === 'ok' ? 'ok' : cloud.state === 'error' ? 'bad' : ''}"></span><strong>${esc(cloud.user.email || 'Angemeldet')}</strong></div>
      <p>${cloud.state === 'ok' ? 'Zuletzt abgeglichen ' + new Intl.DateTimeFormat('de-DE', { timeStyle: 'short' }).format(cloud.last) : cloud.state === 'busy' ? 'Abgleich läuft …' : 'Noch nicht abgeglichen'}. Offen: ${Object.keys(S.dirty).length}</p>
      ${cloud.error ? `<p class="error" role="alert">${esc(cloud.error)}</p>` : ''}<div class="btn-row"><button type="button" class="btn primary" data-act="sync-now"${cloud.state === 'busy' ? ' disabled' : ''}>${icon('refresh')}${cloud.state === 'busy' ? 'Gleiche ab …' : 'Jetzt abgleichen'}</button><button type="button" class="btn" data-act="signout">Abmelden</button></div></div>
    <p class="hint-line" style="margin-top:var(--s3)">Dieselbe Anmeldung gilt für Habits.</p>`
    : `<form id="login-form" class="panel" novalidate><p class="login-hint">Melde dich an, damit deine Daten zwischen Geräten abgeglichen werden. Es ist dasselbe Konto wie bei Habits.</p>
      <div class="field"><label for="f-email">E-Mail</label><input type="email" id="f-email" autocomplete="email" inputmode="email" aria-describedby="e-login"></div>
      <div class="field"><label for="f-pass">Passwort</label><input type="password" id="f-pass" autocomplete="current-password" aria-describedby="e-login"></div>
      <p class="error" id="e-login" role="alert"></p><button type="submit" class="btn primary block">Anmelden</button></form>`;
  return `<div class="view-wrap">${pageHead('Konto & Cloud', { back: '#/einstellungen' })}${body}</div>`;
}
async function submitLogin(form) {
  const email = $('#f-email').value.trim(), pass = $('#f-pass').value, err = $('#e-login'), btn = form.querySelector('[type="submit"]');
  err.textContent = '';
  if (!email || !pass) { err.textContent = 'Bitte E-Mail und Passwort eingeben.'; (email ? $('#f-pass') : $('#f-email')).focus(); return; }
  btn.disabled = true; btn.textContent = 'Anmelden …';
  const { error } = await sb.auth.signInWithPassword({ email, password: pass });
  if (error) { err.textContent = 'E-Mail oder Passwort stimmt nicht.'; btn.disabled = false; btn.textContent = 'Anmelden'; $('#f-pass').focus(); return; }
  toast('Angemeldet'); render({ force: true });
}
const bankUI = { state: 'unknown', loaded: false, loading: false, links: [], banks: null, q: '', busy: '', err: '' };
function setBank() {
  const accts = live('acct'), txs = live('tx');
  const lines = accts.map((a) => { const l = txs.filter((t) => t.acct === a.id); if (!l.length) return ''; const ds = l.map((t) => t.date).sort(); return `<div><dt>${esc(a.name)}</dt><dd>${l.length} Umsätze<br><span class="hint-line">${dateShort(ds[0])} bis ${dateShort(ds[ds.length - 1])}</span></dd></div>`; }).join('');
  const st = bankUI.state, links = bankUI.links;
  const linkRow = (l) => { const exp = l.valid_until ? Math.ceil((new Date(l.valid_until) - Date.now()) / 864e5) : null;
    return `<div><dt>${esc(l.institution)}<br><span class="hint-line">${l.status === 'active' ? (exp != null ? (exp > 0 ? `Freigabe noch ${exp} Tage` : 'Freigabe abgelaufen') : 'Aktiv') : l.status === 'pending' ? 'Freigabe nicht abgeschlossen' : l.status === 'expired' ? 'Freigabe abgelaufen' : 'Fehler'}${l.last_sync ? ' · Abruf ' + new Intl.DateTimeFormat('de-DE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(l.last_sync)) : ''}</span></dt>
      <dd>${(l.status !== 'active' || (exp != null && exp <= 7)) && l.status !== 'pending' ? `<button type="button" class="btn small" data-act="bank-start" data-k="${esc(l.institution)}"${bankUI.busy ? ' disabled' : ''}>Erneuern</button>` : `<span class="badge ${l.status === 'active' ? 'ok' : 'warn'}">${l.status === 'active' ? 'Aktiv' : 'Offen'}</span>`}</dd></div>`; };
  let direct;
  if (st === 'login') direct = `<p>Melde dich an, damit die App die Bank über deinen Supabase-Server verbinden kann.</p><a class="btn" href="#/einstellungen/konto">Zur Anmeldung</a>`;
  else if (st === 'off') direct = `<p>Die Anbindung ist vorbereitet, aber auf dem Server noch nicht eingeschaltet. Bis dahin kannst du die CSV-Datei nutzen.</p><button type="button" class="btn" disabled>${icon('link')}Bank verbinden</button>`;
  else if (st === 'ready') direct = `${links.length ? `<dl class="kv">${links.map(linkRow).join('')}</dl><button type="button" class="btn primary" data-act="bank-sync"${bankUI.busy ? ' disabled' : ''}>${icon('refresh')}${bankUI.busy === 'sync' ? 'Rufe ab …' : 'Umsätze jetzt abrufen'}</button>` : ''}
      <div class="field"><label for="bank-q">${links.length ? 'Weitere Bank verbinden' : 'Bank suchen'}</label><div class="row"><input type="search" id="bank-q" data-fid="bank-q" value="${esc(bankUI.q)}" placeholder="zum Beispiel Volksbank" autocomplete="off"><button type="button" class="btn small" data-act="bank-search"${bankUI.busy ? ' disabled' : ''}>${bankUI.busy === 'search' ? 'Suche …' : 'Suchen'}</button></div></div>
      ${bankUI.banks ? (bankUI.banks.length ? `<div class="list-block">${bankUI.banks.map((b) => `<button type="button" class="tx" data-act="bank-start" data-k="${esc(b.name)}"${bankUI.busy ? ' disabled' : ''}><span class="cat-ic">${icon('landmark')}</span><span class="info"><span class="name">${esc(b.name)}</span><br><span class="meta">Bei der Bank freigeben</span></span>${icon('right')}</button>`).join('')}</div>` : '<p class="hint-line">Keine Bank gefunden. Probier einen kürzeren Suchbegriff.</p>') : ''}`;
  else direct = `<p class="hint-line">Status wird geladen …</p>`;
  return `<div class="view-wrap">${pageHead('Bank & Import', { back: '#/einstellungen' })}
    <section class="section" style="margin-top:0"><h2>Bank direkt verbinden${st === 'off' ? ' <span class="badge">Bald</span>' : ''}</h2><div class="panel">${direct}${bankUI.err ? `<p class="error" role="alert">${esc(bankUI.err)}</p>` : ''}
      ${st === 'ready' ? '<p class="hint-line">Die Bank fragt dich nach der Freigabe. Sie gilt nur für Kontoinformationen (lesen), nie zum Bezahlen, und läuft nach einigen Wochen ab. Dann bestätigst du sie einfach erneut.</p>' : ''}</div></section>
    <section class="section"><h2>CSV importieren</h2><div class="panel"><p>Lade im Online-Banking den Umsatz-Export als CSV herunter (bei der Volksbank: Umsätze → Export → CSV) und wähle die Datei hier aus. Doppelte Umsätze werden erkannt und übersprungen, du kannst jederzeit neu importieren.</p><button type="button" class="btn" data-act="import-csv">${icon('upload')}CSV auswählen</button></div>
      ${lines ? `<dl class="kv" style="margin-top:var(--s3)">${lines}</dl>` : ''}</section></div>`;
}
VIEW_AFTER.einstellungen = (r) => { if (r.a === 'bank' && !bankUI.loaded && !bankUI.loading) loadBank(); };
function setKonten() {
  const accts = live('acct');
  return `<div class="view-wrap">${pageHead('Konten', { back: '#/einstellungen', actions: `<a class="icon-btn add" href="#/neu/konto" aria-label="Konto anlegen">${icon('plus')}</a>` })}
    ${accts.length ? `<div class="list-block">${accts.map((a) => `<a class="tx" href="#/neu/konto/${encodeURIComponent(a.id)}"><span class="cat-ic">${icon(a.kind === 'kredit' ? 'card' : 'landmark')}</span><span class="info"><span class="name">${esc(a.name)}</span><br><span class="meta">${a.iban ? '…' + esc(a.iban.slice(-4)) : 'Ohne IBAN'}${a.bank ? ' · ' + esc(a.bank) : ''}</span></span>${a.balance != null ? `<span class="amt">${eur(a.balance)}</span>` : ''}</a>`).join('')}</div>` : emptyBlock('Noch kein Konto', 'Beim ersten CSV-Import wird dein Konto automatisch angelegt.', '<a class="btn primary" href="#/einstellungen/bank">CSV importieren</a>')}</div>`;
}
function setRegeln() {
  const rules = live('rule').sort((a, b) => (b._u || 0) - (a._u || 0)), fl = { all: 'enthält', name: 'Name enthält', purpose: 'Zweck enthält', iban: 'IBAN enthält' };
  return `<div class="view-wrap">${pageHead('Eigene Regeln', { back: '#/einstellungen', actions: `<a class="icon-btn add" href="#/neu/regel" aria-label="Regel anlegen">${icon('plus')}</a>` })}
    <p class="hint-line" style="margin-bottom:var(--s3)">Eigene Regeln gehen vor den festen. Die neueste gewinnt. Alles, was keine Regel trifft, landet unter Sonstiges.</p>
    ${rules.length ? `<div class="list-block">${rules.map((x) => `<a class="tx" href="#/neu/regel/${encodeURIComponent(x.id)}"><span class="cat-ic">${icon('tag')}</span><span class="info"><span class="name">${esc(fl[x.field] || 'enthält')} „${esc(x.text)}“</span><br><span class="meta">${esc(catById(x.cat).name)}${x.sign === 'in' ? ' · nur Einnahmen' : x.sign === 'out' ? ' · nur Ausgaben' : ''}</span></span>${icon('right')}</a>`).join('')}</div>`
      : emptyBlock('Noch keine eigenen Regeln', 'Öffne einen Umsatz und wähle „Auch für ähnliche Umsätze merken“, oder lege hier eine Regel an.', '<a class="btn primary" href="#/neu/regel">Regel anlegen</a>')}</div>`;
}
function setKategorien() {
  const d = derived();
  return `<div class="view-wrap">${pageHead('Kategorien', { back: '#/einstellungen', actions: `<a class="icon-btn add" href="#/neu/kategorie" aria-label="Kategorie anlegen">${icon('plus')}</a>` })}
    <div class="list-block">${d.cats.map((c) => `<a class="tx" href="#/neu/kategorie/${esc(c.id)}"><span class="cat-ic">${icon(c.icon)}</span><span class="info"><span class="name">${esc(c.name)}</span><br><span class="meta">${c.kind === 'income' ? 'Einnahme' : c.kind === 'transfer' ? 'Zählt nicht' : c.kind === 'refund' ? 'Mindert Ausgaben' : c.fixed ? 'Fixkosten' : 'Ausgabe'}${c.builtin ? '' : ' · eigene'}</span></span>${c.budget > 0 ? `<span class="amt">${eur(c.budget)}</span>` : icon('right')}</a>`).join('')}</div></div>`;
}
