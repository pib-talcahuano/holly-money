-- Multi-role users: users.role (single enum) becomes users.roles (user_role[]).
-- ADMIN and DELEGATE stay single-role; BURSAR/FINANCE/MINISTER combine freely.
-- Also makes ministries ADMIN-only (spec section 5): BURSAR loses MANAGE_MINISTRIES and the
-- ministries / ministry_assignments write policies.

-- ── 1. Column + validity rule ────────────────────────────────────────────────
ALTER TABLE users ADD COLUMN roles user_role[];
UPDATE users SET roles = ARRAY[role];
ALTER TABLE users ALTER COLUMN roles SET NOT NULL;
ALTER TABLE users ALTER COLUMN roles SET DEFAULT ARRAY['FINANCE']::user_role[];

-- A function (not an inline expression) because the distinct-count needs a subquery, which
-- CHECK constraints can't contain directly.
CREATE FUNCTION users_roles_valid(p_roles user_role[]) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT cardinality(p_roles) >= 1
     AND array_position(p_roles, NULL) IS NULL
     AND cardinality(p_roles) = (SELECT count(DISTINCT r) FROM unnest(p_roles) AS r)
     AND (cardinality(p_roles) = 1 OR NOT (p_roles && ARRAY['ADMIN', 'DELEGATE']::user_role[]))
$$;

ALTER TABLE users ADD CONSTRAINT users_roles_valid_check CHECK (users_roles_valid(roles));

-- ── 2. RLS helper (replaces get_my_role()) ───────────────────────────────────
CREATE OR REPLACE FUNCTION has_any_role(p_roles text[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public, pg_temp AS $$
  SELECT COALESCE((SELECT roles::text[] && p_roles FROM users WHERE id = auth.uid()), false)
$$;

REVOKE EXECUTE ON FUNCTION has_any_role(text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION has_any_role(text[]) TO authenticated, service_role;

-- ── 3. Policies ──────────────────────────────────────────────────────────────
-- Policies rewritten from get_my_role() to has_any_role(). Generated from the live
-- pg_policies definitions and reviewed; ministry/assignment writes are now ADMIN-only.

DROP POLICY "app_settings_insert" ON public.app_settings;
CREATE POLICY "app_settings_insert" ON public.app_settings AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "app_settings_update" ON public.app_settings;
CREATE POLICY "app_settings_update" ON public.app_settings AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "budget_intentions_insert" ON public.budget_intentions;
CREATE POLICY "budget_intentions_insert" ON public.budget_intentions AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((has_any_role(ARRAY['ADMIN'])) OR ((has_any_role(ARRAY['MINISTER', 'DELEGATE'])) AND (requested_by = auth.uid()))));

DROP POLICY "budget_intentions_select" ON public.budget_intentions;
CREATE POLICY "budget_intentions_select" ON public.budget_intentions AS PERMISSIVE FOR SELECT TO authenticated
  USING (((requested_by = auth.uid()) OR ((status <> 'DRAFT'::intention_status) AND ((has_any_role(ARRAY['ADMIN', 'FINANCE', 'BURSAR'])) OR (ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))))));

DROP POLICY "budget_intentions_update" ON public.budget_intentions;
CREATE POLICY "budget_intentions_update" ON public.budget_intentions AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (requested_by = auth.uid())))
  WITH CHECK (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (requested_by = auth.uid())));

DROP POLICY "budget_periods_insert" ON public.budget_periods;
CREATE POLICY "budget_periods_insert" ON public.budget_periods AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "budget_periods_update" ON public.budget_periods;
CREATE POLICY "budget_periods_update" ON public.budget_periods AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "expense_settlements_insert" ON public.expense_settlements;
CREATE POLICY "expense_settlements_insert" ON public.expense_settlements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((has_any_role(ARRAY['ADMIN'])) OR ((has_any_role(ARRAY['MINISTER', 'DELEGATE'])) AND (submitted_by = auth.uid()))));

DROP POLICY "expense_settlements_select" ON public.expense_settlements;
CREATE POLICY "expense_settlements_select" ON public.expense_settlements AS PERMISSIVE FOR SELECT TO authenticated
  USING (((submitted_by = auth.uid()) OR ((status <> 'DRAFT'::settlement_status) AND ((has_any_role(ARRAY['ADMIN', 'FINANCE', 'BURSAR'])) OR (intention_id IN ( SELECT budget_intentions.id
   FROM budget_intentions
  WHERE (budget_intentions.ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))))))));

