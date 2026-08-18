-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- ADMIN CLASS TEACHER IDENTITY
-- =========================================================
-- Administrators can review every instructor-owned class. Include the
-- owning teacher's name and email in the secure assignment workspace so
-- the administrator UI can identify who created each class.

create or replace function public.get_assignment_workspace()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_result jsonb;
begin
  if v_role is null
     or v_role not in ('instructor', 'administrator') then
    raise exception 'Instructor or administrator access is required.';
  end if;

  select jsonb_build_object(
    'students',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', profile.id,
            'fullName', profile.full_name,
            'email', auth_user.email
          )
          order by profile.full_name, auth_user.email
        )
        from public.profiles profile
        left join auth.users auth_user
          on auth_user.id = profile.id
        where profile.role::text = 'student'
      ),
      '[]'::jsonb
    ),
    'classes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', section.id,
            'name', section.name,
            'code', section.code,
            'joinCode', section.join_code,
            'academicTerm', section.academic_term,
            'isActive', section.is_active,
            'createdBy', section.created_by,
            'teacherName', owner.full_name,
            'teacherEmail', owner_account.email,
            'studentIds',
            coalesce(
              (
                select jsonb_agg(membership.student_id)
                from public.class_memberships membership
                join public.profiles member_profile
                  on member_profile.id = membership.student_id
                 and member_profile.role::text = 'student'
                where membership.class_id = section.id
              ),
              '[]'::jsonb
            )
          )
          order by section.created_at desc
        )
        from public.class_sections section
        join public.profiles owner
          on owner.id = section.created_by
         and owner.role::text = 'instructor'
        left join auth.users owner_account
          on owner_account.id = section.created_by
        where section.created_by = v_user_id
          or v_role = 'administrator'
      ),
      '[]'::jsonb
    ),
    'approvalRequests',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', request.id,
            'classId', section.id,
            'className', section.name,
            'classCode', section.code,
            'studentId', profile.id,
            'studentName', profile.full_name,
            'studentEmail', auth_user.email,
            'status', request.status,
            'requestedAt', request.requested_at
          )
          order by request.requested_at
        )
        from public.class_join_requests request
        join public.class_sections section
          on section.id = request.class_id
        join public.profiles owner
          on owner.id = section.created_by
         and owner.role::text = 'instructor'
        join public.profiles profile
          on profile.id = request.student_id
         and profile.role::text = 'student'
        left join auth.users auth_user
          on auth_user.id = request.student_id
        where request.status = 'pending'
          and (
            section.created_by = v_user_id
            or v_role = 'administrator'
          )
      ),
      '[]'::jsonb
    ),
    'quizzes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', quiz.id,
            'title', quiz.title,
            'status', quiz.status,
            'accessMode', quiz.access_mode,
            'courseCode', course.code,
            'classIds',
            coalesce(
              (
                select jsonb_agg(assignment.class_id)
                from public.quiz_assignments assignment
                join public.class_sections assigned_section
                  on assigned_section.id = assignment.class_id
                join public.profiles assigned_owner
                  on assigned_owner.id = assigned_section.created_by
                 and assigned_owner.role::text = 'instructor'
                where assignment.quiz_id = quiz.id
              ),
              '[]'::jsonb
            )
          )
          order by quiz.created_at desc
        )
        from public.quizzes quiz
        join public.courses course
          on course.id = quiz.course_id
        where quiz.created_by = v_user_id
          or v_role = 'administrator'
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_assignment_workspace() from public;
grant execute on function public.get_assignment_workspace() to authenticated;

