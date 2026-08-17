-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- CLASS ENROLLMENT OWNER INTEGRITY
-- =========================================================
-- Every usable class must be owned by an instructor. Administrators retain
-- platform oversight, but cannot create, edit, enroll into, or approve
-- requests for an instructor's class.

-- Remove orphan records before reasserting the cascading relationships.
delete from public.class_join_requests request
where not exists (
  select 1 from public.class_sections section
  where section.id = request.class_id
);

delete from public.class_memberships membership
where not exists (
  select 1 from public.class_sections section
  where section.id = membership.class_id
);

alter table public.class_join_requests
drop constraint if exists class_join_requests_class_id_fkey;

alter table public.class_join_requests
add constraint class_join_requests_class_id_fkey
foreign key (class_id)
references public.class_sections(id)
on delete cascade;

alter table public.class_memberships
drop constraint if exists class_memberships_class_id_fkey;

alter table public.class_memberships
add constraint class_memberships_class_id_fkey
foreign key (class_id)
references public.class_sections(id)
on delete cascade;

-- Quarantine classes that do not have a current instructor owner. Their
-- memberships and requests are removed so they disappear from students.
delete from public.class_join_requests request
where exists (
  select 1
  from public.class_sections section
  left join public.profiles owner on owner.id = section.created_by
  where section.id = request.class_id
    and coalesce(owner.role::text, '') <> 'instructor'
);

delete from public.class_memberships membership
where exists (
  select 1
  from public.class_sections section
  left join public.profiles owner on owner.id = section.created_by
  where section.id = membership.class_id
    and coalesce(owner.role::text, '') <> 'instructor'
);

update public.class_sections section
set is_active = false
where not exists (
  select 1
  from public.profiles owner
  where owner.id = section.created_by
    and owner.role::text = 'instructor'
);

create or replace function public.enforce_class_instructor_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_role text;
begin
  select role::text into v_owner_role
  from public.profiles
  where id = new.created_by;

  if v_owner_role is distinct from 'instructor' then
    raise exception 'A class must be owned by an instructor account.';
  end if;

  if auth.uid() is distinct from new.created_by then
    raise exception 'Only the instructor who owns this class can change it.';
  end if;

  return new;
end;
$$;

drop trigger if exists class_sections_require_instructor_owner
on public.class_sections;

create trigger class_sections_require_instructor_owner
before insert or update of created_by, name, code, academic_term, is_active, join_code
on public.class_sections
for each row execute function public.enforce_class_instructor_owner();

