-- =========================================================
-- Phase 6.3: performance trends and learning-area analytics
-- =========================================================

create or replace function public.get_instructor_performance_trends()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  with quiz_completed as (
    select
      attempt.id,
      attempt.student_id,
      attempt.percentage,
      attempt.passed,
      coalesce(attempt.submitted_at, attempt.expires_at) as completed_at,
      quiz.course_id,
      quiz.module_id
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    where attempt.status in ('submitted', 'expired')
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
  ),
  cli_completed as (
    select
      attempt.id,
      attempt.student_id,
      attempt.percentage,
      attempt.passed,
      coalesce(attempt.submitted_at, attempt.expires_at) as completed_at,
      lab.course_id,
      lab.module_id
    from public.cli_attempts attempt
    join public.cli_labs lab on lab.id = attempt.lab_id
    where attempt.status in ('submitted', 'expired')
      and (
        lab.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
  ),
  trend_rows as (
    select
      'quiz'::text as assessment_type,
      date_trunc('week', completed_at)::date as period_start,
      count(*)::integer as attempt_count,
      count(distinct student_id)::integer as student_count,
      round(avg(percentage)::numeric, 2) as average_score,
      round(
        100 * count(*) filter (where passed = true)::numeric
          / nullif(count(*) filter (where passed is not null), 0),
        2
      ) as pass_rate
    from quiz_completed
    group by date_trunc('week', completed_at)::date

    union all

    select
      'cli'::text,
      date_trunc('week', completed_at)::date,
      count(*)::integer,
      count(distinct student_id)::integer,
      round(avg(percentage)::numeric, 2),
      round(
        100 * count(*) filter (where passed = true)::numeric
          / nullif(count(*) filter (where passed is not null), 0),
        2
      )
    from cli_completed
    group by date_trunc('week', completed_at)::date
  ),
  quiz_area_rows as (
    select
      question.course_id,
      coalesce(question.module_id, quiz.module_id) as module_id,
      count(attempt_question.id)::integer as presented_count,
      count(answer.id)::integer as response_count,
      count(answer.id) filter (where answer.is_correct = true)::integer
        as correct_count,
      count(distinct attempt.id)::integer as attempt_count,
      count(distinct attempt.student_id)::integer as student_count,
      round(
        100 * count(answer.id) filter (where answer.is_correct = true)::numeric
          / nullif(count(answer.id), 0),
        2
      ) as mastery_score
    from public.quiz_attempt_questions attempt_question
    join public.quiz_attempts attempt
      on attempt.id = attempt_question.attempt_id
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    join public.questions question
      on question.id = attempt_question.question_id
    left join public.quiz_attempt_answers answer
      on answer.attempt_question_id = attempt_question.id
    where attempt.status in ('submitted', 'expired')
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
    group by question.course_id, coalesce(question.module_id, quiz.module_id)
  ),
  cli_area_rows as (
    select
      completed.course_id,
      completed.module_id,
      count(*)::integer as attempt_count,
      count(distinct completed.student_id)::integer as student_count,
      round(avg(completed.percentage)::numeric, 2) as mastery_score,
      round(
        100 * count(*) filter (where completed.passed = true)::numeric
          / nullif(count(*) filter (where completed.passed is not null), 0),
        2
      ) as pass_rate
    from cli_completed completed
    group by completed.course_id, completed.module_id
  ),
  area_keys as (
    select course_id, module_id from quiz_area_rows
    union
    select course_id, module_id from cli_area_rows
  ),
  area_rows as (
    select
      course.code as course_code,
      course.title as course_title,
      module.code as module_code,
      module.title as module_title,
      coalesce(quiz_area.presented_count, 0) as quiz_presented_count,
      coalesce(quiz_area.response_count, 0) as quiz_response_count,
      coalesce(quiz_area.correct_count, 0) as quiz_correct_count,
      coalesce(quiz_area.attempt_count, 0) as quiz_attempt_count,
      coalesce(quiz_area.student_count, 0) as quiz_student_count,
      coalesce(quiz_area.mastery_score, 0) as quiz_mastery_score,
      coalesce(cli_area.attempt_count, 0) as cli_attempt_count,
      coalesce(cli_area.student_count, 0) as cli_student_count,
      coalesce(cli_area.mastery_score, 0) as cli_mastery_score,
      coalesce(cli_area.pass_rate, 0) as cli_pass_rate,
      case
        when quiz_area.attempt_count > 0 and cli_area.attempt_count > 0 then
          round((quiz_area.mastery_score + cli_area.mastery_score) / 2, 2)
        when quiz_area.attempt_count > 0 then quiz_area.mastery_score
        else coalesce(cli_area.mastery_score, 0)
      end as combined_mastery_score
    from area_keys area
    join public.courses course on course.id = area.course_id
    left join public.modules module on module.id = area.module_id
    left join quiz_area_rows quiz_area
      on quiz_area.course_id = area.course_id
      and quiz_area.module_id is not distinct from area.module_id
    left join cli_area_rows cli_area
      on cli_area.course_id = area.course_id
      and cli_area.module_id is not distinct from area.module_id
  )
  select jsonb_build_object(
    'trends', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'assessmentType', trend.assessment_type,
          'periodStart', trend.period_start,
          'attemptCount', trend.attempt_count,
          'studentCount', trend.student_count,
          'averageScore', coalesce(trend.average_score, 0),
          'passRate', coalesce(trend.pass_rate, 0)
        ) order by trend.period_start, trend.assessment_type
      ) from trend_rows trend),
      '[]'::jsonb
    ),
    'learningAreas', coalesce(
      (select jsonb_agg(
        jsonb_build_object(
          'courseCode', area.course_code,
          'courseTitle', area.course_title,
          'moduleCode', area.module_code,
          'moduleTitle', area.module_title,
          'quizPresentedCount', area.quiz_presented_count,
          'quizResponseCount', area.quiz_response_count,
          'quizCorrectCount', area.quiz_correct_count,
          'quizAttemptCount', area.quiz_attempt_count,
          'quizStudentCount', area.quiz_student_count,
          'quizMasteryScore', area.quiz_mastery_score,
          'cliAttemptCount', area.cli_attempt_count,
          'cliStudentCount', area.cli_student_count,
          'cliMasteryScore', area.cli_mastery_score,
          'cliPassRate', area.cli_pass_rate,
          'combinedMasteryScore', area.combined_mastery_score
        ) order by area.course_code, area.module_code nulls last
      ) from area_rows area),
      '[]'::jsonb
    )
  ) into v_result;

  return v_result;
end;
$$;

revoke all
on function public.get_instructor_performance_trends()
from public;

grant execute
on function public.get_instructor_performance_trends()
to authenticated;

comment on function public.get_instructor_performance_trends()
is 'Returns weekly quiz/CLI trends and course-module learning-area mastery for the current instructor.';

