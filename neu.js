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
  const range = ['tag', 'woche', 'monat'].includes(r.a) ? r.a : 'tag';
  const d = derived(), b = budget(), st = settings(), t = todayKey();
  const hasPlan = b.income > 0;
  const R = { tag: { cap: 'Heute übrig', v: b.day, name: 'Tageslimit', unit: 'heute' }, woche: { cap: 'Diese Woche übrig', v: b.week, name: 'Wochenbudget', unit: 'diese Woche' }, monat: { cap: 'Budgetmonat übrig', v: b.month, name: 'Monatsbudget', unit: 'diesen Budgetmonat' } }[range];
  const budgetV = range === 'tag' ? b.day.limit : R.v.budget, left = R.v.left, spent = R.v.spent, p = pct(spent, budgetV);
  let state = `<span class="state ok">${icon('check')}Im Budget</span>`;
  if (!hasPlan) state = `<span class="state">${icon('info')}Noch kein Einkommen. <a href="#/plan" style="color:var(--accent);font-weight:700">Eintragen</a></span>`;
  else if (left < 0) state = `<span class="state bad">${icon('alert')}${esc(range === 'tag' ? 'Heute' : range === 'woche' ? 'Diese Woche' : 'Im Budgetmonat')} um ${eur(-left)} überschritten</span>`;
  else if (p >= st.warnAt) state = `<span class="state warn">${icon('alert')}Fast aufgebraucht (${p} %)</span>`;
  const slot = range === 'tag' ? (b.tomorrow == null ? 'Morgen: neuer Budgetmonat' : `Morgen: ${eur(b.tomorrow)}`) : range === 'woche' ? `Noch ${b.daysLeftWeek} ${b.daysLeftWeek === 1 ? 'Tag' : 'Tage'} in dieser Woche` : `${dateShort(b.from)} – ${dateShort(b.to)}, noch ${b.daysLeft} ${b.daysLeft === 1 ? 'Tag' : 'Tage'}`;
  const hero = `<section class="hero" aria-label="Budget ${R.unit}"><div class="cap">${esc(R.cap)}</div>
    <div class="big ${left < 0 ? 'over' : ''}">${hasPlan ? eur(left) : eur(0)}</div>
    <div class="sub"><span>${esc(R.name)} ${hasPlan ? eur(budgetV) : '–'}</span><span>Ausgegeben ${eur(spent)}</span><span>${esc(slot)}</span></div>
    ${meterHtml(spent, hasPlan ? budgetV : 0, st.warnAt)}${state}</section>`;
  const [from, to, label] = range === 'tag' ? [t, t, 'Heute'] : range === 'woche' ? [b.week.from, b.week.to, `Diese Woche, ${dateShort(b.week.from)} – ${dateShort(b.week.to)}`] : [b.from, b.to, `Budgetmonat, ${dateShort(b.from)} – ${dateShort(b.to)}`];
  const list = d.txs.filter((x) => x.date >= from && x.date <= to);
  return `<div class="view-wrap">${pageHead('Budget', { sub: dateLong(t) })}
    ${seg([{ id: 'tag', label: 'Tag', href: '#/heute/tag' }, { id: 'woche', label: 'Woche', href: '#/heute/woche' }, { id: 'monat', label: 'Monat', href: '#/heute/monat' }], range, 'Zeitraum')}
    ${hero}
    <section class="section" style="margin-top:0"><h2>Einnahmen und Ausgaben</h2><p class="hint-line">${esc(label)}</p>${groupedTxHtml(list)}</section></div>`;
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
