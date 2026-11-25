-- Reduce background contention without weakening authoritative game mutations.
-- Apply after 084; incremental readers/Edge commit wrappers are additive.
begin;
-- Reading an arena must not update a lease; dedicated heartbeats and commits do.
create or replace function cli_duel_private.assert_session_readonly(p_participant uuid,p_client text)
returns void language plpgsql stable security definer set search_path=pg_catalog as $$
declare client text:=public.validate_assessment_client_id(p_client);begin
 if public.cli_duel_actor_role(auth.uid()) is distinct from 'student' then raise exception 'Student access is required.';end if;
 if not exists(select 1 from public.active_assessment_sessions where student_id=auth.uid() and assessment_type='competition' and attempt_id=p_participant and client_id=client and expires_at>now()) then raise exception 'This browser no longer controls the assessment session.';end if;
end $$;
revoke all on function cli_duel_private.assert_session_readonly(uuid,text) from public,anon,authenticated,service_role;
do $$ declare definition text;begin
 if to_regprocedure('cli_duel_private.settle_before_concurrency(uuid)') is null then
  select pg_get_functiondef('public.cli_duel_settle(uuid)'::regprocedure) into definition;
  execute replace(definition,'public.cli_duel_settle(', 'cli_duel_private.settle_before_concurrency(');
 end if;
