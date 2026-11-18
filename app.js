'use strict';
/* =====================================================================
   Finanzen – Grundgerüst: Speicher (local-first), Cloud-Abgleich, Navigation, Dialoge
   Die Ansichten stehen in views.js, der Start in boot.js.
   ===================================================================== */

const KEY = 'finanz-v1';
// Gleiches Supabase-Projekt und gleicher Browser-Ursprung wie Habits: die Anmeldung gilt für beide Apps.
const SUPABASE_URL = 'https://syzrpidpcgkmpjowpcfp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_iOFLmwKaW6Qx65EBhPUzng_MH9q1IPg';
const sb = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY) : null;
const HABITS_URL = location.hostname.endsWith('github.io') ? `${location.origin}/habits/` : 'https://thilorichtberg.github.io/habits/';
const KINDS = ['tx', 'acct', 'cat', 'rule', 'fixed', 'planned', 'goal', 'settings'];
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const eur = Fin.eur;
const fmtD = (o) => new Intl.DateTimeFormat('de-DE', o);
const todayKey = () => Fin.dkey(new Date());
const uid = (p) => `${p}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

/* ---------- Icons (Lucide-Stil, 24 px, Strich 2) ---------- */
const ICONS = {
  check: '<path d="M20 6 9 17l-5-5"/>', plus: '<path d="M5 12h14M12 5v14"/>', minus: '<path d="M5 12h14"/>',
  left: '<path d="m15 18-6-6 6-6"/>', right: '<path d="m9 18 6-6-6-6"/>', x: '<path d="M18 6 6 18M6 6l12 12"/>',
  edit: '<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>', trash: '<path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>', upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>', menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  chart: '<path d="M3 3v18h18"/><path d="M18 17V9M13 17V5M8 17v-3"/>', today: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>', list: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
  gear: '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>',
  wallet: '<path d="M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  repeat: '<path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>', phone: '<rect width="14" height="20" x="5" y="2" rx="2"/><path d="M12 18h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  heart: '<path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>',
  film: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  cash: '<rect width="20" height="12" x="2" y="6" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>', swap: '<path d="M8 3 4 7l4 4"/><path d="M4 7h16"/><path d="m16 21 4-4-4-4"/><path d="M20 17H4"/>',
  trend: '<polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/>', card: '<rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/>',
  dots: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>', target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  landmark: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  refund: '<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>', tag: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/><circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>',
  alert: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>', link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  user: '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', file: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" x2="4" y1="22" y2="15"/>', info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  layers: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/><path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/><path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>',
  bank: '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
};
const icon = (n, cls = '') => `<svg class="ic ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ICONS.dots}</svg>`;

/* ---------- Speicher (local-first, last write wins pro Eintrag) ---------- */
const blank = () => { const o = { v: 1, dirty: {}, lastSeq: 0, owner: '' }; KINDS.forEach((k) => { o[k] = {}; }); return o; };
function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) { const o = JSON.parse(raw); const b = blank(); KINDS.forEach((k) => { b[k] = o[k] || {}; }); b.dirty = o.dirty || {}; b.lastSeq = o.lastSeq || 0; b.owner = o.owner || ''; return b; }
  } catch (e) { /* kaputter oder gesperrter Speicher: leer starten */ }
  return blank();
}
const S = loadState();
let rev = 0, saveTimer = 0, storageFailed = false;
function flushSave() {
  clearTimeout(saveTimer); saveTimer = 0;
  try { localStorage.setItem(KEY, JSON.stringify(S)); storageFailed = false; }
  catch (e) { if (!storageFailed) { storageFailed = true; toast('Speichern im Browser nicht möglich. Mach ein Backup, bevor du die Seite schließt.', 'error'); } }
}
function save() { rev++; if (!saveTimer) saveTimer = setTimeout(flushSave, 250); }
window.addEventListener('pagehide', () => { if (saveTimer) flushSave(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveTimer) flushSave(); });

function put(kind, obj) {
  obj._u = Date.now(); delete obj._d;
  S[kind][obj.id] = obj; S.dirty[`${kind}|${obj.id}`] = 1;
  save(); queuePush(); return obj;
}
function remove(kind, id) {
  const it = S[kind][id]; if (!it) return;
  it._d = true; it._u = Date.now(); S.dirty[`${kind}|${id}`] = 1; save(); queuePush();
}
function restore(kind, id) { const it = S[kind][id]; if (!it) return; delete it._d; it._u = Date.now(); S.dirty[`${kind}|${id}`] = 1; save(); queuePush(); }
const live = (kind) => Object.values(S[kind]).filter((x) => !x._d);
const get = (kind, id) => { const x = S[kind][id]; return x && !x._d ? x : null; };
const settings = () => Object.assign({ id: 'main', savingsTarget: 0, warnAt: 80 }, S.settings.main && !S.settings.main._d ? S.settings.main : {});
const setSettings = (patch) => put('settings', Object.assign({}, settings(), patch, { id: 'main' }));

