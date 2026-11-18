'use strict';
/* =====================================================================
   Finanzen – Ansichten: Heute, Umsätze, Kategorien, Berichte, Umsatz-Details
   ===================================================================== */

const ui = { month: todayKey().slice(0, 7), filter: 'alle', q: '', limit: 60, acct: '' };
const MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
const MON_S = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const monthLabel = (mk) => `${MONTHS[Number(mk.slice(5)) - 1]} ${mk.slice(0, 4)}`;
const shiftMonth = (mk, n) => { const d = new Date(Number(mk.slice(0, 4)), Number(mk.slice(5)) - 1 + n, 1); return Fin.dkey(d).slice(0, 7); };
const monthRange = (mk) => [`${mk}-01`, `${mk}-${String(Fin.daysInMonth(Number(mk.slice(0, 4)), Number(mk.slice(5)) - 1)).padStart(2, '0')}`];
const dayLabel = (k) => {
  const t = todayKey();
  if (k === t) return 'Heute'; if (k === Fin.addDays(t, -1)) return 'Gestern';
  return fmtD({ weekday: 'short', day: 'numeric', month: 'short', year: k.slice(0, 4) === t.slice(0, 4) ? undefined : 'numeric' }).format(Fin.dparse(k));
};
const dateLong = (k) => fmtD({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(Fin.dparse(k));
const dateShort = (k) => fmtD({ day: 'numeric', month: 'short' }).format(Fin.dparse(k));
const relDays = (k) => { const n = Math.round((Fin.dparse(k) - Fin.dparse(todayKey())) / 864e5); return n === 0 ? 'heute' : n === 1 ? 'morgen' : n === -1 ? 'gestern' : n > 0 ? `in ${n} Tagen` : `vor ${-n} Tagen`; };
const signed = (n) => (n > 0 ? '+' : '') + eur(n);
const amt = (n, cls = '') => `<span class="amt ${n > 0 ? 'in' : ''} ${cls}">${signed(n)}</span>`;

function pageHead(title, o = {}) {
  const back = o.back ? `<a class="back" href="${o.back}" aria-label="${esc(o.backLabel || 'Zurück')}">${icon('left')}</a>` : '';
  return `<div class="page-head ${o.left === false ? '' : 'left'}">${back}<div class="titles"><h1>${esc(title)}</h1>${o.sub ? `<p>${esc(o.sub)}</p>` : ''}</div>${o.actions ? `<div class="head-actions">${o.actions}</div>` : ''}</div>`;
}
function seg(items, cur, label) {
  return `<nav class="seg ${items.length === 3 ? 'three' : ''}" aria-label="${esc(label)}">${items.map((i) => `<a href="${i.href}"${i.id === cur ? ' aria-current="page"' : ''}>${esc(i.label)}</a>`).join('')}</nav>`;
}
function txRow(t, opt = {}) {
  const c = derived().cmap.get(t.cat) || catById(t.cat);
  const meta = [c.name, opt.showDate ? dateShort(t.date) : '', t.by === 'recurring' ? 'wiederkehrend' : ''].filter(Boolean).join(' · ');
  return `<a class="tx" href="#/tx/${encodeURIComponent(t.id)}" data-fid="tx-${esc(t.id)}"><span class="cat-ic">${icon(c.icon)}</span>
    <span class="info"><span class="name">${esc(t.title)}</span><br><span class="meta">${esc(meta)}</span></span>${amt(t.amount, c.kind === 'transfer' ? 'muted' : '')}</a>`;
}
function emptyBlock(title, text, btn) {
  return `<div class="empty"><h2>${esc(title)}</h2><p>${esc(text)}</p>${btn || ''}</div>`;
}
function monthNav(mk, route) {
  const now = todayKey().slice(0, 7);
  return `<div class="monthnav"><button type="button" class="icon-btn" data-act="month" data-k="-1" aria-label="Vorheriger Monat">${icon('left')}</button>
    <div class="m" aria-live="polite">${esc(monthLabel(mk))}</div>
    <button type="button" class="icon-btn" data-act="month" data-k="1" aria-label="Nächster Monat"${mk >= now ? ' disabled' : ''}>${icon('right')}</button></div>`;
}
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 100) : a > 0 ? 100 : 0);
function meterHtml(spent, budgetV, warnAt) {
  const p = pct(spent, budgetV), cls = p >= 100 ? 'bad' : p >= warnAt ? 'warn' : '';
  return `<div class="meter ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p)}" aria-label="Budget zu ${p} Prozent verbraucht"><i style="transform:scaleX(${Math.min(1, p / 100)})"></i></div>`;
}

