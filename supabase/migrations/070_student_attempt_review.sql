-- Instructor-controlled, read-only student review. Never releases keys to the player.
begin;

alter table public.quizzes add column if not exists allow_student_review boolean not null default false;
alter table public.cli_labs add column if not exists allow_student_review boolean not null default false;
alter table public.quiz_attempt_questions add column if not exists review_snapshot jsonb;

create or replace function public.assessment_review_user_allowed(p_roles text[])
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select auth.uid() is not null
    and coalesce(public.get_current_user_role_text() = any(p_roles), false)
    and exists (select 1 from auth.users u where u.id = auth.uid()
      and (u.banned_until is null or u.banned_until <= now()));
$$;

create or replace function public.get_assessment_review_policy(p_assessment_type text, p_assessment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_allowed boolean;
begin
  if not public.assessment_review_user_allowed(array['instructor','admin','administrator']) then
    raise exception 'Instructor access is required.';
  end if;
  if p_assessment_type is null or p_assessment_type not in ('quiz','cli') or p_assessment_id is null then
    raise exception 'A valid assessment type and ID are required.';
  end if;
  if p_assessment_type = 'quiz' then
    select q.allow_student_review into v_allowed from public.quizzes q where q.id = p_assessment_id
      and (q.created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  else
    select l.allow_student_review into v_allowed from public.cli_labs l where l.id = p_assessment_id
      and (l.created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  end if;
  if not found then raise exception 'Assessment was not found or cannot be managed.'; end if;
  return jsonb_build_object('allowReview', v_allowed);
end;
$$;

create or replace function public.set_assessment_review_policy(p_assessment_type text, p_assessment_id uuid, p_allow_review boolean)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform public.get_assessment_review_policy(p_assessment_type, p_assessment_id);
  if p_allow_review is null then raise exception 'Review permission must be true or false.'; end if;
  if p_assessment_type = 'quiz' then
    update public.quizzes set allow_student_review = p_allow_review where id = p_assessment_id
      and (created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  else
    update public.cli_labs set allow_student_review = p_allow_review where id = p_assessment_id
      and (created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  end if;
  if not found then raise exception 'Assessment was not found or cannot be managed.'; end if;
  return jsonb_build_object('allowReview', p_allow_review);
end;
$$;

-- Definer helper avoids RLS recursion; no assessment membership dependency for past attempts.
create or replace function public.student_attempt_review_allowed(p_assessment_type text, p_attempt_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select public.assessment_review_user_allowed(array['student']) and (
    (p_assessment_type = 'quiz' and exists (
      select 1 from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id
      where a.id = p_attempt_id and a.student_id = auth.uid()
        and a.status in ('submitted','expired') and q.allow_student_review))
    or (p_assessment_type = 'cli' and exists (
      select 1 from public.cli_attempts a join public.cli_labs l on l.id = a.lab_id
      where a.id = p_attempt_id and a.student_id = auth.uid()
        and a.status in ('submitted','expired') and l.allow_student_review))
  );
$$;

create or replace function public.get_student_attempt_review_access()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not public.assessment_review_user_allowed(array['student']) then raise exception 'Student access is required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('assessmentType', r.kind, 'attemptId', r.id) order by r.kind, r.id)
    from (
      select 'quiz'::text kind, a.id from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id
        where a.student_id = auth.uid() and a.status in ('submitted','expired') and q.allow_student_review
      union all
      select 'cli', a.id from public.cli_attempts a join public.cli_labs l on l.id = a.lab_id
        where a.student_id = auth.uid() and a.status in ('submitted','expired') and l.allow_student_review
    ) r), '[]'::jsonb);
end;
$$;

-- Capture completion wording, choices, key and submitted feedback together. Existing final
-- attempts intentionally remain NULL: current content is not an original historical snapshot.
create or replace function public.quiz_question_review_content(p_attempt_question_id uuid)
returns jsonb language sql stable security definer set search_path = pg_catalog as $$
  select jsonb_build_object('id', aq.id, 'sortOrder', aq.sort_order,
    'title', q.title, 'questionText', q.question_text, 'type', q.question_type,
    'points', aq.points, 'pointsAwarded', coalesce(a.points_awarded,0), 'isCorrect', a.is_correct,
    'answerText', a.answer_text, 'selectedOptionIds', coalesce(nullif(a.selected_option_ids,'{}'::uuid[]),
      case when a.selected_option_id is not null then array[a.selected_option_id] else '{}'::uuid[] end),
    'options', coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'text', o.option_text, 'isCorrect', o.is_correct)
      order by o.sort_order, o.id) from public.question_options o where o.question_id = q.id),'[]'::jsonb),
    'correctAnswers', coalesce((select jsonb_agg(o.option_text order by o.sort_order, o.id)
      from public.question_options o where o.question_id = q.id and o.is_correct),'[]'::jsonb))
  from public.quiz_attempt_questions aq join public.questions q on q.id = aq.question_id
  left join public.quiz_attempt_answers a on a.attempt_question_id = aq.id where aq.id = p_attempt_question_id;
