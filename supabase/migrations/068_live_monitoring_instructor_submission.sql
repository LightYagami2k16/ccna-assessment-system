-- Live monitoring identity and instructor-ended attempts.
-- Requires migrations through 066. Independent of the quiz fullscreen exemption (067).
-- Apply only after local review; this file does not change existing results.
begin;

create table if not exists public.instructor_attempt_submissions (
  id bigint generated always as identity primary key,
  assessment_type text not null check (assessment_type in ('quiz', 'cli')),
  attempt_id uuid not null,
  assessment_id uuid not null,
  student_id uuid not null,
  performed_by uuid not null,
  performed_at timestamptz not null default now(),
  reason text not null default 'Instructor submitted from live monitoring',
  result jsonb not null,
  unique (assessment_type, attempt_id)
);
-- These are durable audit identities, intentionally retained after content deletion.
alter table public.instructor_attempt_submissions enable row level security;
revoke all on public.instructor_attempt_submissions from public, anon, authenticated;
revoke all on sequence public.instructor_attempt_submissions_id_seq from public, anon, authenticated;

create or replace function public.get_live_attempt_assessment_context()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_user_id is null or coalesce(v_role, '') not in ('instructor', 'admin', 'administrator')
    or exists (select 1 from auth.users where id = v_user_id and banned_until > now()) then
    raise exception 'Instructor access is required.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'assessmentType', context.assessment_type,
      'attemptId', context.attempt_id,
      'assessmentId', context.assessment_id,
      'studentId', context.student_id
    ))
    from (
      select 'quiz'::text as assessment_type, attempt.id as attempt_id,
        attempt.quiz_id as assessment_id, attempt.student_id
      from public.quiz_attempts attempt
      join public.quizzes quiz on quiz.id = attempt.quiz_id
      where attempt.status = 'in_progress'
        and (quiz.created_by = v_user_id or v_role in ('admin', 'administrator'))
      union all
      select 'cli', attempt.id, attempt.lab_id, attempt.student_id
      from public.cli_attempts attempt
      join public.cli_labs lab on lab.id = attempt.lab_id
      where attempt.status = 'in_progress'
        and (lab.created_by = v_user_id or v_role in ('admin', 'administrator'))
    ) context
  ), '[]'::jsonb);
end;
$$;

