-- Dedicated practice competitions. No normal CLI attempts or academic totals.
begin;
create table if not exists public.cli_competitions (
 id uuid primary key default gen_random_uuid(), host_id uuid not null, host_name text not null,
 source_lab_id uuid, rematch_of uuid references public.cli_competitions(id), title text not null check(length(title) between 1 and 160),
 duration_minutes integer not null check(duration_minutes between 1 and 480),
 status text not null default 'lobby' check(status in ('lobby','countdown','active','completed','cancelled','voided')),
 definition_snapshot jsonb not null, initial_state jsonb not null, maximum_points numeric not null check(maximum_points>0),
 allow_review boolean not null default false, starts_at timestamptz, deadline timestamptz, completed_at timestamptz,
 revision bigint not null default 0, created_at timestamptz not null default now(), cancel_reason text, void_reason text
);
create table if not exists public.cli_competition_participants (
 id uuid primary key default gen_random_uuid(), competition_id uuid not null references public.cli_competitions(id),
 student_id uuid not null, display_name text not null, qualifying_class_id uuid, class_name text,
 status text not null default 'invited' check(status in ('invited','ready','in_progress','submitted','expired','did_not_start','cancelled')),
 ready_client_id text, ready_at timestamptz, state jsonb not null, revision bigint not null default 0,
 score_points numeric not null default 0 check(score_points>=0), finished_at timestamptz, final_grading jsonb, placement integer,
 unique(competition_id,student_id)
);
create table if not exists public.cli_competition_commands (
 participant_id uuid not null references public.cli_competition_participants(id), command_id uuid not null,
 sequence bigint not null check(sequence>0), expected_revision bigint not null, client_id text not null,
 command text not null check(length(command) between 1 and 500), accepted boolean not null,
 output text not null, mode_before text, mode_after text, committed_at timestamptz not null default clock_timestamp(),
 primary key(participant_id,command_id),unique(participant_id,sequence)
);
create table if not exists public.cli_competition_events (
 id bigint generated always as identity primary key, competition_id uuid not null references public.cli_competitions(id),
 participant_id uuid, actor_id uuid, kind text not null, details jsonb not null default '{}', created_at timestamptz not null default clock_timestamp()
);
create index if not exists cli_competition_student_history on public.cli_competition_participants(student_id,competition_id);
create index if not exists cli_competition_host_history on public.cli_competitions(host_id,created_at desc);
create index if not exists cli_competition_due on public.cli_competitions(deadline) where status in ('countdown','active');
alter table public.cli_competitions enable row level security;
alter table public.cli_competition_participants enable row level security;
alter table public.cli_competition_commands enable row level security;
alter table public.cli_competition_events enable row level security;
revoke all on public.cli_competitions,public.cli_competition_participants,public.cli_competition_commands,public.cli_competition_events from public,anon,authenticated;

