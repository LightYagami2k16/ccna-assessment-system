-- =========================================================
-- Phase 6.2: instructor question-level analytics
-- =========================================================

create or replace function public.get_instructor_question_analytics()
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
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  with visible_responses as (
    select
      attempt_question.id as attempt_question_id,
      attempt_question.question_id,
      attempt_question.time_spent_seconds,
      answer.id as answer_id,
      answer.is_correct,
      answer.selected_option_id,
      answer.selected_option_ids
    from public.quiz_attempt_questions attempt_question
    join public.quiz_attempts attempt
      on attempt.id = attempt_question.attempt_id
    join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    left join public.quiz_attempt_answers answer
      on answer.attempt_question_id = attempt_question.id
    where attempt.status in ('submitted', 'expired')
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
  ),
  question_totals as (
    select
      question.id,
      question.title,
      question.question_text,
      question.question_type::text as question_type,
      question.difficulty,
      question.points,
      course.code as course_code,
      course.title as course_title,
      module.code as module_code,
      module.title as module_title,
      count(response.attempt_question_id)::integer as attempt_count,
      count(response.answer_id)::integer as answered_count,
      count(response.answer_id) filter (
        where response.is_correct = true
      )::integer as correct_count,
      count(response.answer_id) filter (
        where response.is_correct = false
      )::integer as incorrect_count,
      count(response.attempt_question_id) filter (
        where response.answer_id is null
      )::integer as unanswered_count,
      coalesce(
        round(avg(response.time_spent_seconds)::numeric, 2),
        0
      ) as average_time_seconds
    from visible_responses response
    join public.questions question
      on question.id = response.question_id
    join public.courses course
      on course.id = question.course_id
    left join public.modules module
      on module.id = question.module_id
    group by
      question.id,
      question.title,
      question.question_text,
      question.question_type,
      question.difficulty,
      question.points,
      course.code,
      course.title,
      module.code,
      module.title
  )
  select jsonb_build_object(
    'questions', coalesce(
      jsonb_agg(
        jsonb_build_object(
          'questionId', total.id,
          'title', total.title,
          'questionText', total.question_text,
          'questionType', total.question_type,
          'difficulty', total.difficulty,
          'points', total.points,
          'courseCode', total.course_code,
          'courseTitle', total.course_title,
          'moduleCode', total.module_code,
          'moduleTitle', total.module_title,
          'attemptCount', total.attempt_count,
          'answeredCount', total.answered_count,
          'correctCount', total.correct_count,
          'incorrectCount', total.incorrect_count,
          'unansweredCount', total.unanswered_count,
          'accuracyPercentage', case
            when total.answered_count > 0 then round(
              (total.correct_count::numeric / total.answered_count) * 100,
              2
            )
            else 0
          end,
          'responseRate', case
            when total.attempt_count > 0 then round(
              (total.answered_count::numeric / total.attempt_count) * 100,
              2
            )
            else 0
          end,
          'averageTimeSeconds', total.average_time_seconds,
          'performanceBand', case
            when total.answered_count = 0 then 'No data'
            when total.correct_count::numeric / total.answered_count >= 0.80
              then 'Strong'
            when total.correct_count::numeric / total.answered_count >= 0.50
              then 'Developing'
            else 'Needs review'
          end,
          'optionDistribution', case
            when total.question_type = 'identification' then '[]'::jsonb
            else coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'optionId', option_row.id,
                    'optionText', option_row.option_text,
                    'isCorrect', option_row.is_correct,
                    'selectionCount', (
                      select count(*)::integer
                      from visible_responses selection
                      where selection.question_id = total.id
                        and (
                          selection.selected_option_id = option_row.id
                          or option_row.id = any(
                            coalesce(
                              selection.selected_option_ids,
                              '{}'::uuid[]
                            )
                          )
                        )
                    )
                  )
                  order by option_row.sort_order, option_row.id
                )
                from public.question_options option_row
                where option_row.question_id = total.id
              ),
              '[]'::jsonb
            )
          end
        )
        order by
          total.incorrect_count desc,
          total.unanswered_count desc,
          total.course_code,
          total.module_code nulls last,
          total.title
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from question_totals total;

  return v_result;
end;
$$;

revoke all
on function public.get_instructor_question_analytics()
from public;

grant execute
on function public.get_instructor_question_analytics()
to authenticated;

comment on function public.get_instructor_question_analytics()
is 'Returns aggregated question performance for quizzes owned by the current instructor, or all quizzes for administrators.';

