-- Route-aware topology verification: grade successful traceroute checks.

do $$
declare
  v_definition text;
  v_marker text := '      when ''config_saved'' then';
  v_case text := $case$
      when 'connectivity_traceroute' then
        exists (
          select 1
          from jsonb_array_elements_text(
            coalesce(
              public.cli_criterion_device_state(
                p_state,
                p_criterion
              )->'successfulTraceroutes',
              '[]'::jsonb
            )
          ) successful_trace(value)
          where trim(successful_trace.value) =
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
      'cli_criterion_is_met(jsonb, jsonb) must exist before migration 053';
  end if;

  if position('when ''connectivity_traceroute'' then' in v_definition) = 0 then
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

comment on function public.cli_criterion_is_met(jsonb, jsonb)
is 'Grades device-aware configuration, ping, and traceroute criteria from final CLI state.';
