-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- STUDENT CLI PRACTICAL ARCHIVE PREFERENCES
-- =========================================================

create table if not exists public.student_cli_lab_preferences (
  student_id uuid not null references public.profiles(id) on delete cascade,
  lab_id uuid not null references public.cli_labs(id) on delete cascade,
  archived boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, lab_id)
);

drop trigger if exists student_cli_lab_preferences_set_updated_at
on public.student_cli_lab_preferences;
create trigger student_cli_lab_preferences_set_updated_at
before update on public.student_cli_lab_preferences
for each row execute function public.set_updated_at();

alter table public.student_cli_lab_preferences enable row level security;
revoke all on public.student_cli_lab_preferences from public, anon, authenticated;

drop policy if exists "Students can view own CLI archive preferences"
on public.student_cli_lab_preferences;
create policy "Students can view own CLI archive preferences"
on public.student_cli_lab_preferences
for select to authenticated
using (student_id = auth.uid());

create or replace function public.get_student_cli_archive_statuses()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'labId', lab.id,
        'archived', coalesce(preference.archived, false),
        'archivedAt', preference.archived_at,
        'attemptsUsed', (
          select count(*)
          from public.cli_attempts attempt
          where attempt.lab_id = lab.id
            and attempt.student_id = v_student_id
        ),
        'attemptsRemaining', greatest(
          lab.max_attempts - (
            select count(*)
            from public.cli_attempts attempt
            where attempt.lab_id = lab.id
              and attempt.student_id = v_student_id
          ),
          0
        ),
        'hasCompletedAttempt', exists (
          select 1
          from public.cli_attempts attempt
          where attempt.lab_id = lab.id
            and attempt.student_id = v_student_id
            and attempt.status in ('submitted', 'expired')
        ),
        'activeAttemptId', (
          select attempt.id
          from public.cli_attempts attempt
          where attempt.lab_id = lab.id
            and attempt.student_id = v_student_id
            and attempt.status = 'in_progress'
            and attempt.expires_at > now()
          order by attempt.started_at desc
          limit 1
        )
      )
      order by lab.title
    )
    from public.cli_labs lab
    left join public.student_cli_lab_preferences preference
      on preference.lab_id = lab.id
     and preference.student_id = v_student_id
    where exists (
      select 1
      from public.cli_attempts attempt
      where attempt.lab_id = lab.id
        and attempt.student_id = v_student_id
    )
    or exists (
      select 1
      from public.cli_lab_assignments assignment
      join public.class_memberships membership
        on membership.class_id = assignment.class_id
      join public.class_sections section
        on section.id = assignment.class_id
      where assignment.lab_id = lab.id
        and membership.student_id = v_student_id
        and section.is_active
    )
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_student_cli_lab_archived(
  p_lab_id uuid,
  p_archived boolean
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_student_id uuid := auth.uid();
  v_max_attempts integer;
  v_attempts_used integer;
begin
  if public.get_current_user_role_text() <> 'student' then
    raise exception 'Student access is required.';
  end if;

  select lab.max_attempts
  into v_max_attempts
  from public.cli_labs lab
  where lab.id = p_lab_id;

  if not found then
    raise exception 'CLI practical was not found.';
  end if;

  if exists (
    select 1
    from public.cli_attempts attempt
    where attempt.lab_id = p_lab_id
      and attempt.student_id = v_student_id
      and attempt.status = 'in_progress'
      and attempt.expires_at > now()
  ) then
    raise exception 'Finish or submit the active practical before archiving it.';
  end if;

  select count(*)
  into v_attempts_used
  from public.cli_attempts attempt
  where attempt.lab_id = p_lab_id
    and attempt.student_id = v_student_id;

  if p_archived and not exists (
    select 1
    from public.cli_attempts attempt
    where attempt.lab_id = p_lab_id
      and attempt.student_id = v_student_id
      and attempt.status in ('submitted', 'expired')
  ) then
    raise exception 'Complete at least one attempt before archiving this practical.';
  end if;

  if not p_archived and v_attempts_used >= v_max_attempts then
    raise exception 'This practical has no attempts remaining and must stay in history.';
  end if;

  insert into public.student_cli_lab_preferences (
    student_id,
    lab_id,
    archived,
    archived_at
  ) values (
    v_student_id,
    p_lab_id,
    p_archived,
    case when p_archived then now() else null end
  )
  on conflict (student_id, lab_id)
  do update set
    archived = excluded.archived,
    archived_at = excluded.archived_at;

  return true;
end;
$$;

revoke all on function public.get_student_cli_archive_statuses() from public;
revoke all on function public.set_student_cli_lab_archived(uuid, boolean) from public;
grant execute on function public.get_student_cli_archive_statuses() to authenticated;
grant execute on function public.set_student_cli_lab_archived(uuid, boolean) to authenticated;
