-- =========================================================
-- PHASE 5.2 REPAIR: TABLE-SAFE ACTIVE SESSION TRIGGER
--
-- Migration 046 installed one trigger function on both attempt
-- tables. A CASE expression referenced NEW.quiz_id and NEW.lab_id
-- in the same expression, but each table owns only one field.
-- This replacement uses table-specific IF branches.
-- =========================================================

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
    if tg_table_name = 'quiz_attempts' then
      v_assessment_type := 'quiz';
    elsif tg_table_name = 'cli_attempts' then
      v_assessment_type := 'cli';
    else
      raise exception 'Unsupported assessment attempt table: %',
        tg_table_name;
    end if;

    delete from public.active_assessment_sessions
    where student_id = old.student_id
      and assessment_type = v_assessment_type
      and attempt_id = old.id;

    return old;
  end if;

  -- NEW is a table-specific record. Separate branches prevent
  -- PostgreSQL from resolving a field that the current table lacks.
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

revoke all
on function public.enforce_one_active_assessment_session()
from public;

comment on function public.enforce_one_active_assessment_session()
is 'Maintains one cross-assessment lease without referencing fields absent from the triggering table.';
