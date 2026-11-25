-- Disposable fixtures, rolled back by the caller. No hosted data.
do $$ declare pid uuid;actor uuid;cid uuid;host uuid;client text:='device:concurrency12345:tab:concurrency12345';full_data jsonb;delta jsonb;cursor bigint;before_revision bigint;lease_tuple text;begin
 select p.id,p.student_id,p.competition_id,c.host_id into pid,actor,cid,host from public.cli_competition_participants p join public.cli_competitions c on c.id=p.competition_id where c.rules_version=3 limit 1;
 if pid is null then raise exception 'Disposable full-builder fixture required';end if;
 update public.profiles set role='student' where id=actor;update public.profiles set role='admin' where id=host;update auth.users set banned_until=null where id in(actor,host);
 update public.cli_competitions set status='active',has_started=true,starts_at=clock_timestamp()-interval '1 minute',deadline=clock_timestamp()+interval '20 minutes' where id=cid;
 update public.cli_competition_participants set status='in_progress',qualifying_class_id=null where id=pid;
 insert into public.active_assessment_sessions(student_id,assessment_type,attempt_id,assessment_id,started_at,expires_at,client_id,client_heartbeat_at) values(actor,'competition',pid,cid,clock_timestamp(),clock_timestamp()+interval '20 minutes',client,clock_timestamp()) on conflict(student_id) do update set assessment_type='competition',attempt_id=pid,assessment_id=cid,expires_at=clock_timestamp()+interval '20 minutes',client_id=client,client_heartbeat_at=clock_timestamp();
 perform set_config('request.jwt.claim.sub',actor::text,true);
 full_data:=public.get_cli_duel_player(pid,client);cursor:=coalesce((select max((value->>'sequence')::bigint) from jsonb_array_elements(full_data->'ownCommands')),0);
 select ctid::text into lease_tuple from public.active_assessment_sessions where student_id=actor;
 delta:=public.get_cli_duel_player_updates(pid,client,cursor);
 if (select ctid::text from public.active_assessment_sessions where student_id=actor) is distinct from lease_tuple then raise exception 'Status reader wrote the session lease';end if;
 if jsonb_array_length(delta->'ownCommands')<>0 or (delta->>'commandsAfter')::bigint<>cursor or delta->'ownState' is distinct from full_data->'ownState' then raise exception 'Player cursor did not return only new commands';end if;
 if public.get_cli_duel_player(pid,client) is distinct from full_data then
  -- serverNow changes between reads, everything else must remain compatible.
  if ((public.get_cli_duel_player(pid,client)#-'{competition,remainingMs}')-'serverNow') is distinct from ((full_data#-'{competition,remainingMs}')-'serverNow') then raise exception 'Cursor leaked into legacy reader';end if;
 end if;
 begin perform public.get_cli_duel_player_updates(pid,'wrong-client',cursor);raise exception 'Wrong browser accepted';exception when raise_exception then if sqlerrm='Wrong browser accepted' then raise;end if;end;
 begin perform public.get_cli_duel_player_updates(pid,client,-1);raise exception 'Negative cursor accepted';exception when raise_exception then if sqlerrm='Negative cursor accepted' then raise;end if;end;
 if delta->'task' ? 'criteria' then raise exception 'Student answer key exposed';end if;
 select revision into before_revision from public.cli_competitions where id=cid;perform public.cli_duel_settle(cid);perform public.cli_duel_settle_for_actor(actor);
 if (select revision from public.cli_competitions where id=cid)<>before_revision then raise exception 'Healthy active read mutated game revision';end if;
 select ctid::text into lease_tuple from public.active_assessment_sessions where student_id=actor;
 perform public.set_cli_duel_arena_presence(pid,client,true);
 if (select ctid::text from public.active_assessment_sessions where student_id=actor) is distinct from lease_tuple then raise exception 'Presence wrote the session lease';end if;
 if not public.cli_duel_host_participant_present(pid) then raise exception 'Presence heartbeat lost';end if;
 perform set_config('request.jwt.claim.sub',host::text,true);
 full_data:=public.get_cli_duel_host_arena(cid);delta:=public.get_cli_duel_host_arena_updates(cid,jsonb_build_object(pid::text,cursor));
 if exists(select 1 from jsonb_array_elements(delta->'players') p cross join lateral jsonb_array_elements(p->'commands') cmd where p->>'id'=pid::text and (cmd->>'sequence')::bigint<=cursor) then raise exception 'Host cursor returned old commands';end if;
 if ((public.get_cli_duel_host_arena(cid)#-'{competition,remainingMs}')-'serverNow') is distinct from ((full_data#-'{competition,remainingMs}')-'serverNow') then raise exception 'Host cursor leaked into full reader';end if;
 begin perform public.get_cli_duel_host_arena_updates(cid,'[]');raise exception 'Invalid cursor map accepted';exception when raise_exception then if sqlerrm='Invalid cursor map accepted' then raise;end if;end;
 if has_function_privilege('authenticated','public.cli_duel_commit_operation_updates(uuid,jsonb,jsonb)','EXECUTE') or has_function_privilege('anon','public.get_cli_duel_player_updates(uuid,text,bigint)','EXECUTE') then raise exception 'Incremental API privileges too broad';end if;
 update public.cli_competitions set deadline=clock_timestamp()-interval '1 second' where id=cid;perform public.cli_duel_settle(cid);
 if (select status from public.cli_competitions where id=cid)<>'completed' then raise exception 'Fast path skipped deadline sealing';end if;
 raise notice 'PASS concurrent reader cursors, legacy compatibility, private access, presence and deadline sealing';
end $$;