/* ---------- Abgeleitete Daten (Kategorien, Budget) – wird bei jeder Änderung neu berechnet ---------- */
function allCats() {
  const out = Fin.CATEGORIES.map((c) => Object.assign({}, c, { builtin: true }, S.cat[c.id] && !S.cat[c.id]._d ? { budget: S.cat[c.id].budget } : {}));
  for (const c of live('cat')) if (c.custom) out.push(Object.assign({ icon: 'tag', kind: 'expense' }, c));
  return out;
}
const catById = (id) => (D.rev === rev && D.cmap && D.cmap.get(id)) || allCats().find((c) => c.id === id) || { id, name: 'Unbekannt', icon: 'dots', kind: 'expense' };
let D = { rev: -1 };
function derived() {
  if (D.rev === rev) return D;
  const cats = allCats(), ids = new Set(cats.map((c) => c.id)), rules = live('rule').filter((r) => ids.has(r.cat)).sort((a, b) => (b._u || 0) - (a._u || 0)), ownIbans = live('acct').map((a) => a.iban).filter(Boolean);
  const raw = live('tx'), out = [];
  for (const t of raw) {
    const res = t.manual && ids.has(t.manual) ? { cat: t.manual, label: '', by: 'manual' } : Fin.categorize(t, { userRules: rules, ownIbans });
    out.push(Object.assign({}, t, { cat: res.cat, label: res.label, by: res.by, rule: res.rule }));
  }
  const rec = Fin.detectRecurring(out), keys = new Set(rec.map((r) => r.key));
  const accts = live('acct'), hasCard = accts.some((a) => a.kind === 'kredit'), tagesIds = new Set(accts.filter((a) => a.kind === 'tages').map((a) => a.id));
  for (const t of out) {
    t.mkey = Fin.merchantKey(t); t.hay = Fin.haystack(t);
    if (t.by === 'none' && t.amount < 0 && keys.has(t.mkey)) { t.cat = 'abos'; t.by = 'recurring'; }
    t.title = t.customName || Fin.displayName(t, t);
    // Doppelt gezählt wäre: Kreditkarten-Abrechnung auf dem Giro, wenn die Kreditkarte selbst importiert ist; Tagesgeld zählt nie im Budget
    if ((hasCard && t.cat === 'kreditkarte') || tagesIds.has(t.acct)) t.autoIgnore = true;
  }
  out.sort((a, b) => (b.date.localeCompare(a.date)) || (a.id < b.id ? 1 : -1));
  // Vorschläge: erkannte Wiederkehrer, die noch nicht als Fixposten eingetragen sind
  const fixedNames = live('fixed').map((f) => Fin.fold(f.name));
  const fixedKeys = new Set(live('fixed').map((f) => f.key).filter(Boolean));
  const suggestions = rec.filter((r) => !fixedKeys.has(r.key)).filter((r) => !fixedNames.some((n) => n && (n.includes(Fin.fold(r.name)) || Fin.fold(r.name).includes(n)))).filter((r) => !(settings().dismissed || {})[r.key]);
  const used = new Set(), byDue = live('planned').sort((a, b) => a.due.localeCompare(b.due));
  const planned = byDue.map((p) => Object.assign({}, p, { matched: !p.done && !!Fin.matchPlanned(p, out, used) }));
  D = { rev, planned, cats, txs: out, recurring: rec, suggestions, cmap: Fin.catMap(cats), rules };
  return D;
}
let B = { key: '' };
function budget() {
  const d = derived(), t = todayKey(), key = `${rev}|${t}`;
  if (B.key === key) return B.v;
  const planned = d.planned, fixed = live('fixed');
  B = { key, v: Fin.budget({ txs: d.txs, cats: d.cats, fixed, planned, settings: settings(), today: t }) };
  return B.v;
}

