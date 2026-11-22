-- Seed MANAGE_PEOPLE (merge/rename of delivered_by names) for ADMIN only.
-- Deliberately not granted to BURSAR or any other role: product decision.
-- ADMIN can still grant it to other roles later from Settings -> Permisos.

INSERT INTO role_permissions (role, permission, enabled) VALUES
  ('ADMIN', 'MANAGE_PEOPLE', true);
