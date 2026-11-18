-- Täglicher Bank-Abruf (05:00 UTC, in Deutschland 06:00 bzw. 07:00 Uhr), auch wenn die App zu ist.
-- PSD2 erlaubt automatische Abrufe nur 4-mal pro Tag und Bank; wir machen 1.
-- Das Geheimwort NICHT in diese Datei schreiben: es steht als Secret FIN_CRON_SECRET in Supabase und beim Ausführen hier.
-- Voraussetzung: Erweiterungen pg_cron und pg_net sind aktiv (bei Habits schon der Fall).
select cron.unschedule('fin-bank-sync') where exists (select 1 from cron.job where jobname = 'fin-bank-sync');
select cron.schedule('fin-bank-sync', '0 5 * * *', $$
  select net.http_post(
    url := 'https://syzrpidpcgkmpjowpcfp.supabase.co/functions/v1/bank-sync',
    headers := jsonb_build_object('content-type', 'application/json', 'x-cron-secret', 'HIER_GEHEIMWORT'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000);
$$);
