-- NVI — state transitions and protected data access.
-- Every function re-checks the caller's identity. None trusts client-supplied roles.

-- ---------- Agency: create property (+ secret row, + optional mission) ----------
create or replace function public.create_property(p_data jsonb, p_request boolean default false)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_agency bigint := my_agency_id();
  v_prop   bigint;
  v_status property_status := 'draft';
begin
  if v_agency is null then
    raise exception 'Only agency accounts can create properties';
  end if;
  if p_data->>'client_phone' is null or p_data->>'client_phone' !~ '^\+212[5-7][0-9]{8}$' then
    raise exception 'Client phone must be a valid +212 number';
  end if;
  if p_request then v_status := 'new_request'; end if;

  insert into property (id_agency, title, description, price, property_type, status, city,
                        units_count, masked_address, client_phone_masked)
  values (v_agency,
          p_data->>'title',
          nullif(p_data->>'description', ''),
          nullif(p_data->>'price', '')::numeric,
          (p_data->>'property_type')::property_type,
          v_status,
          p_data->>'city',
          coalesce(nullif(p_data->>'units_count', '')::int, 1),
          nullif(p_data->>'masked_address', ''),
          mask_phone(p_data->>'client_phone'))
  returning id_property into v_prop;

  insert into property_secret (id_property, exact_address, client_phone)
  values (v_prop, p_data->>'exact_address', p_data->>'client_phone');

  if p_request then
    insert into mission (id_property, target_date)
    values (v_prop, nullif(p_data->>'target_date', '')::timestamptz);
  end if;

  return v_prop;
end $$;

-- ---------- Agency: request photography for an existing draft ----------
create or replace function public.request_photography(p_property bigint, p_target_date timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_status property_status;
begin
  if not owns_property(p_property) then
    raise exception 'Property not found';
  end if;
  select status into v_status from property where id_property = p_property;
  if v_status <> 'draft' then
    raise exception 'Only draft properties can request photography';
  end if;
  update property set status = 'new_request' where id_property = p_property;
  insert into mission (id_property, target_date) values (p_property, p_target_date);
end $$;

-- ---------- Photographer: claim an available mission ----------
create or replace function public.claim_mission(p_mission bigint)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_photo photographer%rowtype;
  v_m     mission%rowtype;
  v_prop  property%rowtype;
begin
  select * into v_photo from photographer where id_photographer = my_active_photographer_id();
  if v_photo.id_photographer is null then
    raise exception 'Your account must be approved by NVI before you can claim missions';
  end if;

  select * into v_m from mission where id_mission = p_mission for update;
  if v_m.id_mission is null or v_m.mission_status <> 'available' then
    raise exception 'This mission is no longer available';
  end if;

  select * into v_prop from property where id_property = v_m.id_property;
  if v_prop.city <> v_photo.city then
    raise exception 'This mission is outside your city';
  end if;

  update mission set id_photographer = v_photo.id_photographer, mission_status = 'assigned'
  where id_mission = p_mission;
  update property set status = 'photography' where id_property = v_m.id_property;
end $$;

-- ---------- Admin: assign a mission to a specific photographer ----------
create or replace function public.admin_assign_mission(p_mission bigint, p_photographer bigint)
returns void language plpgsql security definer set search_path = public as $$
declare v_prop bigint;
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from photographer where id_photographer = p_photographer and status = 'active') then
    raise exception 'Photographer is not an active account';
  end if;
  update mission set id_photographer = p_photographer, mission_status = 'assigned'
  where id_mission = p_mission and mission_status in ('available','assigned')
  returning id_property into v_prop;
  if v_prop is null then raise exception 'Mission cannot be assigned in its current state'; end if;
  update property set status = 'photography' where id_property = v_prop;
end $$;

-- ---------- Photographer: sign the non-circumvention contract ----------
-- Records typed name, timestamp, IP (from the proxy header) and the hash of the
-- exact contract text shown. Only after this does the contact data unlock.
create or replace function public.sign_contract(p_mission bigint, p_typed_name text, p_text_sha256 text)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_photo bigint := my_photographer_id();
  v_m     mission%rowtype;
  v_user  users%rowtype;
  v_hdrs  json;
  v_ip    inet;
  v_id    bigint;
