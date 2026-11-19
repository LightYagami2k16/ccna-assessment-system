-- Cosmetic character choices and a server-timed pregame introduction.
-- New matches opt in; existing matches retain their lifecycle.
begin;
alter table public.cli_competitions add column if not exists character_selection_required boolean not null default false;
alter table public.cli_competitions add column if not exists versus_ends_at timestamptz;
alter table public.cli_competition_participants add column if not exists character_id text;
alter table public.cli_competition_participants drop constraint if exists cli_duel_character_id_check;
alter table public.cli_competition_participants add constraint cli_duel_character_id_check check(character_id is null or character_id in ('eren-yeager','asta','natsu-dragneel','ichigo-kurosaki','monkey-d-luffy','meliodas','uzumaki-naruto','son-goku','sung-jinwoo','izuku-midoriya','yuji-itadori','shinra-kusakabe','gon-freecss','ken-kaneki','saitama'));
create or replace function public.cli_duel_new_host_arena() returns trigger language plpgsql set search_path=pg_catalog as $$ begin
 if new.rules_version>=3 then new.host_controlled:=true;new.arena_entry_required:=true;new.status:='waiting';new.character_selection_required:=true;end if;return new;end $$;
-- Preserve existing function OIDs/ACLs and their prior implementations.
do $$ declare routine text;def text;begin
 foreach routine in array array['cli_duel_settle(uuid)','control_cli_duel(uuid,text)','cli_duel_abort_host_countdown(uuid)'] loop
  if to_regprocedure('public.'||split_part(routine,'(',1)||'_before_characters('||split_part(routine,'(',2)) is null then
   select pg_get_functiondef(to_regprocedure('public.'||routine)) into def;
   execute replace(def,'public.'||split_part(routine,'(',1)||'(', 'public.'||split_part(routine,'(',1)||'_before_characters(');
  end if;
 end loop;
end $$;
revoke all on function public.cli_duel_settle_before_characters(uuid),public.control_cli_duel_before_characters(uuid,text),public.cli_duel_abort_host_countdown_before_characters(uuid) from public,anon,authenticated;
create or replace function public.select_cli_duel_character(p_participant_id uuid,p_client_id text,p_character_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;begin
 select * into p from public.cli_competition_participants where id=p_participant_id and student_id=auth.uid();
 if not found or public.cli_duel_actor_role(auth.uid()) is distinct from 'student' then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(auth.uid(),p.competition_id);
 select * into c from public.cli_competitions where id=p.competition_id for update;
 select * into p from public.cli_competition_participants where id=p_participant_id for update;
 if not c.character_selection_required or c.status<>'waiting' or c.has_started then raise exception 'Character selection is locked.';end if;
 if p.status<>'in_progress' or not public.cli_duel_host_player_eligible(p.id) then raise exception 'Active eligible player access is required.';end if;
 perform public.assert_assessment_client_session('competition',p.id,p_client_id);
 if p_character_id is null or p_character_id not in ('eren-yeager','asta','natsu-dragneel','ichigo-kurosaki','monkey-d-luffy','meliodas','uzumaki-naruto','son-goku','sung-jinwoo','izuku-midoriya','yuji-itadori','shinra-kusakabe','gon-freecss','ken-kaneki','saitama') then raise exception 'Choose a valid character.';end if;
 if p.character_id is distinct from p_character_id then
  update public.cli_competition_participants set character_id=p_character_id where id=p.id;
  perform public.cli_duel_bump(c.id,'character_selected',auth.uid(),p.id,jsonb_build_object('characterId',p_character_id));
 end if;
 return public.cli_duel_summary(c.id,auth.uid());
end $$;
revoke all on function public.select_cli_duel_character(uuid,text,text) from public,anon;
grant execute on function public.select_cli_duel_character(uuid,text,text) to authenticated;
create or replace function public.control_cli_duel(p_competition_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if c.character_selection_required and p_action='start' and c.status='waiting' and not c.has_started and exists(select 1 from public.cli_competition_participants where competition_id=c.id and character_id is null) then raise exception 'Both players must confirm a character before starting.';end if;
 if p_action in('start','resume') and c.status in('waiting','paused') then update public.cli_competitions set versus_ends_at=null where id=c.id;end if;
 return public.control_cli_duel_before_characters(p_competition_id,p_action);
end $$;
create or replace function public.cli_duel_abort_host_countdown(p_match uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$ begin
 update public.cli_competitions set versus_ends_at=null where id=p_match;
 perform public.cli_duel_abort_host_countdown_before_characters(p_match);
end $$;
create or replace function public.cli_duel_settle(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;v_clock timestamptz;v_boundary timestamptz;begin
 select * into c from public.cli_competitions where id=p_competition for update;
 if not found then return;end if;
 if not c.character_selection_required or c.has_started or c.status<>'countdown' then perform public.cli_duel_settle_before_characters(p_competition);return;end if;
 v_clock:=clock_timestamp();
 if not public.cli_duel_host_players_present(c.id) then perform public.cli_duel_abort_host_countdown(c.id);return;end if;
 v_boundary:=coalesce(c.versus_ends_at,c.starts_at);
 if v_clock<v_boundary then return;end if;
 -- Both controlling sessions must acknowledge after each visual phase.
 if not public.cli_duel_host_players_present(c.id,v_boundary) then
  if v_clock>=v_boundary+interval '3 seconds' then perform public.cli_duel_abort_host_countdown(c.id);end if;return;
 end if;
 if c.versus_ends_at is null then
  update public.cli_competitions set versus_ends_at=v_clock+interval '2 seconds' where id=c.id;
  perform public.cli_duel_bump(c.id,'versus_started');return;
 end if;
 update public.cli_competitions set status='active',has_started=true,starts_at=v_clock,deadline=v_clock+remaining_ms*interval '1 millisecond' where id=c.id;
 update public.active_assessment_sessions set started_at=v_clock,expires_at=v_clock+c.remaining_ms*interval '1 millisecond' where assessment_type='competition' and assessment_id=c.id;
 perform public.cli_duel_bump(c.id,'started');
end $$;
-- Extend authorized summary/review payloads; never publish device state or answer keys.
do $$ declare def text;begin
 select pg_get_functiondef('public.cli_duel_summary(uuid,uuid)'::regprocedure) into def;
 if position('characterSelectionRequired' in def)=0 then
  def:=replace(def,'return s;',$patch$s:=jsonb_set(s,'{competition}',s->'competition'||jsonb_build_object('characterSelectionRequired',c.character_selection_required,'versusEndsAt',c.versus_ends_at));
  s:=jsonb_set(s,'{participants}',coalesce((select jsonb_agg(e.value||jsonb_build_object('characterId',(select p.character_id from public.cli_competition_participants p where p.id=(e.value->>'id')::uuid)) order by e.ordinality) from jsonb_array_elements(s->'participants') with ordinality e(value,ordinality)),'[]'));
  return s;$patch$);execute def;
 end if;
 select pg_get_functiondef('public.get_cli_duel_review(uuid)'::regprocedure) into def;
 if position('characterId' in def)=0 then def:=replace(def,$old$'participantId',p.id,$old$,$new$'participantId',p.id,'characterId',p.character_id,$new$);execute def;end if;
end $$;
commit;
