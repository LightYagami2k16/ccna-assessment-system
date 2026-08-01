-- =========================================================
-- PHASE 5.2: ONE BROWSER/DEVICE PER ACTIVE ASSESSMENT
--
-- Migration 046 limits each student to one active assessment.
-- This migration adds a short-lived browser lease to that active
-- attempt. The owning tab refreshes the lease every 20 seconds;
-- another browser may take over only after 60 seconds without a
-- heartbeat or after the owner explicitly exits.
-- =========================================================

alter table public.active_assessment_sessions
  add column if not exists client_id text,
  add column if not exists client_label text,
  add column if not exists client_claimed_at timestamptz,
  add column if not exists client_heartbeat_at timestamptz;

create or replace function public.validate_assessment_client_id(
  p_client_id text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_client_id text := btrim(coalesce(p_client_id, ''));
begin
  if length(v_client_id) < 16
     or length(v_client_id) > 200
     or v_client_id !~ '^[A-Za-z0-9:_-]+$' then
    raise exception 'The browser session identifier is invalid.';
  end if;

  return v_client_id;
end;
$$;

create or replace function public.claim_assessment_client_session(
  p_assessment_type text,
  p_attempt_id uuid,
  p_client_id text,
  p_client_label text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_client_id text;
  v_session public.active_assessment_sessions%rowtype;
  v_takeover boolean := false;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  if p_assessment_type not in ('quiz', 'cli') then
    raise exception 'The assessment type is invalid.';
  end if;

  v_client_id := public.validate_assessment_client_id(p_client_id);
  perform public.reconcile_expired_assessment_attempts();

  select *
  into v_session
  from public.active_assessment_sessions
  where student_id = v_student_id
    and assessment_type = p_assessment_type
    and attempt_id = p_attempt_id
    and expires_at > now()
  for update;

  if not found then
    raise exception 'This assessment attempt is no longer active.';
  end if;

  if v_session.client_id is not null
     and v_session.client_id <> v_client_id
     and v_session.client_heartbeat_at > now() - interval '60 seconds' then
    raise exception using
      errcode = 'P0001',
      message = 'This assessment is already open in another browser or device.',
      detail = 'Only one browser session may control an active assessment.',
      hint = 'Close the assessment on the other browser or wait about one minute before trying again.';
  end if;

  v_takeover := v_session.client_id is not null
    and v_session.client_id <> v_client_id;

  update public.active_assessment_sessions
  set
    client_id = v_client_id,
    client_label = nullif(left(btrim(coalesce(p_client_label, '')), 120), ''),
    client_claimed_at = case
      when client_id = v_client_id then client_claimed_at
      else now()
    end,
    client_heartbeat_at = now(),
    updated_at = now()
  where student_id = v_student_id;

  return jsonb_build_object(
    'claimed', true,
    'takeover', v_takeover,
    'staleAfterSeconds', 60,
    'heartbeatAt', now()
  );
end;
$$;

create or replace function public.assert_assessment_client_session(
  p_assessment_type text,
  p_attempt_id uuid,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_client_id text;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  v_client_id := public.validate_assessment_client_id(p_client_id);

  update public.active_assessment_sessions
  set
    client_heartbeat_at = now(),
    updated_at = now()
  where student_id = v_student_id
    and assessment_type = p_assessment_type
    and attempt_id = p_attempt_id
    and client_id = v_client_id
    and expires_at > now();

  if not found then
    raise exception using
      errcode = 'P0001',
      message = 'This browser no longer controls the assessment session.',
      hint = 'Return to the assessment list and resume the attempt. If another browser owns it, close that session or wait about one minute.';
  end if;

  return true;
end;
$$;

create or replace function public.heartbeat_assessment_client_session(
  p_assessment_type text,
  p_attempt_id uuid,
  p_client_id text
)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.assert_assessment_client_session(
    p_assessment_type,
    p_attempt_id,
    p_client_id
  );
$$;

create or replace function public.release_assessment_client_session(
  p_assessment_type text,
  p_attempt_id uuid,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_client_id text;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  v_client_id := public.validate_assessment_client_id(p_client_id);

  update public.active_assessment_sessions
  set
    client_id = null,
    client_label = null,
    client_claimed_at = null,
    client_heartbeat_at = null,
    updated_at = now()
  where student_id = v_student_id
    and assessment_type = p_assessment_type
    and attempt_id = p_attempt_id
    and client_id = v_client_id;

  return found;
end;
$$;

-- Safe assessment wrappers. These verify the browser lease before
-- delegating to the existing answer-key-safe and grading functions.
create or replace function public.get_quiz_attempt_safe_v2(
  p_attempt_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'quiz', p_attempt_id, p_client_id
  );
  return public.get_quiz_attempt_safe(p_attempt_id);
end;
$$;

create or replace function public.save_quiz_answer_v3(
  p_attempt_id uuid,
  p_attempt_question_id uuid,
  p_selected_option_ids uuid[] default array[]::uuid[],
  p_answer_text text default null,
  p_client_id text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'quiz', p_attempt_id, p_client_id
  );
  return public.save_quiz_answer_v2(
    p_attempt_id,
    p_attempt_question_id,
    p_selected_option_ids,
    p_answer_text
  );
end;
$$;

create or replace function public.submit_quiz_attempt_v2(
  p_attempt_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'quiz', p_attempt_id, p_client_id
  );
  return public.submit_quiz_attempt(p_attempt_id);
end;
$$;

create or replace function public.get_cli_attempt_safe_v2(
  p_attempt_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'cli', p_attempt_id, p_client_id
  );
  return public.get_cli_attempt_safe(p_attempt_id);
end;
$$;

create or replace function public.save_cli_device_command_v2(
  p_attempt_id uuid,
  p_device_id text,
  p_command text,
  p_mode_before text,
  p_mode_after text,
  p_accepted boolean,
  p_output text,
  p_state jsonb,
  p_client_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'cli', p_attempt_id, p_client_id
  );
  return public.save_cli_device_command(
    p_attempt_id,
    p_device_id,
    p_command,
    p_mode_before,
    p_mode_after,
    p_accepted,
    p_output,
    p_state
  );
end;
$$;

create or replace function public.submit_cli_attempt_v2(
  p_attempt_id uuid,
  p_client_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.assert_assessment_client_session(
    'cli', p_attempt_id, p_client_id
  );
  return public.submit_cli_attempt(p_attempt_id);
end;
$$;

revoke all on function public.validate_assessment_client_id(text) from public;
revoke all on function public.claim_assessment_client_session(text, uuid, text, text) from public;
revoke all on function public.assert_assessment_client_session(text, uuid, text) from public;
revoke all on function public.heartbeat_assessment_client_session(text, uuid, text) from public;
revoke all on function public.release_assessment_client_session(text, uuid, text) from public;
revoke all on function public.get_quiz_attempt_safe_v2(uuid, text) from public;
revoke all on function public.save_quiz_answer_v3(uuid, uuid, uuid[], text, text) from public;
revoke all on function public.submit_quiz_attempt_v2(uuid, text) from public;
revoke all on function public.get_cli_attempt_safe_v2(uuid, text) from public;
revoke all on function public.save_cli_device_command_v2(uuid, text, text, text, text, boolean, text, jsonb, text) from public;
revoke all on function public.submit_cli_attempt_v2(uuid, text) from public;

-- Students must use the client-aware wrappers. Security-definer wrappers
-- can still invoke these underlying functions internally.
revoke execute on function public.get_quiz_attempt_safe(uuid) from authenticated;
revoke execute on function public.save_quiz_answer_v2(uuid, uuid, uuid[], text) from authenticated;
revoke execute on function public.submit_quiz_attempt(uuid) from authenticated;
revoke execute on function public.get_cli_attempt_safe(uuid) from authenticated;
revoke execute on function public.save_cli_device_command(uuid, text, text, text, text, boolean, text, jsonb) from authenticated;
revoke execute on function public.submit_cli_attempt(uuid) from authenticated;

grant execute on function public.claim_assessment_client_session(text, uuid, text, text) to authenticated;
grant execute on function public.heartbeat_assessment_client_session(text, uuid, text) to authenticated;
grant execute on function public.release_assessment_client_session(text, uuid, text) to authenticated;
grant execute on function public.get_quiz_attempt_safe_v2(uuid, text) to authenticated;
grant execute on function public.save_quiz_answer_v3(uuid, uuid, uuid[], text, text) to authenticated;
grant execute on function public.submit_quiz_attempt_v2(uuid, text) to authenticated;
grant execute on function public.get_cli_attempt_safe_v2(uuid, text) to authenticated;
grant execute on function public.save_cli_device_command_v2(uuid, text, text, text, text, boolean, text, jsonb, text) to authenticated;
grant execute on function public.submit_cli_attempt_v2(uuid, text) to authenticated;

-- Keep the underlying RPCs private from students while explicitly
-- allowing the SECURITY DEFINER wrapper owners to invoke them.
do $$
declare
  v_quiz_wrapper_owner text;
  v_cli_wrapper_owner text;
begin
  select pg_get_userbyid(proowner)
  into v_quiz_wrapper_owner
  from pg_proc
  where oid = 'public.get_quiz_attempt_safe_v2(uuid,text)'::regprocedure;

  select pg_get_userbyid(proowner)
  into v_cli_wrapper_owner
  from pg_proc
  where oid = 'public.get_cli_attempt_safe_v2(uuid,text)'::regprocedure;

  execute format(
    'grant execute on function public.get_quiz_attempt_safe(uuid) to %I',
    v_quiz_wrapper_owner
  );
  execute format(
    'grant execute on function public.save_quiz_answer_v2(uuid,uuid,uuid[],text) to %I',
    v_quiz_wrapper_owner
  );
  execute format(
    'grant execute on function public.submit_quiz_attempt(uuid) to %I',
    v_quiz_wrapper_owner
  );

  execute format(
    'grant execute on function public.get_cli_attempt_safe(uuid) to %I',
    v_cli_wrapper_owner
  );
  execute format(
    'grant execute on function public.save_cli_device_command(uuid,text,text,text,text,boolean,text,jsonb) to %I',
    v_cli_wrapper_owner
  );
  execute format(
    'grant execute on function public.submit_cli_attempt(uuid) to %I',
    v_cli_wrapper_owner
  );
end;
$$;

comment on function public.claim_assessment_client_session(text, uuid, text, text)
is 'Claims an active assessment for one browser tab, with stale takeover after 60 seconds.';

comment on function public.assert_assessment_client_session(text, uuid, text)
is 'Server-side guard used by student assessment read, save, and submit operations.';