create or replace function public.cli_duel_actor_role(p_actor uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select case p.role::text when 'admin' then 'administrator' else p.role::text end
 from public.profiles p join auth.users u on u.id=p.id
 where p.id=p_actor and (u.banned_until is null or u.banned_until<=now()) limit 1;
$$;
create or replace function public.cli_duel_can_host(p_actor uuid,p_competition uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(public.cli_duel_actor_role(p_actor)='administrator' or (
 public.cli_duel_actor_role(p_actor)='instructor' and exists(select 1 from public.cli_competitions c where c.id=p_competition and c.host_id=p_actor)
 and not exists(select 1 from public.cli_competition_participants p where p.competition_id=p_competition and not exists(
 select 1 from public.class_sections s where s.id=p.qualifying_class_id and s.created_by=p_actor))),false);
$$;
create or replace function public.cli_duel_can_access(p_actor uuid,p_competition uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(public.cli_duel_can_host(p_actor,p_competition) or (public.cli_duel_actor_role(p_actor)='student' and exists(
 select 1 from public.cli_competition_participants p where p.competition_id=p_competition and p.student_id=p_actor)),false);
$$;
create or replace function public.cli_duel_require_access(p_actor uuid,p_competition uuid,p_host boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 if p_actor is null or not exists(select 1 from public.cli_competitions where id=p_competition)
 or not (case when p_host then public.cli_duel_can_host(p_actor,p_competition) else public.cli_duel_can_access(p_actor,p_competition) end)
 then raise exception 'This competition is unavailable or outside your authorized classes.'; end if;
end;
$$;
create or replace function public.cli_duel_grade(p_definition jsonb,p_state jsonb)
returns jsonb language sql immutable security definer set search_path=pg_catalog as $$
 select jsonb_build_object('scorePoints',coalesce(sum(case when met then points else 0 end),0),
 'maximumPoints',coalesce(sum(points),0),'criteria',coalesce(jsonb_agg(criterion||jsonb_build_object('met',met,'pointsAwarded',case when met then points else 0 end) order by ordinal),'[]'))
 from (select e.value criterion,e.ordinality ordinal,(e.value->>'points')::numeric points,
 public.cli_criterion_is_met(p_state,e.value) met from jsonb_array_elements(p_definition->'criteria') with ordinality e) graded;
$$;
create or replace function public.cli_duel_definition_errors(p_definition jsonb,p_initial jsonb default null)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare errors jsonb:='[]';d jsonb;c jsonb;k text;seen text[]:='{}';points numeric;total numeric:=0;expected text;target text;
begin
 if jsonb_typeof(p_definition->'devices') is distinct from 'array' or jsonb_array_length(p_definition->'devices')<>1 then return '["The pilot requires exactly one switch or router."]';end if;
 d:=p_definition->'devices'->0;
 if d->>'type' not in ('switch','router') or d->>'type' is null then errors:=errors||'"PC and remote/multi-device challenges are not supported in the pilot."'::jsonb;end if;
 if nullif(btrim(d->>'id'),'') is null or nullif(btrim(d->>'label'),'') is null or nullif(btrim(d->>'hostname'),'') is null then errors:=errors||'"Complete the device label and starting hostname."'::jsonb;end if;
 if jsonb_typeof(p_definition->'topology'->'links') is distinct from 'array' or jsonb_array_length(p_definition->'topology'->'links')<>0 then errors:=errors||'"Use a single device without physical links."'::jsonb;end if;
 if nullif(btrim(p_definition->>'title'),'') is null or nullif(btrim(p_definition->>'instructions'),'') is null then errors:=errors||'"Enter a title and student instructions."'::jsonb;end if;
 if jsonb_typeof(p_definition->'criteria') is distinct from 'array' or jsonb_array_length(p_definition->'criteria') not between 1 and 128 then return errors||'"Provide 1–128 supported grading criteria."'::jsonb;end if;
 for c in select value from jsonb_array_elements(p_definition->'criteria') loop
  if c->>'type' is null or c->>'type' not in ('hostname','enable_secret','password_encryption','banner_motd','line_password','line_login','interface_description','interface_enabled','interface_ip','config_saved','vlan_exists','vlan_name','interface_mode','interface_access_vlan')
   or (d->>'type'<>'switch' and c->>'type' in ('vlan_exists','vlan_name','interface_mode','interface_access_vlan')) then errors:=errors||'"The challenge contains an unsupported objective."'::jsonb;continue;end if;
  if coalesce(nullif(c->>'deviceId',''),d->>'id')<>d->>'id' then errors:=errors||'"An objective belongs to another device."'::jsonb;end if;
  begin points:=(c->>'points')::numeric;if points is null or points<=0 or points::text in ('NaN','Infinity','-Infinity') then raise exception 'Invalid points';end if;total:=total+points;
  exception when others then errors:=errors||'"Objective points must be positive finite numbers."'::jsonb;end;
  expected:=btrim(coalesce(c->>'expected',''));target:=btrim(coalesce(c->>'target',''));
  if c->>'type' not in ('password_encryption','line_login','interface_enabled','config_saved','vlan_exists') and expected='' then errors:=errors||'"Complete every required expected value."'::jsonb;end if;
  if c->>'type' like 'interface_%' then target:=public.canonical_cli_interface(target);
  elsif c->>'type' like 'line_%' then target:=public.canonical_cli_line(target);end if;
  if (c->>'type' like 'interface_%' or c->>'type' like 'line_%' or c->>'type' like 'vlan_%') and nullif(target,'') is null then errors:=errors||'"Complete every required objective target."'::jsonb;end if;
  if (c->>'type' like 'vlan_%' and (case when target ~ '^[1-9][0-9]{0,3}$' then target::numeric>4094 else true end))
   or (c->>'type'='interface_access_vlan' and (case when expected ~ '^[1-9][0-9]{0,3}$' then expected::numeric>4094 else true end))
   or (c->>'type'='interface_mode' and expected not in ('access','trunk'))
   or (c->>'type'='hostname' and expected !~ '^[a-zA-Z0-9][a-zA-Z0-9-]{0,62}$')
   or (c->>'type' like 'line_%' and target not in ('console','vty'))
   then errors:=errors||'"An objective has an unattainable target or expected value."'::jsonb;end if;
  k:=(c->>'type')||':'||case when c->>'type' like 'interface_%' or c->>'type' like 'line_%' or c->>'type' like 'vlan_%' then coalesce(target,'') else '' end;if k=any(seen) then errors:=errors||'"Remove duplicate or conflicting objectives."'::jsonb;end if;seen:=array_append(seen,k);
 end loop;
 if total>9007199254740991 then errors:=errors||'"The point total is too large to represent safely."'::jsonb;end if;
 if errors='[]' and p_initial is not null then
  if p_initial->>'hostname' is distinct from d->>'hostname' or p_initial->>'mode' is distinct from 'user_exec' or p_initial->>'saved' is distinct from 'false' then errors:=errors||'"The starting device must be generic and unsaved."'::jsonb;
  elsif (public.cli_duel_grade(p_definition,p_initial)->>'scorePoints')::numeric<>0 then errors:=errors||'"Some objectives are already completed in the starting configuration."'::jsonb;end if;
 end if;
 return errors;
end;
$$;
create or replace function public.cli_duel_lab_definition(p_actor_id uuid,p_lab_id uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare l public.cli_labs%rowtype;v_role text:=public.cli_duel_actor_role(p_actor_id);devices jsonb;
begin
 if v_role is null or v_role not in ('administrator','instructor') then raise exception 'Host access is required.';end if;
 select * into l from public.cli_labs where id=p_lab_id and status::text<>'archived' and (created_by=p_actor_id or v_role='administrator');
 if not found then raise exception 'This practical cannot be used by this host.';end if;
 devices:=coalesce(nullif(l.devices,'[]'),jsonb_build_array(jsonb_build_object('id','device-1','label',l.initial_hostname,'hostname',l.initial_hostname,'type',l.device_type)));
 return jsonb_build_object('title',l.title,'instructions',l.instructions,'description',l.description,'devices',devices,'topology',coalesce(l.topology,'{"links":[]}'),
 'criteria',l.grading_criteria,'sourceLabId',l.id,'durationMinutes',l.duration_minutes,'version',1);
end;
$$;
create or replace function public.cli_duel_authoring_context(p_actor_id uuid,p_lab_id uuid,p_rematch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare def jsonb;
begin
 if (p_lab_id is null)=(p_rematch_id is null) then raise exception 'Choose a practical or rematch.';end if;
 if p_rematch_id is not null then perform public.cli_duel_require_access(p_actor_id,p_rematch_id,true);select definition_snapshot into def from public.cli_competitions where id=p_rematch_id;
 else def:=public.cli_duel_lab_definition(p_actor_id,p_lab_id);end if;
 return jsonb_build_object('definition',def,'fingerprint',md5(def::text),'errors',public.cli_duel_definition_errors(def));
end;
$$;
create or replace function public.cli_duel_create(p_actor_id uuid,p_payload jsonb,p_source_fingerprint text,p_initial_state jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare ctx jsonb;def jsonb;errors jsonb;v_id uuid;pick jsonb;v_student uuid;v_class uuid;v_name text;v_class_name text;seen uuid[]:='{}';v_role text:=public.cli_duel_actor_role(p_actor_id);v_duration integer;
begin
 if v_role is null or v_role not in ('administrator','instructor') then raise exception 'Host access is required.';end if;
 if p_payload->>'labId' is not null then perform 1 from public.cli_labs where id=(p_payload->>'labId')::uuid for share;end if;
 ctx:=public.cli_duel_authoring_context(p_actor_id,(p_payload->>'labId')::uuid,(p_payload->>'rematchId')::uuid);def:=ctx->'definition';
 if ctx->>'fingerprint' is distinct from p_source_fingerprint then raise exception 'The source challenge changed. Reload it before creating the duel.';end if;
 errors:=public.cli_duel_definition_errors(def,p_initial_state);if errors<>'[]' then raise exception '%',errors->>0;end if;
 v_duration:=(p_payload->>'durationMinutes')::integer;
 if v_duration is null or v_duration not between 1 and 480 or (p_payload->>'durationMinutes')::numeric<>v_duration or nullif(btrim(p_payload->>'title'),'') is null or length(p_payload->>'title')>160 or jsonb_typeof(p_payload->'allowReview') is distinct from 'boolean' then raise exception 'Enter a title and a whole-minute time limit from 1 to 480.';end if;
 if jsonb_typeof(p_payload->'participantSelections') is distinct from 'array' or jsonb_array_length(p_payload->'participantSelections')<>2 then raise exception 'Select exactly two students.';end if;
 insert into public.cli_competitions(host_id,host_name,source_lab_id,rematch_of,title,duration_minutes,definition_snapshot,initial_state,maximum_points,allow_review)
 values(p_actor_id,(select full_name from public.profiles where id=p_actor_id),(def->>'sourceLabId')::uuid,(p_payload->>'rematchId')::uuid,btrim(p_payload->>'title'),v_duration,def,p_initial_state,
 (public.cli_duel_grade(def,p_initial_state)->>'maximumPoints')::numeric,(p_payload->>'allowReview')::boolean) returning id into v_id;
 for pick in select value from jsonb_array_elements(p_payload->'participantSelections') loop
  v_student:=(pick->>'studentId')::uuid;v_class:=(pick->>'classId')::uuid;v_class_name:=null;
  if v_student is null or v_student=any(seen) or public.cli_duel_actor_role(v_student) is distinct from 'student' then raise exception 'Select two different active students.';end if;seen:=array_append(seen,v_student);
  if v_role='instructor' or v_class is not null then
   select s.name into v_class_name from public.class_sections s join public.class_memberships m on m.class_id=s.id where s.id=v_class and m.student_id=v_student and s.is_active and (s.created_by=p_actor_id or v_role='administrator');
   if not found then raise exception 'A participant is outside the classes handled by this host.';end if;
  end if;
  select full_name into v_name from public.profiles where id=v_student;
  insert into public.cli_competition_participants(competition_id,student_id,display_name,qualifying_class_id,class_name,state) values(v_id,v_student,v_name,v_class,v_class_name,p_initial_state);
 end loop;
 insert into public.cli_competition_events(competition_id,actor_id,kind) values(v_id,p_actor_id,'created');return v_id;
end;
$$;

create or replace function public.cli_duel_summary(p_competition uuid,p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;v_host boolean;
begin
 perform public.cli_duel_require_access(p_actor,p_competition);select * into c from public.cli_competitions where id=p_competition;v_host:=public.cli_duel_can_host(p_actor,p_competition);
 return jsonb_build_object('competition',jsonb_build_object('id',c.id,'title',c.title,'hostName',c.host_name,'status',c.status,'durationMinutes',c.duration_minutes,
 'startsAt',c.starts_at,'deadline',c.deadline,'maximumPoints',c.maximum_points,'createdAt',c.created_at,'completedAt',c.completed_at,'allowReview',c.allow_review,'cancelReason',c.cancel_reason,'voidReason',c.void_reason,'canHost',v_host),
 'participants',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'className',case when v_host then p.class_name else null end,
 'isOwn',p.student_id=p_actor,'status',p.status,'scorePoints',p.score_points,'maximumPoints',c.maximum_points,'percentage',round(p.score_points/c.maximum_points*100,2),
 'hp',greatest(0,least(100,100-coalesce((select o.score_points from public.cli_competition_participants o where o.competition_id=c.id and o.id<>p.id),0)/c.maximum_points*100)),
 'finishedAt',p.finished_at,'elapsedMs',case when p.finished_at is not null then extract(epoch from(p.finished_at-c.starts_at))*1000 else null end,'placement',p.placement)
 order by p.display_name,p.id) from public.cli_competition_participants p where p.competition_id=c.id),'[]'),'serverNow',clock_timestamp(),'revision',c.revision);
end;
$$;
create or replace function public.get_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin return public.cli_duel_summary(p_competition_id,auth.uid());end;
$$;
create or replace function public.get_cli_duel_workspace()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();v_role text:=public.cli_duel_actor_role(auth.uid());candidates jsonb:='[]';labs jsonb:='[]';v_lab record;def jsonb;
begin
 if v_role is null or v_role not in ('student','instructor','administrator') then raise exception 'Competition access is required.';end if;
 perform public.cli_duel_settle_for_actor(actor);
 if v_role in ('instructor','administrator') then
  for v_lab in select id from public.cli_labs where status::text<>'archived' and (created_by=actor or v_role='administrator') order by title loop
   def:=public.cli_duel_lab_definition(actor,v_lab.id);labs:=labs||jsonb_build_array(jsonb_build_object('id',v_lab.id,'title',def->>'title','durationMinutes',def->'durationMinutes','errors',public.cli_duel_definition_errors(def)));
  end loop;
  if v_role='administrator' then
   select coalesce(jsonb_agg(jsonb_build_object('studentId',p.id,'displayName',p.full_name,'email',u.email,'classId',null,'className',null) order by p.full_name),'[]') into candidates
   from public.profiles p join auth.users u on u.id=p.id where public.cli_duel_actor_role(p.id)='student';
  else
   select coalesce(jsonb_agg(jsonb_build_object('studentId',p.id,'displayName',p.full_name,'email',u.email,'classId',s.id,'className',s.name) order by p.full_name,s.name),'[]') into candidates
   from public.profiles p join auth.users u on u.id=p.id join public.class_memberships m on m.student_id=p.id join public.class_sections s on s.id=m.class_id
   where s.created_by=actor and s.is_active and public.cli_duel_actor_role(p.id)='student';
  end if;
 end if;
 return jsonb_build_object('matches',coalesce((select jsonb_agg(public.cli_duel_summary(c.id,actor) order by c.created_at desc) from(select * from public.cli_competitions where public.cli_duel_can_access(actor,id) order by created_at desc limit 100)c),'[]'),
 'compatibleLabs',labs,'candidates',candidates,'canHost',v_role in ('instructor','administrator'));
end;
$$;


create or replace function public.cli_duel_bump(p_competition uuid,p_kind text,p_actor uuid default null,p_participant uuid default null,p_details jsonb default '{}')
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 update public.cli_competitions set revision=revision+1 where id=p_competition;
 insert into public.cli_competition_events(competition_id,participant_id,actor_id,kind,details) values(p_competition,p_participant,p_actor,p_kind,p_details);
end;
$$;
create or replace function public.cli_duel_release_lease(p_participant uuid)
returns void language sql security definer set search_path=pg_catalog as $$
 delete from public.active_assessment_sessions where assessment_type='competition' and attempt_id=p_participant;
$$;
create or replace function public.cli_duel_seal(p_participant uuid,p_finished_at timestamptz,p_expired boolean default false)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;g jsonb;
begin
 select * into p from public.cli_competition_participants where id=p_participant for update;
 if p.status<>'in_progress' then return;end if;
 select * into c from public.cli_competitions where id=p.competition_id;
 g:=public.cli_duel_grade(c.definition_snapshot,p.state);
 update public.cli_competition_participants set score_points=(g->>'scorePoints')::numeric,final_grading=g->'criteria',finished_at=p_finished_at,
 status=case when p_expired then 'expired' else 'submitted' end where id=p.id;
 perform public.cli_duel_release_lease(p.id);
 perform public.cli_duel_bump(c.id,case when p_expired then 'expired' else 'submitted' end,p.student_id,p.id,jsonb_build_object('scorePoints',g->'scorePoints'));
end;
$$;
create or replace function public.cli_duel_settle(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p record;v_clock timestamptz;
begin
 select * into c from public.cli_competitions where id=p_competition for update;
 v_clock:=clock_timestamp();
 if not found or c.status not in ('countdown','active') then return;end if;
 if v_clock>=c.deadline then
  for p in select id from public.cli_competition_participants where competition_id=c.id and status='in_progress' order by student_id for update loop
   perform public.cli_duel_seal(p.id,c.deadline,true);
  end loop;
 end if;
 if not exists(select 1 from public.cli_competition_participants where competition_id=c.id and status='in_progress') then
  with places as(select id,rank() over(order by score_points desc,finished_at asc)::integer place from public.cli_competition_participants where competition_id=c.id)
  update public.cli_competition_participants target set placement=r.place from places r where target.id=r.id;
  update public.cli_competitions set status='completed',completed_at=case when v_clock>=c.deadline then c.deadline else v_clock end where id=c.id;
  perform public.cli_duel_bump(c.id,'completed');
 elsif c.status='countdown' and v_clock>=c.starts_at then update public.cli_competitions set status='active' where id=c.id;end if;
end;
$$;
create or replace function public.cli_duel_settle_for_actor(p_actor uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare item record;
begin
 for item in select id from public.cli_competitions where status in ('active','countdown') and public.cli_duel_can_access(p_actor,id) order by id limit 100 loop perform public.cli_duel_settle(item.id);end loop;
end;
$$;
create or replace function public.ready_cli_duel(p_competition_id uuid,p_client_id text,p_ready boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;v_participant uuid;actor uuid:=auth.uid();v_client text;
begin
 perform public.cli_duel_require_access(actor,p_competition_id);
 if public.cli_duel_actor_role(actor) is distinct from 'student' then raise exception 'Only participating students may mark themselves ready.';end if;
 v_client:=public.validate_assessment_client_id(p_client_id);if v_client is null or p_ready is null then raise exception 'A valid browser readiness record is required.';end if;
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if c.status<>'lobby' then raise exception 'The lobby has already closed.';end if;
 select id into v_participant from public.cli_competition_participants where competition_id=c.id and student_id=actor for update;
 if not found then raise exception 'Participant access is required.';end if;
 update public.cli_competition_participants set status=case when p_ready then 'ready' else 'invited' end,ready_client_id=case when p_ready then v_client else null end,ready_at=case when p_ready then clock_timestamp() else null end where id=v_participant;
 perform public.cli_duel_bump(c.id,case when p_ready then 'ready' else 'not_ready' end,actor,v_participant);
 return public.cli_duel_summary(c.id,actor);
end;
$$;
create or replace function public.start_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();c public.cli_competitions%rowtype;p record;v_start timestamptz;v_end timestamptz;
begin
 perform public.cli_duel_require_access(actor,p_competition_id,true);
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if c.status in ('countdown','active') then perform public.cli_duel_settle(c.id);return public.cli_duel_summary(c.id,actor);end if;
 if c.status<>'lobby' then raise exception 'Create a rematch to start another duel.';end if;
 if to_regprocedure('public.cli_duel_sessions_available()') is null then raise exception 'Install local/test migration 075 before starting a duel.';end if;
 if (select count(*) from public.cli_competition_participants where competition_id=c.id and status='ready')<>2 then raise exception 'Both students must be ready.';end if;
 v_start:=clock_timestamp()+interval '10 seconds';v_end:=v_start+make_interval(mins=>c.duration_minutes);
 for p in select * from public.cli_competition_participants where competition_id=c.id order by student_id for update loop
  if public.cli_duel_actor_role(p.student_id) is distinct from 'student' then raise exception 'Both participants must be active students.';end if;
  if p.qualifying_class_id is not null and not exists(select 1 from public.class_sections s join public.class_memberships m on m.class_id=s.id where s.id=p.qualifying_class_id and s.is_active and m.student_id=p.student_id and (s.created_by=c.host_id or public.cli_duel_actor_role(actor)='administrator')) then raise exception 'A participant is no longer eligible for the selected class.';end if;
  delete from public.active_assessment_sessions where student_id=p.student_id and expires_at<=clock_timestamp();
  insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id,assessment_id,started_at,expires_at,updated_at,client_id,client_claimed_at,client_heartbeat_at)
  values(p.student_id,'competition',p.id,c.id,v_start,v_end,clock_timestamp(),p.ready_client_id,clock_timestamp(),clock_timestamp());
  update public.cli_competition_participants set status='in_progress' where id=p.id;
 end loop;
 update public.cli_competitions set status='countdown',starts_at=v_start,deadline=v_end where id=c.id;
 perform public.cli_duel_bump(c.id,'started',actor,null,jsonb_build_object('startsAt',v_start,'deadline',v_end));
 return public.cli_duel_summary(c.id,actor);
exception when unique_violation then raise exception 'One of the students already has an active assessment. Both must finish or exit it before this duel can start.';
end;
$$;
create or replace function public.settle_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform public.cli_duel_require_access(auth.uid(),p_competition_id);perform public.cli_duel_settle(p_competition_id);return public.cli_duel_summary(p_competition_id,auth.uid());end;
$$;
create or replace function public.cli_duel_player_data(p_participant uuid,p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;s jsonb;playing boolean;
begin
 select * into p from public.cli_competition_participants where id=p_participant and student_id=p_actor;
 if not found or public.cli_duel_actor_role(p_actor) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(p_actor,p.competition_id);select * into c from public.cli_competitions where id=p.competition_id;
 s:=public.cli_duel_summary(c.id,p_actor);playing:=p.status='in_progress' and c.status in ('countdown','active') and clock_timestamp()>=c.starts_at and clock_timestamp()<c.deadline;
 return jsonb_build_object('competition',s->'competition','participants',s->'participants',
 'ownParticipant',(select value from jsonb_array_elements(s->'participants') where value->>'id'=p.id::text),
 'opponentSummary',(select value from jsonb_array_elements(s->'participants') where value->>'id'<>p.id::text),
 'task',case when playing then c.definition_snapshot-'criteria' else null end,
 'ownState',case when playing then p.state else null end,
 'ownCommands',case when playing then coalesce((select jsonb_agg(jsonb_build_object('sequence',cmd.sequence,'command',cmd.command,'accepted',cmd.accepted,'output',cmd.output,'deviceId',c.definition_snapshot->'devices'->0->>'id') order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]') else '[]'::jsonb end,
 'revision',p.revision,'matchRevision',c.revision,'serverNow',clock_timestamp());
end;
$$;
create or replace function public.get_cli_duel_player(p_participant_id uuid,p_client_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;
begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into p from public.cli_competition_participants where id=p.id;
 if p.status='in_progress' then perform public.assert_assessment_client_session('competition',p.id,p_client_id);end if;
 return public.cli_duel_player_data(p.id,auth.uid());
end;
$$;
create or replace function public.cli_duel_existing_command(p_participant uuid,p_actor uuid,p_client text,p_command_id uuid,p_sequence bigint,p_expected_revision bigint,p_command text)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare cmd public.cli_competition_commands%rowtype;
begin
 select * into cmd from public.cli_competition_commands where participant_id=p_participant and command_id=p_command_id;
 if not found then return null;end if;
 if cmd.command is distinct from p_command or cmd.sequence is distinct from p_sequence or cmd.expected_revision is distinct from p_expected_revision or cmd.client_id is distinct from p_client then raise exception 'A command ID cannot be reused with different content.';end if;
 return public.cli_duel_player_data(p_participant,p_actor)||jsonb_build_object('commandResult',jsonb_build_object('commandId',cmd.command_id,'sequence',cmd.sequence,'accepted',cmd.accepted,'output',cmd.output,'modeBefore',cmd.mode_before,'modeAfter',cmd.mode_after),'duplicate',true);
end;
$$;
create or replace function public.cli_duel_command_context(p_actor_id uuid,p_participant_id uuid,p_client_id text,p_command_id uuid,p_sequence bigint,p_expected_revision bigint,p_command text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;existing jsonb;
begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=p_actor_id;
 if not found then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(p_actor_id,p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id for update;
 select * into p from public.cli_competition_participants where id=p.id for update;
 if p.status='in_progress' then
  if not exists(select 1 from public.active_assessment_sessions where student_id=p_actor_id and assessment_type='competition' and attempt_id=p.id and client_id=p_client_id and expires_at>clock_timestamp()) then raise exception 'This browser no longer controls the assessment session.';end if;
 end if;
 existing:=public.cli_duel_existing_command(p.id,p_actor_id,p_client_id,p_command_id,p_sequence,p_expected_revision,p_command);if existing is not null then return jsonb_build_object('duplicateResult',existing);end if;
 if p.status<>'in_progress' or c.status not in ('countdown','active') or clock_timestamp()<c.starts_at or clock_timestamp()>=c.deadline then raise exception 'Ranked input is closed or the countdown has not finished.';end if;
 if p.revision<>p_expected_revision or p_sequence<>p.revision+1 then raise exception 'The duel state changed. Resynchronize before sending another command.';end if;
 return jsonb_build_object('definition',c.definition_snapshot,'state',p.state,'revision',p.revision);
end;
$$;
create or replace function public.cli_duel_commit_command(p_actor_id uuid,p_participant_id uuid,p_client_id text,p_command_id uuid,p_sequence bigint,p_expected_revision bigint,p_command text,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ctx jsonb;p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;g jsonb;v_clock timestamptz;result jsonb;
begin
 ctx:=public.cli_duel_command_context(p_actor_id,p_participant_id,p_client_id,p_command_id,p_sequence,p_expected_revision,p_command);
 if ctx ? 'duplicateResult' then return ctx->'duplicateResult';end if;
 select * into p from public.cli_competition_participants where id=p_participant_id;select * into c from public.cli_competitions where id=p.competition_id;
 v_clock:=clock_timestamp();if v_clock>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 if nullif(btrim(p_command),'') is null or length(p_command)>500 or p_command ~ '[[:cntrl:]]' or jsonb_typeof(p_outcome->'state') is distinct from 'object' or jsonb_typeof(p_outcome->'accepted') is distinct from 'boolean' then raise exception 'Invalid trusted command outcome.';end if;
 if jsonb_typeof(p_outcome->'state'->'deviceStates'->(c.definition_snapshot->'devices'->0->>'id')) is distinct from 'object' then raise exception 'Invalid verified device state.';end if;
 perform 1 from public.active_assessment_sessions where student_id=p_actor_id for update;
 g:=public.cli_duel_grade(c.definition_snapshot,p_outcome->'state');
 v_clock:=clock_timestamp();if v_clock>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 insert into public.cli_competition_commands(participant_id,command_id,sequence,expected_revision,client_id,command,accepted,output,mode_before,mode_after,committed_at)
 values(p.id,p_command_id,p_sequence,p_expected_revision,p_client_id,p_command,(p_outcome->>'accepted')::boolean,left(coalesce(p_outcome->>'output',''),5000),p_outcome->>'modeBefore',p_outcome->>'modeAfter',v_clock);
 update public.cli_competition_participants set state=p_outcome->'state',revision=revision+1,score_points=(g->>'scorePoints')::numeric where id=p.id;
 update public.active_assessment_sessions set client_heartbeat_at=v_clock,updated_at=v_clock where student_id=p_actor_id and assessment_type='competition' and attempt_id=p.id and client_id=p_client_id;
 perform public.cli_duel_bump(c.id,'command',p_actor_id,p.id,jsonb_build_object('sequence',p_sequence,'scorePoints',g->'scorePoints','delta',(g->>'scorePoints')::numeric-p.score_points));
 if (g->>'scorePoints')::numeric=c.maximum_points then perform public.cli_duel_seal(p.id,v_clock,false);end if;
 perform public.cli_duel_settle(c.id);
 result:=public.cli_duel_existing_command(p.id,p_actor_id,p_client_id,p_command_id,p_sequence,p_expected_revision,p_command);
 if clock_timestamp()>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 return result||jsonb_build_object('duplicate',false);
end;
$$;
create or replace function public.finish_cli_duel(p_participant_id uuid,p_client_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;v_clock timestamptz;
begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();if not found then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id for update;select * into p from public.cli_competition_participants where id=p.id for update;
 if p.status='in_progress' then
  perform public.assert_assessment_client_session('competition',p.id,p_client_id);v_clock:=clock_timestamp();
  if v_clock<c.starts_at then raise exception 'The countdown has not finished.';end if;
  perform public.cli_duel_seal(p.id,least(v_clock,c.deadline),v_clock>=c.deadline);perform public.cli_duel_settle(c.id);
 end if;
 return public.cli_duel_summary(c.id,auth.uid());
end;
$$;
create or replace function public.manage_cli_duel(p_competition_id uuid,p_action text,p_reason text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p record;v_clock timestamptz;
begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);perform public.cli_duel_settle(p_competition_id);
 select * into c from public.cli_competitions where id=p_competition_id for update;v_clock:=clock_timestamp();
 if nullif(btrim(p_reason),'') is null or length(p_reason)>500 then raise exception 'Enter a reason of at most 500 characters.';end if;
 if p_action='cancel' and c.status in ('lobby','countdown','active') then
  for p in select * from public.cli_competition_participants where competition_id=c.id order by student_id for update loop
   update public.cli_competition_participants set status=case when status in ('submitted','expired') then status when c.starts_at is null or v_clock<c.starts_at then 'did_not_start' else 'cancelled' end,placement=null where id=p.id;
   perform public.cli_duel_release_lease(p.id);
  end loop;
  update public.cli_competitions set status='cancelled',cancel_reason=btrim(p_reason),allow_review=false,completed_at=v_clock where id=c.id;
 elsif p_action='void' and c.status='completed' then update public.cli_competitions set status='voided',void_reason=btrim(p_reason),allow_review=false where id=c.id;
 else raise exception 'This action is not available for the current match status.';end if;
 perform public.cli_duel_bump(c.id,p_action,auth.uid(),null,jsonb_build_object('reason',btrim(p_reason)));return public.cli_duel_summary(c.id,auth.uid());
end;
$$;
create or replace function public.set_cli_duel_review(p_competition_id uuid,p_allow boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;
begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);select * into c from public.cli_competitions where id=p_competition_id for update;
 if c.status<>'completed' or p_allow is null then raise exception 'Review can be released or withdrawn after the entire match completes.';end if;
 update public.cli_competitions set allow_review=p_allow where id=c.id;perform public.cli_duel_bump(c.id,'review_changed',auth.uid(),null,jsonb_build_object('allowReview',p_allow));return public.cli_duel_summary(c.id,auth.uid());
end;
$$;
create or replace function public.get_cli_duel_review(p_participant_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;host boolean;g jsonb;
begin
 select * into p from public.cli_competition_participants where id=p_participant_id;if not found then raise exception 'Review is unavailable.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into p from public.cli_competition_participants where id=p.id;select * into c from public.cli_competitions where id=p.competition_id;host:=public.cli_duel_can_host(auth.uid(),c.id);
 if not host and (p.student_id<>auth.uid() or c.status<>'completed' or not c.allow_review or p.final_grading is null) then raise exception 'Detailed competition review is unavailable or has been withdrawn.';end if;
 g:=coalesce(p.final_grading,public.cli_duel_grade(c.definition_snapshot,p.state)->'criteria');
 return jsonb_build_object('title',c.title,'participantId',p.id,'displayName',p.display_name,'scorePoints',p.score_points,'maximumPoints',c.maximum_points,'placement',p.placement,
 'criteria',g,'state',jsonb_build_object('devices',c.definition_snapshot->'devices'),
 'commands',coalesce((select jsonb_agg(jsonb_build_object('deviceId',c.definition_snapshot->'devices'->0->>'id','sequence',cmd.sequence,'command',cmd.command,'output',cmd.output,'accepted',cmd.accepted) order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]'),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.created_at,'actorId',case when host then e.actor_id else null end,'participantId',e.participant_id,'details',e.details) order by e.id) from public.cli_competition_events e where e.competition_id=c.id and (host or e.participant_id=p.id or e.kind in ('created','started','completed'))),'[]'));
end;
$$;
-- Reads reconcile clock transitions before exposing status or standings.
create or replace function public.get_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
begin perform public.cli_duel_require_access(auth.uid(),p_competition_id);perform public.cli_duel_settle(p_competition_id);return public.cli_duel_summary(p_competition_id,auth.uid());end;
$$;

-- All helpers are private; only the listed safe RPCs are exposed to callers.
do $$ declare r record;begin
 for r in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'cli_duel_%' or p.proname in ('get_cli_duel','get_cli_duel_workspace','ready_cli_duel','start_cli_duel','settle_cli_duel','get_cli_duel_player','finish_cli_duel','manage_cli_duel','set_cli_duel_review','get_cli_duel_review')) loop
 execute format('revoke all on function %s from public,anon,authenticated',r.signature);end loop;
end;$$;
grant execute on function public.cli_duel_authoring_context(uuid,uuid,uuid),public.cli_duel_create(uuid,jsonb,text,jsonb) to service_role;
grant execute on function public.get_cli_duel(uuid),public.get_cli_duel_workspace(),public.ready_cli_duel(uuid,text,boolean),public.start_cli_duel(uuid),public.settle_cli_duel(uuid),public.get_cli_duel_player(uuid,text),public.finish_cli_duel(uuid,text),public.manage_cli_duel(uuid,text,text),public.set_cli_duel_review(uuid,boolean),public.get_cli_duel_review(uuid) to authenticated;
grant execute on function public.cli_duel_command_context(uuid,uuid,text,uuid,bigint,bigint,text),public.cli_duel_commit_command(uuid,uuid,text,uuid,bigint,bigint,text,jsonb) to service_role;
commit;
