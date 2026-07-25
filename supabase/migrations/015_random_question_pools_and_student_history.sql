-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.8: PER-ATTEMPT RANDOM QUESTIONS AND QUIZ HISTORY
-- =========================================================

alter table public.quizzes
add column if not exists question_selection_mode text
not null default 'manual';

alter table public.quizzes
add column if not exists random_question_count integer
not null default 1;

alter table public.quizzes
drop constraint if exists quizzes_question_selection_mode_valid;

alter table public.quizzes
add constraint quizzes_question_selection_mode_valid
check (question_selection_mode in ('manual', 'random_database'));

alter table public.quizzes
drop constraint if exists quizzes_random_question_count_valid;

alter table public.quizzes
add constraint quizzes_random_question_count_valid
check (random_question_count between 1 and 500);

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
  v_quiz_id uuid := nullif(p_payload->>'id', '')::uuid;
  v_course_id bigint := (p_payload->>'courseId')::bigint;
  v_module_id uuid := nullif(p_payload->>'moduleId', '')::uuid;
  v_status public.content_status := coalesce(
    nullif(p_payload->>'status', '')::public.content_status,
    'draft'::public.content_status
  );
  v_selection_mode text := coalesce(
    nullif(p_payload->>'questionSelectionMode', ''),
    'manual'
  );
  v_random_count integer := coalesce(
    (p_payload->>'randomQuestionCount')::integer,
    1
  );
  v_question_ids jsonb := coalesce(
    p_payload->'questionIds',
    '[]'::jsonb
  );
  v_question_count integer;
  v_random_pool_count integer;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if v_selection_mode not in ('manual', 'random_database') then
    raise exception 'Select a valid question-selection mode.';
  end if;

  if v_random_count < 1 or v_random_count > 500 then
    raise exception 'Random question count must be between 1 and 500.';
  end if;

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

  if v_selection_mode = 'manual'
     and v_question_count <> jsonb_array_length(v_question_ids) then
    raise exception 'One or more selected questions are invalid for this quiz.';
  end if;

  select count(*)
  into v_random_pool_count
  from public.questions question
  where question.course_id = v_course_id
    and question.status = 'published'
    and (
      v_module_id is null
      or question.module_id is null
      or question.module_id = v_module_id
    )
    and (
      select count(*)
      from public.question_options option_row
      where option_row.question_id = question.id
    ) >= 2
    and exists (
      select 1
      from public.question_options option_row
      where option_row.question_id = question.id
        and option_row.is_correct = true
    );

  if v_status = 'published'
     and v_selection_mode = 'manual'
     and v_question_count = 0 then
    raise exception 'A published manual quiz must contain at least one question.';
  end if;

  if v_selection_mode = 'random_database'
     and v_random_pool_count < v_random_count then
    raise exception
      'The selected course and module do not contain enough published questions for that random count.';
  end if;

  if v_status = 'published'
     and v_selection_mode = 'manual'
     and exists (
       select 1
       from jsonb_array_elements_text(v_question_ids)
         as selected_question(question_id)
       join public.questions question
         on question.id = selected_question.question_id::uuid
       where question.status <> 'published'
     ) then
    raise exception 'Every selected question must be published before publishing the quiz.';
  end if;

  if v_status = 'published'
     and v_selection_mode = 'manual'
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
    raise exception 'Every quiz question needs at least two options and a correct answer.';
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
      available_until,
      question_selection_mode,
      random_question_count
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
      nullif(p_payload->>'availableUntil', '')::timestamptz,
      v_selection_mode,
      v_random_count
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
      available_until = nullif(p_payload->>'availableUntil', '')::timestamptz,
      question_selection_mode = v_selection_mode,
      random_question_count = v_random_count
    where id = v_quiz_id;

    delete from public.quiz_questions
    where quiz_id = v_quiz_id;
  end if;

  if v_selection_mode = 'manual' then
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
  end if;

  return v_quiz_id;
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
  v_quiz public.quizzes%rowtype;
  v_pool_count integer;
begin
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_status not in ('draft', 'published') then
    raise exception 'Quiz status must be draft or published.';
  end if;

  select *
  into v_quiz
  from public.quizzes
  where id = p_quiz_id
    and (
      created_by = v_user_id
      or v_role = 'admin'
    );

  if not found then
    raise exception 'Quiz was not found or cannot be changed.';
  end if;

  if p_status = 'published'
     and v_quiz.question_selection_mode = 'manual'
     and not exists (
       select 1
       from public.quiz_questions
       where quiz_id = p_quiz_id
     ) then
    raise exception 'Select at least one question before publishing.';
  end if;

  if p_status = 'published'
     and v_quiz.question_selection_mode = 'manual'
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

  if p_status = 'published'
     and v_quiz.question_selection_mode = 'random_database' then
    select count(*)
    into v_pool_count
    from public.questions question
    where question.course_id = v_quiz.course_id
      and question.status = 'published'
      and (
        v_quiz.module_id is null
        or question.module_id is null
        or question.module_id = v_quiz.module_id
      )
      and (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
      ) >= 2
      and exists (
        select 1
        from public.question_options option_row
        where option_row.question_id = question.id
          and option_row.is_correct = true
      );

    if v_pool_count < v_quiz.random_question_count then
      raise exception 'The random question pool is smaller than the configured question count.';
    end if;
  end if;

  update public.quizzes
  set status = p_status::public.content_status
  where id = p_quiz_id;

  return true;
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
  v_quiz_id uuid;
  v_updated_count integer := 0;
