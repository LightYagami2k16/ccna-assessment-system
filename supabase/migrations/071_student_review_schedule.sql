-- Optional review windows and atomic instructor content/review saves.
begin;
alter table public.quizzes add column if not exists review_available_from timestamptz;
alter table public.quizzes add column if not exists review_available_until timestamptz;
alter table public.cli_labs add column if not exists review_available_from timestamptz;
alter table public.cli_labs add column if not exists review_available_until timestamptz;

do $$
declare t text;
begin
  foreach t in array array['quizzes','cli_labs'] loop
    execute format('alter table public.%I drop constraint if exists assessment_review_window_valid',t);
    execute format('alter table public.%I add constraint assessment_review_window_valid check (
      (allow_student_review or (review_available_from is null and review_available_until is null))
      and (review_available_from is null or isfinite(review_available_from))
      and (review_available_until is null or (review_available_from is not null
        and isfinite(review_available_until) and review_available_until > review_available_from)))',t);
  end loop;
end;
$$;

create or replace function public.validate_assessment_review_schedule(p_allow_review boolean,p_available_from timestamptz,p_available_until timestamptz)
returns void language plpgsql immutable set search_path = pg_catalog as $$
begin
  if p_allow_review is null then raise exception 'Review permission must be true or false.'; end if;
  if p_allow_review and (
    (p_available_from is not null and not isfinite(p_available_from))
    or (p_available_until is not null and (p_available_from is null or not isfinite(p_available_until)
      or p_available_until <= p_available_from))) then
    raise exception 'Review closing must follow a valid review opening.';
  end if;
end;
$$;

