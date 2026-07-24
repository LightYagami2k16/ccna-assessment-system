-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 1.2: QUESTION BANK AND QUIZ BUILDER
--
-- Compatible with:
-- public.courses.id = bigint
-- public.profiles.id = uuid
-- =========================================================

-- =========================================================
-- 1. CLEAN UP ONLY PHASE 1.2 OBJECTS
-- =========================================================

drop table if exists public.quiz_questions cascade;
drop table if exists public.question_options cascade;
drop table if exists public.quizzes cascade;
drop table if exists public.questions cascade;
drop table if exists public.modules cascade;

drop function if exists public.get_current_user_role_text();

drop type if exists public.question_type cascade;
drop type if exists public.content_status cascade;

-- =========================================================
-- 2. ENUM TYPES
-- =========================================================

create type public.question_type as enum (
    'multiple_choice',
    'true_false'
);

create type public.content_status as enum (
    'draft',
    'published',
    'archived'
);

-- =========================================================
-- 3. MODULES TABLE
-- =========================================================

create table public.modules (
    id uuid primary key default gen_random_uuid(),

    course_id bigint not null
        references public.courses(id)
        on delete cascade,

    code text not null,
    title text not null,
    description text,

    sort_order integer not null default 0,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint modules_course_code_unique
        unique (course_id, code)
);

-- =========================================================
-- 4. QUESTIONS TABLE
-- =========================================================

create table public.questions (
    id uuid primary key default gen_random_uuid(),

    course_id bigint not null
        references public.courses(id)
        on delete cascade,

    module_id uuid
        references public.modules(id)
        on delete set null,

    created_by uuid not null
        references public.profiles(id)
        on delete restrict,

    question_type public.question_type not null,

    title text not null,
    question_text text not null,
    explanation text,

    points numeric(8,2) not null default 1,

    difficulty text not null default 'beginner',

    status public.content_status not null default 'draft',

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint questions_points_positive
        check (points > 0),

    constraint questions_difficulty_valid
        check (
            difficulty in (
                'beginner',
                'intermediate',
                'advanced'
            )
        )
);

-- =========================================================
-- 5. QUESTION OPTIONS TABLE
-- =========================================================

create table public.question_options (
    id uuid primary key default gen_random_uuid(),

    question_id uuid not null
        references public.questions(id)
        on delete cascade,

    option_text text not null,
    is_correct boolean not null default false,
    sort_order integer not null default 0,

    created_at timestamptz not null default now(),

    constraint question_options_text_not_empty
        check (length(trim(option_text)) > 0)
);

-- =========================================================
-- 6. QUIZZES TABLE
-- =========================================================

create table public.quizzes (
    id uuid primary key default gen_random_uuid(),

    course_id bigint not null
        references public.courses(id)
        on delete cascade,

    module_id uuid
        references public.modules(id)
        on delete set null,

    created_by uuid not null
        references public.profiles(id)
        on delete restrict,

    title text not null,
    description text,
    instructions text,

    status public.content_status not null default 'draft',

    passing_score numeric(5,2) not null default 70,

    randomize_questions boolean not null default false,
    randomize_options boolean not null default false,

    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),

    constraint quizzes_passing_score_valid
        check (
            passing_score >= 0
            and passing_score <= 100
        )
);

-- =========================================================
-- 7. QUIZ QUESTIONS JUNCTION TABLE
-- =========================================================

create table public.quiz_questions (
    quiz_id uuid not null
        references public.quizzes(id)
        on delete cascade,

    question_id uuid not null
        references public.questions(id)
        on delete cascade,

    sort_order integer not null default 0,

    primary key (quiz_id, question_id)
);

-- =========================================================
-- 8. INDEXES
-- =========================================================

create index modules_course_id_idx
on public.modules(course_id);

create index questions_course_id_idx
on public.questions(course_id);

create index questions_module_id_idx
on public.questions(module_id);

create index questions_created_by_idx
on public.questions(created_by);

create index questions_status_idx
on public.questions(status);

create index question_options_question_id_idx
on public.question_options(question_id);

