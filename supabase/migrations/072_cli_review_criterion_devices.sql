-- Preserve criterion device identity in instructor review; requires migration 070.
begin;
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
  if not public.assessment_review_user_allowed(array['instructor', 'admin', 'administrator']) then
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
            'deviceId', value->>'deviceId',
            'type', value->>'type',
            'target', value->>'target',
            'expected', value->>'expected',
            'points', (value->>'points')::numeric,
            'met', public.cli_criterion_is_met(
              attempt.session_state,
              value
            ),
            'pointsAwarded',
            case
              when public.cli_criterion_is_met(
                attempt.session_state,
                value
              )
              then (value->>'points')::numeric
              else 0
            end
          )
          order by criterion_index
        )
        from jsonb_array_elements(
          attempt.criteria_snapshot
        ) with ordinality
          criterion(value, criterion_index)
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
    raise exception
      'CLI attempt was not found or cannot be reviewed.';
  end if;

  return v_result;
end;
$$;
revoke all on function public.get_instructor_cli_attempt_review(uuid) from public, anon;
grant execute on function public.get_instructor_cli_attempt_review(uuid) to authenticated;
commit;
