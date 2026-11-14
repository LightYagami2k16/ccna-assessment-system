-- Fullscreen is optional for quizzes. Ignore exits from older clients and
-- exclude historical fullscreen exits from the quiz incident limit.
create or replace function public.record_exam_integrity_event(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_quiz_id uuid;
  v_behavior text := 'warn';
  v_limit integer := 3;
  v_max_hidden integer := 60;
  v_incidents integer := 0;
  v_away_ms bigint := coalesce((p_details->>'awayDurationMs')::bigint, 0);
  v_auto_submit boolean := false;
  v_reason text := null;
begin
  if p_event_type not in (
    'page_hidden', 'page_visible', 'window_blur', 'window_focus',
    'fullscreen_exited', 'connection_lost', 'connection_restored'
  ) then raise exception 'Unsupported integrity event.'; end if;

  select attempt.quiz_id into v_quiz_id
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.student_id = v_student_id
    and attempt.status = 'in_progress';
  if not found then raise exception 'Active quiz attempt was not found.'; end if;

  if p_event_type = 'fullscreen_exited' then
    select count(*) into v_incidents
    from public.exam_integrity_events event
    where event.attempt_id = p_attempt_id
      and event.event_type = 'page_hidden';

    return jsonb_build_object(
      'recorded', false,
      'behavior', 'monitor',
      'incidentCount', v_incidents,
      'autoSubmitted', false,
      'reason', null
    );
  end if;

  insert into public.exam_integrity_events
    (attempt_id, student_id, event_type, details)
  values
    (p_attempt_id, v_student_id, p_event_type, coalesce(p_details, '{}'::jsonb));

  select policy.behavior, policy.incident_limit, policy.max_hidden_seconds
  into v_behavior, v_limit, v_max_hidden
  from public.assessment_integrity_policies policy
  where policy.assessment_type = 'quiz' and policy.assessment_id = v_quiz_id;
  v_behavior := coalesce(v_behavior, 'warn');
  v_limit := coalesce(v_limit, 3);
  v_max_hidden := coalesce(v_max_hidden, 60);

  select count(*) into v_incidents
  from public.exam_integrity_events event
  where event.attempt_id = p_attempt_id
    and event.event_type = 'page_hidden';

  if v_behavior = 'auto_submit' and v_incidents >= v_limit then
    v_auto_submit := true;
    v_reason := 'incident_limit';
  elsif v_behavior = 'auto_submit'
    and p_event_type = 'page_visible'
    and v_away_ms >= v_max_hidden * 1000 then
    v_auto_submit := true;
    v_reason := 'time_away_limit';
  end if;

  if v_auto_submit then
    perform public.submit_quiz_attempt(p_attempt_id);
    delete from public.active_assessment_sessions
    where assessment_type = 'quiz' and attempt_id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'behavior', v_behavior,
    'incidentCount', v_incidents,
    'autoSubmitted', v_auto_submit,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.record_exam_integrity_event(uuid, text, jsonb) from public;
grant execute on function public.record_exam_integrity_event(uuid, text, jsonb) to authenticated;
