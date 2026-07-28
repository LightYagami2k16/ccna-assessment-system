-- Phase 2: DHCP, EtherChannel, Spanning Tree, and SSH grading.
-- NTP and Syslog are intentionally outside this phase.

do $$
declare
  v_definition text;
  v_marker text := '      when ''config_saved'' then';
  v_cases text := $cases$
      when 'dhcp_pool_exists' then
        coalesce(p_state->'dhcpPools', '{}'::jsonb)
          ? upper(trim(p_criterion->>'target'))

      when 'dhcp_network' then
        regexp_replace(
          trim(
            concat(
              p_state #>>
              array[
                'dhcpPools',
                upper(trim(p_criterion->>'target')),
                'network'
              ],
              ' ',
              p_state #>>
              array[
                'dhcpPools',
                upper(trim(p_criterion->>'target')),
                'subnetMask'
              ]
            )
          ),
          '\s+',
          ' ',
          'g'
        ) = regexp_replace(
          trim(p_criterion->>'expected'),
          '\s+',
          ' ',
          'g'
        )

      when 'dhcp_default_router' then
        coalesce(
          (
            select string_agg(value, ' ' order by ordinal)
            from jsonb_array_elements_text(
              coalesce(
                p_state #>
                array[
                  'dhcpPools',
                  upper(trim(p_criterion->>'target')),
                  'defaultRouters'
                ],
                '[]'::jsonb
              )
            ) with ordinality as router(value, ordinal)
          ),
          ''
        ) = regexp_replace(
          trim(p_criterion->>'expected'),
          '\s+',
          ' ',
          'g'
        )

      when 'dhcp_dns_server' then
        coalesce(
          (
            select string_agg(value, ' ' order by ordinal)
            from jsonb_array_elements_text(
              coalesce(
                p_state #>
                array[
                  'dhcpPools',
                  upper(trim(p_criterion->>'target')),
                  'dnsServers'
                ],
                '[]'::jsonb
              )
            ) with ordinality as dns_server(value, ordinal)
          ),
          ''
        ) = regexp_replace(
          trim(p_criterion->>'expected'),
          '\s+',
          ' ',
          'g'
        )

      when 'dhcp_excluded_range' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(p_state->'dhcpExcludedRanges', '[]'::jsonb)
          ) excluded_range
          where trim(excluded_range->>'startIp') =
              trim(p_criterion->>'target')
            and trim(excluded_range->>'endIp') =
              trim(p_criterion->>'expected')
        )

      when 'etherchannel_member' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'channelGroup',
            'id'
          ]
        ) = split_part(
          regexp_replace(
            lower(trim(p_criterion->>'expected')),
            '\s+',
            ' ',
            'g'
          ),
          ' ',
          1
        )
        and lower(
          trim(
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'channelGroup',
              'mode'
            ]
          )
        ) = split_part(
          regexp_replace(
            lower(trim(p_criterion->>'expected')),
            '\s+',
            ' ',
            'g'
          ),
          ' ',
          2
        )

      when 'stp_mode' then
        lower(trim(p_state #>> array['spanningTree', 'mode'])) =
          lower(trim(p_criterion->>'expected'))

      when 'stp_vlan_priority' then
        trim(
          p_state #>>
          array[
            'spanningTree',
            'vlanPriorities',
            trim(p_criterion->>'target')
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_portfast' then
        coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'spanningTreePortfast'
            ]
          )::boolean,
          false
        )

      when 'interface_bpduguard' then
        coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'spanningTreeBpduguard'
            ]
          )::boolean,
          false
        )

      when 'ssh_rsa_keys' then
        coalesce((p_state->>'rsaKeyBits')::integer, 0) >=
          coalesce((p_criterion->>'expected')::integer, 0)

      when 'ssh_version' then
        coalesce((p_state->>'sshVersion')::integer, 1) =
          coalesce((p_criterion->>'expected')::integer, 2)

      when 'line_login_local' then
        coalesce(
          (
            p_state #>>
            array[
              'lines',
              public.canonical_cli_line(p_criterion->>'target'),
              'loginLocal'
            ]
          )::boolean,
          false
        )

$cases$;
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
      'cli_criterion_is_met(jsonb, jsonb) must exist before migration 035';
  end if;

  if position('when ''dhcp_pool_exists'' then' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception
        'Unable to locate the grading insertion point in cli_criterion_is_met';
    end if;
    v_definition := replace(
      v_definition,
      v_marker,
      v_cases || v_marker
    );
    execute v_definition;
  end if;
end;
$$;

with recalculated as (
  select
    attempt.id,
    lab.passing_score,
    coalesce(
      sum(
        case
          when public.cli_criterion_is_met(
            attempt.session_state,
            criterion
          )
            then (criterion->>'points')::numeric
          else 0
        end
      ),
      0
    ) as score_points,
    coalesce(sum((criterion->>'points')::numeric), 0) as maximum_points
  from public.cli_attempts attempt
  join public.cli_labs lab
    on lab.id = attempt.lab_id
  cross join lateral jsonb_array_elements(
    attempt.criteria_snapshot
  ) criterion
  where attempt.submitted_at is not null
  group by attempt.id, lab.passing_score
),
scored as (
  select
    id,
    score_points,
    maximum_points,
    case
      when maximum_points > 0
        then round((score_points / maximum_points) * 100, 2)
      else 0
    end as percentage,
    passing_score
  from recalculated
)
update public.cli_attempts attempt
set
  score_points = scored.score_points,
  maximum_points = scored.maximum_points,
  percentage = scored.percentage,
  passed = scored.percentage >= scored.passing_score
from scored
where attempt.id = scored.id;

revoke all
on function public.cli_criterion_is_met(jsonb, jsonb)
from public;

