-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A: SINGLE-DEVICE CISCO CLI PRACTICALS
-- =========================================================

create table if not exists public.cli_labs (
  id uuid primary key default gen_random_uuid(),
  course_id bigint not null references public.courses(id) on delete restrict,
  module_id uuid references public.modules(id) on delete set null,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  instructions text not null,
  device_type text not null default 'switch'
    check (device_type in ('switch', 'router')),
  initial_hostname text not null default 'Switch',
  duration_minutes integer not null default 30
    check (duration_minutes between 1 and 480),
  max_attempts integer not null default 1
    check (max_attempts between 1 and 100),
  passing_score numeric(5,2) not null default 70
    check (passing_score between 0 and 100),
  status public.content_status not null default 'draft',
  grading_criteria jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cli_lab_assignments (
  lab_id uuid not null references public.cli_labs(id) on delete cascade,
  class_id uuid not null references public.class_sections(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (lab_id, class_id)
);

create table if not exists public.cli_attempts (
  id uuid primary key default gen_random_uuid(),
  lab_id uuid not null references public.cli_labs(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  attempt_number integer not null,
  status text not null default 'in_progress'
    check (status in ('in_progress', 'submitted', 'expired')),
  started_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  session_state jsonb not null default '{}'::jsonb,
  score_points numeric(10,2) not null default 0,
  maximum_points numeric(10,2) not null default 0,
  percentage numeric(5,2) not null default 0,
  passed boolean,
  unique (lab_id, student_id, attempt_number)
);

create table if not exists public.cli_commands (
  id bigint generated always as identity primary key,
  attempt_id uuid not null references public.cli_attempts(id) on delete cascade,
  sequence_number integer not null,
  command_text text not null,
  mode_before text not null,
  mode_after text not null,
  accepted boolean not null,
  output_text text,
  state_after jsonb not null,
  entered_at timestamptz not null default now(),
  unique (attempt_id, sequence_number)
);

create index if not exists cli_labs_created_by_idx
on public.cli_labs(created_by);
create index if not exists cli_lab_assignments_class_idx
on public.cli_lab_assignments(class_id);
create index if not exists cli_attempts_student_idx
on public.cli_attempts(student_id, started_at desc);
create index if not exists cli_commands_attempt_idx
on public.cli_commands(attempt_id, sequence_number);

drop trigger if exists cli_labs_set_updated_at on public.cli_labs;
create trigger cli_labs_set_updated_at
before update on public.cli_labs
for each row execute function public.set_updated_at();

alter table public.cli_labs enable row level security;
alter table public.cli_lab_assignments enable row level security;
alter table public.cli_attempts enable row level security;
alter table public.cli_commands enable row level security;

-- Lab rows contain hidden grading criteria. Browser roles must use the
-- safe RPC functions below instead of selecting cli_labs directly.
revoke all on public.cli_labs, public.cli_lab_assignments
from anon, authenticated;
grant select on public.cli_attempts, public.cli_commands to authenticated;

create policy "Instructors view their CLI labs"
on public.cli_labs for select to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

create policy "Students view assigned CLI labs"
on public.cli_labs for select to authenticated
using (
  status = 'published'
  and public.get_current_user_role_text() = 'student'
  and exists (
    select 1
    from public.cli_lab_assignments assignment
    join public.class_memberships membership
      on membership.class_id = assignment.class_id
    join public.class_sections section
      on section.id = assignment.class_id
    where assignment.lab_id = cli_labs.id
      and membership.student_id = auth.uid()
      and section.is_active = true
  )
);

create policy "Users view relevant CLI assignments"
on public.cli_lab_assignments for select to authenticated
using (
  public.get_current_user_role_text() in ('instructor', 'admin', 'administrator')
  or exists (
    select 1 from public.class_memberships membership
    where membership.class_id = cli_lab_assignments.class_id
      and membership.student_id = auth.uid()
  )
);

create policy "Students view their CLI attempts"
on public.cli_attempts for select to authenticated
using (student_id = auth.uid());

create policy "Instructors view CLI attempts"
on public.cli_attempts for select to authenticated
using (
  exists (
    select 1 from public.cli_labs lab
    where lab.id = cli_attempts.lab_id
      and (
        lab.created_by = auth.uid()
        or public.get_current_user_role_text() in ('admin', 'administrator')
      )
  )
);

create policy "Users view relevant CLI commands"
on public.cli_commands for select to authenticated
using (
  exists (
    select 1
    from public.cli_attempts attempt
    join public.cli_labs lab on lab.id = attempt.lab_id
    where attempt.id = cli_commands.attempt_id
      and (
        attempt.student_id = auth.uid()
        or lab.created_by = auth.uid()
        or public.get_current_user_role_text() in ('admin', 'administrator')
      )
  )
);

create or replace function public.save_cli_lab(p_payload jsonb)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_lab_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_course_id bigint := (p_payload->>'courseId')::bigint;
  v_module_id uuid := nullif(p_payload->>'moduleId', '')::uuid;
  v_class_ids jsonb := coalesce(p_payload->'classIds', '[]'::jsonb);
  v_criteria jsonb := coalesce(p_payload->'criteria', '[]'::jsonb);
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;
  if nullif(trim(p_payload->>'title'), '') is null then
    raise exception 'Practical title is required.';
  end if;
  if nullif(trim(p_payload->>'instructions'), '') is null then
    raise exception 'Practical instructions are required.';
  end if;
  if jsonb_typeof(v_criteria) <> 'array'
     or jsonb_array_length(v_criteria) = 0 then
    raise exception 'Add at least one grading criterion.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_criteria) criterion
    where coalesce((criterion->>'points')::numeric, 0) <= 0
  ) then
    raise exception 'Every grading criterion needs a positive point value.';
  end if;

  if v_lab_id is null then
    insert into public.cli_labs (
      course_id, module_id, created_by, title, description,
      instructions, device_type, initial_hostname, duration_minutes,
      max_attempts, passing_score, status, grading_criteria
    ) values (
      v_course_id, v_module_id, v_user_id, trim(p_payload->>'title'),
      nullif(trim(p_payload->>'description'), ''),
      trim(p_payload->>'instructions'),
      coalesce(nullif(p_payload->>'deviceType', ''), 'switch'),
      coalesce(nullif(trim(p_payload->>'initialHostname'), ''), 'Switch'),
      coalesce((p_payload->>'durationMinutes')::integer, 30),
      coalesce((p_payload->>'maxAttempts')::integer, 1),
      coalesce((p_payload->>'passingScore')::numeric, 70),
      coalesce(nullif(p_payload->>'status', '')::public.content_status, 'draft'),
      v_criteria
    ) returning id into v_lab_id;
  else
    update public.cli_labs set
      course_id = v_course_id,
      module_id = v_module_id,
      title = trim(p_payload->>'title'),
      description = nullif(trim(p_payload->>'description'), ''),
      instructions = trim(p_payload->>'instructions'),
      device_type = coalesce(nullif(p_payload->>'deviceType', ''), 'switch'),
      initial_hostname = coalesce(nullif(trim(p_payload->>'initialHostname'), ''), 'Switch'),
      duration_minutes = coalesce((p_payload->>'durationMinutes')::integer, 30),
      max_attempts = coalesce((p_payload->>'maxAttempts')::integer, 1),
      passing_score = coalesce((p_payload->>'passingScore')::numeric, 70),
      status = coalesce(nullif(p_payload->>'status', '')::public.content_status, 'draft'),
      grading_criteria = v_criteria
    where id = v_lab_id
      and (created_by = v_user_id or v_role in ('admin', 'administrator'));
    if not found then raise exception 'CLI practical was not found.'; end if;
  end if;

  delete from public.cli_lab_assignments where lab_id = v_lab_id;
  insert into public.cli_lab_assignments (lab_id, class_id, assigned_by)
  select v_lab_id, value::text::uuid, v_user_id
  from jsonb_array_elements_text(v_class_ids)
  where exists (
    select 1 from public.class_sections section
    where section.id = value::text::uuid
      and (section.created_by = v_user_id or v_role in ('admin', 'administrator'))
  );
  return v_lab_id;
end;
$$;

create or replace function public.get_instructor_cli_workspace()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;
  return jsonb_build_object(
    'labs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', lab.id, 'courseId', lab.course_id, 'moduleId', lab.module_id,
        'courseCode', course.code, 'moduleCode', module.code,
        'title', lab.title, 'description', lab.description,
        'instructions', lab.instructions, 'deviceType', lab.device_type,
        'initialHostname', lab.initial_hostname,
        'durationMinutes', lab.duration_minutes, 'maxAttempts', lab.max_attempts,
        'passingScore', lab.passing_score, 'status', lab.status,
        'criteria', lab.grading_criteria,
        'classIds', coalesce((
          select jsonb_agg(assignment.class_id)
          from public.cli_lab_assignments assignment
          where assignment.lab_id = lab.id
        ), '[]'::jsonb)
      ) order by lab.created_at desc)
      from public.cli_labs lab
      join public.courses course on course.id = lab.course_id
      left join public.modules module on module.id = lab.module_id
      where lab.created_by = v_user_id or v_role in ('admin', 'administrator')
    ), '[]'::jsonb),
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section.id, 'code', section.code, 'name', section.name
      ) order by section.code)
      from public.class_sections section
      where section.is_active
        and (section.created_by = v_user_id or v_role in ('admin', 'administrator'))
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.delete_cli_lab(p_lab_id uuid)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_role text := public.get_current_user_role_text();
begin
  delete from public.cli_labs
  where id = p_lab_id
    and (created_by = auth.uid() or v_role in ('admin', 'administrator'));
  if not found then raise exception 'CLI practical was not found.'; end if;
  return true;
