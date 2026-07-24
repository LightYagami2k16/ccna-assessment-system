-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.3C: INSTRUCTOR RESULTS DASHBOARD
-- =========================================================

create or replace function public.get_instructor_attempts()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('instructor', 'admin')
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attemptId', attempt.id,
        'quizId', quiz.id,
        'quizTitle', quiz.title,
        'courseCode', course.code,
        'courseTitle', course.title,
        'moduleCode', module.code,
        'studentId', profile.id,
        'studentName', coalesce(
          nullif(trim(profile.full_name), ''),
          split_part(auth_user.email, '@', 1),
          'Unnamed student'
        ),
        'studentEmail', auth_user.email,
        'attemptNumber', attempt.attempt_number,
        'status', attempt.status,
        'startedAt', attempt.started_at,
        'expiresAt', attempt.expires_at,
        'submittedAt', attempt.submitted_at,
        'scorePoints', attempt.score_points,
        'maximumPoints', attempt.maximum_points,
        'percentage', attempt.percentage,
        'passed', attempt.passed,
        'answeredCount', (
          select count(answer.id)
          from public.quiz_attempt_questions attempt_question
          left join public.quiz_attempt_answers answer
            on answer.attempt_question_id = attempt_question.id
          where attempt_question.attempt_id = attempt.id
        ),
        'questionCount', (
          select count(*)
          from public.quiz_attempt_questions attempt_question
          where attempt_question.attempt_id = attempt.id
        ),
        'timeUsedSeconds', greatest(
          0,
          extract(
            epoch from (
              coalesce(
                attempt.submitted_at,
                least(now(), attempt.expires_at)
              ) - attempt.started_at
            )
          )::integer
        )
      )
      order by attempt.started_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
  join public.courses course
    on course.id = quiz.course_id
  left join public.modules module
    on module.id = quiz.module_id
  join public.profiles profile
    on profile.id = attempt.student_id
  left join auth.users auth_user
    on auth_user.id = profile.id;

  return v_result;
end;
$$;

create or replace function public.get_instructor_attempt_detail(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role::text in ('instructor', 'admin')
  ) then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1
    from public.quiz_attempts
    where id = p_attempt_id
  ) then
    raise exception 'Quiz attempt was not found.';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'attemptId', attempt.id,
      'quizTitle', quiz.title,
      'courseCode', course.code,
      'moduleCode', module.code,
      'studentName', coalesce(
        nullif(trim(profile.full_name), ''),
        split_part(auth_user.email, '@', 1),
        'Unnamed student'
      ),
      'studentEmail', auth_user.email,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'startedAt', attempt.started_at,
      'submittedAt', attempt.submitted_at,
      'scorePoints', attempt.score_points,
      'maximumPoints', attempt.maximum_points,
      'percentage', attempt.percentage,
      'passed', attempt.passed
    ),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'attemptQuestionId', attempt_question.id,
            'sortOrder', attempt_question.sort_order,
            'title', question.title,
            'questionText', question.question_text,
            'explanation', question.explanation,
            'points', attempt_question.points,
            'selectedOptionId', answer.selected_option_id,
            'selectedOptionText', selected_option.option_text,
            'isCorrect', answer.is_correct,
            'pointsAwarded', answer.points_awarded,
            'correctOptions', coalesce(
              (
                select jsonb_agg(
                  correct_option.option_text
                  order by correct_option.sort_order
                )
                from public.question_options correct_option
                where correct_option.question_id = question.id
                  and correct_option.is_correct = true
              ),
              '[]'::jsonb
            )
          )
          order by attempt_question.sort_order
        )
        from public.quiz_attempt_questions attempt_question
        join public.questions question
          on question.id = attempt_question.question_id
        left join public.quiz_attempt_answers answer
          on answer.attempt_question_id = attempt_question.id
        left join public.question_options selected_option
          on selected_option.id = answer.selected_option_id
        where attempt_question.attempt_id = attempt.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
  join public.courses course
    on course.id = quiz.course_id
  left join public.modules module
    on module.id = quiz.module_id
  join public.profiles profile
    on profile.id = attempt.student_id
  left join auth.users auth_user
    on auth_user.id = profile.id
  where attempt.id = p_attempt_id;

  return v_result;
end;
$$;

revoke all
on function public.get_instructor_attempts()
from public;

revoke all
on function public.get_instructor_attempt_detail(uuid)
from public;

grant execute
on function public.get_instructor_attempts()
to authenticated;

grant execute
on function public.get_instructor_attempt_detail(uuid)
to authenticated;
