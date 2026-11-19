-- Host-controlled arena lifecycle. Existing matches retain their previous flow.
begin;
alter table public.cli_competitions add column if not exists host_controlled boolean not null default false;
alter table public.cli_competitions add column if not exists has_started boolean not null default false;
alter table public.cli_competitions add column if not exists remaining_ms bigint;
alter table public.cli_competitions add column if not exists played_ms bigint not null default 0;
alter table public.cli_competition_participants add column if not exists active_elapsed_ms bigint;
alter table public.cli_competitions drop constraint if exists cli_competitions_status_check;
alter table public.cli_competitions add constraint cli_competitions_status_check check(status in('lobby','waiting','countdown','active','paused','completed','cancelled','voided'));
create or replace function public.cli_duel_new_host_arena() returns trigger language plpgsql set search_path=pg_catalog as $$ begin
 if new.rules_version>=3 then new.host_controlled:=true;new.arena_entry_required:=true;new.status:='waiting';end if;return new;end $$;
revoke all on function public.cli_duel_new_host_arena() from public,anon,authenticated;
drop trigger if exists cli_duel_new_host_arena on public.cli_competitions;
create trigger cli_duel_new_host_arena before insert on public.cli_competitions for each row execute function public.cli_duel_new_host_arena();
-- Keep private snapshots of prior implementations while replacing their existing OIDs.
do $$ declare routine text;def text;begin
 foreach routine in array array['cli_duel_settle(uuid)','set_cli_duel_arena_presence(uuid,text,boolean)','start_cli_duel(uuid)'] loop
  if to_regprocedure('public.'||split_part(routine,'(',1)||'_before_host('||split_part(routine,'(',2)) is null then
   select pg_get_functiondef(to_regprocedure('public.'||routine)) into def;
   execute replace(def,'public.'||split_part(routine,'(',1)||'(', 'public.'||split_part(routine,'(',1)||'_before_host(');
  end if;
 end loop;
