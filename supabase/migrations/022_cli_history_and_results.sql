-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.2: CLI HISTORY, RESULTS, AND CRITERION REVIEW
-- Requires migrations 020 and 021.
-- =========================================================

create or replace function public.cli_criterion_is_met(
  p_state jsonb,
  p_criterion jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case p_criterion->>'type'
      when 'hostname' then
        lower(p_state->>'hostname') =
        lower(p_criterion->>'expected')
      when 'vlan_exists' then
        (p_state->'vlans') ? (p_criterion->>'target')
      when 'vlan_name' then
        lower(
          p_state #>>
          array[
            'vlans',
            p_criterion->>'target',
            'name'
          ]
        ) = lower(p_criterion->>'expected')
      when 'interface_mode' then
        lower(
          p_state #>>
          array[
            'interfaces',
            p_criterion->>'target',
            'switchportMode'
          ]
        ) = lower(p_criterion->>'expected')
      when 'interface_access_vlan' then
        (
          p_state #>>
          array[
            'interfaces',
            p_criterion->>'target',
            'accessVlan'
          ]
        ) = p_criterion->>'expected'
      when 'interface_enabled' then
        coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              p_criterion->>'target',
              'shutdown'
            ]
          )::boolean,
          true
        ) = false
      when 'interface_ip' then
        concat(
          p_state #>>
          array[
            'interfaces',
            p_criterion->>'target',
            'ipAddress'
          ],
          ' ',
          p_state #>>
          array[
            'interfaces',
            p_criterion->>'target',
            'subnetMask'
          ]
        ) = p_criterion->>'expected'
      when 'config_saved' then
        coalesce((p_state->>'saved')::boolean, false)
      else false
    end,
    false
  );
$$;

create or replace function public.get_student_cli_history(
  p_limit integer default 50
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'attemptId', result.id,
          'labId', result.lab_id,
          'title', result.title,
          'courseCode', result.course_code,
          'moduleCode', result.module_code,
          'deviceType', result.device_type,
          'attemptNumber', result.attempt_number,
          'status', result.status,
          'scorePoints', result.score_points,
          'maximumPoints', result.maximum_points,
          'percentage', result.percentage,
          'passingScore', result.passing_score,
          'passed', result.passed,
          'startedAt', result.started_at,
          'submittedAt', result.submitted_at,
          'commandCount', result.command_count
        )
        order by result.started_at desc
      )
      from (
        select
          attempt.id,
          attempt.lab_id,
          lab.title,
          course.code as course_code,
          module.code as module_code,
          lab.device_type,
          attempt.attempt_number,
          attempt.status,
          attempt.score_points,
          attempt.maximum_points,
          attempt.percentage,
          lab.passing_score,
          attempt.passed,
          attempt.started_at,
          attempt.submitted_at,
          (
            select count(*)
            from public.cli_commands command
            where command.attempt_id = attempt.id
          ) as command_count
        from public.cli_attempts attempt
        join public.cli_labs lab on lab.id = attempt.lab_id
        join public.courses course on course.id = lab.course_id
        left join public.modules module on module.id = lab.module_id
        where attempt.student_id = v_student_id
          and attempt.status in ('submitted', 'expired')
        order by attempt.started_at desc
        limit greatest(1, least(coalesce(p_limit, 50), 200))
      ) result
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_instructor_cli_results()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'attemptId', attempt.id,
          'labId', lab.id,
          'labTitle', lab.title,
          'courseCode', course.code,
          'moduleCode', module.code,
          'deviceType', lab.device_type,
          'studentId', attempt.student_id,
          'studentName', profile.full_name,
          'studentEmail', auth_user.email,
          'classId', class_info.id,
          'classCode', class_info.code,
          'className', class_info.name,
          'attemptNumber', attempt.attempt_number,
          'status', attempt.status,
          'scorePoints', attempt.score_points,
          'maximumPoints', attempt.maximum_points,
          'percentage', attempt.percentage,
          'passed', attempt.passed,
          'startedAt', attempt.started_at,
          'submittedAt', attempt.submitted_at,
          'eventCount', (
            select count(*)
            from public.cli_integrity_events event
            where event.attempt_id = attempt.id
          ),
          'commandCount', (
            select count(*)
            from public.cli_commands command
            where command.attempt_id = attempt.id
          )
        )
        order by class_info.name, profile.full_name,
          lab.title, attempt.attempt_number desc
      )
      from public.cli_attempts attempt
      join public.cli_labs lab on lab.id = attempt.lab_id
      join public.courses course on course.id = lab.course_id
      left join public.modules module on module.id = lab.module_id
      join public.profiles profile on profile.id = attempt.student_id
      left join auth.users auth_user on auth_user.id = attempt.student_id
      left join lateral (
        select
          section.id,
          section.code,
          section.name
        from public.cli_lab_assignments assignment
        join public.class_sections section
          on section.id = assignment.class_id
        join public.class_memberships membership
          on membership.class_id = section.id
        where assignment.lab_id = lab.id
          and membership.student_id = attempt.student_id
        order by section.name
        limit 1
      ) class_info on true
      where lab.created_by = v_user_id
        or v_role in ('admin', 'administrator')
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_instructor_cli_attempt_review(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_result jsonb;
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id,
      'labTitle', lab.title,
      'courseCode', course.code,
      'moduleCode', module.code,
      'deviceType', lab.device_type,
      'studentName', profile.full_name,
      'studentEmail', auth_user.email,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'scorePoints', attempt.score_points,
      'maximumPoints', attempt.maximum_points,
      'percentage', attempt.percentage,
      'passed', attempt.passed,
      'startedAt', attempt.started_at,
      'submittedAt', attempt.submitted_at,
      'state', attempt.session_state
    ),
    'criteria', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', criterion->>'type',
            'target', criterion->>'target',
            'expected', criterion->>'expected',
            'points', (criterion->>'points')::numeric,
            'met', public.cli_criterion_is_met(
              attempt.session_state,
              criterion
            ),
            'pointsAwarded',
            case
              when public.cli_criterion_is_met(
                attempt.session_state,
                criterion
              )
              then (criterion->>'points')::numeric
              else 0
            end
          )
        )
        from jsonb_array_elements(lab.grading_criteria)
          criterion
      ),
      '[]'::jsonb
    ),
    'commands', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sequence', command.sequence_number,
            'command', command.command_text,
            'modeBefore', command.mode_before,
            'modeAfter', command.mode_after,
            'accepted', command.accepted,
            'output', command.output_text,
            'enteredAt', command.entered_at
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
  join public.cli_labs lab on lab.id = attempt.lab_id
  join public.courses course on course.id = lab.course_id
  left join public.modules module on module.id = lab.module_id
  join public.profiles profile on profile.id = attempt.student_id
  left join auth.users auth_user on auth_user.id = attempt.student_id
  where attempt.id = p_attempt_id
    and (
      lab.created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if v_result is null then
    raise exception 'CLI attempt was not found or cannot be reviewed.';
  end if;

  return v_result;
end;
$$;

revoke all
on function public.cli_criterion_is_met(jsonb, jsonb)
from public;

revoke all
on function public.get_student_cli_history(integer)
from public;

revoke all
on function public.get_instructor_cli_results()
from public;

revoke all
on function public.get_instructor_cli_attempt_review(uuid)
from public;

grant execute
on function public.get_student_cli_history(integer)
to authenticated;

grant execute
on function public.get_instructor_cli_results()
to authenticated;

grant execute
on function public.get_instructor_cli_attempt_review(uuid)
to authenticated;
