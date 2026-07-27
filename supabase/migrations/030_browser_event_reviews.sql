-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- MIGRATION 030
-- INSTRUCTOR BROWSER-EVENT REVIEWS FOR QUIZZES AND CLI LABS
-- Requires migrations 011 and 021.
-- =========================================================

create or replace function public.get_instructor_browser_events(
  p_attempt_id uuid,
  p_attempt_type text
)
returns jsonb
language plpgsql
stable
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

  if p_attempt_type = 'quiz' then
    select jsonb_build_object(
      'attempt', jsonb_build_object(
        'id', attempt.id,
        'attemptType', 'quiz',
        'assessmentTitle', quiz.title,
        'attemptNumber', attempt.attempt_number,
        'studentName', coalesce(
          nullif(trim(profile.full_name), ''),
          split_part(auth_user.email, '@', 1),
          'Unnamed student'
        ),
        'studentEmail', auth_user.email,
        'startedAt', attempt.started_at,
        'submittedAt', attempt.submitted_at
      ),
      'events', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', event.id,
              'eventType', event.event_type,
              'occurredAt', event.occurred_at,
              'details', event.details
            )
            order by event.occurred_at desc
          )
          from public.exam_integrity_events event
          where event.attempt_id = attempt.id
        ),
        '[]'::jsonb
      )
    )
    into v_result
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    join public.profiles profile on profile.id = attempt.student_id
    left join auth.users auth_user on auth_user.id = attempt.student_id
    where attempt.id = p_attempt_id
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      );
  elsif p_attempt_type = 'cli' then
    select jsonb_build_object(
      'attempt', jsonb_build_object(
        'id', attempt.id,
        'attemptType', 'cli',
        'assessmentTitle', lab.title,
        'attemptNumber', attempt.attempt_number,
        'studentName', coalesce(
          nullif(trim(profile.full_name), ''),
          split_part(auth_user.email, '@', 1),
          'Unnamed student'
        ),
        'studentEmail', auth_user.email,
        'startedAt', attempt.started_at,
        'submittedAt', attempt.submitted_at
      ),
      'events', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', event.id,
              'eventType', event.event_type,
              'occurredAt', event.occurred_at,
              'details', event.details
            )
            order by event.occurred_at desc
          )
          from public.cli_integrity_events event
          where event.attempt_id = attempt.id
        ),
        '[]'::jsonb
      )
    )
    into v_result
    from public.cli_attempts attempt
    join public.cli_labs lab on lab.id = attempt.lab_id
    join public.profiles profile on profile.id = attempt.student_id
    left join auth.users auth_user on auth_user.id = attempt.student_id
    where attempt.id = p_attempt_id
      and (
        lab.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      );
  else
    raise exception 'Attempt type must be quiz or cli.';
  end if;

  if v_result is null then
    raise exception 'Attempt was not found or cannot be reviewed.';
  end if;

  return v_result;
end;
$$;

revoke all
on function public.get_instructor_browser_events(uuid, text)
from public;

grant execute
on function public.get_instructor_browser_events(uuid, text)
to authenticated;
