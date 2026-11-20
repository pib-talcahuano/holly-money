-- Sin asignar solo descuenta el gasto de sub-ítems activos de ESTE presupuesto de ministerio.
-- Antes descontaba el de cualquier sub-ítem activo, y un fondo de otro período dejaba el gasto
-- fuera de "Sin asignar" en el año siguiente (los totales no cerraban). Solo cambia ese predicado.
--
-- El trigger del fondo también valida cuando cambia el ministerio de la solicitud.

CREATE OR REPLACE FUNCTION get_ministry_budget_summary(
  p_period_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
  v_start DATE;
  v_end DATE;
  v_result JSONB;
BEGIN
  IF p_period_id IS NOT NULL THEN
    v_period_id := p_period_id;
  ELSE
    SELECT id INTO v_period_id
    FROM budget_periods
    WHERE start_date <= CURRENT_DATE AND end_date >= CURRENT_DATE
    LIMIT 1;
  END IF;

  IF v_period_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT start_date, end_date INTO v_start, v_end FROM budget_periods WHERE id = v_period_id;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.ministry_name), '[]'::jsonb)
  INTO v_result
  FROM (
    WITH spend AS (
      SELECT bi.ministry_id, bi.budget_sub_item_id, it.amount
      FROM intention_transfers it
      JOIN budget_intentions bi ON bi.id = it.intention_id
      WHERE bi.funding_method = 'TRANSFER'
        AND bi.status = 'APPROVED'
        AND it.transfer_date BETWEEN v_start AND v_end
      UNION ALL
      SELECT bi.ministry_id, bi.budget_sub_item_id, bi.amount
      FROM budget_intentions bi
      WHERE bi.funding_method = 'REIMBURSEMENT'
        AND bi.status = 'APPROVED'
        AND bi.reviewed_at::date BETWEEN v_start AND v_end
    ),
    totals AS (
      SELECT
        mb.id AS mb_id,
        COALESCE((SELECT SUM(s.amount) FROM spend s WHERE s.ministry_id = mb.ministry_id), 0)
          AS all_used,
        -- Todo el gasto menos el de sub-ítems ACTIVOS de ESTE presupuesto (un fondo de otro año no
        -- cuenta como asignado aquí): incluye el gasto sin fondo y el de
        -- sub-ítems desactivados, para que las líneas visibles sumen el usado del padre.
        COALESCE((
          SELECT SUM(s.amount) FROM spend s
          WHERE s.ministry_id = mb.ministry_id
            AND NOT EXISTS (
              SELECT 1 FROM budget_sub_items si
              WHERE si.id = s.budget_sub_item_id AND si.is_active
                AND si.ministry_budget_id = mb.id
            )
        ), 0) AS unassigned_used,
        (SELECT SUM(si.assigned_amount) FROM budget_sub_items si
          WHERE si.ministry_budget_id = mb.id AND si.is_active) AS sub_assigned
      FROM ministry_budgets mb
      WHERE mb.budget_period_id = v_period_id
    )
    SELECT
      m.id AS ministry_id,
      m.name AS ministry_name,
      bp.id AS period_id,
      bp.label AS period_label,
      bp.start_date AS period_start_date,
      bp.end_date AS period_end_date,
      COALESCE(tt.sub_assigned, mb.assigned_amount) AS assigned_amount,
      mb.initial_used_amount,
      mb.initial_used_amount + tt.all_used AS used_amount,
      tt.unassigned_used,
      COALESCE(tt.sub_assigned, mb.assigned_amount)
        - (mb.initial_used_amount + tt.all_used) AS remaining
    FROM ministry_budgets mb
    JOIN totals tt ON tt.mb_id = mb.id
    JOIN ministries m ON m.id = mb.ministry_id
    JOIN budget_periods bp ON bp.id = mb.budget_period_id
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_ministry_budget_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_ministry_budget_summary(UUID) TO service_role;

-- Mismo cuerpo de siempre; solo el atajo de UPDATE ahora exige que tampoco cambie el ministerio.
CREATE OR REPLACE FUNCTION validate_intention_fund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.budget_sub_item_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE'
    AND NEW.budget_sub_item_id IS NOT DISTINCT FROM OLD.budget_sub_item_id
    AND NEW.ministry_id IS NOT DISTINCT FROM OLD.ministry_id THEN
    RETURN NEW;
  END IF;

  IF auth.uid() IS NOT NULL AND NOT has_any_role(ARRAY['ADMIN', 'BURSAR']) THEN
    RAISE EXCEPTION 'Sin permisos para asignar el fondo de la solicitud'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM budget_sub_items si
    JOIN ministry_budgets mb ON mb.id = si.ministry_budget_id
    WHERE si.id = NEW.budget_sub_item_id
      AND mb.ministry_id = NEW.ministry_id
  ) THEN
    RAISE EXCEPTION 'El fondo no pertenece al ministerio de la solicitud'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION validate_intention_fund() FROM PUBLIC;

DROP TRIGGER IF EXISTS budget_intentions_validate_fund ON budget_intentions;
CREATE TRIGGER budget_intentions_validate_fund
  BEFORE INSERT OR UPDATE OF budget_sub_item_id, ministry_id ON budget_intentions
  FOR EACH ROW EXECUTE FUNCTION validate_intention_fund();