begin
  if v_photo is null then raise exception 'Not a photographer account'; end if;

  select * into v_m from mission where id_mission = p_mission for update;
  if v_m.id_photographer is distinct from v_photo then
    raise exception 'This mission is not assigned to you';
  end if;
  if v_m.mission_status <> 'assigned' then
    raise exception 'The contract applies to assigned missions only';
  end if;

  select * into v_user from users where auth_uid = auth.uid();
  if lower(btrim(p_typed_name)) <> lower(btrim(v_user.full_name)) then
    raise exception 'The typed name must match your registered full name';
  end if;
  if p_text_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid contract fingerprint';
  end if;

  begin
    v_hdrs := nullif(current_setting('request.headers', true), '')::json;
    v_ip   := nullif(split_part(v_hdrs->>'x-forwarded-for', ',', 1), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into contract (id_mission, id_photographer, contract_version, contract_text_sha256,
                        signed_typed_name, is_non_contournement_accepted, is_unlocked,
                        signed_at, signer_ip, user_agent)
  values (p_mission, v_photo, 'SLA-NC-2026.1', p_text_sha256,
          btrim(p_typed_name), true, true, now(), v_ip, v_hdrs->>'user-agent')
  returning id_contract into v_id;

  update mission set mission_status = 'signed' where id_mission = p_mission;
  return v_id;
end $$;

-- ---------- Photographer: reveal exact address and client phone (post-signature only) ----------
create or replace function public.get_unlocked_contact(p_mission bigint)
returns table (exact_address text, client_phone text)
language plpgsql stable security definer set search_path = public as $$
declare v_photo bigint := my_photographer_id(); v_prop bigint;
begin
  if v_photo is null then raise exception 'Not a photographer account'; end if;
  if not exists (
    select 1 from contract c
    where c.id_mission = p_mission and c.id_photographer = v_photo
      and c.is_unlocked and c.is_non_contournement_accepted
  ) then
    raise exception 'Sign the service agreement to unlock client contact details';
  end if;
  select m.id_property into v_prop from mission m where m.id_mission = p_mission;
  return query select s.exact_address, s.client_phone
               from property_secret s where s.id_property = v_prop;
end $$;

-- ---------- Photographer: submit a finished tour ----------
create or replace function public.submit_tour(p_mission bigint, p_tour_url text,
                                              p_embed_code text, p_scenes jsonb)
returns bigint language plpgsql security definer set search_path = public as $$
declare
  v_photo bigint := my_photographer_id();
  v_m     mission%rowtype;
  v_tour  bigint;
  v_scene jsonb;
  v_i     int := 0;
begin
  select * into v_m from mission where id_mission = p_mission for update;
  if v_photo is null or v_m.id_photographer is distinct from v_photo then
    raise exception 'This mission is not assigned to you';
  end if;
  if v_m.mission_status <> 'signed' then
    raise exception 'Sign the service agreement before submitting a tour';
  end if;
  if jsonb_typeof(p_scenes) <> 'array' or jsonb_array_length(p_scenes) not between 1 and 40 then
    raise exception 'Provide between 1 and 40 scenes';
  end if;
  if p_tour_url !~ '^https://' then
    raise exception 'The tour URL must be https';
  end if;
  if exists (select 1 from virtual_tour where id_property = v_m.id_property and is_active) then
    raise exception 'A live tour already exists for this property';
  end if;

  -- replace an earlier unpublished submission (e.g. after QA rejection)
  delete from virtual_tour where id_property = v_m.id_property and is_active = false;

  insert into virtual_tour (id_property, tour_url, embed_code, num_scenes, is_active)
  values (v_m.id_property, p_tour_url, nullif(p_embed_code, ''), jsonb_array_length(p_scenes), false)
  returning id_tour into v_tour;

  for v_scene in select value from jsonb_array_elements(p_scenes) loop
    if (v_scene->>'image_url') is null or (v_scene->>'image_url') !~ '^https://' then
      raise exception 'Every scene needs an https image URL';
    end if;
    insert into scene_360 (id_tour, scene_title, image_url, initial_view_parameters, position)
    values (v_tour,
            coalesce(nullif(v_scene->>'title', ''), 'Scene ' || (v_i + 1)),
            v_scene->>'image_url',
            jsonb_build_object(
              'yaw',   coalesce((v_scene->>'yaw')::numeric, 0),
              'pitch', coalesce((v_scene->>'pitch')::numeric, 0),
              'hfov',  100),
            v_i);
    v_i := v_i + 1;
  end loop;

  update mission set mission_status = 'completed' where id_mission = p_mission;
  update property set status = 'qa_review' where id_property = v_m.id_property;
  return v_tour;
end $$;

-- ---------- Admin: QA decision ----------
create or replace function public.qa_decision(p_property bigint, p_approve boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  if not exists (select 1 from property where id_property = p_property and status = 'qa_review') then
    raise exception 'Property is not waiting for QA';
  end if;

  if p_approve then
    if not exists (select 1 from virtual_tour where id_property = p_property and is_active = false) then
      raise exception 'No tour awaiting activation';
    end if;
    update virtual_tour set is_active = true
    where id_property = p_property and is_active = false;
    update property set status = 'published' where id_property = p_property;
  else
    update mission set mission_status = 'signed'
    where id_property = p_property and mission_status = 'completed';
    update property set status = 'photography' where id_property = p_property;
    delete from virtual_tour where id_property = p_property and is_active = false;
  end if;
end $$;

-- ---------- Admin: settlement tracking ----------
create or replace function public.settle_mission(p_mission bigint, p_settled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not is_admin() then raise exception 'Admins only'; end if;
  update mission
     set settlement_status = case when p_settled then 'settled'::settlement_status else 'unpaid'::settlement_status end,
         settled_at       = case when p_settled then now() else null end
   where id_mission = p_mission and mission_status = 'completed';
  if not found then raise exception 'Only completed missions can be settled'; end if;
end $$;

-- Execute rights: signed-in users only for state changes; anon may read published data via RLS.
revoke execute on function public.create_property(jsonb, boolean)      from public, anon;
revoke execute on function public.request_photography(bigint, timestamptz) from public, anon;
revoke execute on function public.claim_mission(bigint)                from public, anon;
revoke execute on function public.admin_assign_mission(bigint, bigint) from public, anon;
revoke execute on function public.sign_contract(bigint, text, text)    from public, anon;
revoke execute on function public.get_unlocked_contact(bigint)         from public, anon;
revoke execute on function public.submit_tour(bigint, text, text, jsonb) from public, anon;
revoke execute on function public.qa_decision(bigint, boolean)         from public, anon;
revoke execute on function public.settle_mission(bigint, boolean)      from public, anon;
