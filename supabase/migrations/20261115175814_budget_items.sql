-- Presupuesto: ítems que no son ministerio (remuneraciones, directorio, asociaciones…).
-- Ver docs/superpowers/specs/2026-11-15-budget-other-items-design.md.
--
-- Tabla aparte de ministry_budgets (que no se toca). El "usado" de un ítem con categoría
-- vinculada sale de los egresos ACTIVE de esa categoría dentro de las fechas del período;
-- sin categoría, solo cuenta initial_used_amount (manual). Informativo: sin bloqueos.

-- ── budget_items ──────────────────────────────────────────────
CREATE TABLE budget_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_period_id     UUID NOT NULL REFERENCES budget_periods(id),
  name                 TEXT NOT NULL,
  assigned_amount      NUMERIC(12,2) NOT NULL CHECK (assigned_amount > 0),
  initial_used_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (initial_used_amount >= 0),
  category_id          UUID REFERENCES movement_categories(id),
  notes                TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT true,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nombre único por período sin distinguir mayúsculas, solo entre ítems activos: un ítem
-- desactivado queda oculto en la UI, así que no debe seguir ocupando su nombre (mismo
-- criterio que movement_categories_name_active_unique).
CREATE UNIQUE INDEX budget_items_period_name_unique
  ON budget_items (budget_period_id, lower(name))
  WHERE is_active;
CREATE INDEX idx_budget_items_period ON budget_items(budget_period_id);
CREATE INDEX idx_budget_items_category ON budget_items(category_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_items_select" ON budget_items
  FOR SELECT TO authenticated
  USING (has_any_role(ARRAY['ADMIN', 'BURSAR', 'FINANCE']));

CREATE POLICY "budget_items_insert" ON budget_items
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['ADMIN', 'BURSAR']));

CREATE POLICY "budget_items_update" ON budget_items
  FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['ADMIN', 'BURSAR']))
  WITH CHECK (has_any_role(ARRAY['ADMIN', 'BURSAR']));

-- Sin política DELETE: los ítems se desactivan (is_active = false), no se borran.

-- ── get_budget_items_summary ─────────────────────────────────
-- p_period_id NULL = período vigente. '[]' si no hay período. Solo ítems activos.
-- usado = initial_used_amount + egresos (EXPENSE, ACTIVE) de la categoría vinculada
-- con movement_date dentro del período (inclusive en ambos extremos).
-- remanente = asignado - usado, con signo real (sin recortar a cero).
-- Mismo patrón que get_ministry_budget_summary: SECURITY DEFINER, JSONB, solo service_role.
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
      bi.assigned_amount,
      bi.initial_used_amount,
      bi.initial_used_amount + COALESCE(spent.amount, 0) AS used_amount,
      bi.assigned_amount - (bi.initial_used_amount + COALESCE(spent.amount, 0)) AS remaining
    FROM budget_items bi
    JOIN budget_periods bp ON bp.id = bi.budget_period_id
    LEFT JOIN movement_categories mc ON mc.id = bi.category_id
    LEFT JOIN LATERAL (
      SELECT SUM(m.amount) AS amount
      FROM movements m
      WHERE m.category_id = bi.category_id
        AND m.movement_type = 'EXPENSE'
        AND m.status = 'ACTIVE'
        AND m.movement_date::date BETWEEN bp.start_date AND bp.end_date
    ) spent ON true
    WHERE bi.budget_period_id = v_period_id
      AND bi.is_active
  ) t;

  RETURN v_result;
END;
$$;

-- Supabase concede EXECUTE a anon/authenticated por defecto (default privileges), y
-- REVOKE ... FROM PUBLIC no lo quita: se revoca explícitamente para que solo el
-- service_role (capa de servicio) pueda invocarlo.
REVOKE EXECUTE ON FUNCTION get_budget_items_summary(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION get_budget_items_summary(UUID) TO service_role;
