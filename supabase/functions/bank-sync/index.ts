// Bank-Anbindung über Enable Banking (PSD2, eingeschränkter Produktionsmodus für eigene Konten).
// Läuft als Supabase Edge Function. Der private Schlüssel der Anwendung liegt nur als Secret hier, nie im Browser.
//
// Aufrufe aus der App (POST, JSON, mit Supabase-Login):
//   {action:'status'}                 -> Verbindungen des Nutzers
//   {action:'banks', query:'volksb'}  -> passende Banken (Deutschland)
//   {action:'start', bank:'<Name>'}   -> {url} zur Freigabe bei der Bank
//   {action:'sync', full?:boolean}    -> neue Umsätze und Kontostand holen und in fin_items schreiben
// Rücksprung der Bank: GET ?code=…&state=…  (ohne Login, deshalb prüft die Funktion den state selbst)
//
// Secrets: BANK_PROVIDER_APP_ID, BANK_PROVIDER_PRIVATE_KEY (PKCS#8-PEM), BANK_REDIRECT_URL (Adresse dieser Funktion), APP_URL (optional)
// Deploy:  supabase functions deploy bank-sync --no-verify-jwt --project-ref <ref>

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const API = 'https://api.enablebanking.com';
const APP_URL = Deno.env.get('APP_URL') || 'https://thilorichtberg.github.io/finanz-app/';
const ORIGINS = ['https://thilorichtberg.github.io', 'http://localhost:8080', 'http://127.0.0.1:8080'];
const cors = (req: Request) => ({
  'access-control-allow-origin': ORIGINS.includes(req.headers.get('origin') || '') ? req.headers.get('origin')! : ORIGINS[0],
  'access-control-allow-headers': 'authorization, content-type, apikey, x-client-info',
  'access-control-allow-methods': 'POST, GET, OPTIONS', vary: 'origin',
});
const json = (req: Request, body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'content-type': 'application/json' } });

/* ---------- JWT (RS256) für den Anbieter ---------- */
const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === 'string' ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ''; bytes.forEach((c) => { s += String.fromCharCode(c); });
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
let keyCache: CryptoKey | null = null;
async function signingKey() {
  if (keyCache) return keyCache;
  const pem = (Deno.env.get('BANK_PROVIDER_PRIVATE_KEY') || '').replace(/\\n/g, '\n');
  if (pem.includes('BEGIN RSA PRIVATE KEY')) throw new Error('Schlüssel liegt im PKCS#1-Format. Umwandeln: openssl pkcs8 -topk8 -nocrypt -in key.pem -out key-pkcs8.pem');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '')), (c) => c.charCodeAt(0));
  keyCache = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return keyCache;
}
async function bankJwt() {
  const iat = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ typ: 'JWT', alg: 'RS256', kid: Deno.env.get('BANK_PROVIDER_APP_ID') }));
  const body = b64url(JSON.stringify({ iss: 'enablebanking.com', aud: 'api.enablebanking.com', iat, exp: iat + 3600 }));
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await signingKey(), new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(sig)}`;
}
async function eb(method: string, path: string, body?: unknown) {
  const res = await fetch(API + path, { method, headers: { authorization: `Bearer ${await bankJwt()}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text(); let data: any = {}; try { data = JSON.parse(text); } catch { /* leer */ }
  if (!res.ok) throw new Error(`Bank-Anbieter ${res.status}: ${data.message || data.error || text.slice(0, 200)}`);
  return data;
}

