-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- PHASE 2A.4: FIX CLI INTERFACE CRITERIA MATCHING
-- Requires migrations 020, 022, and 023.
-- =========================================================
--
-- Instructor criteria may use normal Cisco abbreviations:
-- f0/3, fa0/3, fastethernet0/3
-- g0/1, gi0/1, gigabitethernet0/1
--
-- The simulator stores canonical names such as FastEthernet0/3.
-- This migration canonicalizes the criterion target before reading
-- the saved device state and recalculates affected submitted scores.

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
    regexp_replace(
      coalesce(trim(p_interface), ''),
      '\s+',
      '',
      'g'
    )
  );
  v_number text;
begin
  if v_compact ~
    '^(f|fa|fastethernet)[0-9]+/[0-9]+$' then
    v_number := regexp_replace(
      v_compact,
      '^(f|fa|fastethernet)',
      ''
    );
    return 'FastEthernet' || v_number;
  end if;

  if v_compact ~
    '^(g|gi|gigabitethernet)[0-9]+/[0-9]+$' then
    v_number := regexp_replace(
      v_compact,
      '^(g|gi|gigabitethernet)',
      ''
    );
    return 'GigabitEthernet' || v_number;
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

      when 'vlan_exists' then
        (p_state->'vlans') ?
        trim(p_criterion->>'target')

      when 'vlan_name' then
        lower(
          trim(
            p_state #>>
            array[
              'vlans',
              trim(p_criterion->>'target'),
              'name'
            ]
          )
        ) =
        lower(trim(p_criterion->>'expected'))

      when 'interface_mode' then
        lower(
          trim(
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(
                p_criterion->>'target'
              ),
              'switchportMode'
            ]
          )
        ) =
        lower(trim(p_criterion->>'expected'))

      when 'interface_access_vlan' then
        trim(
          p_state #>>
          array[
            'interfaces',
            public.canonical_cli_interface(
              p_criterion->>'target'
            ),
            'accessVlan'
          ]
        ) =
        trim(p_criterion->>'expected')

      when 'interface_enabled' then
        coalesce(
          (
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(
                p_criterion->>'target'
              ),
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
                public.canonical_cli_interface(
                  p_criterion->>'target'
                ),
                'ipAddress'
              ],
              ' ',
              p_state #>>
              array[
                'interfaces',
                public.canonical_cli_interface(
                  p_criterion->>'target'
                ),
                'subnetMask'
              ]
            )
          ),
          '\s+',
          ' ',
          'g'
        ) =
        regexp_replace(
          trim(p_criterion->>'expected'),
          '\s+',
          ' ',
          'g'
        )

      when 'config_saved' then
        coalesce(
          (p_state->>'saved')::boolean,
          false
        )

      else false
    end,
    false
  );
$$;

-- Recalculate attempts that were already graded. This uses each
-- attempt's criteria snapshot, so later instructor edits still do
-- not alter the grading basis.
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
    coalesce(
      sum((criterion->>'points')::numeric),
      0
    ) as maximum_points
  from public.cli_attempts attempt
  join public.cli_labs lab
    on lab.id = attempt.lab_id
  cross join lateral jsonb_array_elements(
    attempt.criteria_snapshot
  ) criterion
  where attempt.submitted_at is not null
  group by
    attempt.id,
    lab.passing_score
),
scored as (
  select
    id,
    score_points,
    maximum_points,
    case
      when maximum_points > 0
      then round(
        (score_points / maximum_points) * 100,
        2
      )
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
on function public.canonical_cli_interface(text)
from public;

revoke all
on function public.cli_criterion_is_met(jsonb, jsonb)
from public;
