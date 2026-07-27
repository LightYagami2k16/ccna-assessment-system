-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- COURSE-GROUPED INSTRUCTOR SECTIONS AND LIVE CLASS CONTEXT
-- Requires migrations 008 through 031.
-- =========================================================

create or replace function public.get_instructor_class_course_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  return coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'classId', section.id,
          'courseCodes',
          coalesce(
            (
              select jsonb_agg(distinct linked_course.course_code)
              from (
                select course.code as course_code
                from public.quiz_assignments assignment
                join public.quizzes quiz
                  on quiz.id = assignment.quiz_id
                join public.courses course
                  on course.id = quiz.course_id
                where assignment.class_id = section.id

                union

                select course.code as course_code
                from public.cli_lab_assignments assignment
                join public.cli_labs lab
                  on lab.id = assignment.lab_id
                join public.courses course
                  on course.id = lab.course_id
                where assignment.class_id = section.id
              ) linked_course
            ),
            '[]'::jsonb
          )
        )
        order by section.name, section.code
      )
      from public.class_sections section
      where section.created_by = v_user_id
        or v_role in ('admin', 'administrator')
    ),
    '[]'::jsonb
  );
end;
$$;

create or replace function public.get_live_attempt_class_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  return coalesce(
    (
      with attempt_contexts as (
        select
          attempt.id as attempt_id,
          'quiz'::text as assessment_type,
          class_context.class_id,
          class_context.class_name,
          class_context.class_code
        from public.quiz_attempts attempt
        join public.quizzes quiz
          on quiz.id = attempt.quiz_id
        left join lateral (
          select
            section.id as class_id,
            section.name as class_name,
            section.code as class_code
          from public.quiz_assignments assignment
          join public.class_memberships membership
            on membership.class_id = assignment.class_id
           and membership.student_id = attempt.student_id
          join public.class_sections section
            on section.id = assignment.class_id
          where assignment.quiz_id = attempt.quiz_id
          order by section.code, section.name
          limit 1
        ) class_context on true
        where attempt.status = 'in_progress'
          and (
            quiz.created_by = v_user_id
            or v_role in ('admin', 'administrator')
          )

        union all

        select
          attempt.id as attempt_id,
          'cli'::text as assessment_type,
          class_context.class_id,
          class_context.class_name,
          class_context.class_code
        from public.cli_attempts attempt
        join public.cli_labs lab
          on lab.id = attempt.lab_id
        left join lateral (
          select
            section.id as class_id,
            section.name as class_name,
            section.code as class_code
          from public.cli_lab_assignments assignment
          join public.class_memberships membership
            on membership.class_id = assignment.class_id
           and membership.student_id = attempt.student_id
          join public.class_sections section
            on section.id = assignment.class_id
          where assignment.lab_id = attempt.lab_id
          order by section.code, section.name
          limit 1
        ) class_context on true
        where attempt.status = 'in_progress'
          and (
            lab.created_by = v_user_id
            or v_role in ('admin', 'administrator')
          )
      )
      select jsonb_agg(
        jsonb_build_object(
          'attemptId', context.attempt_id,
          'assessmentType', context.assessment_type,
          'classId', context.class_id,
          'className', context.class_name,
          'classCode', context.class_code
        )
        order by context.assessment_type, context.attempt_id
      )
      from attempt_contexts context
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all
on function public.get_instructor_class_course_context()
from public;

revoke all
on function public.get_live_attempt_class_context()
from public;

grant execute
on function public.get_instructor_class_course_context()
to authenticated;

grant execute
on function public.get_live_attempt_class_context()
to authenticated;
