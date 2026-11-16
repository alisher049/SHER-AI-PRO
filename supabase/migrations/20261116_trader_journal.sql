-- SHER AI PRO: persistent, user-owned AI Trader journal
create table if not exists public.sher_trader_trades (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 market text not null,
 timeframe text not null,
 direction text not null check(direction in ('BUY','SELL')),
 entry numeric not null,
 stop_loss numeric not null,
 target numeric not null,
 signal_time bigint not null,
 confidence numeric,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','WIN','LOSS','EXPIRED')),
 r_multiple numeric,
 exit_price numeric,
 feed_source text,
 last_checked_at timestamptz,
 created_at timestamptz not null default now(),
 closed_at timestamptz
);
create index if not exists sher_trader_trades_user_created on public.sher_trader_trades(user_id,created_at desc);
create index if not exists sher_trader_trades_active on public.sher_trader_trades(status) where status='ACTIVE';
alter table public.sher_trader_trades enable row level security;
drop policy if exists "Users read own trader journal" on public.sher_trader_trades;
create policy "Users read own trader journal" on public.sher_trader_trades for select to authenticated using (auth.uid()=user_id);
drop policy if exists "Users insert own trader journal" on public.sher_trader_trades;
create policy "Users insert own trader journal" on public.sher_trader_trades for insert to authenticated with check (auth.uid()=user_id);
-- Only service_role (the cron API) can update trade outcomes. Never expose that key in the app.