begin
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_quiz_ids is null or cardinality(p_quiz_ids) = 0 then
    raise exception 'Select at least one quiz.';
  end if;

  foreach v_quiz_id in array p_quiz_ids loop
    perform public.set_instructor_quiz_status(v_quiz_id, p_status);
    v_updated_count := v_updated_count + 1;
  end loop;

  return v_updated_count;
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
  v_student_id uuid := auth.uid();
  v_quiz public.quizzes%rowtype;
  v_existing_attempt_id uuid;
  v_attempt_count integer;
  v_attempt_id uuid;
  v_maximum_points numeric(10,2);
  v_selected_count integer;
  v_extra_time integer := 0;
  v_extra_attempts integer := 0;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Only students may start a quiz.';
  end if;

  select * into v_quiz
  from public.quizzes
  where id = p_quiz_id
    and status = 'published';

  if not found then
    raise exception 'Quiz was not found or is not published.';
  end if;

  if not public.student_can_access_quiz(p_quiz_id, v_student_id) then
    raise exception 'This quiz is not currently available to your class.';
  end if;

  select
    coalesce(max(extra_time_minutes), 0),
    coalesce(max(extra_attempts), 0)
  into v_extra_time, v_extra_attempts
  from public.student_quiz_accommodations
  where quiz_id = p_quiz_id
    and student_id = v_student_id;

  select id into v_existing_attempt_id
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

  select count(*) into v_attempt_count
  from public.quiz_attempts
  where quiz_id = p_quiz_id
    and student_id = v_student_id;

  if v_attempt_count >= v_quiz.max_attempts + v_extra_attempts then
    raise exception 'Maximum quiz attempts reached.';
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
    now() + make_interval(
      mins => v_quiz.duration_minutes + v_extra_time
    ),
    0
  )
  returning id into v_attempt_id;

  if v_quiz.question_selection_mode = 'random_database' then
    insert into public.quiz_attempt_questions (
      attempt_id,
      question_id,
      sort_order,
      points
    )
    select
      v_attempt_id,
      selected.id,
      row_number() over ()::integer,
      selected.points
    from (
      select question.id, question.points
      from public.questions question
      where question.course_id = v_quiz.course_id
        and question.status = 'published'
        and (
          v_quiz.module_id is null
          or question.module_id is null
          or question.module_id = v_quiz.module_id
        )
        and (
          select count(*)
          from public.question_options option_row
          where option_row.question_id = question.id
        ) >= 2
        and exists (
          select 1
          from public.question_options option_row
          where option_row.question_id = question.id
            and option_row.is_correct = true
        )
      order by random()
      limit v_quiz.random_question_count
    ) selected;
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
      case
        when v_quiz.randomize_questions
        then row_number() over (order by random())::integer
        else quiz_question.sort_order
      end,
      question.points
    from public.quiz_questions quiz_question
    join public.questions question
      on question.id = quiz_question.question_id
    where quiz_question.quiz_id = p_quiz_id;
  end if;

  select count(*), coalesce(sum(points), 0)
  into v_selected_count, v_maximum_points
  from public.quiz_attempt_questions
  where attempt_id = v_attempt_id;

  if v_selected_count = 0
     or (
       v_quiz.question_selection_mode = 'random_database'
       and v_selected_count <> v_quiz.random_question_count
     ) then
    delete from public.quiz_attempts where id = v_attempt_id;
    raise exception 'The quiz does not currently contain enough valid questions.';
  end if;

  update public.quiz_attempts
  set maximum_points = v_maximum_points
  where id = v_attempt_id;

  return v_attempt_id;
end;
$$;

revoke all on function public.save_instructor_quiz(jsonb) from public;
revoke all on function public.set_instructor_quiz_status(uuid, text) from public;
revoke all on function public.set_instructor_quizzes_status_bulk(uuid[], text) from public;

grant execute on function public.save_instructor_quiz(jsonb) to authenticated;
grant execute on function public.set_instructor_quiz_status(uuid, text) to authenticated;
grant execute on function public.set_instructor_quizzes_status_bulk(uuid[], text) to authenticated;

select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quizzes'
  and column_name in (
    'question_selection_mode',
    'random_question_count'
  )
order by column_name;
