-- =========================================================
-- PHASE 5.2 REPAIR: SECURE WRAPPER EXECUTION PERMISSIONS
--
-- Migration 047 removed direct student access to attempt RPCs.
-- The client-aware SECURITY DEFINER wrappers still need explicit
-- permission to invoke those protected functions. Permission is
-- granted only to each wrapper's owner, not to students.
-- =========================================================

alter function public.get_quiz_attempt_safe_v2(uuid, text)
security definer;
alter function public.save_quiz_answer_v3(uuid, uuid, uuid[], text, text)
security definer;
alter function public.submit_quiz_attempt_v2(uuid, text)
security definer;
alter function public.get_cli_attempt_safe_v2(uuid, text)
security definer;
alter function public.save_cli_device_command_v2(
  uuid, text, text, text, text, boolean, text, jsonb, text
)
security definer;
alter function public.submit_cli_attempt_v2(uuid, text)
security definer;

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

revoke execute
on function public.get_quiz_attempt_safe(uuid)
from authenticated;
revoke execute
on function public.save_quiz_answer_v2(uuid, uuid, uuid[], text)
from authenticated;
revoke execute
on function public.submit_quiz_attempt(uuid)
from authenticated;
revoke execute
on function public.get_cli_attempt_safe(uuid)
from authenticated;
revoke execute
on function public.save_cli_device_command(
  uuid, text, text, text, text, boolean, text, jsonb
)
from authenticated;
revoke execute
on function public.submit_cli_attempt(uuid)
from authenticated;

comment on function public.get_quiz_attempt_safe_v2(uuid, text)
is 'Client-session-protected quiz reader with private access to the underlying safe reader.';

comment on function public.get_cli_attempt_safe_v2(uuid, text)
is 'Client-session-protected CLI reader with private access to the underlying safe reader.';
