-- Reuse full practical configuration for version3 duels; keep v1/v2 records intact.
begin;
alter table public.cli_competitions drop constraint if exists cli_competitions_rules_version_check;
alter table public.cli_competitions add constraint cli_competitions_rules_version_check check(rules_version in(1,2,3));
alter table public.cli_competition_commands add column if not exists device_id text;
alter table public.cli_competition_commands add column if not exists request_metadata jsonb;
create or replace function public.cli_duel_full_applicable(p_type text,p_device text)
returns boolean language sql immutable security definer set search_path=pg_catalog as $$ select coalesce(('{"switch":["hostname","enable_secret","password_encryption","banner_motd","domain_name","local_user","line_password","line_login","line_transport_input","vlan_exists","vlan_name","interface_mode","interface_description","interface_access_vlan","interface_voice_vlan","interface_trunk_native_vlan","interface_trunk_allowed_vlans","interface_enabled","interface_ip","ip_routing_enabled","default_gateway","static_route","default_route","ospf_process","ospf_router_id","ospf_network","ospf_passive_interface","ospf_default_information","acl_exists","acl_entry","interface_acl","dhcp_pool_exists","dhcp_network","dhcp_default_router","dhcp_dns_server","dhcp_excluded_range","etherchannel_member","stp_mode","stp_vlan_priority","interface_portfast","interface_bpduguard","ssh_rsa_keys","ssh_version","line_login_local","connectivity_ping","connectivity_traceroute","connectivity_ssh","config_saved"],"router":["hostname","enable_secret","password_encryption","banner_motd","domain_name","local_user","line_password","line_login","line_transport_input","interface_description","interface_dot1q","interface_dot1q_native","interface_enabled","interface_ip","static_route","default_route","ospf_process","ospf_router_id","ospf_network","ospf_passive_interface","ospf_default_information","acl_exists","acl_entry","interface_acl","interface_nat_role","nat_pool","nat_static_mapping","nat_dynamic_rule","dhcp_pool_exists","dhcp_network","dhcp_default_router","dhcp_dns_server","dhcp_excluded_range","ssh_rsa_keys","ssh_version","line_login_local","connectivity_ping","connectivity_traceroute","connectivity_ssh","config_saved"],"pc":["interface_ip","default_gateway","connectivity_ping","connectivity_traceroute","connectivity_ssh","pc_dns_servers"]}'::jsonb->p_device)?p_type,false) $$;
create or replace function public.cli_duel_full_definition(p_configuration jsonb,p_combat jsonb,p_initial jsonb default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare def jsonb:=p_configuration;combat jsonb:=coalesce(p_combat,'{}');devices jsonb;criteria jsonb;device jsonb;criterion jsonb;link jsonb;other jsonb;prepared jsonb:='[]';links jsonb:='[]';seen text[]:='{}';ports text[]:='{}';ids text[]:='{}';identity text;target text;expected text;from_port text;to_port text;v_id text;v_course bigint;v_module uuid;points numeric;total numeric:=0;i integer:=0;hp numeric;damage jsonb;amount numeric;
begin
 if jsonb_typeof(def) is distinct from 'object' or jsonb_typeof(combat) is distinct from 'object' then raise exception 'Provide a configuration and combat settings.';end if;
 if exists(select 1 from jsonb_object_keys(def) key where key not in ('courseId','moduleId','title','description','instructions','devices','topology','durationMinutes','criteria')) or exists(select 1 from jsonb_object_keys(combat) key where key not in('startingHp','damage')) then raise exception 'Unexpected configuration fields.';end if;
 begin v_course:=(def->>'courseId')::bigint;v_module:=nullif(def->>'moduleId','')::uuid;exception when others then raise exception 'Choose a valid course and module.';end;
 if not exists(select 1 from public.courses where id=v_course and is_active) then raise exception 'Choose an active course.';end if;
 if v_module is not null and not exists(select 1 from public.modules where id=v_module and course_id=v_course) then raise exception 'The selected module does not belong to this course.';end if;
 if nullif(btrim(def->>'title'),'') is null or length(def->>'title')>160 or nullif(btrim(def->>'instructions'),'') is null or length(def->>'instructions')>32000 or length(coalesce(def->>'description',''))>4000 then raise exception 'Complete the title, description and instructions.';end if;
 if (def->>'durationMinutes')::numeric not between 1 and 480 or trunc((def->>'durationMinutes')::numeric)<>(def->>'durationMinutes')::numeric then raise exception 'Duration must be 1–480 whole minutes.';end if;
 devices:=def->'devices';criteria:=def->'criteria';
 if jsonb_typeof(devices) is distinct from 'array' then raise exception 'Provide devices.';end if;
 if jsonb_array_length(devices) not between 1 and 12 then raise exception 'Provide 1–12 devices.';end if;
 for device in select value from jsonb_array_elements(devices) loop
  if jsonb_typeof(device)<>'object' or exists(select 1 from jsonb_object_keys(device) key where key not in('id','label','hostname','type')) then raise exception 'Unexpected device fields.';end if;
  v_id:=device->>'id';
  if nullif(btrim(v_id),'') is null or length(v_id)>80 or nullif(btrim(device->>'label'),'') is null or length(device->>'label')>160 or device->>'hostname' !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' or device->>'hostname' is null or device->>'type' not in('switch','router','pc') or device->>'type' is null then raise exception 'Complete the device label, hostname and type.';end if;
  if lower(v_id)=any(ids) then raise exception 'Device IDs must be unique.';end if;ids:=array_append(ids,lower(v_id));
 end loop;
 if jsonb_typeof(def->'topology') is distinct from 'object' or exists(select 1 from jsonb_object_keys(def->'topology') key where key<>'links') or jsonb_typeof(def->'topology'->'links') is distinct from 'array' then raise exception 'Provide a valid topology.';end if;
 if jsonb_array_length(def->'topology'->'links')>128 then raise exception 'Provide at most128 physical links.';end if;
 i:=0;ids:='{}';
 for link in select value from jsonb_array_elements(def->'topology'->'links') loop
  i:=i+1;
  if jsonb_typeof(link)<>'object' or exists(select 1 from jsonb_object_keys(link) key where key not in('id','fromDeviceId','fromInterface','toDeviceId','toInterface')) then raise exception 'Unexpected physical link fields.';end if;
  select value into device from jsonb_array_elements(devices) where value->>'id'=link->>'fromDeviceId';select value into other from jsonb_array_elements(devices) where value->>'id'=link->>'toDeviceId';
  from_port:=public.canonical_cli_interface(link->>'fromInterface');to_port:=public.canonical_cli_interface(link->>'toInterface');
  if device is null or other is null or device->>'id'=other->>'id' or nullif(from_port,'') is null or nullif(to_port,'') is null then raise exception 'Each link needs two distinct devices and valid interfaces.';end if;
  if (device->>'type'='pc' and from_port<>'Ethernet0') or (other->>'type'='pc' and to_port<>'Ethernet0') then raise exception 'Connect PCs using Ethernet0.';end if;
  v_id:=coalesce(nullif(link->>'id',''),'link-'||i);
  if length(v_id)>100 or v_id=any(ids) then raise exception 'Physical link IDs must be unique.';end if;ids:=array_append(ids,v_id);
  foreach identity in array array[(device->>'id')||':'||from_port,(other->>'id')||':'||to_port] loop if identity=any(ports) then raise exception 'A device interface can have only one physical link.';end if;ports:=array_append(ports,identity);end loop;
  links:=links||jsonb_build_array(jsonb_build_object('id',v_id,'fromDeviceId',device->>'id','fromInterface',from_port,'toDeviceId',other->>'id','toInterface',to_port));
 end loop;
 if jsonb_typeof(criteria) is distinct from 'array' then raise exception 'Provide grading criteria.';end if;
 if jsonb_array_length(criteria) not between 1 and 128 then raise exception 'Provide 1–128 grading criteria.';end if;
 i:=0;
 for criterion in select value from jsonb_array_elements(criteria) loop
  i:=i+1;
  if jsonb_typeof(criterion)<>'object' or exists(select 1 from jsonb_object_keys(criterion) key where key not in('type','deviceId','target','expected','points','label')) then raise exception 'Unexpected criterion fields.';end if;
  select value into device from jsonb_array_elements(devices) where value->>'id'=coalesce(nullif(criterion->>'deviceId',''),devices->0->>'id');
  if device is null or not public.cli_duel_full_applicable(criterion->>'type',device->>'type') then raise exception 'Select an applicable requirement for the device.';end if;
  target:=coalesce(criterion->>'target','');expected:=coalesce(criterion->>'expected','');
  if length(target)>450 or length(expected)>450 or expected<>btrim(regexp_replace(expected,'\s+',' ','g')) then raise exception 'Enter canonical target/expected text using single spaces.';end if;
  if criterion->>'type' not in('hostname','enable_secret','password_encryption','banner_motd','domain_name','ip_routing_enabled','default_gateway','default_route','stp_mode','ssh_rsa_keys','ssh_version','connectivity_ping','connectivity_traceroute','connectivity_ssh','pc_dns_servers','config_saved') and nullif(btrim(target),'') is null then raise exception 'Complete every required criterion target.';end if;
  if criterion->>'type' not in('password_encryption','line_login','vlan_exists','interface_enabled','ip_routing_enabled','ospf_process','ospf_default_information','acl_exists','dhcp_pool_exists','interface_portfast','interface_bpduguard','line_login_local','config_saved') and nullif(btrim(expected),'') is null then raise exception 'Complete every required expected value.';end if;
  if jsonb_typeof(criterion->'points') is distinct from 'number' then raise exception 'Criterion points must be positive numbers.';end if;
  points:=(criterion->>'points')::numeric;if points<=0 or points::text in('NaN','Infinity','-Infinity') then raise exception 'Criterion points must be positive finite numbers.';end if;total:=total+points;
  if criterion->>'type'='interface_ip' then
   begin
    if array_length(string_to_array(expected,' '),1)<>2 or family(split_part(expected,' ',1)::inet)<>4 or family(split_part(expected,' ',2)::inet)<>4 or host(split_part(expected,' ',1)::inet)<>split_part(expected,' ',1) then raise exception 'Invalid IP';end if;
    if split_part(expected,' ',2) not in ('0.0.0.0','128.0.0.0','192.0.0.0','224.0.0.0','240.0.0.0','248.0.0.0','252.0.0.0','254.0.0.0','255.0.0.0','255.128.0.0','255.192.0.0','255.224.0.0','255.240.0.0','255.248.0.0','255.252.0.0','255.254.0.0','255.255.0.0','255.255.128.0','255.255.192.0','255.255.224.0','255.255.240.0','255.255.248.0','255.255.252.0','255.255.254.0','255.255.255.0','255.255.255.128','255.255.255.192','255.255.255.224','255.255.255.240','255.255.255.248','255.255.255.252','255.255.255.254','255.255.255.255') then raise exception 'Invalid mask';end if;
   exception when others then raise exception 'Enter a valid IP address and subnet mask.';end;
  end if;
  if (criterion->>'type' like 'line_%' and nullif(public.canonical_cli_line(target),'') is null) or (criterion->>'type'='interface_mode' and expected not in('access','trunk')) or (criterion->>'type'='interface_access_vlan' and not(case when expected ~ '^[1-9][0-9]{0,3}$' then expected::integer<=4094 else false end)) or (criterion->>'type' like 'vlan_%' and not(case when target ~ '^[1-9][0-9]{0,3}$' then target::integer<=4094 else false end)) then raise exception 'An objective has an unattainable target or expected value.';end if;
  identity:=device->>'id'||':'||(criterion->>'type')||':'||case when criterion->>'type' in('hostname','enable_secret','password_encryption','banner_motd','domain_name','ip_routing_enabled','default_gateway','default_route','stp_mode','ssh_rsa_keys','ssh_version','connectivity_ping','connectivity_traceroute','connectivity_ssh','pc_dns_servers','config_saved') then '' when criterion->>'type' like 'interface_%' then public.canonical_cli_interface(target) when criterion->>'type' like 'line_%' then public.canonical_cli_line(target) else lower(btrim(regexp_replace(target,'\s+',' ','g'))) end;
  identity:=identity||':'||case when criterion->>'type' in('acl_entry','ospf_network','ospf_passive_interface','static_route','default_route','nat_dynamic_rule','nat_static_mapping','dhcp_excluded_range','connectivity_ping','connectivity_traceroute','connectivity_ssh') then lower(regexp_replace(regexp_replace(expected,'\mg([0-9])','gigabitethernet\1','gi'),'\mf([0-9])','fastethernet\1','gi')) when criterion->>'type'='interface_acl' then lower(regexp_replace(expected,'^.* ','')) else '' end;
  if identity=any(seen) then raise exception 'Remove duplicate or conflicting device criteria.';end if;seen:=array_append(seen,identity);
  if criterion->>'type'='hostname' and expected !~ '^[A-Za-z0-9][A-Za-z0-9-]{0,62}$' then raise exception 'Enter a valid expected hostname.';end if;
  prepared:=prepared||jsonb_build_array(jsonb_build_object('type',criterion->>'type','deviceId',device->>'id','target',target,'expected',expected,'points',points,'label',coalesce(criterion->>'label',''),'objectiveId','objective-'||i));
 end loop;
 if total>9007199254740991 then raise exception 'The total criterion points are too large.';end if;
 hp:=coalesce((combat->>'startingHp')::numeric,100);if hp not between 1 and 10000 or trunc(hp)<>hp then raise exception 'Starting HP must be 1–10000 whole points.';end if;
 damage:=coalesce(combat->'damage',public.cli_duel_default_damage(prepared,hp));
 if jsonb_typeof(damage) is distinct from 'array' or jsonb_array_length(damage)<>i then raise exception 'Provide damage for each criterion.';end if;
 total:=0;for criterion in select value from jsonb_array_elements(damage) loop if jsonb_typeof(criterion)<>'number' then raise exception 'Damage must be numeric.';end if;amount:=criterion::text::numeric;if amount not between 0 and 10000 or round(amount,2)<>amount then raise exception 'Damage must be 0–10000 with at most two decimals.';end if;total:=total+amount;end loop;
 if total<hp then raise exception 'Total criterion damage must reach starting HP.';end if;
 def:=jsonb_set(jsonb_set(jsonb_set(jsonb_set(def,'{version}','3'),'{criteria}',prepared),'{topology}',jsonb_build_object('links',links)),'{combat}',jsonb_build_object('startingHp',hp,'damage',damage));
 def:=jsonb_set(jsonb_set(def,'{courseId}',to_jsonb(v_course)),'{moduleId}',coalesce(to_jsonb(v_module),'null'::jsonb));
 if p_initial is not null then
  if jsonb_typeof(p_initial->'deviceStates') is distinct from 'object' or (select count(*) from jsonb_object_keys(p_initial->'deviceStates'))<>jsonb_array_length(devices) then raise exception 'The trusted initial device state is incomplete.';end if;
  for device in select value from jsonb_array_elements(devices) loop
   other:=p_initial->'deviceStates'->(device->>'id');if other->>'hostname' is distinct from device->>'hostname' or other->>'deviceType' is distinct from device->>'type' or other->>'mode' is distinct from 'user_exec' or other->>'saved' is distinct from 'false' then raise exception 'Starting device states must be generic and unsaved.';end if;
  end loop;
  if (public.cli_duel_grade(def,p_initial)->>'scorePoints')::numeric<>0 then raise exception 'Some objectives are already completed in the starting configuration.';end if;
 end if;
 return def;
end;
$$;

create or replace function public.cli_duel_configuration_context(p_actor_id uuid,p_lab_id uuid default null,p_rematch_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog as $$
declare def jsonb;l public.cli_labs%rowtype;role_name text:=public.cli_duel_actor_role(p_actor_id);
begin
 if role_name is null or role_name not in('instructor','administrator') then raise exception 'Host access is required.';end if;
 if p_lab_id is not null and p_rematch_id is not null then raise exception 'Choose one source configuration.';end if;
 if p_rematch_id is not null then
  perform public.cli_duel_require_access(p_actor_id,p_rematch_id,true);select definition_snapshot into def from public.cli_competitions where id=p_rematch_id;
  if def->>'courseId' is null then select * into l from public.cli_labs where id=(def->>'sourceLabId')::uuid;def:=def||jsonb_build_object('courseId',l.course_id,'moduleId',l.module_id);end if;
 elsif p_lab_id is not null then
  select * into l from public.cli_labs where id=p_lab_id and status::text<>'archived' and (created_by=p_actor_id or role_name='administrator');if not found then raise exception 'This practical cannot be used by this host.';end if;
  def:=jsonb_build_object('courseId',l.course_id,'moduleId',l.module_id,'title',l.title,'description',coalesce(l.description,''),'instructions',l.instructions,'durationMinutes',l.duration_minutes,'devices',coalesce(nullif(l.devices,'[]'),jsonb_build_array(jsonb_build_object('id','device-1','label',l.initial_hostname,'hostname',l.initial_hostname,'type',l.device_type))),'topology',coalesce(l.topology,'{"links":[]}'),'criteria',l.grading_criteria,'sourceLabId',l.id);
 else
  def:='{"version":3,"courseId":null,"moduleId":null,"title":"","description":"","instructions":"","durationMinutes":30,"devices":[{"id":"device-1","label":"","hostname":"","type":"switch"}],"topology":{"links":[]},"criteria":[{"type":"hostname","deviceId":"device-1","target":"","expected":"","points":10}]}'::jsonb;
 end if;
 return jsonb_build_object('definition',def,'fingerprint',md5(def::text));
end;
$$;
create or replace function public.get_cli_duel_configuration(p_lab_id uuid default null,p_rematch_id uuid default null)
returns jsonb language sql stable security definer set search_path=pg_catalog as $$ select public.cli_duel_configuration_context(auth.uid(),p_lab_id,p_rematch_id) $$;

create or replace function public.cli_duel_create(p_actor_id uuid,p_payload jsonb,p_source_fingerprint text,p_initial_state jsonb)
returns uuid language plpgsql security definer set search_path=pg_catalog as $$
declare ctx jsonb;def jsonb;errors jsonb;v_id uuid;pick jsonb;v_student uuid;v_class uuid;v_name text;v_class_name text;seen uuid[]:='{}';v_role text:=public.cli_duel_actor_role(p_actor_id);v_duration integer;
begin
 if v_role is null or v_role not in ('administrator','instructor') then raise exception 'Host access is required.';end if;
 if p_payload->>'labId' is not null then perform 1 from public.cli_labs where id=(p_payload->>'labId')::uuid for share;end if;
 if p_payload->>'rulesVersion'='3' then ctx:=public.cli_duel_configuration_context(p_actor_id,(p_payload->>'labId')::uuid,(p_payload->>'rematchId')::uuid);def:=public.cli_duel_full_definition(p_payload->'configuration',p_payload->'combat',p_initial_state);def:=def||jsonb_build_object('sourceLabId',ctx->'definition'->'sourceLabId');else
 ctx:=public.cli_duel_authoring_context(p_actor_id,(p_payload->>'labId')::uuid,(p_payload->>'rematchId')::uuid);def:=ctx->'definition';
 end if;
 if p_payload->>'rulesVersion'='2' then def:=public.cli_duel_prepare_definition(def,p_payload->'customization',p_payload->'combat');end if;
 if ctx->>'fingerprint' is distinct from p_source_fingerprint then raise exception 'The source challenge changed. Reload it before creating the duel.';end if;
 if p_payload->>'rulesVersion'<>'3' then errors:=public.cli_duel_definition_errors(def,p_initial_state);if errors<>'[]' then raise exception '%',errors->>0;end if;end if;
 if p_payload->>'rulesVersion'='3' and (p_payload->>'title' is distinct from def->>'title' or (p_payload->>'durationMinutes')::numeric is distinct from (def->>'durationMinutes')::numeric) then raise exception 'Match metadata must match the configuration.';end if;
 v_duration:=(p_payload->>'durationMinutes')::integer;
 if v_duration is null or v_duration not between 1 and 480 or (p_payload->>'durationMinutes')::numeric<>v_duration or nullif(btrim(p_payload->>'title'),'') is null or length(p_payload->>'title')>160 or jsonb_typeof(p_payload->'allowReview') is distinct from 'boolean' then raise exception 'Enter a title and a whole-minute time limit from 1 to 480.';end if;
 if jsonb_typeof(p_payload->'participantSelections') is distinct from 'array' or jsonb_array_length(p_payload->'participantSelections')<>2 then raise exception 'Select exactly two students.';end if;
 insert into public.cli_competitions(host_id,host_name,source_lab_id,rematch_of,title,duration_minutes,definition_snapshot,initial_state,maximum_points,allow_review,rules_version,starting_hp)
 values(p_actor_id,(select full_name from public.profiles where id=p_actor_id),(def->>'sourceLabId')::uuid,(p_payload->>'rematchId')::uuid,btrim(p_payload->>'title'),v_duration,def,p_initial_state,
 (public.cli_duel_grade(def,p_initial_state)->>'maximumPoints')::numeric,(p_payload->>'allowReview')::boolean,case when p_payload->>'rulesVersion'='3' then 3 when p_payload->>'rulesVersion'='2' then 2 else 1 end,coalesce((def->'combat'->>'startingHp')::numeric,100)) returning id into v_id;
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
declare s jsonb;c public.cli_competitions%rowtype;players jsonb;
begin
 s:=public.cli_duel_summary_v1(p_competition,p_actor);select * into c from public.cli_competitions where id=p_competition;
 s:=jsonb_set(s,'{competition}',s->'competition'||jsonb_build_object('rulesVersion',c.rules_version,'startingHp',c.starting_hp,'endReason',c.end_reason,'winnerParticipantId',c.winner_participant_id));
 if c.rules_version>=2 then
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
 update public.cli_competitions c set end_reason=case when exists(select 1 from public.cli_competition_participants p where p.competition_id=c.id and (p.status='expired' or p.finished_at>=c.deadline)) then 'time_expired' else 'both_finished' end,completed_at=coalesce((select max(p.finished_at) from public.cli_competition_participants p where p.competition_id=c.id),c.completed_at) where c.id=p_competition and c.rules_version>=2 and c.status='completed' and c.end_reason is null;
end;
$$;
create or replace function public.cli_duel_apply_damage(p_participant uuid,p_command uuid,p_at timestamptz,p_grading jsonb)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p public.cli_competition_participants%rowtype;enemy public.cli_competition_participants%rowtype;criterion jsonb;ordinal bigint;amount numeric;inserted integer;hp numeric;
begin
 select * into p from public.cli_competition_participants where id=p_participant;
 select * into c from public.cli_competitions where id=p.competition_id for update;
 if c.rules_version<2 or c.status not in ('active','countdown') then return;end if;
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
 if c.rules_version>=2 and (p_outcome->>'accepted')::boolean then perform public.cli_duel_apply_damage(p.id,p_command_id,v_clock,g);end if;
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
  update public.cli_competitions set status='cancelled',end_reason=case when rules_version>=2 then 'cancelled' else end_reason end,winner_participant_id=null,cancel_reason=btrim(p_reason),allow_review=false,completed_at=v_clock where id=c.id;
 elsif p_action='void' and c.status='completed' then update public.cli_competitions set status='voided',end_reason=case when rules_version>=2 then 'voided' else end_reason end,winner_participant_id=null,void_reason=btrim(p_reason),allow_review=false where id=c.id;
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
 'rulesVersion',c.rules_version,'endReason',c.end_reason,'winnerParticipantId',c.winner_participant_id,'combat',case when c.rules_version>=2 then c.definition_snapshot->'combat' else null end,
 'criteria',case when c.rules_version>=2 then (select jsonb_agg(value||jsonb_build_object('damage',c.definition_snapshot->'combat'->'damage'->(ordinality-1)::integer) order by ordinality) from jsonb_array_elements(g) with ordinality) else g end,'state',jsonb_build_object('devices',c.definition_snapshot->'devices'),
 'commands',coalesce((select jsonb_agg(jsonb_build_object('deviceId',coalesce(cmd.device_id,c.definition_snapshot->'devices'->0->>'id'),'sequence',cmd.sequence,'command',cmd.command,'output',cmd.output,'accepted',cmd.accepted) order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]'),
 'timeline',coalesce((select jsonb_agg(jsonb_build_object('kind',e.kind,'at',e.created_at,'actorId',case when host then e.actor_id else null end,'participantId',e.participant_id,'details',e.details) order by e.id) from public.cli_competition_events e where e.competition_id=c.id and (host or e.participant_id=p.id or e.kind in ('created','started','completed','knockout'))),'[]'));
end;
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
 'ownCommands',case when playing then coalesce((select jsonb_agg(jsonb_build_object('sequence',cmd.sequence,'command',cmd.command,'accepted',cmd.accepted,'output',cmd.output,'deviceId',coalesce(cmd.device_id,c.definition_snapshot->'devices'->0->>'id')) order by cmd.sequence) from public.cli_competition_commands cmd where cmd.participant_id=p.id),'[]') else '[]'::jsonb end,
 'revision',p.revision,'matchRevision',c.revision,'serverNow',clock_timestamp());
end;
$$;

create or replace function public.cli_duel_operation_command(p_request jsonb)
returns text language sql immutable security definer set search_path=pg_catalog as $$ select case p_request->'operation'->>'type' when 'command' then p_request->'operation'->>'command' when 'pc_dhcp' then 'Obtained IPv4 settings through DHCP' when 'pc_configure' then 'Applied static IPv4 settings' else null end $$;
create or replace function public.cli_duel_operation_context(p_actor_id uuid,p_request jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare p public.cli_competition_participants%rowtype;c public.cli_competitions%rowtype;ctx jsonb;device jsonb;previous jsonb;command text;
begin
 if jsonb_typeof(p_request) is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_request) key where key not in('action','participantId','clientId','commandId','sequence','expectedRevision','deviceId','operation')) then raise exception 'Unexpected device operation fields.';end if;
 select * into p from public.cli_competition_participants where id=(p_request->>'participantId')::uuid and student_id=p_actor_id;if not found then raise exception 'Participant access is required.';end if;
 perform public.cli_duel_require_access(p_actor_id,p.competition_id);select * into c from public.cli_competitions where id=p.competition_id;
 if c.rules_version<>3 then raise exception 'This attempt does not support full device operations.';end if;
 select value into device from jsonb_array_elements(c.definition_snapshot->'devices') where value->>'id'=p_request->>'deviceId';if not found then raise exception 'The selected device is unavailable.';end if;
 if p_request->>'action'<>'operation' or jsonb_typeof(p_request->'operation') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_request->'operation') key where key not in('type','command','settings')) then raise exception 'Invalid device operation.';end if;
 if p_request->'operation'->>'type' not in('command','pc_configure','pc_dhcp') or p_request->'operation'->>'type' is null then raise exception 'Unknown device operation.';end if;
 if p_request->'operation'->>'type' in('pc_configure','pc_dhcp') and device->>'type'<>'pc' then raise exception 'PC settings require a PC device.';end if;
 if p_request->'operation'->>'type'='pc_configure' and (jsonb_typeof(p_request->'operation'->'settings') is distinct from 'object' or exists(select 1 from jsonb_object_keys(p_request->'operation'->'settings') key where key not in('ipAddress','subnetMask','defaultGateway','preferredDns','alternateDns'))) then raise exception 'Unexpected PC settings.';end if;
 command:=public.cli_duel_operation_command(p_request);
 if nullif(btrim(command),'') is null or length(command)>500 or command ~ '[[:cntrl:]]' then raise exception 'Enter a valid single device command.';end if;
 ctx:=public.cli_duel_command_context(p_actor_id,p.id,p_request->>'clientId',(p_request->>'commandId')::uuid,(p_request->>'sequence')::bigint,(p_request->>'expectedRevision')::bigint,command);
 if ctx ? 'duplicateResult' then
  select request_metadata into previous from public.cli_competition_commands where participant_id=p.id and command_id=(p_request->>'commandId')::uuid;
  if previous is distinct from p_request then raise exception 'A command ID cannot be reused with different device or operation content.';end if;
 end if;
 return ctx;
