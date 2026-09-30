-- Admin-only hard purge of a user and everything tied to them.
--
-- purge_user(p_user_id, p_dry_run): deletes (or, with p_dry_run, only counts) every row the user
-- created or is referenced by, in one transaction, then removes the auth.users row. Returns
-- {counts, foreign_reach, storage_paths}. Storage objects can't be deleted from SQL, so the
-- caller removes `storage_paths` from the bucket after a successful (non-dry-run) call.
--
-- Records other users own that hang off the deleted user's data (a transfer/settlement/movement
-- linked to their intention, etc.) are deleted too and reported under foreign_reach. Optional
-- "who touched it" references on records that survive are set to NULL.
CREATE OR REPLACE FUNCTION public.purge_user(p_user_id uuid, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intentions  uuid[];
  v_settlements uuid[];
  v_transfers   uuid[];
  v_payroll     uuid[];
  v_movements   uuid[];
  v_paths       text[];
  v_counts      jsonb := '{}'::jsonb;
  v_foreign     jsonb;
  v_n           integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;

  BEGIN -- subtransaction: a dry run raises P0900 at the end so every delete below rolls back
    SELECT coalesce(array_agg(id), '{}') INTO v_intentions
      FROM budget_intentions WHERE requested_by = p_user_id;
    SELECT coalesce(array_agg(id), '{}') INTO v_payroll
      FROM payroll_records WHERE created_by_id = p_user_id;

    -- Transfers/settlements go when the user made them, when they belong to a deleted intention,
    -- or when they point at a movement the user created.
    SELECT coalesce(array_agg(id), '{}') INTO v_transfers FROM intention_transfers
      WHERE registered_by = p_user_id OR intention_id = ANY (v_intentions)
         OR movement_id IN (SELECT id FROM movements WHERE created_by_id = p_user_id);
    SELECT coalesce(array_agg(id), '{}') INTO v_settlements FROM expense_settlements
      WHERE submitted_by = p_user_id OR intention_id = ANY (v_intentions)
         OR movement_id IN (SELECT id FROM movements WHERE created_by_id = p_user_id);

    SELECT coalesce(array_agg(DISTINCT id), '{}') INTO v_movements FROM movements
      WHERE created_by_id = p_user_id
         OR id IN (SELECT movement_id FROM intention_transfers WHERE id = ANY (v_transfers))
         OR id IN (SELECT movement_id FROM expense_settlements WHERE id = ANY (v_settlements))
         OR id IN (SELECT movement_id FROM payroll_movements WHERE payroll_record_id = ANY (v_payroll));

    v_foreign := jsonb_build_object(
      'movements',   (SELECT count(*) FROM movements WHERE id = ANY (v_movements) AND created_by_id <> p_user_id),
      'transfers',   (SELECT count(*) FROM intention_transfers WHERE id = ANY (v_transfers) AND registered_by <> p_user_id),
      'settlements', (SELECT count(*) FROM expense_settlements WHERE id = ANY (v_settlements) AND submitted_by <> p_user_id)
    );

    -- Storage paths to remove once the transaction commits.
    SELECT coalesce(array_agg(p), '{}') INTO v_paths FROM (
      SELECT storage_path AS p FROM movement_attachments
        WHERE movement_id = ANY (v_movements) OR created_by_id = p_user_id
      UNION SELECT storage_path FROM intention_attachments
        WHERE intention_id = ANY (v_intentions) OR created_by_id = p_user_id
      UNION SELECT storage_path FROM settlement_attachments
        WHERE settlement_id = ANY (v_settlements) OR created_by_id = p_user_id
      UNION SELECT liquidacion_storage_path FROM payroll_records
        WHERE id = ANY (v_payroll) AND liquidacion_storage_path IS NOT NULL
    ) s WHERE p IS NOT NULL;

    DELETE FROM request_comments
      WHERE user_id = p_user_id
         OR (entity_type = 'INTENTION' AND entity_id = ANY (v_intentions))
         OR (entity_type = 'SETTLEMENT' AND entity_id = ANY (v_settlements));
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('comments', v_n);

    DELETE FROM movement_attachments
      WHERE movement_id = ANY (v_movements) OR created_by_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('movement_attachments', v_n);
    DELETE FROM intention_attachments
      WHERE intention_id = ANY (v_intentions) OR created_by_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('intention_attachments', v_n);
    DELETE FROM settlement_attachments
      WHERE settlement_id = ANY (v_settlements) OR created_by_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('settlement_attachments', v_n);

    DELETE FROM payroll_movements
      WHERE payroll_record_id = ANY (v_payroll) OR movement_id = ANY (v_movements);
    DELETE FROM severance_reserve_adjustments WHERE created_by_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('severance_adjustments', v_n);

    DELETE FROM expense_settlements WHERE id = ANY (v_settlements);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('settlements', v_n);
    DELETE FROM intention_transfers WHERE id = ANY (v_transfers);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('transfers', v_n);
    DELETE FROM budget_intentions WHERE id = ANY (v_intentions);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('intentions', v_n);

    DELETE FROM movement_audit_log WHERE movement_id = ANY (v_movements) OR user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('movement_audit_entries', v_n);
    DELETE FROM movements WHERE id = ANY (v_movements);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('movements', v_n);
    DELETE FROM payroll_records WHERE id = ANY (v_payroll);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('payroll_records', v_n);

    DELETE FROM system_audit_log
      WHERE user_id = p_user_id OR (entity = 'users' AND entity_id = p_user_id::text);
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('system_audit_entries', v_n);
    DELETE FROM impersonation_sessions
      WHERE impersonator_id = p_user_id OR target_user_id = p_user_id;
    DELETE FROM ministry_assignments WHERE user_id = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ministry_assignments', v_n);
    DELETE FROM ministry_delegates WHERE user_id = p_user_id OR assigned_by = p_user_id;
    GET DIAGNOSTICS v_n = ROW_COUNT; v_counts := v_counts || jsonb_build_object('ministry_delegates', v_n);

    -- Optional "who touched it" references on records that survive.
    UPDATE movements SET updated_by_id = NULL WHERE updated_by_id = p_user_id;
    UPDATE movements SET cancelled_by_id = NULL WHERE cancelled_by_id = p_user_id;
    UPDATE movement_audit_log SET impersonator_id = NULL WHERE impersonator_id = p_user_id;
    UPDATE system_audit_log SET impersonator_id = NULL WHERE impersonator_id = p_user_id;
    UPDATE budget_intentions SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
    UPDATE expense_settlements SET reviewed_by = NULL WHERE reviewed_by = p_user_id;
    UPDATE ministry_assignments SET assigned_by = NULL WHERE assigned_by = p_user_id;
    UPDATE ministries SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE app_settings SET updated_by = NULL WHERE updated_by = p_user_id;
    UPDATE inbound_email_routes SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE payment_methods SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE movement_categories SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE movement_subcategories SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE budget_periods SET created_by = NULL WHERE created_by = p_user_id;
    UPDATE ministry_budgets SET created_by = NULL WHERE created_by = p_user_id;

    -- inbound_email_routes.user_id cascades from public.users; public.users cascades from auth.
    DELETE FROM auth.users WHERE id = p_user_id;

    IF p_dry_run THEN
      RAISE EXCEPTION 'dry run' USING ERRCODE = 'P0900';
    END IF;
  EXCEPTION WHEN SQLSTATE 'P0900' THEN
    NULL; -- rolled back on purpose; the collected counts are all the caller wants
  END;

  RETURN jsonb_build_object(
    'counts', v_counts,
    'foreign_reach', v_foreign,
    'storage_paths', to_jsonb(v_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.purge_user(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_user(uuid, boolean) TO service_role;
