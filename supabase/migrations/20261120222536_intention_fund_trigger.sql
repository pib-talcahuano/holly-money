-- Fondo por solicitud: valida budget_intentions.budget_sub_item_id.
-- Ver docs/superpowers/specs/2026-11-20-budget-subitems-design.md (§3).
--
-- * El sub-ítem debe colgar de un ministry_budgets del mismo ministerio de la solicitud
--   (los sub-ítems de ítems que no son ministerio se rechazan).
-- * Un usuario con sesión solo puede fijar/cambiar el fondo si es ADMIN o BURSAR (la política
--   de UPDATE también deja editar al solicitante, que no debe tocar el fondo). El service role
--   (auth.uid() NULL) no se restringe.
--
-- SECURITY INVOKER a propósito: así no queda una función privilegiada expuesta. Tesorería
-- (ADMIN/BURSAR) lee budget_sub_items y ministry_budgets por RLS; para cualquier otro rol,
-- si no puede ver el sub-ítem, el check falla (cerrado), que es lo deseado.

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

  IF TG_OP = 'UPDATE' AND NEW.budget_sub_item_id IS NOT DISTINCT FROM OLD.budget_sub_item_id THEN
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

CREATE TRIGGER budget_intentions_validate_fund
  BEFORE INSERT OR UPDATE OF budget_sub_item_id ON budget_intentions
  FOR EACH ROW EXECUTE FUNCTION validate_intention_fund();
