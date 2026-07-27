-- =========================================================
-- CCNA ASSESSMENT SYSTEM
-- MIGRATION 028
-- BULK CLI PRACTICAL PUBLISH, UNPUBLISH, AND DELETE
-- =========================================================

create or replace function public.bulk_manage_cli_labs(
    p_lab_ids uuid[],
    p_action text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
    v_role text;
    v_affected_count integer;
begin
    v_role := public.get_current_user_role_text();

    if auth.uid() is null then
        raise exception 'You must be signed in.';
    end if;

    if v_role not in ('instructor', 'administrator', 'admin') then
        raise exception 'Only instructors may manage CLI practicals.';
    end if;

    if p_lab_ids is null or cardinality(p_lab_ids) = 0 then
        raise exception 'Select at least one CLI practical.';
    end if;

    if p_action not in ('publish', 'unpublish', 'delete') then
        raise exception 'Invalid bulk action.';
    end if;

    if p_action = 'delete' then
        delete from public.cli_labs
        where id = any(p_lab_ids)
          and (
              created_by = auth.uid()
              or v_role in ('administrator', 'admin')
          );
    else
        update public.cli_labs
        set status = case
            when p_action = 'publish' then 'published'::public.content_status
            else 'draft'::public.content_status
        end
        where id = any(p_lab_ids)
          and (
              created_by = auth.uid()
              or v_role in ('administrator', 'admin')
          );
    end if;

    get diagnostics v_affected_count = row_count;
    return v_affected_count;
end;
$$;

revoke all
on function public.bulk_manage_cli_labs(uuid[], text)
from public;

grant execute
on function public.bulk_manage_cli_labs(uuid[], text)
to authenticated;
