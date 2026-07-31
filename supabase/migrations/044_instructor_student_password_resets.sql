-- Phase 7.5: instructor-assisted temporary student passwords.
-- Instructors may reset only students enrolled in classes they own.
-- The Edge Function performs the privileged password update, while
-- this flag prevents the student workspace from opening until the
-- temporary password has been replaced.

alter table public.profiles
add column if not exists password_change_required boolean
not null default false;

create or replace function
public.complete_required_password_change()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required.';
  end if;

  update public.profiles
  set
    password_change_required = false,
    updated_at = now()
  where id = auth.uid();

  if not found then
    raise exception 'Account profile was not found.';
  end if;

  return true;
end;
$$;

revoke all
on function public.complete_required_password_change()
from public;

grant execute
on function public.complete_required_password_change()
to authenticated;

alter table public.admin_account_events
drop constraint if exists admin_account_events_event_type_check;

alter table public.admin_account_events
add constraint admin_account_events_event_type_check
check (
  event_type in (
    'invite_sent',
    'password_reset_sent',
    'instructor_password_reset',
    'account_suspended',
    'account_reactivated',
    'account_deleted'
  )
);

select
  column_name,
  data_type,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'profiles'
  and column_name = 'password_change_required';