DROP POLICY "expense_settlements_update" ON public.expense_settlements;
CREATE POLICY "expense_settlements_update" ON public.expense_settlements AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (submitted_by = auth.uid())))
  WITH CHECK (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (submitted_by = auth.uid())));

DROP POLICY "inbound_email_routes_delete" ON public.inbound_email_routes;
CREATE POLICY "inbound_email_routes_delete" ON public.inbound_email_routes AS PERMISSIVE FOR DELETE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "inbound_email_routes_insert" ON public.inbound_email_routes;
CREATE POLICY "inbound_email_routes_insert" ON public.inbound_email_routes AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "intention_attachments_insert" ON public.intention_attachments;
CREATE POLICY "intention_attachments_insert" ON public.intention_attachments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "intention_transfers_insert" ON public.intention_transfers;
CREATE POLICY "intention_transfers_insert" ON public.intention_transfers AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "intention_transfers_update" ON public.intention_transfers;
CREATE POLICY "intention_transfers_update" ON public.intention_transfers AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "ministries_insert" ON public.ministries;
CREATE POLICY "ministries_insert" ON public.ministries AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "ministries_update" ON public.ministries;
CREATE POLICY "ministries_update" ON public.ministries AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "ministry_assignments_delete" ON public.ministry_assignments;
CREATE POLICY "ministry_assignments_delete" ON public.ministry_assignments AS PERMISSIVE FOR DELETE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "ministry_assignments_insert" ON public.ministry_assignments;
CREATE POLICY "ministry_assignments_insert" ON public.ministry_assignments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "ministry_assignments_update" ON public.ministry_assignments;
CREATE POLICY "ministry_assignments_update" ON public.ministry_assignments AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "ministry_budgets_insert" ON public.ministry_budgets;
CREATE POLICY "ministry_budgets_insert" ON public.ministry_budgets AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "ministry_budgets_select" ON public.ministry_budgets;
CREATE POLICY "ministry_budgets_select" ON public.ministry_budgets AS PERMISSIVE FOR SELECT TO authenticated
  USING (((has_any_role(ARRAY['ADMIN', 'BURSAR', 'FINANCE'])) OR (ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))));

DROP POLICY "ministry_budgets_update" ON public.ministry_budgets;
CREATE POLICY "ministry_budgets_update" ON public.ministry_budgets AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])))
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "ministry_delegates_delete" ON public.ministry_delegates;
CREATE POLICY "ministry_delegates_delete" ON public.ministry_delegates AS PERMISSIVE FOR DELETE TO authenticated
  USING (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (ministry_id IN ( SELECT get_my_ministries_as_minister() AS get_my_ministries_as_minister))));

DROP POLICY "ministry_delegates_insert" ON public.ministry_delegates;
CREATE POLICY "ministry_delegates_insert" ON public.ministry_delegates AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (ministry_id IN ( SELECT get_my_ministries_as_minister() AS get_my_ministries_as_minister))));

DROP POLICY "movement_attachments_delete" ON public.movement_attachments;
CREATE POLICY "movement_attachments_delete" ON public.movement_attachments AS PERMISSIVE FOR DELETE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movement_attachments_insert" ON public.movement_attachments;
CREATE POLICY "movement_attachments_insert" ON public.movement_attachments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movement_categories_insert" ON public.movement_categories;
CREATE POLICY "movement_categories_insert" ON public.movement_categories AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movement_categories_update" ON public.movement_categories;
CREATE POLICY "movement_categories_update" ON public.movement_categories AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movement_subcategories_insert" ON public.movement_subcategories;
CREATE POLICY "movement_subcategories_insert" ON public.movement_subcategories AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movement_subcategories_update" ON public.movement_subcategories;
CREATE POLICY "movement_subcategories_update" ON public.movement_subcategories AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movements_insert" ON public.movements;
CREATE POLICY "movements_insert" ON public.movements AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "movements_update" ON public.movements;
CREATE POLICY "movements_update" ON public.movements AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "payment_methods_insert" ON public.payment_methods;
CREATE POLICY "payment_methods_insert" ON public.payment_methods AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "payment_methods_update" ON public.payment_methods;
CREATE POLICY "payment_methods_update" ON public.payment_methods AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "payroll_movements_select" ON public.payroll_movements;
CREATE POLICY "payroll_movements_select" ON public.payroll_movements AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "payroll_records_select" ON public.payroll_records;
CREATE POLICY "payroll_records_select" ON public.payroll_records AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "rp_write" ON public.role_permissions;
CREATE POLICY "rp_write" ON public.role_permissions AS PERMISSIVE FOR ALL TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "settlement_attachments_delete" ON public.settlement_attachments;
CREATE POLICY "settlement_attachments_delete" ON public.settlement_attachments AS PERMISSIVE FOR DELETE TO authenticated
  USING (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (EXISTS ( SELECT 1
   FROM expense_settlements es
  WHERE ((es.id = settlement_attachments.settlement_id) AND (es.submitted_by = auth.uid()) AND (es.status = ANY (ARRAY['DRAFT'::settlement_status, 'PENDING'::settlement_status, 'RETURNED_FOR_CORRECTION'::settlement_status])))))));

