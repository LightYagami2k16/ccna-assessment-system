-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2C: SINGLE-AREA OSPF CONFIGURATION AND GRADING
-- Requires migrations 020 through 028.
-- =========================================================

create or replace function public.canonical_cli_interface(
  p_interface text
)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_compact text := lower(
    regexp_replace(coalesce(trim(p_interface), ''), '\s+', '', 'g')
  );
  v_number text;
begin
  if v_compact ~ '^(f|fa|fastethernet)[0-9]+(/[0-9]+){1,2}(\.[0-9]+)?$' then
    v_number := regexp_replace(v_compact, '^(f|fa|fastethernet)', '');
    return 'FastEthernet' || v_number;
  end if;
  if v_compact ~ '^(g|gi|gigabitethernet)[0-9]+(/[0-9]+){1,2}(\.[0-9]+)?$' then
    v_number := regexp_replace(v_compact, '^(g|gi|gigabitethernet)', '');
    return 'GigabitEthernet' || v_number;
  end if;
  if v_compact ~ '^(te|tengigabitethernet)[0-9]+(/[0-9]+){1,2}(\.[0-9]+)?$' then
    v_number := regexp_replace(v_compact, '^(te|tengigabitethernet)', '');
    return 'TenGigabitEthernet' || v_number;
  end if;
  if v_compact ~ '^(e|ethernet)[0-9]+(/[0-9]+){1,2}(\.[0-9]+)?$' then
    v_number := regexp_replace(v_compact, '^(e|ethernet)', '');
    return 'Ethernet' || v_number;
  end if;
  if v_compact ~ '^(po|port-channel)[0-9]+$' then
    v_number := regexp_replace(v_compact, '^(po|port-channel)', '');
    return 'Port-channel' || v_number;
  end if;
  if v_compact ~ '^vlan[0-9]+$' then
    return 'Vlan' || regexp_replace(v_compact, '^vlan', '');
  end if;
  if v_compact ~ '^(lo|loopback)[0-9]+$' then
    v_number := regexp_replace(v_compact, '^(lo|loopback)', '');
    return 'Loopback' || v_number;
  end if;
  if v_compact ~ '^(s|serial)[0-9]+(/[0-9]+){1,2}(\.[0-9]+)?$' then
    v_number := regexp_replace(v_compact, '^(s|serial)', '');
    return 'Serial' || v_number;
  end if;
  return trim(p_interface);
end;
$$;