create or replace function public.get_assessment_review_policy(p_assessment_type text,p_assessment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
declare v_policy jsonb;
begin
  if not public.assessment_review_user_allowed(array['instructor','admin','administrator']) then raise exception 'Instructor access is required.'; end if;
  if p_assessment_type is null or p_assessment_type not in ('quiz','cli') or p_assessment_id is null then
    raise exception 'A valid assessment type and ID are required.';
  end if;
  if p_assessment_type = 'quiz' then
    select jsonb_build_object('allowReview',q.allow_student_review,'availableFrom',q.review_available_from,'availableUntil',q.review_available_until)
      into v_policy from public.quizzes q where q.id = p_assessment_id
      and (q.created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  else
    select jsonb_build_object('allowReview',l.allow_student_review,'availableFrom',l.review_available_from,'availableUntil',l.review_available_until)
      into v_policy from public.cli_labs l where l.id = p_assessment_id
      and (l.created_by = auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  end if;
  if not found then raise exception 'Assessment was not found or cannot be managed.'; end if;
  return v_policy;
end;
$$;

create or replace function public.set_assessment_review_schedule(p_assessment_type text,p_assessment_id uuid,p_allow_review boolean,
  p_available_from timestamptz,p_available_until timestamptz)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
begin
  perform public.get_assessment_review_policy(p_assessment_type,p_assessment_id);
  perform public.validate_assessment_review_schedule(p_allow_review,p_available_from,p_available_until);
  if not p_allow_review then p_available_from := null; p_available_until := null; end if;
  if p_assessment_type = 'quiz' then
    update public.quizzes set allow_student_review=p_allow_review,review_available_from=p_available_from,review_available_until=p_available_until
      where id=p_assessment_id and (created_by=auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  else
    update public.cli_labs set allow_student_review=p_allow_review,review_available_from=p_available_from,review_available_until=p_available_until
      where id=p_assessment_id and (created_by=auth.uid() or public.get_current_user_role_text() in ('admin','administrator'));
  end if;
  if not found then raise exception 'Assessment was not found or cannot be managed.'; end if;
  return jsonb_build_object('allowReview',p_allow_review,'availableFrom',p_available_from,'availableUntil',p_available_until);
end;
$$;

create or replace function public.set_assessment_review_policy(p_assessment_type text,p_assessment_id uuid,p_allow_review boolean)
returns jsonb language sql security definer set search_path = pg_catalog as $$
  select public.set_assessment_review_schedule(p_assessment_type,p_assessment_id,p_allow_review,null,null);
$$;

-- One current authorization predicate governs review RPCs and old player internals.
create or replace function public.student_attempt_review_allowed(p_assessment_type text,p_attempt_id uuid)
returns boolean language sql stable security definer set search_path = pg_catalog as $$
  select public.assessment_review_user_allowed(array['student']) and (
    (p_assessment_type='quiz' and exists(select 1 from public.quiz_attempts a join public.quizzes q on q.id=a.quiz_id
      where a.id=p_attempt_id and a.student_id=auth.uid() and a.status in ('submitted','expired') and q.allow_student_review
        and (q.review_available_from is null or q.review_available_from <= now())
        and (q.review_available_until is null or now() < q.review_available_until)))
    or (p_assessment_type='cli' and exists(select 1 from public.cli_attempts a join public.cli_labs l on l.id=a.lab_id
      where a.id=p_attempt_id and a.student_id=auth.uid() and a.status in ('submitted','expired') and l.allow_student_review
        and (l.review_available_from is null or l.review_available_from <= now())
        and (l.review_available_until is null or now() < l.review_available_until))));
$$;

create or replace function public.get_student_attempt_review_access()
returns jsonb language plpgsql stable security definer set search_path = pg_catalog as $$
begin
  if not public.assessment_review_user_allowed(array['student']) then raise exception 'Student access is required.'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('assessmentType',r.kind,'attemptId',r.id) order by r.kind,r.id)
    from (select 'quiz'::text kind,a.id from public.quiz_attempts a where a.student_id=auth.uid()
        and public.student_attempt_review_allowed('quiz',a.id)
      union all select 'cli',a.id from public.cli_attempts a where a.student_id=auth.uid()
        and public.student_attempt_review_allowed('cli',a.id)) r),'[]'::jsonb);
end;
$$;

-- Validate role, ban, input shape and ownership before legacy save methods run.
-- Lock edits so ownership cannot change between validation and content mutation.
create or replace function public.prepare_assessment_review_save(p_assessment_type text,p_payload jsonb)
returns void language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_policy jsonb;
begin
  if not public.assessment_review_user_allowed(array['instructor','admin','administrator']) then raise exception 'Instructor access is required.'; end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then raise exception 'Assessment payload must be an object.'; end if;
  if p_assessment_type is null or p_assessment_type not in ('quiz','cli') then raise exception 'A valid assessment type is required.'; end if;
  if p_assessment_type='cli' and p_payload ? 'topology' and (
    jsonb_typeof(p_payload->'topology') <> 'object' or
    ((p_payload->'topology') ? 'links' and jsonb_typeof(p_payload->'topology'->'links') <> 'array')) then
    raise exception 'Practical topology must be an object with a links array.';
  end if;
  v_id := nullif(p_payload->>'id','')::uuid;
  if v_id is not null then
    if p_assessment_type='quiz' then
      perform 1 from public.quizzes where id=v_id and (created_by=auth.uid() or public.get_current_user_role_text() in ('admin','administrator')) for update;
    else
      perform 1 from public.cli_labs where id=v_id and (created_by=auth.uid() or public.get_current_user_role_text() in ('admin','administrator')) for update;
    end if;
    if not found then raise exception 'Assessment was not found or cannot be managed.'; end if;
  end if;
  if p_payload ? 'reviewPolicy' then
    v_policy := p_payload->'reviewPolicy';
    if jsonb_typeof(v_policy) <> 'object' or coalesce(jsonb_typeof(v_policy->'allowReview'),'null') <> 'boolean'
      or (v_policy ? 'availableFrom' and jsonb_typeof(v_policy->'availableFrom') not in ('string','null'))
      or (v_policy ? 'availableUntil' and jsonb_typeof(v_policy->'availableUntil') not in ('string','null')) then
      raise exception 'Review policy must contain a boolean permission and valid dates.';
    end if;
    perform public.validate_assessment_review_schedule((v_policy->>'allowReview')::boolean,
      (v_policy->>'availableFrom')::timestamptz,(v_policy->>'availableUntil')::timestamptz);
  end if;
end;
$$;

create or replace function public.save_instructor_quiz_with_review(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_policy jsonb := p_payload->'reviewPolicy';
begin
  perform public.prepare_assessment_review_save('quiz',p_payload);
  v_id := public.save_instructor_quiz(p_payload);
  if p_payload ? 'reviewPolicy' then
    perform public.set_assessment_review_schedule('quiz',v_id,(v_policy->>'allowReview')::boolean,
      (v_policy->>'availableFrom')::timestamptz,(v_policy->>'availableUntil')::timestamptz);
  end if;
  return v_id;
end;
$$;

create or replace function public.save_cli_lab_with_review(p_payload jsonb)
returns uuid language plpgsql security definer set search_path = pg_catalog as $$
declare v_id uuid; v_policy jsonb := p_payload->'reviewPolicy'; v_devices jsonb; v_topology jsonb;
begin
  perform public.prepare_assessment_review_save('cli',p_payload);
  v_id := public.save_cli_lab(p_payload);
  select case when p_payload ? 'devices' then p_payload->'devices'
    when jsonb_array_length(l.devices)>0 then l.devices
    else jsonb_build_array(jsonb_build_object('id','device-1','label',l.initial_hostname,'hostname',l.initial_hostname,'type',l.device_type)) end,
    case when p_payload ? 'topology' then p_payload->'topology' else l.topology end
    into v_devices,v_topology from public.cli_labs l where l.id=v_id;
  perform public.save_cli_lab_topology(v_id,v_devices,v_topology);
  if p_payload ? 'reviewPolicy' then
    perform public.set_assessment_review_schedule('cli',v_id,(v_policy->>'allowReview')::boolean,
      (v_policy->>'availableFrom')::timestamptz,(v_policy->>'availableUntil')::timestamptz);
  end if;
  return v_id;
end;
$$;

revoke all on function public.validate_assessment_review_schedule(boolean,timestamptz,timestamptz),
  public.prepare_assessment_review_save(text,jsonb) from public,anon,authenticated;
revoke all on function public.set_assessment_review_schedule(text,uuid,boolean,timestamptz,timestamptz),
  public.save_instructor_quiz_with_review(jsonb),public.save_cli_lab_with_review(jsonb) from public,anon;
grant execute on function public.set_assessment_review_schedule(text,uuid,boolean,timestamptz,timestamptz),
  public.save_instructor_quiz_with_review(jsonb),public.save_cli_lab_with_review(jsonb) to authenticated;
commit;