end;
$$;

create or replace function public.get_available_cli_labs()
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_student_id uuid := auth.uid();
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', lab.id, 'courseCode', course.code, 'moduleCode', module.code,
      'title', lab.title, 'description', lab.description,
      'deviceType', lab.device_type, 'durationMinutes', lab.duration_minutes,
      'maxAttempts', lab.max_attempts, 'passingScore', lab.passing_score,
      'attemptsUsed', (
        select count(*) from public.cli_attempts attempt
        where attempt.lab_id = lab.id and attempt.student_id = v_student_id
      ),
      'activeAttemptId', (
        select attempt.id from public.cli_attempts attempt
        where attempt.lab_id = lab.id and attempt.student_id = v_student_id
          and attempt.status = 'in_progress' and attempt.expires_at > now()
        order by attempt.started_at desc limit 1
      )
    ) order by course.code, lab.title)
    from public.cli_labs lab
    join public.courses course on course.id = lab.course_id
    left join public.modules module on module.id = lab.module_id
    where lab.status = 'published'
      and exists (
        select 1 from public.cli_lab_assignments assignment
        join public.class_memberships membership
          on membership.class_id = assignment.class_id
        join public.class_sections section on section.id = assignment.class_id
        where assignment.lab_id = lab.id
          and membership.student_id = v_student_id
          and section.is_active
      )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.start_cli_attempt(p_lab_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_lab public.cli_labs%rowtype;
  v_attempt_id uuid;
  v_attempt_count integer;
  v_maximum numeric;
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;
  select * into v_lab from public.cli_labs
  where id = p_lab_id and status = 'published'
    and exists (
      select 1 from public.cli_lab_assignments assignment
      join public.class_memberships membership on membership.class_id = assignment.class_id
      join public.class_sections section on section.id = assignment.class_id
      where assignment.lab_id = cli_labs.id
        and membership.student_id = v_student_id and section.is_active
    );
  if not found then raise exception 'CLI practical is unavailable.'; end if;

  select id into v_attempt_id from public.cli_attempts
  where lab_id = p_lab_id and student_id = v_student_id
    and status = 'in_progress' and expires_at > now()
  order by started_at desc limit 1;
  if v_attempt_id is not null then return v_attempt_id; end if;

  update public.cli_attempts set status = 'expired'
  where lab_id = p_lab_id and student_id = v_student_id
    and status = 'in_progress' and expires_at <= now();
  select count(*) into v_attempt_count from public.cli_attempts
  where lab_id = p_lab_id and student_id = v_student_id;
  if v_attempt_count >= v_lab.max_attempts then
    raise exception 'Maximum practical attempts reached.';
  end if;
  select coalesce(sum((criterion->>'points')::numeric), 0)
  into v_maximum from jsonb_array_elements(v_lab.grading_criteria) criterion;
  insert into public.cli_attempts (
    lab_id, student_id, attempt_number, expires_at, maximum_points, session_state
  ) values (
    p_lab_id, v_student_id, v_attempt_count + 1,
    now() + make_interval(mins => v_lab.duration_minutes), v_maximum,
    jsonb_build_object(
      'hostname', v_lab.initial_hostname, 'mode', 'user_exec',
      'activeVlan', null, 'activeInterface', null,
      'vlans', '{}'::jsonb, 'interfaces', '{}'::jsonb, 'saved', false
    )
  ) returning id into v_attempt_id;
  return v_attempt_id;
end;
$$;

create or replace function public.get_cli_attempt_safe(p_attempt_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare v_result jsonb;
begin
  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id, 'attemptNumber', attempt.attempt_number,
      'status', attempt.status, 'expiresAt', attempt.expires_at,
      'state', attempt.session_state
    ),
    'lab', jsonb_build_object(
      'id', lab.id, 'title', lab.title, 'description', lab.description,
      'instructions', lab.instructions, 'deviceType', lab.device_type,
      'initialHostname', lab.initial_hostname, 'passingScore', lab.passing_score
    ),
    'commands', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', command.id, 'command', command.command_text,
        'output', command.output_text, 'accepted', command.accepted,
        'modeBefore', command.mode_before, 'modeAfter', command.mode_after
      ) order by command.sequence_number)
      from public.cli_commands command where command.attempt_id = attempt.id
    ), '[]'::jsonb)
  ) into v_result
  from public.cli_attempts attempt
  join public.cli_labs lab on lab.id = attempt.lab_id
  where attempt.id = p_attempt_id and attempt.student_id = auth.uid();
  if v_result is null then raise exception 'CLI attempt was not found.'; end if;
  return v_result;
