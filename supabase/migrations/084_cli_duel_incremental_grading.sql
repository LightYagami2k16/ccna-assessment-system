-- Incremental grading of verified CLI Duel state. No client-side scoring.
-- Apply after 074-083. Full grading, final verification, auth and HP semantics remain unchanged.
begin;
create schema if not exists cli_duel_private;
revoke all on schema cli_duel_private from public,anon,authenticated,service_role;
create table if not exists cli_duel_private.grading_settings(
 id boolean primary key default true check(id),algorithm_version integer not null,
 grader_fingerprint text not null,audit boolean not null default false
);
create table if not exists cli_duel_private.grade_cache(
 participant_id uuid primary key references public.cli_competition_participants(id) on delete cascade,
 algorithm_version integer not null,grader_fingerprint text not null,
 definition jsonb not null,state jsonb not null,grading jsonb not null,inputs jsonb not null,
 evaluated integer not null,reused integer not null,updated_at timestamptz not null default clock_timestamp()
);
create index if not exists cli_duel_grade_cache_age_idx on cli_duel_private.grade_cache(updated_at);
alter table cli_duel_private.grade_cache enable row level security;
alter table cli_duel_private.grading_settings enable row level security;
revoke all on all tables in schema cli_duel_private from public,anon,authenticated,service_role;

