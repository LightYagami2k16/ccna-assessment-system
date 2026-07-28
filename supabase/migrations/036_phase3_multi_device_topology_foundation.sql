-- Phase 3 foundation: multi-device practicals and device-aware grading.

alter table public.cli_labs
add column if not exists devices jsonb not null default '[]'::jsonb;

alter table public.cli_labs
add column if not exists topology jsonb not null default
  '{"links":[]}'::jsonb;

alter table public.cli_commands
add column if not exists device_id text not null default 'device-1';

create index if not exists cli_commands_attempt_device_idx
on public.cli_commands(attempt_id, device_id, sequence_number);

create or replace function public.save_cli_lab_topology(
  p_lab_id uuid,
  p_devices jsonb,
  p_topology jsonb default '{"links":[]}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_current_user_role_text();
  v_devices jsonb := coalesce(p_devices, '[]'::jsonb);
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;
  if jsonb_typeof(v_devices) <> 'array'
     or jsonb_array_length(v_devices) < 1
     or jsonb_array_length(v_devices) > 12 then
    raise exception 'A practical requires between 1 and 12 devices.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_devices) device
    where nullif(trim(device->>'id'), '') is null
       or nullif(trim(device->>'hostname'), '') is null
       or lower(device->>'type') not in ('router', 'switch')
  ) then
    raise exception 'Each device requires an ID, hostname, and valid type.';
  end if;
  if (
    select count(*)
    from (
      select lower(trim(device->>'id'))
      from jsonb_array_elements(v_devices) device
      group by lower(trim(device->>'id'))
    ) unique_device
  ) <> jsonb_array_length(v_devices) then
    raise exception 'Device IDs must be unique.';
  end if;

  update public.cli_labs
  set
    devices = v_devices,
    topology = case
      when jsonb_typeof(coalesce(p_topology, '{}'::jsonb)) = 'object'
        then coalesce(p_topology, '{"links":[]}'::jsonb)
      else '{"links":[]}'::jsonb
    end
  where id = p_lab_id
    and (
      created_by = auth.uid()
      or v_role in ('admin', 'administrator')
    );

  if not found then
    raise exception 'CLI practical was not found.';
  end if;
  return true;
end;
$$;

create or replace function public.get_cli_lab_topology_data(
  p_lab_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', lab.id,
          'devices', case
            when jsonb_array_length(lab.devices) > 0
              then lab.devices
            else jsonb_build_array(
              jsonb_build_object(
                'id', 'device-1',
                'label', lab.initial_hostname,
                'hostname', lab.initial_hostname,
                'type', lab.device_type
              )
            )
          end,
          'topology', lab.topology
        )
      )
      from public.cli_labs lab
      where lab.id = any(coalesce(p_lab_ids, array[]::uuid[]))
        and (
          lab.created_by = auth.uid()
          or public.get_current_user_role_text()
            in ('admin', 'administrator')
          or (
            public.get_current_user_role_text() = 'student'
            and lab.status = 'published'
            and exists (
              select 1
              from public.cli_lab_assignments assignment
              join public.class_memberships membership
                on membership.class_id = assignment.class_id
              join public.class_sections section
                on section.id = assignment.class_id
              where assignment.lab_id = lab.id
                and membership.student_id = auth.uid()
                and section.is_active
            )
          )
        )
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.save_cli_device_command(
  p_attempt_id uuid,
  p_device_id text,
  p_command text,
  p_mode_before text,
  p_mode_after text,
  p_accepted boolean,
  p_output text,
  p_state jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sequence integer;
begin
  if nullif(trim(p_device_id), '') is null then
    raise exception 'A device ID is required.';
  end if;
  if not exists (
    select 1
    from public.cli_attempts
    where id = p_attempt_id
      and student_id = auth.uid()
      and status = 'in_progress'
      and expires_at > now()
  ) then
    raise exception 'The practical attempt is unavailable or expired.';
  end if;
  select coalesce(max(sequence_number), 0) + 1
  into v_sequence
  from public.cli_commands
  where attempt_id = p_attempt_id;

  insert into public.cli_commands (
    attempt_id,
    sequence_number,
    device_id,
    command_text,
    mode_before,
    mode_after,
    accepted,
    output_text,
    state_after
  )
  values (
    p_attempt_id,
    v_sequence,
    left(trim(p_device_id), 80),
    left(p_command, 500),
    p_mode_before,
    p_mode_after,
    p_accepted,
    left(coalesce(p_output, ''), 5000),
    p_state
  );

  update public.cli_attempts
  set session_state = p_state
  where id = p_attempt_id;
  return true;
end;
$$;

create or replace function public.cli_criterion_device_state(
  p_state jsonb,
  p_criterion jsonb
)
returns jsonb
language sql
immutable
set search_path = public
as $$
  select case
    when nullif(trim(p_criterion->>'deviceId'), '') is not null
      and p_state ? 'deviceStates'
      then coalesce(
        p_state->'deviceStates'->trim(p_criterion->>'deviceId'),
        '{}'::jsonb
      )
    else p_state
  end;
$$;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(routine.oid)
  into v_definition
  from pg_proc routine
  join pg_namespace namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname = 'cli_criterion_is_met'
    and routine.proargtypes = '3802 3802'::oidvector;

  if v_definition is null then
    raise exception
      'cli_criterion_is_met(jsonb, jsonb) must exist before migration 036';
  end if;

  if position(
    'cli_criterion_device_state(p_state, p_criterion)'
    in v_definition
  ) = 0 then
    v_definition := replace(
      v_definition,
      'p_state #>>',
      'public.cli_criterion_device_state(p_state, p_criterion) #>>'
    );
    v_definition := replace(
      v_definition,
      'p_state #>',
      'public.cli_criterion_device_state(p_state, p_criterion) #>'
    );
    v_definition := replace(
      v_definition,
      'p_state->',
      'public.cli_criterion_device_state(p_state, p_criterion)->'
    );
    execute v_definition;
  end if;
end;
$$;

revoke all
on function public.save_cli_lab_topology(uuid, jsonb, jsonb)
from public;
revoke all
on function public.get_cli_lab_topology_data(uuid[])
from public;
revoke all
on function public.save_cli_device_command(
  uuid, text, text, text, text, boolean, text, jsonb
)
from public;
revoke all
on function public.cli_criterion_device_state(jsonb, jsonb)
from public;

grant execute
on function public.save_cli_lab_topology(uuid, jsonb, jsonb)
to authenticated;
grant execute
on function public.get_cli_lab_topology_data(uuid[])
to authenticated;
grant execute
on function public.save_cli_device_command(
  uuid, text, text, text, text, boolean, text, jsonb
)
to authenticated;
