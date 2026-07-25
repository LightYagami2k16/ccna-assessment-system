-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.6: CLASS-GROUPED RESULTS AND BULK MANAGEMENT
-- =========================================================

-- Return instructor results with the best matching class for each attempt.
-- When a student belongs to more than one class, a class assigned to the
-- attempted quiz is preferred, followed by the newest matching class.
create or replace function public.get_instructor_attempts()
returns jsonb
language plpgsql
stable
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

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'attemptId', attempt.id,
        'quizId', quiz.id,
        'quizTitle', quiz.title,
        'courseCode', course.code,
        'courseTitle', course.title,
        'moduleCode', module.code,
        'classId', class_match.id,
        'className', coalesce(class_match.name, 'Unassigned students'),
        'classCode', class_match.code,
        'academicTerm', class_match.academic_term,
        'studentId', profile.id,
        'studentName', coalesce(
          nullif(trim(profile.full_name), ''),
          split_part(auth_user.email, '@', 1),
          'Unnamed student'
        ),
        'studentEmail', auth_user.email,
        'attemptNumber', attempt.attempt_number,
        'status', attempt.status,
        'startedAt', attempt.started_at,
        'expiresAt', attempt.expires_at,
        'submittedAt', attempt.submitted_at,
        'scorePoints', attempt.score_points,
        'maximumPoints', attempt.maximum_points,
        'percentage', attempt.percentage,
        'passed', attempt.passed,
        'answeredCount', (
          select count(answer.id)
          from public.quiz_attempt_questions attempt_question
          left join public.quiz_attempt_answers answer
            on answer.attempt_question_id = attempt_question.id
          where attempt_question.attempt_id = attempt.id
        ),
        'questionCount', (
          select count(*)
          from public.quiz_attempt_questions attempt_question
          where attempt_question.attempt_id = attempt.id
        ),
        'timeUsedSeconds', greatest(
          0,
          extract(
            epoch from (
              coalesce(
                attempt.submitted_at,
                least(now(), attempt.expires_at)
              ) - attempt.started_at
            )
          )::integer
        )
      )
      order by
        coalesce(class_match.name, 'Unassigned students'),
        profile.full_name,
        quiz.title,
        attempt.started_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
  join public.courses course
    on course.id = quiz.course_id
  left join public.modules module
    on module.id = quiz.module_id
  join public.profiles profile
    on profile.id = attempt.student_id
  left join auth.users auth_user
    on auth_user.id = profile.id
  left join lateral (
    select
      section.id,
      section.name,
      section.code,
      section.academic_term
    from public.class_memberships membership
    join public.class_sections section
      on section.id = membership.class_id
    left join public.quiz_assignments assignment
      on assignment.class_id = section.id
     and assignment.quiz_id = attempt.quiz_id
    where membership.student_id = attempt.student_id
      and (
        section.created_by = v_user_id
        or v_role = 'admin'
      )
    order by
      (assignment.id is not null) desc,
      section.is_active desc,
      section.created_at desc
    limit 1
  ) class_match on true
  where quiz.created_by = v_user_id
     or v_role = 'admin';

  return v_result;
end;
$$;

