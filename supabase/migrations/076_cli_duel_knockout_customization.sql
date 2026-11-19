-- Forward, versioned CLI Duel knockout/customization. Existing matches remain v1.
begin;
alter table public.cli_competitions add column if not exists rules_version integer not null default 1 check(rules_version in (1,2));
alter table public.cli_competitions add column if not exists starting_hp numeric not null default 100 check(starting_hp between 1 and 10000);
alter table public.cli_competitions add column if not exists end_reason text;
alter table public.cli_competitions add column if not exists winner_participant_id uuid;
create table if not exists public.cli_competition_objective_hits (
 participant_id uuid not null references public.cli_competition_participants(id),objective_id text not null,
 damage numeric not null check(damage between 0 and 10000),command_id uuid not null,earned_at timestamptz not null,
 primary key(participant_id,objective_id)
);
alter table public.cli_competition_objective_hits enable row level security;
revoke all on public.cli_competition_objective_hits from public,anon,authenticated;

create or replace function public.cli_duel_default_damage(p_criteria jsonb,p_hp numeric)
returns jsonb language sql immutable security definer set search_path=pg_catalog as $$
 with amounts as(select ordinality n,(value->>'points')::numeric points from jsonb_array_elements(p_criteria) with ordinality),
 weights as(select n,p_hp*100*points numerator,sum(points) over() total from amounts),
 rounded as(select n,div(numerator,total) base,rank() over(order by mod(numerator,total) desc,n) fraction_rank from weights),
 budget as(select p_hp*100-sum(base) rest from rounded)
 select jsonb_agg((base+case when fraction_rank<=rest then 1 else 0 end)/100 order by n) from rounded cross join budget;
$$;
create or replace function public.cli_duel_prepare_definition(p_base jsonb,p_custom jsonb,p_combat jsonb)
returns jsonb language plpgsql immutable security definer set search_path=pg_catalog as $$
declare def jsonb:=p_base;custom jsonb:=coalesce(nullif(p_custom,'null'),'{}');combat jsonb:=coalesce(nullif(p_combat,'null'),'{}');criteria jsonb;entry jsonb;item jsonb;result jsonb:='[]';i integer:=0;hp numeric;damage jsonb;amount numeric;total numeric:=0;errors jsonb;
begin
 if jsonb_typeof(custom)<>'object' or jsonb_typeof(combat)<>'object' then raise exception 'Invalid customization or combat settings.';end if;
 if exists(select 1 from jsonb_object_keys(custom) k where k not in ('instructions','deviceLabel','initialHostname','criteria')) or exists(select 1 from jsonb_object_keys(combat) k where k not in ('startingHp','damage')) then raise exception 'Unexpected customization fields.';end if;
 if custom ? 'instructions' then if jsonb_typeof(custom->'instructions')<>'string' then raise exception 'Instructions must be text.';end if;def:=jsonb_set(def,'{instructions}',custom->'instructions');end if;
 if custom ? 'deviceLabel' then if jsonb_typeof(custom->'deviceLabel')<>'string' then raise exception 'Device label must be text.';end if;def:=jsonb_set(def,'{devices,0,label}',custom->'deviceLabel');end if;
 if custom ? 'initialHostname' then if jsonb_typeof(custom->'initialHostname')<>'string' then raise exception 'Starting hostname must be text.';end if;def:=jsonb_set(def,'{devices,0,hostname}',custom->'initialHostname');end if;
 if length(def->>'instructions')>32000 or length(def->'devices'->0->>'label')>160 or def->'devices'->0->>'hostname' !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' then raise exception 'Enter valid instructions, device label and starting hostname.';end if;
 criteria:=coalesce(custom->'criteria',def->'criteria');
 if jsonb_typeof(criteria)<>'array' or jsonb_array_length(criteria) not between 1 and 128 then raise exception 'Provide 1–128 objectives.';end if;
 for entry in select value from jsonb_array_elements(criteria) loop
  i:=i+1;
  if jsonb_typeof(entry)<>'object' or jsonb_typeof(entry->'points') is distinct from 'number' then raise exception 'Objective points must be positive numbers.';end if;
  if custom ? 'criteria' and exists(select 1 from jsonb_object_keys(entry) k where k not in ('id','label','type','target','expected','points','deviceId')) then raise exception 'Unexpected objective fields.';end if;
  if nullif(entry->>'deviceId','') is not null and entry->>'deviceId'<>def->'devices'->0->>'id' then raise exception 'Every objective must belong to the single device.';end if;
  if exists(select 1 from jsonb_each(entry) e where e.key in ('label','type','target','expected','deviceId') and e.value<>'null'::jsonb and jsonb_typeof(e.value)<>'string') then raise exception 'Objective values must be text.';end if;
  if coalesce(entry->>'expected','')<>btrim(regexp_replace(coalesce(entry->>'expected',''),'\s+',' ','g')) then raise exception 'Expected values must use single spaces, with no leading or trailing whitespace.';end if;
  item:=jsonb_build_object('type',entry->>'type','target',coalesce(entry->>'target',''),'expected',coalesce(entry->>'expected',''),'points',entry->'points','deviceId',def->'devices'->0->>'id','label',coalesce(entry->>'label',''),'objectiveId','objective-'||i);
  result:=result||jsonb_build_array(item);
 end loop;
 def:=jsonb_set(jsonb_set(def,'{criteria}',result),'{version}','2');
 errors:=public.cli_duel_definition_errors(def);if errors<>'[]' then raise exception '%',errors->>0;end if;
 if combat ? 'startingHp' and jsonb_typeof(combat->'startingHp')<>'number' then raise exception 'Starting HP must be numeric.';end if;
 hp:=coalesce((combat->>'startingHp')::numeric,100);
 if hp::text in ('NaN','Infinity','-Infinity') or hp not between 1 and 10000 or trunc(hp)<>hp then raise exception 'Starting HP must be a whole number from 1 to 10000.';end if;
 damage:=coalesce(combat->'damage',public.cli_duel_default_damage(result,hp));
 if jsonb_typeof(damage)<>'array' or jsonb_array_length(damage)<>i then raise exception 'Provide damage for each objective.';end if;
 for entry in select value from jsonb_array_elements(damage) loop
  if jsonb_typeof(entry)<>'number' then raise exception 'Objective damage must be numeric.';end if;
  amount:=entry::text::numeric;
  if amount::text in ('NaN','Infinity','-Infinity') or amount not between 0 and 10000 or round(amount,2)<>amount then raise exception 'Damage must be 0–10000 with at most two decimals.';end if;total:=total+amount;
 end loop;
 if total<hp then raise exception 'Total objective damage must reach the starting HP.';end if;
 return jsonb_set(def,'{combat}',jsonb_build_object('startingHp',hp,'damage',damage));
