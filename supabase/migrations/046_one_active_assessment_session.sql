-- =========================================================
-- PHASE 5.1: ONE ACTIVE ASSESSMENT SESSION PER STUDENT
--
-- A student may resume the same active attempt, but may not
-- start another quiz or CLI practical until the active attempt
-- is submitted or expires.
--
-- A shared lease table provides a real cross-table uniqueness
-- boundary. Its primary key also serializes simultaneous quiz
-- and CLI start requests for the same student.
-- =========================================================

create table if not exists public.active_assessment_sessions (
  student_id uuid primary key
    references public.profiles(id)
    on delete cascade,
  assessment_type text not null
    check (assessment_type in ('quiz', 'cli')),
  attempt_id uuid not null,
  assessment_id uuid not null,
  started_at timestamptz not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.active_assessment_sessions
enable row level security;

revoke all
on public.active_assessment_sessions
from anon, authenticated;

-- Preserve the newest valid session if this migration is installed
-- while a student already has an attempt in progress.
insert into public.active_assessment_sessions (
  student_id,
  assessment_type,
  attempt_id,
  assessment_id,
  started_at,
  expires_at
)
select distinct on (active_attempt.student_id)
  active_attempt.student_id,
  active_attempt.assessment_type,
  active_attempt.attempt_id,
  active_attempt.assessment_id,
  active_attempt.started_at,
  active_attempt.expires_at
from (
  select
    attempt.student_id,
    'quiz'::text as assessment_type,
    attempt.id as attempt_id,
    attempt.quiz_id as assessment_id,
    attempt.started_at,
    attempt.expires_at
  from public.quiz_attempts attempt
  where attempt.status = 'in_progress'
    and attempt.expires_at > now()

  union all

  select
    attempt.student_id,
    'cli'::text as assessment_type,
    attempt.id as attempt_id,
    attempt.lab_id as assessment_id,
    attempt.started_at,
    attempt.expires_at
  from public.cli_attempts attempt
  where attempt.status = 'in_progress'
    and attempt.expires_at > now()
) active_attempt
order by
  active_attempt.student_id,
  active_attempt.started_at desc
on conflict (student_id)
do update set
  assessment_type = excluded.assessment_type,
  attempt_id = excluded.attempt_id,
  assessment_id = excluded.assessment_id,
  started_at = excluded.started_at,
  expires_at = excluded.expires_at,
  updated_at = now();

create or replace function public.describe_active_assessment_session(
  p_assessment_type text,
  p_assessment_id uuid
)
returns text
language sql
security definer
set search_path = public
stable
as $$
  select case
    when p_assessment_type = 'quiz' then coalesce(
      (
        select quiz.title
        from public.quizzes quiz
        where quiz.id = p_assessment_id
      ),
      'Quiz'
    )
    else coalesce(
      (
        select lab.title
        from public.cli_labs lab
        where lab.id = p_assessment_id
      ),
      'CLI practical'
    )
  end;
$$;

create or replace function public.enforce_one_active_assessment_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_assessment_type text;
  v_assessment_id uuid;
  v_active public.active_assessment_sessions%rowtype;
  v_active_title text;
begin
  if tg_op = 'DELETE' then
    v_assessment_type := case
      when tg_table_name = 'quiz_attempts' then 'quiz'
      else 'cli'
    end;

    delete from public.active_assessment_sessions
    where student_id = old.student_id
      and assessment_type = v_assessment_type
      and attempt_id = old.id;

    return old;
  end if;

  -- NEW is a table-specific record. Use separate branches so PostgreSQL
  -- never tries to resolve lab_id on quiz_attempts or quiz_id on cli_attempts.
  if tg_table_name = 'quiz_attempts' then
    v_assessment_type := 'quiz';
    v_assessment_id := new.quiz_id;
  elsif tg_table_name = 'cli_attempts' then
    v_assessment_type := 'cli';
    v_assessment_id := new.lab_id;
  else
    raise exception 'Unsupported assessment attempt table: %',
      tg_table_name;
  end if;

  if new.status <> 'in_progress'
     or new.expires_at <= now() then
    delete from public.active_assessment_sessions
    where student_id = new.student_id
      and assessment_type = v_assessment_type
      and attempt_id = new.id;

    return new;
  end if;

  delete from public.active_assessment_sessions
  where student_id = new.student_id
    and expires_at <= now();

  insert into public.active_assessment_sessions (
    student_id,
    assessment_type,
    attempt_id,
    assessment_id,
    started_at,
    expires_at,
    updated_at
  )
  values (
    new.student_id,
    v_assessment_type,
    new.id,
    v_assessment_id,
    new.started_at,
    new.expires_at,
    now()
  )
  on conflict (student_id)
  do update set
    assessment_id = excluded.assessment_id,
    started_at = excluded.started_at,
    expires_at = excluded.expires_at,
    updated_at = now()
  where active_assessment_sessions.assessment_type =
          excluded.assessment_type
    and active_assessment_sessions.attempt_id =
          excluded.attempt_id;

  if found then
    return new;
  end if;

  select *
  into v_active
  from public.active_assessment_sessions
  where student_id = new.student_id;

  v_active_title :=
    public.describe_active_assessment_session(
      v_active.assessment_type,
      v_active.assessment_id
    );

  raise exception using
    errcode = 'P0001',
    message = format(
      'You already have an active %s: "%s". Resume or submit it before starting another assessment.',
      case
        when v_active.assessment_type = 'quiz' then 'quiz'
        else 'CLI practical'
      end,
      v_active_title
    ),
    detail = format(
      'Active assessment type: %s. Active attempt ID: %s.',
      v_active.assessment_type,
      v_active.attempt_id
    ),
    hint = case
      when v_active.assessment_type = 'quiz'
        then 'Open Available quizzes and resume the active quiz.'
      else 'Open CLI practicals and resume the active practical.'
    end;
end;
$$;

drop trigger if exists quiz_attempts_one_active_session
on public.quiz_attempts;

create trigger quiz_attempts_one_active_session
before insert or update of status, expires_at
on public.quiz_attempts
for each row
execute function public.enforce_one_active_assessment_session();

drop trigger if exists quiz_attempts_release_active_session
on public.quiz_attempts;

create trigger quiz_attempts_release_active_session
after delete
on public.quiz_attempts
for each row
execute function public.enforce_one_active_assessment_session();

drop trigger if exists cli_attempts_one_active_session
on public.cli_attempts;

create trigger cli_attempts_one_active_session
before insert or update of status, expires_at
on public.cli_attempts
for each row
execute function public.enforce_one_active_assessment_session();

drop trigger if exists cli_attempts_release_active_session
on public.cli_attempts;

create trigger cli_attempts_release_active_session
after delete
on public.cli_attempts
for each row
execute function public.enforce_one_active_assessment_session();

create or replace function public.get_student_active_assessment_session()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_session public.active_assessment_sessions%rowtype;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  perform public.reconcile_expired_assessment_attempts();

  delete from public.active_assessment_sessions
  where student_id = v_student_id
    and expires_at <= now();

  select *
  into v_session
  from public.active_assessment_sessions
  where student_id = v_student_id;

  if not found then
    return null;
  end if;

  return jsonb_build_object(
    'type', v_session.assessment_type,
    'attemptId', v_session.attempt_id,
    'assessmentId', v_session.assessment_id,
    'title', public.describe_active_assessment_session(
      v_session.assessment_type,
      v_session.assessment_id
    ),
    'startedAt', v_session.started_at,
    'expiresAt', v_session.expires_at
  );
end;
$$;

revoke all
on function public.describe_active_assessment_session(text, uuid)
from public;

revoke all
on function public.enforce_one_active_assessment_session()
from public;

revoke all
on function public.get_student_active_assessment_session()
from public;

grant execute
on function public.get_student_active_assessment_session()
to authenticated;

comment on table public.active_assessment_sessions
is 'The single active quiz or CLI attempt lease held by each student.';

comment on function public.enforce_one_active_assessment_session()
is 'Maintains the cross-assessment lease and prevents concurrent active attempts.';

comment on function public.get_student_active_assessment_session()
is 'Returns the signed-in student''s active assessment without exposing answer keys.';
