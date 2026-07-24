-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.6: STUDENT RECENT QUIZ RESULTS
-- =========================================================

create or replace function public.get_student_recent_quiz_results(
  p_limit integer default 10
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_limit integer := least(greatest(coalesce(p_limit, 10), 1), 50);
  v_result jsonb;
begin
  if v_student_id is null
     or public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attemptId', recent_attempt.id,
        'quizId', recent_attempt.quiz_id,
        'quizTitle', recent_attempt.quiz_title,
        'courseCode', recent_attempt.course_code,
        'moduleCode', recent_attempt.module_code,
        'attemptNumber', recent_attempt.attempt_number,
        'status', recent_attempt.status,
        'startedAt', recent_attempt.started_at,
        'submittedAt', recent_attempt.submitted_at,
        'scorePoints', recent_attempt.score_points,
        'maximumPoints', recent_attempt.maximum_points,
        'percentage', recent_attempt.percentage,
        'passed', recent_attempt.passed
      )
      order by coalesce(
        recent_attempt.submitted_at,
        recent_attempt.started_at
      ) desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      attempt.id,
      attempt.quiz_id,
      quiz.title as quiz_title,
      course.code as course_code,
      module.code as module_code,
      attempt.attempt_number,
      attempt.status,
      attempt.started_at,
      attempt.submitted_at,
      attempt.score_points,
      attempt.maximum_points,
      attempt.percentage,
      attempt.passed
    from public.quiz_attempts attempt
    join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    join public.courses course
      on course.id = quiz.course_id
    left join public.modules module
      on module.id = quiz.module_id
    where attempt.student_id = v_student_id
      and attempt.status in ('submitted', 'expired')
    order by coalesce(attempt.submitted_at, attempt.started_at) desc
    limit v_limit
  ) recent_attempt;

  return v_result;
end;
$$;

revoke all
on function public.get_student_recent_quiz_results(integer)
from public;

grant execute
on function public.get_student_recent_quiz_results(integer)
to authenticated;