end;
$$;

create or replace function public.save_cli_command(
  p_attempt_id uuid, p_command text, p_mode_before text,
  p_mode_after text, p_accepted boolean, p_output text, p_state jsonb
)
returns boolean
language plpgsql security definer set search_path = public
as $$
declare v_sequence integer;
begin
  if not exists (
    select 1 from public.cli_attempts
    where id = p_attempt_id and student_id = auth.uid()
      and status = 'in_progress' and expires_at > now()
  ) then raise exception 'The practical attempt is unavailable or expired.'; end if;
  select coalesce(max(sequence_number), 0) + 1 into v_sequence
  from public.cli_commands where attempt_id = p_attempt_id;
  insert into public.cli_commands (
    attempt_id, sequence_number, command_text, mode_before,
    mode_after, accepted, output_text, state_after
  ) values (
    p_attempt_id, v_sequence, left(p_command, 500), p_mode_before,
    p_mode_after, p_accepted, left(coalesce(p_output, ''), 5000), p_state
  );
  update public.cli_attempts set session_state = p_state where id = p_attempt_id;
  return true;
end;
$$;

create or replace function public.submit_cli_attempt(p_attempt_id uuid)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_attempt public.cli_attempts%rowtype;
  v_lab public.cli_labs%rowtype;
  v_criterion jsonb;
  v_met boolean;
  v_points numeric;
  v_score numeric := 0;
  v_percentage numeric := 0;
  v_passed boolean;
