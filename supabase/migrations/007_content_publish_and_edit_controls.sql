-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- QUESTION EDITING AND QUICK PUBLISH CONTROLS
-- =========================================================

create or replace function public.update_instructor_question(
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
  v_question_id uuid := (p_payload->>'id')::uuid;
  v_options jsonb := coalesce(p_payload->'options', '[]'::jsonb);
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
    from public.questions
    where id = v_question_id
      and status = 'draft'
      and (
        created_by = v_user_id
        or v_role = 'admin'
      )
  ) then
    raise exception 'Only an owned draft question can be edited.';
  end if;

  if exists (
    select 1
    from public.quiz_attempt_questions
    where question_id = v_question_id
  ) then
    raise exception 'This question has attempt history. Duplicate it instead of editing it.';
  end if;

  if nullif(trim(p_payload->>'title'), '') is null
     or nullif(trim(p_payload->>'questionText'), '') is null then
    raise exception 'Question title and text are required.';
  end if;

  if jsonb_typeof(v_options) <> 'array'
     or jsonb_array_length(v_options) < 2 then
    raise exception 'At least two answer options are required.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_options) option_row
    where nullif(trim(option_row->>'optionText'), '') is null
  ) then
    raise exception 'Every answer option must contain text.';
  end if;

  if not exists (
    select 1
    from jsonb_array_elements(v_options) option_row
    where coalesce((option_row->>'isCorrect')::boolean, false) = true
  ) then
    raise exception 'Select a correct answer.';
  end if;

  update public.questions
  set
    title = trim(p_payload->>'title'),
    question_text = trim(p_payload->>'questionText'),
    explanation = nullif(trim(p_payload->>'explanation'), ''),
    points = (p_payload->>'points')::numeric,
    difficulty = p_payload->>'difficulty'
  where id = v_question_id;

  delete from public.question_options
  where question_id = v_question_id;

  insert into public.question_options (
    question_id,
    option_text,
    is_correct,
    sort_order
  )
  select
    v_question_id,
    trim(option_row->>'optionText'),
    coalesce((option_row->>'isCorrect')::boolean, false),
    option_order::integer
  from jsonb_array_elements(v_options)
    with ordinality selected_option(
      option_row,
      option_order
    );

  return v_question_id;
end;
$$;

create or replace function public.set_instructor_question_status(
  p_question_id uuid,
  p_status text
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

  if p_status not in ('draft', 'published') then
    raise exception 'Question status must be draft or published.';
  end if;

  if not exists (
    select 1
    from public.questions
    where id = p_question_id
      and (
        created_by = v_user_id
        or v_role = 'admin'
      )
  ) then
    raise exception 'Question was not found or cannot be changed.';
  end if;

  if p_status = 'draft'
     and exists (
       select 1
       from public.quiz_questions quiz_question
       join public.quizzes quiz
         on quiz.id = quiz_question.quiz_id
       where quiz_question.question_id = p_question_id
         and quiz.status = 'published'
     ) then
    raise exception 'Unpublish every quiz using this question first.';
  end if;

  if p_status = 'published'
     and (
       (
         select count(*)
         from public.question_options
         where question_id = p_question_id
       ) < 2
       or not exists (
         select 1
         from public.question_options
         where question_id = p_question_id
           and is_correct = true
       )
     ) then
    raise exception 'A published question needs at least two options and a correct answer.';
  end if;

  update public.questions
  set status = p_status::public.content_status
  where id = p_question_id;

  return true;
end;
$$;

create or replace function public.set_instructor_quiz_status(
  p_quiz_id uuid,
  p_status text
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

  if p_status not in ('draft', 'published') then
    raise exception 'Quiz status must be draft or published.';
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
    raise exception 'Quiz was not found or cannot be changed.';
  end if;

  if p_status = 'published'
     and not exists (
       select 1
       from public.quiz_questions
       where quiz_id = p_quiz_id
     ) then
    raise exception 'Select at least one question before publishing.';
  end if;

  if p_status = 'published'
     and exists (
       select 1
       from public.quiz_questions quiz_question
       join public.questions question
         on question.id = quiz_question.question_id
       where quiz_question.quiz_id = p_quiz_id
         and question.status <> 'published'
     ) then
    raise exception 'Publish every selected question before publishing the quiz.';
  end if;

  update public.quizzes
  set status = p_status::public.content_status
  where id = p_quiz_id;

  return true;
end;
$$;

revoke all
on function public.update_instructor_question(jsonb)
from public;

revoke all
on function public.set_instructor_question_status(uuid, text)
from public;

revoke all
on function public.set_instructor_quiz_status(uuid, text)
from public;

grant execute
on function public.update_instructor_question(jsonb)
to authenticated;

grant execute
on function public.set_instructor_question_status(uuid, text)
to authenticated;

grant execute
on function public.set_instructor_quiz_status(uuid, text)
to authenticated;