/* ---------- Heute ---------- */
VIEWS.heute = (r) => {
  const range = ['tag', 'woche', 'monat'].includes(r.a) ? r.a : 'tag';
  const d = derived(), b = budget(), st = settings(), t = todayKey();
  const hasPlan = b.income > 0;
  const R = { tag: { cap: 'Heute übrig', v: b.day, name: 'Tageslimit', unit: 'heute' }, woche: { cap: 'Diese Woche übrig', v: b.week, name: 'Wochenbudget', unit: 'diese Woche' }, monat: { cap: `${MONTHS[Number(t.slice(5, 7)) - 1]} übrig`, v: b.month, name: 'Monatsbudget', unit: 'diesen Monat' } }[range];
  const budgetV = range === 'tag' ? b.day.limit : R.v.budget, left = R.v.left, spent = R.v.spent;
  const p = pct(spent, budgetV);
  let state = `<span class="state ok">${icon('check')}Im Budget</span>`;
  if (!hasPlan) state = `<span class="state">${icon('info')}Noch kein Einkommen. <a href="#/plan/fix" style="color:var(--accent);font-weight:700">Eintragen</a></span>`;
  else if (left < 0) state = `<span class="state bad">${icon('alert')}${esc(R.unit === 'heute' ? 'Heute' : R.unit === 'diese Woche' ? 'Diese Woche' : 'Im Monat')} um ${eur(-left)} überschritten</span>`;
  else if (p >= st.warnAt) state = `<span class="state warn">${icon('alert')}Fast aufgebraucht (${p} %)</span>`;
  const slot = range === 'tag' ? (b.tomorrow == null ? 'Morgen: Monatsende' : `Morgen: ${eur(b.tomorrow)}`) : range === 'woche' ? `Noch ${b.daysLeftWeek} ${b.daysLeftWeek === 1 ? 'Tag' : 'Tage'} in dieser Woche` : `Noch ${b.daysLeft} ${b.daysLeft === 1 ? 'Tag' : 'Tage'} im Monat`;
  const hero = `<section class="hero" aria-label="Budget ${R.unit}"><div class="cap">${esc(R.cap)}</div>
    <div class="big ${left < 0 ? 'over' : ''}">${hasPlan ? eur(left) : eur(0)}</div>
    <div class="sub"><span>${esc(R.name)} ${hasPlan ? eur(budgetV) : '–'}</span><span>Ausgegeben ${eur(spent)}</span><span>${esc(slot)}</span></div>
    ${meterHtml(spent, hasPlan ? budgetV : 0, st.warnAt)}${state}</section>`;
  const todays = d.txs.filter((x) => x.date === t);
  const upcoming = [
    ...d.planned.filter((x) => !x.done && !x.matched && x.due <= Fin.addDays(t, 30)).map((x) => ({ k: 'planned', id: x.id, name: x.name, amount: -Math.abs(x.amount), date: x.due })),
    ...live('fixed').filter((x) => x.active !== false && x.kind !== 'income').map((x) => ({ k: 'fix', id: x.id, name: x.name, amount: -Math.abs(x.amount), date: Fin.nextDue(x.day, t) })).filter((x) => x.date <= Fin.addDays(t, 14)),
  ].sort((a, c) => a.date.localeCompare(c.date)).slice(0, 5);
  const warns = d.cats.filter((c) => c.budget > 0).map((c) => {
    const [a, z] = monthRange(t.slice(0, 7)); const sp = (Fin.byCategory(d.txs, d.cats, a, z).find((x) => x.id === c.id) || { total: 0 }).total;
    return { c, sp, p: pct(sp, c.budget) };
  }).filter((x) => x.p >= st.warnAt).sort((a, c) => c.p - a.p);
  const unsorted = d.txs.filter((x) => x.cat === 'sonstiges' && !x.ignore).length;
  const accts = live('acct').filter((a) => a.balance != null);
  return `<div class="view-wrap">
    ${pageHead('Finanzen', { sub: dateLong(t) })}
    ${seg([{ id: 'tag', label: 'Tag', href: '#/heute/tag' }, { id: 'woche', label: 'Woche', href: '#/heute/woche' }, { id: 'monat', label: 'Monat', href: '#/heute/monat' }], range, 'Zeitraum')}
    ${hero}
    <section class="section" style="margin-top:0"><h2>So entsteht dein Monatsbudget</h2>
      <dl class="kv"><div><dt>Einnahmen (Plan)</dt><dd>${eur(b.income)}</dd></div><div><dt>− Fixkosten</dt><dd>${eur(b.fixed)}</dd></div>
      <div><dt>− Geplante Zahlungen</dt><dd>${eur(b.planned)}</dd></div><div><dt>− Sparrate</dt><dd>${eur(b.savings)}</dd></div>
      <div class="total"><dt class="k">Verfügbar</dt><dd>${eur(b.disposable)}</dd></div></dl>
      <p class="hint-line">Prognose bei gleichem Tempo: ${eur(b.forecast)} bis Monatsende${b.disposable > 0 ? (b.forecast > b.disposable ? ', das wären ' + eur(b.forecast - b.disposable) + ' zu viel.' : ', das passt ins Budget.') : '.'}</p></section>
    <section class="section"><h2>Heute gebucht</h2>${todays.length ? `<div class="list-block">${todays.map((x) => txRow(x)).join('')}</div>` : `<p class="hint-line">Heute noch keine Umsätze.</p>`}</section>
    <section class="section"><h2>Als Nächstes fällig</h2>${upcoming.length ? `<div class="list-block">${upcoming.map((u) => `<a class="tx" href="#/neu/${u.k === 'planned' ? 'geplant' : 'fix'}/${encodeURIComponent(u.id)}"><span class="cat-ic">${icon(u.k === 'planned' ? 'calendar' : 'repeat')}</span><span class="info"><span class="name">${esc(u.name)}</span><br><span class="meta">${relDays(u.date)} · ${dateShort(u.date)}${u.k === 'fix' ? ' · Fixkosten' : ''}</span></span>${amt(u.amount)}</a>`).join('')}</div>` : `<p class="hint-line">In den nächsten Tagen ist nichts fällig.</p>`}</section>
    <section class="section"><h2>Aufräumen</h2><div class="list-block">
      <a class="row-link-card" href="#/zuordnen"><span class="info"><span class="name">Sonstiges zuordnen</span><br><span class="meta">${unsorted ? unsorted + (unsorted === 1 ? ' Umsatz wartet' : ' Umsätze warten') : 'Alles zugeordnet'}</span></span>${icon('right')}</a>
      <a class="row-link-card" href="#/plan/fix"><span class="info"><span class="name">Wiederkehrende Zahlungen</span><br><span class="meta">${d.suggestions.length ? d.suggestions.length + ' erkannt, als Fixposten übernehmen' : 'Keine neuen erkannt'}</span></span>${icon('right')}</a>
      <a class="row-link-card" href="#/umsaetze/kategorien"><span class="info"><span class="name">Kategorie-Budgets</span><br><span class="meta ${warns.length ? 'warn-text' : ''}">${warns.length ? warns.map((w) => `${esc(w.c.name)} ${w.p} %`).join(', ') : 'Keine Warnungen'}</span></span>${icon('right')}</a></div></section>
    <section class="section"><h2>Kontostand</h2>${accts.length ? `<dl class="kv">${accts.map((a) => `<div><dt>${esc(a.name)}</dt><dd>${eur(a.balance)}</dd></div>`).join('')}</dl><p class="hint-line">Stand der letzten Buchung${accts[0].balanceDate ? ' (' + dateShort(accts[0].balanceDate) + ')' : ''}.</p>` : `<p class="hint-line">Noch kein Konto. Importiere deine Umsätze als CSV oder verbinde die Bank.</p><a class="btn" href="#/einstellungen/bank">${icon('landmark')}Bank & Import</a>`}</section></div>`;
};

