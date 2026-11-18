// Schablone: Bank-Anbindung über einen PSD2-Anbieter (Vorschlag: Enable Banking, für Privatnutzung gedacht).
// STATUS: nicht aktiv. Ohne gesetzte Secrets antwortet die Funktion mit 501 und der Knopf in der App bleibt gesperrt.
//
// Geplanter Ablauf (Details beim Einbau gegen die aktuelle Dokumentation des Anbieters prüfen):
//   1. Browser ruft  POST /bank-sync {action:'start', bank}  mit dem Supabase-Login (JWT) auf.
//   2. Funktion legt über den Anbieter eine Autorisierung an und liefert die URL der Bank zurück.
//   3. Nutzer bestätigt bei seiner Bank und landet auf  GET /bank-sync?action=callback&code=…  (Funktion speichert die Sitzung in fin_bank_links).
//   4. Täglicher Abruf (pg_cron wie bei Habits) oder  POST {action:'sync'}: Funktion holt neue Buchungen und schreibt sie als
//      kind='tx' in fin_items. Die ID wird genauso gebildet wie beim CSV-Import (siehe core.js, Fin.importCsv), damit nichts doppelt entsteht.
//
// Secrets (nur in Supabase, nie im Repository oder im Browser):
//   BANK_PROVIDER_APP_ID       App-ID beim Anbieter
//   BANK_PROVIDER_PRIVATE_KEY  privater Schlüssel (PEM) zum Signieren der Anbieter-Anfragen
//   BANK_REDIRECT_URL          Adresse dieser Funktion für den Rücksprung
//   CRON_SECRET                Geheimwort für den täglichen Abruf
//
// Deploy:  supabase functions deploy bank-sync   (mit JWT-Prüfung für start/sync; der Callback kommt ohne JWT, deshalb dort das state-Feld prüfen)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'authorization, content-type, apikey', 'access-control-allow-methods': 'POST, GET, OPTIONS' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
  const configured = ['BANK_PROVIDER_APP_ID', 'BANK_PROVIDER_PRIVATE_KEY', 'BANK_REDIRECT_URL'].every((k) => Deno.env.get(k));
  if (!configured) return json({ ok: false, error: 'not_configured', message: 'Bank-Anbindung ist noch nicht eingerichtet.' }, 501);

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const jwt = (req.headers.get('authorization') || '').replace(/^Bearer /, '');
  const { data: userData } = await supabase.auth.getUser(jwt);
  if (!userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);

  // TODO(Bank-Anbieter): start, callback und sync gegen die aktuelle API des gewählten Anbieters umsetzen.
  return json({ ok: false, error: 'not_implemented' }, 501);
});
