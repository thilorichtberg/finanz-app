'use strict';
/* =====================================================================
   Finanzen – Aktionen (Klicks), CSV-Import, Backup, Anmeldung, Start
   ===================================================================== */

/* ---------- CSV-Import ---------- */
async function readTextFile(file) {
  const buf = await file.arrayBuffer();
  let txt = new TextDecoder('utf-8').decode(buf);
  if (txt.includes('�')) txt = new TextDecoder('windows-1252').decode(buf);       // ältere Bank-Exporte
  return txt;
}
async function importCsvFile(file, fallback) {
  if (!file) return;
  if (file.size > 8 * 1024 * 1024) { toast('Die Datei ist zu groß (über 8 MB). Exportiere kürzere Zeiträume.', 'error'); return; }
  let text, res;
  try { text = await readTextFile(file); res = Fin.importCsv(text); } catch (e) { toast('Die Datei konnte nicht gelesen werden.', 'error'); return; }
  if (res.error) { toast(res.error, 'error'); return; }
  const accts = live('acct');
  if (res.noAccountColumn && accts.length && !fallback) {            // Export ohne Kontospalte: nachfragen, damit nichts mit dem falschen Konto verschmilzt
    openSheet(`<div class="sheet-head"><h2 id="sheet-title">Zu welchem Konto gehört die Datei?</h2><button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button></div>
      <div class="field"><label for="imp-acct">Konto</label><select id="imp-acct">${accts.map((a) => `<option value="${esc(a.id)}">${esc(a.name)}</option>`).join('')}</select></div>
      <div class="sheet-actions"><button type="button" class="btn" data-sheet-close>Abbrechen</button><button type="button" class="btn primary" id="imp-go">Importieren</button></div>`);
    $('#imp-go').addEventListener('click', () => { const a = get('acct', $('#imp-acct').value); closeSheet(); importCsvFile(file, { id: a.id, name: a.name, useId: true }); });
    return;
  }
  if (fallback) res = Fin.importCsv(text, fallback);
  if (!res.txs.length) { toast('In der Datei stehen keine Umsätze.', 'error'); return; }
  const before = derived().txs.length;
  for (const a of res.accounts) {
    const have = S.acct[a.id];
    if (!have || have._d) put('acct', Object.assign({}, a)); else if (!have.iban && a.iban) put('acct', Object.assign({}, have, { iban: a.iban, bank: a.bank || have.bank }));
  }
  let added = 0, dup = 0; const latest = {}, addedIds = [], impId = uid('imp');
  for (const t of res.txs) {
    if (!latest[t.acct] || t.date > latest[t.acct].date) latest[t.acct] = t;
    if (S.tx[t.id]) { dup++; continue; }
    const { balance, ...row } = t; row.imp = impId; put('tx', row); added++; addedIds.push(row.id);
  }
  for (const [id, t] of Object.entries(latest)) if (t.balance != null && S.acct[id] && (!S.acct[id].balanceDate || t.date >= S.acct[id].balanceDate)) put('acct', Object.assign({}, S.acct[id], { balance: t.balance, balanceDate: t.date }));
  const d = derived(), unsorted = d.txs.filter((x) => x.cat === 'sonstiges').length;
  const note = [`${added} neue ${added === 1 ? 'Umsatz' : 'Umsätze'}`, dup ? `${dup} schon vorhanden` : '', res.skipped ? `${res.skipped} Zeilen übersprungen` : ''].filter(Boolean).join(', ');
  openSheet(`<div class="sheet-head"><h2 id="sheet-title">Import fertig</h2><button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button></div>
    <p class="sheet-text">${esc(note)}.</p><p class="sheet-text">${unsorted} ${unsorted === 1 ? 'Umsatz liegt' : 'Umsätze liegen'} unter „Sonstiges“. Dort kannst du Regeln anlegen.${d.suggestions.length ? ` ${d.suggestions.length} wiederkehrende Zahlungen habe ich erkannt.` : ''}</p>
    <div class="sheet-actions"><button type="button" class="btn" data-sheet-close>Fertig</button><button type="button" class="btn ghost" id="imp-undo">Rückgängig</button>${d.suggestions.length ? '<a class="btn primary" href="#/plan/fix">Fixkosten ansehen</a>' : '<a class="btn primary" href="#/umsaetze">Umsätze ansehen</a>'}</div>`);
  $('#imp-undo').addEventListener('click', () => { addedIds.forEach((i) => remove('tx', i)); closeSheet(); toast(`Import rückgängig: ${addedIds.length} Umsätze entfernt`); render({ force: true }); });
  announce(note); render({ force: true });
}
$('#csv-file').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; importCsvFile(f); });

