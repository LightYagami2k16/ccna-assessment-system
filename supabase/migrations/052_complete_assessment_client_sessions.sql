-- Complete browser-session monitoring for active quiz and CLI attempts.

create or replace function public.get_instructor_assessment_client_sessions()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;

  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'assessmentType', session.assessment_type,
        'attemptId', session.attempt_id,
        'clientLabel', session.client_label,
        'claimedAt', session.client_claimed_at,
        'heartbeatAt', session.client_heartbeat_at,
        'staleAfterSeconds', 60,
        'status', case
          when session.client_id is null then 'not_connected'
          when session.client_heartbeat_at > now() - interval '40 seconds'
            then 'connected'
          when session.client_heartbeat_at > now() - interval '60 seconds'
            then 'delayed'
          else 'stale'
        end
      )
      order by session.updated_at desc
    )
    from public.active_assessment_sessions session
    where session.expires_at > now()
      and (
        v_role in ('admin', 'administrator')
        or (
          session.assessment_type = 'quiz'
          and exists (
            select 1
            from public.quizzes quiz
            where quiz.id = session.assessment_id
              and quiz.created_by = v_user_id
          )
        )
        or (
          session.assessment_type = 'cli'
          and exists (
            select 1
            from public.cli_labs lab
            where lab.id = session.assessment_id
              and lab.created_by = v_user_id
          )
        )
      )
  ), '[]'::jsonb);
end;
$$;

revoke all
on function public.get_instructor_assessment_client_sessions()
from public;

grant execute
on function public.get_instructor_assessment_client_sessions()
to authenticated;

comment on function public.get_instructor_assessment_client_sessions()
is 'Returns instructor-scoped browser lease health for active quiz and CLI attempts.';
