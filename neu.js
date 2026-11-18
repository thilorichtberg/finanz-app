'use strict';
/* =====================================================================
   Finanzen – neue Oberfläche (übergangsweise neben der alten, Schalter oben in der Mitte)
   Budget: nur Zeitraum-Schalter, „Heute übrig“ und alle Ein- und Ausgaben des Zeitraums.
   Übersicht: Liste, Kategorien (mit Tortendiagramm), Berichte. Plan: Fixkosten zuerst.
   ===================================================================== */

/* ---------- Budget ---------- */
function groupedTxHtml(list) {
  if (!list.length) return '<p class="hint-line">Keine Umsätze in diesem Zeitraum.</p>';
  const cmap = derived().cmap; let html = '', cur = '', sum = 0, buf = '';
  const flush = () => { if (cur) html += `<div class="day-head"><span>${esc(dayLabel(cur))}</span><span>${signed(sum)}</span></div><div class="list-block">${buf}</div>`; };
  for (const t of list) {
    if (t.date !== cur) { flush(); cur = t.date; sum = 0; buf = ''; }
    buf += txRow(t); if ((cmap.get(t.cat) || {}).kind !== 'transfer' && !t.ignore && !t.autoIgnore && !t.fixedId) sum += t.amount;
  }
  flush();
  return html;
}
VIEWS_NEU.heute = (r) => {
  const range = ['tag', 'woche', 'monat'].includes(r.a) ? r.a : 'monat';
  const d = derived(), st = settings(), t = todayKey(), off = ui.bo[range];
  const V = Fin.rangeView({ txs: d.txs, cats: d.cats, fixed: live('fixed'), planned: d.planned, settings: st, today: t }, range, off);
  const hasPlan = V.b.income > 0, left = V.left, spent = V.spent, budgetV = V.limit, p = pct(spent, budgetV), past = !V.current;
  const CAP = { tag: ['Heute übrig', 'Übrig an diesem Tag'], woche: ['Diese Woche übrig', 'Übrig in dieser Woche'], monat: ['Monat übrig', 'Übrig im Monat'] }[range][past ? 1 : 0];
  const NAME = { tag: 'Tageslimit', woche: 'Wochenbudget', monat: 'Monatsbudget' }[range];
  const WHO = { tag: past ? 'An diesem Tag' : 'Heute', woche: past ? 'In dieser Woche' : 'Diese Woche', monat: 'Im Monat' }[range];
  let state = `<span class="state ok">${icon('check')}Im Budget</span>`;
  if (!hasPlan) state = `<span class="state">${icon('info')}Noch kein Einkommen. <a href="#/plan" style="color:var(--accent);font-weight:700">Eintragen</a></span>`;
  else if (left < 0) state = `<span class="state bad">${icon('alert')}${WHO} um ${eur(-left)} überschritten</span>`;
  else if (p >= st.warnAt) state = `<span class="state warn">${icon('alert')}Fast aufgebraucht (${p} %)</span>`;
  const b = V.b;
  const slot = past ? (range === 'tag' ? dateLong(V.from) : `${dateShort(V.from)} – ${dateShort(V.to)}`)
    : range === 'tag' ? (b.tomorrow == null ? 'Morgen: neuer Monat' : `Morgen: ${eur(b.tomorrow)}`)
    : range === 'woche' ? `Noch ${b.daysLeftWeek} ${b.daysLeftWeek === 1 ? 'Tag' : 'Tage'} in dieser Woche` : `${periodShort(b.from, b.to)}, noch ${b.daysLeft} ${b.daysLeft === 1 ? 'Tag' : 'Tage'}`;
  const hero = `<section class="hero" aria-label="Budget"><div class="cap">${esc(CAP)}</div>
    <div class="big ${left < 0 ? 'over' : ''}">${hasPlan ? eur(left) : eur(0)}</div>
    <div class="sub"><button type="button" class="infolink" data-act="budget-info" aria-haspopup="dialog">${NAME} ${hasPlan ? eur(budgetV) : '–'}${icon('info')}</button><span>Ausgegeben ${eur(spent)}</span><span>${esc(slot)}</span></div>
    ${meterHtml(spent, hasPlan ? budgetV : 0, st.warnAt)}${state}</section>`;
  const label = range === 'tag' ? (off === 0 ? 'Heute' : off === -1 ? 'Gestern' : fmtD({ weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).format(Fin.dparse(V.from)))
    : range === 'woche' ? `${off === 0 ? 'Diese Woche, ' : ''}${dateShort(V.from)} – ${dateShort(V.to)}` : periodLabel(V.from, V.to);
  const earliest = d.txs.length ? d.txs[d.txs.length - 1].date : t, canBack = V.from > earliest;
  const NOW = { tag: 'Heute', woche: 'Diese Woche', monat: 'Jetzt' }[range];
  const nav = `<div class="monthnav bnav"><button type="button" class="icon-btn" data-act="bnav" data-k="-1" aria-label="${range === 'tag' ? 'Früherer Tag' : range === 'woche' ? 'Frühere Woche' : 'Früherer Monat'}"${canBack ? '' : ' disabled'}>${icon('left')}</button>
    <div class="m" aria-live="polite">${esc(label)}</div>
    <button type="button" class="icon-btn" data-act="bnav" data-k="1" aria-label="${range === 'tag' ? 'Späterer Tag' : range === 'woche' ? 'Spätere Woche' : 'Späterer Monat'}"${off >= 0 ? ' disabled' : ''}>${icon('right')}</button>
    <button type="button" class="btn small" data-act="bnow"${off === 0 ? ' disabled' : ''}>${NOW}</button></div>`;
  const list = d.txs.filter((x) => x.date >= V.from && x.date <= V.to);
  const sub = range === 'tag' ? dateLong(V.from) : range === 'woche' ? `Woche ${dateShort(V.from)} – ${dateShort(V.to)}` : periodShort(V.from, V.to);
  return `<div class="view-wrap">${pageHead('Budget', { sub: dateLong(t) })}
    ${seg([{ id: 'monat', label: 'Monat', href: '#/heute/monat' }, { id: 'woche', label: 'Woche', href: '#/heute/woche' }, { id: 'tag', label: 'Tag', href: '#/heute/tag' }], range, 'Zeitraum')}
    ${nav}${hero}
    <section class="section" style="margin-top:0"><h2>Einnahmen und Ausgaben</h2><p class="hint-line">${esc(sub)}</p>${groupedTxHtml(list)}</section></div>`;
};

/* ---------- Plan: Fixkosten zuerst ---------- */
VIEWS_NEU.plan = (r) => (r.a === 'geplant' ? planGeplant() : r.a === 'ziele' ? planZiele() : planFix());

/* ---------- Tortendiagramm für die Kategorien ----------
   Farben: erste sechs Plätze der geprüften Palette (hell und dunkel), Rest als „Weitere“ in Grau.
   Die Zahlen stehen zusätzlich in der Liste darunter, die Farbe allein trägt nie die Bedeutung. */
function pieHtml(parts) {
  const total = parts.reduce((s, x) => s + x.total, 0); if (total <= 0) return '';
  const cx = 100, cy = 100, R = 92, r = 56, pt = (rad, a) => `${(cx + rad * Math.cos(a)).toFixed(2)} ${(cy + rad * Math.sin(a)).toFixed(2)}`;
  let a0 = -Math.PI / 2;
  const paths = parts.map((x, i) => {
    const frac = x.total / total, a1 = a0 + Math.min(frac, 0.9999) * 2 * Math.PI, large = frac > 0.5 ? 1 : 0, p = Math.round(frac * 100);
    const d = `M${pt(R, a0)} A${R} ${R} 0 ${large} 1 ${pt(R, a1)} L${pt(r, a1)} A${r} ${r} 0 ${large} 0 ${pt(r, a0)} Z`;
    a0 = a0 + frac * 2 * Math.PI;
    return `<path class="slice" d="${d}" fill="${x.color}" stroke="var(--bg)" stroke-width="2" stroke-linejoin="round" tabindex="0" role="button" aria-pressed="false" aria-label="${esc(x.name)}, ${eur(x.total)}, ${p} Prozent" data-name="${esc(x.name)}" data-amt="${eur(x.total)}" data-pct="${p}"><title>${esc(x.name)}: ${eur(x.total)} (${p} %)</title></path>`;
  }).join('');
  return `<div class="pie" data-total="${eur(total)}"><svg viewBox="0 0 200 200" role="group" aria-label="Ausgaben nach Kategorie, ein Stück antippen zeigt die Kategorie">${paths}</svg>
    <div class="pie-center" aria-live="polite"><strong class="pc-main">${eur(total)}</strong><span class="pc-sub">Ausgaben</span></div></div>`;
}

/* ---------- Fenster „So setzt sich das Budget zusammen" (Tippen auf Tageslimit, Wochen- oder Monatsbudget) ---------- */
function budgetSheetHtml(range, off) {
  const d = derived(), st = settings(), t = todayKey();
  const V = Fin.rangeView({ txs: d.txs, cats: d.cats, fixed: live('fixed'), planned: d.planned, settings: st, today: t }, range, off), b = V.b, past = !V.current;
  const NAME = { tag: 'Tageslimit', woche: 'Wochenbudget', monat: 'Monatsbudget' }[range];
  const row = (k, v, total) => `<div class="${total ? 'total' : ''}"><dt class="${total ? 'k' : ''}">${k}</dt><dd>${v}</dd></div>`;
  const items = live('fixed').filter((f) => f.active !== false);
  const base = [row('Einnahmen (Plan)', eur(b.income)), row('− Fixkosten', eur(b.fixed)), row('− Geplante Zahlungen', eur(b.planned)), row('− Sparrate', eur(b.savings)), row(`Verfügbar im Monat <span class="hint">(${periodShort(b.from, b.to)})</span>`, eur(b.disposable), true)];
  let rest = [], note = '';
  if (range === 'tag') {
    const before = Fin.round2(b.month.spent - b.day.spent);
    rest = [row('− Bis dahin ausgegeben', eur(before)), row('= Noch verfügbar', eur(Fin.round2(b.disposable - before))), row(`÷ Tage bis Monatsende (mit diesem Tag)`, String(b.daysLeft)), row(NAME, eur(V.limit), true)];
    note = 'Gibst du an einem Tag mehr aus als das Limit, sinkt das Limit der restlichen Tage.';
  } else if (range === 'woche') {
    const days = Math.round((Fin.dparse(V.to) - Fin.dparse(V.from)) / 864e5) + 1;
    if (past) rest = [row(`Tageslimit am ${dateShort(V.from)}`, eur(b.day.limit)), row('× Tage der Woche', String(days)), row(NAME, eur(V.limit), true)];
    else { const wb = Fin.round2(b.week.spent - b.day.spent); rest = [row('Tageslimit heute', eur(b.day.limit)), row('× Tage bis Wochenende', String(b.daysLeftWeek)), row('+ Diese Woche vor heute ausgegeben', eur(wb)), row(NAME, eur(V.limit), true)]; }
    note = 'Die Woche ist der Teil, der in deinen Monat fällt.';
  } else {
    rest = [row('− Ausgegeben im Monat', eur(V.spent)), row('= Übrig', eur(V.left), true)];
  }
  const group = (title, list, fmt) => (list.length ? `<h3 style="margin-top:var(--s3)">${title}</h3><dl class="kv">${list.map(fmt).join('')}</dl>` : '');
  const inc = items.filter((f) => f.kind === 'income'), fx = items.filter((f) => f.kind !== 'income');
  const pl = d.planned.filter((p) => !p.done && !p.matched && p.due <= b.to && (!past || p.due >= b.from));
  return `<div class="sheet-head"><h2 id="sheet-title">So setzt sich das ${NAME} zusammen</h2><button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button></div>
    <dl class="kv">${base.join('')}${rest.join('')}</dl>${note ? `<p class="sheet-note">${esc(note)}</p>` : ''}
    ${group('Einnahmen', inc, (f) => row(esc(f.name), eur(Math.abs(f.amount))))}${group('Fixkosten', fx, (f) => row(esc(f.name), eur(Math.abs(f.amount))))}${group('Geplante Zahlungen', pl, (p) => row(`${esc(p.name)} <span class="hint">${dateShort(p.due)}</span>`, eur(Math.abs(p.amount))))}
    <p class="sheet-note">Buchungen, die zu einem Fixposten passen, zählen nicht als Ausgabe.</p>`;
}