create index quizzes_course_id_idx
on public.quizzes(course_id);

create index quizzes_module_id_idx
on public.quizzes(module_id);

create index quizzes_created_by_idx
on public.quizzes(created_by);

create index quizzes_status_idx
on public.quizzes(status);

create index quiz_questions_quiz_id_idx
on public.quiz_questions(quiz_id);

create index quiz_questions_question_id_idx
on public.quiz_questions(question_id);

-- =========================================================
-- 9. UPDATED-AT FUNCTION
-- =========================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

create trigger modules_set_updated_at
before update on public.modules
for each row
execute function public.set_updated_at();

create trigger questions_set_updated_at
before update on public.questions
for each row
execute function public.set_updated_at();

create trigger quizzes_set_updated_at
before update on public.quizzes
for each row
execute function public.set_updated_at();

-- =========================================================
-- 10. ROLE HELPER FUNCTION
--
-- This uses a unique name so it does not conflict with the
-- current_user_role() function from Phase 1.
-- =========================================================

create function public.get_current_user_role_text()
returns text
language sql
stable
security definer
set search_path = public
as $$
    select role::text
    from public.profiles
    where id = auth.uid()
    limit 1;
$$;

revoke all
on function public.get_current_user_role_text()
from public;

grant execute
on function public.get_current_user_role_text()
to authenticated;

-- =========================================================
-- 11. ENABLE ROW LEVEL SECURITY
-- =========================================================

alter table public.modules enable row level security;
alter table public.questions enable row level security;
alter table public.question_options enable row level security;
alter table public.quizzes enable row level security;
alter table public.quiz_questions enable row level security;

-- =========================================================
-- 12. GRANT TABLE PERMISSIONS
--
-- RLS policies below still control which rows can be used.
-- =========================================================

grant select, insert, update, delete
on public.modules
to authenticated;

grant select, insert, update, delete
on public.questions
to authenticated;

grant select, insert, update, delete
on public.question_options
to authenticated;

grant select, insert, update, delete
on public.quizzes
to authenticated;

grant select, insert, update, delete
on public.quiz_questions
to authenticated;

-- =========================================================
-- 13. MODULE POLICIES
-- =========================================================

create policy "Authenticated users can view modules"
on public.modules
for select
to authenticated
using (true);

