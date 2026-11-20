-- Presupuesto: sub-ítems colgados de un presupuesto de ministerio o de un ítem (no ministerio).
-- Ver docs/superpowers/specs/2026-11-20-budget-subitems-design.md (§2).
--
-- El total de un padre con sub-ítems es la suma de ellos, así que el padre puede existir sin
-- monto directo: se relajan los CHECK de assigned_amount a >= 0.

ALTER TABLE ministry_budgets DROP CONSTRAINT ministry_budgets_assigned_amount_check;
ALTER TABLE ministry_budgets
  ADD CONSTRAINT ministry_budgets_assigned_amount_check CHECK (assigned_amount >= 0);

ALTER TABLE budget_items DROP CONSTRAINT budget_items_assigned_amount_check;
ALTER TABLE budget_items
  ADD CONSTRAINT budget_items_assigned_amount_check CHECK (assigned_amount >= 0);

-- ── budget_sub_items ──────────────────────────────────────────
CREATE TABLE budget_sub_items (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_budget_id UUID REFERENCES ministry_budgets(id),
  budget_item_id     UUID REFERENCES budget_items(id),
  name               TEXT NOT NULL,
  assigned_amount    NUMERIC(12,2) NOT NULL CHECK (assigned_amount > 0),
  category_id        UUID REFERENCES movement_categories(id),
  notes              TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID REFERENCES users(id),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactamente un padre.
  CONSTRAINT budget_sub_items_one_parent
    CHECK ((ministry_budget_id IS NULL) <> (budget_item_id IS NULL))
);

-- Nombre único por padre sin distinguir mayúsculas, solo entre sub-ítems activos
-- (mismo criterio que budget_items_period_name_unique).
CREATE UNIQUE INDEX budget_sub_items_parent_name_unique
  ON budget_sub_items (coalesce(ministry_budget_id, budget_item_id), lower(name))
  WHERE is_active;
CREATE INDEX idx_budget_sub_items_ministry_budget ON budget_sub_items(ministry_budget_id);
CREATE INDEX idx_budget_sub_items_budget_item ON budget_sub_items(budget_item_id);
CREATE INDEX idx_budget_sub_items_category ON budget_sub_items(category_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE budget_sub_items ENABLE ROW LEVEL SECURITY;

-- Los encargados solo ven sub-ítems de presupuestos de sus ministerios (misma visibilidad que
-- ministry_budgets_select); los sub-ítems de ítems que no son ministerio no son visibles para ellos.
CREATE POLICY "budget_sub_items_select" ON budget_sub_items
  FOR SELECT TO authenticated
  USING (
    has_any_role(ARRAY['ADMIN', 'BURSAR', 'FINANCE'])
    OR ministry_budget_id IN (
      SELECT mb.id FROM ministry_budgets mb
      WHERE mb.ministry_id IN (SELECT get_my_active_ministries())
    )
  );

CREATE POLICY "budget_sub_items_insert" ON budget_sub_items
  FOR INSERT TO authenticated
  WITH CHECK (has_any_role(ARRAY['ADMIN', 'BURSAR']));

CREATE POLICY "budget_sub_items_update" ON budget_sub_items
  FOR UPDATE TO authenticated
  USING (has_any_role(ARRAY['ADMIN', 'BURSAR']))
  WITH CHECK (has_any_role(ARRAY['ADMIN', 'BURSAR']));

-- Sin política DELETE: los sub-ítems se desactivan (is_active = false), no se borran.
