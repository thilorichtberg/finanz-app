-- Finanzen: eine Tabelle für alle Einträge (Umsätze, Konten, Kategorien, Regeln, Fixposten, geplante Zahlungen, Sparziele, Einstellungen).
-- Gleiches Muster wie Habits: local-first, pro Eintrag gewinnt die jüngere Änderung (updated), Löschen wird nur markiert (deleted).
-- Im SQL Editor ausführen. Voraussetzung: Option „Automatically expose new tables“ ist aus, die Rechte vergeben wir hier ausdrücklich.

create table if not exists public.fin_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind    text not null check (kind in ('tx', 'acct', 'cat', 'rule', 'fixed', 'planned', 'goal', 'settings')),
  id      text not null,
  data    jsonb not null default '{}'::jsonb,
  updated bigint not null,
  deleted boolean not null default false,
  seq     bigint not null default 0,          -- Reihenfolge auf dem Server: Cursor für das Nachladen, unabhängig von Geräte-Uhren
  primary key (user_id, kind, id)
);

create sequence if not exists public.fin_items_seq;
create or replace function public.fin_items_set_seq() returns trigger language plpgsql security definer set search_path = public as $$
begin new.seq := nextval('public.fin_items_seq'); return new; end $$;
drop trigger if exists fin_items_seq_trg on public.fin_items;
create trigger fin_items_seq_trg before insert or update on public.fin_items for each row execute function public.fin_items_set_seq();

-- Zeilen, die vor dieser Migration existierten, bekommen jetzt ihre Reihenfolge (sonst würden neue Geräte sie nie laden)
update public.fin_items set seq = nextval('public.fin_items_seq') where seq = 0;

create index if not exists fin_items_user_seq on public.fin_items (user_id, seq);

alter table public.fin_items enable row level security;

revoke all on public.fin_items from anon;
grant usage on sequence public.fin_items_seq to authenticated;
grant select, insert, update, delete on public.fin_items to authenticated;

drop policy if exists fin_items_select on public.fin_items;
drop policy if exists fin_items_insert on public.fin_items;
drop policy if exists fin_items_update on public.fin_items;
drop policy if exists fin_items_delete on public.fin_items;

create policy fin_items_select on public.fin_items for select to authenticated using (user_id = (select auth.uid()));
create policy fin_items_insert on public.fin_items for insert to authenticated with check (user_id = (select auth.uid()));
create policy fin_items_update on public.fin_items for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy fin_items_delete on public.fin_items for delete to authenticated using (user_id = (select auth.uid()));
