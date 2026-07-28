-- CCNA ASSESSMENT SYSTEM
-- AUTO-SUBMIT AND GRADE EXPIRED QUIZ AND CLI ATTEMPTS
-- Requires migrations 003, 020, and 023.
-- =========================================================

create extension if not exists pg_cron;

create index if not exists quiz_attempts_pending_expiration_idx
on public.quiz_attempts(expires_at)
where status = 'in_progress';

create index if not exists cli_attempts_pending_expiration_idx
on public.cli_attempts(expires_at)
where status = 'in_progress';

create or replace function public.reconcile_expired_assessment_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_attempt public.quiz_attempts%rowtype;
  v_cli_attempt public.cli_attempts%rowtype;
  v_passing_score numeric(5,2);
  v_score numeric(10,2);
  v_maximum numeric(10,2);
  v_percentage numeric(5,2);
  v_passed boolean;
  v_quiz_count integer := 0;
  v_cli_count integer := 0;
begin
  -- Grade each overdue quiz from the answers that reached the server
  -- before the deadline. Row locks make concurrent reconciliation safe.
  for v_quiz_attempt in
    select attempt.*
    from public.quiz_attempts attempt
    where attempt.status = 'in_progress'
      and attempt.expires_at <= now()
    order by attempt.expires_at
    for update skip locked
  loop
    update public.quiz_attempt_answers answer
    set
      is_correct = option_row.is_correct,
      points_awarded = case
        when option_row.is_correct then attempt_question.points
        else 0
      end
    from
      public.question_options option_row,
      public.quiz_attempt_questions attempt_question
    where answer.selected_option_id = option_row.id
      and answer.attempt_question_id = attempt_question.id
      and attempt_question.attempt_id = v_quiz_attempt.id;

    select
      coalesce(sum(answer.points_awarded), 0),
      quiz.passing_score
    into
      v_score,
      v_passing_score
    from public.quizzes quiz
    left join public.quiz_attempt_questions attempt_question
      on attempt_question.attempt_id = v_quiz_attempt.id
    left join public.quiz_attempt_answers answer
      on answer.attempt_question_id = attempt_question.id
    where quiz.id = v_quiz_attempt.quiz_id
    group by quiz.passing_score;

    v_maximum := coalesce(v_quiz_attempt.maximum_points, 0);
    v_percentage := case
      when v_maximum > 0
        then round((coalesce(v_score, 0) / v_maximum) * 100, 2)
      else 0
    end;
    v_passed := v_percentage >= coalesce(v_passing_score, 0);

    update public.quiz_attempts
    set
      status = 'expired',
      submitted_at = coalesce(submitted_at, expires_at),
      score_points = coalesce(v_score, 0),
      percentage = v_percentage,
      passed = v_passed
    where id = v_quiz_attempt.id
      and status = 'in_progress';

    if found then
      v_quiz_count := v_quiz_count + 1;
    end if;
  end loop;

  -- Grade each overdue CLI practical from its last server-saved
  -- configuration state. Criteria are evaluated independently.
  for v_cli_attempt in
    select attempt.*
    from public.cli_attempts attempt
    where attempt.status = 'in_progress'
      and attempt.expires_at <= now()
    order by attempt.expires_at
    for update skip locked
  loop
    select
      coalesce(
        sum(
          case
            when public.cli_criterion_is_met(
              v_cli_attempt.session_state,
              criterion
            )
              then (criterion->>'points')::numeric
            else 0
          end
        ),
        0
      ),
      coalesce(sum((criterion->>'points')::numeric), 0)
    into
      v_score,
      v_maximum
    from jsonb_array_elements(
      coalesce(v_cli_attempt.criteria_snapshot, '[]'::jsonb)
    ) criterion;

    select lab.passing_score
    into v_passing_score
    from public.cli_labs lab
    where lab.id = v_cli_attempt.lab_id;

    v_percentage := case
      when v_maximum > 0
        then round((v_score / v_maximum) * 100, 2)
      else 0
    end;
    v_passed := v_percentage >= coalesce(v_passing_score, 0);

    update public.cli_attempts
    set
      status = 'expired',
      submitted_at = coalesce(submitted_at, expires_at),
      score_points = v_score,
      maximum_points = v_maximum,
      percentage = v_percentage,
      passed = v_passed
    where id = v_cli_attempt.id
      and status = 'in_progress';

    if found then
      v_cli_count := v_cli_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'quizAttemptsFinalized', v_quiz_count,
    'cliAttemptsFinalized', v_cli_count
  );
end;
$$;

revoke all
on function public.reconcile_expired_assessment_attempts()
from public;

grant execute
on function public.reconcile_expired_assessment_attempts()
to authenticated;

comment on function public.reconcile_expired_assessment_attempts()
is 'Grades overdue quiz and CLI attempts from their last server-saved state and removes them from active monitoring.';

-- Run independently of the website so attempts are finalized even when
-- every browser is closed. Re-running this migration updates the same job.
select cron.schedule(
  'ccna-auto-submit-expired-attempts',
  '* * * * *',
  $cron$
    select public.reconcile_expired_assessment_attempts();
  $cron$
);
