-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.7: CLASS JOIN CODES, QR ENROLLMENT, AND APPROVALS
-- =========================================================

create or replace function public.create_class_join_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  v_code text;
begin
  loop
    v_code :=
      chr(65 + floor(random() * 26)::integer)
      || floor(random() * 10)::integer::text
      || upper(substring(md5(random()::text || clock_timestamp()::text), 1, 6));

    exit when not exists (
      select 1
      from public.class_sections
      where join_code = v_code
    );
  end loop;

  return v_code;
end;
$$;

alter table public.class_sections
add column if not exists join_code text;

update public.class_sections
set join_code = public.create_class_join_code()
where join_code is null;

alter table public.class_sections
alter column join_code set default public.create_class_join_code();

alter table public.class_sections
alter column join_code set not null;

alter table public.class_sections
drop constraint if exists class_sections_join_code_format;

alter table public.class_sections
add constraint class_sections_join_code_format
check (join_code ~ '^[A-Z0-9]{8}$');

create unique index if not exists class_sections_join_code_unique_idx
on public.class_sections(join_code);

create table if not exists public.class_join_requests (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null
    references public.class_sections(id)
    on delete cascade,
  student_id uuid not null
    references public.profiles(id)
    on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid
    references public.profiles(id)
    on delete set null,
  unique (class_id, student_id)
);

create index if not exists class_join_requests_class_status_idx
on public.class_join_requests(class_id, status);

create index if not exists class_join_requests_student_idx
on public.class_join_requests(student_id);

alter table public.class_join_requests enable row level security;

grant select on public.class_join_requests to authenticated;

drop policy if exists "Students can view their class join requests"
on public.class_join_requests;

create policy "Students can view their class join requests"
on public.class_join_requests
for select
to authenticated
using (student_id = auth.uid());

drop policy if exists "Instructors can view class join requests"
on public.class_join_requests;

create policy "Instructors can view class join requests"
on public.class_join_requests
for select
to authenticated
using (
  exists (
    select 1
    from public.class_sections section
    where section.id = class_join_requests.class_id
      and (
        section.created_by = auth.uid()
        or public.get_current_user_role_text() = 'administrator'
      )
  )
);

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
  v_role text;
  v_code text;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  v_code := public.create_class_join_code();

  if p_class_id is not null then
    update public.class_sections
    set join_code = v_code
    where id = p_class_id
      and (
        created_by = v_user_id
        or v_role = 'admin'
      );

    if not found then
      raise exception 'Class was not found or cannot be changed.';
    end if;
  end if;

  return v_code;
end;
$$;

