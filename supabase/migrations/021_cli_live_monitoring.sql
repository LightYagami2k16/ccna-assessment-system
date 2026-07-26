-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.1: CLI PRACTICAL LIVE MONITORING
-- Requires migration 020.
-- =========================================================

create table if not exists public.cli_integrity_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null
    references public.cli_attempts(id)
    on delete cascade,
  student_id uuid not null
    references public.profiles(id)
    on delete cascade,
  event_type text not null
    check (
      event_type in (
        'page_hidden',
        'page_visible',
        'window_blur',
        'window_focus',
        'fullscreen_exited',
        'connection_lost',
        'connection_restored'
      )
    ),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists cli_integrity_events_attempt_idx
on public.cli_integrity_events(attempt_id, occurred_at desc);

alter table public.cli_integrity_events enable row level security;
grant select on public.cli_integrity_events to authenticated;

create policy "Instructors view CLI integrity events"
on public.cli_integrity_events
for select
to authenticated
using (
  exists (
    select 1
    from public.cli_attempts attempt
    join public.cli_labs lab on lab.id = attempt.lab_id
    where attempt.id = cli_integrity_events.attempt_id
      and (
        lab.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  )
);

create or replace function public.record_cli_integrity_event(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if p_event_type not in (
    'page_hidden',
    'page_visible',
    'window_blur',
    'window_focus',
    'fullscreen_exited',
    'connection_lost',
    'connection_restored'
  ) then
    raise exception 'Unsupported integrity event.';
  end if;

  if not exists (
    select 1
    from public.cli_attempts
    where id = p_attempt_id
      and student_id = v_student_id
      and status = 'in_progress'
  ) then
    raise exception 'Active CLI practical attempt was not found.';
  end if;

  insert into public.cli_integrity_events (
    attempt_id,
    student_id,
    event_type,
    details
  )
  values (
    p_attempt_id,
    v_student_id,
    p_event_type,
    coalesce(p_details, '{}'::jsonb)
  );

  return true;
end;
$$;

create or replace function public.get_cli_live_monitoring_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'attemptId', attempt.id,
          'assessmentType', 'cli',
          'assessmentTitle', lab.title,
          'quizTitle', lab.title,
          'deviceType', lab.device_type,
          'courseCode', course.code,
          'studentName', profile.full_name,
          'studentEmail', auth_user.email,
          'startedAt', attempt.started_at,
          'expiresAt', attempt.expires_at,
          'commandCount', (
            select count(*)
            from public.cli_commands command
            where command.attempt_id = attempt.id
          ),
          'eventCount', (
            select count(*)
            from public.cli_integrity_events event
            where event.attempt_id = attempt.id
          ),
          'latestEvent', (
            select jsonb_build_object(
              'type', event.event_type,
              'occurredAt', event.occurred_at,
              'details', event.details
            )
            from public.cli_integrity_events event
            where event.attempt_id = attempt.id
            order by event.occurred_at desc
            limit 1
          )
        )
        order by attempt.started_at desc
      )
      from public.cli_attempts attempt
      join public.cli_labs lab on lab.id = attempt.lab_id
      join public.courses course on course.id = lab.course_id
      join public.profiles profile on profile.id = attempt.student_id
      left join auth.users auth_user on auth_user.id = attempt.student_id
      where attempt.status = 'in_progress'
        and (
          lab.created_by = v_user_id
          or v_role in ('admin', 'administrator')
        )
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all
on function public.record_cli_integrity_event(uuid, text, jsonb)
from public;

revoke all
on function public.get_cli_live_monitoring_attempts()
from public;

grant execute
on function public.record_cli_integrity_event(uuid, text, jsonb)
to authenticated;

grant execute
on function public.get_cli_live_monitoring_attempts()
to authenticated;
