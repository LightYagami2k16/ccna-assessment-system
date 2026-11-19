-- Local duel arena admission: both browsers inside before a five-second start.
begin;
alter table public.cli_competitions add column if not exists arena_entry_required boolean not null default false;
alter table public.cli_competition_participants add column if not exists arena_seen_at timestamptz;
alter table public.cli_competition_participants add column if not exists arena_client_id text;
alter table public.cli_competitions drop constraint if exists cli_competitions_status_check;
alter table public.cli_competitions add constraint cli_competitions_status_check check(status in('lobby','waiting','countdown','active','completed','cancelled','voided'));
create or replace function public.cli_duel_new_arena_gate() returns trigger language plpgsql set search_path=pg_catalog as $$ begin if new.rules_version>=3 then new.arena_entry_required:=true;end if;return new;end $$;
revoke all on function public.cli_duel_new_arena_gate() from public,anon,authenticated;
drop trigger if exists cli_duel_new_arena_gate on public.cli_competitions;
create trigger cli_duel_new_arena_gate before insert on public.cli_competitions for each row execute function public.cli_duel_new_arena_gate();
-- Unstarted full-builder lobbies adopt the new flow; running/history snapshots stay intact.
update public.cli_competitions set arena_entry_required=true where rules_version>=3 and status='lobby';