/* ---------- Umsätze: Liste ---------- */
function filteredTxs() {
  const d = derived(), q = Fin.fold(ui.q).trim();
  return d.txs.filter((t) => {
    if (ui.acct && t.acct !== ui.acct) return false;
    const c = d.cmap.get(t.cat) || { kind: 'expense' };
    if (ui.filter === 'ausgaben' && !(t.amount < 0 && c.kind !== 'transfer')) return false;
    if (ui.filter === 'einnahmen' && !(t.amount > 0 && c.kind !== 'transfer')) return false;
    if (ui.filter === 'sonstiges' && !(t.cat === 'sonstiges' || t.cat === 'sonstige-einnahmen')) return false;
    if (q && !Fin.fold(`${t.title} ${t.name} ${t.purpose} ${c.name} ${t.amount}`).includes(q)) return false;
    return true;
  });
}
function txListHtml() {
  const all = filteredTxs(), list = all.slice(0, ui.limit);
  if (!all.length) return live('tx').length ? `<div class="empty compact"><h2>Nichts gefunden</h2><p>Ändere Suche oder Filter.</p><button type="button" class="btn" data-act="clear-filter">Filter zurücksetzen</button></div>`
    : `<div class="empty"><h2>Noch keine Umsätze</h2><p>Importiere eine CSV-Datei deiner Bank oder erfasse eine Ausgabe von Hand.</p><button type="button" class="btn primary" data-act="import-csv">${icon('upload')}CSV importieren</button><a class="btn" href="#/neu/ausgabe">Ausgabe erfassen</a></div>`;
  const cmap = derived().cmap; let html = '', cur = '', sum = 0, buf = '';
  const flush = () => { if (cur) html += `<div class="day-head"><span>${esc(dayLabel(cur))}</span><span>${signed(sum)}</span></div><div class="list-block">${buf}</div>`; };
  for (const t of list) {
    if (t.date !== cur) { flush(); cur = t.date; sum = 0; buf = ''; }
    buf += txRow(t); if ((cmap.get(t.cat) || {}).kind !== 'transfer') sum += t.amount;
  }
  flush();
  if (all.length > list.length) html += `<button type="button" class="btn block more" data-act="more">Mehr anzeigen (${all.length - list.length})</button>`;
  return html;
}
const UM_SEG = (cur) => seg([{ id: 'liste', label: 'Liste', href: '#/umsaetze' }, { id: 'kategorien', label: 'Kategorien', href: '#/umsaetze/kategorien' }, { id: 'berichte', label: 'Berichte', href: '#/umsaetze/berichte' }], cur, 'Ansicht');
VIEWS.umsaetze = (r) => {
  const sub = r.a === 'kategorien' ? 'kategorien' : r.a === 'berichte' ? 'berichte' : 'liste';
  if (sub === 'kategorien') return umKategorien();
  if (sub === 'berichte') return umBerichte();
  const accts = live('acct');
  const chips = [['alle', 'Alle'], ['ausgaben', 'Ausgaben'], ['einnahmen', 'Einnahmen'], ['sonstiges', 'Sonstiges']];
  return `<div class="view-wrap">${pageHead('Umsätze', { actions: `<button type="button" class="icon-btn" data-act="import-csv" aria-label="CSV importieren">${icon('upload')}</button>` })}
    ${UM_SEG('liste')}
    <div class="todo-bar"><label class="search"><span class="sr">Umsätze durchsuchen</span>${icon('search')}<input type="search" id="q" data-fid="q" value="${esc(ui.q)}" placeholder="Suchen" autocomplete="off" enterkeyhint="search"></label></div>
    <div class="filters" role="group" aria-label="Filter">${chips.map(([id, l]) => `<button type="button" class="chip-filter" data-act="filter" data-k="${id}" aria-pressed="${ui.filter === id}">${l}</button>`).join('')}</div>
    ${accts.length > 1 ? `<div class="field" style="margin-bottom:var(--s3)"><label for="acct-f">Konto</label><select id="acct-f" data-fid="acct-f"><option value="">Alle Konten</option>${accts.map((a) => `<option value="${esc(a.id)}"${ui.acct === a.id ? ' selected' : ''}>${esc(a.name)}</option>`).join('')}</select></div>` : ''}
    <div id="txlist" data-live>${txListHtml()}</div></div>`;
};