end;
$$;
create or replace function public.cli_duel_commit_operation(p_actor_id uuid,p_request jsonb,p_outcome jsonb)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare ctx jsonb;result jsonb;command text;deadline timestamptz;
begin
 ctx:=public.cli_duel_operation_context(p_actor_id,p_request);if ctx ? 'duplicateResult' then return ctx->'duplicateResult';end if;
 command:=public.cli_duel_operation_command(p_request);
 result:=public.cli_duel_commit_command(p_actor_id,(p_request->>'participantId')::uuid,p_request->>'clientId',(p_request->>'commandId')::uuid,(p_request->>'sequence')::bigint,(p_request->>'expectedRevision')::bigint,command,p_outcome);
 update public.cli_competition_commands set device_id=p_request->>'deviceId',request_metadata=p_request where participant_id=(p_request->>'participantId')::uuid and command_id=(p_request->>'commandId')::uuid;
 select c.deadline into deadline from public.cli_competitions c join public.cli_competition_participants p on p.competition_id=c.id where p.id=(p_request->>'participantId')::uuid;
 if clock_timestamp()>=deadline then raise exception 'Ranked input is closed at the deadline.';end if;
 return public.cli_duel_existing_command((p_request->>'participantId')::uuid,p_actor_id,p_request->>'clientId',(p_request->>'commandId')::uuid,(p_request->>'sequence')::bigint,(p_request->>'expectedRevision')::bigint,command)||jsonb_build_object('duplicate',false);
