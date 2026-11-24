-- Disposable fixtures only; execute within a rolled-back test transaction.
do $$
declare d jsonb;s jsonb;pid uuid;other_pid uuid;actual jsonb;expected jsonb;step integer;signature text;checks integer;reused integer;
begin
 select id into pid from public.cli_competition_participants where status='in_progress' limit 1;
 if pid is null then select id into pid from public.cli_competition_participants limit 1;update public.cli_competition_participants set status='in_progress' where id=pid;end if;
 if pid is null then raise exception 'A disposable participant fixture is required.';end if;
 d:='{"version":3,"devices":[{"id":"s1"},{"id":"s2"}],"criteria":[{"deviceId":"s1","type":"hostname","expected":"Campus","points":10},{"deviceId":"s1","type":"interface_description","target":"g0/1","expected":"Students","points":5},{"deviceId":"s1","type":"interface_enabled","target":"g0/1","points":5},{"deviceId":"s2","type":"hostname","expected":"Remote","points":10},{"deviceId":"s1","type":"config_saved","points":5},{"deviceId":"s1","type":"unknown_future_requirement","points":1},{"deviceId":"s1","type":"vlan_exists","target":"10","points":5}]}';
 s:='{"deviceStates":{"s1":{"deviceType":"switch","hostname":"Switch","interfaces":{},"saved":false},"s2":{"deviceType":"switch","hostname":"Other","interfaces":{}}}}';
 -- All participant/cache mutations in this contract are rolled back by the runner.
 for step in 1..12 loop
  update public.cli_competition_participants set state=s where id=pid;
  if step=2 then s:=jsonb_set(s,'{deviceStates,s1,hostname}','"Campus"');end if;
  if step=3 then s:=jsonb_set(s,'{deviceStates,s1,interfaces}','{"GigabitEthernet0/1":{"description":"Students","shutdown":false}}');end if;
  if step=4 then s:=jsonb_set(s,'{deviceStates,s2,hostname}','"Remote"');end if;
  if step=5 then s:=jsonb_set(s,'{deviceStates,s1,hostname}','"campus"');end if;
  if step=6 then s:=jsonb_set(s,'{deviceStates,s1,interfaces,GigabitEthernet0/1,shutdown}','true');end if;
  if step=7 then s:=jsonb_set(s,'{deviceStates,s1,saved}','true');end if;
  if step=8 then d:=jsonb_set(d,'{criteria,0,expected}','"campus"');end if;
  if step=9 then s:=jsonb_set(s,'{deviceStates,s1,vlans}','{"10":null}');end if;
  if step=10 then s:=jsonb_set(s,'{deviceStates,s1,vlans}','{"10":{"name":"Students"}}');end if;
  if step=11 then s:=jsonb_set(s,'{deviceStates,s1,vlans}','{}');end if;
  if step=12 then s:=jsonb_set(s,'{deviceStates,s1,vlans}','{"10":null}');end if;
  actual:=cli_duel_private.grade_cached(pid,d,s);expected:=public.cli_duel_grade(d,s);
  if actual is distinct from expected then raise exception 'Lookup/full mismatch at step %',step;end if;
  select c.evaluated,c.reused into checks,reused from cli_duel_private.grade_cache c where participant_id=pid;
  if step in(2,9) and (checks<>2 or reused<>5) then raise exception 'Lookup did not isolate changed and fallback criteria at step %',step;end if;
  if step=8 and checks<>7 then raise exception 'Changed definition did not invalidate the cache.';end if;
 end loop;
 s:=jsonb_set(s,'{deviceStates,s1,hostname}','"ServerRepair"');update public.cli_competition_participants set state=s where id=pid;
 actual:=cli_duel_private.grade_cached(pid,d,s);
 if actual is distinct from public.cli_duel_grade(d,s) or (select evaluated from cli_duel_private.grade_cache where participant_id=pid)<>7 then raise exception 'Changed confirmed state did not trigger full reevaluation.';end if;
 update cli_duel_private.grade_cache set updated_at=clock_timestamp()-interval '31 minutes' where participant_id=pid;
 actual:=cli_duel_private.grade_cached(pid,d,s);
 if actual is distinct from public.cli_duel_grade(d,s) or (select evaluated from cli_duel_private.grade_cache where participant_id=pid)<>7 then raise exception 'Expired cache was reused.';end if;
 update cli_duel_private.grading_settings set algorithm_version=99;
 actual:=cli_duel_private.grade_cached(pid,d,s);
 if actual is distinct from public.cli_duel_grade(d,s) or exists(select 1 from cli_duel_private.grade_cache where participant_id=pid) then raise exception 'Algorithm mismatch did not fall back to full grading.';end if;
 update cli_duel_private.grading_settings set algorithm_version=1;
 signature:=pg_get_functiondef('public.cli_criterion_is_met(jsonb,jsonb)'::regprocedure);
 if position('AS $function$' in signature)=0 then raise exception 'Unexpected evaluator fixture definition.';end if;
 execute replace(signature,'AS $function$',E'AS $function$\n-- evaluator invalidation fixture\n');
 actual:=cli_duel_private.grade_cached(pid,d,s);
 if actual is distinct from public.cli_duel_grade(d,s) or exists(select 1 from cli_duel_private.grade_cache where participant_id=pid) then raise exception 'Changed evaluator did not fall back to full grading.';end if;
 execute signature;
 actual:=cli_duel_private.grade_cached(pid,d,s);
 select id into other_pid from public.cli_competition_participants where id<>pid limit 1;
 if other_pid is not null then
  insert into cli_duel_private.grade_cache select other_pid,c.algorithm_version,c.grader_fingerprint,c.definition,c.state,c.grading,c.inputs,c.evaluated,c.reused,clock_timestamp()-interval '2 days' from cli_duel_private.grade_cache c where c.participant_id=pid on conflict(participant_id) do update set updated_at=excluded.updated_at;
  update cli_duel_private.grade_cache set updated_at=clock_timestamp()-interval '31 minutes' where participant_id=pid;
  actual:=cli_duel_private.grade_cached(pid,d,s);
  if exists(select 1 from cli_duel_private.grade_cache where participant_id=other_pid) then raise exception 'Expired orphan cache was not pruned.';end if;
 end if;
 update public.cli_competition_participants set status='submitted' where id=pid;
 if exists(select 1 from cli_duel_private.grade_cache where participant_id=pid) then raise exception 'Submitted attempt cache was retained.';end if;
 update public.cli_competition_participants set status='in_progress' where id=pid;
 actual:=cli_duel_private.grade_cached(pid,d,s);
 update public.cli_competitions set status=case when status='cancelled' then 'voided' else 'cancelled' end where id=(select competition_id from public.cli_competition_participants where id=pid);
 if exists(select 1 from cli_duel_private.grade_cache where participant_id=pid) then raise exception 'Ended match cache was retained.';end if;
 if has_schema_privilege('authenticated','cli_duel_private','USAGE') or has_function_privilege('authenticated','cli_duel_private.grade_cached(uuid,jsonb,jsonb)','EXECUTE') then raise exception 'Private cache/evaluator is exposed.';end if;
 select pg_get_functiondef('public.cli_duel_seal(uuid,timestamp with time zone,boolean)'::regprocedure) into signature;
 if position('cli_duel_private.grade_cached' in signature)>0 then raise exception 'Final grading must remain full.';end if;
 raise notice 'PASS incremental/full parity, field lookup, versions, evaluator fallback, stale state/age, cleanup, final full grading and privacy.';
end $$;
