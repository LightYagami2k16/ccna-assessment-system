-- Preserve the actual pre-command prompt, including hostname/mode and remote SSH.
begin;
alter table public.cli_competition_commands add column if not exists prompt_before text;
do $$ declare def text;begin
 select pg_get_functiondef('public.cli_duel_commit_operation(uuid,jsonb,jsonb)'::regprocedure) into def;
 if position('prompt_before=' in def)=0 then
  def:=replace(def,'set device_id=', $patch$set prompt_before=left(p_outcome->>'promptBefore',160),device_id=$patch$);execute def;
 end if;
 select pg_get_functiondef('public.cli_duel_player_data(uuid,uuid)'::regprocedure) into def;
 if position('cmd.prompt_before' in def)=0 then
  def:=replace(def,$old$'output',cmd.output,$old$,$new$'output',cmd.output,'promptBefore',cmd.prompt_before,$new$);execute def;
 end if;
 select pg_get_functiondef('public.get_cli_duel_review(uuid)'::regprocedure) into def;
 if position('cmd.prompt_before' in def)=0 then
  def:=replace(def,$old$'output',cmd.output,$old$,$new$'output',cmd.output,'promptBefore',cmd.prompt_before,$new$);execute def;
 end if;
end $$;
-- CREATE OR REPLACE preserves the original private/service/authenticated ACLs.
commit;
