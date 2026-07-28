-- Phase 3: grade successful connectivity checks per topology device.

do $$
declare
  v_definition text;
  v_marker text := '      when ''config_saved'' then';
  v_case text := $case$
      when 'connectivity_ping' then
        exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(
              public.cli_criterion_device_state(
                p_state,
                p_criterion
              )->'successfulPings',
              '[]'::jsonb
            )
          ) successful_ping(value)
          where trim(successful_ping.value) =
            trim(p_criterion->>'expected')
        )

$case$;
begin
  select pg_get_functiondef(routine.oid)
  into v_definition
  from pg_proc routine
  join pg_namespace namespace
    on namespace.oid = routine.pronamespace
  where namespace.nspname = 'public'
    and routine.proname = 'cli_criterion_is_met'
    and routine.proargtypes = '3802 3802'::oidvector;

  if v_definition is null then
    raise exception
      'cli_criterion_is_met(jsonb, jsonb) must exist before migration 037';
  end if;
  if position('when ''connectivity_ping'' then' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception
        'Unable to locate the grading insertion point in cli_criterion_is_met';
    end if;
    v_definition := replace(
      v_definition,
      v_marker,
      v_case || v_marker
    );
    execute v_definition;
  end if;
end;
$$;

revoke all
on function public.cli_criterion_is_met(jsonb, jsonb)
from public;

