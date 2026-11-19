-- Public interface names for in-game indicators. Expected values and criteria stay private.
begin;
create or replace function public.cli_duel_public_task(p_definition jsonb)
returns jsonb language sql immutable set search_path=pg_catalog as $$
 select (p_definition-'criteria')||jsonb_build_object('configuredPorts',coalesce((
  select jsonb_agg(jsonb_build_object('deviceId',device_id,'interface',port_name) order by device_id,port_name)
  from (
   select distinct device_id,public.canonical_cli_interface(port_name) port_name from (
    select coalesce(nullif(criterion->>'deviceId',''),p_definition->'devices'->0->>'id') device_id,criterion->>'target' port_name
    from jsonb_array_elements(coalesce(p_definition->'criteria','[]')) criterion where left(criterion->>'type',10)='interface_' or criterion->>'type'='etherchannel_member'
    union all
    select link->>'fromDeviceId',link->>'fromInterface' from jsonb_array_elements(coalesce(p_definition->'topology'->'links','[]')) link
    union all
    select link->>'toDeviceId',link->>'toInterface' from jsonb_array_elements(coalesce(p_definition->'topology'->'links','[]')) link
   ) targets where nullif(device_id,'') is not null and nullif(port_name,'') is not null
  ) ports
 ),'[]'));
$$;
revoke all on function public.cli_duel_public_task(jsonb) from public,anon,authenticated;

-- Preserve each reader's authorization, lifecycle gates, signature and permissions.
do $$ declare routine text;definition text;begin
 foreach routine in array array['cli_duel_player_data(uuid,uuid)','get_cli_duel_host_arena(uuid)'] loop
  select pg_get_functiondef(to_regprocedure('public.'||routine)) into definition;
  if definition is null then raise exception 'Apply earlier CLI Duel migrations before 083.';end if;
  if position('public.cli_duel_public_task(c.definition_snapshot)' in definition)=0 then
   if position($target$c.definition_snapshot-'criteria'$target$ in definition)=0 then raise exception 'Unexpected duel reader definition: %',routine;end if;
   execute replace(definition,$target$c.definition_snapshot-'criteria'$target$,'public.cli_duel_public_task(c.definition_snapshot)');
  end if;
 end loop;
end $$;
commit;
