-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.4: INSTRUCTOR QUIZ BUILDER
-- =========================================================

create or replace function public.save_instructor_quiz(
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
  v_quiz_id uuid;
  v_course_id bigint;
  v_module_id uuid;
  v_status public.content_status;
  v_question_ids jsonb;
  v_question_count integer;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  v_quiz_id := nullif(p_payload->>'id', '')::uuid;
  v_course_id := (p_payload->>'courseId')::bigint;
  v_module_id := nullif(p_payload->>'moduleId', '')::uuid;
  v_status := coalesce(
    nullif(p_payload->>'status', '')::public.content_status,
    'draft'::public.content_status
  );
  v_question_ids := coalesce(
    p_payload->'questionIds',
    '[]'::jsonb
  );

  if nullif(trim(p_payload->>'title'), '') is null then
    raise exception 'Quiz title is required.';
  end if;

  if not exists (
    select 1
    from public.courses
    where id = v_course_id
  ) then
    raise exception 'The selected course was not found.';
  end if;

  if v_module_id is not null
     and not exists (
       select 1
       from public.modules
       where id = v_module_id
         and course_id = v_course_id
     ) then
    raise exception 'The selected module does not belong to this course.';
  end if;

  if jsonb_typeof(v_question_ids) <> 'array' then
    raise exception 'Question IDs must be an array.';
  end if;

  select count(*)
  into v_question_count
  from jsonb_array_elements_text(v_question_ids)
    as selected_question(question_id)
  join public.questions question
    on question.id = selected_question.question_id::uuid
  where question.course_id = v_course_id
    and (
      v_module_id is null
      or question.module_id is null
      or question.module_id = v_module_id
    );

  if v_question_count <> jsonb_array_length(v_question_ids) then
    raise exception 'One or more selected questions are invalid for this quiz.';
  end if;

  if v_status = 'published'
     and v_question_count = 0 then
    raise exception 'A published quiz must contain at least one question.';
  end if;

  if v_status = 'published'
     and exists (
       select 1
       from jsonb_array_elements_text(v_question_ids)
         as selected_question(question_id)
       join public.questions question
         on question.id = selected_question.question_id::uuid
       where question.status <> 'published'
     ) then
    raise exception 'Every question must be published before publishing the quiz.';
  end if;

  if v_status = 'published'
     and exists (
       select 1
       from jsonb_array_elements_text(v_question_ids)
         as selected_question(question_id)
       join public.questions question
         on question.id = selected_question.question_id::uuid
       where (
         select count(*)
         from public.question_options option_row
         where option_row.question_id = question.id
       ) < 2
       or not exists (
         select 1
         from public.question_options option_row
         where option_row.question_id = question.id
           and option_row.is_correct = true
       )
     ) then
    raise exception 'Every published quiz question needs at least two options and a correct answer.';
  end if;

  if nullif(p_payload->>'availableFrom', '') is not null
     and nullif(p_payload->>'availableUntil', '') is not null
     and (p_payload->>'availableFrom')::timestamptz
       >= (p_payload->>'availableUntil')::timestamptz then
    raise exception 'Available until must be later than available from.';
  end if;

  if v_quiz_id is null then
    insert into public.quizzes (
      course_id,
      module_id,
      created_by,
      title,
      description,
      instructions,
      status,
      passing_score,
      randomize_questions,
      randomize_options,
      duration_minutes,
      max_attempts,
      show_results_immediately,
      available_from,
      available_until
    )
    values (
      v_course_id,
      v_module_id,
      v_user_id,
      trim(p_payload->>'title'),
      nullif(trim(p_payload->>'description'), ''),
      nullif(trim(p_payload->>'instructions'), ''),
      v_status,
      coalesce((p_payload->>'passingScore')::numeric, 70),
      coalesce((p_payload->>'randomizeQuestions')::boolean, false),
      coalesce((p_payload->>'randomizeOptions')::boolean, false),
      coalesce((p_payload->>'durationMinutes')::integer, 15),
      coalesce((p_payload->>'maxAttempts')::integer, 1),
      coalesce((p_payload->>'showResultsImmediately')::boolean, true),
      nullif(p_payload->>'availableFrom', '')::timestamptz,
      nullif(p_payload->>'availableUntil', '')::timestamptz
    )
    returning id into v_quiz_id;
  else
    if not exists (
      select 1
      from public.quizzes
      where id = v_quiz_id
        and (
          created_by = v_user_id
          or v_role = 'admin'
        )
    ) then
      raise exception 'Quiz was not found or cannot be edited.';
    end if;

    update public.quizzes
    set
      course_id = v_course_id,
      module_id = v_module_id,
      title = trim(p_payload->>'title'),
      description = nullif(trim(p_payload->>'description'), ''),
      instructions = nullif(trim(p_payload->>'instructions'), ''),
      status = v_status,
      passing_score = coalesce((p_payload->>'passingScore')::numeric, 70),
      randomize_questions = coalesce((p_payload->>'randomizeQuestions')::boolean, false),
      randomize_options = coalesce((p_payload->>'randomizeOptions')::boolean, false),
      duration_minutes = coalesce((p_payload->>'durationMinutes')::integer, 15),
      max_attempts = coalesce((p_payload->>'maxAttempts')::integer, 1),
      show_results_immediately = coalesce((p_payload->>'showResultsImmediately')::boolean, true),
      available_from = nullif(p_payload->>'availableFrom', '')::timestamptz,
      available_until = nullif(p_payload->>'availableUntil', '')::timestamptz
    where id = v_quiz_id;

    delete from public.quiz_questions
    where quiz_id = v_quiz_id;
  end if;

  insert into public.quiz_questions (
    quiz_id,
    question_id,
    sort_order
  )
  select
    v_quiz_id,
    question_id::uuid,
    question_order::integer
  from jsonb_array_elements_text(v_question_ids)
    with ordinality selected_question(
      question_id,
      question_order
    );

  return v_quiz_id;
end;
$$;

create or replace function public.delete_instructor_quiz(
  p_quiz_id uuid
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

  if not exists (
    select 1
    from public.quizzes
    where id = p_quiz_id
      and status = 'draft'
      and (
        created_by = v_user_id
        or v_role = 'admin'
      )
  ) then
    raise exception 'Only an unused draft quiz can be deleted.';
  end if;

  if exists (
    select 1
    from public.quiz_attempts
    where quiz_id = p_quiz_id
  ) then
    raise exception 'This quiz has attempts and cannot be deleted.';
  end if;

  delete from public.quizzes
  where id = p_quiz_id;

  return true;
end;
$$;

revoke all
on function public.save_instructor_quiz(jsonb)
from public;

revoke all
on function public.delete_instructor_quiz(uuid)
from public;

grant execute
on function public.save_instructor_quiz(jsonb)
to authenticated;

grant execute
on function public.delete_instructor_quiz(uuid)
to authenticated;
