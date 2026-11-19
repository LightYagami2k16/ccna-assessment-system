-- Shared lease integration for the dedicated competition type.
begin;
alter table public.active_assessment_sessions drop constraint if exists active_assessment_sessions_assessment_type_check;
alter table public.active_assessment_sessions add constraint active_assessment_sessions_assessment_type_check check(assessment_type in ('quiz','cli','competition'));
create or replace function public.cli_duel_sessions_available() returns boolean language sql immutable set search_path=pg_catalog as $$ select true $$;
revoke all on function public.cli_duel_sessions_available() from public,anon,authenticated;

create or replace function public.describe_active_assessment_session(p_assessment_type text,p_assessment_id uuid)
returns text language sql stable security definer set search_path=pg_catalog as $$
 select case p_assessment_type
 when 'quiz' then coalesce((select title from public.quizzes where id=p_assessment_id),'Quiz')
 when 'cli' then coalesce((select title from public.cli_labs where id=p_assessment_id),'CLI practical')
 when 'competition' then coalesce((select title from public.cli_competitions where id=p_assessment_id),'CLI Duel')
 else 'Assessment' end;
$$;
revoke all on function public.describe_active_assessment_session(text,uuid) from public,anon,authenticated;

-- Ordinary monitoring must never bypass dedicated duel authorization.
do $$ declare def text;begin
 select pg_get_functiondef('public.get_instructor_assessment_client_sessions()'::regprocedure) into def;
 if position('-- cli-duel-monitor-boundary' in def)=0 then
  if position('where session.expires_at > now()' in def)=0 then raise exception 'Unrecognized ordinary session monitor.';end if;
  def:=replace(def,'where session.expires_at > now()',E'where session.expires_at > now()\n      and session.assessment_type in (''quiz'',''cli'') -- cli-duel-monitor-boundary');execute def;
 end if;
end;$$;

-- Preserve existing implementations/guards and their signatures.
do $$ declare def text;begin
 select replace(pg_get_functiondef('public.claim_assessment_client_session(text,uuid,text,text)'::regprocedure),E'\r\n',E'\n') into def;
 if position('-- cli-duel-claim-guard' in def)=0 then
  if position('v_client_id := public.validate_assessment_client_id(p_client_id);' in def)=0 then raise exception 'Unrecognized browser claim routine.';end if;
  def:=replace(def,'''quiz'', ''cli''','''quiz'', ''cli'', ''competition''');
  def:=replace(def,'public.get_current_user_role_text() <> ''student''','public.cli_duel_actor_role(auth.uid()) is distinct from ''student''');
  def:=replace(def,'v_client_id := public.validate_assessment_client_id(p_client_id);',E'-- cli-duel-claim-guard\n  if p_assessment_type=''competition'' then\n    perform public.cli_duel_require_access(auth.uid(),(select competition_id from public.cli_competition_participants where id=p_attempt_id and student_id=auth.uid()));\n    perform public.cli_duel_settle((select competition_id from public.cli_competition_participants where id=p_attempt_id and student_id=auth.uid()));\n  end if;\n  v_client_id := public.validate_assessment_client_id(p_client_id);');execute def;
 end if;
 select replace(pg_get_functiondef('public.assert_assessment_client_session(text,uuid,text)'::regprocedure),E'\r\n',E'\n') into def;
 if position('-- cli-duel-student-guard' in def)=0 then
  def:=replace(def,E'begin\n',E'begin\n  -- cli-duel-student-guard\n  if public.cli_duel_actor_role(auth.uid()) is distinct from ''student'' then raise exception ''Student access is required.'';end if;\n');execute def;
 end if;
 select replace(pg_get_functiondef('public.get_student_active_assessment_session()'::regprocedure),E'\r\n',E'\n') into def;
 if position('-- cli-duel-expiry' in def)=0 then
  if position('perform public.reconcile_expired_assessment_attempts();' in def)=0 then raise exception 'Unrecognized active assessment reader.';end if;
  def:=replace(def,'public.get_current_user_role_text() <> ''student''','public.cli_duel_actor_role(auth.uid()) is distinct from ''student''');
  def:=replace(def,'perform public.reconcile_expired_assessment_attempts();',E'-- cli-duel-expiry\n  perform public.cli_duel_settle_for_actor(v_student_id);\n  perform public.reconcile_expired_assessment_attempts();');execute def;
 end if;
 select replace(pg_get_functiondef('public.enforce_one_active_assessment_session()'::regprocedure),E'\r\n',E'\n') into def;
 if position('-- cli-duel-description' in def)=0 then
  def:=replace(def,'when v_active.assessment_type = ''quiz'' then ''quiz''',E'when v_active.assessment_type = ''quiz'' then ''quiz''\n        when v_active.assessment_type = ''competition'' then ''CLI Duel''');
  def:=replace(def,'else ''Open CLI practicals and resume the active practical.''',E'when v_active.assessment_type = ''competition'' then ''Open Competitions and resume the duel.''\n      else ''Open CLI practicals and resume the active practical.''');
  def:=replace(def,E'begin\n',E'begin\n  -- cli-duel-description\n');execute def;
 end if;
