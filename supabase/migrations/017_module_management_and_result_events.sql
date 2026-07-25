-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.10: MODULE MANAGEMENT AND RESULT EVENT COUNTS
-- =========================================================

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
  v_course_id uuid := nullif(p_payload->>'courseId', '')::uuid;
  v_code text := upper(trim(p_payload->>'code'));
  v_title text := trim(p_payload->>'title');
  v_description text := nullif(trim(p_payload->>'description'), '');
  v_sort_order integer := greatest(
    coalesce((p_payload->>'sortOrder')::integer, 0),
    0
  );
begin
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if v_course_id is null
     or not exists (
       select 1 from public.courses where id = v_course_id
     ) then
    raise exception 'Select a valid course.';
  end if;

  if v_code is null or v_code = '' then
    raise exception 'Module code is required.';
  end if;

  if v_title is null or v_title = '' then
    raise exception 'Module title is required.';
  end if;

  if nullif(p_payload->>'id', '') is null then
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
  when unique_violation then
    raise exception 'That module code already exists in the selected course.';
end;
$$;

create or replace function public.delete_instructor_module(
  p_module_id uuid
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
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if exists (
    select 1 from public.questions where module_id = p_module_id
  ) or exists (
    select 1 from public.quizzes where module_id = p_module_id
  ) then
    raise exception
      'This module is being used by a question or quiz and cannot be deleted.';
  end if;

  delete from public.modules where id = p_module_id;

  if not found then
    raise exception 'Module was not found.';
  end if;

  return true;
end;
$$;

revoke all on function public.save_instructor_module(jsonb) from public;
revoke all on function public.delete_instructor_module(uuid) from public;

grant execute on function public.save_instructor_module(jsonb)
to authenticated;
grant execute on function public.delete_instructor_module(uuid)
to authenticated;

-- Include the number of integrity events recorded for each attempt in
-- the instructor results workspace.
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
        'eventCount', (
          select count(*)
          from public.exam_integrity_events event
          where event.attempt_id = attempt.id
        ),
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
  join public.quizzes quiz on quiz.id = attempt.quiz_id
  join public.courses course on course.id = quiz.course_id
  left join public.modules module on module.id = quiz.module_id
  join public.profiles profile on profile.id = attempt.student_id
  left join auth.users auth_user on auth_user.id = profile.id
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

revoke all on function public.get_instructor_attempts() from public;
grant execute on function public.get_instructor_attempts()
to authenticated;