$$;

create or replace function public.capture_quiz_attempt_review()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
begin
  if new.status in ('submitted','expired') and old.status = 'in_progress' then
    update public.quiz_attempt_questions aq set review_snapshot = public.quiz_question_review_content(aq.id)
      where aq.attempt_id = new.id and aq.review_snapshot is null;
  end if;
  return new;
end;
$$;
drop trigger if exists capture_quiz_attempt_review on public.quiz_attempts;
create trigger capture_quiz_attempt_review after update of status on public.quiz_attempts
for each row execute function public.capture_quiz_attempt_review();

create or replace function public.get_student_attempt_review(p_assessment_type text, p_attempt_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_result jsonb;
begin
  if not public.assessment_review_user_allowed(array['student']) then raise exception 'Student access is required.'; end if;
  if p_assessment_type is null or p_assessment_type not in ('quiz','cli') or p_attempt_id is null then
    raise exception 'A valid assessment type and attempt ID are required.';
  end if;
  if not coalesce(public.student_attempt_review_allowed(p_assessment_type,p_attempt_id),false) then
    raise exception 'Attempt review is unavailable.';
  end if;
  if p_assessment_type = 'quiz' then
    select jsonb_build_object('assessmentType','quiz','attempt',jsonb_build_object(
      'id',a.id,'title',q.title,'status',a.status,'attemptNumber',a.attempt_number,
      'scorePoints',a.score_points,'maximumPoints',a.maximum_points,'percentage',a.percentage,
      'passed',a.passed,'startedAt',a.started_at,'submittedAt',a.submitted_at),
      'questions',coalesce((select jsonb_agg(coalesce(aq.review_snapshot,public.quiz_question_review_content(aq.id))
        order by aq.sort_order,aq.id) from public.quiz_attempt_questions aq where aq.attempt_id = a.id),'[]'::jsonb))
      || case when exists(select 1 from public.quiz_attempt_questions aq where aq.attempt_id = a.id and aq.review_snapshot is null)
        then jsonb_build_object('historicalContentNotice','Original question wording and answer choices were not saved for this attempt. Current content is shown; it may differ from the content at submission. Saved grades are unchanged.')
        else '{}'::jsonb end
    into v_result from public.quiz_attempts a join public.quizzes q on q.id = a.quiz_id where a.id = p_attempt_id;
  else
    select jsonb_build_object('assessmentType','cli','attempt',jsonb_build_object(
      'id',a.id,'title',l.title,'status',a.status,'attemptNumber',a.attempt_number,
      'scorePoints',a.score_points,'maximumPoints',a.maximum_points,'percentage',a.percentage,
      'passed',a.passed,'startedAt',a.started_at,'submittedAt',a.submitted_at),
      'state',a.session_state,
      'criteria',coalesce((select jsonb_agg(jsonb_build_object('type',c.value->>'type','target',c.value->>'target',
        'expected',c.value->>'expected','deviceId',c.value->>'deviceId','points',(c.value->>'points')::numeric,
        'met',public.cli_criterion_is_met(a.session_state,c.value),
        'pointsAwarded',case when public.cli_criterion_is_met(a.session_state,c.value) then (c.value->>'points')::numeric else 0 end)
        order by c.n) from jsonb_array_elements(a.criteria_snapshot) with ordinality c(value,n)),'[]'::jsonb),
      'commands',coalesce((select jsonb_agg(jsonb_build_object('sequence',c.sequence_number,'command',c.command_text,
        'output',c.output_text,'accepted',c.accepted,'deviceId',c.device_id) order by c.sequence_number)
        from public.cli_commands c where c.attempt_id = a.id),'[]'::jsonb))
    into v_result from public.cli_attempts a join public.cli_labs l on l.id = a.lab_id where a.id = p_attempt_id;
  end if;
  return v_result;
end;
$$;

-- Raw CLI rows contain criteria_snapshot even while an attempt is active. Detailed
-- tables are RPC-only for students; existing staff permissive policies still apply.
do $$
declare t text;
begin
  foreach t in array array['quiz_attempt_questions','quiz_attempt_answers','cli_attempts','cli_commands','questions','question_options','cli_labs'] loop
    execute format('drop policy if exists "Review details require staff" on public.%I',t);
    execute format('create policy "Review details require staff" on public.%I as restrictive for select to authenticated using (public.assessment_review_user_allowed(array[''instructor'',''admin'',''administrator'']))',t);
  end loop;
end;
$$;
grant execute on function public.assessment_review_user_allowed(text[]) to authenticated;

-- Keep lease-enforcing v2 wrappers and their grants intact. Guard the old internals
-- too, so definer wrapper calls cannot reopen withdrawn completed attempt content.
create or replace function public.assert_student_attempt_content_access(p_assessment_type text,p_attempt_id uuid)
returns void language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not public.assessment_review_user_allowed(array['student']) then raise exception 'Student access is required.'; end if;
  if not (exists(select 1 from public.quiz_attempts a where p_assessment_type = 'quiz' and a.id = p_attempt_id
      and a.student_id = auth.uid() and a.status = 'in_progress' and a.expires_at > now())
    or exists(select 1 from public.cli_attempts a where p_assessment_type = 'cli' and a.id = p_attempt_id
      and a.student_id = auth.uid() and a.status = 'in_progress' and a.expires_at > now())
    or coalesce(public.student_attempt_review_allowed(p_assessment_type,p_attempt_id),false)) then
    raise exception 'Attempt content is unavailable.';
  end if;
end;
$$;
do $$
declare v_kind text; v_definition text; v_guard text;
begin
  foreach v_kind in array array['quiz','cli'] loop
    select pg_get_functiondef(to_regprocedure(format('public.get_%s_attempt_safe(uuid)',v_kind))) into v_definition;
    v_definition := replace(v_definition,E'\r\n',E'\n');
    v_guard := format('perform public.assert_student_attempt_content_access(%L,p_attempt_id);',v_kind);
    if v_definition is null then raise exception 'Missing safe attempt reader for %',v_kind; end if;
    if position(v_guard in v_definition) = 0 then
      if position(E'begin\n' in v_definition) = 0 then raise exception 'Unrecognized safe reader body for %',v_kind; end if;
      v_definition := replace(v_definition,E'begin\n',E'begin\n  ' || v_guard || E'\n');
      -- Quiz readers can reconcile expiry; recheck after that side effect before returning.
      v_definition := replace(v_definition,'return v_result;',v_guard || E'\n  return v_result;');
      execute v_definition;
    end if;
  end loop;
end;
$$;

revoke all on function public.assessment_review_user_allowed(text[]) from public;
revoke all on function public.student_attempt_review_allowed(text,uuid) from public,anon,authenticated;
revoke all on function public.quiz_question_review_content(uuid) from public,anon,authenticated;
revoke all on function public.capture_quiz_attempt_review() from public,anon,authenticated;
revoke all on function public.assert_student_attempt_content_access(text,uuid) from public,anon,authenticated;
revoke all on function public.get_assessment_review_policy(text,uuid) from public,anon;
revoke all on function public.set_assessment_review_policy(text,uuid,boolean) from public,anon;
revoke all on function public.get_student_attempt_review_access() from public,anon;
revoke all on function public.get_student_attempt_review(text,uuid) from public,anon;
grant execute on function public.get_assessment_review_policy(text,uuid),public.set_assessment_review_policy(text,uuid,boolean),
  public.get_student_attempt_review_access(),public.get_student_attempt_review(text,uuid) to authenticated;
commit;
