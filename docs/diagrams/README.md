# Flow diagrams

Interactive [Archify](https://github.com/tt-a1i/archify) diagrams for the key app flows. Content is
in Spanish (matching the app's UI language). These are self-contained HTML files — GitHub won't
render them inline, so review them locally with:

```bash
pnpm docs
```

which serves this folder locally and opens [`gallery.html`](gallery.html) — a browsable, filterable
gallery with a live (not screenshotted) preview of every diagram, in light or dark. A plain
`open gallery.html` also works for a quick look, but its embedded previews are more reliable
served over `http://` than `file://` (some browsers restrict nested `file://` iframes), which is
exactly what `pnpm docs` does. Or open one diagram directly, e.g.
`open docs/diagrams/00-architecture.html`.

Each diagram's authoring spec lives alongside in [`src/`](src/) so it can be edited without
reverse-engineering the rendered SVG — regenerate with the `archify` skill/CLI after editing a spec,
then update its card in `gallery.html` if the title/description/type changed.

- [`00-architecture.html`](00-architecture.html) — system architecture: Next.js App Router → service layer → Supabase (Postgres/Auth/Storage), RBAC, and the Resend/admin-client side-effects.
- [`01-file-uploading.html`](01-file-uploading.html) — attachment upload: client-side compression → server action → server-side (sharp) re-compression → Supabase Storage; retrieval via signed URL through `/api/attachments/[bucket]/[...path]`.
- [`02-account-creation.html`](02-account-creation.html) — ADMIN invite → Resend email → `/activate` → `PENDING_ACTIVATION` to `ACTIVE`.
- [`03-requests-flow.html`](03-requests-flow.html) — full budget intentions workflow: draft → submit → review → transfer or reimbursement → settlement (with correction loop) → settlement review → movement.
- [`04-password-recovery.html`](04-password-recovery.html) — forgot-password → recovery link → `/activate` (`PENDING_RESET` to `ACTIVE`), no-enumeration behavior on unknown/inactive emails.
- [`05-email-send-receive.html`](05-email-send-receive.html) — outbound notifications via Resend/React Email (movement, workflow, reminder events), plus inbound alias forwarding via the Resend inbound webhook (`inbound_email_routes`).
- [`06-roles-and-permissions.html`](06-roles-and-permissions.html) — how `getCurrentUser()` resolves and caches a user's effective permissions on every request.
- [`06-permission-matrix-edit.html`](06-permission-matrix-edit.html) — how an ADMIN edits the live permission matrix from `/settings/permissions` and how the 24h cache gets invalidated instantly.
- [`07a-login.html`](07a-login.html) — login via `signInWithPassword` + route protection in `proxy.ts`.
- [`07b-impersonation-start.html`](07b-impersonation-start.html) — an ADMIN starting an impersonation session.
- [`07c-impersonation-resolve.html`](07c-impersonation-resolve.html) — how every request resolves real vs. impersonated identity, including auto-expiry and auto-termination.
- [`08-ministry-budget.html`](08-ministry-budget.html) — per-ministry budget periods (Etapa 10): `get_ministry_budget_summary` resolving the current period and summing TRANSFER vs. REIMBURSEMENT consumption, the DB-level no-overlap constraint, and the initial-load admin path.

Diagrams reflect the code as of this branch; see `docs/flows.md`, `docs/roles.md`, and
`docs/architecture.md` for the prose version. The permission matrix table itself lives in
`docs/roles.md`, not as a diagram.
