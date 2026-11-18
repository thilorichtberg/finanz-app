-- Bank-Anbindung (Schablone, noch nicht aktiv): Verbindungen und Abrufstatus.
-- Diese Tabelle liest und schreibt nur die Edge Function (service_role). Aus dem Browser ist sie gesperrt,
-- damit Zugriffs-Token der Bank nie im Client landen.

create table if not exists public.fin_bank_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null,                 -- zum Beispiel 'enablebanking'
  institution text not null,                 -- Name der Bank
  session_ref text,                          -- Sitzungs-/Zugriffskennung des Anbieters (nur serverseitig)
  valid_until timestamptz,                   -- PSD2: Zugriff läuft meist nach 90 Tagen ab und muss erneuert werden
  last_sync   timestamptz,
  status      text not null default 'pending' check (status in ('pending', 'active', 'expired', 'error')),
  created_at  timestamptz not null default now()
);

alter table public.fin_bank_links enable row level security;
revoke all on public.fin_bank_links from anon, authenticated;
-- bewusst keine Policy und kein grant: nur service_role (Edge Function) kommt heran.
