-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- IDENTIFICATION AND MULTIPLE-ANSWER QUESTIONS
-- =========================================================

alter type public.question_type
add value if not exists 'identification';

alter type public.question_type
add value if not exists 'multiple_answer';

alter table public.quiz_attempt_answers
add column if not exists selected_option_ids uuid[]
not null default '{}'::uuid[];

alter table public.quiz_attempt_answers
add column if not exists answer_text text;

update public.quiz_attempt_answers
set selected_option_ids = array[selected_option_id]
where selected_option_id is not null
  and cardinality(selected_option_ids) = 0;

create or replace function public.normalize_identification_answer(
  p_answer text
)
returns text
language sql
immutable
set search_path = public
as $$
  select regexp_replace(
    lower(trim(coalesce(p_answer, ''))),
    '\s+',
    ' ',
    'g'
  );
$$;

create or replace function public.question_is_ready(
  p_question_id uuid
)
returns boolean
language sql
stable
set search_path = public
as $$
  select case question.question_type::text
    when 'identification' then
      (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
          and option_row.is_correct = true
          and nullif(trim(option_row.option_text), '') is not null
      ) >= 1
    when 'multiple_answer' then
      (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
      ) >= 2
      and (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
          and option_row.is_correct = true
      ) >= 2
    else
      (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
      ) >= 2
      and (
        select count(*)
        from public.question_options option_row
        where option_row.question_id = question.id
          and option_row.is_correct = true
      ) = 1
  end
  from public.questions question
  where question.id = p_question_id;
$$;

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
  v_question_type text;
  v_options jsonb := coalesce(p_payload->'options', '[]'::jsonb);
  v_option_count integer;
  v_correct_count integer;
begin
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  select question_type::text
  into v_question_type
  from public.questions
  where id = v_question_id
    and status = 'draft'
    and (
      created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if not found then
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

  if jsonb_typeof(v_options) <> 'array' then
    raise exception 'Answer options must be an array.';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(v_options) option_row
    where nullif(trim(option_row->>'optionText'), '') is null
  ) then
    raise exception 'Every answer option must contain text.';
  end if;

  select
    count(*),
    count(*) filter (
      where coalesce((option_row->>'isCorrect')::boolean, false)
    )
  into v_option_count, v_correct_count
  from jsonb_array_elements(v_options) option_row;

  if v_question_type = 'identification'
     and (v_option_count < 1 or v_correct_count < 1) then
    raise exception 'Identification questions need at least one accepted answer.';
  elsif v_question_type = 'multiple_answer'
     and (v_option_count < 2 or v_correct_count < 2) then
    raise exception 'Multiple-answer questions need at least two correct answers.';
  elsif v_question_type not in ('identification', 'multiple_answer')
     and (v_option_count < 2 or v_correct_count <> 1) then
    raise exception 'Select exactly one correct answer.';
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
    case
      when v_question_type = 'identification' then true
      else coalesce((option_row->>'isCorrect')::boolean, false)
    end,
    option_order::integer
  from jsonb_array_elements(v_options)
    with ordinality selected_option(option_row, option_order);

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
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
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
        or v_role in ('admin', 'administrator')
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
     and not public.question_is_ready(p_question_id) then
    raise exception 'Complete the answer key before publishing this question.';
  end if;

  update public.questions
  set status = p_status::public.content_status
  where id = p_question_id;

  return true;
end;
$$;

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
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  if p_status not in ('draft', 'published') then
    raise exception 'Question status must be draft or published.';
  end if;

  if p_question_ids is null or cardinality(p_question_ids) = 0 then
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
         or v_role in ('admin', 'administrator')
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
       from unnest(p_question_ids) selected(question_id)
       where not public.question_is_ready(selected.question_id)
     ) then
    raise exception 'Complete every selected question answer key before publishing.';
  end if;

  update public.questions
  set status = p_status::public.content_status
  where id = any(p_question_ids);

  get diagnostics v_updated_count = row_count;
  return v_updated_count;
