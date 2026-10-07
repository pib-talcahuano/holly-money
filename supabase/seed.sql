-- Local-only E2E test fixtures. Loaded by `supabase db reset` (see [db.seed] in
-- config.toml) — NEVER applied to a remote project via `supabase db push`, which
-- only ever runs migrations from supabase/migrations/. Safe to keep known
-- passwords here for that reason.
--
-- One user per role, one ministry, one minister assignment — matches
-- e2e/fixtures/users.ts. Password for all four: "Testing123!".

-- GoTrue requires confirmation_token/recovery_token/email_change*/phone_change*/
-- reauthentication_token to be '' rather than NULL (its Go driver can't scan NULL
-- into a string field) — same fix as 20260415134451_fix_auth_users_null_string_fields.sql,
-- needed here too since this INSERT bypasses GoTrue's normal signup flow.
INSERT INTO auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change,
  email_change_token_new, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token
) VALUES
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'e2e-admin@local.test', crypt('Testing123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'e2e-bursar@local.test', crypt('Testing123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'e2e-finance@local.test', crypt('Testing123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2e00000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'e2e-minister@local.test', crypt('Testing123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}', '{}', now(), now(), '', '', '', '', '', '', '', '');

INSERT INTO auth.identities (
  id, provider_id, user_id, identity_data, provider, created_at, updated_at, last_sign_in_at
) VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'e2e-admin@local.test', 'e2e00000-0000-0000-0000-000000000001', '{"sub":"e2e00000-0000-0000-0000-000000000001","email":"e2e-admin@local.test"}', 'email', now(), now(), now()),
  ('e2e00000-0000-0000-0000-000000000002', 'e2e-bursar@local.test', 'e2e00000-0000-0000-0000-000000000002', '{"sub":"e2e00000-0000-0000-0000-000000000002","email":"e2e-bursar@local.test"}', 'email', now(), now(), now()),
  ('e2e00000-0000-0000-0000-000000000003', 'e2e-finance@local.test', 'e2e00000-0000-0000-0000-000000000003', '{"sub":"e2e00000-0000-0000-0000-000000000003","email":"e2e-finance@local.test"}', 'email', now(), now(), now()),
  ('e2e00000-0000-0000-0000-000000000004', 'e2e-minister@local.test', 'e2e00000-0000-0000-0000-000000000004', '{"sub":"e2e00000-0000-0000-0000-000000000004","email":"e2e-minister@local.test"}', 'email', now(), now(), now());

INSERT INTO public.users (id, full_name, email, roles, status) VALUES
  ('e2e00000-0000-0000-0000-000000000001', 'E2E Admin', 'e2e-admin@local.test', ARRAY['ADMIN']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000002', 'E2E Bursar', 'e2e-bursar@local.test', ARRAY['BURSAR']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000003', 'E2E Finance', 'e2e-finance@local.test', ARRAY['FINANCE']::user_role[], 'ACTIVE'),
  ('e2e00000-0000-0000-0000-000000000004', 'E2E Minister', 'e2e-minister@local.test', ARRAY['MINISTER']::user_role[], 'ACTIVE');

INSERT INTO public.ministries (id, name, description, created_by) VALUES
  ('e2e00000-0000-0000-0000-0000000000a1', 'Ministerio E2E', 'Ministerio de prueba para pruebas e2e', 'e2e00000-0000-0000-0000-000000000001');

INSERT INTO public.ministry_assignments (ministry_id, user_id, assigned_by) VALUES
  ('e2e00000-0000-0000-0000-0000000000a1', 'e2e00000-0000-0000-0000-000000000004', 'e2e00000-0000-0000-0000-000000000001');
