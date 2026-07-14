-- Advance — initial schema (spec §4)
-- Excerpts + ExcerptKnowledge are canonical/shared; everything else is per-user with RLS.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type user_level as enum ('student', 'emerging', 'professional');

create type audition_status as enum (
  'applied', 'prescreen', 'invited', 'prelims', 'semis', 'finals', 'result'
);

create type audition_result as enum (
  'advanced', 'not_advanced', 'won', 'runner_up', 'withdrew', 'cancelled'
);

create type audition_round as enum ('prescreen', 'prelim', 'semi', 'final');

create type readiness as enum (
  'not_started', 'learning', 'under_tempo', 'performance_ready'
);

create type plan_status as enum ('active', 'superseded');

create type session_status as enum ('planned', 'completed', 'partial', 'skipped');

-- ---------------------------------------------------------------------------
-- Profiles (extends auth.users)
-- ---------------------------------------------------------------------------

create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  instrument  text not null default 'harp',
  level       user_level not null default 'professional',
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Canonical excerpt library (shared, read-only for users)
-- ---------------------------------------------------------------------------

create table excerpts (
  id                    uuid primary key default gen_random_uuid(),
  composer              text not null,
  work                  text not null,
  movement              text,
  section_label         text,
  instrument            text not null default 'harp',
  difficulty            smallint not null check (difficulty between 1 and 5),
  typical_prep_weeks    smallint not null,
  reference_tempo_range int4range,          -- bpm, e.g. '[58,66]'
  aliases               text[] not null default '{}',
  slug                  text not null unique
);

create index excerpts_instrument_idx on excerpts (instrument);

-- Curated RAG corpus — the moat (spec §5.4)
create table excerpt_knowledge (
  id                     uuid primary key default gen_random_uuid(),
  excerpt_id             uuid not null references excerpts (id) on delete cascade,
  technical_traps        text[] not null default '{}',
  practice_strategies    text[] not null default '{}',
  committee_expectations text,
  common_failure_modes   text[] not null default '{}',
  source_attribution     text
);

create index excerpt_knowledge_excerpt_idx on excerpt_knowledge (excerpt_id);

-- ---------------------------------------------------------------------------
-- Auditions (the pipeline)
-- ---------------------------------------------------------------------------

create table auditions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null references profiles (id) on delete cascade,
  name                 text not null,
  ensemble             text,
  audition_date        date,
  application_deadline date,
  prescreen_deadline   date,
  round_structure      audition_round[] not null default '{}',
  fee                  numeric(8, 2),
  travel_notes         text,
  status               audition_status not null default 'applied',
  result               audition_result,
  notes                text,
  created_at           timestamptz not null default now()
);

create index auditions_user_idx on auditions (user_id);

-- Join: an excerpt as required by a specific audition
create table rep_list_items (
  id          uuid primary key default gen_random_uuid(),
  audition_id uuid not null references auditions (id) on delete cascade,
  excerpt_id  uuid references excerpts (id),   -- null until canonicalized/confirmed
  round       audition_round not null default 'prelim',
  required    boolean not null default true,
  raw_text    text not null                     -- what the user originally typed/pasted
);

create index rep_list_items_audition_idx on rep_list_items (audition_id);

-- ---------------------------------------------------------------------------
-- Excerpt portfolio (user's persistent cards)
-- ---------------------------------------------------------------------------

create table excerpt_cards (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  excerpt_id    uuid not null references excerpts (id),
  readiness     readiness not null default 'not_started',
  current_tempo smallint,
  target_tempo  smallint,
  notes         text,
  updated_at    timestamptz not null default now(),
  unique (user_id, excerpt_id)
);

create index excerpt_cards_user_idx on excerpt_cards (user_id);

-- ---------------------------------------------------------------------------
-- Recordings
-- ---------------------------------------------------------------------------

create table mock_sessions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references profiles (id) on delete cascade,
  audition_id uuid references auditions (id) on delete set null,
  created_at timestamptz not null default now()
);

create table recordings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references profiles (id) on delete cascade,
  excerpt_card_id uuid references excerpt_cards (id) on delete set null,
  mock_session_id uuid references mock_sessions (id) on delete set null,
  file_url        text not null,
  duration_secs   int,
  take_number     int not null default 1,
  tempo           smallint,
  self_rating     smallint check (self_rating between 1 and 5),
  created_at      timestamptz not null default now()
);

create index recordings_card_idx on recordings (excerpt_card_id);
create index recordings_user_idx on recordings (user_id);

-- ---------------------------------------------------------------------------
-- Practice profile + plans
-- ---------------------------------------------------------------------------

create table practice_profiles (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null unique references profiles (id) on delete cascade,
  days_per_week          smallint not null check (days_per_week between 1 and 7),
  session_minutes        smallint not null check (session_minutes between 10 and 300),
  time_of_day            text,
  warmup_ritual          text,
  closing_ritual         text,
  blackout_dates         date[] not null default '{}',
  minimum_viable_session smallint not null default 20   -- "what does a bad day look like?"
);

create table practice_plans (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references profiles (id) on delete cascade,
  generated_at  timestamptz not null default now(),
  version       int not null default 1,
  horizon_start date not null,
  horizon_end   date not null,
  phase_map     jsonb not null default '{}',
  status        plan_status not null default 'active'
);

create index practice_plans_user_idx on practice_plans (user_id);

create table planned_sessions (
  id              uuid primary key default gen_random_uuid(),
  plan_id         uuid not null references practice_plans (id) on delete cascade,
  date            date not null,
  planned_minutes smallint not null,
  phase           text not null,
  blocks          jsonb not null default '[]',
  status          session_status not null default 'planned',
  actual_minutes  smallint
);

create index planned_sessions_plan_date_idx on planned_sessions (plan_id, date);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table profiles          enable row level security;
alter table auditions         enable row level security;
alter table rep_list_items    enable row level security;
alter table excerpt_cards     enable row level security;
alter table mock_sessions     enable row level security;
alter table recordings        enable row level security;
alter table practice_profiles enable row level security;
alter table practice_plans    enable row level security;
alter table planned_sessions  enable row level security;
alter table excerpts          enable row level security;
alter table excerpt_knowledge enable row level security;

create policy "own profile" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own auditions" on auditions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own rep items" on rep_list_items
  for all using (
    exists (select 1 from auditions a where a.id = audition_id and a.user_id = auth.uid())
  ) with check (
    exists (select 1 from auditions a where a.id = audition_id and a.user_id = auth.uid())
  );

create policy "own cards" on excerpt_cards
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own mock sessions" on mock_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own recordings" on recordings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own practice profile" on practice_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own plans" on practice_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own sessions" on planned_sessions
  for all using (
    exists (select 1 from practice_plans p where p.id = plan_id and p.user_id = auth.uid())
  ) with check (
    exists (select 1 from practice_plans p where p.id = plan_id and p.user_id = auth.uid())
  );

-- Canonical library: readable by any signed-in user, writable only via service role.
create policy "excerpts readable" on excerpts
  for select using (auth.role() = 'authenticated');

create policy "knowledge readable" on excerpt_knowledge
  for select using (auth.role() = 'authenticated');

-- Auto-create a profile row on signup.
create function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Private bucket for recordings (paths are namespaced by user id).
insert into storage.buckets (id, name, public) values ('recordings', 'recordings', false)
on conflict (id) do nothing;

create policy "own recording files" on storage.objects
  for all using (
    bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'recordings' and (storage.foldername(name))[1] = auth.uid()::text
  );