/* ---------- Hilfen, gleiche Logik wie core.js (Umsatz- und Konto-IDs) ---------- */
const hash = (str: string) => {   // cyrb53, identisch zu Fin.hash
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
};
const acctId = (iban: string, uid: string) => 'acc_' + hash(iban ? iban.replace(/\s/g, '') : uid);
const day = (d: Date) => d.toISOString().slice(0, 10);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors(req) });
  const configured = ['BANK_PROVIDER_APP_ID', 'BANK_PROVIDER_PRIVATE_KEY', 'BANK_REDIRECT_URL'].every((k) => Deno.env.get(k));
  if (!configured) return json(req, { ok: false, error: 'not_configured', message: 'Bank-Anbindung ist noch nicht eingerichtet.' }, 501);
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const url = new URL(req.url);

  try {
    /* ---- Rücksprung der Bank (Browser, ohne Login) ---- */
    if (req.method === 'GET' && (url.searchParams.get('code') || url.searchParams.get('error'))) {
      const state = url.searchParams.get('state') || '', code = url.searchParams.get('code');
      const { data: link } = await db.from('fin_bank_links').select('*').eq('state', state).eq('status', 'pending').maybeSingle();
      const back = (ok: boolean, msg = '') => Response.redirect(`${APP_URL}#/einstellungen/bank?bank=${ok ? 'ok' : 'fehler'}${msg ? '&msg=' + encodeURIComponent(msg) : ''}`, 302);
      if (!link) return back(false, 'Verbindung unbekannt oder schon benutzt');
      if (!code) { await db.from('fin_bank_links').update({ status: 'error', state: null, error: url.searchParams.get('error_description') || 'abgebrochen' }).eq('id', link.id); return back(false, 'Freigabe abgebrochen'); }
      const session = await eb('POST', '/sessions', { code });
      const accounts = (session.accounts || []).map((a: any) => ({ uid: a.uid, iban: a.account_id?.iban || '', name: a.name || a.product || '' }));
      const validUntil = session.access?.valid_until || null;
      const upd = await db.from('fin_bank_links').update({ status: 'active', state: null, session_id: session.session_id, accounts, valid_until: validUntil, error: null }).eq('id', link.id);
      if (upd.error) return back(false, 'Speichern fehlgeschlagen');
      return back(true);
    }

    /* ---- Aufrufe der App (mit Supabase-Login) ---- */
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
    const { data: u } = await db.auth.getUser(jwt);
    if (!u?.user) return json(req, { ok: false, error: 'unauthorized' }, 401);
    const userId = u.user.id;
    const input = req.method === 'POST' ? await req.json().catch(() => ({})) : {};

    if (input.action === 'status') {
      const { data } = await db.from('fin_bank_links').select('id,institution,status,valid_until,last_sync,error,accounts').eq('user_id', userId).order('created_at');
      return json(req, { ok: true, links: (data || []).map((l) => ({ ...l, accounts: (l.accounts || []).length })) });
    }
    if (input.action === 'banks') {
      const q = String(input.query || '').toLowerCase().trim();
      const list = (await eb('GET', '/aspsps?country=DE')).aspsps || [];
      return json(req, { ok: true, banks: list.filter((b: any) => !q || String(b.name).toLowerCase().includes(q)).slice(0, 12).map((b: any) => ({ name: b.name, country: b.country })) });
    }
    if (input.action === 'start') {
      const bank = String(input.bank || '');
      const list = (await eb('GET', '/aspsps?country=DE')).aspsps || [];
      const aspsp = list.find((b: any) => b.name === bank);
      if (!aspsp) return json(req, { ok: false, error: 'unknown_bank', message: 'Diese Bank kenne ich nicht.' }, 400);
      const maxSec = Math.min(aspsp.maximum_consent_validity || 90 * 86400, 180 * 86400);
      const state = crypto.randomUUID();
      const auth = await eb('POST', '/auth', { access: { valid_until: new Date(Date.now() + (maxSec - 3600) * 1000).toISOString() }, aspsp: { name: aspsp.name, country: aspsp.country }, state, redirect_url: Deno.env.get('BANK_REDIRECT_URL'), psu_type: 'personal' });
      const ins = await db.from('fin_bank_links').insert({ user_id: userId, institution: aspsp.name, country: aspsp.country, state });
      if (ins.error) throw new Error('Verbindung konnte nicht gespeichert werden: ' + ins.error.message);
      return json(req, { ok: true, url: auth.url });
    }
    if (input.action === 'sync') {
      const { data: links } = await db.from('fin_bank_links').select('*').eq('user_id', userId).eq('status', 'active');
      let added = 0; const problems: string[] = [];
      for (const link of links || []) {
        if (link.valid_until && new Date(link.valid_until) < new Date()) { await db.from('fin_bank_links').update({ status: 'expired' }).eq('id', link.id); problems.push(`${link.institution}: Zugriff abgelaufen, bitte neu verbinden`); continue; }
        const from = day(new Date(link.last_sync && !input.full ? new Date(link.last_sync).getTime() - 10 * 864e5 : Date.now() - (input.full ? 365 : 90) * 864e5));
        // Schon vorhandene Umsätze (zum Beispiel aus dem CSV-Import) nicht doppelt anlegen: gleiche Konto/Datum/Betrag-Kombination zählt als vorhanden
        const { data: have } = await db.from('fin_items').select('id,data').eq('user_id', userId).eq('kind', 'tx').gte('data->>date', from);
        const seen = new Map<string, number>(); for (const h of have || []) { const k = `${h.data.acct}|${h.data.date}|${Number(h.data.amount).toFixed(2)}`; seen.set(k, (seen.get(k) || 0) + 1); }
        for (const acc of link.accounts || []) {
          const aid = acctId(acc.iban, acc.uid), rows: any[] = []; let key: string | undefined; let guard = 0;
          do {
            const page = await eb('GET', `/accounts/${acc.uid}/transactions?date_from=${from}&transaction_status=BOOK${key ? '&continuation_key=' + encodeURIComponent(key) : ''}`);
            for (const t of page.transactions || []) {
              const debit = t.credit_debit_indicator === 'DBIT', amount = (debit ? -1 : 1) * Number(t.transaction_amount?.amount || 0);
              const date = t.booking_date || t.value_date || t.transaction_date; if (!date || !amount) continue;
              const k = `${aid}|${date}|${amount.toFixed(2)}`; if ((seen.get(k) || 0) > 0) { seen.set(k, seen.get(k)! - 1); continue; }
              const other = debit ? t.creditor : t.debtor, otherAcc = debit ? t.creditor_account : t.debtor_account;
              const ref = t.entry_reference || t.transaction_id || hash(`${date}|${amount}|${(t.remittance_information || []).join(' ')}`);
              rows.push({ user_id: userId, kind: 'tx', id: 'bk_' + hash(`${aid}|${ref}`), updated: Date.now(), deleted: false,
                data: { id: 'bk_' + hash(`${aid}|${ref}`), acct: aid, date, amount, name: other?.name || '', purpose: (t.remittance_information || []).join(' '), type: t.bank_transaction_code?.description || '', iban: otherAcc?.iban || '', src: 'bank' } });
            }
            key = page.continuation_key || undefined;
          } while (key && ++guard < 40);
          if (rows.length) { const { error } = await db.from('fin_items').upsert(rows, { onConflict: 'user_id,kind,id', ignoreDuplicates: true }); if (error) throw error; added += rows.length; }
          // Kontostand
          try {
            const bal = (await eb('GET', `/accounts/${acc.uid}/balances`)).balances || [];
            const b = bal.find((x: any) => ['CLBD', 'ITBD', 'XPCD'].includes(x.balance_type)) || bal[0];
            if (b) {
              const { data: ex } = await db.from('fin_items').select('data').eq('user_id', userId).eq('kind', 'acct').eq('id', aid).maybeSingle();
              const data = { ...(ex?.data || { id: aid, name: acc.name || link.institution, iban: acc.iban, bank: link.institution, kind: 'giro' }), balance: Number(b.balance_amount?.amount), balanceDate: day(new Date()) };
              await db.from('fin_items').upsert({ user_id: userId, kind: 'acct', id: aid, data, updated: Date.now(), deleted: false }, { onConflict: 'user_id,kind,id' });
            }
          } catch (e) { problems.push(`${link.institution}: Kontostand nicht abrufbar`); }
        }
        await db.from('fin_bank_links').update({ last_sync: new Date().toISOString(), error: null }).eq('id', link.id);
      }
      return json(req, { ok: true, added, problems });
    }
    return json(req, { ok: false, error: 'unknown_action' }, 400);
  } catch (e) {
    return json(req, { ok: false, error: 'failed', message: String((e as Error).message || e) }, 502);
  }
});
