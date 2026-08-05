-- =========================================================
-- PHASE 5.3: CONFIGURABLE INTEGRITY ENFORCEMENT
-- =========================================================

create table if not exists public.assessment_integrity_policies (
  id uuid primary key default gen_random_uuid(),
  assessment_type text not null
    check (assessment_type in ('quiz', 'cli')),
  assessment_id uuid not null,
  behavior text not null default 'warn'
    check (behavior in ('monitor', 'warn', 'auto_submit')),
  incident_limit integer not null default 3
    check (incident_limit between 1 and 100),
  max_hidden_seconds integer not null default 60
    check (max_hidden_seconds between 5 and 3600),
  created_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (assessment_type, assessment_id)
);

drop trigger if exists assessment_integrity_policies_set_updated_at
on public.assessment_integrity_policies;

create trigger assessment_integrity_policies_set_updated_at
before update on public.assessment_integrity_policies
for each row execute function public.set_updated_at();

alter table public.assessment_integrity_policies enable row level security;
revoke all on public.assessment_integrity_policies from anon, authenticated;

create or replace function public.delete_assessment_integrity_policy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.assessment_integrity_policies
  where assessment_type = tg_argv[0]
    and assessment_id = old.id;
  return old;
end;
$$;

drop trigger if exists quizzes_delete_integrity_policy on public.quizzes;
create trigger quizzes_delete_integrity_policy
after delete on public.quizzes
for each row execute function public.delete_assessment_integrity_policy('quiz');

drop trigger if exists cli_labs_delete_integrity_policy on public.cli_labs;
create trigger cli_labs_delete_integrity_policy
after delete on public.cli_labs
for each row execute function public.delete_assessment_integrity_policy('cli');