DROP POLICY "settlement_attachments_insert" ON public.settlement_attachments;
CREATE POLICY "settlement_attachments_insert" ON public.settlement_attachments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((has_any_role(ARRAY['ADMIN', 'BURSAR'])) OR (EXISTS ( SELECT 1
   FROM expense_settlements es
  WHERE ((es.id = settlement_attachments.settlement_id) AND (es.submitted_by = auth.uid()))))));

DROP POLICY "severance_reserve_adjustments_insert" ON public.severance_reserve_adjustments;
CREATE POLICY "severance_reserve_adjustments_insert" ON public.severance_reserve_adjustments AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "severance_reserve_adjustments_select" ON public.severance_reserve_adjustments;
CREATE POLICY "severance_reserve_adjustments_select" ON public.severance_reserve_adjustments AS PERMISSIVE FOR SELECT TO authenticated
  USING ((has_any_role(ARRAY['ADMIN', 'BURSAR'])));

DROP POLICY "users_insert" ON public.users;
CREATE POLICY "users_insert" ON public.users AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((has_any_role(ARRAY['ADMIN'])));

DROP POLICY "users_update" ON public.users;
CREATE POLICY "users_update" ON public.users AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((has_any_role(ARRAY['ADMIN'])));


-- ── 4. Drop the single-role helpers and column ───────────────────────────────
DROP FUNCTION get_my_role();
ALTER TABLE users DROP COLUMN role;

-- Unused by the app (users are created via usersService.invite); superseded rather than ported.
DROP FUNCTION IF EXISTS create_user_with_role(TEXT, TEXT, TEXT, user_role);

CREATE OR REPLACE FUNCTION create_initial_admin(p_email TEXT, p_password TEXT, p_full_name TEXT)
RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  IF EXISTS (SELECT 1 FROM users LIMIT 1) THEN
    RAISE EXCEPTION 'Initial admin already exists';
  END IF;

  new_id := gen_random_uuid();

  INSERT INTO auth.users (
    id, email, encrypted_password, email_confirmed_at,
    raw_user_meta_data, raw_app_meta_data,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token,
    created_at, updated_at, role, aud, instance_id
  ) VALUES (
    new_id, p_email,
    crypt(p_password, gen_salt('bf')),
    NOW(),
    jsonb_build_object('full_name', p_full_name),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '', '', '', '', '', '', '', '',
    NOW(), NOW(),
    'authenticated', 'authenticated',
    '00000000-0000-0000-0000-000000000000'
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at
  ) VALUES (
    new_id, new_id,
    jsonb_build_object('sub', new_id::text, 'email', p_email),
    'email', p_email,
    NOW(), NOW(), NOW()
  );

  INSERT INTO users (id, full_name, email, roles, status)
  VALUES (new_id, p_full_name, p_email, ARRAY['ADMIN']::user_role[], 'ACTIVE');

  RETURN new_id;
END;
$$;

-- ── 5. Ministries are ADMIN-only: BURSAR loses MANAGE_MINISTRIES ─────────────
-- (budgets keep their own page and MANAGE_BUDGETS; see the /budgets route)
UPDATE role_permissions SET enabled = false
WHERE role = 'BURSAR' AND permission = 'MANAGE_MINISTRIES';