create or replace function public.instructor_submit_assessment_attempt(
  p_assessment_type text,
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
  v_assessment_id uuid;
  v_student_id uuid;
  v_quiz public.quiz_attempts%rowtype;
  v_cli public.cli_attempts%rowtype;
  v_status text;
  v_expires_at timestamptz;
  v_passing_score numeric;
  v_score numeric;
  v_maximum numeric;
  v_percentage numeric;
  v_result jsonb;
begin
  if v_user_id is null or coalesce(v_role, '') not in ('instructor', 'admin', 'administrator')
    or exists (select 1 from auth.users where id = v_user_id and banned_until > now()) then
    raise exception 'Instructor access is required.';
  end if;
  if coalesce(p_assessment_type, '') not in ('quiz', 'cli') or p_attempt_id is null then
    raise exception 'A valid assessment type and attempt are required.';
  end if;

  -- Authorize before locking anything. Do not trust IDs, student identity or
  -- scores supplied by the browser; ownership follows existing monitor scope.
  if p_assessment_type = 'quiz' then
    select attempt.quiz_id, attempt.student_id into v_assessment_id, v_student_id
    from public.quiz_attempts attempt join public.quizzes quiz on quiz.id = attempt.quiz_id
    where attempt.id = p_attempt_id
      and (quiz.created_by = v_user_id or v_role in ('admin', 'administrator'));
  else
    select attempt.lab_id, attempt.student_id into v_assessment_id, v_student_id
    from public.cli_attempts attempt join public.cli_labs lab on lab.id = attempt.lab_id
    where attempt.id = p_attempt_id
      and (lab.created_by = v_user_id or v_role in ('admin', 'administrator'));
  end if;
  if not found then raise exception 'Attempt was not found or you cannot submit it.'; end if;

  if p_assessment_type = 'quiz' then
    select * into v_quiz from public.quiz_attempts where id = p_attempt_id for update nowait;
    if not found then raise exception 'Attempt was not found or you cannot submit it.'; end if;
    select passing_score into v_passing_score from public.quizzes
    where id = v_quiz.quiz_id
      and (created_by = v_user_id or v_role in ('admin', 'administrator'));
    if not found then raise exception 'Attempt was not found or you cannot submit it.'; end if;
    v_status := v_quiz.status;
    v_expires_at := v_quiz.expires_at;
    v_maximum := coalesce(v_quiz.maximum_points, 0);
  else
    select * into v_cli from public.cli_attempts where id = p_attempt_id for update nowait;
    if not found then raise exception 'Attempt was not found or you cannot submit it.'; end if;
    select passing_score into v_passing_score from public.cli_labs
    where id = v_cli.lab_id
      and (created_by = v_user_id or v_role in ('admin', 'administrator'));
    if not found then raise exception 'Attempt was not found or you cannot submit it.'; end if;
    v_status := v_cli.status;
    v_expires_at := v_cli.expires_at;
  end if;

  -- Another instructor, the student or timeout may already have ended it.
  -- A retry must never regrade or overwrite the completed result.
  if v_status <> 'in_progress' then
    return jsonb_build_object('attemptId', p_attempt_id, 'status', v_status, 'alreadyCompleted', true);
  end if;
  -- Reconciliation locks attempt then lease; student writes lock lease first.
  -- Never wait while holding the conflicting attempt lock: fail atomically
  -- if either row is busy, and grade only after both nonblocking locks succeed.
  perform 1 from public.active_assessment_sessions
  where assessment_type = p_assessment_type and attempt_id = p_attempt_id
  for update nowait;
  if p_assessment_type = 'quiz' then
    v_score := public.grade_quiz_attempt_answers(p_attempt_id);
  else
    select coalesce(sum(case when public.cli_criterion_is_met(v_cli.session_state, criterion)
      then (criterion->>'points')::numeric else 0 end), 0),
      coalesce(sum((criterion->>'points')::numeric), 0)
    into v_score, v_maximum
    from jsonb_array_elements(coalesce(v_cli.criteria_snapshot, '[]'::jsonb)) criterion;
  end if;
  v_percentage := case when v_maximum > 0 then round((coalesce(v_score, 0) / v_maximum) * 100, 2) else 0 end;
  v_status := case when v_expires_at <= now() then 'expired' else 'submitted' end;
  if p_assessment_type = 'quiz' then
    update public.quiz_attempts set status = v_status, submitted_at = now(), score_points = coalesce(v_score, 0),
      percentage = v_percentage, passed = v_percentage >= coalesce(v_passing_score, 0)
    where id = p_attempt_id;
  else
    update public.cli_attempts set status = v_status, submitted_at = now(), score_points = coalesce(v_score, 0),
      maximum_points = v_maximum, percentage = v_percentage, passed = v_percentage >= coalesce(v_passing_score, 0)
    where id = p_attempt_id;
  end if;
  -- Existing status triggers also release this lease; explicit deletion makes
  -- the enforcement boundary clear and removes only this exact attempt.
  delete from public.active_assessment_sessions
  where assessment_type = p_assessment_type and attempt_id = p_attempt_id;
  v_result := jsonb_build_object('attemptId', p_attempt_id, 'assessmentType', p_assessment_type,
    'status', v_status, 'alreadyCompleted', false, 'scorePoints', coalesce(v_score, 0),
    'maximumPoints', v_maximum, 'percentage', v_percentage, 'submittedAt', now());
  insert into public.instructor_attempt_submissions
    (assessment_type, attempt_id, assessment_id, student_id, performed_by, result)
  values (p_assessment_type, p_attempt_id, v_assessment_id, v_student_id, v_user_id, v_result);
  return v_result;
exception when lock_not_available then
  raise exception using errcode = '55P03',
    message = 'This attempt is being saved or finalized. Refresh and try again.';
end;
$$;

revoke all on function public.get_live_attempt_assessment_context() from public, anon;
revoke all on function public.instructor_submit_assessment_attempt(text, uuid) from public, anon;
grant execute on function public.get_live_attempt_assessment_context() to authenticated;
grant execute on function public.instructor_submit_assessment_attempt(text, uuid) to authenticated;
comment on function public.instructor_submit_assessment_attempt(text, uuid)
is 'Authorized instructor submission using server-saved work, with ownership checks, lease serialization, grading and audit in one transaction.';
commit;
