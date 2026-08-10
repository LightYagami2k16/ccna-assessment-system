-- PHASE 8.5: COMPLETE INSTRUCTIONAL-CONTENT BACKUP AND RESTORE
--
-- Backups contain the shared course/module/question library and the signed-in
-- instructor's quizzes, CLI practicals, and reusable templates. Student data,
-- classes, assignments, schedules, attempts, answers, scores, commands,
-- monitoring events, and account data are intentionally excluded.

create or replace function public.get_instructor_content_backup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor or administrator access is required.';
  end if;

  return jsonb_build_object(
    'format', 'ccna-assessment-instructional-backup',
    'version', 1,
    'exportedAt', now(),
    'scope', 'instructional-content-only',
    'courses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', course.code,
        'title', course.title,
        'description', course.description
      ) order by course.code)
      from public.courses course
      where course.is_active
    ), '[]'::jsonb),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'courseCode', course.code,
        'code', module.code,
        'title', module.title,
        'description', module.description,
        'sortOrder', module.sort_order
      ) order by course.code, module.sort_order, module.code)
      from public.modules module
      join public.courses course on course.id = module.course_id
    ), '[]'::jsonb),
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'backupKey', question.id::text,
        'courseCode', course.code,
        'moduleCode', module.code,
        'title', question.title,
        'questionText', question.question_text,
        'explanation', question.explanation,
        'questionType', question.question_type,
        'points', question.points,
        'difficulty', question.difficulty,
        'sourceStatus', question.status,
        'options', coalesce((
          select jsonb_agg(jsonb_build_object(
            'text', option_row.option_text,
            'isCorrect', option_row.is_correct
          ) order by option_row.sort_order, option_row.id)
          from public.question_options option_row
          where option_row.question_id = question.id
        ), '[]'::jsonb)
      ) order by course.code, module.code nulls first, question.created_at)
      from public.questions question
      join public.courses course on course.id = question.course_id
      left join public.modules module on module.id = question.module_id
      where question.status <> 'archived'
    ), '[]'::jsonb),
    'quizzes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'backupKey', quiz.id::text,
        'courseCode', course.code,
        'moduleCode', module.code,
        'title', quiz.title,
        'description', quiz.description,
        'instructions', quiz.instructions,
        'passingScore', quiz.passing_score,
        'randomizeQuestions', quiz.randomize_questions,
        'randomizeOptions', quiz.randomize_options,
        'durationMinutes', quiz.duration_minutes,
        'maxAttempts', quiz.max_attempts,
        'showResultsImmediately', quiz.show_results_immediately,
        'questionSelectionMode', quiz.question_selection_mode,
        'randomQuestionCount', quiz.random_question_count,
        'questionKeys', coalesce((
          select jsonb_agg(link.question_id::text order by link.sort_order)
          from public.quiz_questions link
          where link.quiz_id = quiz.id
        ), '[]'::jsonb)
      ) order by quiz.created_at)
      from public.quizzes quiz
      join public.courses course on course.id = quiz.course_id
      left join public.modules module on module.id = quiz.module_id
      where quiz.created_by = v_user_id
        and quiz.status <> 'archived'
    ), '[]'::jsonb),
    'quizTemplates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'backupKey', template.id::text,
        'courseCode', course.code,
        'moduleCode', module.code,
        'name', template.name,
        'settings', template.template_data - 'questionIds',
        'questionKeys', coalesce(template.template_data->'questionIds', '[]'::jsonb)
      ) order by template.created_at)
      from public.quiz_templates template
      join public.courses course on course.id = template.course_id
      left join public.modules module on module.id = template.module_id
      where template.created_by = v_user_id
    ), '[]'::jsonb),
    'cliPracticals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'backupKey', lab.id::text,
        'courseCode', course.code,
        'moduleCode', module.code,
        'title', lab.title,
        'description', lab.description,
        'instructions', lab.instructions,
        'deviceType', lab.device_type,
        'initialHostname', lab.initial_hostname,
        'durationMinutes', lab.duration_minutes,
        'maxAttempts', lab.max_attempts,
        'passingScore', lab.passing_score,
        'criteria', lab.grading_criteria,
        'devices', lab.devices,
        'topology', lab.topology
      ) order by lab.created_at)
      from public.cli_labs lab
      join public.courses course on course.id = lab.course_id
      left join public.modules module on module.id = lab.module_id
      where lab.created_by = v_user_id
        and lab.status <> 'archived'
    ), '[]'::jsonb),
    'cliTemplates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'backupKey', template.id::text,
        'courseCode', course.code,
        'moduleCode', module.code,
        'name', template.name,
        'settings', template.template_data
      ) order by template.created_at)
      from public.cli_lab_templates template
      join public.courses course on course.id = template.course_id
      left join public.modules module on module.id = template.module_id
      where template.created_by = v_user_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.restore_instructor_content_backup(
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_item jsonb;
  v_option jsonb;
  v_course_id bigint;
  v_module_id uuid;
  v_question_id uuid;
  v_quiz_id uuid;
  v_question_key text;
  v_question_type text;
  v_sort_order integer;
  v_option_count integer;
  v_correct_count integer;
  v_modules_imported integer := 0;
  v_modules_skipped integer := 0;
  v_questions_imported integer := 0;
  v_questions_skipped integer := 0;
  v_quizzes_imported integer := 0;
  v_quizzes_skipped integer := 0;
  v_quiz_templates_imported integer := 0;
  v_quiz_templates_skipped integer := 0;
  v_cli_imported integer := 0;
  v_cli_skipped integer := 0;
  v_cli_templates_imported integer := 0;
  v_cli_templates_skipped integer := 0;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor or administrator access is required.';
  end if;

  if p_payload->>'format' <> 'ccna-assessment-instructional-backup'
     or coalesce((p_payload->>'version')::integer, 0) <> 1 then
    raise exception 'Unsupported instructional backup format or version.';
  end if;

  if jsonb_typeof(p_payload->'modules') <> 'array'
     or jsonb_typeof(p_payload->'questions') <> 'array'
     or jsonb_typeof(p_payload->'quizzes') <> 'array'
     or jsonb_typeof(p_payload->'quizTemplates') <> 'array'
     or jsonb_typeof(p_payload->'cliPracticals') <> 'array'
     or jsonb_typeof(p_payload->'cliTemplates') <> 'array' then
    raise exception 'The instructional backup is incomplete.';
  end if;

  if jsonb_array_length(p_payload->'modules') > 1000
     or jsonb_array_length(p_payload->'questions') > 5000
     or jsonb_array_length(p_payload->'quizzes') > 1000
     or jsonb_array_length(p_payload->'quizTemplates') > 1000
     or jsonb_array_length(p_payload->'cliPracticals') > 1000
     or jsonb_array_length(p_payload->'cliTemplates') > 1000 then
    raise exception 'The instructional backup exceeds the supported content limits.';
  end if;

  create temporary table if not exists content_restore_question_map (
    backup_key text primary key,
    question_id uuid not null
  ) on commit drop;
  truncate table pg_temp.content_restore_question_map;

  for v_item in select value from jsonb_array_elements(p_payload->'modules')
  loop
    select course.id into v_course_id
    from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode'))
      and course.is_active
    limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;

    if exists (
      select 1 from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'code'))
    ) then
      v_modules_skipped := v_modules_skipped + 1;
    else
      insert into public.modules (
        course_id, code, title, description, sort_order
      ) values (
        v_course_id,
        upper(trim(v_item->>'code')),
        trim(v_item->>'title'),
        nullif(trim(coalesce(v_item->>'description', '')), ''),
        coalesce((v_item->>'sortOrder')::integer, 0)
      );
      v_modules_imported := v_modules_imported + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'questions')
  loop
    v_question_key := trim(coalesce(v_item->>'backupKey', ''));
    if v_question_key = '' then
      raise exception 'Every restored question requires a backup key.';
    end if;

    select course.id into v_course_id
    from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode'))
      and course.is_active
    limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;

    v_module_id := null;
    if nullif(trim(coalesce(v_item->>'moduleCode', '')), '') is not null then
      select module.id into v_module_id
      from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'moduleCode'))
      limit 1;
      if v_module_id is null then
        raise exception 'Module code % was not found.', v_item->>'moduleCode';
      end if;
    end if;

    select question.id into v_question_id
    from public.questions question
    where question.course_id = v_course_id
      and question.module_id is not distinct from v_module_id
      and lower(trim(question.title)) = lower(trim(v_item->>'title'))
      and lower(trim(question.question_text)) = lower(trim(v_item->>'questionText'))
    limit 1;

    if v_question_id is not null then
      v_questions_skipped := v_questions_skipped + 1;
    else
      v_question_type := trim(v_item->>'questionType');
      if v_question_type not in (
        'multiple_choice', 'multiple_answer', 'true_false', 'identification'
      ) then
        raise exception 'Unsupported question type: %.', v_question_type;
      end if;
      if jsonb_typeof(v_item->'options') <> 'array'
         or jsonb_array_length(v_item->'options') = 0 then
        raise exception 'Question % has no answer options.', v_item->>'title';
      end if;

      select count(*), count(*) filter (
        where coalesce((option_row->>'isCorrect')::boolean, false)
      ) into v_option_count, v_correct_count
      from jsonb_array_elements(v_item->'options') option_row;

      if exists (
        select 1 from jsonb_array_elements(v_item->'options') option_row
        where nullif(trim(coalesce(option_row->>'text', '')), '') is null
      ) then
        raise exception 'Question % contains an empty answer.', v_item->>'title';
      end if;
      if v_question_type = 'multiple_choice' and v_correct_count <> 1 then
        raise exception 'Question % requires exactly one correct answer.', v_item->>'title';
      end if;
      if v_question_type = 'multiple_answer' and v_correct_count < 2 then
        raise exception 'Question % requires at least two correct answers.', v_item->>'title';
      end if;
      if v_question_type = 'true_false'
         and (v_option_count <> 2 or v_correct_count <> 1) then
        raise exception 'Question % requires two options and one correct answer.', v_item->>'title';
      end if;
      if v_question_type = 'identification'
         and v_correct_count <> v_option_count then
        raise exception 'Every identification answer for % must be accepted.', v_item->>'title';
      end if;

      insert into public.questions (
        course_id, module_id, created_by, question_type, title,
        question_text, explanation, points, difficulty, status
      ) values (
        v_course_id, v_module_id, v_user_id,
        v_question_type::public.question_type,
        trim(v_item->>'title'), trim(v_item->>'questionText'),
        nullif(trim(coalesce(v_item->>'explanation', '')), ''),
        coalesce((v_item->>'points')::numeric, 1),
        coalesce(nullif(trim(v_item->>'difficulty'), ''), 'beginner'),
        'draft'::public.content_status
      ) returning id into v_question_id;

      v_sort_order := 0;
      for v_option in select value from jsonb_array_elements(v_item->'options')
      loop
        insert into public.question_options (
          question_id, option_text, is_correct, sort_order
        ) values (
          v_question_id,
          trim(v_option->>'text'),
          coalesce((v_option->>'isCorrect')::boolean, false),
          v_sort_order
        );
        v_sort_order := v_sort_order + 1;
      end loop;
      v_questions_imported := v_questions_imported + 1;
    end if;

    insert into pg_temp.content_restore_question_map (backup_key, question_id)
    values (v_question_key, v_question_id)
    on conflict (backup_key) do update
    set question_id = excluded.question_id;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'quizzes')
  loop
    select course.id into v_course_id from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode')) limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;
    v_module_id := null;
    if nullif(trim(coalesce(v_item->>'moduleCode', '')), '') is not null then
      select module.id into v_module_id from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'moduleCode')) limit 1;
      if v_module_id is null then
        raise exception 'Module code % was not found.', v_item->>'moduleCode';
      end if;
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_item->'questionKeys', '[]'::jsonb)
      ) source(backup_key)
      where not exists (
        select 1 from pg_temp.content_restore_question_map map
        where map.backup_key = source.backup_key
      )
    ) then
      raise exception 'Quiz % references a question missing from the backup.',
        v_item->>'title';
    end if;

    select quiz.id into v_quiz_id from public.quizzes quiz
    where quiz.created_by = v_user_id
      and quiz.course_id = v_course_id
      and lower(trim(quiz.title)) = lower(trim(v_item->>'title'))
    limit 1;

    if v_quiz_id is not null then
      v_quizzes_skipped := v_quizzes_skipped + 1;
    else
      insert into public.quizzes (
        course_id, module_id, created_by, title, description, instructions,
        status, passing_score, randomize_questions, randomize_options,
        duration_minutes, max_attempts, show_results_immediately,
        available_from, available_until, access_mode,
        question_selection_mode, random_question_count
      ) values (
        v_course_id, v_module_id, v_user_id, trim(v_item->>'title'),
        nullif(trim(coalesce(v_item->>'description', '')), ''),
        nullif(trim(coalesce(v_item->>'instructions', '')), ''),
        'draft', coalesce((v_item->>'passingScore')::numeric, 70),
        coalesce((v_item->>'randomizeQuestions')::boolean, false),
        coalesce((v_item->>'randomizeOptions')::boolean, false),
        coalesce((v_item->>'durationMinutes')::integer, 15),
        coalesce((v_item->>'maxAttempts')::integer, 1),
        coalesce((v_item->>'showResultsImmediately')::boolean, true),
        null, null, 'assigned_classes',
        coalesce(nullif(v_item->>'questionSelectionMode', ''), 'manual'),
        coalesce((v_item->>'randomQuestionCount')::integer, 1)
      ) returning id into v_quiz_id;

      insert into public.quiz_questions (quiz_id, question_id, sort_order)
      select v_quiz_id, map.question_id, source.ordinality::integer
      from jsonb_array_elements_text(
        coalesce(v_item->'questionKeys', '[]'::jsonb)
      ) with ordinality source(backup_key, ordinality)
      join pg_temp.content_restore_question_map map
        on map.backup_key = source.backup_key
      order by source.ordinality;
      v_quizzes_imported := v_quizzes_imported + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'quizTemplates')
  loop
    select course.id into v_course_id from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode')) limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;
    v_module_id := null;
    if nullif(trim(coalesce(v_item->>'moduleCode', '')), '') is not null then
      select module.id into v_module_id from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'moduleCode')) limit 1;
      if v_module_id is null then
        raise exception 'Module code % was not found.', v_item->>'moduleCode';
      end if;
    end if;

    if exists (
      select 1
      from jsonb_array_elements_text(
        coalesce(v_item->'questionKeys', '[]'::jsonb)
      ) source(backup_key)
      where not exists (
        select 1 from pg_temp.content_restore_question_map map
        where map.backup_key = source.backup_key
      )
    ) then
      raise exception 'Quiz template % references a question missing from the backup.',
        v_item->>'name';
    end if;

    if exists (
      select 1 from public.quiz_templates template
      where template.created_by = v_user_id
        and template.course_id = v_course_id
        and lower(trim(template.name)) = lower(trim(v_item->>'name'))
    ) then
      v_quiz_templates_skipped := v_quiz_templates_skipped + 1;
    else
      insert into public.quiz_templates (
        created_by, source_quiz_id, course_id, module_id, name, template_data
      ) values (
        v_user_id, null, v_course_id, v_module_id, trim(v_item->>'name'),
        coalesce(v_item->'settings', '{}'::jsonb) || jsonb_build_object(
          'questionIds', coalesce((
            select jsonb_agg(map.question_id order by source.ordinality)
            from jsonb_array_elements_text(
              coalesce(v_item->'questionKeys', '[]'::jsonb)
            ) with ordinality source(backup_key, ordinality)
            join pg_temp.content_restore_question_map map
              on map.backup_key = source.backup_key
          ), '[]'::jsonb)
        )
      );
      v_quiz_templates_imported := v_quiz_templates_imported + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'cliPracticals')
  loop
    select course.id into v_course_id from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode')) limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;
    v_module_id := null;
    if nullif(trim(coalesce(v_item->>'moduleCode', '')), '') is not null then
      select module.id into v_module_id from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'moduleCode')) limit 1;
      if v_module_id is null then
        raise exception 'Module code % was not found.', v_item->>'moduleCode';
      end if;
    end if;

    if exists (
      select 1 from public.cli_labs lab
      where lab.created_by = v_user_id
        and lab.course_id = v_course_id
        and lower(trim(lab.title)) = lower(trim(v_item->>'title'))
    ) then
      v_cli_skipped := v_cli_skipped + 1;
    else
      insert into public.cli_labs (
        course_id, module_id, created_by, title, description, instructions,
        device_type, initial_hostname, duration_minutes, max_attempts,
        passing_score, status, grading_criteria, devices, topology
      ) values (
        v_course_id, v_module_id, v_user_id, trim(v_item->>'title'),
        nullif(trim(coalesce(v_item->>'description', '')), ''),
        coalesce(nullif(trim(v_item->>'instructions'), ''), 'Complete the practical.'),
        coalesce(nullif(trim(v_item->>'deviceType'), ''), 'switch'),
        coalesce(nullif(trim(v_item->>'initialHostname'), ''), 'Switch'),
        coalesce((v_item->>'durationMinutes')::integer, 30),
        coalesce((v_item->>'maxAttempts')::integer, 1),
        coalesce((v_item->>'passingScore')::numeric, 70),
        'draft', coalesce(v_item->'criteria', '[]'::jsonb),
        coalesce(v_item->'devices', '[]'::jsonb),
        coalesce(v_item->'topology', '{"links":[]}'::jsonb)
      );
      v_cli_imported := v_cli_imported + 1;
    end if;
  end loop;

  for v_item in select value from jsonb_array_elements(p_payload->'cliTemplates')
  loop
    select course.id into v_course_id from public.courses course
    where upper(course.code) = upper(trim(v_item->>'courseCode')) limit 1;
    if v_course_id is null then
      raise exception 'Course code % was not found.', v_item->>'courseCode';
    end if;
    v_module_id := null;
    if nullif(trim(coalesce(v_item->>'moduleCode', '')), '') is not null then
      select module.id into v_module_id from public.modules module
      where module.course_id = v_course_id
        and upper(module.code) = upper(trim(v_item->>'moduleCode')) limit 1;
      if v_module_id is null then
        raise exception 'Module code % was not found.', v_item->>'moduleCode';
      end if;
    end if;

    if exists (
      select 1 from public.cli_lab_templates template
      where template.created_by = v_user_id
        and template.course_id = v_course_id
        and lower(trim(template.name)) = lower(trim(v_item->>'name'))
    ) then
      v_cli_templates_skipped := v_cli_templates_skipped + 1;
    else
      insert into public.cli_lab_templates (
        created_by, source_lab_id, course_id, module_id, name, template_data
      ) values (
        v_user_id, null, v_course_id, v_module_id,
        trim(v_item->>'name'), coalesce(v_item->'settings', '{}'::jsonb)
      );
      v_cli_templates_imported := v_cli_templates_imported + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'status', 'restored-as-drafts',
    'modules', jsonb_build_object(
      'imported', v_modules_imported, 'skipped', v_modules_skipped
    ),
    'questions', jsonb_build_object(
      'imported', v_questions_imported, 'skipped', v_questions_skipped
    ),
    'quizzes', jsonb_build_object(
      'imported', v_quizzes_imported, 'skipped', v_quizzes_skipped
    ),
    'quizTemplates', jsonb_build_object(
      'imported', v_quiz_templates_imported,
      'skipped', v_quiz_templates_skipped
    ),
    'cliPracticals', jsonb_build_object(
      'imported', v_cli_imported, 'skipped', v_cli_skipped
    ),
    'cliTemplates', jsonb_build_object(
      'imported', v_cli_templates_imported,
      'skipped', v_cli_templates_skipped
    )
  );
end;
$$;

revoke all on function public.get_instructor_content_backup() from public;
revoke all on function public.restore_instructor_content_backup(jsonb) from public;
grant execute on function public.get_instructor_content_backup() to authenticated;
grant execute on function public.restore_instructor_content_backup(jsonb) to authenticated;

comment on function public.get_instructor_content_backup()
is 'Exports instructional content only; excludes users, classes, assignments, attempts, results, commands, and monitoring events.';

comment on function public.restore_instructor_content_backup(jsonb)
is 'Additively restores instructional content as drafts and skips matching existing records.';
