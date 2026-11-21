-- Sin asignar = gasto que ninguna línea visible (sub-ítem activo) reclama: gasto sin fondo y
-- gasto de sub-ítems desactivados. Así usado = inicial + sub-ítems activos + sin asignar.
-- Solo cambia unassigned_used; asignado, usado y remanente quedan exactamente igual.

-- ── get_ministry_budget_summary ──────────────────────────────
-- Gasto de una solicitud (mismas reglas de siempre): TRANSFER aprobada con transferencia
-- registrada, por fecha de transferencia; REIMBURSEMENT aprobada, por fecha de revisión; ambas
-- dentro del período.
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
        -- Todo el gasto menos el de sub-ítems ACTIVOS: incluye el gasto sin fondo y el de
        -- sub-ítems desactivados, para que las líneas visibles sumen el usado del padre.
        COALESCE((
          SELECT SUM(s.amount) FROM spend s
          WHERE s.ministry_id = mb.ministry_id
            AND NOT EXISTS (
              SELECT 1 FROM budget_sub_items si
              WHERE si.id = s.budget_sub_item_id AND si.is_active
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

-- ── get_budget_items_summary ─────────────────────────────────
-- Ítem con sub-ítems: asignado = suma de sub-ítems activos; usado = inicial + egresos de las
-- categorías distintas de {categoría propia} + {categorías de todos los sub-ítems}. Sin asignar =
-- ese gasto menos el de las categorías de los sub-ítems activos.
CREATE OR REPLACE FUNCTION get_budget_items_summary(
  p_period_id UUID DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_period_id UUID;
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      bi.id AS item_id,
      bi.name,
      bi.category_id,
      mc.name AS category_name,
      bi.notes,
      COALESCE(subs.assigned, bi.assigned_amount) AS assigned_amount,
      bi.initial_used_amount,
      bi.initial_used_amount + sp.all_used AS used_amount,
      sp.all_used - sp.active_used AS unassigned_used,
      COALESCE(subs.assigned, bi.assigned_amount) - (bi.initial_used_amount + sp.all_used)
        AS remaining
    FROM budget_items bi
    JOIN budget_periods bp ON bp.id = bi.budget_period_id
    LEFT JOIN movement_categories mc ON mc.id = bi.category_id
    LEFT JOIN LATERAL (
      SELECT SUM(si.assigned_amount) FILTER (WHERE si.is_active) AS assigned
      FROM budget_sub_items si
      WHERE si.budget_item_id = bi.id
    ) subs ON true
    CROSS JOIN LATERAL (
      SELECT
        COALESCE(SUM(m.amount), 0) AS all_used,
        COALESCE(SUM(m.amount) FILTER (
          WHERE m.category_id IN (
            SELECT si3.category_id FROM budget_sub_items si3
            WHERE si3.budget_item_id = bi.id AND si3.is_active AND si3.category_id IS NOT NULL
          )
        ), 0) AS active_used
      FROM movements m
      WHERE m.movement_type = 'EXPENSE'
        AND m.status = 'ACTIVE'
        AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date
        AND m.category_id IN (
          SELECT bi.category_id WHERE bi.category_id IS NOT NULL
          UNION
          SELECT si2.category_id FROM budget_sub_items si2
          WHERE si2.budget_item_id = bi.id AND si2.category_id IS NOT NULL
        )
    ) sp
    WHERE bi.budget_period_id = v_period_id
      AND bi.is_active
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_budget_items_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_budget_items_summary(UUID) TO service_role;