-- Permanently remove selected attempts and their cascaded answers,
-- question snapshots, and integrity events. Remaining attempts for each
-- affected student and quiz are renumbered to keep attempt limits working.
create or replace function public.reset_instructor_quiz_attempts(
  p_attempt_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_count integer := 0;
  v_pairs jsonb := '[]'::jsonb;
  v_pair jsonb;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_attempt_ids is null
     or cardinality(p_attempt_ids) = 0 then
    raise exception 'Select at least one attempt to reset.';
  end if;

  if exists (
    select 1
    from unnest(p_attempt_ids) selected(attempt_id)
    left join public.quiz_attempts attempt
      on attempt.id = selected.attempt_id
    left join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    where attempt.id is null
       or not (
         quiz.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'One or more attempts cannot be reset.';
  end if;

  select coalesce(
    jsonb_agg(
      distinct jsonb_build_object(
        'quizId', attempt.quiz_id,
        'studentId', attempt.student_id
      )
    ),
    '[]'::jsonb
  )
  into v_pairs
  from public.quiz_attempts attempt
  where attempt.id = any(p_attempt_ids);

  delete from public.quiz_attempts
  where id = any(p_attempt_ids);

  get diagnostics v_deleted_count = row_count;

  for v_pair in
    select value
    from jsonb_array_elements(v_pairs)
  loop
    -- Move numbers outside the normal range before assigning the new
    -- sequence so the unique constraint cannot collide during updates.
    update public.quiz_attempts
    set attempt_number = attempt_number + 100000
    where quiz_id = (v_pair->>'quizId')::uuid
      and student_id = (v_pair->>'studentId')::uuid;

    with ranked as (
      select
        id,
        row_number() over (
          order by started_at, id
        )::integer as new_attempt_number
      from public.quiz_attempts
      where quiz_id = (v_pair->>'quizId')::uuid
        and student_id = (v_pair->>'studentId')::uuid
    )
    update public.quiz_attempts attempt
    set attempt_number = ranked.new_attempt_number
    from ranked
    where attempt.id = ranked.id;
  end loop;

  return v_deleted_count;
end;
$$;

create or replace function public.delete_instructor_questions_bulk(
  p_question_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_count integer := 0;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_question_ids is null
     or cardinality(p_question_ids) = 0 then
    raise exception 'Select at least one question to delete.';
  end if;

  if exists (
    select 1
    from unnest(p_question_ids) selected(question_id)
    left join public.questions question
      on question.id = selected.question_id
    where question.id is null
       or question.status <> 'draft'
       or not (
         question.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'Only your draft questions can be deleted.';
  end if;

  if exists (
    select 1
    from public.quiz_attempt_questions attempt_question
    where attempt_question.question_id = any(p_question_ids)
  ) then
    raise exception 'A selected question has student attempts and cannot be deleted.';
  end if;

  delete from public.questions
  where id = any(p_question_ids);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

create or replace function public.delete_instructor_quizzes_bulk(
  p_quiz_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_count integer := 0;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_quiz_ids is null
     or cardinality(p_quiz_ids) = 0 then
    raise exception 'Select at least one quiz to delete.';
  end if;

  if exists (
    select 1
    from unnest(p_quiz_ids) selected(quiz_id)
    left join public.quizzes quiz
      on quiz.id = selected.quiz_id
    where quiz.id is null
       or quiz.status <> 'draft'
       or not (
         quiz.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'Only your draft quizzes can be deleted.';
  end if;

  if exists (
    select 1
    from public.quiz_attempts attempt
    where attempt.quiz_id = any(p_quiz_ids)
  ) then
    raise exception 'A selected quiz has student attempts and cannot be deleted.';
  end if;

  delete from public.quizzes
  where id = any(p_quiz_ids);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

create or replace function public.delete_class_sections_bulk(
  p_class_ids uuid[]
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_deleted_count integer := 0;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_class_ids is null
     or cardinality(p_class_ids) = 0 then
    raise exception 'Select at least one class to delete.';
  end if;

  if exists (
    select 1
    from unnest(p_class_ids) selected(class_id)
    left join public.class_sections section
      on section.id = selected.class_id
    where section.id is null
       or not (
         section.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'One or more classes cannot be deleted.';
  end if;

  delete from public.class_sections
  where id = any(p_class_ids);

  get diagnostics v_deleted_count = row_count;
  return v_deleted_count;
end;
$$;

revoke all on function public.get_instructor_attempts() from public;
revoke all on function public.reset_instructor_quiz_attempts(uuid[]) from public;
revoke all on function public.delete_instructor_questions_bulk(uuid[]) from public;
revoke all on function public.delete_instructor_quizzes_bulk(uuid[]) from public;
revoke all on function public.delete_class_sections_bulk(uuid[]) from public;

grant execute on function public.get_instructor_attempts() to authenticated;
grant execute on function public.reset_instructor_quiz_attempts(uuid[]) to authenticated;
grant execute on function public.delete_instructor_questions_bulk(uuid[]) to authenticated;
grant execute on function public.delete_instructor_quizzes_bulk(uuid[]) to authenticated;
grant execute on function public.delete_class_sections_bulk(uuid[]) to authenticated;

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'get_instructor_attempts',
    'reset_instructor_quiz_attempts',
    'delete_instructor_questions_bulk',
    'delete_instructor_quizzes_bulk',
    'delete_class_sections_bulk'
  )
order by routine_name;
