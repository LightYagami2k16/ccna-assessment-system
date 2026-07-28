-- Phase 7.2:
-- administrator account-security events, suspension status, and audit history.

-- =========================================================
-- 1. ACCOUNT-SECURITY AUDIT EVENTS
-- =========================================================

create table if not exists public.admin_account_events (
  id bigint generated always as identity primary key,
  event_type text not null check (
    event_type in (
      'invite_sent',
      'account_suspended',
      'account_reactivated'
    )
  ),
  target_user_id uuid
    references public.profiles(id)
    on delete set null,
  target_email text not null default '',
  performed_by uuid not null
    references public.profiles(id)
    on delete restrict,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists admin_account_events_occurred_idx
on public.admin_account_events(occurred_at desc);

create index if not exists admin_account_events_target_idx
on public.admin_account_events(target_user_id, occurred_at desc);

alter table public.admin_account_events
enable row level security;

revoke all
on public.admin_account_events
from anon, authenticated;

grant select
on public.admin_account_events
to authenticated;

drop policy if exists "Administrators can view account events"
on public.admin_account_events;

create policy "Administrators can view account events"
on public.admin_account_events
for select
to authenticated
using (
  public.get_current_user_role_text() = 'administrator'
);

-- =========================================================
-- 2. USER DIRECTORY WITH SUSPENSION STATUS
-- =========================================================

drop function if exists public.list_user_accounts();

create function public.list_user_accounts()
returns table (
  user_id uuid,
  email text,
  full_name text,
  role text,
  email_confirmed boolean,
  is_suspended boolean,
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
    account.banned_until is not null
      and account.banned_until > now(),
    account.created_at,
    account.last_sign_in_at
  from public.profiles profile
  join auth.users account
    on account.id = profile.id
  order by
    case
      when account.banned_until is not null
       and account.banned_until > now() then 1
      else 2
    end,
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
-- 3. COMBINED ADMINISTRATOR AUDIT HISTORY
-- =========================================================

create or replace function public.list_admin_audit_events(
  p_limit integer default 200
)
returns table (
  event_id text,
  event_type text,
  target_user_id uuid,
  target_name text,
  target_email text,
  actor_name text,
  actor_email text,
  details jsonb,
  occurred_at timestamptz
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
  select combined.*
  from (
    select
      ('role-' || role_change.id)::text as event_id,
      'role_changed'::text as event_type,
      role_change.target_user_id,
      coalesce(nullif(target_profile.full_name, ''), 'Unnamed account')::text,
      coalesce(target_account.email, '')::text,
      coalesce(
        nullif(actor_profile.full_name, ''),
        actor_account.email,
        'System bootstrap'
      )::text,
      coalesce(actor_account.email, '')::text,
      jsonb_build_object(
        'previousRole',
        case
          when role_change.previous_role::text = 'admin'
            then 'administrator'
          else role_change.previous_role::text
        end,
        'newRole',
        case
          when role_change.new_role::text = 'admin'
            then 'administrator'
          else role_change.new_role::text
        end,
        'reason', role_change.reason
      ) as details,
      role_change.changed_at as occurred_at
    from public.admin_role_changes role_change
    join public.profiles target_profile
      on target_profile.id = role_change.target_user_id
    left join auth.users target_account
      on target_account.id = role_change.target_user_id
    left join public.profiles actor_profile
      on actor_profile.id = role_change.changed_by
    left join auth.users actor_account
      on actor_account.id = role_change.changed_by

    union all

    select
      ('account-' || account_event.id)::text,
      account_event.event_type,
      account_event.target_user_id,
      coalesce(
        nullif(target_profile.full_name, ''),
        account_event.target_email,
        'Unnamed account'
      )::text,
      coalesce(
        nullif(account_event.target_email, ''),
        target_account.email,
        ''
      )::text,
      coalesce(
        nullif(actor_profile.full_name, ''),
        actor_account.email,
        'Administrator'
      )::text,
      coalesce(actor_account.email, '')::text,
      account_event.details,
      account_event.occurred_at
    from public.admin_account_events account_event
    left join public.profiles target_profile
      on target_profile.id = account_event.target_user_id
    left join auth.users target_account
      on target_account.id = account_event.target_user_id
    left join public.profiles actor_profile
      on actor_profile.id = account_event.performed_by
    left join auth.users actor_account
      on actor_account.id = account_event.performed_by
  ) combined
  order by combined.occurred_at desc
  limit greatest(1, least(coalesce(p_limit, 200), 500));
end;
$$;

revoke all
on function public.list_admin_audit_events(integer)
from public;

grant execute
on function public.list_admin_audit_events(integer)
to authenticated;

-- =========================================================
-- 4. VERIFICATION
-- =========================================================

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'list_admin_audit_events',
    'list_user_accounts'
  )
order by routine_name;
