-- App Finanzas — atomic bulk merge for duplicate payees.
-- Reuses the household/RLS validation and archive-over-delete behavior of
-- merge_payees while keeping the entire multi-source operation transactional.

create or replace function public.merge_payees_bulk(
  p_household_id uuid,
  p_source_ids uuid[],
  p_target_id uuid
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_source_id uuid;
  v_moved integer := 0;
begin
  if p_household_id is null or p_target_id is null then
    raise exception 'household and target payee are required';
  end if;

  if coalesce(cardinality(p_source_ids), 0) = 0 then
    raise exception 'at least one source payee is required';
  end if;

  if p_target_id = any(p_source_ids) then
    raise exception 'target payee cannot also be a source';
  end if;

  for v_source_id in
    select distinct source_id
    from unnest(p_source_ids) as sources(source_id)
  loop
    v_moved := v_moved + public.merge_payees(
      p_household_id,
      v_source_id,
      p_target_id
    );
  end loop;

  return v_moved;
end;
$$;

grant execute on function public.merge_payees_bulk(uuid, uuid[], uuid)
  to authenticated;