create or replace function public.cli_criterion_is_met(
  p_state jsonb,
  p_criterion jsonb
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select coalesce(
    case p_criterion->>'type'
      when 'hostname' then
        lower(trim(p_state->>'hostname')) =
        lower(trim(p_criterion->>'expected'))

      when 'enable_secret' then
        case
          when nullif(trim(p_criterion->>'expected'), '') is null
            then nullif(p_state->>'enableSecret', '') is not null
          else p_state->>'enableSecret' = p_criterion->>'expected'
        end

      when 'password_encryption' then
        coalesce((p_state->>'servicePasswordEncryption')::boolean, false)

      when 'banner_motd' then
        trim(p_state->>'bannerMotd') = trim(p_criterion->>'expected')

      when 'domain_name' then
        lower(trim(p_state->>'domainName')) =
        lower(trim(p_criterion->>'expected'))

      when 'local_user' then
        p_state #>>
        array['users', trim(p_criterion->>'target'), 'secret'] =
        p_criterion->>'expected'

      when 'line_password' then
        p_state #>>
        array[
          'lines',
          public.canonical_cli_line(p_criterion->>'target'),
          'password'
        ] = p_criterion->>'expected'

      when 'line_login' then
        coalesce(
          (
            p_state #>>
            array[
              'lines',
              public.canonical_cli_line(p_criterion->>'target'),
              'login'
            ]
          )::boolean,
          false
        )

      when 'line_transport_input' then
        lower(
          trim(
            p_state #>>
            array[
              'lines',
              public.canonical_cli_line(p_criterion->>'target'),
              'transportInput'
            ]
          )
        ) = lower(trim(p_criterion->>'expected'))

      when 'vlan_exists' then
        (p_state->'vlans') ? trim(p_criterion->>'target')

      when 'vlan_name' then
        lower(
          trim(
            p_state #>>
            array['vlans', trim(p_criterion->>'target'), 'name']
          )
        ) = lower(trim(p_criterion->>'expected'))

      when 'interface_mode' then
        lower(
          trim(
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'switchportMode'
            ]
          )
        ) = lower(trim(p_criterion->>'expected'))

      when 'interface_description' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'description'
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_access_vlan' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'accessVlan'
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_voice_vlan' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'voiceVlan'
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_trunk_native_vlan' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'trunkNativeVlan'
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_trunk_allowed_vlans' then
        coalesce(
          p_state #>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'trunkAllowedVlans'
          ],
          'null'::jsonb
        ) = public.canonical_cli_vlan_list(p_criterion->>'expected')

      when 'interface_dot1q' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'encapsulationDot1q'
          ]
        ) = trim(p_criterion->>'expected')

      when 'interface_dot1q_native' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(p_criterion->>'target'),
            'encapsulationDot1q'
          ]
        ) = trim(p_criterion->>'expected')
        and coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'encapsulationNative'
            ]
          )::boolean,
          false
        )

      when 'interface_enabled' then
        coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'shutdown'
            ]
          )::boolean,
          true
        ) = false

      when 'interface_ip' then
        regexp_replace(
          trim(
            concat(
              p_state #>>
              array[
                'interfaces',
                public.canonical_cli_interface(p_criterion->>'target'),
                'ipAddress'
              ],
              ' ',
              p_state #>>
              array[
                'interfaces',
                public.canonical_cli_interface(p_criterion->>'target'),
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

      when 'ip_routing_enabled' then
        coalesce((p_state->>'ipRouting')::boolean, false)

      when 'default_gateway' then
        trim(p_state->>'defaultGateway') =
        trim(p_criterion->>'expected')

      when 'static_route' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(p_state->'staticRoutes', '[]'::jsonb)
          ) route
          where regexp_replace(
            trim(concat(route->>'network', ' ', route->>'mask')),
            '\s+',
            ' ',
            'g'
          ) = regexp_replace(
            trim(p_criterion->>'target'),
            '\s+',
            ' ',
            'g'
          )
          and lower(
            public.canonical_cli_interface(route->>'nextHop')
          ) = lower(
            public.canonical_cli_interface(p_criterion->>'expected')
          )
        )

      when 'default_route' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(p_state->'staticRoutes', '[]'::jsonb)
          ) route
          where route->>'network' = '0.0.0.0'
            and route->>'mask' = '0.0.0.0'
            and lower(
              public.canonical_cli_interface(route->>'nextHop')
            ) = lower(
              public.canonical_cli_interface(p_criterion->>'expected')
            )
        )

      when 'ospf_process' then
        coalesce(p_state->'ospfProcesses', '{}'::jsonb)
          ? trim(p_criterion->>'target')

      when 'ospf_router_id' then
        trim(
          p_state #>>
          array[
            'ospfProcesses',
            trim(p_criterion->>'target'),
            'routerId'
          ]
        ) = trim(p_criterion->>'expected')

      when 'ospf_network' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(
              p_state #>
              array[
                'ospfProcesses',
                trim(p_criterion->>'target'),
                'networks'
              ],
              '[]'::jsonb
            )
          ) network
          where lower(
            regexp_replace(
              trim(
                concat(
                  network->>'network',
                  ' ',
                  network->>'wildcard',
                  ' area ',
                  network->>'area'
                )
              ),
              '\s+',
              ' ',
              'g'
            )
          ) = lower(
            regexp_replace(
              trim(p_criterion->>'expected'),
              '\s+',
              ' ',
              'g'
            )
          )
        )

      when 'ospf_passive_interface' then
        case
          when lower(trim(p_criterion->>'expected')) = 'default' then
            coalesce(
              (
                p_state #>>
                array[
                  'ospfProcesses',
                  trim(p_criterion->>'target'),
                  'passiveDefault'
                ]
              )::boolean,
              false
            )
          else
            (
              coalesce(
                (
                  p_state #>>
                  array[
                    'ospfProcesses',
                    trim(p_criterion->>'target'),
                    'passiveDefault'
                  ]
                )::boolean,
                false
              )
              and not exists (
                select 1
                from jsonb_array_elements_text(
                  coalesce(
                    p_state #>
                    array[
                      'ospfProcesses',
                      trim(p_criterion->>'target'),
                      'nonPassiveInterfaces'
                    ],
                    '[]'::jsonb
                  )
                ) as non_passive_interface(value)
                where lower(
                  public.canonical_cli_interface(
                    non_passive_interface.value
                  )
                ) = lower(
                  public.canonical_cli_interface(
                    p_criterion->>'expected'
                  )
                )
              )
            )
            or exists (
              select 1
              from jsonb_array_elements_text(
                coalesce(
                  p_state #>
                  array[
                    'ospfProcesses',
                    trim(p_criterion->>'target'),
                    'passiveInterfaces'
                  ],
                  '[]'::jsonb
                )
              ) as passive_interface(value)
              where lower(
                public.canonical_cli_interface(
                  passive_interface.value
                )
              ) = lower(
                public.canonical_cli_interface(
                  p_criterion->>'expected'
                )
              )
            )
        end

      when 'ospf_default_information' then
        coalesce(
          (
            p_state #>>
            array[
              'ospfProcesses',
              trim(p_criterion->>'target'),
              'defaultInformationOriginate'
            ]
          )::boolean,
          false
        )

      when 'config_saved' then
        coalesce((p_state->>'saved')::boolean, false)

      else false
    end,
    false
  );
$$;

-- Recalculate already-submitted attempts against their immutable criteria
-- snapshots. Existing attempts without routing criteria retain their scores.
with recalculated as (
  select
    attempt.id,
    lab.passing_score,
    coalesce(
      sum(
        case
          when public.cli_criterion_is_met(attempt.session_state, criterion)
            then (criterion->>'points')::numeric
          else 0
        end
      ),
      0
    ) as score_points,
    coalesce(sum((criterion->>'points')::numeric), 0) as maximum_points
  from public.cli_attempts attempt
  join public.cli_labs lab on lab.id = attempt.lab_id
  cross join lateral jsonb_array_elements(attempt.criteria_snapshot) criterion
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

revoke all on function public.canonical_cli_interface(text) from public;
revoke all on function public.cli_criterion_is_met(jsonb, jsonb) from public;
