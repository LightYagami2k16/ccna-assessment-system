-- Phase 7.1 + Phase 10 foundation:
-- secure administrator bootstrap, user directory, and audited role management.

-- =========================================================
-- 1. ROLE-CHANGE AUDIT LOG
-- =========================================================

create table if not exists public.admin_role_changes (
  id bigint generated always as identity primary key,
  target_user_id uuid not null
    references public.profiles(id)
    on delete cascade,
  previous_role public.app_role not null,
  new_role public.app_role not null,
  changed_by uuid
    references public.profiles(id)
    on delete set null,
  reason text not null default '',
  changed_at timestamptz not null default now()
);

create index if not exists admin_role_changes_target_idx
on public.admin_role_changes(target_user_id, changed_at desc);

create index if not exists admin_role_changes_actor_idx
on public.admin_role_changes(changed_by, changed_at desc);

alter table public.admin_role_changes
enable row level security;

revoke all
on public.admin_role_changes
from anon;

grant select
on public.admin_role_changes
to authenticated;

drop policy if exists "Administrators can view role changes"
on public.admin_role_changes;

create policy "Administrators can view role changes"
on public.admin_role_changes
for select
to authenticated
using (
  public.get_current_user_role_text() = 'administrator'
);

-- =========================================================
-- 2. PROTECT PROFILE ROLES FROM SELF-ASSIGNMENT
--
-- A signed-in user may update only their own full name.
-- Role changes go through the administrator-only function below.
-- =========================================================

revoke update
on public.profiles
from authenticated;

grant update (full_name)
on public.profiles
to authenticated;

-- =========================================================
-- 3. ADMINISTRATOR USER DIRECTORY
-- =========================================================

create or replace function public.list_user_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  email_confirmed boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if public.get_current_user_role_text() <> 'administrator' then
    raise exception 'Administrator access is required.';
  end if;

  return query
  select
    profile.id,
    coalesce(account.email, '')::text,
    profile.full_name,
    case
      when profile.role::text = 'admin' then 'administrator'
      else profile.role::text
    end,
    account.email_confirmed_at is not null,
    account.created_at,
    account.last_sign_in_at
  from public.profiles profile
  join auth.users account
    on account.id = profile.id
  order by
    case profile.role::text
      when 'admin' then 1
      when 'instructor' then 2
      else 3
    end,
    lower(coalesce(nullif(profile.full_name, ''), account.email, ''));
end;
$$;

revoke all
on function public.list_user_accounts()
from public;

grant execute
on function public.list_user_accounts()
to authenticated;

-- =========================================================
-- 4. ADMINISTRATOR-ONLY ROLE MANAGEMENT
-- =========================================================

create or replace function public.set_user_account_role(
  p_target_user_id uuid,
  p_new_role text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor_id uuid;
  v_previous_role public.app_role;
  v_new_role public.app_role;
  v_normalized_role text;
begin
  v_actor_id := auth.uid();

  if v_actor_id is null then
    raise exception 'You must be signed in.';
  end if;

  if public.get_current_user_role_text() <> 'administrator' then
    raise exception 'Administrator access is required.';
  end if;

  if p_target_user_id = v_actor_id then
    raise exception 'You cannot change your own administrator role.';
  end if;

  v_normalized_role := lower(trim(coalesce(p_new_role, '')));

  if v_normalized_role = 'administrator' then
    v_normalized_role := 'admin';
  end if;

  if v_normalized_role not in ('student', 'instructor', 'admin') then
    raise exception 'The selected account role is not valid.';
  end if;

  select profile.role
  into v_previous_role
  from public.profiles profile
  where profile.id = p_target_user_id
  for update;

  if not found then
    raise exception 'The selected user account was not found.';
  end if;

  v_new_role := v_normalized_role::public.app_role;

  if v_previous_role = v_new_role then
    return jsonb_build_object(
      'userId', p_target_user_id,
      'role', case
        when v_new_role::text = 'admin' then 'administrator'
        else v_new_role::text
      end,
      'changed', false
    );
  end if;

  update public.profiles
  set
    role = v_new_role,
    updated_at = now()
  where id = p_target_user_id;

  insert into public.admin_role_changes (
    target_user_id,
    previous_role,
    new_role,
    changed_by,
    reason
  )
  values (
    p_target_user_id,
    v_previous_role,
    v_new_role,
    v_actor_id,
    'Role changed in administrator workspace'
  );

  return jsonb_build_object(
    'userId', p_target_user_id,
    'role', case
      when v_new_role::text = 'admin' then 'administrator'
      else v_new_role::text
    end,
    'changed', true
  );
end;
$$;

revoke all
on function public.set_user_account_role(uuid, text)
from public;

grant execute
on function public.set_user_account_role(uuid, text)
to authenticated;

-- =========================================================
-- 5. ONE-TIME FIRST-ADMINISTRATOR BOOTSTRAP
--
-- This function is deliberately unavailable to the website.
-- Run it only from the Supabase SQL Editor after the first
-- administrator has registered through the normal sign-up form:
--
--   select public.bootstrap_first_administrator(
--     'administrator@example.com'
--   );
-- =========================================================

create or replace function public.bootstrap_first_administrator(
  p_email text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_target_user_id uuid;
  v_previous_role public.app_role;
begin
  if exists (
    select 1
    from public.profiles
    where role::text = 'admin'
  ) then
    raise exception
      'An administrator already exists. Use the administrator workspace to manage roles.';
  end if;

  select account.id
  into v_target_user_id
  from auth.users account
  where lower(account.email) = lower(trim(p_email))
  limit 1;

  if v_target_user_id is null then
    raise exception
      'No registered account was found for that email address.';
  end if;

  select role
  into v_previous_role
  from public.profiles
  where id = v_target_user_id
  for update;

  if v_previous_role is null then
    raise exception
      'The registered account does not have a profile.';
  end if;

  update public.profiles
  set
    role = 'admin',
    updated_at = now()
  where id = v_target_user_id;

  insert into public.admin_role_changes (
    target_user_id,
    previous_role,
    new_role,
    changed_by,
    reason
  )
  values (
    v_target_user_id,
    v_previous_role,
    'admin',
    null,
    'First administrator bootstrap from Supabase SQL Editor'
  );

  return v_target_user_id;
end;
$$;

revoke all
on function public.bootstrap_first_administrator(text)
from public, anon, authenticated;

-- =========================================================
-- 6. VERIFICATION
-- =========================================================

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'bootstrap_first_administrator',
    'list_user_accounts',
    'set_user_account_role'
  )
order by routine_name;