/* ---------- Cloud-Abgleich (Supabase, Tabelle fin_items) ---------- */
const cloud = { user: null, state: 'idle', error: '', last: 0 };
let syncing = false, pushTimer = 0;
function queuePush() { if (!cloud.user) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => runSync(true), 4000); }
async function runSync(silent) {
  if (!sb || !cloud.user || syncing) return;
  syncing = true; cloud.state = 'busy'; cloud.error = '';
  if (!silent) renderIfSettings();
  try {
    const keys = Object.keys(S.dirty);
    for (let i = 0; i < keys.length; i += 300) {
      const chunk = keys.slice(i, i + 300), sent = {};
      const rows = chunk.map((k) => {
        const [kind, ...r] = k.split('|'), id = r.join('|'), it = S[kind] && S[kind][id];
        if (!it) { delete S.dirty[k]; return null; }
        sent[k] = it._u;
        const { _u, _d, ...data } = it;
        return { user_id: cloud.user.id, kind, id, data, updated: _u, deleted: !!_d };
      }).filter(Boolean);
      if (rows.length) {
        const { error } = await sb.from('fin_items').upsert(rows, { onConflict: 'user_id,kind,id' });
        if (error) throw error;
        for (const k of Object.keys(sent)) { const [kind, ...r] = k.split('|'); const it = S[kind][r.join('|')]; if (it && it._u === sent[k]) delete S.dirty[k]; }
      }
    }
    let from = Math.max(0, S.lastSeq - 200), guard = 0, changed = false;   // mit Überlappung lesen: Zeilen, die erst nach dem letzten Abruf committet wurden, gehen nicht verloren
    for (;;) {                                                // seitenweise nach der Server-Reihenfolge (seq), unabhängig von Geräte-Uhren
      const { data, error } = await sb.from('fin_items').select('seq,kind,id,data,updated,deleted').gt('seq', from).order('seq').limit(1000);
      if (error) throw error;
      for (const row of data) {
        if (row.seq > S.lastSeq) S.lastSeq = row.seq;
        if (!KINDS.includes(row.kind)) continue;
        const loc = S[row.kind][row.id];
        if (loc && loc._u >= row.updated) continue;
        S[row.kind][row.id] = Object.assign({}, row.data, { id: row.id, _u: row.updated }, row.deleted ? { _d: true } : {});
        delete S.dirty[`${row.kind}|${row.id}`]; changed = true;
      }
      if (data.length < 1000 || ++guard > 500) break;
      from = data[data.length - 1].seq;
    }
    cloud.state = 'ok'; cloud.last = Date.now(); save(); flushSave();
    if (changed) render();
  } catch (e) {
    cloud.state = 'error'; cloud.error = /fin_items/.test(e.message || '') ? 'Tabelle fehlt: bitte supabase/finanz.sql im SQL Editor ausführen.' : (e.message || 'Abgleich fehlgeschlagen');
    if (!silent) toast(cloud.error, 'error');
  } finally { syncing = false; renderIfSettings(); }
}
const renderIfSettings = () => { if (/^#\/einstellungen(\/konto)?$/.test(location.hash)) render(); };
/* Gehört der Speicher einem anderen Konto, wird er ersetzt: sonst würden fremde Daten in die falsche Cloud wandern */
function adoptUser(user) {
  cloud.user = user || null;
  if (!user) return;
  if (!S.owner) { S.owner = user.id; save(); return; }
  if (S.owner !== user.id) {
    if (Object.keys(S.dirty).length) exportJson();            // nicht hochgeladene Änderungen des alten Kontos gehen als Datei mit
    KINDS.forEach((k) => { S[k] = {}; }); S.dirty = {}; S.lastSeq = 0; S.owner = user.id; save(); flushSave();
    toast('Anderes Konto: lokale Daten wurden durch die Daten dieses Kontos ersetzt.'); render({ force: true });
  }
}

/* ---------- Rückmeldungen: Toast, Ansage, Blatt ---------- */
let toastTimer = 0, toastAction = null;
function toast(msg, type, action) {
  const t = $('#toast');
  toastAction = action || null; t.textContent = msg;
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.className = 'toast-btn'; b.dataset.toastAction = ''; b.textContent = action.label; t.append(b); }
  t.classList.toggle('error', type === 'error'); t.classList.toggle('has-action', !!action); t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(hideToast, action ? 6000 : (type === 'error' ? 5000 : 3500));
}
function hideToast() { $('#toast').classList.remove('show', 'has-action'); toastAction = null; }
$('#toast').addEventListener('click', (e) => { if (!e.target.closest('[data-toast-action]') || !toastAction) return; const a = toastAction; hideToast(); a.run(); });
function announce(msg) { const r = $('#sr-live'); r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30); }

