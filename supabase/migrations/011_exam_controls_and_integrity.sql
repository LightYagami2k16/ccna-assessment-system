-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.6: EXAM CONTROLS AND INTEGRITY MONITORING
-- =========================================================

alter table public.quiz_assignments
add column if not exists available_from timestamptz;

alter table public.quiz_assignments
add column if not exists available_until timestamptz;

create table if not exists public.student_quiz_accommodations (
  id uuid primary key default gen_random_uuid(),
  quiz_id uuid not null
    references public.quizzes(id)
    on delete cascade,
  student_id uuid not null
    references public.profiles(id)
    on delete cascade,
  extra_time_minutes integer not null default 0
    check (extra_time_minutes between 0 and 480),
  extra_attempts integer not null default 0
    check (extra_attempts between 0 and 20),
  available_from timestamptz,
  available_until timestamptz,
  created_by uuid not null
    references public.profiles(id)
    on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quiz_id, student_id),
  check (
    available_from is null
    or available_until is null
    or available_from < available_until
  )
);

create table if not exists public.exam_integrity_events (
  id bigint generated always as identity primary key,
  attempt_id uuid not null
    references public.quiz_attempts(id)
    on delete cascade,
  student_id uuid not null
    references public.profiles(id)
    on delete cascade,
  event_type text not null
    check (
      event_type in (
        'page_hidden',
        'page_visible',
        'window_blur',
        'window_focus',
        'fullscreen_exited',
        'connection_lost',
        'connection_restored'
      )
    ),
  occurred_at timestamptz not null default now(),
  details jsonb not null default '{}'::jsonb
);

create index if not exists student_quiz_accommodations_student_idx
on public.student_quiz_accommodations(student_id);

create index if not exists exam_integrity_events_attempt_idx
on public.exam_integrity_events(attempt_id, occurred_at desc);

drop trigger if exists student_quiz_accommodations_set_updated_at
on public.student_quiz_accommodations;

create trigger student_quiz_accommodations_set_updated_at
before update on public.student_quiz_accommodations
for each row
execute function public.set_updated_at();

alter table public.student_quiz_accommodations enable row level security;
alter table public.exam_integrity_events enable row level security;

grant select on public.student_quiz_accommodations to authenticated;
grant select on public.exam_integrity_events to authenticated;

