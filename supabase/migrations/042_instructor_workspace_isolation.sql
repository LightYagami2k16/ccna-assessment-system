-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- INSTRUCTOR WORKSPACE AND CLASS DATA ISOLATION
-- =========================================================
--
-- Instructors may only read classes they created and the
-- memberships, assignments, attempts, accommodations, and
-- integrity events connected to their own workspace.
--
-- The shared instructor resources remain:
--   1. The question bank and its answer options.
--   2. The student account directory used for adding a
--      registered student to a class by email address.
--
-- Administrators retain platform-wide oversight. Students
-- retain access only to their own enrollment and attempts.

-- =========================================================
-- 1. SECURITY-DEFINER AUTHORIZATION HELPERS
-- =========================================================

create or replace function public.current_user_can_manage_class(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_sections section
    where section.id = p_class_id
      and (
        section.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  );
$$;

create or replace function public.current_user_is_class_member(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships membership
    where membership.class_id = p_class_id
      and membership.student_id = auth.uid()
  );
$$;

create or replace function public.current_user_is_active_class_member(
  p_class_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.class_memberships membership
    join public.class_sections section
      on section.id = membership.class_id
    where membership.class_id = p_class_id
      and membership.student_id = auth.uid()
      and section.is_active = true
  );
$$;

create or replace function public.current_user_can_view_quiz_attempt(
  p_attempt_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quiz_attempts attempt
    join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    where attempt.id = p_attempt_id
      and (
        attempt.student_id = auth.uid()
        or quiz.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  );
$$;

create or replace function
public.current_user_can_view_attempt_question(
  p_attempt_question_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quiz_attempt_questions attempt_question
    join public.quiz_attempts attempt
      on attempt.id = attempt_question.attempt_id
    join public.quizzes quiz
      on quiz.id = attempt.quiz_id
    where attempt_question.id = p_attempt_question_id
      and (
        attempt.student_id = auth.uid()
        or quiz.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  );
$$;

revoke all
on function public.current_user_can_manage_class(uuid)
from public;

revoke all
on function public.current_user_is_class_member(uuid)
from public;

revoke all
on function public.current_user_is_active_class_member(uuid)
from public;

revoke all
on function public.current_user_can_view_quiz_attempt(uuid)
from public;

revoke all
on function public.current_user_can_view_attempt_question(uuid)
from public;

grant execute
on function public.current_user_can_manage_class(uuid)
to authenticated;

grant execute
on function public.current_user_is_class_member(uuid)
to authenticated;

grant execute
on function public.current_user_is_active_class_member(uuid)
to authenticated;

grant execute
on function public.current_user_can_view_quiz_attempt(uuid)
to authenticated;

grant execute
on function public.current_user_can_view_attempt_question(uuid)
to authenticated;

-- =========================================================
-- 2. CLASS, MEMBERSHIP, AND JOIN-REQUEST VISIBILITY
-- =========================================================

drop policy if exists "Instructors can view their classes"
on public.class_sections;

drop policy if exists "Users can view permitted class sections"
on public.class_sections;

create policy "Users can view permitted class sections"
on public.class_sections
for select
to authenticated
using (
  (
    public.get_current_user_role_text() = 'instructor'
    and created_by = auth.uid()
  )
  or public.get_current_user_role_text()
    in ('admin', 'administrator')
  or (
    public.get_current_user_role_text() = 'student'
    and public.current_user_is_class_member(id)
  )
);

drop policy if exists "Users can view relevant class memberships"
on public.class_memberships;

drop policy if exists "Users can view permitted class memberships"
on public.class_memberships;

create policy "Users can view permitted class memberships"
on public.class_memberships
for select
to authenticated
using (
  student_id = auth.uid()
  or public.current_user_can_manage_class(class_id)
);

drop policy if exists "Students can view their class join requests"
on public.class_join_requests;

drop policy if exists "Instructors can view class join requests"
on public.class_join_requests;

drop policy if exists "Users can view permitted class join requests"
on public.class_join_requests;

create policy "Users can view permitted class join requests"
on public.class_join_requests
for select
to authenticated
using (
  student_id = auth.uid()
  or public.current_user_can_manage_class(class_id)
);

-- =========================================================
-- 3. QUIZ AND CLI ASSIGNMENTS FOLLOW CLASS OWNERSHIP
-- =========================================================

drop policy if exists "Users can view relevant quiz assignments"
on public.quiz_assignments;

drop policy if exists "Users can view permitted quiz assignments"
on public.quiz_assignments;

create policy "Users can view permitted quiz assignments"
on public.quiz_assignments
for select
to authenticated
using (
  public.current_user_can_manage_class(class_id)
  or (
    public.get_current_user_role_text() = 'student'
    and public.current_user_is_active_class_member(class_id)
  )
);

drop policy if exists "Users view relevant CLI assignments"
on public.cli_lab_assignments;

drop policy if exists "Users view permitted CLI assignments"
on public.cli_lab_assignments;

create policy "Users view permitted CLI assignments"
on public.cli_lab_assignments
for select
to authenticated
using (
  public.current_user_can_manage_class(class_id)
  or (
    public.get_current_user_role_text() = 'student'
    and public.current_user_is_active_class_member(class_id)
  )
);

-- =========================================================
-- 4. INSTRUCTOR QUIZZES REMAIN PRIVATE
-- =========================================================
--
-- Questions and question options remain shared between
-- instructors. Quizzes and their selected-question mappings
-- remain private to their creator.

drop policy if exists "Instructors can view quizzes"
on public.quizzes;

drop policy if exists "Quiz authors can view their quizzes"
on public.quizzes;

create policy "Quiz authors can view their quizzes"
on public.quizzes
for select
to authenticated
using (
  (
    public.get_current_user_role_text() = 'instructor'
    and created_by = auth.uid()
  )
  or public.get_current_user_role_text()
    in ('admin', 'administrator')
);

drop policy if exists "Instructors can view quiz questions"
on public.quiz_questions;

drop policy if exists "Quiz authors can view quiz questions"
on public.quiz_questions;

create policy "Quiz authors can view quiz questions"
on public.quiz_questions
for select
to authenticated
using (
  exists (
    select 1
    from public.quizzes quiz
    where quiz.id = quiz_questions.quiz_id
      and (
        quiz.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  )
);

-- Explicitly preserve the common instructor question bank.
drop policy if exists "Instructors can view questions"
on public.questions;

create policy "Instructors can view questions"
on public.questions
for select
to authenticated
using (
  public.get_current_user_role_text()
    in ('instructor', 'admin', 'administrator')
);

drop policy if exists "Instructors can view question options"
on public.question_options;

create policy "Instructors can view question options"
on public.question_options
for select
to authenticated
using (
  public.get_current_user_role_text()
    in ('instructor', 'admin', 'administrator')
);

-- =========================================================
-- 5. QUIZ RESULTS AND MONITORING FOLLOW QUIZ OWNERSHIP
-- =========================================================

drop policy if exists "Students can view their quiz attempts"
on public.quiz_attempts;

drop policy if exists "Instructors can view all quiz attempts"
on public.quiz_attempts;

drop policy if exists "Users can view permitted quiz attempts"
on public.quiz_attempts;

create policy "Users can view permitted quiz attempts"
on public.quiz_attempts
for select
to authenticated
using (
  public.current_user_can_view_quiz_attempt(id)
);

drop policy if exists "Students can view their attempt questions"
on public.quiz_attempt_questions;

drop policy if exists "Instructors can view attempt questions"
on public.quiz_attempt_questions;

drop policy if exists "Users can view permitted attempt questions"
on public.quiz_attempt_questions;

create policy "Users can view permitted attempt questions"
on public.quiz_attempt_questions
for select
to authenticated
using (
  public.current_user_can_view_attempt_question(id)
);

drop policy if exists "Students can view their saved answers"
on public.quiz_attempt_answers;

drop policy if exists "Instructors can view attempt answers"
on public.quiz_attempt_answers;

drop policy if exists "Users can view permitted attempt answers"
on public.quiz_attempt_answers;

create policy "Users can view permitted attempt answers"
on public.quiz_attempt_answers
for select
to authenticated
using (
  public.current_user_can_view_attempt_question(
    attempt_question_id
  )
);

drop policy if exists "Users can view relevant accommodations"
on public.student_quiz_accommodations;

drop policy if exists "Users can view permitted accommodations"
on public.student_quiz_accommodations;

create policy "Users can view permitted accommodations"
on public.student_quiz_accommodations
for select
to authenticated
using (
  student_id = auth.uid()
  or exists (
    select 1
    from public.quizzes quiz
    where quiz.id = student_quiz_accommodations.quiz_id
      and (
        quiz.created_by = auth.uid()
        or public.get_current_user_role_text()
          in ('admin', 'administrator')
      )
  )
);

drop policy if exists "Instructors can view integrity events"
on public.exam_integrity_events;

drop policy if exists "Users can view permitted quiz integrity events"
on public.exam_integrity_events;

create policy "Users can view permitted quiz integrity events"
on public.exam_integrity_events
for select
to authenticated
using (
  public.current_user_can_view_quiz_attempt(attempt_id)
);

-- =========================================================
-- 6. VERIFICATION SUMMARY
-- =========================================================

select
  schemaname,
  tablename,
  policyname
from pg_policies
where schemaname = 'public'
  and tablename in (
    'class_sections',
    'class_memberships',
    'class_join_requests',
    'quiz_assignments',
    'cli_lab_assignments',
    'quizzes',
    'quiz_questions',
    'questions',
    'question_options',
    'quiz_attempts',
    'quiz_attempt_questions',
    'quiz_attempt_answers',
    'student_quiz_accommodations',
    'exam_integrity_events'
  )
order by tablename, policyname;