create or replace function public.save_assessment_integrity_policy(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_type text := lower(btrim(coalesce(p_payload->>'assessmentType', '')));
  v_assessment_id uuid := (p_payload->>'assessmentId')::uuid;
  v_behavior text := lower(btrim(coalesce(p_payload->>'behavior', 'warn')));
  v_policy_id uuid;
begin
  if v_user_id is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;
  if v_type not in ('quiz', 'cli') then
    raise exception 'Select a valid assessment type.';
  end if;
  if v_behavior not in ('monitor', 'warn', 'auto_submit') then
    raise exception 'Select a valid integrity behavior.';
  end if;
  if not (
    (v_type = 'quiz' and exists (
      select 1 from public.quizzes quiz
      where quiz.id = v_assessment_id
        and (quiz.created_by = v_user_id
          or v_role in ('admin', 'administrator'))
    ))
    or
    (v_type = 'cli' and exists (
      select 1 from public.cli_labs lab
      where lab.id = v_assessment_id
        and (lab.created_by = v_user_id
          or v_role in ('admin', 'administrator'))
    ))
  ) then
    raise exception 'Assessment was not found in your workspace.';
  end if;

  insert into public.assessment_integrity_policies (
    assessment_type,
    assessment_id,
    behavior,
    incident_limit,
    max_hidden_seconds,
    created_by
  ) values (
    v_type,
    v_assessment_id,
    v_behavior,
    greatest(1, least(100, coalesce((p_payload->>'incidentLimit')::integer, 3))),
    greatest(5, least(3600, coalesce((p_payload->>'maxHiddenSeconds')::integer, 60))),
    v_user_id
  )
  on conflict (assessment_type, assessment_id)
  do update set
    behavior = excluded.behavior,
    incident_limit = excluded.incident_limit,
    max_hidden_seconds = excluded.max_hidden_seconds,
    created_by = excluded.created_by
  returning id into v_policy_id;

  return v_policy_id;
end;
$$;

create or replace function public.get_instructor_integrity_policies()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_result jsonb;
begin
  if v_user_id is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  select coalesce(jsonb_agg(item order by item->>'courseCode', item->>'title'), '[]'::jsonb)
  into v_result
  from (
    select jsonb_build_object(
      'assessmentType', 'quiz',
      'assessmentId', quiz.id,
      'title', quiz.title,
      'courseCode', course.code,
      'behavior', coalesce(policy.behavior, 'warn'),
      'incidentLimit', coalesce(policy.incident_limit, 3),
      'maxHiddenSeconds', coalesce(policy.max_hidden_seconds, 60)
    ) as item
    from public.quizzes quiz
    join public.courses course on course.id = quiz.course_id
    left join public.assessment_integrity_policies policy
      on policy.assessment_type = 'quiz'
     and policy.assessment_id = quiz.id
    where quiz.created_by = v_user_id
       or v_role in ('admin', 'administrator')

    union all

    select jsonb_build_object(
      'assessmentType', 'cli',
      'assessmentId', lab.id,
      'title', lab.title,
      'courseCode', course.code,
      'behavior', coalesce(policy.behavior, 'warn'),
      'incidentLimit', coalesce(policy.incident_limit, 3),
      'maxHiddenSeconds', coalesce(policy.max_hidden_seconds, 60)
    ) as item
    from public.cli_labs lab
    join public.courses course on course.id = lab.course_id
    left join public.assessment_integrity_policies policy
      on policy.assessment_type = 'cli'
     and policy.assessment_id = lab.id
    where lab.created_by = v_user_id
       or v_role in ('admin', 'administrator')
  ) assessments;

  return v_result;
end;
$$;

drop function if exists public.record_exam_integrity_event(uuid, text, jsonb);

create function public.record_exam_integrity_event(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_quiz_id uuid;
  v_behavior text := 'warn';
  v_limit integer := 3;
  v_max_hidden integer := 60;
  v_incidents integer := 0;
  v_away_ms bigint := coalesce((p_details->>'awayDurationMs')::bigint, 0);
  v_auto_submit boolean := false;
  v_reason text := null;
begin
  if p_event_type not in (
    'page_hidden', 'page_visible', 'window_blur', 'window_focus',
    'fullscreen_exited', 'connection_lost', 'connection_restored'
  ) then raise exception 'Unsupported integrity event.'; end if;

  select attempt.quiz_id into v_quiz_id
  from public.quiz_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.student_id = v_student_id
    and attempt.status = 'in_progress';
  if not found then raise exception 'Active quiz attempt was not found.'; end if;

  insert into public.exam_integrity_events
    (attempt_id, student_id, event_type, details)
  values
    (p_attempt_id, v_student_id, p_event_type, coalesce(p_details, '{}'::jsonb));

  select policy.behavior, policy.incident_limit, policy.max_hidden_seconds
  into v_behavior, v_limit, v_max_hidden
  from public.assessment_integrity_policies policy
  where policy.assessment_type = 'quiz' and policy.assessment_id = v_quiz_id;
  v_behavior := coalesce(v_behavior, 'warn');
  v_limit := coalesce(v_limit, 3);
  v_max_hidden := coalesce(v_max_hidden, 60);

  select count(*) into v_incidents
  from public.exam_integrity_events event
  where event.attempt_id = p_attempt_id
    and event.event_type in ('page_hidden', 'fullscreen_exited');

  if v_behavior = 'auto_submit' and v_incidents >= v_limit then
    v_auto_submit := true;
    v_reason := 'incident_limit';
  elsif v_behavior = 'auto_submit'
    and p_event_type = 'page_visible'
    and v_away_ms >= v_max_hidden * 1000 then
    v_auto_submit := true;
    v_reason := 'time_away_limit';
  end if;

  if v_auto_submit then
    perform public.submit_quiz_attempt(p_attempt_id);
    delete from public.active_assessment_sessions
    where assessment_type = 'quiz' and attempt_id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'behavior', v_behavior,
    'incidentCount', v_incidents,
    'autoSubmitted', v_auto_submit,
    'reason', v_reason
  );
end;
$$;

drop function if exists public.record_cli_integrity_event(uuid, text, jsonb);

create function public.record_cli_integrity_event(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_lab_id uuid;
  v_behavior text := 'warn';
  v_limit integer := 3;
  v_max_hidden integer := 60;
  v_incidents integer := 0;
  v_away_ms bigint := coalesce((p_details->>'awayDurationMs')::bigint, 0);
  v_auto_submit boolean := false;
  v_reason text := null;
begin
  if p_event_type not in (
    'page_hidden', 'page_visible', 'window_blur', 'window_focus',
    'fullscreen_exited', 'connection_lost', 'connection_restored'
  ) then raise exception 'Unsupported integrity event.'; end if;

  select attempt.lab_id into v_lab_id
  from public.cli_attempts attempt
  where attempt.id = p_attempt_id
    and attempt.student_id = v_student_id
    and attempt.status = 'in_progress';
  if not found then raise exception 'Active CLI practical attempt was not found.'; end if;

  insert into public.cli_integrity_events
    (attempt_id, student_id, event_type, details)
  values
    (p_attempt_id, v_student_id, p_event_type, coalesce(p_details, '{}'::jsonb));

  select policy.behavior, policy.incident_limit, policy.max_hidden_seconds
  into v_behavior, v_limit, v_max_hidden
  from public.assessment_integrity_policies policy
  where policy.assessment_type = 'cli' and policy.assessment_id = v_lab_id;
  v_behavior := coalesce(v_behavior, 'warn');
  v_limit := coalesce(v_limit, 3);
  v_max_hidden := coalesce(v_max_hidden, 60);

  select count(*) into v_incidents
  from public.cli_integrity_events event
  where event.attempt_id = p_attempt_id
    and event.event_type in ('page_hidden', 'fullscreen_exited');

  if v_behavior = 'auto_submit' and v_incidents >= v_limit then
    v_auto_submit := true;
    v_reason := 'incident_limit';
  elsif v_behavior = 'auto_submit'
    and p_event_type = 'page_visible'
    and v_away_ms >= v_max_hidden * 1000 then
    v_auto_submit := true;
    v_reason := 'time_away_limit';
  end if;

  if v_auto_submit then
    perform public.submit_cli_attempt(p_attempt_id);
    delete from public.active_assessment_sessions
    where assessment_type = 'cli' and attempt_id = p_attempt_id;
  end if;

  return jsonb_build_object(
    'recorded', true,
    'behavior', v_behavior,
    'incidentCount', v_incidents,
    'autoSubmitted', v_auto_submit,
    'reason', v_reason
  );
end;
$$;

revoke all on function public.save_assessment_integrity_policy(jsonb) from public;
revoke all on function public.get_instructor_integrity_policies() from public;
revoke all on function public.delete_assessment_integrity_policy() from public;
revoke all on function public.record_exam_integrity_event(uuid, text, jsonb) from public;
revoke all on function public.record_cli_integrity_event(uuid, text, jsonb) from public;

grant execute on function public.save_assessment_integrity_policy(jsonb) to authenticated;
grant execute on function public.get_instructor_integrity_policies() to authenticated;
grant execute on function public.record_exam_integrity_event(uuid, text, jsonb) to authenticated;
grant execute on function public.record_cli_integrity_event(uuid, text, jsonb) to authenticated;
