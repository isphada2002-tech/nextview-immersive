-- NVI — Row Level Security
-- Principle: deny by default. Every table has RLS on; policies grant the minimum.
-- Helper functions are SECURITY DEFINER so policies do not recurse into each other.

-- ---------- Identity helpers ----------
create or replace function public.current_role_name() returns user_role
language sql stable security definer set search_path = public as $$
  select role from users where auth_uid = auth.uid()
$$;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(current_role_name() = 'admin', false)
$$;

create or replace function public.my_agency_id() returns bigint
language sql stable security definer set search_path = public as $$
  select a.id_agency from agency a join users u on u.id_user = a.id_user
  where u.auth_uid = auth.uid()
$$;

create or replace function public.my_photographer_id() returns bigint
language sql stable security definer set search_path = public as $$
  select p.id_photographer from photographer p join users u on u.id_user = p.id_user
  where u.auth_uid = auth.uid()
$$;

create or replace function public.my_active_photographer_id() returns bigint
language sql stable security definer set search_path = public as $$
  select p.id_photographer from photographer p join users u on u.id_user = p.id_user
  where u.auth_uid = auth.uid() and p.status = 'active'
$$;

-- ---------- Resource helpers ----------
create or replace function public.owns_property(p_property bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from property p
                 where p.id_property = p_property and p.id_agency = my_agency_id())
$$;

create or replace function public.owns_tour(p_tour bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from virtual_tour t join property p on p.id_property = t.id_property
                 where t.id_tour = p_tour and p.id_agency = my_agency_id())
$$;

-- An active photographer sees properties with an open mission in their pool,
-- or the mission they hold. Only masked property columns are reachable this way.
create or replace function public.photographer_can_see_property(p_property bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from mission m
    where m.id_property = p_property and (
      m.id_photographer = my_photographer_id()
      or (m.mission_status = 'available' and my_active_photographer_id() is not null)
    )
  )
$$;

create or replace function public.can_view_tour(p_tour bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from virtual_tour t join property p on p.id_property = t.id_property
    where t.id_tour = p_tour and (
      t.is_active
      or is_admin()
      or p.id_agency = my_agency_id()
      or exists (select 1 from mission m
                 where m.id_property = p.id_property and m.id_photographer = my_photographer_id())
    )
  )
$$;

-- ---------- Enable RLS everywhere ----------
alter table users          enable row level security;
alter table agency         enable row level security;
alter table photographer   enable row level security;
alter table property       enable row level security;
alter table property_secret enable row level security;
alter table mission        enable row level security;
alter table contract       enable row level security;
alter table virtual_tour   enable row level security;
alter table scene_360      enable row level security;
alter table hotspot        enable row level security;
alter table lead_capture   enable row level security;
alter table analytics_log  enable row level security;

-- Defense in depth: anon never touches the sensitive tables directly.
revoke all on property_secret, contract from anon;

-- ---------- users ----------
create policy users_select on users for select
  using (auth_uid = auth.uid() or is_admin());
create policy users_update_self on users for update
  using (auth_uid = auth.uid())
  with check (auth_uid = auth.uid() and role = current_role_name());  -- cannot self-promote
create policy users_admin_all on users for all
  using (is_admin()) with check (is_admin());

-- ---------- agency ----------
create policy agency_select on agency for select
  using (is_admin() or id_agency = my_agency_id());
create policy agency_update_self on agency for update
  using (id_agency = my_agency_id()) with check (id_agency = my_agency_id());
create policy agency_admin_all on agency for all
  using (is_admin()) with check (is_admin());

-- ---------- photographer ----------
create policy photographer_select on photographer for select
  using (is_admin() or id_photographer = my_photographer_id());
create policy photographer_admin_all on photographer for all
  using (is_admin()) with check (is_admin());

-- ---------- property ----------
create policy property_public_select on property for select
  using (status in ('published','sold'));
create policy property_owner_select on property for select
  using (id_agency = my_agency_id());
create policy property_photographer_select on property for select
  using (photographer_can_see_property(id_property));
create policy property_owner_update on property for update
  using (id_agency = my_agency_id() and status in ('draft','new_request'))
  with check (id_agency = my_agency_id() and status in ('draft','new_request'));
create policy property_admin_all on property for all
  using (is_admin()) with check (is_admin());

-- ---------- property_secret (exact address + client phone) ----------
-- No photographer policy exists: photographers reach this data only through
-- get_unlocked_contact(), which checks for a signed contract.
create policy secret_owner_select on property_secret for select
  using (owns_property(id_property));
create policy secret_owner_update on property_secret for update
  using (owns_property(id_property)) with check (owns_property(id_property));
create policy secret_admin_all on property_secret for all
  using (is_admin()) with check (is_admin());

-- ---------- mission ----------
create policy mission_owner_select on mission for select
  using (owns_property(id_property));
create policy mission_photographer_select on mission for select
  using (id_photographer = my_photographer_id()
         or (mission_status = 'available' and my_active_photographer_id() is not null));
create policy mission_admin_all on mission for all
  using (is_admin()) with check (is_admin());
-- All other mission transitions go through SECURITY DEFINER RPCs.

-- ---------- contract ----------
create policy contract_photographer_select on contract for select
  using (id_photographer = my_photographer_id());
create policy contract_admin_all on contract for all
  using (is_admin()) with check (is_admin());

-- ---------- virtual tours, scenes, hotspots ----------
create policy tour_select on virtual_tour for select
  using (can_view_tour(id_tour));
create policy tour_admin_all on virtual_tour for all
  using (is_admin()) with check (is_admin());

create policy scene_select on scene_360 for select
  using (can_view_tour(id_tour));
create policy scene_admin_all on scene_360 for all
  using (is_admin()) with check (is_admin());

create policy hotspot_select on hotspot for select
  using (exists (select 1 from scene_360 s where s.id_scene = hotspot.id_scene));
create policy hotspot_admin_all on hotspot for all
  using (is_admin()) with check (is_admin());

-- ---------- analytics ----------
-- Public visitors may write analytics only for live tours.
create policy analytics_insert_public on analytics_log for insert
  to anon, authenticated
  with check (exists (select 1 from virtual_tour t
                      where t.id_tour = analytics_log.id_tour and t.is_active));
create policy analytics_select_owner on analytics_log for select
  using (owns_tour(id_tour) or is_admin());

-- ---------- lead capture ----------
create policy lead_insert_public on lead_capture for insert
  to anon, authenticated
  with check (id_property is null or exists (
    select 1 from property p
    where p.id_property = lead_capture.id_property and p.status in ('published','sold')));
create policy lead_select_owner on lead_capture for select
  using (is_admin() or (id_property is not null and owns_property(id_property)));
create policy lead_admin_update on lead_capture for update
  using (is_admin()) with check (is_admin());