const sheet = $('#sheet');
let sheetOpener = null;
function openSheet(html, opener) {
  sheetOpener = opener || document.activeElement;
  sheet.innerHTML = html; if (!sheet.open) sheet.showModal();
  const h2 = sheet.querySelector('h2'); if (h2) { h2.tabIndex = -1; h2.focus(); }
}
function closeSheet() { if (sheet.open) sheet.close(); }
sheet.addEventListener('close', () => { if (sheetOpener && document.contains(sheetOpener)) sheetOpener.focus?.({ preventScroll: true }); sheetOpener = null; });
sheet.addEventListener('click', (e) => { if (e.target === sheet) closeSheet(); });
/* Bestätigung: Blatt mit „Löschen" / „Abbrechen" (R8.1) */
function confirmSheet(title, text, label, run) {
  openSheet(`<div class="sheet-head"><h2 id="sheet-title">${esc(title)}</h2><button type="button" class="icon-btn" data-sheet-close aria-label="Schließen">${icon('x')}</button></div>
    <p class="sheet-text">${esc(text)}</p>
    <div class="sheet-actions"><button type="button" class="btn" data-sheet-close>Abbrechen</button><button type="button" class="btn danger armed" data-sheet-ok>${esc(label)}</button></div>`);
  sheet.querySelector('[data-sheet-ok]').addEventListener('click', () => { closeSheet(); run(); });
}
sheet.addEventListener('click', (e) => { if (e.target.closest('[data-sheet-close]')) closeSheet(); });

/* ---------- Seitenleiste „Meine Apps" ---------- */
const drawer = $('#drawer');
drawer.innerHTML = `<div class="drawer-head"><h2 id="drawer-title">Meine Apps</h2>
  <button type="button" class="icon-btn" data-drawer="close" aria-label="Menü schließen">${icon('x')}</button></div>
  <ul class="apps">
    <li><a class="app-item" href="${esc(HABITS_URL)}">${icon('today')}<span class="app-name">Habits</span></a></li>
    <li><button type="button" class="app-item" disabled>${icon('utensils')}<span class="app-name">Ernährung</span><span class="soon">Bald</span></button></li>
    <li><button type="button" class="app-item current" data-drawer="close" aria-current="true">${icon('wallet')}<span class="app-name">Finanzen</span></button></li>
  </ul>`;
$('#menu-btn').addEventListener('click', () => drawer.showModal());
drawer.addEventListener('click', (e) => { if (e.target === drawer || e.target.closest('[data-drawer="close"]')) drawer.close(); });
window.addEventListener('hashchange', () => { if (drawer.open) drawer.close(); });
drawer.addEventListener('close', () => $('#menu-btn').focus({ preventScroll: true }));

/* ---------- Navigation: Hash-Routen, Tab-Leiste ---------- */
const TABS = [
  { id: 'heute', label: 'Heute', icon: 'today', href: '#/heute' },
  { id: 'umsaetze', label: 'Umsätze', icon: 'list', href: '#/umsaetze' },
  { id: 'neu', label: 'Neu', icon: 'plus', href: '#/neu', main: true },
  { id: 'plan', label: 'Plan', icon: 'calendar', href: '#/plan' },
  { id: 'einstellungen', label: 'Einstellungen', icon: 'gear', href: '#/einstellungen' },
];
$('#tabbar').innerHTML = `<div class="tabbar-in"><span class="tab-indicator" aria-hidden="true"></span>${TABS.map((t) =>
  `<a href="${t.href}" data-tab="${t.id}" aria-label="${t.label}" title="${t.label}"${t.main ? ' class="tab-new"' : ''}><span class="ico">${t.main ? `<span class="plus">${icon('plus')}</span>` : icon(t.icon)}</span></a>`).join('')}</div>`;
let firstTab = true;
function placeIndicator() {
  const ind = $('.tab-indicator'), cur = $('.tabbar a[aria-current="page"]'); if (!ind || !cur) return;
  const bar = $('.tabbar-in').getBoundingClientRect(), r = cur.getBoundingClientRect(), w = 60, h = 40;
  ind.style.width = w + 'px'; ind.style.height = h + 'px';
  ind.style.transform = `translate(${Math.round(r.left - bar.left + (r.width - w) / 2)}px, ${Math.round(r.top - bar.top + (r.height - h) / 2)}px)`;
  if (firstTab) { ind.classList.add('instant'); requestAnimationFrame(() => requestAnimationFrame(() => ind.classList.remove('instant'))); firstTab = false; }
}
window.addEventListener('resize', placeIndicator);