create policy "Instructors can create modules"
on public.modules
for insert
to authenticated
with check (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Instructors can update modules"
on public.modules
for update
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
)
with check (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Administrators can delete modules"
on public.modules
for delete
to authenticated
using (
    public.get_current_user_role_text() = 'administrator'
);

-- =========================================================
-- 14. QUESTION POLICIES
-- =========================================================

create policy "Instructors can view questions"
on public.questions
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Students can view published questions"
on public.questions
for select
to authenticated
using (
    status = 'published'
    and public.get_current_user_role_text() = 'student'
);

create policy "Instructors can create questions"
on public.questions
for insert
to authenticated
with check (
    created_by = auth.uid()
    and public.get_current_user_role_text()
        in ('instructor', 'administrator')
);

create policy "Question authors can update questions"
on public.questions
for update
to authenticated
using (
    created_by = auth.uid()
    or public.get_current_user_role_text() = 'administrator'
)
with check (
    created_by = auth.uid()
    or public.get_current_user_role_text() = 'administrator'
);

create policy "Question authors can delete draft questions"
on public.questions
for delete
to authenticated
using (
    (
        created_by = auth.uid()
        and status = 'draft'
    )
    or public.get_current_user_role_text() = 'administrator'
);

-- =========================================================
-- 15. QUESTION OPTION POLICIES
--
-- Students are intentionally not allowed to read this table
-- because it contains the is_correct answer field.
-- Secure student answer delivery will be added in Phase 1.3.
-- =========================================================

create policy "Instructors can view question options"
on public.question_options
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Question authors can create options"
on public.question_options
for insert
to authenticated
with check (
    exists (
        select 1
        from public.questions q
        where q.id = question_options.question_id
          and (
              q.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

create policy "Question authors can update options"
on public.question_options
for update
to authenticated
using (
    exists (
        select 1
        from public.questions q
        where q.id = question_options.question_id
          and (
              q.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
)
with check (
    exists (
        select 1
        from public.questions q
        where q.id = question_options.question_id
          and (
              q.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

create policy "Question authors can delete options"
on public.question_options
for delete
to authenticated
using (
    exists (
        select 1
        from public.questions q
        where q.id = question_options.question_id
          and (
              q.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

-- =========================================================
-- 16. QUIZ POLICIES
-- =========================================================

create policy "Instructors can view quizzes"
on public.quizzes
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Students can view published quizzes"
on public.quizzes
for select
to authenticated
using (
    status = 'published'
    and public.get_current_user_role_text() = 'student'
);

create policy "Instructors can create quizzes"
on public.quizzes
for insert
to authenticated
with check (
    created_by = auth.uid()
    and public.get_current_user_role_text()
        in ('instructor', 'administrator')
);

create policy "Quiz authors can update quizzes"
on public.quizzes
for update
to authenticated
using (
    created_by = auth.uid()
    or public.get_current_user_role_text() = 'administrator'
)
with check (
    created_by = auth.uid()
    or public.get_current_user_role_text() = 'administrator'
);

create policy "Quiz authors can delete draft quizzes"
on public.quizzes
for delete
to authenticated
using (
    (
        created_by = auth.uid()
        and status = 'draft'
    )
    or public.get_current_user_role_text() = 'administrator'
);

-- =========================================================
-- 17. QUIZ QUESTION POLICIES
-- =========================================================

create policy "Instructors can view quiz questions"
on public.quiz_questions
for select
to authenticated
using (
    public.get_current_user_role_text()
    in ('instructor', 'administrator')
);

create policy "Students can view published quiz structure"
on public.quiz_questions
for select
to authenticated
using (
    public.get_current_user_role_text() = 'student'
    and exists (
        select 1
        from public.quizzes quiz
        where quiz.id = quiz_questions.quiz_id
          and quiz.status = 'published'
    )
);

create policy "Quiz authors can add questions"
on public.quiz_questions
for insert
to authenticated
with check (
    exists (
        select 1
        from public.quizzes quiz
        where quiz.id = quiz_questions.quiz_id
          and (
              quiz.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

create policy "Quiz authors can update question order"
on public.quiz_questions
for update
to authenticated
using (
    exists (
        select 1
        from public.quizzes quiz
        where quiz.id = quiz_questions.quiz_id
          and (
              quiz.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
)
with check (
    exists (
        select 1
        from public.quizzes quiz
        where quiz.id = quiz_questions.quiz_id
          and (
              quiz.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

create policy "Quiz authors can remove questions"
on public.quiz_questions
for delete
to authenticated
using (
    exists (
        select 1
        from public.quizzes quiz
        where quiz.id = quiz_questions.quiz_id
          and (
              quiz.created_by = auth.uid()
              or public.get_current_user_role_text()
                  = 'administrator'
          )
    )
);

-- =========================================================
-- 18. INSERT INITIAL CCNA MODULES
-- =========================================================

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'ITN-01',
    'Networking Today',
    1
from public.courses
where code = 'ITN';

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'ITN-02',
    'Basic Switch and End Device Configuration',
    2
from public.courses
where code = 'ITN';

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'SRWE-03',
    'VLANs',
    3
from public.courses
where code = 'SRWE';

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'SRWE-04',
    'Inter-VLAN Routing',
    4
from public.courses
where code = 'SRWE';

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'ENSA-01',
    'Single-Area OSPF',
    1
from public.courses
where code = 'ENSA';

insert into public.modules (
    course_id,
    code,
    title,
    sort_order
)
select
    id,
    'ENSA-06',
    'NAT for IPv4',
    6
from public.courses
where code = 'ENSA';

-- =========================================================
-- 19. VERIFICATION OUTPUT
-- =========================================================

select
    m.id,
    c.code as course_code,
    m.code as module_code,
    m.title as module_title
from public.modules m
join public.courses c
    on c.id = m.course_id
order by c.code, m.sort_order;