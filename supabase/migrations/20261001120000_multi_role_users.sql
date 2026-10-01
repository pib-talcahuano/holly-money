-- Multi-role users. A user may hold several roles at once (e.g. MINISTER + BURSAR).
--
--   • users.roles  — the full set of roles. Authorization is the union of every role's permissions.
--   • users.role   — kept as the user's PRIMARY role (display / legacy callers). Always a member
--                    of roles; a trigger keeps the two columns consistent, so writers may set
--                    just `role` (seed, create_user_with_role) or just `roles`.
--   • has_any_role(...) replaces get_my_role() = / IN (...) in every RLS policy.
--   • ADMIN is exclusive: an ADMIN cannot hold other roles.
--   • Segregation of duties: nobody can review/settle/transfer their own request.

-- ── column + normalization trigger ──────────────────────────────

ALTER TABLE users ADD COLUMN roles user_role[] NOT NULL DEFAULT '{}';
UPDATE users SET roles = ARRAY[role];

-- Keeps role (primary) and roles (set) consistent on every write:
--   • roles empty/unchanged-by-writer  → roles = {role}
--   • roles changed, role not in it    → role = first member by privilege order
CREATE OR REPLACE FUNCTION users_normalize_roles()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  ordered user_role[];
BEGIN
  IF cardinality(NEW.roles) = 0 THEN
    NEW.roles := ARRAY[NEW.role];
  ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role
        AND NEW.roles IS NOT DISTINCT FROM OLD.roles THEN
    -- only the primary role was edited: replace it in the set
    NEW.roles := ARRAY(SELECT DISTINCT r FROM unnest(array_remove(NEW.roles, OLD.role) || NEW.role) r);
  END IF;

  -- de-duplicate, order by enum declaration (ADMIN, BURSAR, FINANCE, MINISTER, DELEGATE)
  SELECT array_agg(r ORDER BY r) INTO ordered FROM (SELECT DISTINCT unnest(NEW.roles) r) s;
  NEW.roles := ordered;

  IF NOT (NEW.role = ANY (NEW.roles)) THEN
    NEW.role := NEW.roles[1];
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER users_normalize_roles
  BEFORE INSERT OR UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION users_normalize_roles();

ALTER TABLE users
  ADD CONSTRAINT users_roles_admin_exclusive
  CHECK (NOT ('ADMIN' = ANY (roles)) OR cardinality(roles) = 1);

-- ── role helpers ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_my_roles()
RETURNS user_role[] LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT roles FROM users WHERE id = auth.uid()
$$;

-- True when the current user holds ANY of the given roles.
CREATE OR REPLACE FUNCTION has_any_role(VARIADIC p_roles user_role[])
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public AS $$
  SELECT COALESCE((SELECT roles && p_roles FROM users WHERE id = auth.uid()), false)
$$;

