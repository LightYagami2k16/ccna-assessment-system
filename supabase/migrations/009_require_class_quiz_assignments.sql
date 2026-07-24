-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.5 HARDENING: REQUIRE CLASS ASSIGNMENT
-- =========================================================
-- Publishing a quiz does not make it visible by itself.
-- A student must be enrolled in an active class that has
-- been explicitly assigned to the quiz.

update public.quizzes
set access_mode = 'assigned_classes'
where access_mode <> 'assigned_classes';

alter table public.quizzes
alter column access_mode set default 'assigned_classes';

alter table public.quizzes
drop constraint if exists quizzes_access_mode_valid;

alter table public.quizzes
add constraint quizzes_access_mode_valid
check (access_mode = 'assigned_classes');

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
    join public.quiz_assignments assignment
      on assignment.quiz_id = quiz.id
    join public.class_sections section
      on section.id = assignment.class_id
    join public.class_memberships membership
      on membership.class_id = section.id
    where quiz.id = p_quiz_id
      and quiz.status = 'published'
      and quiz.access_mode = 'assigned_classes'
      and section.is_active = true
      and membership.student_id = p_student_id
  );
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

  if p_access_mode <> 'assigned_classes' then
    raise exception 'Every quiz must be assigned to at least one class.';
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

  if jsonb_typeof(v_class_ids) <> 'array'
     or jsonb_array_length(v_class_ids) = 0 then
    raise exception 'Select at least one class.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements_text(v_class_ids) selected(class_id)
    left join public.class_sections section
      on section.id = selected.class_id::uuid
     and section.is_active = true
     and (
       section.created_by = v_user_id
       or v_role = 'admin'
     )
    where section.id is null
  ) then
    raise exception 'One or more selected classes are invalid or inactive.';
  end if;

  update public.quizzes
  set access_mode = 'assigned_classes'
  where id = p_quiz_id;

  delete from public.quiz_assignments
  where quiz_id = p_quiz_id;

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

  return true;
end;
$$;

revoke all
on function public.student_can_access_quiz(uuid, uuid)
from public;

revoke all
on function public.save_quiz_access(uuid, text, jsonb)
from public;

grant execute
on function public.student_can_access_quiz(uuid, uuid)
to authenticated;

grant execute
on function public.save_quiz_access(uuid, text, jsonb)
to authenticated;

