-- Phase 3: permit PC/end-device nodes in multi-device CLI topologies.

alter table public.cli_labs
drop constraint if exists cli_labs_device_type_check;

alter table public.cli_labs
add constraint cli_labs_device_type_check
check (device_type in ('switch', 'router', 'pc'));

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
       or lower(device->>'type') not in ('router', 'switch', 'pc')
  ) then
    raise exception
      'Each device requires an ID, hostname, and router, switch, or PC type.';
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

revoke all
on function public.save_cli_lab_topology(uuid, jsonb, jsonb)
from public;

grant execute
on function public.save_cli_lab_topology(uuid, jsonb, jsonb)
to authenticated;

comment on function public.save_cli_lab_topology(uuid, jsonb, jsonb)
is 'Saves router, switch, and PC nodes with their physical topology links.';
