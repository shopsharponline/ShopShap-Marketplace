CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

DELETE FROM public.messages
WHERE created_at < now() - interval '90 days';

SELECT cron.unschedule(jobid)
FROM cron.job
WHERE jobname = 'shopsharp-delete-chat-messages-90-days';

SELECT cron.schedule(
  'shopsharp-delete-chat-messages-90-days',
  '0 3 * * *',
  $job$
    DELETE FROM public.messages
    WHERE created_at < now() - interval '90 days';
  $job$
);