/* ---------- Umsätze: Kategorien ---------- */
function catRowHtml(c, sum, total, warnAt, month) {
  const hasB = c.budget > 0, p = hasB ? pct(sum, c.budget) : pct(sum, total);
  const sub = hasB ? `${eur(sum)} von ${eur(c.budget)}${p >= 100 ? ' – überschritten' : p >= warnAt ? ' – bald aufgebraucht' : ''}` : `${p} % der Ausgaben`;
  const cls = hasB ? (p >= 100 ? 'bad' : p >= warnAt ? 'warn' : '') : '';
  return `<a class="catrow" href="#/kategorie/${c.id}"><span class="top"><span class="cat-ic">${icon(c.icon)}</span><span class="nm">${esc(c.name)}</span><span class="amt">${eur(sum)}</span></span>
    <span class="meter ${cls}" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, p)}" aria-label="${esc(sub)}"><i style="transform:scaleX(${Math.min(1, p / 100)})"></i></span><span class="sub"><span class="${cls === 'bad' ? 'over-text' : cls === 'warn' ? 'warn-text' : ''}">${esc(sub)}</span></span></a>`;
}
function umKategorien() {
  const d = derived(), [a, z] = monthRange(ui.month), st = settings();
  const sums = Fin.byCategory(d.txs, d.cats, a, z), total = sums.reduce((s, x) => s + x.total, 0);
  const have = new Set(sums.map((s) => s.id));
  const withBudget = d.cats.filter((c) => c.budget > 0 && !have.has(c.id));
  return `<div class="view-wrap">${pageHead('Umsätze')}${UM_SEG('kategorien')}${monthNav(ui.month)}
    <dl class="kv" style="margin-bottom:var(--s4)"><div class="total"><dt class="k">Ausgaben im ${esc(MONTHS[Number(ui.month.slice(5)) - 1])}</dt><dd>${eur(total)}</dd></div></dl>
    ${sums.length || withBudget.length ? `<div class="list-block">${sums.map((s) => catRowHtml(catById(s.id), s.total, total, st.warnAt)).join('')}${withBudget.map((c) => catRowHtml(c, 0, total, st.warnAt)).join('')}</div>`
      : emptyBlock('Keine Ausgaben', 'In diesem Monat gibt es keine Umsätze.', '')}
    <p class="hint-line" style="margin-top:var(--s3)">Umbuchungen zählen nicht mit. Ein Budget pro Kategorie stellst du unter Einstellungen → Kategorien ein.</p></div>`;
}
VIEWS.kategorie = (r) => {
  const d = derived(), c = d.cats.find((x) => x.id === r.a); if (!c) return pageHead('Kategorie', { back: '#/umsaetze/kategorien' }) + emptyBlock('Nicht gefunden', 'Diese Kategorie gibt es nicht mehr.', '');
  const [a, z] = monthRange(ui.month), list = d.txs.filter((t) => t.cat === c.id && t.date >= a && t.date <= z);
  const sum = list.reduce((s, t) => s + (c.kind === 'income' ? t.amount : -t.amount), 0), st = settings();
  return `<div class="view-wrap">${pageHead(c.name, { back: '#/umsaetze/kategorien', backLabel: 'Zurück zu Kategorien', actions: `<a class="icon-btn" href="#/neu/kategorie/${c.id}" aria-label="Kategorie bearbeiten">${icon('edit')}</a>` })}${monthNav(ui.month)}
    <section class="hero" style="padding-top:0"><div class="cap">${c.kind === 'income' ? 'Einnahmen' : 'Ausgaben'} im Monat</div><div class="big">${eur(sum)}</div>${c.budget > 0 ? `<div class="sub"><span>Budget ${eur(c.budget)}</span><span>${c.budget - sum >= 0 ? 'Übrig ' + eur(c.budget - sum) : 'Überschritten um ' + eur(sum - c.budget)}</span></div>${meterHtml(sum, c.budget, st.warnAt)}` : ''}</section>
    ${list.length ? `<div class="list-block">${list.map((t) => txRow(t, { showDate: true })).join('')}</div>` : emptyBlock('Keine Umsätze', 'In diesem Monat ist hier nichts gebucht.', '')}</div>`;
};