begin
  select * into v_attempt from public.cli_attempts
  where id = p_attempt_id and student_id = auth.uid()
    and status = 'in_progress';
  if not found then raise exception 'CLI attempt is unavailable or already submitted.'; end if;
  select * into v_lab from public.cli_labs where id = v_attempt.lab_id;

  for v_criterion in select * from jsonb_array_elements(v_lab.grading_criteria)
  loop
    v_points := coalesce((v_criterion->>'points')::numeric, 0);
    v_met := case v_criterion->>'type'
      when 'hostname' then lower(v_attempt.session_state->>'hostname') =
        lower(v_criterion->>'expected')
      when 'vlan_exists' then (v_attempt.session_state->'vlans') ?
        (v_criterion->>'target')
      when 'vlan_name' then lower(v_attempt.session_state #>>
        array['vlans', v_criterion->>'target', 'name']) =
        lower(v_criterion->>'expected')
      when 'interface_mode' then lower(v_attempt.session_state #>>
        array['interfaces', v_criterion->>'target', 'switchportMode']) =
        lower(v_criterion->>'expected')
      when 'interface_access_vlan' then (v_attempt.session_state #>>
        array['interfaces', v_criterion->>'target', 'accessVlan']) =
        (v_criterion->>'expected')
      when 'interface_enabled' then coalesce((v_attempt.session_state #>>
        array['interfaces', v_criterion->>'target', 'shutdown'])::boolean, true) = false
      when 'interface_ip' then concat(
        v_attempt.session_state #>> array['interfaces', v_criterion->>'target', 'ipAddress'],
        ' ',
        v_attempt.session_state #>> array['interfaces', v_criterion->>'target', 'subnetMask']
      ) = v_criterion->>'expected'
      when 'config_saved' then coalesce((v_attempt.session_state->>'saved')::boolean, false)
      else false
    end;
    if coalesce(v_met, false) then v_score := v_score + v_points; end if;
  end loop;
  if v_attempt.maximum_points > 0 then
    v_percentage := round((v_score / v_attempt.maximum_points) * 100, 2);
  end if;
  v_passed := v_percentage >= v_lab.passing_score;
  update public.cli_attempts set
    status = case when expires_at <= now() then 'expired' else 'submitted' end,
    submitted_at = now(), score_points = v_score,
    percentage = v_percentage, passed = v_passed
  where id = p_attempt_id;
  return jsonb_build_object(
    'attemptId', p_attempt_id, 'scorePoints', v_score,
    'maximumPoints', v_attempt.maximum_points,
    'percentage', v_percentage, 'passingScore', v_lab.passing_score,
    'passed', v_passed
  );
end;
$$;

revoke all on function public.save_cli_lab(jsonb) from public;
revoke all on function public.get_instructor_cli_workspace() from public;
revoke all on function public.delete_cli_lab(uuid) from public;
revoke all on function public.get_available_cli_labs() from public;
revoke all on function public.start_cli_attempt(uuid) from public;
revoke all on function public.get_cli_attempt_safe(uuid) from public;
revoke all on function public.save_cli_command(uuid,text,text,text,boolean,text,jsonb) from public;
revoke all on function public.submit_cli_attempt(uuid) from public;
grant execute on function public.save_cli_lab(jsonb),
  public.get_instructor_cli_workspace(), public.delete_cli_lab(uuid),
  public.get_available_cli_labs(), public.start_cli_attempt(uuid),
  public.get_cli_attempt_safe(uuid),
  public.save_cli_command(uuid,text,text,text,boolean,text,jsonb),
  public.submit_cli_attempt(uuid) to authenticated;
