-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.6: BULK PUBLISH AND UNPUBLISH CONTROLS
-- =========================================================

create or replace function public.set_instructor_questions_status_bulk(
  p_question_ids uuid[],
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_count integer := 0;
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

  if p_question_ids is null
     or cardinality(p_question_ids) = 0 then
    raise exception 'Select at least one question.';
  end if;

  if exists (
    select 1
    from unnest(p_question_ids) selected(question_id)
    left join public.questions question
      on question.id = selected.question_id
    where question.id is null
       or not (
         question.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'One or more questions cannot be changed.';
  end if;

  if p_status = 'draft'
     and exists (
       select 1
       from public.quiz_questions quiz_question
       join public.quizzes quiz
         on quiz.id = quiz_question.quiz_id
       where quiz_question.question_id = any(p_question_ids)
         and quiz.status = 'published'
     ) then
    raise exception 'Unpublish every quiz using the selected questions first.';
  end if;

  if p_status = 'published'
     and exists (
       select 1
       from public.questions question
       where question.id = any(p_question_ids)
         and (
           (
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
         )
     ) then
    raise exception 'Every published question needs at least two options and a correct answer.';
  end if;

  update public.questions
  set status = p_status::public.content_status
  where id = any(p_question_ids);

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

create or replace function public.set_instructor_quizzes_status_bulk(
  p_quiz_ids uuid[],
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_updated_count integer := 0;
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

  if p_quiz_ids is null
     or cardinality(p_quiz_ids) = 0 then
    raise exception 'Select at least one quiz.';
  end if;

  if exists (
    select 1
    from unnest(p_quiz_ids) selected(quiz_id)
    left join public.quizzes quiz
      on quiz.id = selected.quiz_id
    where quiz.id is null
       or not (
         quiz.created_by = v_user_id
         or v_role = 'admin'
       )
  ) then
    raise exception 'One or more quizzes cannot be changed.';
  end if;

  if p_status = 'published'
     and exists (
       select 1
       from public.quizzes quiz
       where quiz.id = any(p_quiz_ids)
         and not exists (
           select 1
           from public.quiz_questions quiz_question
           where quiz_question.quiz_id = quiz.id
         )
     ) then
    raise exception 'Every selected quiz needs at least one question before publishing.';
  end if;

  if p_status = 'published'
     and exists (
       select 1
       from public.quiz_questions quiz_question
       join public.questions question
         on question.id = quiz_question.question_id
       where quiz_question.quiz_id = any(p_quiz_ids)
         and question.status <> 'published'
     ) then
    raise exception 'Publish every selected question before publishing its quiz.';
  end if;

  update public.quizzes
  set status = p_status::public.content_status
  where id = any(p_quiz_ids);

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

revoke all
on function public.set_instructor_questions_status_bulk(uuid[], text)
from public;

revoke all
on function public.set_instructor_quizzes_status_bulk(uuid[], text)
from public;

grant execute
on function public.set_instructor_questions_status_bulk(uuid[], text)
to authenticated;

grant execute
on function public.set_instructor_quizzes_status_bulk(uuid[], text)
to authenticated;

select
  routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'set_instructor_questions_status_bulk',
    'set_instructor_quizzes_status_bulk'
  )
order by routine_name;
