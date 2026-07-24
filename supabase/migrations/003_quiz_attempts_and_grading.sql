-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.3A
-- QUIZ ATTEMPTS, AUTOSAVE, TIMER, AND GRADING
-- =========================================================

-- =========================================================
-- 1. ADD QUIZ EXAM SETTINGS
-- =========================================================

alter table public.quizzes
add column if not exists duration_minutes integer
not null default 15;

alter table public.quizzes
add column if not exists max_attempts integer
not null default 1;

alter table public.quizzes
add column if not exists show_results_immediately boolean
not null default true;

alter table public.quizzes
add column if not exists available_from timestamptz;

alter table public.quizzes
add column if not exists available_until timestamptz;

alter table public.quizzes
drop constraint if exists quizzes_duration_minutes_valid;

alter table public.quizzes
add constraint quizzes_duration_minutes_valid
check (
    duration_minutes >= 1
    and duration_minutes <= 480
);

alter table public.quizzes
drop constraint if exists quizzes_max_attempts_valid;

alter table public.quizzes
add constraint quizzes_max_attempts_valid
check (
    max_attempts >= 1
    and max_attempts <= 100
);

-- =========================================================
-- 2. QUIZ ATTEMPTS TABLE
-- =========================================================

create table if not exists public.quiz_attempts (
    id uuid primary key default gen_random_uuid(),

    quiz_id uuid not null
        references public.quizzes(id)
        on delete cascade,

    student_id uuid not null
        references public.profiles(id)
        on delete cascade,

    attempt_number integer not null,

    status text not null default 'in_progress',

    started_at timestamptz not null default now(),
    expires_at timestamptz not null,
    submitted_at timestamptz,

    score_points numeric(10,2) not null default 0,
    maximum_points numeric(10,2) not null default 0,

    percentage numeric(5,2) not null default 0,

    passed boolean,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint quiz_attempt_status_valid
        check (
            status in (
                'in_progress',
                'submitted',
                'expired'
            )
        ),

    constraint quiz_attempt_number_positive
        check (attempt_number >= 1),

    constraint quiz_attempt_percentage_valid
        check (
            percentage >= 0
            and percentage <= 100
        ),

    constraint quiz_attempt_unique_number
        unique (
            quiz_id,
            student_id,
            attempt_number
        )
);

-- =========================================================
-- 3. ATTEMPT QUESTION SNAPSHOTS
--
-- This stores which questions were included in a student's
-- attempt and the order in which they appeared.
-- =========================================================

create table if not exists public.quiz_attempt_questions (
    id uuid primary key default gen_random_uuid(),

    attempt_id uuid not null
        references public.quiz_attempts(id)
        on delete cascade,

    question_id uuid not null
        references public.questions(id)
        on delete restrict,

    sort_order integer not null default 0,

    points numeric(8,2) not null,

    created_at timestamptz not null default now(),

    constraint attempt_question_points_positive
        check (points > 0),

    constraint attempt_question_unique
        unique (
            attempt_id,
            question_id
        )
);

-- =========================================================
-- 4. ATTEMPT ANSWERS TABLE
-- =========================================================

create table if not exists public.quiz_attempt_answers (
    id uuid primary key default gen_random_uuid(),

    attempt_question_id uuid not null
        references public.quiz_attempt_questions(id)
        on delete cascade,

    selected_option_id uuid
        references public.question_options(id)
        on delete set null,

    answered_at timestamptz not null default now(),

    is_correct boolean,

    points_awarded numeric(8,2) not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint one_answer_per_attempt_question
        unique (attempt_question_id),

    constraint points_awarded_nonnegative
        check (points_awarded >= 0)
);

-- =========================================================
-- 5. INDEXES
-- =========================================================

create index if not exists quiz_attempts_quiz_id_idx
on public.quiz_attempts(quiz_id);

create index if not exists quiz_attempts_student_id_idx
on public.quiz_attempts(student_id);

create index if not exists quiz_attempts_status_idx
on public.quiz_attempts(status);

create index if not exists quiz_attempt_questions_attempt_id_idx
on public.quiz_attempt_questions(attempt_id);

create index if not exists quiz_attempt_questions_question_id_idx
on public.quiz_attempt_questions(question_id);

create index if not exists quiz_attempt_answers_question_idx
on public.quiz_attempt_answers(attempt_question_id);

-- =========================================================
-- 6. UPDATED-AT TRIGGERS
--
-- set_updated_at() was created in Phase 1.2.
-- =========================================================

drop trigger if exists quiz_attempts_set_updated_at
on public.quiz_attempts;

create trigger quiz_attempts_set_updated_at
before update on public.quiz_attempts
for each row
execute function public.set_updated_at();

drop trigger if exists quiz_attempt_answers_set_updated_at
on public.quiz_attempt_answers;

create trigger quiz_attempt_answers_set_updated_at
before update on public.quiz_attempt_answers
for each row
execute function public.set_updated_at();

-- =========================================================
-- 7. ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.quiz_attempts
enable row level security;

alter table public.quiz_attempt_questions
enable row level security;