end;
$$;

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
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
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
    select 1 from public.courses where id = v_course_id
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
    and public.question_is_ready(question.id);

  if v_status = 'published'
     and v_selection_mode = 'manual'
     and v_question_count = 0 then
    raise exception 'A published manual quiz must contain at least one question.';
  end if;

  if v_selection_mode = 'random_database'
     and v_random_pool_count < v_random_count then
    raise exception 'The selected course and module do not contain enough published questions for that random count.';
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
          or not public.question_is_ready(question.id)
     ) then
    raise exception 'Publish and complete every selected question before publishing the quiz.';
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
          or v_role in ('admin', 'administrator')
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
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  if p_status not in ('draft', 'published') then
    raise exception 'Quiz status must be draft or published.';
  end if;

  select * into v_quiz
  from public.quizzes
  where id = p_quiz_id
    and (
      created_by = v_user_id
      or v_role in ('admin', 'administrator')
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
         and (
           question.status <> 'published'
           or not public.question_is_ready(question.id)
         )
     ) then
    raise exception 'Publish and complete every selected question before publishing the quiz.';
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
      and public.question_is_ready(question.id);

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
        and public.question_is_ready(question.id)
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

create or replace function public.get_quiz_attempt_safe(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_attempt public.quiz_attempts%rowtype;
  v_result jsonb;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  select * into v_attempt
  from public.quiz_attempts
  where id = p_attempt_id
    and student_id = v_student_id;

  if not found then
    raise exception 'Quiz attempt was not found.';
  end if;

  if v_attempt.status = 'in_progress'
     and v_attempt.expires_at <= now() then
    perform public.reconcile_expired_assessment_attempts();
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id,
      'quizId', attempt.quiz_id,
      'status', attempt.status,
      'attemptNumber', attempt.attempt_number,
      'startedAt', attempt.started_at,
      'expiresAt', attempt.expires_at,
      'maximumPoints', attempt.maximum_points,
      'scorePoints', attempt.score_points,
      'percentage', attempt.percentage,
      'passed', attempt.passed
    ),
    'quiz', jsonb_build_object(
      'id', quiz.id,
      'title', quiz.title,
      'description', quiz.description,
      'instructions', quiz.instructions,
      'durationMinutes', quiz.duration_minutes,
      'passingScore', quiz.passing_score
    ),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'attemptQuestionId', aq.id,
            'questionId', question.id,
            'sortOrder', aq.sort_order,
            'points', aq.points,
            'type', question.question_type,
            'title', question.title,
            'questionText', question.question_text,
            'selectedOptionId', answer.selected_option_id,
            'selectedOptionIds', coalesce(
              answer.selected_option_ids,
              '{}'::uuid[]
            ),
            'answerText', answer.answer_text,
            'options', case
              when question.question_type::text = 'identification'
                then '[]'::jsonb
              else coalesce(
                (
                  select jsonb_agg(
                    jsonb_build_object(
                      'id', option_row.id,
                      'text', option_row.option_text,
                      'sortOrder', option_row.sort_order
                    )
                    order by option_row.sort_order
                  )
                  from public.question_options option_row
                  where option_row.question_id = question.id
                ),
                '[]'::jsonb
              )
            end
          )
          order by aq.sort_order
        )
        from public.quiz_attempt_questions aq
        join public.questions question
          on question.id = aq.question_id
        left join public.quiz_attempt_answers answer
          on answer.attempt_question_id = aq.id
        where aq.attempt_id = attempt.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
  where attempt.id = p_attempt_id;

  return v_result;
end;
$$;