end $$;
revoke all on function cli_duel_private.settle_before_concurrency(uuid) from public,anon,authenticated,service_role;
create or replace function public.cli_duel_settle(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;begin
 select * into c from public.cli_competitions where id=p_competition;
 if not found or c.status not in('active','countdown') then return;end if;
 if c.status='active' and c.deadline>clock_timestamp() and exists(select 1 from public.cli_competition_participants where competition_id=c.id and status='in_progress') then return;end if;
 if c.host_controlled and c.status='countdown' and clock_timestamp()<coalesce(c.versus_ends_at,c.starts_at) and public.cli_duel_host_players_present(c.id) then return;end if;
 -- Countdown acknowledgements, completion and deadlines still use locked code.
 perform cli_duel_private.settle_before_concurrency(p_competition);
end $$;
create or replace function public.cli_duel_settle_for_actor(p_actor uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$ declare item record;begin
 for item in select id from public.cli_competitions where (status='countdown' and coalesce(versus_ends_at,starts_at)<=clock_timestamp() or status='active' and deadline<=clock_timestamp()) and public.cli_duel_can_access(p_actor,id) order by id limit 100 loop perform public.cli_duel_settle(item.id);end loop;
end $$;

-- Fast presence writes need no match lock during healthy active play.
do $$ declare definition text;begin
 if to_regprocedure('cli_duel_private.presence_before_concurrency(uuid,text,boolean)') is null then
  select pg_get_functiondef('public.set_cli_duel_arena_presence(uuid,text,boolean)'::regprocedure) into definition;
  execute replace(definition,'public.set_cli_duel_arena_presence(', 'cli_duel_private.presence_before_concurrency(');
 end if;
end $$;
revoke all on function cli_duel_private.presence_before_concurrency(uuid,text,boolean) from public,anon,authenticated,service_role;
do $$ declare definition text;begin
 select pg_get_functiondef('cli_duel_private.presence_before_concurrency(uuid,text,boolean)'::regprocedure) into definition;
 execute replace(definition,'public.assert_assessment_client_session(''competition'',p.id,p_client_id)','cli_duel_private.assert_session_readonly(p.id,p_client_id)');
end $$;
create or replace function public.set_cli_duel_arena_presence(p_participant_id uuid,p_client_id text,p_entered boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found or public.cli_duel_actor_role(auth.uid()) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id;
 if not c.host_controlled or c.status not in('waiting','countdown','active','paused') or c.status='active' and c.deadline<=clock_timestamp() or c.status='countdown' and p_entered is false then return cli_duel_private.presence_before_concurrency(p_participant_id,p_client_id,p_entered);end if;
 if p_entered is null then raise exception 'Arena presence is required.';end if;
 -- Command commits lock participant before lease; presence must keep that order.
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid() for update;
 if not found then raise exception 'Participant access is required.';end if;
 if not public.cli_duel_host_player_eligible(p.id) then raise exception 'The player is no longer eligible for this class.';end if;
 if p.status='in_progress' then perform cli_duel_private.assert_session_readonly(p.id,p_client_id);
 elsif p.status='submitted' and c.has_started then
  if public.validate_assessment_client_id(p_client_id) is null then raise exception 'A valid spectator browser is required.';end if;
  if not p_entered and p.arena_client_id is distinct from p_client_id then return public.cli_duel_summary(c.id,auth.uid());end if;
 else raise exception 'Active player or submitted spectator access is required.';end if;
 update public.cli_competition_participants set arena_seen_at=case when p_entered then clock_timestamp() else null end,arena_client_id=case when p_entered then p_client_id else null end where id=p.id;
 -- Readers settle due timers after this heartbeat commits. Never take a match
 -- lock after the participant lock; explicit countdown departure uses the old path.
 return public.cli_duel_summary(c.id,auth.uid());
end $$;
-- Waiting/countdown freshness remains three seconds; active presence is less frequent.
do $$ declare definition text;begin
 select pg_get_functiondef('public.cli_duel_host_participant_present(uuid,timestamp with time zone)'::regprocedure) into definition;
 if position('interval ''12 seconds''' in definition)=0 then
  if position('interval ''3 seconds''' in definition)=0 then raise exception 'Unexpected presence implementation';end if;
  execute replace(definition,'clock_timestamp()-interval ''3 seconds''','clock_timestamp()-(case when c.status=''active'' then interval ''12 seconds'' else interval ''3 seconds'' end)');
 end if;
end $$;

-- Cursors are scoped to one RPC transaction and restored before returning.
-- Old readers/commits continue returning the full transcript by default.
do $$ declare definition text;begin
 select pg_get_functiondef('public.cli_duel_player_data(uuid,uuid)'::regprocedure) into definition;
 if position('cli_duel.commands_after' in definition)=0 then
  if position('where cmd.participant_id=p.id' in definition)=0 then raise exception 'Unexpected player transcript implementation';end if;
  definition:=replace(definition,'where cmd.participant_id=p.id','where cmd.participant_id=p.id and cmd.sequence>coalesce(nullif(current_setting(''cli_duel.commands_after'',true),''''),''0'')::bigint');
  definition:=replace(definition,'''serverNow'',clock_timestamp()', '''commandsAfter'',coalesce(nullif(current_setting(''cli_duel.commands_after'',true),''''),''0'')::bigint,''serverNow'',clock_timestamp()');
  execute definition;
 end if;
 select pg_get_functiondef('public.get_cli_duel_host_arena(uuid)'::regprocedure) into definition;
 if position('cli_duel.host_cursors' in definition)=0 then
  if position('where cmd.participant_id=p.id' in definition)=0 then raise exception 'Unexpected host transcript implementation';end if;
  definition:=replace(definition,'where cmd.participant_id=p.id','where cmd.participant_id=p.id and cmd.sequence>coalesce((nullif(current_setting(''cli_duel.host_cursors'',true),'''')::jsonb->>p.id::text)::bigint,0)');
  definition:=replace(definition,'''commands'',coalesce(','''commandsAfter'',coalesce((nullif(current_setting(''cli_duel.host_cursors'',true),'''')::jsonb->>p.id::text)::bigint,0),''commands'',coalesce(');
  execute definition;
 end if;
end $$;
create or replace function public.get_cli_duel_player_updates(p_participant_id uuid,p_client_id text,p_after_sequence bigint default 0)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare previous text:=current_setting('cli_duel.commands_after',true);result jsonb;p public.cli_competition_participants%rowtype;begin
 if p_after_sequence is null or p_after_sequence<0 then raise exception 'A valid command cursor is required.';end if;
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);perform public.cli_duel_settle(p.competition_id);
 select * into p from public.cli_competition_participants where id=p.id;
 if p.status='in_progress' then perform cli_duel_private.assert_session_readonly(p.id,p_client_id);end if;
 perform set_config('cli_duel.commands_after',p_after_sequence::text,true);
 result:=public.cli_duel_player_data(p.id,auth.uid());
 perform set_config('cli_duel.commands_after',coalesce(previous,''),true);return result;
end $$;
create or replace function public.get_cli_duel_host_arena_updates(p_competition_id uuid,p_cursors jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare previous text:=current_setting('cli_duel.host_cursors',true);result jsonb;begin
 if jsonb_typeof(p_cursors) is distinct from 'object' then raise exception 'A valid device log cursor map is required.';end if;
 if exists(select 1 from jsonb_each(p_cursors) e where e.key !~ '^[a-fA-F0-9-]{36}$' or e.value::text !~ '^[0-9]{1,18}$') then raise exception 'A valid device log cursor map is required.';end if;
 perform set_config('cli_duel.host_cursors',p_cursors::text,true);result:=public.get_cli_duel_host_arena(p_competition_id);
 perform set_config('cli_duel.host_cursors',coalesce(previous,''),true);return result;
end $$;
create or replace function public.cli_duel_commit_operation_updates(p_actor_id uuid,p_request jsonb,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare previous text:=current_setting('cli_duel.commands_after',true);result jsonb;begin
 perform set_config('cli_duel.commands_after',coalesce(p_request->>'expectedRevision','0'),true);
 result:=public.cli_duel_commit_operation(p_actor_id,p_request,p_outcome);
 perform set_config('cli_duel.commands_after',coalesce(previous,''),true);return result;
end $$;
revoke all on function public.get_cli_duel_player_updates(uuid,text,bigint),public.get_cli_duel_host_arena_updates(uuid,jsonb),public.cli_duel_commit_operation_updates(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.get_cli_duel_player_updates(uuid,text,bigint),public.get_cli_duel_host_arena_updates(uuid,jsonb) to authenticated;
grant execute on function public.cli_duel_commit_operation_updates(uuid,jsonb,jsonb) to service_role;

-- Record every command/revision, but navigation need not wake opponent readers.
-- Objective hits and lifecycle events still broadcast, even when score deltas cancel.
create or replace function public.cli_duel_bump(p_competition uuid,p_kind text,p_actor uuid default null,p_participant uuid default null,p_details jsonb default '{}')
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare previous text:=current_setting('cli_duel.quiet_broadcast',true);begin
 if p_kind='command' and p_details->'delta'='0'::jsonb then perform set_config('cli_duel.quiet_broadcast','true',true);end if;
 update public.cli_competitions set revision=revision+1 where id=p_competition;
 insert into public.cli_competition_events(competition_id,participant_id,actor_id,kind,details) values(p_competition,p_participant,p_actor,p_kind,p_details);
 perform set_config('cli_duel.quiet_broadcast',coalesce(previous,''),true);
end $$;
create or replace function public.cli_duel_broadcast_revision()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if new.revision is distinct from old.revision and current_setting('cli_duel.quiet_broadcast',true) is distinct from 'true' and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin perform realtime.send(jsonb_build_object('competitionId',new.id,'revision',new.revision),'changed','cli-duel:'||new.id::text,true);exception when others then null;end;
 end if;return new;
end $$;
commit;
