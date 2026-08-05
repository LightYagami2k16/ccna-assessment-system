-- =========================================================
-- PHASE 8.1: TRANSACTIONAL QUESTION-BANK IMPORT
-- =========================================================

create or replace function public.import_instructor_question_bank(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_item jsonb;
  v_option jsonb;
  v_course_id bigint;
  v_module_id uuid;
  v_question_id uuid;
  v_question_type text;
  v_difficulty text;
  v_course_code text;
  v_module_code text;
  v_title text;
  v_question_text text;
  v_points numeric;
  v_option_count integer;
  v_correct_count integer;
  v_sort_order integer;
  v_imported_count integer := 0;
  v_skipped_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'You must be signed in.';
  end if;

  v_role := public.get_current_user_role_text();
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor or administrator access is required.';
  end if;

  if p_payload->>'format' <> 'ccna-assessment-question-bank'
     or coalesce((p_payload->>'version')::integer, 0) <> 1 then
    raise exception 'Unsupported question-bank format or version.';
  end if;

  if jsonb_typeof(p_payload->'questions') <> 'array'
     or jsonb_array_length(p_payload->'questions') = 0 then
    raise exception 'The question bank does not contain any questions.';
  end if;

  if jsonb_array_length(p_payload->'questions') > 500 then
    raise exception 'A single import can contain at most 500 questions.';
  end if;

  for v_item in
    select value from jsonb_array_elements(p_payload->'questions')
  loop
    v_course_code := upper(trim(coalesce(v_item->>'courseCode', '')));
    v_module_code := nullif(upper(trim(coalesce(v_item->>'moduleCode', ''))), '');
    v_title := trim(coalesce(v_item->>'title', ''));
    v_question_text := trim(coalesce(v_item->>'questionText', ''));
    v_question_type := trim(coalesce(v_item->>'questionType', ''));
    v_difficulty := trim(coalesce(v_item->>'difficulty', 'beginner'));
    v_points := coalesce((v_item->>'points')::numeric, 0);

    if v_course_code = '' or v_title = '' or v_question_text = '' then
      raise exception 'Every imported question requires a course code, title, and question text.';
    end if;
    if v_question_type not in (
      'multiple_choice', 'multiple_answer', 'true_false', 'identification'
    ) then
      raise exception 'Unsupported question type: %.', v_question_type;
    end if;
    if v_difficulty not in ('beginner', 'intermediate', 'advanced') then
      raise exception 'Unsupported difficulty: %.', v_difficulty;
    end if;
    if v_points <= 0 or v_points > 1000 then
      raise exception 'Question points must be between 0 and 1000.';
    end if;
    if jsonb_typeof(v_item->'options') <> 'array' then
      raise exception 'Every imported question requires answer options.';
    end if;

    select course.id
    into v_course_id
    from public.courses course
    where upper(course.code) = v_course_code
      and course.is_active = true
    limit 1;

    if v_course_id is null then
      raise exception 'Course code % was not found.', v_course_code;
    end if;

    v_module_id := null;
    if v_module_code is not null then
      select module.id
      into v_module_id
      from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = v_module_code
      limit 1;

      if v_module_id is null then
        raise exception 'Module code % was not found in course %.',
          v_module_code, v_course_code;
      end if;
    end if;

    select count(*), count(*) filter (
      where coalesce((option_row->>'isCorrect')::boolean, false)
    )
    into v_option_count, v_correct_count
    from jsonb_array_elements(v_item->'options') option_row;

    if v_option_count = 0 then
      raise exception 'Question % has no answer options.', v_title;
    end if;
    if v_question_type = 'multiple_choice' and v_correct_count <> 1 then
      raise exception 'Multiple-choice question % requires exactly one correct answer.', v_title;
    end if;
    if v_question_type = 'multiple_answer' and v_correct_count < 2 then
      raise exception 'Multiple-answer question % requires at least two correct answers.', v_title;
    end if;
    if v_question_type = 'true_false'
       and (v_option_count <> 2 or v_correct_count <> 1) then
      raise exception 'True/false question % requires two options and one correct answer.', v_title;
    end if;
    if v_question_type = 'identification'
       and v_correct_count <> v_option_count then
      raise exception 'Every identification answer for % must be accepted.', v_title;
    end if;

    if exists (
      select 1
      from public.questions question
      where question.course_id = v_course_id
        and question.module_id is not distinct from v_module_id
        and lower(trim(question.title)) = lower(v_title)
        and lower(trim(question.question_text)) = lower(v_question_text)
    ) then
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    insert into public.questions (
      course_id,
      module_id,
      created_by,
      question_type,
      title,
      question_text,
      explanation,
      points,
      difficulty,
      status
    ) values (
      v_course_id,
      v_module_id,
      auth.uid(),
      v_question_type::public.question_type,
      v_title,
      v_question_text,
      nullif(trim(coalesce(v_item->>'explanation', '')), ''),
      v_points,
      v_difficulty,
      'draft'::public.content_status
    ) returning id into v_question_id;

    v_sort_order := 0;
    for v_option in
      select value from jsonb_array_elements(v_item->'options')
    loop
      if trim(coalesce(v_option->>'text', '')) = '' then
        raise exception 'Question % contains an empty answer.', v_title;
      end if;

      insert into public.question_options (
        question_id,
        option_text,
        is_correct,
        sort_order
      ) values (
        v_question_id,
        trim(v_option->>'text'),
        coalesce((v_option->>'isCorrect')::boolean, false),
        v_sort_order
      );
      v_sort_order := v_sort_order + 1;
    end loop;

    v_imported_count := v_imported_count + 1;
  end loop;

  return jsonb_build_object(
    'importedCount', v_imported_count,
    'skippedCount', v_skipped_count,
    'status', 'draft'
  );
end;
$$;

revoke all on function public.import_instructor_question_bank(jsonb) from public;
grant execute on function public.import_instructor_question_bank(jsonb) to authenticated;

