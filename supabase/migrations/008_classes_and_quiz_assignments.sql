-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.5: CLASSES, ENROLLMENT, AND QUIZ ASSIGNMENTS
-- =========================================================

alter table public.quizzes
add column if not exists access_mode text
not null default 'all_students';

alter table public.quizzes
drop constraint if exists quizzes_access_mode_valid;

alter table public.quizzes
add constraint quizzes_access_mode_valid
check (access_mode in ('all_students', 'assigned_classes'));

create table if not exists public.class_sections (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code text not null,
  academic_term text,
  created_by uuid not null
    references public.profiles(id)
    on delete cascade,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (created_by, code)
);

create table if not exists public.class_memberships (
  class_id uuid not null
    references public.class_sections(id)
    on delete cascade,
  student_id uuid not null
    references public.profiles(id)
    on delete cascade,
  enrolled_at timestamptz not null default now(),
  primary key (class_id, student_id)
);

create table if not exists public.quiz_assignments (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null
    references public.quizzes(id)
    on delete cascade,
  class_id uuid not null
    references public.class_sections(id)
    on delete cascade,
  assigned_by uuid not null
    references public.profiles(id)
    on delete cascade,
  created_at timestamptz not null default now(),
  unique (quiz_id, class_id)
);

create index if not exists class_sections_created_by_idx
on public.class_sections(created_by);

create index if not exists class_memberships_student_idx
on public.class_memberships(student_id);

create index if not exists quiz_assignments_quiz_idx
on public.quiz_assignments(quiz_id);

create index if not exists quiz_assignments_class_idx
on public.quiz_assignments(class_id);

drop trigger if exists class_sections_set_updated_at
on public.class_sections;

create trigger class_sections_set_updated_at
before update on public.class_sections
for each row
execute function public.set_updated_at();

alter table public.class_sections enable row level security;
alter table public.class_memberships enable row level security;
alter table public.quiz_assignments enable row level security;

grant select on public.class_sections to authenticated;
grant select on public.class_memberships to authenticated;
grant select on public.quiz_assignments to authenticated;

create policy "Instructors can view their classes"
on public.class_sections
for select
to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() = 'administrator'
);

