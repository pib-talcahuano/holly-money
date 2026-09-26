# Email Integration (Resend)

Transactional email is sent via **[Resend](https://resend.com)**.
No Gmail or SMTP credentials are required for email.

## Configuration

```env
RESEND_API_KEY="re_..."                                  # From resend.com dashboard
NOTIFICATION_EMAIL="tesoreria@example.com"               # Movement notification recipient
RESEND_TEST_MODE="false"                                 # true: redirect all sends to delivered@resend.dev
```

The sender address is not an env var — it's read from `app_settings.notifications_from_email`
(configurable in `/settings`), falling back to `DEFAULT_FROM_EMAIL` in
`services/email/resend.service.ts` when unset. Whichever address is used must be on a domain
verified in your Resend account.

## Service files

| File                                        | Purpose                                                       |
| ------------------------------------------- | ------------------------------------------------------------- |
| `services/email/resend.service.ts`          | Movement notifications, invite emails, password reset emails  |
| `services/email/workflow-emails.service.ts` | Fund request workflow emails (approval, transfer, settlement) |

## Emails sent

### Auth emails

| Trigger                  | Recipients | Template                              |
| ------------------------ | ---------- | ------------------------------------- |
| User invited by ADMIN    | New user   | Account activation link (2 d expiry)  |
| Password reset requested | User       | Reset link (2 d expiry)               |
| Forgot password flow     | User       | Recovery link (2 d expiry)            |

### Movement notifications

| Trigger                                          | Recipients          | Content                                        |
| ------------------------------------------------ | ------------------- | ----------------------------------------------- |
| Movement created/edited, "Notificar por correo a tesorería" checked | `NOTIFICATION_EMAIL` | Movement detail table (amount, category, etc.) |

### Fund request workflow

| Trigger                         | Recipients                                | Content                                               |
| ------------------------------- | ----------------------------------------- | ----------------------------------------------------- |
| New fund request submitted      | Treasury (`tesoreria_notification_email`) | Request amount, description, review link              |
| Request approved or rejected    | Ministry contact                          | Status (approved/rejected) with detail link           |
| Transfer registered             | Ministry contact                          | Transfer confirmation with 30-day settlement reminder |
| Settlement approved or rejected | Ministry contact                          | Status with detail link                               |

### Reminders

| Trigger                   | Recipients | Content                                                         |
| ------------------------- | ---------- | --------------------------------------------------------------- |
| Scheduled reminder (cron) | Treasury   | Summary of pending requests, settlements, and missing transfers |

## Adding a new email

1. Add a function in the appropriate service file:

```ts
export async function sendMyEmail(opts: { to: string; ... }): Promise<void> {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: FROM_EMAIL,
    to: opts.to,
    subject: `Subject — ${ORG_SHORT}`,
    html: wrapEmail(`...`),
    headers: TRANSACTIONAL_HEADERS,
  })
}
```

2. Call it from the relevant API route or service after the DB operation completes.

## Resend account setup

1. Create an account at [resend.com](https://resend.com).
2. Add and verify your sending domain (DNS records).
3. Create an API key under **API Keys**.
4. Set `RESEND_API_KEY` in your environment, then set the sender address in `/settings`
   (or leave it unset to use the built-in default).

For local development, email sending is skipped when `RESEND_API_KEY` is not set
or when `NOTIFICATION_EMAIL` is empty. To send real emails locally without spending
send quota or reaching a real inbox, set `RESEND_TEST_MODE="true"` — every send is
redirected to Resend's [test address](https://resend.com/docs/dashboard/emails/send-test-emails)
(`delivered@resend.dev`) instead of the real recipient.
