-- Etapa 10 — presupuesto por ministerio. Ver docs/plans/10-presupuesto-por-ministerio.md.
--
-- Esto ya existió (budget_periods + ministry_budgets + get_ministry_budget_summary,
-- 20260426000001_expense_approval_workflow.sql) y fue eliminado a propósito
-- (20260709022754_remove_budget_feature.sql) porque acoplaba budget_intentions a un
-- período por FK obligatoria (period_id, is_over_budget). Este diseño NO repite eso:
-- budget_intentions no gana columnas — el cruce con el período se hace por rango de
-- fechas desde el RPC de lectura, igual que get_ministry_leftover_summary (Etapa 7).
--
-- Sin máquina de estados (sin DRAFT/RELEASED como el diseño original): un período
-- expira solo por fecha (end_date < CURRENT_DATE). Confirmado con el cliente:
-- "solo informativo en v1", sin bloqueo duro.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── budget_periods ────────────────────────────────────────────
CREATE TABLE budget_periods (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label       TEXT NOT NULL,
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  created_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT budget_periods_dates_check CHECK (end_date > start_date),
  -- Ningún par de períodos puede solaparse en fechas: así "el período vigente"
  -- (el que contiene CURRENT_DATE) siempre resuelve a lo sumo una fila.
  CONSTRAINT budget_periods_no_overlap EXCLUDE USING gist (
    daterange(start_date, end_date, '[]') WITH &&
  )
);

-- ── ministry_budgets ──────────────────────────────────────────
-- initial_used_amount = punto de partida ("lo ya gastado antes de usar la app");
-- el consumo automático (RPC) se suma encima, no lo reemplaza.
CREATE TABLE ministry_budgets (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ministry_id          UUID NOT NULL REFERENCES ministries(id),
  budget_period_id     UUID NOT NULL REFERENCES budget_periods(id),
  assigned_amount      NUMERIC(12,2) NOT NULL CHECK (assigned_amount > 0),
  initial_used_amount  NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (initial_used_amount >= 0),
  notes                TEXT,
  created_by           UUID REFERENCES users(id),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (ministry_id, budget_period_id)
);

CREATE INDEX idx_ministry_budgets_period   ON ministry_budgets(budget_period_id);
CREATE INDEX idx_ministry_budgets_ministry ON ministry_budgets(ministry_id);

-- ── RLS ───────────────────────────────────────────────────────
ALTER TABLE budget_periods   ENABLE ROW LEVEL SECURITY;
ALTER TABLE ministry_budgets ENABLE ROW LEVEL SECURITY;

-- budget_periods: rangos de fecha, no son datos sensibles por ministerio —
-- visibles para cualquier autenticado, igual que el diseño original.
CREATE POLICY "budget_periods_select" ON budget_periods
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "budget_periods_insert" ON budget_periods
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'BURSAR'));

CREATE POLICY "budget_periods_update" ON budget_periods
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'BURSAR'))
  WITH CHECK (get_my_role() IN ('ADMIN', 'BURSAR'));

-- ministry_budgets: ADMIN/BURSAR/FINANCE ven todo (visibilidad read-only del
-- workflow, igual que el resto de tablas de solicitudes); un MINISTER solo ve
-- el presupuesto de los ministerios a los que está asignado actualmente
-- (get_my_active_ministries(), helper ya existente desde la Etapa de solicitudes).
CREATE POLICY "ministry_budgets_select" ON ministry_budgets
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('ADMIN', 'BURSAR', 'FINANCE')
    OR ministry_id IN (SELECT get_my_active_ministries())
  );

CREATE POLICY "ministry_budgets_insert" ON ministry_budgets
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('ADMIN', 'BURSAR'));

CREATE POLICY "ministry_budgets_update" ON ministry_budgets
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('ADMIN', 'BURSAR'))
  WITH CHECK (get_my_role() IN ('ADMIN', 'BURSAR'));

-- ── get_ministry_budget_summary ──────────────────────────────
-- p_period_id NULL = período vigente (el que contiene CURRENT_DATE). Si no hay
-- período vigente (gap entre períodos) devuelve '[]' — la UI debe comunicar
-- explícitamente "no hay período vigente", no mostrar una tabla vacía silenciosa.
--
-- usado = initial_used_amount
--       + transferencias TRANSFER aprobadas y con transfer registrado (fecha de
--         transferencia dentro del período)
--       + reembolsos REIMBURSEMENT aprobados (fecha de revisión dentro del período)
-- remanente = assigned_amount - usado, con signo real (sin recortar a cero).
--
-- Mismo patrón que get_ministry_leftover_summary: SECURITY DEFINER, JSONB,
-- solo invocable por service_role (vía el cliente admin desde la capa de servicio).
CREATE OR REPLACE FUNCTION get_ministry_budget_summary(
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.ministry_name), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      m.id AS ministry_id,
      m.name AS ministry_name,
      bp.id AS period_id,
      bp.label AS period_label,
      bp.start_date AS period_start_date,
      bp.end_date AS period_end_date,
      mb.assigned_amount,
      mb.initial_used_amount,
      mb.initial_used_amount
        + COALESCE(transfer_used.amount, 0)
        + COALESCE(reimbursement_used.amount, 0) AS used_amount,
      mb.assigned_amount - (
        mb.initial_used_amount
        + COALESCE(transfer_used.amount, 0)
        + COALESCE(reimbursement_used.amount, 0)
      ) AS remaining
    FROM ministry_budgets mb
    JOIN ministries m ON m.id = mb.ministry_id
    JOIN budget_periods bp ON bp.id = mb.budget_period_id
    LEFT JOIN LATERAL (
      SELECT SUM(it.amount) AS amount
      FROM intention_transfers it
      JOIN budget_intentions bi ON bi.id = it.intention_id
      WHERE bi.ministry_id = mb.ministry_id
        AND bi.funding_method = 'TRANSFER'
        AND bi.status = 'APPROVED'
        AND it.transfer_date BETWEEN bp.start_date AND bp.end_date
    ) transfer_used ON true
    LEFT JOIN LATERAL (
      SELECT SUM(bi.amount) AS amount
      FROM budget_intentions bi
      WHERE bi.ministry_id = mb.ministry_id
        AND bi.funding_method = 'REIMBURSEMENT'
        AND bi.status = 'APPROVED'
        AND bi.reviewed_at::date BETWEEN bp.start_date AND bp.end_date
    ) reimbursement_used ON true
    WHERE mb.budget_period_id = v_period_id
  ) t;

  RETURN v_result;
END;
$$;

REVOKE EXECUTE ON FUNCTION get_ministry_budget_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_ministry_budget_summary(UUID) TO service_role;

-- ── role_permissions: seed MANAGE_BUDGETS para ADMIN y BURSAR ───
-- Mismo patrón que MANAGE_CATEGORIES/MANAGE_MINISTRIES (20260715143757).
INSERT INTO role_permissions (role, permission, enabled) VALUES
  ('ADMIN', 'MANAGE_BUDGETS', true),
  ('BURSAR', 'MANAGE_BUDGETS', true);
