-- get_ministry_budget_summary y get_ministry_leftover_summary son SECURITY DEFINER (saltan
-- RLS) y solo se invocan desde la capa de servicio con el cliente admin (service_role).
-- Sus migraciones hacían REVOKE ... FROM PUBLIC, pero Supabase concede EXECUTE a
-- anon/authenticated por default privileges y eso no se quita con FROM PUBLIC: cualquier
-- usuario (incluso anónimo) podía llamarlos vía PostgREST y leer datos de todos los
-- ministerios. Se revoca explícitamente; service_role conserva el permiso.
REVOKE EXECUTE ON FUNCTION get_ministry_budget_summary(UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION get_ministry_leftover_summary(UUID, DATE) FROM PUBLIC, anon, authenticated;