/* ---------- Umsätze: Berichte ---------- */
function umBerichte() {
  const d = derived(), mk = ui.month, prev = shiftMonth(mk, -1);
  const months = []; for (let i = 5; i >= 0; i--) months.push(shiftMonth(mk, -i));
  const rows = Fin.monthly(d.txs, d.cats, months), cur = rows[rows.length - 1], pr = Fin.monthly(d.txs, d.cats, [prev])[0];
  const [a, z] = monthRange(mk);
  const merch = new Map();
  for (const t of d.txs) { const c = d.cmap.get(t.cat) || {}; if (t.date < a || t.date > z || t.amount >= 0 || c.kind === 'transfer' || t.ignore) continue; const k = t.title; const m = merch.get(k) || { name: k, total: 0, n: 0 }; m.total += -t.amount; m.n++; merch.set(k, m); }
  const top = [...merch.values()].sort((x, y) => y.total - x.total).slice(0, 8);
  const max = Math.max(1, ...rows.flatMap((x) => [x.income, x.expense])), W = 320, H = 150, bw = 14, gap = (W - 6 * (bw * 2 + 4)) / 7;
  const bars = rows.map((x, i) => {
    const x0 = gap + i * (bw * 2 + 4 + gap), hi = Math.round((x.income / max) * 100), he = Math.round((x.expense / max) * 100);
    return `<rect class="bar-in" x="${x0}" y="${112 - hi}" width="${bw}" height="${hi}" rx="3"/><rect class="bar-out" x="${x0 + bw + 4}" y="${112 - he}" width="${bw}" height="${he}" rx="3"/><text x="${x0 + bw + 2}" y="130" text-anchor="middle">${MON_S[Number(x.month.slice(5)) - 1]}</text>`;
  }).join('');
  const diff = cur.expense - pr.expense;
  return `<div class="view-wrap">${pageHead('Umsätze')}${UM_SEG('berichte')}${monthNav(mk)}
    <div class="sum3"><div class="stat"><div class="l">Einnahmen</div><div class="v amt in">${eur(cur.income)}</div></div><div class="stat"><div class="l">Ausgaben</div><div class="v amt">${eur(cur.expense)}</div></div><div class="stat"><div class="l">Saldo</div><div class="v amt ${cur.net < 0 ? 'over' : 'in'}">${signed(cur.net)}</div></div></div>
    <p class="hint-line" style="margin-bottom:var(--s3)">${pr.expense || pr.income ? `Gegenüber ${esc(MONTHS[Number(prev.slice(5)) - 1])}: Ausgaben ${diff === 0 ? 'unverändert' : (diff > 0 ? eur(diff) + ' mehr' : eur(-diff) + ' weniger')}.` : 'Kein Vormonat zum Vergleichen.'}</p>
    <div class="chart" role="img" aria-label="Einnahmen und Ausgaben der letzten 6 Monate. ${rows.map((x) => `${MONTHS[Number(x.month.slice(5)) - 1]}: Einnahmen ${eur(x.income)}, Ausgaben ${eur(x.expense)}`).join('. ')}">
      <svg viewBox="0 0 ${W} ${H}" aria-hidden="true"><line class="gridline" x1="0" x2="${W}" y1="112" y2="112"/>${bars}</svg>
      <div class="chart-legend"><span><i style="background:var(--accent)"></i>Einnahmen</span><span><i style="background:var(--muted)"></i>Ausgaben</span></div></div>
    <section class="section"><h2>Größte Ausgaben nach Händler</h2>${top.length ? `<dl class="kv">${top.map((m) => `<div><dt>${esc(m.name)} <span class="hint-line">(${m.n}×)</span></dt><dd>${eur(m.total)}</dd></div>`).join('')}</dl>` : '<p class="hint-line">In diesem Monat keine Ausgaben.</p>'}</section>
    <section class="section"><h2>Wiederkehrende Zahlungen</h2>${d.recurring.length ? `<dl class="kv">${d.recurring.map((x) => `<div><dt>${esc(x.name)} <span class="hint-line">Tag ${x.day}</span></dt><dd>${eur(x.amount)}</dd></div>`).join('')}</dl>` : '<p class="hint-line">Noch keine erkannt. Ab drei Monaten Umsätze sieht man Muster.</p>'}</section>
    <section class="section"><h2>Export</h2><button type="button" class="btn block" data-act="export-csv">${icon('download')}Alle Umsätze als CSV</button></section></div>`;
}

