-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.6: EXPANDED SWITCH CONFIGURATION AND GRADING
-- Requires migrations 020 through 025.
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
  if v_compact ~ '^(f|fa|fastethernet)[0-9]+(/[0-9]+){1,2}$' then
    v_number := regexp_replace(v_compact, '^(f|fa|fastethernet)', '');
    return 'FastEthernet' || v_number;
  end if;

  if v_compact ~ '^(g|gi|gigabitethernet)[0-9]+(/[0-9]+){1,2}$' then
    v_number := regexp_replace(v_compact, '^(g|gi|gigabitethernet)', '');
    return 'GigabitEthernet' || v_number;
  end if;

  if v_compact ~ '^(te|tengigabitethernet)[0-9]+(/[0-9]+){1,2}$' then
    v_number := regexp_replace(v_compact, '^(te|tengigabitethernet)', '');
    return 'TenGigabitEthernet' || v_number;
  end if;

  if v_compact ~ '^(e|ethernet)[0-9]+(/[0-9]+){1,2}$' then
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

  if v_compact ~ '^(s|serial)[0-9]+(/[0-9]+){1,2}$' then
    v_number := regexp_replace(v_compact, '^(s|serial)', '');
    return 'Serial' || v_number;
  end if;

  return trim(p_interface);
end;
$$;

create or replace function public.canonical_cli_line(
  p_line text
)
returns text
language sql
immutable
set search_path = public
as $$
  select case
    when lower(trim(coalesce(p_line, ''))) in ('console', 'console 0', 'con 0')
      then 'console'
    when lower(trim(coalesce(p_line, ''))) ~ '^(vty|v)( [0-9]+( [0-9]+)?)?$'
      then 'vty'
    else lower(trim(coalesce(p_line, '')))
  end;
$$;

create or replace function public.canonical_cli_vlan_list(
  p_value text
)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_value text := lower(regexp_replace(coalesce(trim(p_value), ''), '\s+', '', 'g'));
  v_token text;
  v_start integer;
  v_end integer;
  v_id integer;
  v_ids integer[] := '{}'::integer[];
  v_result jsonb;
begin
  if v_value = 'all' then
    return 'null'::jsonb;
  end if;
  if v_value in ('', 'none') then
    return '[]'::jsonb;
  end if;

  foreach v_token in array string_to_array(v_value, ',')
  loop
    if v_token ~ '^[0-9]+$' then
      v_start := v_token::integer;
      v_end := v_start;
    elsif v_token ~ '^[0-9]+-[0-9]+$' then
      v_start := split_part(v_token, '-', 1)::integer;
      v_end := split_part(v_token, '-', 2)::integer;
    else
      return null;
    end if;

    if v_start < 1 or v_end > 4094 or v_start > v_end then
      return null;
    end if;

    for v_id in v_start..v_end
    loop
      if not v_id = any(v_ids) then
        v_ids := array_append(v_ids, v_id);
      end if;
    end loop;
  end loop;

  select coalesce(jsonb_agg(id order by id), '[]'::jsonb)
  into v_result
  from unnest(v_ids) id;

  return v_result;
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

      when 'config_saved' then
        coalesce((p_state->>'saved')::boolean, false)

      else false
    end,
    false
  );
$$;

-- Recalculate previously submitted attempts. Existing criteria snapshots
-- remain authoritative, so later lab edits do not change an attempt.
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
revoke all on function public.canonical_cli_line(text) from public;
revoke all on function public.canonical_cli_vlan_list(text) from public;
revoke all on function public.cli_criterion_is_met(jsonb, jsonb) from public;