end;$$;
revoke all on function public.assert_assessment_client_session(text,uuid,text) from public,anon,authenticated;
revoke all on function public.claim_assessment_client_session(text,uuid,text,text),public.get_student_active_assessment_session(),public.heartbeat_assessment_client_session(text,uuid,text),public.release_assessment_client_session(text,uuid,text) from public,anon;
grant execute on function public.claim_assessment_client_session(text,uuid,text,text),public.get_student_active_assessment_session(),public.heartbeat_assessment_client_session(text,uuid,text),public.release_assessment_client_session(text,uuid,text) to authenticated;

create or replace function public.cli_duel_channel_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if p_topic is null or p_topic !~ '^cli-duel:[0-9a-fA-F-]{36}$' then return false;end if;
 return public.cli_duel_can_access(auth.uid(),substring(p_topic from 10)::uuid);
exception when invalid_text_representation then return false;
end;
$$;
revoke all on function public.cli_duel_channel_allowed(text) from public;
grant execute on function public.cli_duel_channel_allowed(text) to anon,authenticated;
create or replace function public.cli_duel_broadcast_revision()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$
begin
 if new.revision is distinct from old.revision and to_regprocedure('realtime.send(jsonb,text,text,boolean)') is not null then
  begin
   perform realtime.send(jsonb_build_object('competitionId',new.id,'revision',new.revision),'changed','cli-duel:'||new.id::text,true);
  exception when others then null;
  end;
 end if;
 return new;
end;
$$;
revoke all on function public.cli_duel_broadcast_revision() from public,anon,authenticated;
drop trigger if exists cli_duel_revision_broadcast on public.cli_competitions;
create trigger cli_duel_revision_broadcast after update of revision on public.cli_competitions for each row execute function public.cli_duel_broadcast_revision();
do $$ begin
 if to_regclass('realtime.messages') is not null then
  execute 'drop policy if exists "CLI Duel receive" on realtime.messages';
  execute 'drop policy if exists "CLI Duel receive boundary" on realtime.messages';
  execute 'drop policy if exists "CLI Duel send boundary" on realtime.messages';
  execute $policy$create policy "CLI Duel receive" on realtime.messages for select to authenticated using (extension='broadcast' and public.cli_duel_channel_allowed(realtime.topic()))$policy$;
  execute $policy$create policy "CLI Duel receive boundary" on realtime.messages as restrictive for select to anon,authenticated using (case when realtime.topic() like 'cli-duel:%' then extension='broadcast' and public.cli_duel_channel_allowed(realtime.topic()) else true end)$policy$;
  execute $policy$create policy "CLI Duel send boundary" on realtime.messages as restrictive for insert to anon,authenticated with check (realtime.topic() not like 'cli-duel:%')$policy$;
 end if;
end;$$;
commit;
