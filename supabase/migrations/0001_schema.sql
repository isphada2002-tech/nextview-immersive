-- NVI (NextView Immersive) — core schema
-- Based on the MLD. Documented deviations are marked "DEVIATION".

create extension if not exists pgcrypto;

-- ---------- Enums ----------
create type user_role          as enum ('admin','agency','photographer','lead');
create type subscription_plan  as enum ('starter','pro','enterprise');
-- DEVIATION: confirmed decision uses 'pending' (MLD had 'pending_approval')
create type photographer_status as enum ('pending','active','suspended');
create type property_type      as enum ('apartment','villa','commercial','land');
-- DEVIATION: 'qa_review' added to map the New Request -> Photography -> QA Review -> Published pipeline
create type property_status    as enum ('draft','new_request','photography','qa_review','published','sold');
create type mission_status     as enum ('available','assigned','signed','completed','cancelled');
-- DEVIATION: settlement tracking added (payouts tracked in DB, no payment gateway)
create type settlement_status  as enum ('unpaid','settled');
create type hotspot_type       as enum ('navigation','info','video','link');
create type lead_category      as enum ('agency','developer','photographer','mre');
create type device_type        as enum ('desktop','mobile','tablet','vr_headset');

-- ---------- Users & actors ----------
create table users (
  id_user     bigint generated always as identity primary key,
  -- DEVIATION: link to Supabase Auth
  auth_uid    uuid not null unique references auth.users(id) on delete cascade,
  full_name   text not null,
  email       text not null unique,
  phone       text,
  role        user_role not null default 'lead',
  is_verified boolean not null default false,
  created_at  timestamptz not null default now()
);

create table agency (
  id_agency         bigint generated always as identity primary key,
  id_user           bigint not null unique references users(id_user) on delete cascade,
  agency_name       text not null,
  city              text not null,
  subscription_plan subscription_plan not null default 'starter',
  created_at        timestamptz not null default now()
);

create table photographer (
  id_photographer bigint generated always as identity primary key,
  id_user         bigint not null unique references users(id_user) on delete cascade,
  city            text not null check (city in ('Tanger','Tetouan')),
  status          photographer_status not null default 'pending',
  rating          numeric(3,2) check (rating between 0 and 5),
  equipment_specs text,
  created_at      timestamptz not null default now()
);

-- ---------- Properties ----------
create table property (
  id_property         bigint generated always as identity primary key,
  id_agency           bigint not null references agency(id_agency) on delete cascade,
  title               text not null check (length(title) between 3 and 160),
  description         text,
  price               numeric(14,2) check (price is null or price >= 0),
  property_type       property_type not null,
  status              property_status not null default 'draft',
  city                text not null check (city in ('Tanger','Tetouan')),
  -- DEVIATION: units_count added (spec requires "number of units" on mission cards)
  units_count         int not null default 1 check (units_count >= 1),
  -- Public, masked values only. Exact values live in property_secret.
  masked_address      text,
  client_phone_masked text,
  created_at          timestamptz not null default now()
);

-- DEVIATION: exact address and client phone are isolated in their own table so
-- that RLS can deny them to photographers entirely, without relying on column rules.
create table property_secret (
  id_property   bigint primary key references property(id_property) on delete cascade,
  exact_address text not null,
  client_phone  text not null check (client_phone ~ '^\+212[5-7][0-9]{8}$')
);

create table mission (
  id_mission        bigint generated always as identity primary key,
  id_property       bigint not null references property(id_property) on delete cascade,
  id_photographer   bigint references photographer(id_photographer),
  mission_price     numeric(12,2) not null default 1800 check (mission_price >= 0),
  photographer_fee  numeric(12,2) not null default 450 check (photographer_fee >= 0),
  target_date       timestamptz,
  mission_status    mission_status not null default 'available',
  settlement_status settlement_status not null default 'unpaid',
  settled_at        timestamptz,
  created_at        timestamptz not null default now(),
  check (photographer_fee <= mission_price)
);
create index mission_photographer_idx on mission(id_photographer);
create index mission_property_idx on mission(id_property);
-- one open mission per property at a time
create unique index mission_one_open_per_property on mission(id_property) where mission_status <> 'cancelled';

-- ---------- Contracts (non-circumvention e-signature) ----------
create table contract (
  id_contract                  bigint generated always as identity primary key,
  id_mission                   bigint not null references mission(id_mission) on delete cascade,
  id_photographer              bigint not null references photographer(id_photographer),
  contract_version             text not null,
  contract_text_sha256         text not null check (contract_text_sha256 ~ '^[a-f0-9]{64}$'),
  -- DEVIATION: a PDF is not generated yet; reserved for a future export
  contract_pdf_url             text,
  signed_typed_name            text not null,
  is_non_contournement_accepted boolean not null default false,
  is_unlocked                  boolean not null default false,
  signed_at                    timestamptz not null default now(),
  signer_ip                    inet,
  user_agent                   text,
  created_at                   timestamptz not null default now(),
  unique (id_mission, id_photographer)
);

