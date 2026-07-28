-- Phase 2: NAT and PAT configuration
-- Extends immutable final-state grading without making command order relevant.

do $$
declare
  v_definition text;
  v_marker text := '      when ''config_saved'' then';
  v_nat_cases text := $cases$
      when 'interface_nat_role' then
        lower(
          trim(
            p_state #>>
            array[
              'interfaces',
              public.canonical_cli_interface(p_criterion->>'target'),
              'natRole'
            ]
          )
        ) = lower(trim(p_criterion->>'expected'))

      when 'nat_pool' then
        lower(
          regexp_replace(
            trim(
              concat(
                p_state #>>
                array[
                  'natPools',
                  upper(trim(p_criterion->>'target')),
                  'startIp'
                ],
                ' ',
                p_state #>>
                array[
                  'natPools',
                  upper(trim(p_criterion->>'target')),
                  'endIp'
                ],
                ' netmask ',
                p_state #>>
                array[
                  'natPools',
                  upper(trim(p_criterion->>'target')),
                  'netmask'
                ]
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

      when 'nat_static_mapping' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(p_state->'natRules', '[]'::jsonb)
          ) nat_rule
          where nat_rule->>'type' = 'static'
            and trim(nat_rule->>'localIp') =
              trim(p_criterion->>'target')
            and trim(nat_rule->>'globalIp') =
              trim(p_criterion->>'expected')
        )

      when 'nat_dynamic_rule' then
        exists (
          select 1
          from jsonb_array_elements(
            coalesce(p_state->'natRules', '[]'::jsonb)
          ) nat_rule
          where nat_rule->>'type' = 'dynamic'
            and public.canonical_cli_acl_id(nat_rule->>'aclId') =
              public.canonical_cli_acl_id(p_criterion->>'target')
            and lower(nat_rule->>'sourceType') = lower(
              split_part(
                regexp_replace(
                  trim(p_criterion->>'expected'),
                  '\s+',
                  ' ',
                  'g'
                ),
                ' ',
                1
              )
            )
            and case
              when lower(nat_rule->>'sourceType') = 'interface' then
                lower(
                  public.canonical_cli_interface(nat_rule->>'source')
                ) = lower(
                  public.canonical_cli_interface(
                    split_part(
                      regexp_replace(
                        trim(p_criterion->>'expected'),
                        '\s+',
                        ' ',
                        'g'
                      ),
                      ' ',
                      2
                    )
                  )
                )
              else
                upper(trim(nat_rule->>'source')) = upper(
                  split_part(
                    regexp_replace(
                      trim(p_criterion->>'expected'),
                      '\s+',
                      ' ',
                      'g'
                    ),
                    ' ',
                    2
                  )
                )
            end
            and coalesce((nat_rule->>'overload')::boolean, false) =
              (
                lower(
                  split_part(
                    regexp_replace(
                      trim(p_criterion->>'expected'),
                      '\s+',
                      ' ',
                      'g'
                    ),
                    ' ',
                    3
                  )
                ) = 'overload'
              )
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
      'cli_criterion_is_met(jsonb, jsonb) must exist before migration 034';
  end if;

  if position('when ''interface_nat_role'' then' in v_definition) = 0 then
    if position(v_marker in v_definition) = 0 then
      raise exception
        'Unable to locate the grading insertion point in cli_criterion_is_met';
    end if;

    v_definition := replace(
      v_definition,
      v_marker,
      v_nat_cases || v_marker
    );
    execute v_definition;
  end if;
end;
$$;

-- Recalculate previously submitted attempts if they already contain NAT/PAT
-- criteria. Other attempts retain the same score because the earlier cases
-- in cli_criterion_is_met are unchanged.
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
