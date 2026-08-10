-- PHASE 10.2: RUNTIME ERROR REPORTING AND OPERATIONAL HEALTH

create table if not exists public.application_error_events (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete set null,
  error_kind text not null default 'runtime'
    check (error_kind in ('runtime', 'unhandled_promise', 'react_render')),
  error_name text not null default 'Error',
  message text not null,
  stack_excerpt text,
  component text,
  path text,
  fingerprint text not null,
  client_context jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete set null,
  resolution_note text
);

create index if not exists application_error_events_time_idx
on public.application_error_events(occurred_at desc);

create index if not exists application_error_events_fingerprint_idx
on public.application_error_events(fingerprint, occurred_at desc);

create index if not exists application_error_events_open_idx
on public.application_error_events(occurred_at desc)
where resolved_at is null;

alter table public.application_error_events enable row level security;
revoke all on public.application_error_events from public, anon, authenticated;

create or replace function public.report_application_error(p_payload jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_kind text := coalesce(nullif(trim(p_payload->>'kind'), ''), 'runtime');
  v_name text := case trim(p_payload->>'name')
    when 'TypeError' then 'TypeError'
    when 'RangeError' then 'RangeError'
    when 'ReferenceError' then 'ReferenceError'
    when 'SyntaxError' then 'SyntaxError'
    when 'URIError' then 'URIError'
    when 'AggregateError' then 'AggregateError'
    else 'Error'
  end;
  v_message text;
  v_component text := case trim(p_payload->>'component')
    when 'Global window error handler' then 'Global window error handler'
    when 'Unhandled promise rejection' then 'Unhandled promise rejection'
    when 'React render boundary' then 'React render boundary'
    else 'Client runtime'
  end;
  v_context jsonb := coalesce(p_payload->'context', '{}'::jsonb);
  v_event_id bigint;
begin
  if v_user_id is null then
    raise exception 'You must be signed in.';
  end if;
  if v_kind not in ('runtime', 'unhandled_promise', 'react_render') then
    v_kind := 'runtime';
  end if;
  v_message := case v_kind
    when 'react_render' then 'A page component could not be displayed.'
    when 'unhandled_promise' then 'A background operation failed unexpectedly.'
    else 'An unexpected application error occurred.'
  end;
  if jsonb_typeof(v_context) <> 'object' then
    v_context := '{}'::jsonb;
  end if;
  if (
    select count(*)
    from public.application_error_events event
    where event.user_id = v_user_id
      and event.occurred_at >= now() - interval '10 minutes'
  ) >= 20 then
    return null;
  end if;

  insert into public.application_error_events (
    user_id, error_kind, error_name, message, stack_excerpt,
    component, path, fingerprint, client_context
  ) values (
    v_user_id, v_kind, v_name, v_message, null, v_component, null,
    md5(lower(v_kind || '|' || v_name || '|' || v_message || '|' || coalesce(v_component, ''))),
    jsonb_strip_nulls(jsonb_build_object(
      'online', case
        when jsonb_typeof(v_context->'online') = 'boolean'
        then v_context->'online'
        else null
      end,
      'viewportWidth', case
        when jsonb_typeof(v_context->'viewportWidth') = 'number'
        then to_jsonb(least(greatest((v_context->>'viewportWidth')::numeric, 0), 10000))
        else null
      end,
      'viewportHeight', case
        when jsonb_typeof(v_context->'viewportHeight') = 'number'
        then to_jsonb(least(greatest((v_context->>'viewportHeight')::numeric, 0), 10000))
        else null
      end,
      'language', case
        when jsonb_typeof(v_context->'language') = 'string'
        then to_jsonb(left(v_context->>'language', 30))
        else null
      end,
      'build', case
        when jsonb_typeof(v_context->'build') = 'string'
        then to_jsonb(left(v_context->>'build', 80))
        else null
      end
    ))
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

create or replace function public.get_application_health_summary()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_current_user_role_text();
begin
  if auth.uid() is null or v_role not in ('admin', 'administrator') then
    raise exception 'Administrator access is required.';
  end if;

  return jsonb_build_object(
    'status', 'operational',
    'checkedAt', now(),
    'checks', jsonb_build_object(
      'database', true,
      'quizEngine', to_regprocedure('public.start_quiz_attempt(uuid)') is not null,
      'cliEngine', to_regprocedure('public.start_cli_attempt(uuid)') is not null,
      'contentBackup', to_regprocedure('public.get_instructor_content_backup()') is not null,
      'errorReporting', to_regprocedure('public.report_application_error(jsonb)') is not null
    ),
    'counts', jsonb_build_object(
      'last24Hours', (
        select count(*) from public.application_error_events
        where occurred_at >= now() - interval '24 hours'
      ),
      'last7Days', (
        select count(*) from public.application_error_events
        where occurred_at >= now() - interval '7 days'
      ),
      'unresolved', (
        select count(*) from public.application_error_events
        where resolved_at is null
      )
    ),
    'topErrors', coalesce((
      select jsonb_agg(jsonb_build_object(
        'fingerprint', grouped.fingerprint,
        'name', grouped.error_name,
        'message', grouped.message,
        'occurrences', grouped.occurrences,
        'lastSeenAt', grouped.last_seen_at
      ) order by grouped.occurrences desc, grouped.last_seen_at desc)
      from (
        select fingerprint,
          max(error_name) as error_name,
          max(message) as message,
          count(*) as occurrences,
          max(occurred_at) as last_seen_at
        from public.application_error_events
        where occurred_at >= now() - interval '7 days'
        group by fingerprint
        order by count(*) desc, max(occurred_at) desc
        limit 10
      ) grouped
    ), '[]'::jsonb),
    'recentEvents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', event.id,
        'kind', event.error_kind,
        'name', event.error_name,
        'message', event.message,
        'component', event.component,
        'path', event.path,
        'fingerprint', event.fingerprint,
        'context', event.client_context,
        'occurredAt', event.occurred_at,
        'resolvedAt', event.resolved_at,
        'resolutionNote', event.resolution_note
      ) order by event.occurred_at desc)
      from (
        select * from public.application_error_events
        order by occurred_at desc
        limit 100
      ) event
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_application_errors_resolved(
  p_event_ids bigint[],
  p_resolved boolean,
  p_note text default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := public.get_current_user_role_text();
  v_count integer;
begin
  if auth.uid() is null or v_role not in ('admin', 'administrator') then
    raise exception 'Administrator access is required.';
  end if;
  if coalesce(array_length(p_event_ids, 1), 0) = 0
     or array_length(p_event_ids, 1) > 100 then
    raise exception 'Select between 1 and 100 error events.';
  end if;

  update public.application_error_events
  set
    resolved_at = case when p_resolved then now() else null end,
    resolved_by = case when p_resolved then auth.uid() else null end,
    resolution_note = case
      when p_resolved then left(nullif(trim(p_note), ''), 500)
      else null
    end
  where id = any(p_event_ids);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.report_application_error(jsonb) from public;
revoke all on function public.get_application_health_summary() from public;
revoke all on function public.set_application_errors_resolved(bigint[], boolean, text) from public;
grant execute on function public.report_application_error(jsonb) to authenticated;
grant execute on function public.get_application_health_summary() to authenticated;
grant execute on function public.set_application_errors_resolved(bigint[], boolean, text) to authenticated;