function downloadFile(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type })), a = document.createElement('a');
  a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function exportCsv() {
  const d = derived(), q = (s) => `"${String(s == null ? '' : s).replace(/"/g, '""')}"`;
  const head = ['Datum', 'Name', 'Verwendungszweck', 'Betrag', 'Kategorie', 'Konto'].join(';');
  const rows = d.txs.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => [t.date, q(t.title), q(Fin.cleanPurpose(t.purpose)), String(t.amount).replace('.', ','), q((d.cmap.get(t.cat) || {}).name), q((get('acct', t.acct) || {}).name)].join(';'));
  downloadFile(`finanzen-umsaetze-${todayKey()}.csv`, '﻿' + [head, ...rows].join('\r\n'), 'text/csv;charset=utf-8');
  toast(`${rows.length} Umsätze exportiert`);
}
function exportJson() {
  const data = {}; KINDS.forEach((k) => { data[k] = S[k]; });
  downloadFile(`finanzen-backup-${todayKey()}.json`, JSON.stringify({ app: 'finanzen', v: 1, exported: new Date().toISOString(), data }), 'application/json');
  toast('Backup gespeichert');
}
$('#json-file').addEventListener('change', async (e) => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let obj; try { obj = JSON.parse(await f.text()); } catch (x) { toast('Die Datei ist kein gültiges Backup.', 'error'); return; }
  if (!obj || obj.app !== 'finanzen' || !obj.data) { toast('Die Datei ist kein Finanzen-Backup.', 'error'); return; }
  const n = Object.values(obj.data.tx || {}).length;
  confirmSheet('Backup einspielen?', `Das Backup enthält ${n} Umsätze. Einträge mit gleicher Kennung werden durch die neuere Version ersetzt, nichts anderes geht verloren.`, 'Einspielen', () => {
    for (const k of KINDS) for (const [id, it] of Object.entries(obj.data[k] || {})) { const loc = S[k][id]; if (!loc || (it._u || 0) >= (loc._u || 0)) { S[k][id] = it; S.dirty[`${k}|${id}`] = 1; } }
    save(); queuePush(); toast('Backup eingespielt'); render({ force: true });
  });
});

/* ---------- Löschen mit zweiter Bestätigung (R2.3) und Wiederherstellen (R2.8) ---------- */
function armDelete(btn, run) {
  if (btn.dataset.armed) { clearTimeout(Number(btn.dataset.armed)); run(); return; }
  const orig = btn.textContent;
  btn.textContent = 'Wirklich löschen?'; btn.classList.add('armed');
  btn.dataset.armed = String(setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); btn.textContent = orig; }, 4000));
}