-- Optional academic metadata in duels; supplied legacy metadata is still checked.
do $$ declare def text;begin
 select pg_get_functiondef('public.cli_duel_full_definition(jsonb,jsonb,jsonb)'::regprocedure) into def;
 def:=replace(def,'if not exists(select 1 from public.courses where id=v_course and is_active)', 'if v_course is not null and not exists(select 1 from public.courses where id=v_course and is_active)');
 def:=replace(def,'''{courseId}'',to_jsonb(v_course)', '''{courseId}'',coalesce(to_jsonb(v_course),''null''::jsonb)');
 execute def;
 -- Keep this OID: existing callers must execute the new gate, not an old cached routine.
 select pg_get_functiondef('public.cli_duel_summary(uuid,uuid)'::regprocedure) into def;
 if position('arenaEntryRequired' in def)=0 then
  def:=replace(def,'return s;', $patch$s:=jsonb_set(s,'{competition}',s->'competition'||jsonb_build_object('arenaEntryRequired',c.arena_entry_required,'countdownSeconds',case when c.arena_entry_required then 5 else 10 end));
  s:=jsonb_set(s,'{participants}',coalesce((select jsonb_agg(value||jsonb_build_object('inArena',exists(select 1 from public.cli_competition_participants p join public.active_assessment_sessions lease on lease.attempt_id=p.id and lease.assessment_type='competition' and lease.client_id=p.arena_client_id and lease.expires_at>clock_timestamp() where p.id=(value->>'id')::uuid and p.arena_seen_at>clock_timestamp()-interval '6 seconds'))) from jsonb_array_elements(s->'participants')),'[]'));
  return s;$patch$);execute def;
 end if;
 -- Reject command/finish before the arena is admitted (NULL start must not bypass SQL comparisons).
 select pg_get_functiondef('public.cli_duel_command_context(uuid,uuid,text,uuid,bigint,bigint,text)'::regprocedure) into def;
 if position('or c.starts_at is null' in def)=0 then def:=replace(def,'or clock_timestamp()<c.starts_at', 'or c.starts_at is null or clock_timestamp()<c.starts_at');execute def;end if;
 select pg_get_functiondef('public.finish_cli_duel(uuid,text)'::regprocedure) into def;
 if position('if c.starts_at is null' in def)=0 then def:=replace(def,'if v_clock<c.starts_at', 'if c.starts_at is null or v_clock<c.starts_at');execute def;end if;
 select pg_get_functiondef('public.manage_cli_duel(uuid,text,text)'::regprocedure) into def;
 def:=replace(def,$old$c.status in ('lobby','countdown','active')$old$, $new$c.status in ('lobby','waiting','countdown','active')$new$);execute def;
 -- Preserve legacy start implementation as a private helper once.
 if to_regprocedure('public.cli_duel_start_before_arena(uuid)') is null then
  select pg_get_functiondef('public.start_cli_duel(uuid)'::regprocedure) into def;
  execute replace(def,'public.start_cli_duel(', 'public.cli_duel_start_before_arena(');
 end if;
end $$;
revoke all on function public.cli_duel_start_before_arena(uuid) from public,anon,authenticated;

create or replace function public.cli_duel_arena_present(p_competition uuid)
returns boolean language sql stable security definer set search_path=pg_catalog as $$
 select count(*)=2 from public.cli_competition_participants p join public.active_assessment_sessions lease
 on lease.student_id=p.student_id and lease.assessment_type='competition' and lease.attempt_id=p.id and lease.client_id=p.arena_client_id and lease.expires_at>clock_timestamp()
 where p.competition_id=p_competition and p.status='in_progress' and p.arena_seen_at>clock_timestamp()-interval '6 seconds';
$$;
revoke all on function public.cli_duel_arena_present(uuid) from public,anon,authenticated;
create or replace function public.cli_duel_wait_for_arena(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$ begin
 update public.cli_competitions set status='waiting',starts_at=null,deadline=null where id=p_competition;
 update public.active_assessment_sessions set expires_at=clock_timestamp()+interval '1 day' where assessment_type='competition' and assessment_id=p_competition;
 perform public.cli_duel_bump(p_competition,'waiting_for_arena');
end $$;
revoke all on function public.cli_duel_wait_for_arena(uuid) from public,anon,authenticated;

-- Validate fresh arena presence at the transition, before any timer/command settlement.
do $$ declare def text;begin
 select pg_get_functiondef('public.cli_duel_settle(uuid)'::regprocedure) into def;
 if position('-- arena-admission-settle' in def)=0 then
  def:=replace(def,E'begin\n',E'begin\n -- arena-admission-settle\n perform 1 from public.cli_competitions where id=p_competition for update;\n if exists(select 1 from public.cli_competitions c where c.id=p_competition and c.arena_entry_required and c.status=''countdown'' and clock_timestamp()>=c.starts_at) and not public.cli_duel_arena_present(p_competition) then\n perform public.cli_duel_wait_for_arena(p_competition);return;end if;\n');
  execute def;
 end if;
end $$;
create or replace function public.start_cli_duel(p_competition_id uuid)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p record;actor uuid:=auth.uid();v_clock timestamptz:=clock_timestamp();begin
 perform public.cli_duel_require_access(actor,p_competition_id,true);
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if not c.arena_entry_required then return public.cli_duel_start_before_arena(p_competition_id);end if;
 if c.status in('waiting','countdown','active') then perform public.cli_duel_settle(c.id);return public.cli_duel_summary(c.id,actor);end if;
 if c.status<>'lobby' then raise exception 'Create a rematch to start another duel.';end if;
 if (select count(*) from public.cli_competition_participants where competition_id=c.id and status='ready')<>2 then raise exception 'Both students must be ready.';end if;
 for p in select * from public.cli_competition_participants where competition_id=c.id order by student_id for update loop
  if public.cli_duel_actor_role(p.student_id) is distinct from 'student' then raise exception 'Both participants must be active students.';end if;
  if p.qualifying_class_id is not null and not exists(select 1 from public.class_sections s join public.class_memberships m on m.class_id=s.id where s.id=p.qualifying_class_id and s.is_active and m.student_id=p.student_id and (s.created_by=c.host_id or public.cli_duel_actor_role(actor)='administrator')) then raise exception 'A participant is no longer eligible for the selected class.';end if;
  delete from public.active_assessment_sessions where student_id=p.student_id and expires_at<=v_clock;
  insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id,assessment_id,started_at,expires_at,updated_at,client_id,client_claimed_at,client_heartbeat_at)
  values(p.student_id,'competition',p.id,c.id,v_clock,v_clock+interval '1 day',v_clock,p.ready_client_id,v_clock,v_clock);
  update public.cli_competition_participants set status='in_progress',arena_seen_at=null,arena_client_id=null where id=p.id;
 end loop;
 update public.cli_competitions set status='waiting',starts_at=null,deadline=null where id=c.id;
 perform public.cli_duel_bump(c.id,'arena_opened',actor);
 return public.cli_duel_summary(c.id,actor);
exception when unique_violation then raise exception 'One student already has an active assessment. Both must finish or exit it first.';
end $$;

create or replace function public.set_cli_duel_arena_presence(p_participant_id uuid,p_client_id text,p_entered boolean)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;v_start timestamptz;actor uuid:=auth.uid();begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=actor;
 if not found or public.cli_duel_actor_role(actor) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(actor,p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id for update;
 perform public.cli_duel_settle(c.id);
 select * into c from public.cli_competitions where id=p.competition_id;
 if not c.arena_entry_required or c.status not in('waiting','countdown') then return public.cli_duel_summary(c.id,actor);end if;
 perform public.assert_assessment_client_session('competition',p.id,p_client_id);
 if p_entered is null then raise exception 'Arena presence is required.';end if;
 update public.cli_competition_participants set arena_seen_at=case when p_entered then clock_timestamp() else null end,arena_client_id=case when p_entered then p_client_id else null end where id=p.id;
 if not p_entered and c.status='countdown' then perform public.cli_duel_wait_for_arena(c.id);
 elsif p_entered and c.status='waiting' and public.cli_duel_arena_present(c.id) then
  v_start:=clock_timestamp()+interval '5 seconds';
  update public.cli_competitions set status='countdown',starts_at=v_start,deadline=v_start+make_interval(mins=>c.duration_minutes) where id=c.id;
  update public.active_assessment_sessions set started_at=v_start,expires_at=v_start+make_interval(mins=>c.duration_minutes) where assessment_type='competition' and assessment_id=c.id;
  perform public.cli_duel_bump(c.id,'countdown_started',actor,null,jsonb_build_object('startsAt',v_start,'countdownSeconds',5));
 end if;
 perform public.cli_duel_settle(c.id);
 return public.cli_duel_summary(c.id,actor);
end $$;
revoke all on function public.set_cli_duel_arena_presence(uuid,text,boolean) from public,anon;
grant execute on function public.set_cli_duel_arena_presence(uuid,text,boolean) to authenticated;
commit;
