-- =========================================================
-- PHASE 5: QUIZ QUESTION TIME TRACKING
--
-- Counts active, visible time per question. The browser reports
-- short increments, while the server validates attempt ownership,
-- the active browser lease, and the attempt's total elapsed time.
-- =========================================================

alter table public.quiz_attempt_questions
  add column if not exists time_spent_seconds integer not null default 0;

alter table public.quiz_attempt_questions
  drop constraint if exists quiz_attempt_questions_time_spent_nonnegative;

alter table public.quiz_attempt_questions
  add constraint quiz_attempt_questions_time_spent_nonnegative
  check (time_spent_seconds >= 0);

create or replace function public.record_quiz_question_time(
  p_attempt_id uuid,
  p_attempt_question_id uuid,
  p_elapsed_seconds integer,
  p_client_id text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.quiz_attempts%rowtype;
  v_elapsed_limit integer;
  v_already_recorded integer;
  v_seconds_to_add integer;
  v_total integer;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  if p_elapsed_seconds is null
     or p_elapsed_seconds < 1
     or p_elapsed_seconds > 3600 then
    raise exception 'The question-time increment is invalid.';
  end if;

  perform public.assert_assessment_client_session(
    'quiz', p_attempt_id, p_client_id
  );

  select attempt.*
  into v_attempt
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.student_id = auth.uid()
    and attempt.status = 'in_progress'
    and attempt.expires_at > now()
  for update;

  if not found then
    raise exception 'The quiz attempt is no longer active.';
  end if;

  if not exists (
    select 1
    from public.quiz_attempt_questions attempt_question
    where attempt_question.id = p_attempt_question_id
      and attempt_question.attempt_id = p_attempt_id
  ) then
    raise exception 'The question does not belong to this attempt.';
  end if;

  v_elapsed_limit := greatest(
    0,
    extract(
      epoch from (least(now(), v_attempt.expires_at) - v_attempt.started_at)
    )::integer
  );

  select coalesce(sum(time_spent_seconds), 0)::integer
  into v_already_recorded
  from public.quiz_attempt_questions
  where attempt_id = p_attempt_id;

  v_seconds_to_add := least(
    p_elapsed_seconds,
    greatest(0, v_elapsed_limit - v_already_recorded)
  );

  update public.quiz_attempt_questions
  set time_spent_seconds = time_spent_seconds + v_seconds_to_add
  where id = p_attempt_question_id
    and attempt_id = p_attempt_id
  returning time_spent_seconds into v_total;

  return v_total;
end;
$$;

create or replace function public.get_instructor_quiz_question_times(
  p_attempt_id uuid
)
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

  if not exists (
    select 1
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    where attempt.id = p_attempt_id
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
  ) then
    raise exception 'Quiz attempt was not found.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attemptQuestionId', attempt_question.id,
        'timeSpentSeconds', attempt_question.time_spent_seconds
      )
      order by attempt_question.sort_order
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quiz_attempt_questions attempt_question
  where attempt_question.attempt_id = p_attempt_id;

  return v_result;
end;
$$;

revoke all
on function public.record_quiz_question_time(uuid, uuid, integer, text)
from public;

revoke all
on function public.get_instructor_quiz_question_times(uuid)
from public;

grant execute
on function public.record_quiz_question_time(uuid, uuid, integer, text)
to authenticated;

grant execute
on function public.get_instructor_quiz_question_times(uuid)
to authenticated;

comment on function public.record_quiz_question_time(uuid, uuid, integer, text)
is 'Adds validated active-visible seconds to one question in a student quiz attempt.';

comment on function public.get_instructor_quiz_question_times(uuid)
is 'Returns per-question time totals for an instructor-owned quiz attempt.';
