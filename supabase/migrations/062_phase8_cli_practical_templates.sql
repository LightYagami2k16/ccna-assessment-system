-- PHASE 8.3: CLI PRACTICAL DUPLICATION AND REUSABLE TOPOLOGY TEMPLATES

create table if not exists public.cli_lab_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  source_lab_id uuid references public.cli_labs(id) on delete set null,
  course_id bigint not null references public.courses(id) on delete restrict,
  module_id uuid references public.modules(id) on delete set null,
  name text not null,
  template_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cli_lab_templates_name_not_blank
    check (length(trim(name)) between 1 and 160)
);

create index if not exists cli_lab_templates_created_by_idx
on public.cli_lab_templates(created_by, created_at desc);

alter table public.cli_lab_templates enable row level security;

drop policy if exists cli_lab_templates_select_own
on public.cli_lab_templates;
create policy cli_lab_templates_select_own
on public.cli_lab_templates for select to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

drop policy if exists cli_lab_templates_insert_own
on public.cli_lab_templates;
create policy cli_lab_templates_insert_own
on public.cli_lab_templates for insert to authenticated
with check (
  created_by = auth.uid()
  and public.get_current_user_role_text() in (
    'instructor', 'admin', 'administrator'
  )
);

drop policy if exists cli_lab_templates_update_own
on public.cli_lab_templates;
create policy cli_lab_templates_update_own
on public.cli_lab_templates for update to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
)
with check (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

drop policy if exists cli_lab_templates_delete_own
on public.cli_lab_templates;
create policy cli_lab_templates_delete_own
on public.cli_lab_templates for delete to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

grant select, insert, update, delete
on public.cli_lab_templates to authenticated;

create or replace function public.duplicate_instructor_cli_lab(
  p_lab_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_source public.cli_labs%rowtype;
  v_new_lab_id uuid;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_source from public.cli_labs where id = p_lab_id;
  if not found then raise exception 'CLI practical not found.'; end if;

  if v_source.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only duplicate your own CLI practicals.';
  end if;

  insert into public.cli_labs (
    course_id, module_id, created_by, title, description, instructions,
    device_type, initial_hostname, duration_minutes, max_attempts,
    passing_score, status, grading_criteria, devices, topology
  ) values (
    v_source.course_id, v_source.module_id, v_user_id,
    coalesce(nullif(trim(p_title), ''), 'Copy of ' || v_source.title),
    v_source.description, v_source.instructions, v_source.device_type,
    v_source.initial_hostname, v_source.duration_minutes,
    v_source.max_attempts, v_source.passing_score, 'draft',
    v_source.grading_criteria, v_source.devices, v_source.topology
  ) returning id into v_new_lab_id;

  return v_new_lab_id;
end;
$$;

create or replace function public.save_instructor_cli_lab_template(
  p_lab_id uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_source public.cli_labs%rowtype;
  v_template_id uuid;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_source from public.cli_labs where id = p_lab_id;
  if not found then raise exception 'CLI practical not found.'; end if;

  if v_source.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only save your own practicals as templates.';
  end if;

  insert into public.cli_lab_templates (
    created_by, source_lab_id, course_id, module_id, name, template_data
  ) values (
    v_user_id, p_lab_id, v_source.course_id, v_source.module_id,
    coalesce(nullif(trim(p_name), ''), v_source.title || ' template'),
    jsonb_build_object(
      'title', v_source.title,
      'description', v_source.description,
      'instructions', v_source.instructions,
      'deviceType', v_source.device_type,
      'initialHostname', v_source.initial_hostname,
      'durationMinutes', v_source.duration_minutes,
      'maxAttempts', v_source.max_attempts,
      'passingScore', v_source.passing_score,
      'criteria', v_source.grading_criteria,
      'devices', v_source.devices,
      'topology', v_source.topology
    )
  ) returning id into v_template_id;

  return v_template_id;
end;
$$;

create or replace function public.create_instructor_cli_lab_from_template(
  p_template_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_template public.cli_lab_templates%rowtype;
  v_data jsonb;
  v_new_lab_id uuid;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_template
  from public.cli_lab_templates where id = p_template_id;
  if not found then raise exception 'CLI practical template not found.'; end if;

  if v_template.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only use your own CLI practical templates.';
  end if;

  v_data := v_template.template_data;

  insert into public.cli_labs (
    course_id, module_id, created_by, title, description, instructions,
    device_type, initial_hostname, duration_minutes, max_attempts,
    passing_score, status, grading_criteria, devices, topology
  ) values (
    v_template.course_id, v_template.module_id, v_user_id,
    coalesce(
      nullif(trim(p_title), ''),
      nullif(v_data ->> 'title', ''),
      v_template.name
    ),
    nullif(v_data ->> 'description', ''),
    coalesce(nullif(v_data ->> 'instructions', ''), 'Complete the practical.'),
    coalesce(nullif(v_data ->> 'deviceType', ''), 'switch'),
    coalesce(nullif(v_data ->> 'initialHostname', ''), 'Switch'),
    coalesce((v_data ->> 'durationMinutes')::integer, 30),
    coalesce((v_data ->> 'maxAttempts')::integer, 1),
    coalesce((v_data ->> 'passingScore')::numeric, 70),
    'draft',
    coalesce(v_data -> 'criteria', '[]'::jsonb),
    coalesce(v_data -> 'devices', '[]'::jsonb),
    coalesce(v_data -> 'topology', '{"links":[]}'::jsonb)
  ) returning id into v_new_lab_id;

  return v_new_lab_id;
end;
$$;

create or replace function public.delete_instructor_cli_lab_template(
  p_template_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  delete from public.cli_lab_templates
  where id = p_template_id
    and (
      created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if not found then
    raise exception 'CLI practical template not found or access denied.';
  end if;
  return true;
end;
$$;

revoke all on function public.duplicate_instructor_cli_lab(uuid, text) from public;
revoke all on function public.save_instructor_cli_lab_template(uuid, text) from public;
revoke all on function public.create_instructor_cli_lab_from_template(uuid, text) from public;
revoke all on function public.delete_instructor_cli_lab_template(uuid) from public;

grant execute on function public.duplicate_instructor_cli_lab(uuid, text) to authenticated;
grant execute on function public.save_instructor_cli_lab_template(uuid, text) to authenticated;
grant execute on function public.create_instructor_cli_lab_from_template(uuid, text) to authenticated;
grant execute on function public.delete_instructor_cli_lab_template(uuid) to authenticated;
