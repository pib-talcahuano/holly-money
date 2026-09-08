# E2E tests (Playwright)

Local-only. Not run in CI — there's no seeded Supabase instance or running dev
server there. Two purposes: (1) functional coverage of every screen/flow across
all 8 roadmap etapas, using real browser interaction; (2) a design-reference
screenshot generator — every screen, form, and modal gets captured to
`docs/screenshots/`, which is committed to the repo for the upcoming redesign
pass.

## One-time setup

```bash
pnpm supabase db reset   # applies migrations + supabase/seed.sql (test users)
pnpm dev                 # in a separate terminal, must stay running
```

`db reset` wipes your local Supabase data and reseeds it — only run this if
you're OK losing whatever's currently in your local dev database.

## Running

```bash
pnpm test:e2e                          # full suite
pnpm test:e2e e2e/05-requests.spec.ts   # one file
pnpm test:e2e --headed                 # watch it run
```

Screenshots land in `docs/screenshots/<section>/<name>.png`, overwritten on
each run.

## Test users (`supabase/seed.sql`, `e2e/fixtures/users.ts`)

All four use password `Testing123!`. These only exist locally — `seed.sql` is
loaded by `db reset`, never applied to a remote project (which only ever runs
`supabase/migrations/`), so committing a known password here is safe.

| Role | Email |
|---|---|
| ADMIN | `e2e-admin@local.test` |
| BURSAR | `e2e-bursar@local.test` |
| FINANCE | `e2e-finance@local.test` |
| MINISTER | `e2e-minister@local.test` (assigned to "Ministerio E2E") |

## Gotchas

- **`05-requests.spec.ts`'s transfer-registration step uploads a real file.**
  Registering a transfer requires at least one comprobante
  (`registerTransferSchema`), and `AttachmentInput` uploads to Supabase Storage
  as soon as a file is selected. This works against the local Supabase stack
  every other e2e test already depends on — no extra credentials needed.
- **`01-movements.spec.ts` uploads `fixtures/large-receipt.jpg`** (a 3200×2400
  ~5.5 MB JPEG) to exercise the client + server image-compression path and
  assert the stored size the UI reports is a fraction of the original.
- **Payroll is one-record-per-calendar-month.** `06-payroll.spec.ts` registers
  a payroll for the current month — rerunning it in the same month without a
  `db reset` in between will hit the uniqueness guard and fail. That's the
  real app behavior working correctly, not a test bug.
- **Toggling `@playwright/test` in `package.json` corrupts the dev server's
  Turbopack cache.** If pages stop hydrating (forms silently submit as a
  native GET instead of via React, visible as `?email=...&password=...` in
  the URL), stop `pnpm dev`, `rm -rf .next`, and restart it.
- **Login helper waits for hydration explicitly** (`e2e/fixtures/helpers.ts`)
  — clicking "Ingresar" before the client component hydrates falls through to
  the raw `<form>`'s native submission instead of `react-hook-form`'s handler.
- **Date pickers**: this app's `DatePicker` (Base UI `Popover`) doesn't
  reliably close on `Escape` or an outside click in headless runs — the
  `pickToday()` helper closes it by clicking the same trigger again instead
  (toggle behavior), which is reliable.
