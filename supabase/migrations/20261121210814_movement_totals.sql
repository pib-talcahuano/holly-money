-- Totales de ingresos/egresos de los movimientos activos que coinciden con una búsqueda.
-- SECURITY INVOKER: corre con los permisos del llamador, así RLS filtra las filas visibles.
-- Se revoca de PUBLIC y anon (Supabase concede EXECUTE a anon por default privileges) y se
-- concede a authenticated a propósito: los datos quedan protegidos por RLS, no por el GRANT.
CREATE OR REPLACE FUNCTION get_movement_totals(
  p_term TEXT DEFAULT NULL,
  p_category_ids UUID[] DEFAULT NULL,
  p_subcategory_ids UUID[] DEFAULT NULL,
  p_amount NUMERIC DEFAULT NULL,
  p_movement_type TEXT DEFAULT NULL
)
RETURNS TABLE (movement_type TEXT, total NUMERIC, record_count BIGINT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    m.movement_type::TEXT,
    SUM(m.amount)::NUMERIC,
    COUNT(*)::BIGINT
  FROM movements m
  WHERE m.status = 'ACTIVE'
    AND (p_movement_type IS NULL OR m.movement_type::TEXT = p_movement_type)
    AND (
      p_term IS NULL
      OR m.delivered_by ILIKE '%' || p_term || '%'
      OR m.notes ILIKE '%' || p_term || '%'
      OR m.category_id = ANY(COALESCE(p_category_ids, '{}'))
      OR m.subcategory_id = ANY(COALESCE(p_subcategory_ids, '{}'))
      OR (p_amount IS NOT NULL AND m.amount = p_amount)
    )
  GROUP BY m.movement_type
$$;

REVOKE EXECUTE ON FUNCTION get_movement_totals(TEXT, UUID[], UUID[], NUMERIC, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION get_movement_totals(TEXT, UUID[], UUID[], NUMERIC, TEXT) TO authenticated;
