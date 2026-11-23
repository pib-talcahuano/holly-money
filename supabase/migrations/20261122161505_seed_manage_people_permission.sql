-- Seed MANAGE_PEOPLE (merge/rename of delivered_by names) for ADMIN only.
-- Deliberately not granted to BURSAR or any other role: product decision.
-- The permissions matrix (Settings -> Permisos) does not list MANAGE_PEOPLE by design, so ADMIN
-- is the only holder and cannot lose it from the UI.

INSERT INTO role_permissions (role, permission, enabled) VALUES
  ('ADMIN', 'MANAGE_PEOPLE', true)
ON CONFLICT (role, permission) DO NOTHING;