create or replace function public.generate_class_join_code(
  p_class_id uuid default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_code text;
begin
  if v_user_id is null
     or public.get_current_user_role_text() <> 'instructor' then
    raise exception 'Instructor access is required.';
  end if;

  v_code := public.create_class_join_code();

  if p_class_id is not null then
    update public.class_sections section
    set join_code = v_code
    where section.id = p_class_id
      and section.created_by = v_user_id
      and section.is_active = true;

    if not found then
      raise exception 'Class was not found, is inactive, or is not owned by you.';
    end if;
  end if;

  return v_code;
end;
$$;

create or replace function public.request_class_join(p_join_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_class public.class_sections%rowtype;
  v_request_id uuid;
begin
  if v_student_id is null
     or public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select section.* into v_class
  from public.class_sections section
  join public.profiles owner on owner.id = section.created_by
  where section.join_code = upper(trim(p_join_code))
    and section.is_active = true
    and owner.role::text = 'instructor';

  if not found then
    raise exception 'The class code is invalid or the class is no longer available.';
  end if;

  if exists (
    select 1 from public.class_memberships membership
    where membership.class_id = v_class.id
      and membership.student_id = v_student_id
  ) then
    raise exception 'You are already enrolled in this class.';
  end if;

  insert into public.class_join_requests (
    class_id, student_id, status, requested_at, reviewed_at, reviewed_by
  ) values (
    v_class.id, v_student_id, 'pending', now(), null, null
  )
  on conflict (class_id, student_id) do update set
    status = 'pending',
    requested_at = now(),
    reviewed_at = null,
    reviewed_by = null
  returning id into v_request_id;

  return jsonb_build_object(
    'requestId', v_request_id,
    'classId', v_class.id,
    'className', v_class.name,
    'status', 'pending'
  );
end;
$$;

create or replace function public.get_student_class_enrollment()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_student_id is null
     or public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select jsonb_build_object(
    'classes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', section.id,
        'name', section.name,
        'code', section.code,
        'academicTerm', section.academic_term,
        'isActive', section.is_active,
        'enrolledAt', membership.enrolled_at
      ) order by section.name)
      from public.class_memberships membership
      join public.class_sections section on section.id = membership.class_id
      join public.profiles owner on owner.id = section.created_by
      where membership.student_id = v_student_id
        and section.is_active = true
        and owner.role::text = 'instructor'
    ), '[]'::jsonb),
    'requests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', request.id,
        'classId', section.id,
        'className', section.name,
        'classCode', section.code,
        'isActive', section.is_active,
        'status', request.status,
        'requestedAt', request.requested_at,
        'reviewedAt', request.reviewed_at
      ) order by request.requested_at desc)
      from public.class_join_requests request
      join public.class_sections section on section.id = request.class_id
      join public.profiles owner on owner.id = section.created_by
      where request.student_id = v_student_id
        and section.is_active = true
        and owner.role::text = 'instructor'
        and not exists (
          select 1 from public.class_memberships membership
          where membership.class_id = request.class_id
            and membership.student_id = v_student_id
        )
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.review_class_join_request(
  p_request_id uuid,
  p_decision text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.class_join_requests%rowtype;
begin
  if v_user_id is null
     or public.get_current_user_role_text() <> 'instructor' then
    raise exception 'Instructor access is required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select request.* into v_request
  from public.class_join_requests request
  join public.class_sections section on section.id = request.class_id
  join public.profiles owner on owner.id = section.created_by
  where request.id = p_request_id
    and request.status = 'pending'
    and section.created_by = v_user_id
    and section.is_active = true
    and owner.role::text = 'instructor'
  for update of request;

  if not found then
    raise exception 'Pending request was not found or the class is no longer available.';
  end if;

  update public.class_join_requests set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = v_user_id
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.class_memberships (class_id, student_id)
    values (v_request.class_id, v_request.student_id)
    on conflict (class_id, student_id) do nothing;
  end if;

  return true;
end;
$$;

create or replace function public.add_student_to_class_by_email(
  p_class_id uuid,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_student_id uuid;
  v_student_name text;
begin
  if v_user_id is null
     or public.get_current_user_role_text() <> 'instructor' then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1
    from public.class_sections section
    join public.profiles owner on owner.id = section.created_by
    where section.id = p_class_id
      and section.created_by = v_user_id
      and section.is_active = true
      and owner.role::text = 'instructor'
  ) then
    raise exception 'Class was not found, is inactive, or is not owned by you.';
  end if;

  select profile.id, profile.full_name
  into v_student_id, v_student_name
  from auth.users auth_user
  join public.profiles profile on profile.id = auth_user.id
  where lower(auth_user.email) = lower(trim(p_email))
    and profile.role::text = 'student';

  if v_student_id is null then
    raise exception 'No student account was found for that email address.';
  end if;

  insert into public.class_memberships (class_id, student_id)
  values (p_class_id, v_student_id)
  on conflict (class_id, student_id) do nothing;

  update public.class_join_requests set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = v_user_id
  where class_id = p_class_id
    and student_id = v_student_id;

  return jsonb_build_object(
    'studentId', v_student_id,
    'fullName', v_student_name,
    'email', lower(trim(p_email))
  );
end;
$$;

revoke all on function public.enforce_class_instructor_owner() from public;
revoke all on function public.generate_class_join_code(uuid) from public;
revoke all on function public.request_class_join(text) from public;
revoke all on function public.get_student_class_enrollment() from public;
revoke all on function public.review_class_join_request(uuid, text) from public;
revoke all on function public.add_student_to_class_by_email(uuid, text) from public;

grant execute on function public.generate_class_join_code(uuid) to authenticated;
grant execute on function public.request_class_join(text) to authenticated;
grant execute on function public.get_student_class_enrollment() to authenticated;
grant execute on function public.review_class_join_request(uuid, text) to authenticated;
grant execute on function public.add_student_to_class_by_email(uuid, text) to authenticated;