end;
$$;
create or replace function public.get_cli_duel_workspace()
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare actor uuid:=auth.uid();v_role text:=public.cli_duel_actor_role(auth.uid());candidates jsonb:='[]';labs jsonb:='[]';v_lab record;def jsonb;
begin
 if v_role is null or v_role not in ('student','instructor','administrator') then raise exception 'Competition access is required.';end if;
 perform public.cli_duel_settle_for_actor(actor);
 if v_role in ('instructor','administrator') then
  for v_lab in select id from public.cli_labs where status::text<>'archived' and (created_by=actor or v_role='administrator') order by title loop
   def:=(public.cli_duel_configuration_context(actor,v_lab.id,null))->'definition';labs:=labs||jsonb_build_array(jsonb_build_object('id',v_lab.id,'title',def->>'title','durationMinutes',def->'durationMinutes','errors','[]'::jsonb));
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

revoke all on function public.cli_duel_full_applicable(text,text),public.cli_duel_full_definition(jsonb,jsonb,jsonb),public.cli_duel_configuration_context(uuid,uuid,uuid),public.cli_duel_operation_command(jsonb),public.cli_duel_operation_context(uuid,jsonb),public.cli_duel_commit_operation(uuid,jsonb,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.cli_duel_configuration_context(uuid,uuid,uuid),public.cli_duel_operation_context(uuid,jsonb),public.cli_duel_commit_operation(uuid,jsonb,jsonb) to service_role;
revoke all on function public.get_cli_duel_configuration(uuid,uuid) from public,anon,authenticated;
grant execute on function public.get_cli_duel_configuration(uuid,uuid) to authenticated;
commit;
