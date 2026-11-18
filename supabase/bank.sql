-- Bank-Anbindung (Enable Banking): Verbindungen und Abrufstatus.
-- Diese Tabelle liest und schreibt nur die Edge Function (service_role). Aus dem Browser ist sie gesperrt,
-- damit Sitzungen der Bank nie im Client landen.

create table if not exists public.fin_bank_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  provider    text not null default 'enablebanking',
  institution text not null,                 -- Name der Bank (ASPSP)
  country     text not null default 'DE',
  state       text unique,                   -- zufälliger Wert für den Rücksprung der Bank, gilt nur einmal
  session_id  text,                          -- Sitzung beim Anbieter (nur serverseitig)
  accounts    jsonb not null default '[]'::jsonb,  -- [{uid, iban, name}]
  valid_until timestamptz,                   -- PSD2: Zugriff läuft ab und muss neu bestätigt werden
  last_sync   timestamptz,
  status      text not null default 'pending' check (status in ('pending', 'active', 'expired', 'error')),
  error       text,
  created_at  timestamptz not null default now()
);

create index if not exists fin_bank_links_user on public.fin_bank_links (user_id);

alter table public.fin_bank_links enable row level security;
revoke all on public.fin_bank_links from anon, authenticated;
-- bewusst keine Policy und kein grant: nur service_role (Edge Function) kommt heran.