create or replace function public.save_quiz_answer_v2(
  p_attempt_id uuid,
  p_attempt_question_id uuid,
  p_selected_option_ids uuid[] default '{}'::uuid[],
  p_answer_text text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_question_id uuid;
  v_question_type text;
  v_option_ids uuid[] := coalesce(
    p_selected_option_ids,
    '{}'::uuid[]
  );
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  select aq.question_id, question.question_type::text
  into v_question_id, v_question_type
  from public.quiz_attempt_questions aq
  join public.quiz_attempts attempt
    on attempt.id = aq.attempt_id
  join public.questions question
    on question.id = aq.question_id
  where attempt.id = p_attempt_id
    and attempt.student_id = v_student_id
    and attempt.status = 'in_progress'
    and attempt.expires_at > now()
    and aq.id = p_attempt_question_id;

  if not found then
    raise exception 'The attempt is invalid, submitted, or expired.';
  end if;

  if v_question_type = 'identification' then
    v_option_ids := '{}'::uuid[];
  else
    if exists (
      select 1
      from unnest(v_option_ids) selected(option_id)
      left join public.question_options option_row
        on option_row.id = selected.option_id
       and option_row.question_id = v_question_id
      where option_row.id is null
    ) then
      raise exception 'A selected option does not belong to this question.';
    end if;

    if v_question_type <> 'multiple_answer'
       and cardinality(v_option_ids) > 1 then
      raise exception 'Select only one answer for this question.';
    end if;
  end if;

  if (
    v_question_type = 'identification'
    and public.normalize_identification_answer(p_answer_text) = ''
  ) or (
    v_question_type <> 'identification'
    and cardinality(v_option_ids) = 0
  ) then
    delete from public.quiz_attempt_answers
    where attempt_question_id = p_attempt_question_id;

    return true;
  end if;

  insert into public.quiz_attempt_answers (
    attempt_question_id,
    selected_option_id,
    selected_option_ids,
    answer_text,
    answered_at
  )
  values (
    p_attempt_question_id,
    case
      when v_question_type in ('multiple_choice', 'true_false')
        then v_option_ids[1]
      else null
    end,
    v_option_ids,
    case
      when v_question_type = 'identification'
        then nullif(trim(p_answer_text), '')
      else null
    end,
    now()
  )
  on conflict (attempt_question_id)
  do update set
    selected_option_id = excluded.selected_option_id,
    selected_option_ids = excluded.selected_option_ids,
    answer_text = excluded.answer_text,
    answered_at = now(),
    is_correct = null,
    points_awarded = 0;

  return true;
end;
$$;

create or replace function public.grade_quiz_attempt_answers(
  p_attempt_id uuid
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_score numeric(10,2);
begin
  update public.quiz_attempt_answers answer
  set
    is_correct = case question.question_type::text
      when 'identification' then exists (
        select 1
        from public.question_options accepted
        where accepted.question_id = question.id
          and accepted.is_correct = true
          and public.normalize_identification_answer(
            accepted.option_text
          ) = public.normalize_identification_answer(
            answer.answer_text
          )
          and public.normalize_identification_answer(
            answer.answer_text
          ) <> ''
      )
      when 'multiple_answer' then
        array(
          select correct.id
          from public.question_options correct
          where correct.question_id = question.id
            and correct.is_correct = true
          order by correct.id
        ) = array(
          select distinct selected.option_id
          from unnest(
            coalesce(answer.selected_option_ids, '{}'::uuid[])
          ) selected(option_id)
          order by selected.option_id
        )
        and cardinality(
          coalesce(answer.selected_option_ids, '{}'::uuid[])
        ) > 0
      else exists (
        select 1
        from public.question_options selected
        where selected.id = answer.selected_option_id
          and selected.question_id = question.id
          and selected.is_correct = true
      )
    end,
    points_awarded = case
      when case question.question_type::text
        when 'identification' then exists (
          select 1
          from public.question_options accepted
          where accepted.question_id = question.id
            and accepted.is_correct = true
            and public.normalize_identification_answer(
              accepted.option_text
            ) = public.normalize_identification_answer(
              answer.answer_text
            )
            and public.normalize_identification_answer(
              answer.answer_text
            ) <> ''
        )
        when 'multiple_answer' then
          array(
            select correct.id
            from public.question_options correct
            where correct.question_id = question.id
              and correct.is_correct = true
            order by correct.id
          ) = array(
            select distinct selected.option_id
            from unnest(
              coalesce(answer.selected_option_ids, '{}'::uuid[])
            ) selected(option_id)
            order by selected.option_id
          )
          and cardinality(
            coalesce(answer.selected_option_ids, '{}'::uuid[])
          ) > 0
        else exists (
          select 1
          from public.question_options selected
          where selected.id = answer.selected_option_id
            and selected.question_id = question.id
            and selected.is_correct = true
        )
      end then attempt_question.points
      else 0
    end
  from public.quiz_attempt_questions attempt_question
  join public.questions question
    on question.id = attempt_question.question_id
  where answer.attempt_question_id = attempt_question.id
    and attempt_question.attempt_id = p_attempt_id;

  select coalesce(sum(answer.points_awarded), 0)
  into v_score
  from public.quiz_attempt_answers answer
  join public.quiz_attempt_questions attempt_question
    on attempt_question.id = answer.attempt_question_id
  where attempt_question.attempt_id = p_attempt_id;

  return v_score;
end;
$$;

create or replace function public.submit_quiz_attempt(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_status text;
  v_expires_at timestamptz;
  v_score numeric(10,2);
  v_maximum numeric(10,2);
  v_percentage numeric(5,2);
  v_passing_score numeric(5,2);
  v_passed boolean;
begin
  if v_student_id is null then
    raise exception 'You must be signed in.';
  end if;

  select
    attempt.status,
    attempt.expires_at,
    attempt.maximum_points,
    quiz.passing_score
  into
    v_status,
    v_expires_at,
    v_maximum,
    v_passing_score
  from public.quiz_attempts attempt
  join public.quizzes quiz
    on quiz.id = attempt.quiz_id
  where attempt.id = p_attempt_id
    and attempt.student_id = v_student_id;

  if not found then
    raise exception 'Quiz attempt was not found.';
  end if;

  if v_status = 'submitted' then
    raise exception 'This quiz was already submitted.';
  end if;

  v_score := public.grade_quiz_attempt_answers(p_attempt_id);
  v_percentage := case
    when v_maximum > 0
      then round((v_score / v_maximum) * 100, 2)
    else 0
  end;
  v_passed := v_percentage >= v_passing_score;

  update public.quiz_attempts
  set
    status = case
      when now() > v_expires_at then 'expired'
      else 'submitted'
    end,
    submitted_at = now(),
    score_points = v_score,
    percentage = v_percentage,
    passed = v_passed
  where id = p_attempt_id;

  return jsonb_build_object(
    'attemptId', p_attempt_id,
    'scorePoints', v_score,
    'maximumPoints', v_maximum,
    'percentage', v_percentage,
    'passingScore', v_passing_score,
    'passed', v_passed,
    'submittedAt', now()
  );
end;
$$;

create or replace function public.reconcile_expired_assessment_attempts()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quiz_attempt public.quiz_attempts%rowtype;
  v_cli_attempt public.cli_attempts%rowtype;
  v_passing_score numeric(5,2);
  v_score numeric(10,2);
  v_maximum numeric(10,2);
  v_percentage numeric(5,2);
  v_passed boolean;
  v_quiz_count integer := 0;
  v_cli_count integer := 0;
begin
  for v_quiz_attempt in
    select attempt.*
    from public.quiz_attempts attempt
    where attempt.status = 'in_progress'
      and attempt.expires_at <= now()
    order by attempt.expires_at
    for update skip locked
  loop
    v_score := public.grade_quiz_attempt_answers(
      v_quiz_attempt.id
    );

    select quiz.passing_score
    into v_passing_score
    from public.quizzes quiz
    where quiz.id = v_quiz_attempt.quiz_id;

    v_maximum := coalesce(
      v_quiz_attempt.maximum_points,
      0
    );
    v_percentage := case
      when v_maximum > 0
        then round((v_score / v_maximum) * 100, 2)
      else 0
    end;
    v_passed := v_percentage >= coalesce(v_passing_score, 0);

    update public.quiz_attempts
    set
      status = 'expired',
      submitted_at = coalesce(submitted_at, expires_at),
      score_points = v_score,
      percentage = v_percentage,
      passed = v_passed
    where id = v_quiz_attempt.id
      and status = 'in_progress';

    if found then
      v_quiz_count := v_quiz_count + 1;
    end if;
  end loop;

  for v_cli_attempt in
    select attempt.*
    from public.cli_attempts attempt
    where attempt.status = 'in_progress'
      and attempt.expires_at <= now()
    order by attempt.expires_at
    for update skip locked
  loop
    select
      coalesce(
        sum(
          case
            when public.cli_criterion_is_met(
              v_cli_attempt.session_state,
              criterion
            )
              then (criterion->>'points')::numeric
            else 0
          end
        ),
        0
      ),
      coalesce(sum((criterion->>'points')::numeric), 0)
    into v_score, v_maximum
    from jsonb_array_elements(
      coalesce(v_cli_attempt.criteria_snapshot, '[]'::jsonb)
    ) criterion;

    select lab.passing_score
    into v_passing_score
    from public.cli_labs lab
    where lab.id = v_cli_attempt.lab_id;

    v_percentage := case
      when v_maximum > 0
        then round((v_score / v_maximum) * 100, 2)
      else 0
    end;
    v_passed := v_percentage >= coalesce(v_passing_score, 0);

    update public.cli_attempts
    set
      status = 'expired',
      submitted_at = coalesce(submitted_at, expires_at),
      score_points = v_score,
      maximum_points = v_maximum,
      percentage = v_percentage,
      passed = v_passed
    where id = v_cli_attempt.id
      and status = 'in_progress';

    if found then
      v_cli_count := v_cli_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'quizAttemptsFinalized', v_quiz_count,
    'cliAttemptsFinalized', v_cli_count
  );
end;
$$;

create or replace function public.get_instructor_attempt_detail(
  p_attempt_id uuid
)
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
  select role::text into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1
    from public.quiz_attempts attempt
    join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    where attempt.id = p_attempt_id
      and (
        quiz.created_by = v_user_id
        or v_role in ('admin', 'administrator')
      )
  ) then
    raise exception 'Quiz attempt was not found.';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'attemptId', attempt.id,
      'quizTitle', quiz.title,
      'courseCode', course.code,
      'moduleCode', module.code,
      'studentName', coalesce(
        nullif(trim(profile.full_name), ''),
        split_part(auth_user.email, '@', 1),
        'Unnamed student'
      ),
      'studentEmail', auth_user.email,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'startedAt', attempt.started_at,
      'submittedAt', attempt.submitted_at,
      'scorePoints', attempt.score_points,
      'maximumPoints', attempt.maximum_points,
      'percentage', attempt.percentage,
      'passed', attempt.passed
    ),
    'questions', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'attemptQuestionId', attempt_question.id,
            'sortOrder', attempt_question.sort_order,
            'questionType', question.question_type,
            'title', question.title,
            'questionText', question.question_text,
            'explanation', question.explanation,
            'points', attempt_question.points,
            'selectedOptionId', answer.selected_option_id,
            'selectedOptionIds', coalesce(
              answer.selected_option_ids,
              '{}'::uuid[]
            ),
            'selectedOptionText', selected_option.option_text,
            'selectedOptionTexts', coalesce(
              (
                select jsonb_agg(
                  selected.option_text
                  order by selected.sort_order
                )
                from public.question_options selected
                where selected.id = any(
                  coalesce(
                    answer.selected_option_ids,
                    '{}'::uuid[]
                  )
                )
              ),
              '[]'::jsonb
            ),
            'answerText', answer.answer_text,
            'isCorrect', answer.is_correct,
            'pointsAwarded', answer.points_awarded,
            'correctOptions', coalesce(
              (
                select jsonb_agg(
                  correct.option_text
                  order by correct.sort_order
                )
                from public.question_options correct
                where correct.question_id = question.id
                  and correct.is_correct = true
              ),
              '[]'::jsonb
            )
          )
          order by attempt_question.sort_order
        )
        from public.quiz_attempt_questions attempt_question
        join public.questions question
          on question.id = attempt_question.question_id
        left join public.quiz_attempt_answers answer
          on answer.attempt_question_id = attempt_question.id
        left join public.question_options selected_option
          on selected_option.id = answer.selected_option_id
        where attempt_question.attempt_id = attempt.id
      ),
      '[]'::jsonb
    )
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
  where attempt.id = p_attempt_id;

  return v_result;
