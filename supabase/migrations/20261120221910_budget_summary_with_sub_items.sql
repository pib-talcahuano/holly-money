-- Resúmenes de presupuesto con sub-ítems y restante (spec §2 y §4).
--
-- * budget_intentions.budget_sub_item_id: fondo (sub-ítem) que la tesorería elige para la solicitud.
--   La columna se agrega aquí porque los resúmenes la necesitan; la validación (trigger) y la
--   asignación desde la app llegan en la tarea siguiente.
-- * get_ministry_budget_summary / get_budget_items_summary: el padre con sub-ítems activos
--   asigna la suma de ellos; el usado incluye el gasto de sub-ítems desactivados y el gasto sin
--   fondo (unassigned_used). remanente con signo real (sin recortar).
-- * get_budget_sub_items_summary: una fila por sub-ítem activo.

ALTER TABLE budget_intentions
  ADD COLUMN IF NOT EXISTS budget_sub_item_id UUID NULL REFERENCES budget_sub_items(id);
CREATE INDEX IF NOT EXISTS idx_budget_intentions_budget_sub_item
  ON budget_intentions(budget_sub_item_id);

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
        COALESCE((
          SELECT SUM(s.amount) FROM spend s
          WHERE s.ministry_id = mb.ministry_id AND s.budget_sub_item_id IS NULL
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
        COALESCE(SUM((
          SELECT SUM(m.amount) FROM movements m
          WHERE m.category_id = si.category_id
            AND m.movement_type = 'EXPENSE'
            AND m.status = 'ACTIVE'
            AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date
        )), 0) AS used
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

-- ── get_budget_sub_items_summary ─────────────────────────────
-- Una fila por sub-ítem activo. Sub-ítem de ministerio: gasto de las solicitudes con
-- budget_sub_item_id = sub-ítem. Sub-ítem de ítem: egresos de su categoría (sin categoría → 0).
CREATE OR REPLACE FUNCTION get_budget_sub_items_summary(
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      si.id AS sub_item_id,
      CASE WHEN si.ministry_budget_id IS NOT NULL THEN 'MINISTRY' ELSE 'ITEM' END AS parent_type,
      mb.ministry_id,
      si.budget_item_id,
      si.name,
      si.assigned_amount,
      COALESCE(u.amount, 0) AS used_amount,
      si.assigned_amount - COALESCE(u.amount, 0) AS remaining
    FROM budget_sub_items si
    LEFT JOIN ministry_budgets mb ON mb.id = si.ministry_budget_id
    LEFT JOIN budget_items bit ON bit.id = si.budget_item_id
    LEFT JOIN LATERAL (
      SELECT SUM(x.amount) AS amount FROM (
        SELECT it.amount
        FROM intention_transfers it
        JOIN budget_intentions bi ON bi.id = it.intention_id
        WHERE si.ministry_budget_id IS NOT NULL
          AND bi.budget_sub_item_id = si.id
          AND bi.funding_method = 'TRANSFER'
          AND bi.status = 'APPROVED'
          AND it.transfer_date BETWEEN v_start AND v_end
        UNION ALL
        SELECT bi.amount
        FROM budget_intentions bi
        WHERE si.ministry_budget_id IS NOT NULL
          AND bi.budget_sub_item_id = si.id
          AND bi.funding_method = 'REIMBURSEMENT'
          AND bi.status = 'APPROVED'
          AND bi.reviewed_at::date BETWEEN v_start AND v_end
        UNION ALL
        SELECT m.amount
        FROM movements m
        WHERE si.budget_item_id IS NOT NULL
          AND si.category_id IS NOT NULL
          AND m.category_id = si.category_id
          AND m.movement_type = 'EXPENSE'
          AND m.status = 'ACTIVE'
          AND m.movement_date::date BETWEEN v_start AND v_end
      ) x
    ) u ON true
    WHERE si.is_active
      AND (mb.budget_period_id = v_period_id OR bit.budget_period_id = v_period_id)
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_budget_sub_items_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_budget_sub_items_summary(UUID) TO service_role;