end $$;
revoke all on function public.cli_duel_settle_before_host(uuid),public.set_cli_duel_arena_presence_before_host(uuid,text,boolean),public.start_cli_duel_before_host(uuid) from public,anon,authenticated;
create or replace function public.cli_duel_host_player_eligible(p_id uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(public.cli_duel_actor_role(p.student_id)='student' and (case when p.qualifying_class_id is null then public.cli_duel_actor_role(c.host_id)='administrator' else exists(select 1 from public.class_sections section join public.class_memberships m on m.class_id=section.id where section.id=p.qualifying_class_id and section.is_active and m.student_id=p.student_id and (section.created_by=c.host_id or public.cli_duel_actor_role(c.host_id)='administrator')) end),false) from public.cli_competition_participants p join public.cli_competitions c on c.id=p.competition_id where p.id=p_id;
$$;
create or replace function public.cli_duel_host_participant_present(p_id uuid,p_since timestamptz default null)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select coalesce(public.cli_duel_host_player_eligible(p.id) and p.arena_seen_at>clock_timestamp()-interval '3 seconds' and (p_since is null or p.arena_seen_at>=p_since) and (p.status='submitted' and c.has_started or p.status='in_progress' and exists(select 1 from public.active_assessment_sessions lease where lease.student_id=p.student_id and lease.assessment_type='competition' and lease.attempt_id=p.id and lease.client_id=p.arena_client_id and lease.expires_at>clock_timestamp())),false) from public.cli_competition_participants p join public.cli_competitions c on c.id=p.competition_id where p.id=p_id;
$$;
create or replace function public.cli_duel_host_players_present(p_match uuid,p_since timestamptz default null)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select count(*)=2 from public.cli_competition_participants p where p.competition_id=p_match and public.cli_duel_host_participant_present(p.id,p_since);
$$;
revoke all on function public.cli_duel_host_player_eligible(uuid),public.cli_duel_host_participant_present(uuid,timestamptz),public.cli_duel_host_players_present(uuid,timestamptz) from public,anon,authenticated;
create or replace function public.cli_duel_abort_host_countdown(p_match uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$ begin
 update public.cli_competitions set status=case when has_started then 'paused' else 'waiting' end,starts_at=null,deadline=null where id=p_match;
 update public.active_assessment_sessions set expires_at=clock_timestamp()+interval '1 day' where assessment_type='competition' and assessment_id=p_match;
 perform public.cli_duel_bump(p_match,'countdown_aborted');
end $$;
revoke all on function public.cli_duel_abort_host_countdown(uuid) from public,anon,authenticated;
create or replace function public.cli_duel_settle(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;v_clock timestamptz;begin
 select * into c from public.cli_competitions where id=p_competition for update;
 if not found then return;end if;
 if not c.host_controlled then perform public.cli_duel_settle_before_host(p_competition);return;end if;
 if c.status='countdown' then
  v_clock:=clock_timestamp();
  if not public.cli_duel_host_players_present(c.id) then perform public.cli_duel_abort_host_countdown(c.id);return;end if;
  if v_clock<c.starts_at then return;end if;
  -- Require both controlling browsers to acknowledge after the full five seconds.
  if not public.cli_duel_host_players_present(c.id,c.starts_at) then
   if v_clock>=c.starts_at+interval '3 seconds' then perform public.cli_duel_abort_host_countdown(c.id);end if;return;
  end if;
  update public.cli_competitions set status='active',has_started=true,starts_at=v_clock,deadline=v_clock+remaining_ms*interval '1 millisecond' where id=c.id;
  update public.active_assessment_sessions set started_at=v_clock,expires_at=v_clock+c.remaining_ms*interval '1 millisecond' where assessment_type='competition' and assessment_id=c.id;
  perform public.cli_duel_bump(c.id,case when c.has_started then 'resumed' else 'started' end);return;
 end if;
 if c.status='active' then perform public.cli_duel_settle_before_host(c.id);end if;
end $$;
create or replace function public.enter_cli_duel_arena(p_participant_id uuid,p_client_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;lease public.active_assessment_sessions%rowtype;v_client text;v_expiry timestamptz;begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found or public.cli_duel_actor_role(auth.uid()) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id for update;
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid() for update;
 if not public.cli_duel_host_player_eligible(p.id) then raise exception 'The player is no longer eligible for this class.';end if;
 if not c.host_controlled or c.status not in('waiting','countdown','active','paused') or p.status not in('invited','ready','in_progress') then raise exception 'This arena is unavailable.';end if;
 v_client:=public.validate_assessment_client_id(p_client_id);if v_client is null then raise exception 'A valid browser is required.';end if;
 delete from public.active_assessment_sessions where student_id=p.student_id and expires_at<=clock_timestamp();
 select * into lease from public.active_assessment_sessions where student_id=p.student_id for update;
 if found and (lease.assessment_type<>'competition' or lease.attempt_id<>p.id) then raise exception 'Finish the other active assessment before entering this duel.';end if;
 if not found then
  v_expiry:=case when c.status='active' then c.deadline else clock_timestamp()+interval '1 day' end;
  insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id,assessment_id,started_at,expires_at,updated_at,client_id,client_claimed_at,client_heartbeat_at) values(p.student_id,'competition',p.id,c.id,clock_timestamp(),v_expiry,clock_timestamp(),v_client,clock_timestamp(),clock_timestamp());
 end if;
 perform public.claim_assessment_client_session('competition',p.id,v_client,'CLI Duel');
 update public.cli_competition_participants set status='in_progress' where id=p.id;
 perform public.cli_duel_bump(c.id,'arena_entered',auth.uid(),p.id);
 return public.cli_duel_summary(c.id,auth.uid());
end $$;
create or replace function public.set_cli_duel_arena_presence(p_participant_id uuid,p_client_id text,p_entered boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found or public.cli_duel_actor_role(auth.uid()) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);select * into c from public.cli_competitions where id=p.competition_id for update;
 if not c.host_controlled then return public.set_cli_duel_arena_presence_before_host(p_participant_id,p_client_id,p_entered);end if;
 if c.status not in('waiting','countdown','active','paused') then return public.cli_duel_summary(c.id,auth.uid());end if;
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid() for update;
 if not public.cli_duel_host_player_eligible(p.id) then raise exception 'The player is no longer eligible for this class.';end if;
 if p.status='in_progress' then perform public.assert_assessment_client_session('competition',p.id,p_client_id);
 elsif p.status='submitted' and c.has_started then
  if public.validate_assessment_client_id(p_client_id) is null then raise exception 'A valid spectator browser is required.';end if;
  if not p_entered and p.arena_client_id is distinct from p_client_id then return public.cli_duel_summary(c.id,auth.uid());end if;
 else raise exception 'Active player or submitted spectator access is required.';end if;
 if p_entered is null then raise exception 'Arena presence is required.';end if;
 update public.cli_competition_participants set arena_seen_at=case when p_entered then clock_timestamp() else null end,arena_client_id=case when p_entered then p_client_id else null end where id=p.id;
 if not p_entered and c.status='countdown' then perform public.cli_duel_abort_host_countdown(c.id);else perform public.cli_duel_settle(c.id);end if;
 return public.cli_duel_summary(c.id,auth.uid());
end $$;
create or replace function public.control_cli_duel(p_competition_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;v_clock timestamptz;v_remaining bigint;begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);perform public.cli_duel_settle(p_competition_id);
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if not c.host_controlled then raise exception 'This match uses the earlier duel controls.';end if;
 if p_action in('start','resume') then
  if c.status in('countdown','active') then return public.cli_duel_summary(c.id,auth.uid());end if;
  if (p_action='start' and (c.status<>'waiting' or c.has_started)) or (p_action='resume' and c.status<>'paused') then raise exception 'This action is unavailable.';end if;
  if not public.cli_duel_host_players_present(c.id) then raise exception 'Both players must be active inside the arena.';end if;
  v_clock:=clock_timestamp()+interval '5 seconds';
  update public.cli_competitions set status='countdown',starts_at=v_clock,deadline=null,remaining_ms=coalesce(remaining_ms,duration_minutes::bigint*60000) where id=c.id;
  update public.active_assessment_sessions set expires_at=clock_timestamp()+interval '1 day' where assessment_type='competition' and assessment_id=c.id;
  perform public.cli_duel_bump(c.id,case when p_action='start' then 'countdown_started' else 'resume_countdown_started' end,auth.uid());
 elsif p_action='pause' then
  if c.status='paused' then return public.cli_duel_summary(c.id,auth.uid());end if;
  if c.status<>'active' then raise exception 'Only an active game can be paused.';end if;
  v_clock:=clock_timestamp();if v_clock>=c.deadline then perform public.cli_duel_settle(c.id);return public.cli_duel_summary(c.id,auth.uid());end if;
  v_remaining:=greatest(0,floor(extract(epoch from(c.deadline-v_clock))*1000)::bigint);
  update public.cli_competitions set status='paused',remaining_ms=v_remaining,played_ms=played_ms+greatest(0,floor(extract(epoch from(v_clock-c.starts_at))*1000)::bigint),starts_at=null,deadline=null where id=c.id;
  update public.active_assessment_sessions set expires_at=v_clock+interval '1 day' where assessment_type='competition' and assessment_id=c.id;
  perform public.cli_duel_bump(c.id,'paused',auth.uid(),null,jsonb_build_object('remainingMs',v_remaining));
 else raise exception 'Unknown host control.';end if;
 return public.cli_duel_summary(c.id,auth.uid());
end $$;
create or replace function public.start_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin
 if exists(select 1 from public.cli_competitions where id=p_competition_id and host_controlled) then return public.control_cli_duel(p_competition_id,'start');end if;
 return public.start_cli_duel_before_host(p_competition_id);
end $$;
-- Extend protected readers/guards without replacing their authorization or ACLs.
do $$ declare def text;begin
 select pg_get_functiondef('public.cli_duel_summary(uuid,uuid)'::regprocedure) into def;
 if position('hostControlled' in def)=0 then
  def:=replace(def,'return s;',$patch$s:=jsonb_set(s,'{competition}',s->'competition'||jsonb_build_object('hostControlled',c.host_controlled,'hasStarted',c.has_started,'remainingMs',case when c.status='active' then greatest(0,floor(extract(epoch from(c.deadline-clock_timestamp()))*1000)::bigint) else c.remaining_ms end));
  if c.host_controlled then s:=jsonb_set(s,'{participants}',coalesce((select jsonb_agg(value||jsonb_build_object('elapsedMs',(select p.active_elapsed_ms from public.cli_competition_participants p where p.id=(value->>'id')::uuid),'inArena',public.cli_duel_host_participant_present((value->>'id')::uuid,null))) from jsonb_array_elements(s->'participants')),'[]'));end if;
  return s;$patch$);execute def;
 end if;
 select pg_get_functiondef('public.cli_duel_command_context(uuid,uuid,text,uuid,bigint,bigint,text)'::regprocedure) into def;
 if position('-- host-pause-command' in def)=0 then def:=replace(def,$old$if p.status<>'in_progress' or$old$,$new$-- host-pause-command
 if c.host_controlled and c.status<>'active' then raise exception 'Commands are locked while waiting, counting down or paused.';end if;
 if p.status<>'in_progress' or$new$);execute def;end if;
 select pg_get_functiondef('public.finish_cli_duel(uuid,text)'::regprocedure) into def;
 if position('-- host-pause-finish' in def)=0 then def:=replace(def,$old$if p.status='in_progress' then$old$,$new$-- host-pause-finish
 if p.status='in_progress' and c.host_controlled and c.status<>'active' then raise exception 'Finish is locked while waiting, counting down or paused.';end if;
 if p.status='in_progress' then$new$);execute def;end if;
 select pg_get_functiondef('public.cli_duel_player_data(uuid,uuid)'::regprocedure) into def;
 if position('-- host-paused-reading' in def)=0 then def:=replace(def,'return jsonb_build_object(', $patch$-- host-paused-reading
 if c.host_controlled and c.has_started and (c.status in('paused','countdown') or c.status='active' and p.status='submitted') then playing:=true;end if;
 return jsonb_build_object($patch$);execute def;end if;
 select pg_get_functiondef('public.cli_duel_seal(uuid,timestamp with time zone,boolean)'::regprocedure) into def;
 if position('active_elapsed_ms=' in def)=0 then def:=replace(def,'finished_at=p_finished_at,',$patch$active_elapsed_ms=case when c.host_controlled then c.played_ms+greatest(0,floor(extract(epoch from(p_finished_at-c.starts_at))*1000)::bigint) else active_elapsed_ms end,finished_at=p_finished_at,$patch$);execute def;end if;
 select pg_get_functiondef('public.manage_cli_duel(uuid,text,text)'::regprocedure) into def;
 def:=replace(def,$old$c.status in ('lobby','waiting','countdown','active')$old$,$new$c.status in ('lobby','waiting','countdown','active','paused')$new$);execute def;
end $$;
create or replace function public.get_cli_duel_host_arena(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;s jsonb;players jsonb;begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);perform public.cli_duel_settle(p_competition_id);
 select * into c from public.cli_competitions where id=p_competition_id;
 if not c.host_controlled then raise exception 'This match uses the earlier duel view.';end if;
 s:=public.cli_duel_summary(c.id,auth.uid());
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'displayName',p.display_name,'state',p.state,'commands',coalesce((select jsonb_agg(jsonb_build_object('sequence',cmd.sequence,'deviceId',cmd.device_id,'command',cmd.command,'promptBefore',cmd.prompt_before,'output',cmd.output,'accepted',cmd.accepted) order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]')) order by p.display_name,p.id),'[]') into players from public.cli_competition_participants p where p.competition_id=c.id;
 return s||jsonb_build_object('task',c.definition_snapshot-'criteria','players',players);
end $$;
revoke all on function public.enter_cli_duel_arena(uuid,text),public.control_cli_duel(uuid,text),public.get_cli_duel_host_arena(uuid) from public,anon;
grant execute on function public.enter_cli_duel_arena(uuid,text),public.control_cli_duel(uuid,text),public.get_cli_duel_host_arena(uuid) to authenticated;
commit;
