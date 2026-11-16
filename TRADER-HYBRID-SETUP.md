# Free Hybrid AI Trader setup
1. Run supabase/migrations/20261116_trader_journal.sql in the Supabase SQL editor.
2. Add Vercel environment variables: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (server only), CRON_SECRET (long random secret), APP_BASE_URL=https://sher-ai-pro.vercel.app.
3. Configure a free external cron (for example cron-job.org) to POST https://sher-ai-pro.vercel.app/api/trader-engine every 5 minutes with header Authorization: Bearer <CRON_SECRET>.
4. The cron only evaluates persisted active signals against closed public-feed candles. It does not place broker orders. If cron is not configured or feed fails, the UI must show the last checked timestamp / stale status, not claim always-live monitoring.
5. XAUUSD uses Yahoo XAUUSD reference or GC=F gold futures proxy; crypto symbols use public spot feeds. These are indicative and may differ from broker execution.