-- ---------- Virtual tours ----------
create table virtual_tour (
  id_tour     bigint generated always as identity primary key,
  id_property bigint not null references property(id_property) on delete cascade,
  tour_url    text unique,
  embed_code  text,
  num_scenes  int not null default 0 check (num_scenes >= 0),
  is_active   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index virtual_tour_property_idx on virtual_tour(id_property);

create table scene_360 (
  id_scene                bigint generated always as identity primary key,
  id_tour                 bigint not null references virtual_tour(id_tour) on delete cascade,
  scene_title             text not null,
  image_url               text not null check (image_url ~ '^https://'),
  initial_view_parameters jsonb not null default '{"yaw":0,"pitch":0,"hfov":100}'::jsonb,
  position                int not null default 0
);
create index scene_360_tour_idx on scene_360(id_tour);

create table hotspot (
  id_hotspot      bigint generated always as identity primary key,
  id_scene        bigint not null references scene_360(id_scene) on delete cascade,
  target_scene_id bigint references scene_360(id_scene) on delete set null,
  title           text not null,
  hotspot_type    hotspot_type not null default 'navigation',
  pitch           numeric(6,2) not null default 0 check (pitch between -90 and 90),
  yaw             numeric(6,2) not null default 0 check (yaw between -180 and 180)
);
create index hotspot_scene_idx on hotspot(id_scene);

-- ---------- Leads ----------
create table lead_capture (
  id_lead       bigint generated always as identity primary key,
  id_property   bigint references property(id_property) on delete set null,
  full_name     text not null check (length(btrim(full_name)) between 2 and 120),
  email         text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and length(email) <= 254),
  phone         text not null check (phone ~ '^\+212[5-7][0-9]{8}$'),
  user_category lead_category not null,
  message       text check (message is null or length(message) <= 2000),
  visit_date    timestamptz,
  source_url    text check (source_url is null or length(source_url) <= 2048),
  -- set by the route-lead Edge Function once the email has been sent
  forwarded_at  timestamptz,
  created_at    timestamptz not null default now()
);
create index lead_property_idx on lead_capture(id_property);

-- ---------- Visitor analytics ----------
create table analytics_log (
  id_log             bigint generated always as identity primary key,
  id_tour            bigint not null references virtual_tour(id_tour) on delete cascade,
  -- DEVIATION: scene-level tracking so the room heatmap can be built
  id_scene           bigint references scene_360(id_scene) on delete set null,
  session_id         text not null check (length(session_id) <= 80),
  views_count        int not null default 1 check (views_count between 0 and 500),
  time_spent_seconds int not null default 0 check (time_spent_seconds between 0 and 3600),
  country_origin     char(2),
  device_type        device_type not null default 'desktop',
  created_at         timestamptz not null default now()
);
create index analytics_tour_idx on analytics_log(id_tour);

-- ---------- Helpers ----------
create or replace function public.mask_phone(p text)
returns text language sql immutable as $$
  select case when p is null then null
              else left(p, 4) || repeat('•', greatest(length(p) - 7, 0)) || right(p, 3) end
$$;

-- ---------- Auth -> profile provisioning ----------
-- Role is taken from signup metadata, limited to agency/photographer.
-- Admins are promoted manually in SQL (see README), never through signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_meta_role text := new.raw_user_meta_data->>'role';
  v_role      user_role;
  v_name      text := coalesce(nullif(btrim(new.raw_user_meta_data->>'full_name'), ''), new.email);
  v_user_id   bigint;
begin
  v_role := case when v_meta_role in ('agency','photographer')
                 then v_meta_role::user_role
                 else 'lead'::user_role end;

  insert into users (auth_uid, full_name, email, phone, role)
  values (new.id, v_name, new.email, new.raw_user_meta_data->>'phone', v_role)
  returning id_user into v_user_id;

  if v_role = 'agency' then
    insert into agency (id_user, agency_name, city)
    values (v_user_id,
            coalesce(nullif(btrim(new.raw_user_meta_data->>'agency_name'), ''), v_name),
            coalesce(new.raw_user_meta_data->>'city', 'Tanger'));
  elsif v_role = 'photographer' then
    insert into photographer (id_user, city, equipment_specs)
    values (v_user_id,
            coalesce(new.raw_user_meta_data->>'city', 'Tanger'),
            new.raw_user_meta_data->>'equipment_specs');
  end if;

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