create policy "Users can view relevant accommodations"
on public.student_quiz_accommodations
for select
to authenticated
using (
  student_id = auth.uid()
  or public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Instructors can view integrity events"
on public.exam_integrity_events
for select
to authenticated
using (
  public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create or replace function public.student_can_access_quiz(
  p_quiz_id uuid,
  p_student_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.quizzes quiz
    join public.quiz_assignments assignment
      on assignment.quiz_id = quiz.id
    join public.class_sections section
      on section.id = assignment.class_id
    join public.class_memberships membership
      on membership.class_id = section.id
    left join public.student_quiz_accommodations accommodation
      on accommodation.quiz_id = quiz.id
     and accommodation.student_id = p_student_id
    where quiz.id = p_quiz_id
      and quiz.status = 'published'
      and section.is_active = true
      and membership.student_id = p_student_id
      and (
        coalesce(
          accommodation.available_from,
          assignment.available_from,
          quiz.available_from
        ) is null
        or now() >= coalesce(
          accommodation.available_from,
          assignment.available_from,
          quiz.available_from
        )
      )
      and (
        coalesce(
          accommodation.available_until,
          assignment.available_until,
          quiz.available_until
        ) is null
        or now() <= coalesce(
          accommodation.available_until,
          assignment.available_until,
          quiz.available_until
        )
      )
  );
$$;

create or replace function public.get_available_quizzes_for_student()
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
        'id', quiz.id,
        'title', quiz.title,
        'description', quiz.description,
        'instructions', quiz.instructions,
        'duration_minutes',
          quiz.duration_minutes
          + coalesce(accommodation.extra_time_minutes, 0),
        'max_attempts',
          quiz.max_attempts
          + coalesce(accommodation.extra_attempts, 0),
        'passing_score', quiz.passing_score,
        'available_from', coalesce(
          accommodation.available_from,
          access_window.available_from,
          quiz.available_from
        ),
        'available_until', coalesce(
          accommodation.available_until,
          access_window.available_until,
          quiz.available_until
        ),
        'show_results_immediately', quiz.show_results_immediately,
        'randomize_questions', quiz.randomize_questions,
        'randomize_options', quiz.randomize_options,
        'access_mode', quiz.access_mode,
        'created_at', quiz.created_at,
        'courses', jsonb_build_object(
          'id', course.id,
          'code', course.code,
          'title', course.title
        ),
        'modules',
        case
          when module.id is null then null
          else jsonb_build_object(
            'id', module.id,
            'code', module.code,
            'title', module.title
          )
        end
      )
      order by quiz.created_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.quizzes quiz
  join public.courses course
    on course.id = quiz.course_id
  left join public.modules module
    on module.id = quiz.module_id
  left join public.student_quiz_accommodations accommodation
    on accommodation.quiz_id = quiz.id
   and accommodation.student_id = v_student_id
  left join lateral (
    select
      min(assignment.available_from) as available_from,
      max(assignment.available_until) as available_until
    from public.quiz_assignments assignment
    join public.class_memberships membership
      on membership.class_id = assignment.class_id
    join public.class_sections section
      on section.id = assignment.class_id
    where assignment.quiz_id = quiz.id
      and membership.student_id = v_student_id
      and section.is_active = true
  ) access_window on true
  where public.student_can_access_quiz(quiz.id, v_student_id);

  return v_result;
end;
$$;

create or replace function public.get_exam_controls_workspace()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_result jsonb;
begin
  select role::text
  into v_role
  from public.profiles
  where id = v_user_id;

  if v_role is null
     or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
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
    'quizzes',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', quiz.id,
            'title', quiz.title,
            'status', quiz.status,
            'courseCode', course.code,
            'durationMinutes', quiz.duration_minutes,
            'maxAttempts', quiz.max_attempts
          )
          order by quiz.created_at desc
        )
        from public.quizzes quiz
        join public.courses course
          on course.id = quiz.course_id
        where quiz.created_by = v_user_id
          or v_role = 'admin'
      ),
      '[]'::jsonb
    ),
    'assignments',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', assignment.id,
            'quizId', assignment.quiz_id,
            'quizTitle', quiz.title,
            'classId', assignment.class_id,
            'className', section.name,
            'classCode', section.code,
            'availableFrom', assignment.available_from,
            'availableUntil', assignment.available_until
          )
          order by quiz.title, section.code
        )
        from public.quiz_assignments assignment
        join public.quizzes quiz
          on quiz.id = assignment.quiz_id
        join public.class_sections section
          on section.id = assignment.class_id
        where quiz.created_by = v_user_id
          or v_role = 'admin'
      ),
      '[]'::jsonb
    ),
    'accommodations',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', accommodation.id,
            'quizId', accommodation.quiz_id,
            'quizTitle', quiz.title,
            'studentId', accommodation.student_id,
            'studentName', profile.full_name,
            'extraTimeMinutes', accommodation.extra_time_minutes,
            'extraAttempts', accommodation.extra_attempts,
            'availableFrom', accommodation.available_from,
            'availableUntil', accommodation.available_until
          )
          order by accommodation.updated_at desc
        )
        from public.student_quiz_accommodations accommodation
        join public.quizzes quiz
          on quiz.id = accommodation.quiz_id
        join public.profiles profile
          on profile.id = accommodation.student_id
        where quiz.created_by = v_user_id
          or v_role = 'admin'
      ),
      '[]'::jsonb
    ),
    'activeAttempts',
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'attemptId', attempt.id,
            'quizTitle', quiz.title,
            'studentName', profile.full_name,
            'studentEmail', auth_user.email,
            'startedAt', attempt.started_at,
            'expiresAt', attempt.expires_at,
            'eventCount', (
              select count(*)
              from public.exam_integrity_events event
              where event.attempt_id = attempt.id
            ),
            'latestEvent', (
              select jsonb_build_object(
                'type', event.event_type,
                'occurredAt', event.occurred_at,
                'details', event.details
              )
              from public.exam_integrity_events event
              where event.attempt_id = attempt.id
              order by event.occurred_at desc
              limit 1
            )
          )
          order by attempt.started_at desc
        )
        from public.quiz_attempts attempt
        join public.quizzes quiz
          on quiz.id = attempt.quiz_id
        join public.profiles profile
          on profile.id = attempt.student_id
        left join auth.users auth_user
          on auth_user.id = attempt.student_id
        where attempt.status = 'in_progress'
          and (
            quiz.created_by = v_user_id
            or v_role = 'admin'
          )
      ),
      '[]'::jsonb
    )
  )
  into v_result;

  return v_result;
end;
$$;

