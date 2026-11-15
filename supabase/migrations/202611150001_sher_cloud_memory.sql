-- SHER AI PRO cloud chat history and personal AI memory.
-- Run once in Supabase SQL Editor. Uses the existing Supabase Auth identity.
create table if not exists public.sher_chat_history (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'Chat',
  messages jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index if not exists sher_chat_history_user_updated_idx
  on public.sher_chat_history(user_id, updated_at desc);
alter table public.sher_chat_history enable row level security;
drop policy if exists "Users can read own SHER chat history" on public.sher_chat_history;
create policy "Users can read own SHER chat history" on public.sher_chat_history
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own SHER chat history" on public.sher_chat_history;
create policy "Users can insert own SHER chat history" on public.sher_chat_history
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own SHER chat history" on public.sher_chat_history;
create policy "Users can update own SHER chat history" on public.sher_chat_history
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "Users can delete own SHER chat history" on public.sher_chat_history;
create policy "Users can delete own SHER chat history" on public.sher_chat_history
  for delete to authenticated using (auth.uid() = user_id);

create table if not exists public.sher_ai_memory (
  user_id uuid primary key references auth.users(id) on delete cascade,
  content text not null default '',
  updated_at timestamptz not null default now()
);
alter table public.sher_ai_memory enable row level security;
drop policy if exists "Users can read own SHER AI memory" on public.sher_ai_memory;
create policy "Users can read own SHER AI memory" on public.sher_ai_memory
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists "Users can insert own SHER AI memory" on public.sher_ai_memory;
create policy "Users can insert own SHER AI memory" on public.sher_ai_memory
  for insert to authenticated with check (auth.uid() = user_id);
drop policy if exists "Users can update own SHER AI memory" on public.sher_ai_memory;
create policy "Users can update own SHER AI memory" on public.sher_ai_memory
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