/* ---------- Umsatz-Details und Zuordnung ---------- */
VIEWS.tx = (r) => {
  const d = derived(), t = d.txs.find((x) => x.id === r.a);
  if (!t) return pageHead('Umsatz', { back: '#/umsaetze' }) + emptyBlock('Nicht gefunden', 'Diesen Umsatz gibt es nicht mehr.', '<a class="btn" href="#/umsaetze">Zur Liste</a>');
  const c = d.cmap.get(t.cat) || catById(t.cat), acct = get('acct', t.acct);
  const by = { manual: 'von dir gewählt', user: 'eigene Regel', builtin: 'feste Regel', recurring: 'als wiederkehrend erkannt', none: 'nicht zugeordnet' }[t.by] || '';
  const groups = [['Ausgaben', d.cats.filter((x) => x.kind === 'expense')], ['Einnahmen', d.cats.filter((x) => x.kind === 'income' || x.kind === 'refund')], ['Ohne Wirkung', d.cats.filter((x) => x.kind === 'transfer')]];
  const catSel = groups.map(([g, l]) => `<optgroup label="${g}">${l.map((x) => `<option value="${esc(x.id)}"${x.id === t.cat ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</optgroup>`).join('');
  const seed = /paypal/i.test(t.name) ? (Fin.paypalMerchant(t.purpose) || t.name) : t.name;
  return `<div class="view-wrap">${pageHead(t.title, { back: '#/umsaetze', backLabel: 'Zurück zu Umsätzen' })}
    <section class="hero" style="padding-top:0"><div class="cap">${esc(dateLong(t.date))}</div><div class="big ${t.amount > 0 ? '' : ''}" style="${t.amount > 0 ? 'color:var(--accent)' : ''}">${signed(t.amount)}</div><div class="sub"><span>${esc(c.name)} · ${esc(by)}</span></div></section>
    <dl class="kv" style="margin-bottom:var(--s4)">${t.name ? `<div><dt>Name</dt><dd>${esc(t.name)}</dd></div>` : ''}${acct ? `<div><dt>Konto</dt><dd>${esc(acct.name)}</dd></div>` : ''}${t.type ? `<div><dt>Art</dt><dd>${esc(t.type)}</dd></div>` : ''}</dl>
    ${t.purpose ? `<section class="section" style="margin-top:0"><h2>Verwendungszweck</h2><p class="hint-line" style="overflow-wrap:anywhere">${esc(Fin.cleanPurpose(t.purpose))}</p></section>` : ''}
    <form class="form-page" id="tx-form" data-id="${esc(t.id)}" novalidate style="margin-top:var(--s5)">
      <div class="field"><label for="f-cat">Kategorie</label><select id="f-cat" data-fid="f-cat">${catSel}</select></div>
      <label class="switch-row"><input type="checkbox" id="f-rule"> Auch für ähnliche Umsätze merken</label>
      <div id="rule-box" hidden class="panel">
        <div class="field"><label for="f-rfield">Suchen in</label><select id="f-rfield"><option value="all">Name und Verwendungszweck</option><option value="name">Nur Name (Zahlungsbeteiligter)</option><option value="purpose">Nur Verwendungszweck</option>${t.iban ? '<option value="iban">IBAN des Zahlungsbeteiligten</option>' : ''}</select></div>
        <div class="field"><label for="f-rtext">Enthält</label><input type="text" id="f-rtext" value="${esc(seed)}" autocomplete="off" aria-describedby="e-rtext"><p class="err-field" id="e-rtext" role="alert"></p></div>
        <div class="field"><label for="f-rsign">Gilt für</label><select id="f-rsign"><option value="${t.amount < 0 ? 'out' : 'in'}">${t.amount < 0 ? 'Nur Ausgaben' : 'Nur Einnahmen'}</option><option value="">Ausgaben und Einnahmen</option></select></div>
        <p class="hint-line">Die Regel gilt für alle bisherigen und künftigen Umsätze und geht vor den festen Regeln.</p></div>
      <label class="switch-row"><input type="checkbox" id="f-ignore"${t.ignore ? ' checked' : ''}> Nicht im Budget zählen</label>
      <div class="actions"><button type="submit" class="btn primary" style="flex:1">Speichern</button></div>
      ${t.manualEntry ? `<button type="button" class="btn danger" data-act="del-tx" data-id="${esc(t.id)}">Umsatz löschen</button>` : ''}
    </form></div>`;
};

/* ---------- Zuordnen: „Sonstiges“ nach Händler gruppiert, ein Tipp legt eine Regel an ---------- */
let zGroups = [];
VIEWS.zuordnen = () => {
  const d = derived(), cats = d.cats, map = new Map();
  for (const t of d.txs) {
    if (t.cat !== 'sonstiges' && t.cat !== 'sonstige-einnahmen') continue;
    const sign = t.amount < 0 ? 'out' : 'in', key = sign + '|' + t.mkey, g = map.get(key) || { key, sign, title: t.title, n: 0, sum: 0, seed: '', ids: [] };
    g.n++; g.sum += t.amount; g.ids.push(t.id);
    if (!g.seed) g.seed = Fin.groupSeed(t);
    map.set(key, g);
  }
  zGroups = [...map.values()].sort((a, b) => b.n - a.n || Math.abs(b.sum) - Math.abs(a.sum));
  const opt = (sign) => cats.filter((c) => (sign === 'out' ? c.kind === 'expense' || c.kind === 'transfer' : c.kind !== 'expense')).map((c) => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
  const card = (g, i) => {
    const hit = g.seed ? d.txs.filter((t) => t.by !== 'manual' && Fin.userRuleHit({ field: 'all', text: g.seed, sign: g.sign }, t)).length : 0;
    return `<div class="panel"><div class="top" style="display:flex;justify-content:space-between;gap:var(--s2)"><strong style="overflow-wrap:anywhere">${esc(g.title)}</strong><span class="amt">${eur(g.sum)}</span></div>
      <p>${g.n} ${g.n === 1 ? 'Umsatz' : 'Umsätze'}${g.seed ? '' : ' · Händler unbekannt, bitte einzeln öffnen'}</p>
      ${g.seed ? `<div class="field"><label for="zc-${i}">Kategorie für „${esc(g.seed)}“</label><select id="zc-${i}" data-fid="zc-${i}">${opt(g.sign)}</select></div>
      <button type="button" class="btn small" data-act="group-rule" data-k="${i}">${icon('tag')}Regel merken (trifft ${hit})</button>` : `<a class="btn small" href="#/tx/${encodeURIComponent(g.ids[0])}">Ersten Umsatz öffnen</a>`}</div>`;
  };
  return `<div class="view-wrap">${pageHead('Zuordnen', { back: '#/heute', backLabel: 'Zurück', sub: 'Umsätze unter „Sonstiges“, nach Händler gruppiert' })}
    ${zGroups.length ? `<div class="list-block">${zGroups.slice(0, 40).map(card).join('')}</div>` : emptyBlock('Alles zugeordnet', 'Kein Umsatz liegt unter „Sonstiges“.', '<a class="btn" href="#/heute">Zurück</a>')}</div>`;
};