/* ---------- Klicks ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const act = el.dataset.act, id = el.dataset.id, k = el.dataset.k;
  switch (act) {
    case 'month': ui.month = shiftMonth(ui.month, Number(k)); render({ force: true }); announce(monthLabel(ui.month)); break;
    case 'filter': ui.filter = k; ui.limit = 60; render({ force: true }); break;
    case 'clear-filter': ui.filter = 'alle'; ui.q = ''; ui.acct = ''; ui.limit = 60; render({ force: true }); break;
    case 'more': ui.limit += 60; $('#txlist').innerHTML = txListHtml(); break;
    case 'import-csv': $('#csv-file').click(); break;
    case 'export-csv': exportCsv(); break;
    case 'export-json': exportJson(); break;
    case 'import-json': $('#json-file').click(); break;
    case 'sync-now': runSync(false); break;
    case 'signout': openSheet(`<div class="sheet-head"><h2 id="sheet-title">Abmelden</h2><button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button></div>
      <p class="sheet-text">Soll die App die Daten auf diesem Gerät behalten oder löschen? In der Cloud bleibt alles erhalten.</p>
      <div class="sheet-actions"><button type="button" class="btn" data-signout="keep">Behalten</button><button type="button" class="btn danger armed" data-signout="wipe">Löschen</button></div>`, el); break;
    case 'check-update': checkForUpdate(); break;
    case 'toggle-planned': { const p = get('planned', id); if (!p) break; put('planned', Object.assign({}, p, { done: !p.done })); render({ force: true }); announce(`${p.name}: ${p.done ? 'wieder offen' : 'bezahlt'}`); break; }
    case 'adopt': {
      const s = derived().suggestions.find((x) => x.key === k); if (!s) break;
      put('fixed', { id: uid('fx'), kind: s.kind, name: s.name, amount: s.amount, day: s.day, active: true, auto: true, key: s.key });
      toast(`„${s.name}“ als Fixposten übernommen`); render({ force: true }); break;
    }
    case 'dismiss': { const dis = Object.assign({}, settings().dismissed || {}); dis[k] = 1; setSettings({ dismissed: dis }); toast('Ausgeblendet', undefined, { label: 'Rückgängig', run: () => { const d2 = Object.assign({}, settings().dismissed || {}); delete d2[k]; setSettings({ dismissed: d2 }); render({ force: true }); } }); render({ force: true }); break; }
    case 'group-rule': {
      const g = zGroups[Number(k)], sel = $(`#zc-${k}`); if (!g || !sel || !g.seed) break;
      const rid = uid('ru'); put('rule', { id: rid, field: 'all', text: g.seed, sign: g.sign, cat: sel.value });
      const n = derived().txs.filter((x) => x.rule === rid).length;
      toast(`Regel gespeichert: ${n} ${n === 1 ? 'Umsatz' : 'Umsätze'} zugeordnet`, undefined, { label: 'Rückgängig', run: () => { remove('rule', rid); render({ force: true }); } }); render({ force: true }); break;
    }
    case 'del-tx': armDelete(el, () => { remove('tx', id); toast('Umsatz gelöscht', undefined, { label: 'Wiederherstellen', run: () => { restore('tx', id); render({ force: true }); } }); go('#/umsaetze'); }); break;
    case 'del-item': armDelete(el, () => {
      const kind = el.dataset.k, back = el.dataset.back || '#/heute', it = S[kind][id], name = it ? (it.name || it.text || 'Eintrag') : 'Eintrag';
      remove(kind, id); draft = null;
      toast(`„${name}“ gelöscht`, undefined, { label: 'Wiederherstellen', run: () => { restore(kind, id); render({ force: true }); } }); go(back);
    }); break;
  }
});
document.addEventListener('input', (e) => { if (e.target.id === 'q') { ui.q = e.target.value; ui.limit = 60; $('#txlist').innerHTML = txListHtml(); } });

/* ---------- Updates (wie bei Habits: Version vergleichen, dann frisch laden) ---------- */
async function checkForUpdate() {
  try {
    const html = await (await fetch('./?check=' + Date.now(), { cache: 'no-store' })).text();
    const live = (html.match(/<meta name="app-version" content="([^"]*)"/) || [])[1], mine = (document.querySelector('meta[name="app-version"]') || {}).content;
    if (!live) throw new Error('keine Version');
    if (live === mine) { toast('Du hast die neueste Version'); return; }
    toast('Neue Version wird geladen …');
    if ('serviceWorker' in navigator) for (const r of await navigator.serviceWorker.getRegistrations()) await r.unregister();
    if (window.caches) for (const key of await caches.keys()) await caches.delete(key);
    location.replace(location.pathname + '?u=' + Date.now() + location.hash);
  } catch (err) { toast('Update-Prüfung fehlgeschlagen. Bist du online?', 'error'); }
}

/* ---------- Start ---------- */
let lastDay = todayKey();
const dayChanged = () => { const t = todayKey(); if (t === lastDay) return; lastDay = t; if (!$('#view form')) render({ force: true }); };   // offenes Formular nie neu zeichnen (R9.5)
setInterval(dayChanged, 30000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) { dayChanged(); runSync(true); } });
window.addEventListener('online', () => runSync(true));

if (sb) {
  sb.auth.getSession().then(({ data }) => { adoptUser(data && data.session ? data.session.user : null); if (cloud.user) runSync(true); render(); });
  sb.auth.onAuthStateChange((ev, session) => { const was = !!cloud.user; adoptUser(session ? session.user : null); if (cloud.user && !was) runSync(true); });
}
render({ force: true });
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  const had = !!navigator.serviceWorker.controller; let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!had || reloading) return;
    if ($('#view form')) { toast('Neue Version da', undefined, { label: 'Neu laden', run: () => location.reload() }); return; }   // nie ein offenes Formular wegwerfen
    reloading = true; location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((reg) => { reg.update(); document.addEventListener('visibilitychange', () => { if (!document.hidden) reg.update(); }); }).catch(() => {});
}

sheet.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-signout]'); if (!b) return;
  const wipe = b.dataset.signout === 'wipe'; closeSheet();
  if (cloud.user && Object.keys(S.dirty).length) { for (let i = 0; i < 40 && syncing; i++) await new Promise((r) => setTimeout(r, 250)); await runSync(true); }
  const clean = !Object.keys(S.dirty).length && cloud.state !== 'error';
  if (wipe && !clean) { toast('Es gibt noch nicht hochgeladene Änderungen. Gleiche zuerst ab oder exportiere ein Backup.', 'error'); return; }
  await sb.auth.signOut(); cloud.user = null; cloud.state = 'idle';
  if (wipe) { KINDS.forEach((k) => { S[k] = {}; }); S.dirty = {}; S.lastSeq = 0; S.owner = ''; save(); flushSave(); }
  toast(wipe ? 'Abgemeldet, Daten auf diesem Gerät gelöscht' : 'Abgemeldet. Deine Daten bleiben auf diesem Gerät.'); render({ force: true });
});
