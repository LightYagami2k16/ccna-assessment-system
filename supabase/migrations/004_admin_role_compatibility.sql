-- Phase 1 stores the administrator role as "admin".
-- Later migrations use the label "administrator" in their RLS policies.
-- Normalize only the helper's text result so both phases remain compatible.

create or replace function public.get_current_user_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when role::text = 'admin' then 'administrator'
    else role::text
  end
  from public.profiles
  where id = auth.uid()
  limit 1;
$$;

revoke all
on function public.get_current_user_role_text()
from public;

grant execute
on function public.get_current_user_role_text()
to authenticated;