create or replace function public.request_class_join(
  p_join_code text
)
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

  select *
  into v_class
  from public.class_sections
  where join_code = upper(trim(p_join_code))
    and is_active = true;

  if not found then
    raise exception 'The class code is invalid or the class is inactive.';
  end if;

  if exists (
    select 1
    from public.class_memberships membership
    where membership.class_id = v_class.id
      and membership.student_id = v_student_id
  ) then
    raise exception 'You are already enrolled in this class.';
  end if;

  insert into public.class_join_requests (
    class_id,
    student_id,
    status,
    requested_at,
    reviewed_at,
    reviewed_by
  )
  values (
    v_class.id,
    v_student_id,
    'pending',
    now(),
    null,
    null
  )
  on conflict (class_id, student_id)
  do update set
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
    'classes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', section.id,
            'name', section.name,
            'code', section.code,
            'academicTerm', section.academic_term,
            'isActive', section.is_active,
            'enrolledAt', membership.enrolled_at
          )
          order by section.name
        )
        from public.class_memberships membership
        join public.class_sections section
          on section.id = membership.class_id
        where membership.student_id = v_student_id
      ),
      '[]'::jsonb
    ),
    'requests',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'classId', section.id,
            'className', section.name,
            'classCode', section.code,
            'status', request.status,
            'requestedAt', request.requested_at,
            'reviewedAt', request.reviewed_at
          )
          order by request.requested_at desc
        )
        from public.class_join_requests request
        join public.class_sections section
          on section.id = request.class_id
        where request.student_id = v_student_id
          and not exists (
            select 1
            from public.class_memberships membership
            where membership.class_id = request.class_id
              and membership.student_id = v_student_id
          )
      ),
      '[]'::jsonb
    )
  )
  into v_result;

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
  v_role text;
  v_request public.class_join_requests%rowtype;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select request.*
  into v_request
  from public.class_join_requests request
  join public.class_sections section
    on section.id = request.class_id
  where request.id = p_request_id
    and request.status = 'pending'
    and (
      section.created_by = v_user_id
      or v_role = 'admin'
    )
  for update of request;

  if not found then
    raise exception 'Pending request was not found or cannot be reviewed.';
  end if;

  update public.class_join_requests
  set
    status = p_decision,
    reviewed_at = now(),
    reviewed_by = v_user_id
  where id = p_request_id;

  if p_decision = 'approved' then
    insert into public.class_memberships (
      class_id,
      student_id
    )
    values (
      v_request.class_id,
      v_request.student_id
    )
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
  v_role text;
  v_student_id uuid;
  v_student_name text;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1
    from public.class_sections section
    where section.id = p_class_id
      and (
        section.created_by = v_user_id
        or v_role = 'admin'
      )
  ) then
    raise exception 'Class was not found or cannot be changed.';
  end if;

  select profile.id, profile.full_name
  into v_student_id, v_student_name
  from auth.users auth_user
  join public.profiles profile
    on profile.id = auth_user.id
  where lower(auth_user.email) = lower(trim(p_email))
    and profile.role::text = 'student';

  if v_student_id is null then
    raise exception 'No student account was found for that email address.';
  end if;

  insert into public.class_memberships (
    class_id,
    student_id
  )
  values (
    p_class_id,
    v_student_id
  )
  on conflict (class_id, student_id) do nothing;

  update public.class_join_requests
  set
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

create or replace function public.get_assignment_workspace()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  select jsonb_build_object(
    'students',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', profile.id,
            'fullName', profile.full_name,
            'email', auth_user.email
          )
          order by profile.full_name, auth_user.email
        )
        from public.profiles profile
        left join auth.users auth_user
          on auth_user.id = profile.id
        where profile.role::text = 'student'
      ),
      '[]'::jsonb
    ),
    'classes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', section.id,
            'name', section.name,
            'code', section.code,
            'joinCode', section.join_code,
            'academicTerm', section.academic_term,
            'isActive', section.is_active,
            'studentIds',
            coalesce(
              (
                select jsonb_agg(membership.student_id)
                from public.class_memberships membership
                where membership.class_id = section.id
              ),
              '[]'::jsonb
            )
          )
          order by section.created_at desc
        )
        from public.class_sections section
        where section.created_by = v_user_id
          or v_role = 'admin'
      ),
      '[]'::jsonb
    ),
    'approvalRequests',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'classId', section.id,
            'className', section.name,
            'classCode', section.code,
            'studentId', profile.id,
            'studentName', profile.full_name,
            'studentEmail', auth_user.email,
            'status', request.status,
            'requestedAt', request.requested_at
          )
          order by request.requested_at
        )
        from public.class_join_requests request
        join public.class_sections section
          on section.id = request.class_id
        join public.profiles profile
          on profile.id = request.student_id
        left join auth.users auth_user
          on auth_user.id = request.student_id
        where request.status = 'pending'
          and (
            section.created_by = v_user_id
            or v_role = 'admin'
          )
      ),
      '[]'::jsonb
    ),
    'quizzes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', quiz.id,
            'title', quiz.title,
            'status', quiz.status,
            'accessMode', quiz.access_mode,
            'courseCode', course.code,
            'classIds',
            coalesce(
              (
                select jsonb_agg(assignment.class_id)
                from public.quiz_assignments assignment
                where assignment.quiz_id = quiz.id
              ),
              '[]'::jsonb
            )
          )
          order by quiz.created_at desc
        )
        from public.quizzes quiz
        join public.courses course
          on course.id = quiz.course_id
        where quiz.created_by = v_user_id
          or v_role = 'admin'
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.create_class_join_code() from public;
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

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'generate_class_join_code',
    'request_class_join',
    'get_student_class_enrollment',
    'review_class_join_request',
    'add_student_to_class_by_email'
  )
order by routine_name;