create or replace function cli_duel_private.criterion_input(p_state jsonb,p_criterion jsonb)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare s jsonb:=public.cli_criterion_device_state(p_state,p_criterion);kind text:=p_criterion->>'type';v jsonb;port text;begin
 case kind
  when 'hostname' then v:=s->'hostname';
  when 'enable_secret' then v:=s->'enableSecret';
  when 'password_encryption' then v:=s->'servicePasswordEncryption';
  when 'banner_motd' then v:=s->'bannerMotd';
  when 'domain_name' then v:=s->'domainName';
  when 'local_user' then v:=s->'users';
  when 'config_saved' then v:=s->'saved';
  when 'default_gateway' then v:=s->'defaultGateway';
  when 'pc_dns_servers' then v:=s->'dnsServers';
  when 'ip_routing_enabled' then v:=s->'ipRouting';
  when 'vlan_exists' then v:=to_jsonb((s->'vlans') ? btrim(p_criterion->>'target'));
  when 'vlan_name' then v:=s#>array['vlans',btrim(p_criterion->>'target')];
  when 'line_password','line_login','line_transport_input','line_login_local' then v:=jsonb_build_array(s->'lines',s->'users');
  when 'interface_mode','interface_description','interface_access_vlan','interface_voice_vlan','interface_trunk_native_vlan','interface_trunk_allowed_vlans','interface_dot1q','interface_dot1q_native','interface_enabled','interface_ip','interface_acl','interface_nat_role','interface_portfast','interface_bpduguard' then
   -- The canonical evaluator uses this port's configuration. Include parent and
   -- ACL/routing context conservatively; PC IP grading keeps its existing path.
   if kind='interface_ip' and s->>'deviceType'='pc' then return null;end if;
   port:=public.canonical_cli_interface(p_criterion->>'target');
   v:=jsonb_build_array(s#>array['interfaces',port],case when position('.' in port)>0 then s#>array['interfaces',split_part(port,'.',1)] else null end,s->'accessLists',s->'ipRouting');
  else return null; -- Routing, connectivity, EtherChannel, STP, NAT, DHCP and new types: evaluate normally.
 end case;
 return jsonb_build_array(s->'deviceType',v);
end $$;
revoke all on function cli_duel_private.criterion_input(jsonb,jsonb) from public,anon,authenticated,service_role;


create or replace function cli_duel_private.evaluator_fingerprint()
returns text language sql stable security definer set search_path=pg_catalog as $$
 select md5(coalesce(string_agg(pg_get_functiondef(p.oid),E'\n' order by n.nspname,p.proname,p.oid),''))
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where p.prokind='f' and ((n.nspname='public' and (p.proname like '%criterion%' or p.proname like 'canonical_cli_%' or p.proname='cli_duel_grade'))
 or (n.nspname='cli_duel_private' and p.proname in('criterion_input','grade_cached')));
$$;
revoke all on function cli_duel_private.evaluator_fingerprint() from public,anon,authenticated,service_role;

create or replace function cli_duel_private.grade_cached(p_participant uuid,p_definition jsonb,p_state jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare cached cli_duel_private.grade_cache%rowtype;settings cli_duel_private.grading_settings%rowtype;previous jsonb;participant_status text;fingerprint text;g jsonb;finger jsonb;inputs jsonb:='[]';rows jsonb:='[]';criterion jsonb;item jsonb;ordinal bigint;met boolean;points numeric;score numeric:=0;maximum numeric:=0;evaluated integer:=0;reused integer:=0;warm boolean;
begin
 select state,status into previous,participant_status from public.cli_competition_participants where id=p_participant for update;
 if not found then raise exception 'Unknown duel participant.';end if;
 select * into settings from cli_duel_private.grading_settings where id;
 fingerprint:=cli_duel_private.evaluator_fingerprint();
 -- A later evaluator migration must opt into fresh dependencies before reuse.
 if participant_status<>'in_progress' or settings.algorithm_version is distinct from 1 or settings.grader_fingerprint is distinct from fingerprint then
  delete from cli_duel_private.grade_cache where participant_id=p_participant;
  return public.cli_duel_grade(p_definition,p_state);
 end if;
 select * into cached from cli_duel_private.grade_cache where participant_id=p_participant;
 warm:=found and cached.algorithm_version=1 and cached.grader_fingerprint=fingerprint and cached.definition=p_definition and cached.state=previous
  and cached.updated_at>clock_timestamp()-interval '30 minutes'
  and jsonb_array_length(cached.grading->'criteria')=jsonb_array_length(p_definition->'criteria');
 -- One opportunistic cleaner at a time; other grading transactions skip cleanup.
 -- SKIP LOCKED avoids waiting on a cache currently used by another participant.
 if not warm and pg_try_advisory_xact_lock(184084001) then
  delete from cli_duel_private.grade_cache where participant_id in
   (select participant_id from cli_duel_private.grade_cache where participant_id<>p_participant and updated_at<clock_timestamp()-interval '1 day' order by updated_at limit 32 for update skip locked);
 end if;
 for criterion,ordinal in select value,ordinality from jsonb_array_elements(p_definition->'criteria') with ordinality loop
  finger:=cli_duel_private.criterion_input(p_state,criterion);inputs:=inputs||jsonb_build_array(finger);
  if warm and finger is not null and finger is not distinct from cached.inputs->(ordinal-1)::integer then
   met:=(cached.grading->'criteria'->(ordinal-1)::integer->>'met')::boolean;reused:=reused+1;
  else met:=public.cli_criterion_is_met(p_state,criterion);evaluated:=evaluated+1;end if;
  points:=(criterion->>'points')::numeric;maximum:=maximum+points;
  if met then score:=score+points;end if;
  item:=criterion||jsonb_build_object('met',met,'pointsAwarded',case when met then points else 0 end);rows:=rows||jsonb_build_array(item);
 end loop;
 g:=jsonb_build_object('scorePoints',score,'maximumPoints',maximum,'criteria',rows);
 -- Nested statements prevent PostgreSQL from evaluating the audit when disabled.
 if settings.audit then
  if g is distinct from public.cli_duel_grade(p_definition,p_state) then raise exception 'Cached grading verification failed; resynchronize and retry.';end if;
 end if;
 insert into cli_duel_private.grade_cache values(p_participant,1,fingerprint,p_definition,p_state,g,inputs,evaluated,reused,clock_timestamp())
 on conflict(participant_id) do update set algorithm_version=excluded.algorithm_version,grader_fingerprint=excluded.grader_fingerprint,
  definition=excluded.definition,state=excluded.state,grading=excluded.grading,inputs=excluded.inputs,evaluated=excluded.evaluated,reused=excluded.reused,updated_at=excluded.updated_at;
 return g;
end $$;
revoke all on function cli_duel_private.grade_cached(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;

create or replace function cli_duel_private.clear_ended_cache()
returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin
 if tg_table_name='cli_competition_participants' then
  if new.status<>'in_progress' then delete from cli_duel_private.grade_cache where participant_id=new.id;end if;
 elsif new.status in('completed','cancelled','voided') then
  delete from cli_duel_private.grade_cache where participant_id in(select id from public.cli_competition_participants where competition_id=new.id);
 end if;
 return null;
end $$;
revoke all on function cli_duel_private.clear_ended_cache() from public,anon,authenticated,service_role;
drop trigger if exists cli_duel_clear_participant_cache on public.cli_competition_participants;
create trigger cli_duel_clear_participant_cache after update of status on public.cli_competition_participants
 for each row when(old.status is distinct from new.status) execute function cli_duel_private.clear_ended_cache();
drop trigger if exists cli_duel_clear_match_cache on public.cli_competitions;
create trigger cli_duel_clear_match_cache after update of status on public.cli_competitions
 for each row when(old.status is distinct from new.status) execute function cli_duel_private.clear_ended_cache();

do $$ declare definition text;begin
 select pg_get_functiondef('public.cli_duel_commit_command(uuid,uuid,text,uuid,bigint,bigint,text,jsonb)'::regprocedure) into definition;
 if position('cli_duel_grade_lookup_local' in definition)>0 then raise exception 'Roll back the local experiment before applying migration 084.';end if;
 if position('cli_duel_private.grade_cached' in definition)=0 then
  if position($target$g:=public.cli_duel_grade(c.definition_snapshot,p_outcome->'state');$target$ in definition)=0 then raise exception 'Unexpected duel commit implementation; refusing to patch.';end if;
  execute replace(definition,$target$g:=public.cli_duel_grade(c.definition_snapshot,p_outcome->'state');$target$,$replacement$g:=cli_duel_private.grade_cached(p.id,c.definition_snapshot,p_outcome->'state');$replacement$);
 end if;
end $$;
-- Reinstallation starts a fresh cache generation after helpers are updated.
truncate cli_duel_private.grade_cache;
insert into cli_duel_private.grading_settings values(true,1,cli_duel_private.evaluator_fingerprint(),false)
 on conflict(id) do update set algorithm_version=1,grader_fingerprint=excluded.grader_fingerprint;
commit;