create or replace function public.save_quiz_assignment_schedule(
  p_quiz_id uuid,
  p_class_id uuid,
  p_available_from timestamptz,
  p_available_until timestamptz
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
  from public.profiles where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if p_available_from is not null
     and p_available_until is not null
     and p_available_from >= p_available_until then
    raise exception 'The closing time must be later than the opening time.';
  end if;

  update public.quiz_assignments assignment
  set
    available_from = p_available_from,
    available_until = p_available_until
  from public.quizzes quiz
  where assignment.quiz_id = p_quiz_id
    and assignment.class_id = p_class_id
    and quiz.id = assignment.quiz_id
    and (
      quiz.created_by = v_user_id
      or v_role = 'admin'
    );

  if not found then
    raise exception 'Quiz assignment was not found or cannot be changed.';
  end if;

  return true;
end;
$$;

create or replace function public.save_student_quiz_accommodation(
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
  v_quiz_id uuid := (p_payload->>'quizId')::uuid;
  v_student_id uuid := (p_payload->>'studentId')::uuid;
  v_result_id uuid;
begin
  select role::text into v_role
  from public.profiles where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1 from public.quizzes
    where id = v_quiz_id
      and (created_by = v_user_id or v_role = 'admin')
  ) then
    raise exception 'Quiz was not found or cannot be changed.';
  end if;

  if not exists (
    select 1 from public.profiles
    where id = v_student_id and role::text = 'student'
  ) then
    raise exception 'The selected student is invalid.';
  end if;

  if nullif(p_payload->>'availableFrom', '') is not null
     and nullif(p_payload->>'availableUntil', '') is not null
     and (p_payload->>'availableFrom')::timestamptz
       >= (p_payload->>'availableUntil')::timestamptz then
    raise exception 'The closing time must be later than the opening time.';
  end if;

  insert into public.student_quiz_accommodations (
    quiz_id,
    student_id,
    extra_time_minutes,
    extra_attempts,
    available_from,
    available_until,
    created_by
  )
  values (
    v_quiz_id,
    v_student_id,
    coalesce((p_payload->>'extraTimeMinutes')::integer, 0),
    coalesce((p_payload->>'extraAttempts')::integer, 0),
    nullif(p_payload->>'availableFrom', '')::timestamptz,
    nullif(p_payload->>'availableUntil', '')::timestamptz,
    v_user_id
  )
  on conflict (quiz_id, student_id)
  do update set
    extra_time_minutes = excluded.extra_time_minutes,
    extra_attempts = excluded.extra_attempts,
    available_from = excluded.available_from,
    available_until = excluded.available_until,
    created_by = v_user_id
  returning id into v_result_id;

  return v_result_id;
end;
$$;

create or replace function public.delete_student_quiz_accommodation(
  p_accommodation_id uuid
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
  from public.profiles where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  delete from public.student_quiz_accommodations accommodation
  using public.quizzes quiz
  where accommodation.id = p_accommodation_id
    and quiz.id = accommodation.quiz_id
    and (quiz.created_by = v_user_id or v_role = 'admin');

  if not found then
    raise exception 'Accommodation was not found or cannot be deleted.';
  end if;

  return true;
end;
$$;

create or replace function public.grant_student_extra_attempt(
  p_quiz_id uuid,
  p_student_id uuid
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
  from public.profiles where id = v_user_id;

  if v_role is null or v_role not in ('instructor', 'admin') then
    raise exception 'Instructor access is required.';
  end if;

  if not exists (
    select 1 from public.quizzes
    where id = p_quiz_id
      and (created_by = v_user_id or v_role = 'admin')
  ) then
    raise exception 'Quiz was not found or cannot be changed.';
  end if;

  insert into public.student_quiz_accommodations (
    quiz_id,
    student_id,
    extra_attempts,
    created_by
  )
  values (p_quiz_id, p_student_id, 1, v_user_id)
  on conflict (quiz_id, student_id)
  do update set
    extra_attempts =
      public.student_quiz_accommodations.extra_attempts + 1,
    created_by = v_user_id;

  return true;
end;
$$;

create or replace function public.record_exam_integrity_event(
  p_attempt_id uuid,
  p_event_type text,
  p_details jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if p_event_type not in (
    'page_hidden',
    'page_visible',
    'window_blur',
    'window_focus',
    'fullscreen_exited',
    'connection_lost',
    'connection_restored'
  ) then
    raise exception 'Unsupported integrity event.';
  end if;

  if not exists (
    select 1
    from public.quiz_attempts
    where id = p_attempt_id
      and student_id = v_student_id
      and status = 'in_progress'
  ) then
    raise exception 'Active quiz attempt was not found.';
  end if;

  insert into public.exam_integrity_events (
    attempt_id,
    student_id,
    event_type,
    details
  )
  values (
    p_attempt_id,
    v_student_id,
    p_event_type,
    coalesce(p_details, '{}'::jsonb)
  );

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

  select coalesce(sum(question.points), 0)
  into v_maximum_points
  from public.quiz_questions quiz_question
  join public.questions question
    on question.id = quiz_question.question_id
  where quiz_question.quiz_id = p_quiz_id;

  if v_maximum_points <= 0 then
    raise exception 'This quiz does not contain any questions.';
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
    v_maximum_points
  )
  returning id into v_attempt_id;

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

  return v_attempt_id;
end;
$$;

revoke all on function public.get_exam_controls_workspace() from public;
revoke all on function public.save_quiz_assignment_schedule(uuid, uuid, timestamptz, timestamptz) from public;
revoke all on function public.save_student_quiz_accommodation(jsonb) from public;
revoke all on function public.delete_student_quiz_accommodation(uuid) from public;
revoke all on function public.grant_student_extra_attempt(uuid, uuid) from public;
revoke all on function public.record_exam_integrity_event(uuid, text, jsonb) from public;

grant execute on function public.get_exam_controls_workspace() to authenticated;
grant execute on function public.save_quiz_assignment_schedule(uuid, uuid, timestamptz, timestamptz) to authenticated;
grant execute on function public.save_student_quiz_accommodation(jsonb) to authenticated;
grant execute on function public.delete_student_quiz_accommodation(uuid) to authenticated;
grant execute on function public.grant_student_extra_attempt(uuid, uuid) to authenticated;
grant execute on function public.record_exam_integrity_event(uuid, text, jsonb) to authenticated;
