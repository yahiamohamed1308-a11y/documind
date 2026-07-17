-- Safe to run this ENTIRE script as many times as you want — it will never
-- throw "already exists" errors again. Just select everything and click Run.

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  file_path text not null,
  public_url text not null,
  uploaded_by text,
  extracted_text text,
  doc_type text,
  created_at timestamp with time zone default now()
);

-- Add realtime only if not already added
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table documents;
  end if;
end $$;

alter table documents enable row level security;

drop policy if exists "Allow public read" on documents;
create policy "Allow public read" on documents
  for select using (true);

drop policy if exists "Allow public insert" on documents;
create policy "Allow public insert" on documents
  for insert with check (true);

-- Activity feed
create table if not exists activity_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null,
  action_type text not null,
  description text not null,
  created_at timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'activity_log'
  ) then
    alter publication supabase_realtime add table activity_log;
  end if;
end $$;

alter table activity_log enable row level security;

drop policy if exists "Allow public read activity" on activity_log;
create policy "Allow public read activity" on activity_log
  for select using (true);

drop policy if exists "Allow public insert activity" on activity_log;
create policy "Allow public insert activity" on activity_log
  for insert with check (true);

-- Presence
create table if not exists presence (
  user_name text primary key,
  last_seen timestamp with time zone default now()
);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'presence'
  ) then
    alter publication supabase_realtime add table presence;
  end if;
end $$;

alter table presence enable row level security;

drop policy if exists "Allow public read presence" on presence;
create policy "Allow public read presence" on presence
  for select using (true);

drop policy if exists "Allow public upsert presence" on presence;
create policy "Allow public upsert presence" on presence
  for insert with check (true);

drop policy if exists "Allow public update presence" on presence;
create policy "Allow public update presence" on presence
  for update using (true);

-- Extra columns for Health Score / Alerts features
alter table documents add column if not exists expiry_date date;
alter table documents add column if not exists category text;