alter table public.quiz_attempt_answers
enable row level security;

-- =========================================================
-- 8. TABLE PERMISSIONS
-- =========================================================

grant select
on public.quiz_attempts
to authenticated;

grant select
on public.quiz_attempt_questions
to authenticated;

grant select
on public.quiz_attempt_answers
to authenticated;

-- Direct insert/update/delete is intentionally not granted.
-- Students will use secure database functions instead.

-- =========================================================
-- 9. QUIZ ATTEMPT SELECT POLICIES
-- =========================================================

create policy "Students can view their quiz attempts"
on public.quiz_attempts
for select
to authenticated
using (
    student_id = auth.uid()
);

create policy "Instructors can view all quiz attempts"
on public.quiz_attempts
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

-- =========================================================
-- 10. ATTEMPT QUESTION SELECT POLICIES
-- =========================================================

create policy "Students can view their attempt questions"
on public.quiz_attempt_questions
for select
to authenticated
using (
    exists (
        select 1
        from public.quiz_attempts attempt
        where attempt.id =
            quiz_attempt_questions.attempt_id
          and attempt.student_id = auth.uid()
    )
);

create policy "Instructors can view attempt questions"
on public.quiz_attempt_questions
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

-- =========================================================
-- 11. ATTEMPT ANSWER SELECT POLICIES
-- =========================================================

create policy "Students can view their saved answers"
on public.quiz_attempt_answers
for select
to authenticated
using (
    exists (
        select 1
        from public.quiz_attempt_questions aq
        join public.quiz_attempts attempt
          on attempt.id = aq.attempt_id
        where aq.id =
            quiz_attempt_answers.attempt_question_id
          and attempt.student_id = auth.uid()
    )
);

create policy "Instructors can view attempt answers"
on public.quiz_attempt_answers
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

-- =========================================================
-- 12. START QUIZ ATTEMPT FUNCTION
-- =========================================================

create or replace function public.start_quiz_attempt(
    p_quiz_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid;
    v_quiz public.quizzes%rowtype;
    v_existing_attempt_id uuid;
    v_attempt_count integer;
    v_attempt_id uuid;
    v_maximum_points numeric(10,2);
begin
    v_student_id := auth.uid();

    if v_student_id is null then
        raise exception 'You must be signed in.';
    end if;

    if public.get_current_user_role_text() <> 'student' then
        raise exception 'Only students may start a quiz.';
    end if;

    select *
    into v_quiz
    from public.quizzes
    where id = p_quiz_id
      and status = 'published';

    if not found then
        raise exception 'Quiz was not found or is not published.';
    end if;

    if v_quiz.available_from is not null
       and now() < v_quiz.available_from then
        raise exception 'This quiz is not available yet.';
    end if;

    if v_quiz.available_until is not null
       and now() > v_quiz.available_until then
        raise exception 'This quiz is no longer available.';
    end if;

    select id
    into v_existing_attempt_id
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

    select count(*)
    into v_attempt_count
    from public.quiz_attempts
    where quiz_id = p_quiz_id
      and student_id = v_student_id;

    if v_attempt_count >= v_quiz.max_attempts then
        raise exception 'Maximum quiz attempts reached.';
    end if;

    select coalesce(sum(q.points), 0)
    into v_maximum_points
    from public.quiz_questions qq
    join public.questions q
      on q.id = qq.question_id
    where qq.quiz_id = p_quiz_id;

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
            mins => v_quiz.duration_minutes
        ),
        v_maximum_points
    )
    returning id into v_attempt_id;

    if v_quiz.randomize_questions then
        insert into public.quiz_attempt_questions (
            attempt_id,
            question_id,
            sort_order,
            points
        )
        select
            v_attempt_id,
            q.id,
            row_number() over (
                order by random()
            )::integer,
            q.points
        from public.quiz_questions qq
        join public.questions q
          on q.id = qq.question_id
        where qq.quiz_id = p_quiz_id;
    else
        insert into public.quiz_attempt_questions (
            attempt_id,
            question_id,
            sort_order,
            points
        )
        select
            v_attempt_id,
            q.id,
            qq.sort_order,
            q.points
        from public.quiz_questions qq
        join public.questions q
          on q.id = qq.question_id
        where qq.quiz_id = p_quiz_id
        order by qq.sort_order;
    end if;

    return v_attempt_id;
end;
$$;

-- =========================================================
-- 13. GET SAFE QUIZ ATTEMPT FUNCTION
--
-- This returns option IDs and option text but does not return
-- the is_correct answer value.
-- =========================================================

