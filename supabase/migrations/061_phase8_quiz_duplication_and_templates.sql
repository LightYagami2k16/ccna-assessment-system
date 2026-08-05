-- PHASE 8.2: QUIZ DUPLICATION AND REUSABLE TEMPLATES

create table if not exists public.quiz_templates (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles(id) on delete cascade,
  source_quiz_id uuid references public.quizzes(id) on delete set null,
  course_id bigint not null references public.courses(id) on delete restrict,
  module_id uuid references public.modules(id) on delete set null,
  name text not null,
  template_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint quiz_templates_name_not_blank
    check (length(trim(name)) between 1 and 160)
);

create index if not exists quiz_templates_created_by_idx
on public.quiz_templates(created_by, created_at desc);

alter table public.quiz_templates enable row level security;

drop policy if exists quiz_templates_select_own on public.quiz_templates;
create policy quiz_templates_select_own
on public.quiz_templates for select to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

drop policy if exists quiz_templates_insert_own on public.quiz_templates;
create policy quiz_templates_insert_own
on public.quiz_templates for insert to authenticated
with check (
  created_by = auth.uid()
  and public.get_current_user_role_text() in (
    'instructor', 'admin', 'administrator'
  )
);

drop policy if exists quiz_templates_update_own on public.quiz_templates;
create policy quiz_templates_update_own
on public.quiz_templates for update to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
)
with check (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

drop policy if exists quiz_templates_delete_own on public.quiz_templates;
create policy quiz_templates_delete_own
on public.quiz_templates for delete to authenticated
using (
  created_by = auth.uid()
  or public.get_current_user_role_text() in ('admin', 'administrator')
);

grant select, insert, update, delete
on public.quiz_templates to authenticated;

create or replace function public.duplicate_instructor_quiz(
  p_quiz_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_source public.quizzes%rowtype;
  v_new_quiz_id uuid;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_source from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz not found.'; end if;

  if v_source.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only duplicate your own quizzes.';
  end if;

  insert into public.quizzes (
    course_id, module_id, created_by, title, description, instructions,
    status, passing_score, randomize_questions, randomize_options,
    duration_minutes, max_attempts, show_results_immediately,
    available_from, available_until, access_mode,
    question_selection_mode, random_question_count
  ) values (
    v_source.course_id, v_source.module_id, v_user_id,
    coalesce(nullif(trim(p_title), ''), 'Copy of ' || v_source.title),
    v_source.description, v_source.instructions, 'draft',
    v_source.passing_score, v_source.randomize_questions,
    v_source.randomize_options, v_source.duration_minutes,
    v_source.max_attempts, v_source.show_results_immediately,
    null, null, 'assigned_classes', v_source.question_selection_mode,
    v_source.random_question_count
  ) returning id into v_new_quiz_id;

  insert into public.quiz_questions (quiz_id, question_id, sort_order)
  select v_new_quiz_id, question_id, sort_order
  from public.quiz_questions
  where quiz_id = p_quiz_id
  order by sort_order;

  return v_new_quiz_id;
end;
$$;

create or replace function public.save_instructor_quiz_template(
  p_quiz_id uuid,
  p_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_source public.quizzes%rowtype;
  v_template_id uuid;
  v_question_ids jsonb;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_source from public.quizzes where id = p_quiz_id;
  if not found then raise exception 'Quiz not found.'; end if;

  if v_source.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only save your own quizzes as templates.';
  end if;

  select coalesce(
    jsonb_agg(question_id order by sort_order), '[]'::jsonb
  ) into v_question_ids
  from public.quiz_questions where quiz_id = p_quiz_id;

  insert into public.quiz_templates (
    created_by, source_quiz_id, course_id, module_id, name, template_data
  ) values (
    v_user_id, p_quiz_id, v_source.course_id, v_source.module_id,
    coalesce(nullif(trim(p_name), ''), v_source.title || ' template'),
    jsonb_build_object(
      'title', v_source.title,
      'description', v_source.description,
      'instructions', v_source.instructions,
      'passingScore', v_source.passing_score,
      'randomizeQuestions', v_source.randomize_questions,
      'randomizeOptions', v_source.randomize_options,
      'durationMinutes', v_source.duration_minutes,
      'maxAttempts', v_source.max_attempts,
      'showResultsImmediately', v_source.show_results_immediately,
      'questionSelectionMode', v_source.question_selection_mode,
      'randomQuestionCount', v_source.random_question_count,
      'questionIds', v_question_ids
    )
  ) returning id into v_template_id;

  return v_template_id;
end;
$$;

create or replace function public.create_instructor_quiz_from_template(
  p_template_id uuid,
  p_title text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_template public.quiz_templates%rowtype;
  v_data jsonb;
  v_new_quiz_id uuid;
begin
  if v_user_id is null or v_role not in (
    'instructor', 'admin', 'administrator'
  ) then
    raise exception 'Instructor access is required.';
  end if;

  select * into v_template
  from public.quiz_templates where id = p_template_id;
  if not found then raise exception 'Quiz template not found.'; end if;

  if v_template.created_by <> v_user_id
     and v_role not in ('admin', 'administrator') then
    raise exception 'You can only use your own quiz templates.';
  end if;

  v_data := v_template.template_data;

  insert into public.quizzes (
    course_id, module_id, created_by, title, description, instructions,
    status, passing_score, randomize_questions, randomize_options,
    duration_minutes, max_attempts, show_results_immediately,
    available_from, available_until, access_mode,
    question_selection_mode, random_question_count
  ) values (
    v_template.course_id, v_template.module_id, v_user_id,
    coalesce(
      nullif(trim(p_title), ''),
      nullif(v_data ->> 'title', ''),
      v_template.name
    ),
    coalesce(v_data ->> 'description', ''),
    coalesce(v_data ->> 'instructions', ''),
    'draft', coalesce((v_data ->> 'passingScore')::numeric, 70),
    coalesce((v_data ->> 'randomizeQuestions')::boolean, false),
    coalesce((v_data ->> 'randomizeOptions')::boolean, false),
    coalesce((v_data ->> 'durationMinutes')::integer, 15),
    coalesce((v_data ->> 'maxAttempts')::integer, 1),
    coalesce((v_data ->> 'showResultsImmediately')::boolean, true),
    null, null, 'assigned_classes',
    coalesce(v_data ->> 'questionSelectionMode', 'manual'),
    coalesce((v_data ->> 'randomQuestionCount')::integer, 10)
  ) returning id into v_new_quiz_id;

  insert into public.quiz_questions (quiz_id, question_id, sort_order)
  select v_new_quiz_id, question_row.id, question_ref.ordinality::integer
  from jsonb_array_elements_text(
    coalesce(v_data -> 'questionIds', '[]'::jsonb)
  ) with ordinality as question_ref(question_id, ordinality)
  join public.questions question_row
    on question_row.id = question_ref.question_id::uuid
  where question_row.status <> 'archived'
  order by question_ref.ordinality;

  return v_new_quiz_id;
end;
$$;

create or replace function public.delete_instructor_quiz_template(
  p_template_id uuid
)
returns boolean
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
    raise exception 'Instructor access is required.';
  end if;

  delete from public.quiz_templates
  where id = p_template_id
    and (
      created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if not found then
    raise exception 'Quiz template not found or access denied.';
  end if;
  return true;
end;
$$;

revoke all on function public.duplicate_instructor_quiz(uuid, text) from public;
revoke all on function public.save_instructor_quiz_template(uuid, text) from public;
revoke all on function public.create_instructor_quiz_from_template(uuid, text) from public;
revoke all on function public.delete_instructor_quiz_template(uuid) from public;

grant execute on function public.duplicate_instructor_quiz(uuid, text) to authenticated;
grant execute on function public.save_instructor_quiz_template(uuid, text) to authenticated;
grant execute on function public.create_instructor_quiz_from_template(uuid, text) to authenticated;
grant execute on function public.delete_instructor_quiz_template(uuid) to authenticated;