create policy "Users can view relevant class memberships"
on public.class_memberships
for select
to authenticated
using (
  student_id = auth.uid()
  or public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Users can view relevant quiz assignments"
on public.quiz_assignments
for select
to authenticated
using (
  public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create or replace function public.student_can_access_quiz(
  p_quiz_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quizzes quiz
    where quiz.id = p_quiz_id
      and quiz.status = 'published'
      and (
        quiz.access_mode = 'all_students'
        or (
          quiz.access_mode = 'assigned_classes'
          and exists (
            select 1
            from public.quiz_assignments assignment
            join public.class_memberships membership
              on membership.class_id = assignment.class_id
            join public.class_sections section
              on section.id = assignment.class_id
            where assignment.quiz_id = quiz.id
              and membership.student_id = p_student_id
              and section.is_active = true
          )
        )
      )
  );
$$;

drop policy if exists "Students can view published quizzes"
on public.quizzes;

create policy "Students can view available quizzes"
on public.quizzes
for select
to authenticated
using (
  public.get_current_user_role_text() = 'student'
  and public.student_can_access_quiz(id, auth.uid())
);

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

create or replace function public.save_class_section(
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
  v_class_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_student_ids jsonb := coalesce(p_payload->'studentIds', '[]'::jsonb);
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if nullif(trim(p_payload->>'name'), '') is null
     or nullif(trim(p_payload->>'code'), '') is null then
    raise exception 'Class name and code are required.';
  end if;

  if jsonb_typeof(v_student_ids) <> 'array' then
    raise exception 'Student IDs must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_student_ids) selected(student_id)
    left join public.profiles profile
      on profile.id = selected.student_id::uuid
     and profile.role::text = 'student'
    where profile.id is null
  ) then
    raise exception 'One or more selected students are invalid.';
  end if;

  if v_class_id is null then
    insert into public.class_sections (
      name,
      code,
      academic_term,
      created_by,
      is_active
    )
    values (
      trim(p_payload->>'name'),
      upper(trim(p_payload->>'code')),
      nullif(trim(p_payload->>'academicTerm'), ''),
      v_user_id,
      coalesce((p_payload->>'isActive')::boolean, true)
    )
    returning id into v_class_id;
  else
    if not exists (
      select 1
      from public.class_sections
      where id = v_class_id
        and (
          created_by = v_user_id
          or v_role = 'admin'
        )
    ) then
      raise exception 'Class was not found or cannot be changed.';
    end if;

    update public.class_sections
    set
      name = trim(p_payload->>'name'),
      code = upper(trim(p_payload->>'code')),
      academic_term = nullif(trim(p_payload->>'academicTerm'), ''),
      is_active = coalesce((p_payload->>'isActive')::boolean, true)
    where id = v_class_id;

    delete from public.class_memberships
    where class_id = v_class_id;
  end if;

  insert into public.class_memberships (
    class_id,
    student_id
  )
  select
    v_class_id,
    selected.student_id::uuid
  from jsonb_array_elements_text(v_student_ids) selected(student_id)
  on conflict (class_id, student_id) do nothing;

  return v_class_id;
end;
$$;

create or replace function public.delete_class_section(
  p_class_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  delete from public.class_sections
  where id = p_class_id
    and (
      created_by = v_user_id
      or v_role = 'admin'
    );

  if not found then
    raise exception 'Class was not found or cannot be deleted.';
  end if;

  return true;
end;
$$;

create or replace function public.save_quiz_access(
  p_quiz_id uuid,
  p_access_mode text,
  p_class_ids jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_class_ids jsonb := coalesce(p_class_ids, '[]'::jsonb);
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_access_mode not in ('all_students', 'assigned_classes') then
    raise exception 'Select a valid quiz access mode.';
  end if;

  if not exists (
    select 1
    from public.quizzes
    where id = p_quiz_id
      and (
        created_by = v_user_id
        or v_role = 'admin'
      )
  ) then
    raise exception 'Quiz was not found or cannot be assigned.';
  end if;

  if jsonb_typeof(v_class_ids) <> 'array' then
    raise exception 'Class IDs must be an array.';
  end if;

  if p_access_mode = 'assigned_classes'
     and jsonb_array_length(v_class_ids) = 0 then
    raise exception 'Select at least one class.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_class_ids) selected(class_id)
    left join public.class_sections section
      on section.id = selected.class_id::uuid
     and (
       section.created_by = v_user_id
       or v_role = 'admin'
     )
    where section.id is null
  ) then
    raise exception 'One or more selected classes are invalid.';
  end if;

  update public.quizzes
  set access_mode = p_access_mode
  where id = p_quiz_id;

  delete from public.quiz_assignments
  where quiz_id = p_quiz_id;

  if p_access_mode = 'assigned_classes' then
    insert into public.quiz_assignments (
      quiz_id,
      class_id,
      assigned_by
    )
    select
      p_quiz_id,
      selected.class_id::uuid,
      v_user_id
    from jsonb_array_elements_text(v_class_ids) selected(class_id);
  end if;

  return true;
end;
$$;

create or replace function public.get_available_quizzes_for_student()
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', quiz.id,
        'title', quiz.title,
        'description', quiz.description,
        'instructions', quiz.instructions,
        'duration_minutes', quiz.duration_minutes,
        'max_attempts', quiz.max_attempts,
        'passing_score', quiz.passing_score,
        'available_from', quiz.available_from,
        'available_until', quiz.available_until,
        'show_results_immediately', quiz.show_results_immediately,
        'randomize_questions', quiz.randomize_questions,
        'randomize_options', quiz.randomize_options,
        'access_mode', quiz.access_mode,
        'created_at', quiz.created_at,
        'courses', jsonb_build_object(
          'id', course.id,
          'code', course.code,
          'title', course.title
        ),
        'modules',
        case
          when module.id is null then null
          else jsonb_build_object(
            'id', module.id,
            'code', module.code,
            'title', module.title
          )
        end
      )
      order by quiz.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quizzes quiz
  join public.courses course
    on course.id = quiz.course_id
  left join public.modules module
    on module.id = quiz.module_id
  where public.student_can_access_quiz(quiz.id, v_student_id)
    and (
      quiz.available_from is null
      or quiz.available_from <= now()
    )
    and (
      quiz.available_until is null
      or quiz.available_until >= now()
    );

  return v_result;
end;
$$;

create or replace function public.start_quiz_attempt(
    p_quiz_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid;
    v_quiz public.quizzes%rowtype;
    v_existing_attempt_id uuid;
    v_attempt_count integer;
    v_attempt_id uuid;
    v_maximum_points numeric(10,2);
begin
    v_student_id := auth.uid();

    if v_student_id is null then
        raise exception 'You must be signed in.';
    end if;

    if public.get_current_user_role_text() <> 'student' then
        raise exception 'Only students may start a quiz.';
    end if;

    select *
    into v_quiz
    from public.quizzes
    where id = p_quiz_id
      and status = 'published';

    if not found then
        raise exception 'Quiz was not found or is not published.';
    end if;

    if not public.student_can_access_quiz(p_quiz_id, v_student_id) then
        raise exception 'This quiz is not assigned to your class.';
    end if;

    if v_quiz.available_from is not null
       and now() < v_quiz.available_from then
        raise exception 'This quiz is not available yet.';
    end if;

    if v_quiz.available_until is not null
       and now() > v_quiz.available_until then
        raise exception 'This quiz is no longer available.';
    end if;

    select id
    into v_existing_attempt_id
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = v_student_id
      and status = 'in_progress'
      and expires_at > now()
    order by started_at desc
    limit 1;

    if v_existing_attempt_id is not null then
        return v_existing_attempt_id;
    end if;

    update public.quiz_attempts
    set status = 'expired'
    where quiz_id = p_quiz_id
      and student_id = v_student_id
      and status = 'in_progress'
      and expires_at <= now();

    select count(*)
    into v_attempt_count
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = v_student_id;

    if v_attempt_count >= v_quiz.max_attempts then
        raise exception 'Maximum quiz attempts reached.';
    end if;

    select coalesce(sum(question.points), 0)
    into v_maximum_points
    from public.quiz_questions quiz_question
    join public.questions question
      on question.id = quiz_question.question_id
    where quiz_question.quiz_id = p_quiz_id;

    if v_maximum_points <= 0 then
        raise exception 'This quiz does not contain any questions.';
    end if;

    insert into public.quiz_attempts (
        quiz_id,
        student_id,
        attempt_number,
        status,
        started_at,
        expires_at,
        maximum_points
    )
    values (
        p_quiz_id,
        v_student_id,
        v_attempt_count + 1,
        'in_progress',
        now(),
        now() + make_interval(mins => v_quiz.duration_minutes),
        v_maximum_points
    )
    returning id into v_attempt_id;

    if v_quiz.randomize_questions then
        insert into public.quiz_attempt_questions (
            attempt_id,
            question_id,
            sort_order,
            points
        )
        select
            v_attempt_id,
            question.id,
            row_number() over (order by random())::integer,
            question.points
        from public.quiz_questions quiz_question
        join public.questions question
          on question.id = quiz_question.question_id
        where quiz_question.quiz_id = p_quiz_id;
    else
        insert into public.quiz_attempt_questions (
            attempt_id,
            question_id,
            sort_order,
            points
        )
        select
            v_attempt_id,
            question.id,
            quiz_question.sort_order,
            question.points
        from public.quiz_questions quiz_question
        join public.questions question
          on question.id = quiz_question.question_id
        where quiz_question.quiz_id = p_quiz_id
        order by quiz_question.sort_order;
    end if;

    return v_attempt_id;
end;
$$;

revoke all on function public.student_can_access_quiz(uuid, uuid) from public;
revoke all on function public.get_assignment_workspace() from public;
revoke all on function public.save_class_section(jsonb) from public;
revoke all on function public.delete_class_section(uuid) from public;
revoke all on function public.save_quiz_access(uuid, text, jsonb) from public;
revoke all on function public.get_available_quizzes_for_student() from public;

grant execute on function public.student_can_access_quiz(uuid, uuid) to authenticated;
grant execute on function public.get_assignment_workspace() to authenticated;
grant execute on function public.save_class_section(jsonb) to authenticated;
grant execute on function public.delete_class_section(uuid) to authenticated;
grant execute on function public.save_quiz_access(uuid, text, jsonb) to authenticated;
grant execute on function public.get_available_quizzes_for_student() to authenticated;
