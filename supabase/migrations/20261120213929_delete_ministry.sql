-- ADMIN-only hard delete of a ministry that has no history. Counts rows in every table
-- with an FK to ministries (budget_intentions, ministry_assignments, ministry_delegates,
-- ministry_budgets; movements do not reference ministries directly). The ministry row is
-- locked FOR UPDATE so the check and the delete are atomic w.r.t. concurrent inserts
-- (FK checks on child inserts take a KEY SHARE lock on the parent row, which conflicts).
-- Only callable by service_role (admin client from the service layer).
CREATE OR REPLACE FUNCTION public.delete_ministry_if_unused(p_ministry_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_blockers JSONB := '{}'::jsonb;
  v_count INTEGER;
BEGIN
  PERFORM 1 FROM ministries WHERE id = p_ministry_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ministry not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT count(*) INTO v_count FROM budget_intentions WHERE ministry_id = p_ministry_id;
  IF v_count > 0 THEN v_blockers := v_blockers || jsonb_build_object('budget_intentions', v_count); END IF;

  SELECT count(*) INTO v_count FROM ministry_assignments WHERE ministry_id = p_ministry_id;
  IF v_count > 0 THEN v_blockers := v_blockers || jsonb_build_object('ministry_assignments', v_count); END IF;

  SELECT count(*) INTO v_count FROM ministry_delegates WHERE ministry_id = p_ministry_id;
  IF v_count > 0 THEN v_blockers := v_blockers || jsonb_build_object('ministry_delegates', v_count); END IF;

  SELECT count(*) INTO v_count FROM ministry_budgets WHERE ministry_id = p_ministry_id;
  IF v_count > 0 THEN v_blockers := v_blockers || jsonb_build_object('ministry_budgets', v_count); END IF;

  IF v_blockers <> '{}'::jsonb THEN
    RETURN jsonb_build_object('deleted', false, 'blockers', v_blockers);
  END IF;

  DELETE FROM ministries WHERE id = p_ministry_id;
  RETURN jsonb_build_object('deleted', true);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_ministry_if_unused(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_ministry_if_unused(UUID) TO service_role;
