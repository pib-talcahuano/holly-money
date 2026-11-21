-- Presupuestos por año: cada período se identifica por su año (fechas derivadas marzo→febrero
-- en la capa de aplicación). budget_periods_no_overlap se mantiene como red de seguridad.

ALTER TABLE budget_periods ADD COLUMN year INT;

UPDATE budget_periods SET year = EXTRACT(year FROM start_date)::INT;

DO $$
DECLARE
  dup_years TEXT;
BEGIN
  SELECT string_agg(year::TEXT, ', ' ORDER BY year) INTO dup_years
  FROM (
    SELECT year FROM budget_periods GROUP BY year HAVING count(*) > 1
  ) d;

  IF dup_years IS NOT NULL THEN
    RAISE EXCEPTION 'No se puede migrar: hay presupuestos duplicados para los años: %. Resuelve a mano (corrige o elimina los períodos repetidos) y reintenta.', dup_years;
  END IF;
END $$;

ALTER TABLE budget_periods ALTER COLUMN year SET NOT NULL;
ALTER TABLE budget_periods ADD CONSTRAINT budget_periods_year_key UNIQUE (year);