REVOKE EXECUTE ON FUNCTION get_my_roles()           FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION has_any_role(user_role[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION get_my_roles()           TO authenticated;
GRANT  EXECUTE ON FUNCTION has_any_role(user_role[]) TO authenticated;

-- get_my_role() is kept (primary role) for any external caller, but no policy uses it anymore.

CREATE OR REPLACE FUNCTION create_user_with_role(
  p_email text, p_password text, p_full_name text, p_role user_role DEFAULT 'FINANCE'
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  new_id UUID;
BEGIN
  IF NOT has_any_role('ADMIN') THEN
    RAISE EXCEPTION 'Only admins can create users';
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

  INSERT INTO users (id, full_name, email, role, status)
  VALUES (new_id, p_full_name, p_email, p_role, 'ACTIVE');

  RETURN new_id;
END;
$$;

-- ── RLS: get_my_role() → has_any_role() ─────────────────────────
-- Mechanical rewrite of every policy that called get_my_role(); semantics are identical for
-- single-role users and become "any held role" for multi-role users.

DROP POLICY "app_settings_insert" ON app_settings;
CREATE POLICY "app_settings_insert" ON app_settings FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN'));

DROP POLICY "app_settings_update" ON app_settings;
CREATE POLICY "app_settings_update" ON app_settings FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN'))
  WITH CHECK (has_any_role('ADMIN'));

DROP POLICY "budget_intentions_insert" ON budget_intentions;
CREATE POLICY "budget_intentions_insert" ON budget_intentions FOR INSERT TO authenticated
  WITH CHECK ((has_any_role('ADMIN') OR (has_any_role('MINISTER', 'DELEGATE') AND (requested_by = auth.uid()))));

DROP POLICY "budget_intentions_select" ON budget_intentions;
CREATE POLICY "budget_intentions_select" ON budget_intentions FOR SELECT TO authenticated
  USING (((requested_by = auth.uid()) OR ((status <> 'DRAFT'::intention_status) AND (has_any_role('ADMIN', 'FINANCE', 'BURSAR') OR (ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))))));

DROP POLICY "budget_intentions_update" ON budget_intentions;
CREATE POLICY "budget_intentions_update" ON budget_intentions FOR UPDATE TO authenticated
  USING ((has_any_role('ADMIN', 'BURSAR') OR (requested_by = auth.uid())))
  WITH CHECK ((has_any_role('ADMIN', 'BURSAR') OR (requested_by = auth.uid())));

DROP POLICY "budget_periods_insert" ON budget_periods;
CREATE POLICY "budget_periods_insert" ON budget_periods FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "budget_periods_update" ON budget_periods;
CREATE POLICY "budget_periods_update" ON budget_periods FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'))
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "expense_settlements_insert" ON expense_settlements;
CREATE POLICY "expense_settlements_insert" ON expense_settlements FOR INSERT TO authenticated
  WITH CHECK ((has_any_role('ADMIN') OR (has_any_role('MINISTER', 'DELEGATE') AND (submitted_by = auth.uid()))));

DROP POLICY "expense_settlements_select" ON expense_settlements;
CREATE POLICY "expense_settlements_select" ON expense_settlements FOR SELECT TO authenticated
  USING (((submitted_by = auth.uid()) OR ((status <> 'DRAFT'::settlement_status) AND (has_any_role('ADMIN', 'FINANCE', 'BURSAR') OR (intention_id IN ( SELECT budget_intentions.id
   FROM budget_intentions
  WHERE (budget_intentions.ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))))))));

DROP POLICY "expense_settlements_update" ON expense_settlements;
CREATE POLICY "expense_settlements_update" ON expense_settlements FOR UPDATE TO authenticated
  USING ((has_any_role('ADMIN', 'BURSAR') OR (submitted_by = auth.uid())))
  WITH CHECK ((has_any_role('ADMIN', 'BURSAR') OR (submitted_by = auth.uid())));

DROP POLICY "inbound_email_routes_delete" ON inbound_email_routes;
CREATE POLICY "inbound_email_routes_delete" ON inbound_email_routes FOR DELETE TO authenticated
  USING (has_any_role('ADMIN'));

DROP POLICY "inbound_email_routes_insert" ON inbound_email_routes;
CREATE POLICY "inbound_email_routes_insert" ON inbound_email_routes FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN'));

DROP POLICY "intention_attachments_insert" ON intention_attachments;
CREATE POLICY "intention_attachments_insert" ON intention_attachments FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "intention_transfers_insert" ON intention_transfers;
CREATE POLICY "intention_transfers_insert" ON intention_transfers FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "intention_transfers_update" ON intention_transfers;
CREATE POLICY "intention_transfers_update" ON intention_transfers FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'))
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministries_insert" ON ministries;
CREATE POLICY "ministries_insert" ON ministries FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministries_update" ON ministries;
CREATE POLICY "ministries_update" ON ministries FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'))
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_assignments_delete" ON ministry_assignments;
CREATE POLICY "ministry_assignments_delete" ON ministry_assignments FOR DELETE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_assignments_insert" ON ministry_assignments;
CREATE POLICY "ministry_assignments_insert" ON ministry_assignments FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_assignments_update" ON ministry_assignments;
CREATE POLICY "ministry_assignments_update" ON ministry_assignments FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'))
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_budgets_insert" ON ministry_budgets;
CREATE POLICY "ministry_budgets_insert" ON ministry_budgets FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_budgets_select" ON ministry_budgets;
CREATE POLICY "ministry_budgets_select" ON ministry_budgets FOR SELECT TO authenticated
  USING ((has_any_role('ADMIN', 'BURSAR', 'FINANCE') OR (ministry_id IN ( SELECT get_my_active_ministries() AS get_my_active_ministries))));

DROP POLICY "ministry_budgets_update" ON ministry_budgets;
CREATE POLICY "ministry_budgets_update" ON ministry_budgets FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'))
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "ministry_delegates_delete" ON ministry_delegates;
CREATE POLICY "ministry_delegates_delete" ON ministry_delegates FOR DELETE TO authenticated
  USING ((has_any_role('ADMIN', 'BURSAR') OR (ministry_id IN ( SELECT get_my_ministries_as_minister() AS get_my_ministries_as_minister))));

DROP POLICY "ministry_delegates_insert" ON ministry_delegates;
CREATE POLICY "ministry_delegates_insert" ON ministry_delegates FOR INSERT TO authenticated
  WITH CHECK ((has_any_role('ADMIN', 'BURSAR') OR (ministry_id IN ( SELECT get_my_ministries_as_minister() AS get_my_ministries_as_minister))));

DROP POLICY "movement_attachments_delete" ON movement_attachments;
CREATE POLICY "movement_attachments_delete" ON movement_attachments FOR DELETE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movement_attachments_insert" ON movement_attachments;
CREATE POLICY "movement_attachments_insert" ON movement_attachments FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movement_categories_insert" ON movement_categories;
CREATE POLICY "movement_categories_insert" ON movement_categories FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movement_categories_update" ON movement_categories;
CREATE POLICY "movement_categories_update" ON movement_categories FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movement_subcategories_insert" ON movement_subcategories;
CREATE POLICY "movement_subcategories_insert" ON movement_subcategories FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movement_subcategories_update" ON movement_subcategories;
CREATE POLICY "movement_subcategories_update" ON movement_subcategories FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movements_insert" ON movements;
CREATE POLICY "movements_insert" ON movements FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "movements_update" ON movements;
CREATE POLICY "movements_update" ON movements FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "payment_methods_insert" ON payment_methods;
CREATE POLICY "payment_methods_insert" ON payment_methods FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "payment_methods_update" ON payment_methods;
CREATE POLICY "payment_methods_update" ON payment_methods FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "payroll_movements_select" ON payroll_movements;
CREATE POLICY "payroll_movements_select" ON payroll_movements FOR SELECT TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "payroll_records_select" ON payroll_records;
CREATE POLICY "payroll_records_select" ON payroll_records FOR SELECT TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "rp_write" ON role_permissions;
CREATE POLICY "rp_write" ON role_permissions FOR ALL TO authenticated
  USING (has_any_role('ADMIN'));

DROP POLICY "settlement_attachments_delete" ON settlement_attachments;
CREATE POLICY "settlement_attachments_delete" ON settlement_attachments FOR DELETE TO authenticated
  USING ((has_any_role('ADMIN', 'BURSAR') OR (EXISTS ( SELECT 1
   FROM expense_settlements es
  WHERE ((es.id = settlement_attachments.settlement_id) AND (es.submitted_by = auth.uid()) AND (es.status = ANY (ARRAY['DRAFT'::settlement_status, 'PENDING'::settlement_status, 'RETURNED_FOR_CORRECTION'::settlement_status])))))));

DROP POLICY "settlement_attachments_insert" ON settlement_attachments;
CREATE POLICY "settlement_attachments_insert" ON settlement_attachments FOR INSERT TO authenticated
  WITH CHECK ((has_any_role('ADMIN', 'BURSAR') OR (EXISTS ( SELECT 1
   FROM expense_settlements es
  WHERE ((es.id = settlement_attachments.settlement_id) AND (es.submitted_by = auth.uid()))))));

DROP POLICY "severance_reserve_adjustments_insert" ON severance_reserve_adjustments;
CREATE POLICY "severance_reserve_adjustments_insert" ON severance_reserve_adjustments FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "severance_reserve_adjustments_select" ON severance_reserve_adjustments;
CREATE POLICY "severance_reserve_adjustments_select" ON severance_reserve_adjustments FOR SELECT TO authenticated
  USING (has_any_role('ADMIN', 'BURSAR'));

DROP POLICY "users_insert" ON users;
CREATE POLICY "users_insert" ON users FOR INSERT TO authenticated
  WITH CHECK (has_any_role('ADMIN'));

DROP POLICY "users_update" ON users;
CREATE POLICY "users_update" ON users FOR UPDATE TO authenticated
  USING (has_any_role('ADMIN'));


-- ── segregation of duties ───────────────────────────────────────
-- A user holding both a requester role (MINISTER) and a reviewer role (BURSAR) must never
-- approve, settle or transfer funds for their own request. Enforced for every writer
-- (including the service-role client), not just RLS.

CREATE OR REPLACE FUNCTION enforce_intention_no_self_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reviewed_by IS NOT NULL
     AND NEW.reviewed_by = NEW.requested_by
     AND (TG_OP = 'INSERT' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by) THEN
    RAISE EXCEPTION 'No puedes revisar tu propia solicitud' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER budget_intentions_no_self_review
  BEFORE INSERT OR UPDATE ON budget_intentions
  FOR EACH ROW EXECUTE FUNCTION enforce_intention_no_self_review();

CREATE OR REPLACE FUNCTION enforce_settlement_no_self_review()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.reviewed_by IS NOT NULL
     AND NEW.reviewed_by = NEW.submitted_by
     AND (TG_OP = 'INSERT' OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by) THEN
    RAISE EXCEPTION 'No puedes revisar tu propia rendición' USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER expense_settlements_no_self_review
  BEFORE INSERT OR UPDATE ON expense_settlements
  FOR EACH ROW EXECUTE FUNCTION enforce_settlement_no_self_review();

CREATE OR REPLACE FUNCTION enforce_transfer_no_self_registration()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM budget_intentions bi
    WHERE bi.id = NEW.intention_id AND bi.requested_by = NEW.registered_by
  ) THEN
    RAISE EXCEPTION 'No puedes registrar la transferencia de tu propia solicitud'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER intention_transfers_no_self_registration
  BEFORE INSERT ON intention_transfers
  FOR EACH ROW EXECUTE FUNCTION enforce_transfer_no_self_registration();
