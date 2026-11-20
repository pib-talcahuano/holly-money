-- Un sub-ítem activo por categoría dentro de un ítem: evita contar dos veces el mismo gasto.
-- (Los sub-ítems de ministerio tienen budget_item_id y category_id NULL: no se ven afectados.)
CREATE UNIQUE INDEX budget_sub_items_item_category_unique
  ON budget_sub_items (budget_item_id, category_id)
  WHERE is_active AND category_id IS NOT NULL;

-- ── get_budget_items_summary (categorías distintas) ─────────────────────────────────
-- Ítem con sub-ítems: asignado = suma de sub-ítems activos; usado = inicial + egresos de la
-- categoría de cada sub-ítem (activo o no) + egresos de la categoría propia del ítem que no
-- pertenezca a ningún sub-ítem. Sin sub-ítems: igual que antes.
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
      bi.initial_used_amount + COALESCE(subs.used, 0) + COALESCE(unassigned.amount, 0)
        AS used_amount,
      COALESCE(unassigned.amount, 0) AS unassigned_used,
      COALESCE(subs.assigned, bi.assigned_amount)
        - (bi.initial_used_amount + COALESCE(subs.used, 0) + COALESCE(unassigned.amount, 0))
        AS remaining
    FROM budget_items bi
    JOIN budget_periods bp ON bp.id = bi.budget_period_id
    LEFT JOIN movement_categories mc ON mc.id = bi.category_id
    LEFT JOIN LATERAL (
      SELECT
        SUM(si.assigned_amount) FILTER (WHERE si.is_active) AS assigned,
        -- Cada categoría distinta cuenta una sola vez (un sub-ítem desactivado puede compartir
        -- categoría con uno activo).
        (
          SELECT SUM(m.amount) FROM movements m
          WHERE m.category_id IN (
              SELECT si2.category_id FROM budget_sub_items si2
              WHERE si2.budget_item_id = bi.id AND si2.category_id IS NOT NULL
            )
            AND m.movement_type = 'EXPENSE'
            AND m.status = 'ACTIVE'
            AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date
        ) AS used
      FROM budget_sub_items si
      WHERE si.budget_item_id = bi.id
    ) subs ON true
    LEFT JOIN LATERAL (
      SELECT SUM(m.amount) AS amount
      FROM movements m
      WHERE m.category_id = bi.category_id
        AND m.movement_type = 'EXPENSE'
        AND m.status = 'ACTIVE'
        AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date
        AND NOT EXISTS (
          SELECT 1 FROM budget_sub_items si
          WHERE si.budget_item_id = bi.id AND si.category_id = bi.category_id
        )
    ) unassigned ON true
    WHERE bi.budget_period_id = v_period_id
      AND bi.is_active
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_budget_items_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_budget_items_summary(UUID) TO service_role;

