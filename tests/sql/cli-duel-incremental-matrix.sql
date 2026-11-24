-- Execute in a rolled-back transaction against the current complete evaluator.
do $$ declare pid uuid;entry jsonb;criterion jsonb;d jsonb;base jsonb;changed jsonb;actual jsonb;expected jsonb;checked integer:=0;begin
 select id into pid from public.cli_competition_participants limit 1;
 update public.cli_competition_participants set status='in_progress' where id=pid;
 base:='{"deviceStates":{"s1":{"deviceType":"switch","hostname":"Campus","enableSecret":"Secret","servicePasswordEncryption":true,"bannerMotd":"Welcome","domainName":"campus.local","saved":true,"defaultGateway":"192.0.2.254","dnsServers":["192.0.2.53"],"ipRouting":true,"users":{"admin":{"secret":"Secret"}},"lines":{"console":{"password":"Secret","login":true,"transportInput":"ssh","loginLocal":true}},"vlans":{"10":{"name":"Students"}},"interfaces":{"GigabitEthernet0/1":{"switchportMode":"access","description":"Students","accessVlan":10,"voiceVlan":20,"trunkNativeVlan":30,"trunkAllowedVlans":[10,20],"encapsulationDot1q":100,"encapsulationNative":true,"shutdown":false,"ipAddress":"192.0.2.1","subnetMask":"255.255.255.0","ipAccessGroups":{"in":"10"},"natRole":"inside","spanningTreePortfast":true,"spanningTreeBpduguard":true}}}}}';
 for entry in select value from jsonb_array_elements('[
 ["hostname","","Campus"],["enable_secret","","Secret"],["password_encryption","",""],["banner_motd","","Welcome"],["domain_name","","campus.local"],["local_user","admin","Secret"],["config_saved","",""],["default_gateway","","192.0.2.254"],["pc_dns_servers","","192.0.2.53"],["ip_routing_enabled","",""],["vlan_exists","10",""],["vlan_name","10","Students"],
 ["line_password","console 0","Secret"],["line_login","console 0",""],["line_transport_input","console 0","ssh"],["line_login_local","console 0",""],
 ["interface_mode","g0/1","access"],["interface_description","g0/1","Students"],["interface_access_vlan","g0/1","10"],["interface_voice_vlan","g0/1","20"],["interface_trunk_native_vlan","g0/1","30"],["interface_trunk_allowed_vlans","g0/1","10,20"],["interface_dot1q","g0/1","100"],["interface_dot1q_native","g0/1","100"],["interface_enabled","g0/1",""],["interface_ip","g0/1","192.0.2.1 255.255.255.0"],["interface_acl","g0/1","10 in"],["interface_nat_role","g0/1","inside"],["interface_portfast","g0/1",""],["interface_bpduguard","g0/1",""]
 ]'::jsonb) loop
  criterion:=jsonb_build_object('deviceId','s1','type',entry->>0,'target',entry->>1,'expected',entry->>2,'points',1);
  d:=jsonb_build_object('version',3,'devices','[{"id":"s1"}]'::jsonb,'criteria',jsonb_build_array(criterion));
  update public.cli_competition_participants set state=base where id=pid;
  expected:=public.cli_duel_grade(d,base);
  if (expected->>'scorePoints')::numeric<>1 then raise exception 'Positive matrix fixture is not met: %',entry->>0;end if;
  actual:=cli_duel_private.grade_cached(pid,d,base);
  if actual is distinct from expected then raise exception 'Positive cache mismatch: %',entry->>0;end if;
  changed:=jsonb_set(base,'{deviceStates,s1,mode}','"global_config"');
  actual:=cli_duel_private.grade_cached(pid,d,changed);
  if actual is distinct from public.cli_duel_grade(d,changed) or (select reused from cli_duel_private.grade_cache where participant_id=pid)<>1 then raise exception 'Unrelated mode change invalidated criterion: %',entry->>0;end if;
  update public.cli_competition_participants set state=changed where id=pid;
  changed:='{"deviceStates":{"s1":{"deviceType":"switch"}}}';
  actual:=cli_duel_private.grade_cached(pid,d,changed);expected:=public.cli_duel_grade(d,changed);
  if actual is distinct from expected or (expected->>'scorePoints')::numeric<>0 then raise exception 'Cleared input mismatch: %',entry->>0;end if;
  update public.cli_competition_participants set state=changed where id=pid;
  actual:=cli_duel_private.grade_cached(pid,d,base);
  if actual is distinct from public.cli_duel_grade(d,base) then raise exception 'Restored input mismatch: %',entry->>0;end if;
  checked:=checked+1;
 end loop;
 if checked<>30 then raise exception 'Incomplete mapped criterion coverage.';end if;
 raise notice 'PASS positive/cleared/restored/unrelated-input matrix for all 30 cached criterion types.';
end $$;