create or replace function public.get_quiz_attempt_safe(
    p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid;
    v_attempt public.quiz_attempts%rowtype;
    v_result jsonb;
begin
    v_student_id := auth.uid();

    if v_student_id is null then
        raise exception 'You must be signed in.';
    end if;

    select *
    into v_attempt
    from public.quiz_attempts
    where id = p_attempt_id
      and student_id = v_student_id;

    if not found then
        raise exception 'Quiz attempt was not found.';
    end if;

    if v_attempt.status = 'in_progress'
       and v_attempt.expires_at <= now() then
        update public.quiz_attempts
        set status = 'expired'
        where id = p_attempt_id;

        v_attempt.status := 'expired';
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
                        'questionId', q.id,
                        'sortOrder', aq.sort_order,
                        'points', aq.points,
                        'type', q.question_type,
                        'title', q.title,
                        'questionText', q.question_text,
                        'selectedOptionId', answer.selected_option_id,
                        'options', (
                            select jsonb_agg(
                                jsonb_build_object(
                                    'id', option_row.id,
                                    'text', option_row.option_text,
                                    'sortOrder',
                                        option_row.sort_order
                                )
                                order by option_row.sort_order
                            )
                            from public.question_options
                                option_row
                            where option_row.question_id = q.id
                        )
                    )
                    order by aq.sort_order
                )
                from public.quiz_attempt_questions aq
                join public.questions q
                  on q.id = aq.question_id
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

-- =========================================================
-- 14. SAVE OR UPDATE QUIZ ANSWER FUNCTION
-- =========================================================

create or replace function public.save_quiz_answer(
    p_attempt_id uuid,
    p_attempt_question_id uuid,
    p_selected_option_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid;
    v_question_id uuid;
begin
    v_student_id := auth.uid();

    if v_student_id is null then
        raise exception 'You must be signed in.';
    end if;

    select aq.question_id
    into v_question_id
    from public.quiz_attempt_questions aq
    join public.quiz_attempts attempt
      on attempt.id = aq.attempt_id
    where attempt.id = p_attempt_id
      and attempt.student_id = v_student_id
      and attempt.status = 'in_progress'
      and attempt.expires_at > now()
      and aq.id = p_attempt_question_id;

    if not found then
        raise exception
            'The attempt is invalid, submitted, or expired.';
    end if;

    if not exists (
        select 1
        from public.question_options option_row
        where option_row.id = p_selected_option_id
          and option_row.question_id = v_question_id
    ) then
        raise exception
            'The selected option does not belong to this question.';
    end if;

    insert into public.quiz_attempt_answers (
        attempt_question_id,
        selected_option_id,
        answered_at
    )
    values (
        p_attempt_question_id,
        p_selected_option_id,
        now()
    )
    on conflict (attempt_question_id)
    do update set
        selected_option_id =
            excluded.selected_option_id,
        answered_at = now(),
        is_correct = null,
        points_awarded = 0;

    return true;
end;
$$;

-- =========================================================
-- 15. SUBMIT AND GRADE QUIZ FUNCTION
-- =========================================================

create or replace function public.submit_quiz_attempt(
    p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_student_id uuid;
    v_quiz_id uuid;
    v_status text;
    v_expires_at timestamptz;
    v_score numeric(10,2);
    v_maximum numeric(10,2);
    v_percentage numeric(5,2);
    v_passing_score numeric(5,2);
    v_passed boolean;
begin
    v_student_id := auth.uid();

    if v_student_id is null then
        raise exception 'You must be signed in.';
    end if;

    select
        attempt.quiz_id,
        attempt.status,
        attempt.expires_at,
        attempt.maximum_points,
        quiz.passing_score
    into
        v_quiz_id,
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

    update public.quiz_attempt_answers answer
    set
        is_correct = option_row.is_correct,
        points_awarded = case
            when option_row.is_correct
            then aq.points
            else 0
        end
    from public.question_options option_row,
         public.quiz_attempt_questions aq
    where answer.selected_option_id = option_row.id
      and answer.attempt_question_id = aq.id
      and aq.attempt_id = p_attempt_id;

    select coalesce(sum(points_awarded), 0)
    into v_score
    from public.quiz_attempt_answers answer
    join public.quiz_attempt_questions aq
      on aq.id = answer.attempt_question_id
    where aq.attempt_id = p_attempt_id;

    if v_maximum > 0 then
        v_percentage :=
            round((v_score / v_maximum) * 100, 2);
    else
        v_percentage := 0;
    end if;

    v_passed := v_percentage >= v_passing_score;

    update public.quiz_attempts
    set
        status = case
            when now() > v_expires_at
            then 'expired'
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

-- =========================================================
-- 16. FUNCTION PERMISSIONS
-- =========================================================

revoke all
on function public.start_quiz_attempt(uuid)
from public;

revoke all
on function public.get_quiz_attempt_safe(uuid)
from public;

revoke all
on function public.save_quiz_answer(
    uuid,
    uuid,
    uuid
)
from public;

revoke all
on function public.submit_quiz_attempt(uuid)
from public;

grant execute
on function public.start_quiz_attempt(uuid)
to authenticated;

grant execute
on function public.get_quiz_attempt_safe(uuid)
to authenticated;

grant execute
on function public.save_quiz_answer(
    uuid,
    uuid,
    uuid
)
to authenticated;

grant execute
on function public.submit_quiz_attempt(uuid)
to authenticated;

-- =========================================================
-- 17. VERIFICATION
-- =========================================================

select
    table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in (
      'quiz_attempts',
      'quiz_attempt_questions',
      'quiz_attempt_answers'
  )
order by table_name;