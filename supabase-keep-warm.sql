-- Optional: run in the Supabase SQL Editor as postgres.
-- Supabase, not the laptop or sleeping Render instance, sends these requests.
-- This reduces idle cold starts; it cannot prevent Render restarts or quota limits.
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- A stable job name makes rerunning this script update the existing schedule.
SELECT cron.schedule(
  'gbo-render-keep-warm',
  '*/10 * * * *',
  $job$
    SELECT net.http_get(
      url := 'https://gbo-25.onrender.com/health',
      timeout_milliseconds := 60000
    );
  $job$
);

-- Wake it immediately and record the request ID for verification.
SELECT net.http_get(
  url := 'https://gbo-25.onrender.com/health',
  timeout_milliseconds := 60000
) AS initial_request_id;

-- To disable later:
-- SELECT cron.unschedule('gbo-render-keep-warm');
