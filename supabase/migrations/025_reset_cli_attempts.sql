-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.5: INSTRUCTOR CLI ATTEMPT RESET
-- Requires migration 020.
-- =========================================================

create or replace function public.reset_instructor_cli_attempts(
  p_attempt_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_requested_count integer;
  v_authorized_count integer;
  v_deleted_count integer;
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  select count(distinct attempt_id)
  into v_requested_count
  from unnest(coalesce(p_attempt_ids, array[]::uuid[]))
    attempt_id;

  if v_requested_count = 0 then
    raise exception 'Select at least one CLI attempt.';
  end if;

  select count(distinct attempt.id)
  into v_authorized_count
  from public.cli_attempts attempt
  join public.cli_labs lab on lab.id = attempt.lab_id
  where attempt.id = any(p_attempt_ids)
    and (
      lab.created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if v_authorized_count <> v_requested_count then
    raise exception
      'One or more CLI attempts were not found or cannot be reset.';
  end if;

  delete from public.cli_attempts attempt
  using public.cli_labs lab
  where attempt.id = any(p_attempt_ids)
    and lab.id = attempt.lab_id
    and (
      lab.created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all
on function public.reset_instructor_cli_attempts(uuid[])
from public;

grant execute
on function public.reset_instructor_cli_attempts(uuid[])
to authenticated;

-- Use the next unused attempt number after a reset. The attempt limit
-- is still based on the number of attempts that currently exist.
create or replace function public.start_cli_attempt(
  p_lab_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_lab public.cli_labs%rowtype;
  v_attempt_id uuid;
  v_attempt_count integer;
  v_next_attempt_number integer;
  v_maximum numeric;
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select *
  into v_lab
  from public.cli_labs
  where id = p_lab_id
    and status = 'published'
    and exists (
      select 1
      from public.cli_lab_assignments assignment
      join public.class_memberships membership
        on membership.class_id = assignment.class_id
      join public.class_sections section
        on section.id = assignment.class_id
      where assignment.lab_id = cli_labs.id
        and membership.student_id = v_student_id
        and section.is_active
    );

  if not found then
    raise exception 'CLI practical is unavailable.';
  end if;

  select id
  into v_attempt_id
  from public.cli_attempts
  where lab_id = p_lab_id
    and student_id = v_student_id
    and status = 'in_progress'
    and expires_at > now()
  order by started_at desc
  limit 1;

  if v_attempt_id is not null then
    return v_attempt_id;
  end if;

  update public.cli_attempts
  set status = 'expired'
  where lab_id = p_lab_id
    and student_id = v_student_id
    and status = 'in_progress'
    and expires_at <= now();

  select
    count(*),
    coalesce(max(attempt_number), 0) + 1
  into
    v_attempt_count,
    v_next_attempt_number
  from public.cli_attempts
  where lab_id = p_lab_id
    and student_id = v_student_id;

  if v_attempt_count >= v_lab.max_attempts then
    raise exception 'Maximum practical attempts reached.';
  end if;

  select coalesce(
    sum((criterion->>'points')::numeric),
    0
  )
  into v_maximum
  from jsonb_array_elements(
    v_lab.grading_criteria
  ) criterion;

  insert into public.cli_attempts (
    lab_id,
    student_id,
    attempt_number,
    expires_at,
    maximum_points,
    session_state
  )
  values (
    p_lab_id,
    v_student_id,
    v_next_attempt_number,
    now() + make_interval(
      mins => v_lab.duration_minutes
    ),
    v_maximum,
    jsonb_build_object(
      'hostname', v_lab.initial_hostname,
      'mode', 'user_exec',
      'activeVlan', null,
      'activeInterface', null,
      'vlans', '{}'::jsonb,
      'interfaces', '{}'::jsonb,
      'saved', false
    )
  )
  returning id into v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all
on function public.start_cli_attempt(uuid)
from public;

grant execute
on function public.start_cli_attempt(uuid)
to authenticated;