function parseRoute() {
  const h = (location.hash || '#/heute').replace(/^#\/?/, '').split('?')[0];
  const p = h.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: p[0] || 'heute', a: p[1] || '', b: p[2] || '', path: p };
}
const tabOf = (r) => ({ heute: 'heute', umsaetze: 'umsaetze', tx: 'umsaetze', kategorie: 'umsaetze', neu: r.b ? (['geplant', 'fix', 'ziel', 'einzahlung'].includes(r.a) ? 'plan' : 'einstellungen') : 'neu', zuordnen: 'heute', plan: 'plan', einstellungen: 'einstellungen' }[r.name] || 'heute');
let lastRouteKey = '', draft = null;
function render(opts = {}) {
  const r = parseRoute(), key = location.hash;
  if (!opts.force && key === lastRouteKey && $('#view form') && !$('#view [data-live]')) return;   // offenes Formular nie neu zeichnen (R9.5)
  const fn = VIEWS[r.name] || VIEWS.heute;
  const view = $('#view');
  const html = fn(r) || '';
  const scrollY = window.scrollY, active = document.activeElement, fid = active && active.dataset ? active.dataset.fid : '';
  view.innerHTML = html;
  const tab = tabOf(r);
  $$('.tabbar a').forEach((a) => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
  placeIndicator();
  const isNav = key !== lastRouteKey;
  if (isNav) {
    view.classList.remove('view-in'); void view.offsetWidth; view.classList.add('view-in');
    window.scrollTo(0, 0); view.focus({ preventScroll: true });
    document.title = (view.querySelector('h1') ? view.querySelector('h1').textContent + ' · ' : '') + 'Finanzen';
    const f = view.querySelector('[data-autofocus]'); if (f) f.focus({ preventScroll: true });
  } else {
    window.scrollTo(0, scrollY);
    if (fid) { const el = view.querySelector(`[data-fid="${fid}"]`); if (el) el.focus({ preventScroll: true }); }
  }
  lastRouteKey = key;
  if (VIEW_AFTER[r.name]) VIEW_AFTER[r.name](r, view);
  replayPress();
  if (typeof updateRefresh === 'function') updateRefresh();
}
const VIEWS = {}, VIEW_AFTER = {};
window.addEventListener('hashchange', () => { draft = null; render(); });
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };

/* ---------- Drück-Animation für jeden Knopf (R2.10) ---------- */
const PRESS = 'button, a[href], summary, .switch-row';
const noMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
let press = null, lastPress = null;
function pressTarget(t) { const el = t && t.closest && t.closest(PRESS); if (!el || el.disabled || el.getAttribute('aria-disabled') === 'true') return null; return el; }
function pressSelector(el) {
  if (el.dataset.fid) return `[data-fid="${el.dataset.fid}"]`;
  if (el.dataset.act) return `[data-act="${el.dataset.act}"]` + ['id', 'k'].map((k) => (el.dataset[k] ? `[data-${k}="${CSS.escape(el.dataset[k])}"]` : '')).join('');
  if (el.getAttribute('href')) return `[href="${CSS.escape(el.getAttribute('href'))}"]`;
  return null;
}
function playRelease(el) {
  el.classList.remove('pressing', 'release'); void el.offsetWidth; el.classList.add('release');
  el.addEventListener('animationend', function done(e) { if (e.target !== el) return; el.classList.remove('release'); el.removeEventListener('animationend', done); });
}
function replayPress() {
  if (!lastPress || Date.now() - lastPress.t > 400) return;
  const sel = lastPress.sel; lastPress = null;
  let el = null; try { el = sel && document.querySelector(sel); } catch (e) { /* ungültiger Selektor */ }
  if (el && !el.classList.contains('release')) playRelease(el);
}
function clearPress() { if (press) { press.el.classList.remove('pressing'); press = null; } }
document.addEventListener('pointerdown', (e) => {
  if (noMotion() || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const el = pressTarget(e.target); if (!el) return;
  clearPress(); el.classList.remove('release'); el.classList.add('pressing'); press = { el, x: e.clientX, y: e.clientY, pid: e.pointerId };
}, { passive: true });
document.addEventListener('pointermove', (e) => { if (press && e.pointerId === press.pid && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) clearPress(); }, { passive: true });
function endPress(e, cancelled) {
  if (!press || e.pointerId !== press.pid) return;
  const p = press; press = null; p.el.classList.remove('pressing');
  if (cancelled) return;
  playRelease(p.el); lastPress = { sel: pressSelector(p.el), t: Date.now() };
}
document.addEventListener('pointerup', (e) => endPress(e, false), { passive: true });
document.addEventListener('pointercancel', (e) => endPress(e, true), { passive: true });
document.addEventListener('click', (e) => { if (e.detail !== 0 || noMotion()) return; const el = pressTarget(e.target); if (el) { playRelease(el); lastPress = { sel: pressSelector(el), t: Date.now() }; } }, true);
