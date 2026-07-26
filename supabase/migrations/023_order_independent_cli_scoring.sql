-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.3: ORDER-INDEPENDENT CLI PRACTICAL SCORING
-- Requires migrations 020 and 022.
-- =========================================================
--
-- Every criterion is evaluated independently against the final
-- device state. Array position, criterion display order, and CLI
-- command order do not affect the score.

alter table public.cli_attempts
add column if not exists criteria_snapshot jsonb;

update public.cli_attempts attempt
set criteria_snapshot = lab.grading_criteria
from public.cli_labs lab
where lab.id = attempt.lab_id
  and attempt.criteria_snapshot is null;

alter table public.cli_attempts
alter column criteria_snapshot set default '[]'::jsonb;

alter table public.cli_attempts
alter column criteria_snapshot set not null;

create or replace function public.snapshot_cli_attempt_criteria()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.criteria_snapshot is null
     or new.criteria_snapshot = '[]'::jsonb then
    select lab.grading_criteria
    into new.criteria_snapshot
    from public.cli_labs lab
    where lab.id = new.lab_id;
  end if;

  if new.criteria_snapshot is null
     or jsonb_typeof(new.criteria_snapshot) <> 'array'
     or jsonb_array_length(new.criteria_snapshot) = 0 then
    raise exception
      'The CLI practical does not contain valid grading criteria.';
  end if;

  select coalesce(
    sum((criterion->>'points')::numeric),
    0
  )
  into new.maximum_points
  from jsonb_array_elements(new.criteria_snapshot) criterion;

  return new;
end;
$$;

drop trigger if exists cli_attempts_snapshot_criteria
on public.cli_attempts;

create trigger cli_attempts_snapshot_criteria
before insert on public.cli_attempts
for each row
execute function public.snapshot_cli_attempt_criteria();

create or replace function public.submit_cli_attempt(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.cli_attempts%rowtype;
  v_lab public.cli_labs%rowtype;
  v_score numeric(10,2) := 0;
  v_maximum numeric(10,2) := 0;
  v_percentage numeric(5,2) := 0;
  v_passed boolean;
begin
  select *
  into v_attempt
  from public.cli_attempts
  where id = p_attempt_id
    and student_id = auth.uid()
    and status = 'in_progress';

  if not found then
    raise exception
      'CLI attempt is unavailable or already submitted.';
  end if;

  select *
  into v_lab
  from public.cli_labs
  where id = v_attempt.lab_id;

  -- This aggregate has no ORDER BY and no dependency between rows.
  -- Every criterion is evaluated once against the same final state.
  select
    coalesce(
      sum(
        case
          when public.cli_criterion_is_met(
            v_attempt.session_state,
            criterion
          )
          then (criterion->>'points')::numeric
          else 0
        end
      ),
      0
    ),
    coalesce(
      sum((criterion->>'points')::numeric),
      0
    )
  into
    v_score,
    v_maximum
  from jsonb_array_elements(
    v_attempt.criteria_snapshot
  ) criterion;

  if v_maximum <= 0 then
    raise exception
      'The CLI practical has no scorable criteria.';
  end if;

  v_percentage := round(
    (v_score / v_maximum) * 100,
    2
  );
  v_passed := v_percentage >= v_lab.passing_score;

  update public.cli_attempts
  set
    status = case
      when expires_at <= now() then 'expired'
      else 'submitted'
    end,
    submitted_at = now(),
    score_points = v_score,
    maximum_points = v_maximum,
    percentage = v_percentage,
    passed = v_passed
  where id = p_attempt_id;

  return jsonb_build_object(
    'attemptId', p_attempt_id,
    'scorePoints', v_score,
    'maximumPoints', v_maximum,
    'percentage', v_percentage,
    'passingScore', v_lab.passing_score,
    'passed', v_passed
  );
end;
$$;

create or replace function public.get_instructor_cli_attempt_review(
  p_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_role text := public.get_current_user_role_text();
  v_result jsonb;
begin
  if v_role not in ('instructor', 'admin', 'administrator') then
    raise exception 'Instructor access is required.';
  end if;

  select jsonb_build_object(
    'attempt', jsonb_build_object(
      'id', attempt.id,
      'labTitle', lab.title,
      'courseCode', course.code,
      'moduleCode', module.code,
      'deviceType', lab.device_type,
      'studentName', profile.full_name,
      'studentEmail', auth_user.email,
      'attemptNumber', attempt.attempt_number,
      'status', attempt.status,
      'scorePoints', attempt.score_points,
      'maximumPoints', attempt.maximum_points,
      'percentage', attempt.percentage,
      'passed', attempt.passed,
      'startedAt', attempt.started_at,
      'submittedAt', attempt.submitted_at,
      'state', attempt.session_state
    ),
    'criteria', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'type', value->>'type',
            'target', value->>'target',
            'expected', value->>'expected',
            'points', (value->>'points')::numeric,
            'met', public.cli_criterion_is_met(
              attempt.session_state,
              value
            ),
            'pointsAwarded',
            case
              when public.cli_criterion_is_met(
                attempt.session_state,
                value
              )
              then (value->>'points')::numeric
              else 0
            end
          )
          order by criterion_index
        )
        from jsonb_array_elements(
          attempt.criteria_snapshot
        ) with ordinality
          criterion(value, criterion_index)
      ),
      '[]'::jsonb
    ),
    'commands', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'sequence', command.sequence_number,
            'command', command.command_text,
            'modeBefore', command.mode_before,
            'modeAfter', command.mode_after,
            'accepted', command.accepted,
            'output', command.output_text,
            'enteredAt', command.entered_at
          )
          order by command.sequence_number
        )
        from public.cli_commands command
        where command.attempt_id = attempt.id
      ),
      '[]'::jsonb
    )
  )
  into v_result
  from public.cli_attempts attempt
  join public.cli_labs lab on lab.id = attempt.lab_id
  join public.courses course on course.id = lab.course_id
  left join public.modules module on module.id = lab.module_id
  join public.profiles profile on profile.id = attempt.student_id
  left join auth.users auth_user on auth_user.id = attempt.student_id
  where attempt.id = p_attempt_id
    and (
      lab.created_by = v_user_id
      or v_role in ('admin', 'administrator')
    );

  if v_result is null then
    raise exception
      'CLI attempt was not found or cannot be reviewed.';
  end if;

  return v_result;
end;
$$;

revoke all
on function public.submit_cli_attempt(uuid)
from public;

revoke all
on function public.get_instructor_cli_attempt_review(uuid)
from public;

grant execute
on function public.submit_cli_attempt(uuid)
to authenticated;

grant execute
on function public.get_instructor_cli_attempt_review(uuid)
to authenticated;