end;
$$;

revoke all
on function public.normalize_identification_answer(text)
from public;

revoke all
on function public.question_is_ready(uuid)
from public;

revoke all
on function public.grade_quiz_attempt_answers(uuid)
from public;

revoke all
on function public.save_quiz_answer_v2(uuid, uuid, uuid[], text)
from public;

revoke all
on function public.update_instructor_question(jsonb)
from public;

revoke all
on function public.set_instructor_question_status(uuid, text)
from public;

revoke all
on function public.set_instructor_questions_status_bulk(uuid[], text)
from public;

revoke all
on function public.save_instructor_quiz(jsonb)
from public;

revoke all
on function public.set_instructor_quiz_status(uuid, text)
from public;

revoke all
on function public.start_quiz_attempt(uuid)
from public;

revoke all
on function public.get_quiz_attempt_safe(uuid)
from public;

revoke all
on function public.submit_quiz_attempt(uuid)
from public;

revoke all
on function public.reconcile_expired_assessment_attempts()
from public;

revoke all
on function public.get_instructor_attempt_detail(uuid)
from public;

grant execute
on function public.save_quiz_answer_v2(uuid, uuid, uuid[], text)
to authenticated;

grant execute
on function public.update_instructor_question(jsonb)
to authenticated;

grant execute
on function public.set_instructor_question_status(uuid, text)
to authenticated;

grant execute
on function public.set_instructor_questions_status_bulk(uuid[], text)
to authenticated;

grant execute
on function public.save_instructor_quiz(jsonb)
to authenticated;

grant execute
on function public.set_instructor_quiz_status(uuid, text)
to authenticated;

grant execute
on function public.start_quiz_attempt(uuid)
to authenticated;

grant execute
on function public.get_quiz_attempt_safe(uuid)
to authenticated;

grant execute
on function public.submit_quiz_attempt(uuid)
to authenticated;

grant execute
on function public.reconcile_expired_assessment_attempts()
to authenticated;

grant execute
on function public.get_instructor_attempt_detail(uuid)
to authenticated;

select
  column_name
from information_schema.columns
where table_schema = 'public'
  and table_name = 'quiz_attempt_answers'
  and column_name in (
    'selected_option_ids',
    'answer_text'
  )
order by column_name;