end;
$$;
create or replace function public.get_cli_duel_authoring(p_lab_id uuid default null,p_rematch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
begin
 if public.cli_duel_actor_role(auth.uid()) not in ('administrator','instructor') or public.cli_duel_actor_role(auth.uid()) is null then raise exception 'Host access is required.';end if;
 return public.cli_duel_authoring_context(auth.uid(),p_lab_id,p_rematch_id);
end;
$$;

create or replace function public.cli_duel_create(p_actor_id uuid,p_payload jsonb,p_source_fingerprint text,p_initial_state jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare ctx jsonb;def jsonb;errors jsonb;v_id uuid;pick jsonb;v_student uuid;v_class uuid;v_name text;v_class_name text;seen uuid[]:='{}';v_role text:=public.cli_duel_actor_role(p_actor_id);v_duration integer;
begin
 if v_role is null or v_role not in ('administrator','instructor') then raise exception 'Host access is required.';end if;
 if p_payload->>'labId' is not null then perform 1 from public.cli_labs where id=(p_payload->>'labId')::uuid for share;end if;
 ctx:=public.cli_duel_authoring_context(p_actor_id,(p_payload->>'labId')::uuid,(p_payload->>'rematchId')::uuid);def:=ctx->'definition';
 if p_payload->>'rulesVersion'='2' then def:=public.cli_duel_prepare_definition(def,p_payload->'customization',p_payload->'combat');end if;
 if ctx->>'fingerprint' is distinct from p_source_fingerprint then raise exception 'The source challenge changed. Reload it before creating the duel.';end if;
 errors:=public.cli_duel_definition_errors(def,p_initial_state);if errors<>'[]' then raise exception '%',errors->>0;end if;
 v_duration:=(p_payload->>'durationMinutes')::integer;
 if v_duration is null or v_duration not between 1 and 480 or (p_payload->>'durationMinutes')::numeric<>v_duration or nullif(btrim(p_payload->>'title'),'') is null or length(p_payload->>'title')>160 or jsonb_typeof(p_payload->'allowReview') is distinct from 'boolean' then raise exception 'Enter a title and a whole-minute time limit from 1 to 480.';end if;
 if jsonb_typeof(p_payload->'participantSelections') is distinct from 'array' or jsonb_array_length(p_payload->'participantSelections')<>2 then raise exception 'Select exactly two students.';end if;
 insert into public.cli_competitions(host_id,host_name,source_lab_id,rematch_of,title,duration_minutes,definition_snapshot,initial_state,maximum_points,allow_review,rules_version,starting_hp)
 values(p_actor_id,(select full_name from public.profiles where id=p_actor_id),(def->>'sourceLabId')::uuid,(p_payload->>'rematchId')::uuid,btrim(p_payload->>'title'),v_duration,def,p_initial_state,
 (public.cli_duel_grade(def,p_initial_state)->>'maximumPoints')::numeric,(p_payload->>'allowReview')::boolean,case when p_payload->>'rulesVersion'='2' then 2 else 1 end,coalesce((def->'combat'->>'startingHp')::numeric,100)) returning id into v_id;
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

create or replace function public.cli_duel_summary_v1(p_competition uuid,p_actor uuid)
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
create or replace function public.cli_duel_settle_v1(p_competition uuid)
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
create or replace function public.cli_duel_summary(p_competition uuid,p_actor uuid)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare s jsonb;c public.cli_competitions%rowtype;players jsonb;
begin
 s:=public.cli_duel_summary_v1(p_competition,p_actor);select * into c from public.cli_competitions where id=p_competition;
 s:=jsonb_set(s,'{competition}',s->'competition'||jsonb_build_object('rulesVersion',c.rules_version,'startingHp',c.starting_hp,'endReason',c.end_reason,'winnerParticipantId',c.winner_participant_id));
 if c.rules_version=2 then
  select jsonb_agg(value||jsonb_build_object('maximumHp',c.starting_hp,'hp',greatest(0,c.starting_hp-coalesce((select sum(h.damage) from public.cli_competition_objective_hits h join public.cli_competition_participants enemy on enemy.id=h.participant_id where enemy.competition_id=c.id and enemy.id<>(value->>'id')::uuid),0)))) into players from jsonb_array_elements(s->'participants');
  s:=jsonb_set(s,'{participants}',players);
 end if;
 return s;
end;
$$;
create or replace function public.cli_duel_settle(p_competition uuid)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
 perform public.cli_duel_settle_v1(p_competition);
 update public.cli_competitions c set end_reason=case when exists(select 1 from public.cli_competition_participants p where p.competition_id=c.id and (p.status='expired' or p.finished_at>=c.deadline)) then 'time_expired' else 'both_finished' end,completed_at=coalesce((select max(p.finished_at) from public.cli_competition_participants p where p.competition_id=c.id),c.completed_at) where c.id=p_competition and c.rules_version=2 and c.status='completed' and c.end_reason is null;
end;
$$;
create or replace function public.cli_duel_apply_damage(p_participant uuid,p_command uuid,p_at timestamptz,p_grading jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p public.cli_competition_participants%rowtype;enemy public.cli_competition_participants%rowtype;criterion jsonb;ordinal bigint;amount numeric;inserted integer;hp numeric;
begin
 select * into p from public.cli_competition_participants where id=p_participant;
 select * into c from public.cli_competitions where id=p.competition_id for update;
 if c.rules_version<>2 or c.status not in ('active','countdown') then return;end if;
 select * into enemy from public.cli_competition_participants where competition_id=c.id and id<>p.id for update;
 for criterion,ordinal in select value,ordinality from jsonb_array_elements(p_grading->'criteria') with ordinality loop
  if (criterion->>'met')::boolean then
   amount:=(c.definition_snapshot->'combat'->'damage'->>(ordinal-1)::integer)::numeric;
   insert into public.cli_competition_objective_hits(participant_id,objective_id,damage,command_id,earned_at) values(p.id,'objective-'||ordinal,amount,p_command,p_at) on conflict do nothing;
   get diagnostics inserted=row_count;
   if inserted>0 then perform public.cli_duel_bump(c.id,'objective_hit',p.student_id,p.id,jsonb_build_object('objectiveId','objective-'||ordinal,'damage',amount,'opponentParticipantId',enemy.id));end if;
  end if;
 end loop;
 select greatest(0,c.starting_hp-coalesce(sum(damage),0)) into hp from public.cli_competition_objective_hits where participant_id=p.id;
 if hp=0 then
  if clock_timestamp()>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
  perform public.cli_duel_seal(p.id,p_at,false);perform public.cli_duel_seal(enemy.id,p_at,false);
  update public.cli_competition_participants set placement=case when id=p.id then 1 else 2 end where competition_id=c.id;
  update public.cli_competitions set status='completed',completed_at=p_at,end_reason='knockout',winner_participant_id=p.id where id=c.id;
  perform public.cli_duel_bump(c.id,'knockout',p.student_id,p.id,jsonb_build_object('winnerParticipantId',p.id,'loserParticipantId',enemy.id));
 end if;
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
 perform 1 from public.active_assessment_sessions where student_id=p_actor_id and assessment_type='competition' and attempt_id=p.id and client_id=p_client_id and expires_at>clock_timestamp() for update;
 if not found then raise exception 'This browser no longer controls the assessment session.';end if;
 if not exists(select 1 from public.active_assessment_sessions where student_id=p_actor_id and assessment_type='competition' and attempt_id=p.id and client_id=p_client_id and expires_at>clock_timestamp()) then raise exception 'This browser no longer controls the assessment session.';end if;
 g:=public.cli_duel_grade(c.definition_snapshot,p_outcome->'state');
 v_clock:=clock_timestamp();if v_clock>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 insert into public.cli_competition_commands(participant_id,command_id,sequence,expected_revision,client_id,command,accepted,output,mode_before,mode_after,committed_at)
 values(p.id,p_command_id,p_sequence,p_expected_revision,p_client_id,p_command,(p_outcome->>'accepted')::boolean,left(coalesce(p_outcome->>'output',''),5000),p_outcome->>'modeBefore',p_outcome->>'modeAfter',v_clock);
 update public.cli_competition_participants set state=p_outcome->'state',revision=revision+1,score_points=(g->>'scorePoints')::numeric where id=p.id;
 update public.active_assessment_sessions set client_heartbeat_at=v_clock,updated_at=v_clock where student_id=p_actor_id and assessment_type='competition' and attempt_id=p.id and client_id=p_client_id;
 perform public.cli_duel_bump(c.id,'command',p_actor_id,p.id,jsonb_build_object('sequence',p_sequence,'scorePoints',g->'scorePoints','delta',(g->>'scorePoints')::numeric-p.score_points));
 if c.rules_version=2 and (p_outcome->>'accepted')::boolean then perform public.cli_duel_apply_damage(p.id,p_command_id,v_clock,g);end if;
 if c.rules_version=1 and (g->>'scorePoints')::numeric=c.maximum_points then perform public.cli_duel_seal(p.id,v_clock,false);end if;
 perform public.cli_duel_settle(c.id);
 result:=public.cli_duel_existing_command(p.id,p_actor_id,p_client_id,p_command_id,p_sequence,p_expected_revision,p_command);
 if clock_timestamp()>=c.deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 return result||jsonb_build_object('duplicate',false);
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
  update public.cli_competitions set status='cancelled',end_reason=case when rules_version=2 then 'cancelled' else end_reason end,winner_participant_id=null,cancel_reason=btrim(p_reason),allow_review=false,completed_at=v_clock where id=c.id;
 elsif p_action='void' and c.status='completed' then update public.cli_competitions set status='voided',end_reason=case when rules_version=2 then 'voided' else end_reason end,winner_participant_id=null,void_reason=btrim(p_reason),allow_review=false where id=c.id;
 else raise exception 'This action is not available for the current match status.';end if;
 perform public.cli_duel_bump(c.id,p_action,auth.uid(),null,jsonb_build_object('reason',btrim(p_reason)));return public.cli_duel_summary(c.id,auth.uid());
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
 'rulesVersion',c.rules_version,'endReason',c.end_reason,'winnerParticipantId',c.winner_participant_id,'combat',case when c.rules_version=2 then c.definition_snapshot->'combat' else null end,
 'criteria',case when c.rules_version=2 then (select jsonb_agg(value||jsonb_build_object('damage',c.definition_snapshot->'combat'->'damage'->(ordinality-1)::integer) order by ordinality) from jsonb_array_elements(g) with ordinality) else g end,'state',jsonb_build_object('devices',c.definition_snapshot->'devices'),
 'commands',coalesce((select jsonb_agg(jsonb_build_object('deviceId',c.definition_snapshot->'devices'->0->>'id','sequence',cmd.sequence,'command',cmd.command,'output',cmd.output,'accepted',cmd.accepted) order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]'),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.created_at,'actorId',case when host then e.actor_id else null end,'participantId',e.participant_id,'details',e.details) order by e.id) from public.cli_competition_events e where e.competition_id=c.id and (host or e.participant_id=p.id or e.kind in ('created','started','completed','knockout'))),'[]'));
end;
$$;
revoke all on function public.cli_duel_default_damage(jsonb,numeric),public.cli_duel_prepare_definition(jsonb,jsonb,jsonb),public.cli_duel_apply_damage(uuid,uuid,timestamptz,jsonb),public.cli_duel_summary_v1(uuid,uuid),public.cli_duel_settle_v1(uuid),public.cli_duel_summary(uuid,uuid),public.cli_duel_settle(uuid) from public,anon,authenticated,service_role;
revoke all on function public.get_cli_duel_authoring(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cli_duel_authoring(uuid,uuid) to authenticated;
-- Existing service-only create/commit ACLs are preserved by CREATE OR REPLACE.
commit;
