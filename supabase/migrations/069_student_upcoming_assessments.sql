-- Read-only future quiz openings for the signed-in student.
-- CLI practicals have no scheduling fields and are intentionally absent.
-- This migration only defines an RPC; it never changes attempts or enrollment.
begin;

create or replace function public.get_student_upcoming_assessments()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if v_student_id is null
     or coalesce(public.get_current_user_role_text(), '') <> 'student'
     or exists (
       select 1 from auth.users auth_user
       where auth_user.id = v_student_id and auth_user.banned_until > now()
     ) then
    raise exception 'Student access is required.';
  end if;

  return coalesce((
    with eligible_windows as (
      select
        quiz.id,
        quiz.title,
        course.code as course_code,
        module.code as module_code,
        assignment.id as assignment_id,
        coalesce(
          accommodation.available_from,
          assignment.available_from,
          quiz.available_from
        ) as available_from,
        coalesce(
          accommodation.available_until,
          assignment.available_until,
          quiz.available_until
        ) as available_until
      from public.quizzes quiz
      join public.courses course on course.id = quiz.course_id
      left join public.modules module on module.id = quiz.module_id
      join public.quiz_assignments assignment on assignment.quiz_id = quiz.id
      join public.class_sections section on section.id = assignment.class_id
      join public.class_memberships membership
        on membership.class_id = section.id
       and membership.student_id = v_student_id
      left join public.student_quiz_accommodations accommodation
        on accommodation.quiz_id = quiz.id
       and accommodation.student_id = v_student_id
      where quiz.status = 'published'
        and section.is_active = true
        and not public.student_can_access_quiz(quiz.id, v_student_id)
        and not exists (
          select 1 from public.student_quiz_preferences preference
          where preference.quiz_id = quiz.id
            and preference.student_id = v_student_id
            and preference.archived = true
        )
        and not exists (
          select 1 from public.quiz_attempts attempt
          where attempt.quiz_id = quiz.id
            and attempt.student_id = v_student_id
            and attempt.status = 'in_progress'
            and attempt.expires_at > now()
        )
        and (
          select count(*) from public.quiz_attempts attempt
          where attempt.quiz_id = quiz.id and attempt.student_id = v_student_id
        ) < quiz.max_attempts + coalesce(accommodation.extra_attempts, 0)
    ), earliest_windows as (
      -- Keep the closing date from the same assignment as the chosen opening.
      -- Invalid or closed windows are removed before selecting one per quiz.
      select distinct on (candidate.id) candidate.*
      from eligible_windows candidate
      where candidate.available_from > now()
        and (
          candidate.available_until is null
          or candidate.available_until > candidate.available_from
        )
      order by candidate.id, candidate.available_from,
        candidate.available_until nulls last, candidate.assignment_id
    )
    select jsonb_agg(jsonb_build_object(
      'id', upcoming.id,
      'assessmentType', 'quiz',
      'title', upcoming.title,
      'courseCode', upcoming.course_code,
      'moduleCode', upcoming.module_code,
      'availableFrom', upcoming.available_from,
      'availableUntil', upcoming.available_until
    ) order by upcoming.available_from, upcoming.title, upcoming.id)
    from earliest_windows upcoming
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.get_student_upcoming_assessments() from public, anon;
grant execute on function public.get_student_upcoming_assessments() to authenticated;

commit;

