-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.9: STUDENT QUIZ ARCHIVE PREFERENCES
-- =========================================================

create table if not exists public.student_quiz_preferences (
  student_id uuid not null references public.profiles(id) on delete cascade,
  quiz_id uuid not null references public.quizzes(id) on delete cascade,
  archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, quiz_id)
);

drop trigger if exists student_quiz_preferences_set_updated_at
on public.student_quiz_preferences;

create trigger student_quiz_preferences_set_updated_at
before update on public.student_quiz_preferences
for each row execute function public.set_updated_at();

alter table public.student_quiz_preferences enable row level security;

revoke all on public.student_quiz_preferences from anon, authenticated;
grant select on public.student_quiz_preferences to authenticated;

drop policy if exists "Students can view their quiz preferences"
on public.student_quiz_preferences;

create policy "Students can view their quiz preferences"
on public.student_quiz_preferences
for select to authenticated
using (student_id = auth.uid());

create or replace function public.get_student_quiz_archive_statuses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_result jsonb;
begin
  if v_student_id is null
     or public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'quizId', lifecycle.quiz_id,
        'archived', lifecycle.archived,
        'archivedAt', lifecycle.archived_at,
        'attemptsUsed', lifecycle.attempts_used,
        'maxAttempts', lifecycle.max_attempts,
        'attemptsRemaining',
          greatest(lifecycle.max_attempts - lifecycle.attempts_used, 0),
        'hasCompletedAttempt', lifecycle.has_completed_attempt,
        'hasActiveAttempt', lifecycle.has_active_attempt
      )
      order by lifecycle.latest_attempt_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      quiz.id as quiz_id,
      coalesce(preference.archived, false) as archived,
      preference.archived_at,
      count(attempt.id)::integer as attempts_used,
      (
        quiz.max_attempts
        + coalesce(accommodation.extra_attempts, 0)
      )::integer as max_attempts,
      bool_or(attempt.status in ('submitted', 'expired'))
        as has_completed_attempt,
      bool_or(
        attempt.status = 'in_progress'
        and attempt.expires_at > now()
      ) as has_active_attempt,
      max(attempt.started_at) as latest_attempt_at
    from public.quiz_attempts attempt
    join public.quizzes quiz on quiz.id = attempt.quiz_id
    left join public.student_quiz_preferences preference
      on preference.quiz_id = quiz.id
     and preference.student_id = v_student_id
    left join public.student_quiz_accommodations accommodation
      on accommodation.quiz_id = quiz.id
     and accommodation.student_id = v_student_id
    where attempt.student_id = v_student_id
    group by
      quiz.id,
      quiz.max_attempts,
      accommodation.extra_attempts,
      preference.archived,
      preference.archived_at
  ) lifecycle;

  return v_result;
end;
$$;

create or replace function public.set_student_quiz_archived(
  p_quiz_id uuid,
  p_archived boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_attempts_used integer;
  v_max_attempts integer;
  v_has_completed_attempt boolean;
  v_has_active_attempt boolean;
begin
  if v_student_id is null
     or public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select
    count(attempt.id)::integer,
    (
      quiz.max_attempts
      + coalesce(accommodation.extra_attempts, 0)
    )::integer,
    coalesce(
      bool_or(attempt.status in ('submitted', 'expired')),
      false
    ),
    coalesce(
      bool_or(
        attempt.status = 'in_progress'
        and attempt.expires_at > now()
      ),
      false
    )
  into
    v_attempts_used,
    v_max_attempts,
    v_has_completed_attempt,
    v_has_active_attempt
  from public.quizzes quiz
  left join public.quiz_attempts attempt
    on attempt.quiz_id = quiz.id
   and attempt.student_id = v_student_id
  left join public.student_quiz_accommodations accommodation
    on accommodation.quiz_id = quiz.id
   and accommodation.student_id = v_student_id
  where quiz.id = p_quiz_id
  group by quiz.id, quiz.max_attempts, accommodation.extra_attempts;

  if not found then
    raise exception 'Quiz was not found.';
  end if;

  if p_archived and not v_has_completed_attempt then
    raise exception 'Complete at least one attempt before archiving this quiz.';
  end if;

  if p_archived and v_has_active_attempt then
    raise exception 'Finish or submit the active attempt before archiving.';
  end if;

  if not p_archived
     and not v_has_active_attempt
     and v_attempts_used >= v_max_attempts then
    raise exception 'This quiz has no attempts remaining.';
  end if;

  insert into public.student_quiz_preferences (
    student_id,
    quiz_id,
    archived,
    archived_at
  )
  values (
    v_student_id,
    p_quiz_id,
    p_archived,
    case when p_archived then now() else null end
  )
  on conflict (student_id, quiz_id)
  do update set
    archived = excluded.archived,
    archived_at = excluded.archived_at;

  return jsonb_build_object(
    'quizId', p_quiz_id,
    'archived', p_archived,
    'attemptsUsed', v_attempts_used,
    'maxAttempts', v_max_attempts,
    'attemptsRemaining', greatest(v_max_attempts - v_attempts_used, 0)
  );
end;
$$;

revoke all on function public.get_student_quiz_archive_statuses()
from public;
revoke all on function public.set_student_quiz_archived(uuid, boolean)
from public;

grant execute on function public.get_student_quiz_archive_statuses()
to authenticated;
grant execute on function public.set_student_quiz_archived(uuid, boolean)
to authenticated;

select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name = 'student_quiz_preferences';
