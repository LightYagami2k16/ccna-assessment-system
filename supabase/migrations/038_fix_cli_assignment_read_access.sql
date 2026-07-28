-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- FIX: AUTHENTICATED CLI ASSIGNMENT READ ACCESS
-- =========================================================
--
-- Migration 020 revoked all privileges on cli_lab_assignments
-- so the answer key and assignment rows could not be exposed
-- without RLS. It created the RLS policy, but did not restore
-- the table-level SELECT privilege required before PostgreSQL
-- evaluates that policy.

alter table public.cli_lab_assignments
enable row level security;

revoke all
on public.cli_lab_assignments
from anon;

grant select
on public.cli_lab_assignments
to authenticated;

drop policy if exists "Users view relevant CLI assignments"
on public.cli_lab_assignments;

create policy "Users view relevant CLI assignments"
on public.cli_lab_assignments
for select
to authenticated
using (
  (
    public.get_current_user_role_text()
      in ('instructor', 'admin', 'administrator')
    and exists (
      select 1
      from public.class_sections section
      where section.id = cli_lab_assignments.class_id
        and (
          section.created_by = auth.uid()
          or public.get_current_user_role_text()
            in ('admin', 'administrator')
        )
    )
  )
  or (
    public.get_current_user_role_text() = 'student'
    and exists (
      select 1
      from public.class_memberships membership
      join public.class_sections section
        on section.id = membership.class_id
      where membership.class_id =
        cli_lab_assignments.class_id
        and membership.student_id = auth.uid()
        and section.is_active = true
    )
  )
);

-- Keep authorization checks that need cli_labs behind a
-- security-definer function. Students must never receive direct
-- SELECT access to cli_labs because it contains grading criteria.
create or replace function public.can_view_cli_attempt(
  p_attempt_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.cli_attempts attempt
    join public.cli_labs lab
      on lab.id = attempt.lab_id
    where attempt.id = p_attempt_id
      and (
        attempt.student_id = auth.uid()
        or lab.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  );
$$;

revoke all
on function public.can_view_cli_attempt(uuid)
from public;

grant execute
on function public.can_view_cli_attempt(uuid)
to authenticated;

drop policy if exists "Instructors view CLI attempts"
on public.cli_attempts;

create policy "Instructors view CLI attempts"
on public.cli_attempts
for select
to authenticated
using (
  public.get_current_user_role_text()
    in ('instructor', 'admin', 'administrator')
  and public.can_view_cli_attempt(cli_attempts.id)
);

drop policy if exists "Users view relevant CLI commands"
on public.cli_commands;

create policy "Users view relevant CLI commands"
on public.cli_commands
for select
to authenticated
using (
  public.can_view_cli_attempt(cli_commands.attempt_id)
);

-- Return the command's device ID through the safe attempt RPC.
-- This removes the browser's need to query cli_commands directly
-- and does not expose the lab's hidden grading criteria.
create or replace function public.get_cli_attempt_safe(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'expiresAt', attempt.expires_at,
      'state', attempt.session_state
    ),
    'lab', jsonb_build_object(
      'id', lab.id,
      'title', lab.title,
      'description', lab.description,
      'instructions', lab.instructions,
      'deviceType', lab.device_type,
      'initialHostname', lab.initial_hostname,
      'passingScore', lab.passing_score
    ),
    'commands', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', command.id,
            'deviceId', command.device_id,
            'command', command.command_text,
            'output', command.output_text,
            'accepted', command.accepted,
            'modeBefore', command.mode_before,
            'modeAfter', command.mode_after
          )
          order by command.sequence_number
        )
        from public.cli_commands command
        where command.attempt_id = attempt.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.cli_attempts attempt
  join public.cli_labs lab
    on lab.id = attempt.lab_id
  where attempt.id = p_attempt_id
    and attempt.student_id = auth.uid();

  if v_result is null then
    raise exception 'CLI attempt was not found.';
  end if;

  return v_result;
end;
$$;

revoke all
on function public.get_cli_attempt_safe(uuid)
from public;

grant execute
on function public.get_cli_attempt_safe(uuid)
to authenticated;

-- Verification: authenticated should have SELECT while anon
-- remains unable to read the table.
select
  has_table_privilege(
    'authenticated',
    'public.cli_lab_assignments',
    'SELECT'
  ) as authenticated_can_select,
  has_table_privilege(
    'anon',
    'public.cli_lab_assignments',
    'SELECT'
  ) as anon_can_select,
  has_table_privilege(
    'authenticated',
    'public.cli_labs',
    'SELECT'
  ) as authenticated_can_select_hidden_cli_labs;
