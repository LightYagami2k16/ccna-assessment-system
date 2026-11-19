-- Random character selection and exact-case grading for user-defined text.
begin;
do $$ declare routine text;def text;begin
 foreach routine in array array['select_cli_duel_character(uuid,text,text)','control_cli_duel(uuid,text)','cli_criterion_is_met(jsonb,jsonb)'] loop
  if to_regprocedure('public.'||split_part(routine,'(',1)||'_before_random_case('||split_part(routine,'(',2)) is null then
   select pg_get_functiondef(to_regprocedure('public.'||routine)) into def;
   execute replace(def,'public.'||split_part(routine,'(',1)||'(', 'public.'||split_part(routine,'(',1)||'_before_random_case(');
  end if;
 end loop;
end $$;
revoke all on function public.select_cli_duel_character_before_random_case(uuid,text,text),public.control_cli_duel_before_random_case(uuid,text),public.cli_criterion_is_met_before_random_case(jsonb,jsonb) from public,anon,authenticated;
create or replace function public.cli_duel_random_character()
returns text language sql volatile set search_path=pg_catalog as $$
 select (array['eren-yeager','asta','natsu-dragneel','ichigo-kurosaki','monkey-d-luffy','meliodas','uzumaki-naruto','son-goku','sung-jinwoo','izuku-midoriya','yuji-itadori','shinra-kusakabe','gon-freecss','ken-kaneki','saitama'])[floor(random()*15)::integer+1];
$$;
revoke all on function public.cli_duel_random_character() from public,anon,authenticated;
create or replace function public.select_cli_duel_character(p_participant_id uuid,p_client_id text,p_character_id text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$ begin
 return public.select_cli_duel_character_before_random_case(p_participant_id,p_client_id,case when p_character_id='random' then public.cli_duel_random_character() else p_character_id end);
end $$;
create or replace function public.control_cli_duel(p_competition_id uuid,p_action text)
returns jsonb language plpgsql security definer set search_path=pg_catalog as $$
declare c public.cli_competitions%rowtype;p public.cli_competition_participants%rowtype;v_character text;begin
 perform public.cli_duel_require_access(auth.uid(),p_competition_id,true);
 select * into c from public.cli_competitions where id=p_competition_id for update;
 if c.character_selection_required and p_action='start' and c.status='waiting' and not c.has_started then
  if not public.cli_duel_host_players_present(c.id) then raise exception 'Both players must be active inside the arena.';end if;
  for p in select * from public.cli_competition_participants where competition_id=c.id and character_id is null order by id for update loop
   v_character:=public.cli_duel_random_character();
   update public.cli_competition_participants set character_id=v_character where id=p.id;
   perform public.cli_duel_bump(c.id,'character_assigned_randomly',auth.uid(),p.id,jsonb_build_object('characterId',v_character));
  end loop;
 end if;
 return public.control_cli_duel_before_random_case(p_competition_id,p_action);
end $$;
-- Resolve the requested device before comparing; all other criterion semantics delegate unchanged.
-- SECURITY DEFINER permits only pure JSON evaluators/private helpers, not table access from caller data.
create or replace function public.cli_criterion_is_met(p_state jsonb,p_criterion jsonb)
returns boolean language plpgsql immutable security definer set search_path=pg_catalog as $$
declare s jsonb:=public.cli_criterion_device_state(p_state,p_criterion);begin
 case p_criterion->>'type'
  when 'hostname' then return coalesce(btrim(s->>'hostname') collate "C"=btrim(p_criterion->>'expected') collate "C",false);
  when 'domain_name' then return coalesce(btrim(s->>'domainName') collate "C"=btrim(p_criterion->>'expected') collate "C",false);
  when 'vlan_name' then return coalesce(btrim(s#>>array['vlans',btrim(p_criterion->>'target'),'name']) collate "C"=btrim(p_criterion->>'expected') collate "C",false);
  else return public.cli_criterion_is_met_before_random_case(p_state,p_criterion);
 end case;
end $$;
commit;
