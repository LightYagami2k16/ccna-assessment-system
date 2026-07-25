-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- MIGRATION 019: AUTOMATIC MODULE-CODE ORDERING
-- =========================================================
--
-- Module ordering is derived from the trailing number in the
-- module code. Examples:
-- ITN-02 -> 2
-- ITN-06 -> 6
-- ITN-14 -> 14

create or replace function public.save_instructor_module(
  p_payload jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_module_id uuid;
  v_course_id bigint := nullif(
    trim(p_payload->>'courseId'),
    ''
  )::bigint;
  v_code text := upper(trim(p_payload->>'code'));
  v_title text := trim(p_payload->>'title');
  v_description text := nullif(
    trim(p_payload->>'description'),
    ''
  );
  v_sort_order integer;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if v_course_id is null
     or not exists (
       select 1
       from public.courses
       where id = v_course_id
     ) then
    raise exception 'Select a valid course.';
  end if;

  if v_code is null or v_code = '' then
    raise exception 'Module code is required.';
  end if;

  if v_code !~ '^[A-Z0-9]+-[0-9]+$' then
    raise exception
      'Use a module code such as ITN-06, SRWE-03, or ENSA-14.';
  end if;

  if v_title is null or v_title = '' then
    raise exception 'Module title is required.';
  end if;

  v_sort_order := (
    substring(v_code from '([0-9]+)$')
  )::integer;

  if nullif(trim(p_payload->>'id'), '') is null then
    insert into public.modules (
      course_id,
      code,
      title,
      description,
      sort_order
    )
    values (
      v_course_id,
      v_code,
      v_title,
      v_description,
      v_sort_order
    )
    returning id into v_module_id;
  else
    v_module_id := (p_payload->>'id')::uuid;

    update public.modules
    set
      course_id = v_course_id,
      code = v_code,
      title = v_title,
      description = v_description,
      sort_order = v_sort_order
    where id = v_module_id;

    if not found then
      raise exception 'Module was not found.';
    end if;
  end if;

  return v_module_id;
exception
  when invalid_text_representation then
    raise exception 'The selected course or module identifier is invalid.';
  when unique_violation then
    raise exception
      'That module code already exists in the selected course.';
end;
$$;

-- Backfill existing module order values from valid module codes.
update public.modules
set sort_order = (
  substring(upper(trim(code)) from '([0-9]+)$')
)::integer
where upper(trim(code)) ~ '^[A-Z0-9]+-[0-9]+$';

revoke all
on function public.save_instructor_module(jsonb)
from public;

grant execute
on function public.save_instructor_module(jsonb)
to authenticated;

