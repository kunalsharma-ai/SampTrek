# Integrations (Settings → Integrations)

Every integration is set up by an admin in the app at **Settings → Integrations** (`/settings/integrations`), and every API key and secret is kept in the database (encrypted). None is read from `.env` or any other server file, so nobody has to edit server files or restart anything. Only the database address and the master keys stay in `.env` (see [What stays in .env](#what-stays-in-env)). Each card has the fields, step-by-step help with links to where each key comes from, the redirect URI to copy, and a **Test connection** button.

| Integration | Who sets it | What the test checks |
| --- | --- | --- |
| Email sending (Zoho Mail SMTP) | Each organisation's admin | Signs in to the SMTP server and sends a test email to you |
| Sign in with Google / Microsoft / Zoho | Admins of the organisation that runs the server | Asks the provider's token endpoint whether it accepts the client ID and secret |
| Google Gemini, Anthropic Claude, OpenAI, Groq, OpenRouter, Mistral, DeepSeek, own AI server (Ollama or any OpenAI-compatible API) | Each organisation's admin | The key is accepted and the chosen models are available to it. Several can be set up; the copilot tries them in the order set in Settings → AI copilot (docs/AI_COPILOT.md) |
| Zoho Books | Each organisation's admin | Refreshes the token and finds the Books organisation |
| Xero, QuickBooks Online | Admins of the organisation that runs the server (the app); each organisation then presses Connect on the Accounting page for its own company | Asks Xero/Intuit whether they accept the client ID and secret |
| Tally Prime | Admins of the organisation that runs the server only | Lists the companies open in Tally |
| SampBidx link | Each organisation's admin | – |
| Push notifications (phone app, Expo) | Admins of the organisation that runs the server | Sends a test push to your own phones that are signed in to the app |
| Backup storage (server folder, Cloudflare R2, Backblaze B2, any S3 bucket) | Admins of the organisation that runs the server only | Writes, reads and deletes a test file, and checks `mongodump` (docs/BACKUPS.md) |
| IP and proxy reputation (fraud checks) | Each organisation's admin | Says which free IP lists are loaded, and asks proxycheck.io whether it accepts the free key. See [FRAUD_CHECKS.md](FRAUD_CHECKS.md) |

Captcha keys, the SampBidx webhook secret, alert webhooks and API keys were already set in the app (Settings, and Settings → API and webhooks).

The SampAudience connection (audiences from the SUPPLY360 panels) is set here too, under **SampAudience**, by the admins of the organisation that runs the server; see [SAMPLEON_INTEGRATION.md](SAMPLEON_INTEGRATION.md).

## Who "runs the server"

Sign-in and Xero/QuickBooks apps are one per SampTrek server (one OAuth app serves every organisation), and Tally reaches a private office network. These are set by the admins of the **server owner organisation**: the one with `Organization.platformOwner = true`, or the oldest organisation when none is marked. The migration marks the oldest one. Admins of other organisations see the status and a note instead of the form.

For the same reason, only the server owner can point the SMTP server at a private address in production.

## Sharing a default with every organisation

Email, AI (every provider), IP and proxy reputation and the SampBidx link are set per organisation. On these cards the server owner's admins also see **Also use for organisations that have not set up their own**. When it is ticked, every organisation without its own setting uses the owner's one (the card shows **Server default**). Those organisations never see the mailbox, key or other values, and saving their own setting replaces the default for them. This is what one shared value in `.env` used to do.

## Zoho Books without curl

Paste the Self Client ID and secret, then the **grant code** from the API console's Generate Code tab (scope `ZohoBooks.fullaccess.all`, 10 minutes). On save SampTrek swaps the code for a refresh token and fills in the Books organization ID when your Zoho login has only one. The binding to `ZOHO_BOOKS_TENANT` is no longer needed: settings saved in the app belong to the organisation that saved them.

## How secrets are kept

- Secret fields (passwords, client secrets, API keys, refresh tokens) are encrypted with AES-256-GCM before they are stored (`IntegrationSetting.secrets`) and are never sent back to the browser. Leave a secret empty to keep the saved one.
- The audit log records who saved, tested or removed an integration and which fields changed, never the values.
- Changing a setting clears its last test result.

## Servers that still have keys in .env

Older servers kept keys in `.env` (`SMTP_*`, `GOOGLE_*`, `MICROSOFT_*`, `ZOHO_CLIENT_*`, `GEMINI_API_KEY`/`AI_*`, `ZOHO_BOOKS_*`, `XERO_*`, `QUICKBOOKS_*`, `TALLY_*`, `SAMPLEON_*`, `RAZORPAY_*`, `STRIPE_*`, `EXPO_*`, `BACKUP_*`, `PROXYCHECK_API_KEY`). SampTrek no longer reads them (the AI providers added on 2026-11-18 were never read from `.env`). Instead, the first time the API starts after the upgrade it copies each one into Settings → Integrations, encrypted, once:

- Platform settings (sign-in apps, Xero, QuickBooks, SampAudience, payments, push, backups) go to the organisation that runs the server.
- Zoho Books and Tally go to the organisation their `ZOHO_BOOKS_TENANT` / `TALLY_TENANT` names.
- Email, AI and IP reputation go to the organisation that runs the server and are shared as the default, because the `.env` values applied to every organisation.
- A setting already saved in the app is never overwritten, and a setting removed in the app later is not brought back from a leftover `.env` line (each copied kind is recorded in the `EnvImport` collection).
- The audit log gets an `integration.imported` entry (field names only), and the API log lists the `.env` lines that can now be deleted.

Nothing else changes for people using the app. After the first start, delete those lines from `.env`. If the server has no organisation yet (a new install), there is nothing to copy: enter the keys on this page after creating the admin.

## What stays in .env

Only what SampTrek needs to reach its database and protect what it stores there, before anyone can sign in. These cannot live in the database: the database address is needed to open it, and the master key must not be stored next to the secrets it encrypts.

| Variable | Why |
| --- | --- |
| `DATABASE_URL` | Where the database is |
| `JWT_SECRET` | Signs sign-in sessions |
| `MFA_ENCRYPTION_KEY` | Master key for saved secrets (integrations, accounting tokens, authenticator apps). Set it once and never change it. `INTEGRATIONS_ENCRYPTION_KEY` and `ACCOUNTING_ENCRYPTION_KEY` can override it, but are optional |
| `PUBLIC_BASE_URL` | Public address of the API, used in links and redirect URIs |
| `WEB_ORIGIN` | Address of the web app |
| `NEXT_PUBLIC_API_URL` (web) | Where the web app finds the API |

Background job switches (`*_SCHEDULER_ENABLED`, `MONITOR_ENABLED`, `CALLBACK_WORKER_ENABLED`) default to on and only need setting to run several API instances; see `apps/api/.env.example`. None of them is a key. Test-only address overrides (`*_API_URL`, `*_TOKEN_URL`, `GEMINI_API_URL`) and `XERO_SCOPES` (old Xero apps only) are not keys either and stay optional env settings.

`BACKUP_PASSPHRASE` can still be given to the `pnpm restore-backup` command on a new server, where the database (and the saved passphrase) is what is being restored. It is typed at the prompt, or set only for that one command, never kept in `.env`.

## API

All admin-only, under `/api/v1/integrations/settings`:

- `GET /` – every integration with status, help steps, non-secret values and which secrets are set
- `PUT /:kind` – `{ values: { FIELD: "value" | "" | null }, serverDefault?: boolean }`; empty keeps a secret, `null` removes it; `serverDefault` (server owner only, email/AI/IP reputation/SampBidx) shares it with organisations that have none
- `DELETE /:kind` – remove the saved settings and their keys from the database
- `POST /:kind/test` – `{ ok, message, integration }`

Kinds: `sampleon`, `smtp`, `sso_google`, `sso_microsoft`, `sso_zoho`, `gemini`, `anthropic`, `openai`, `groq`, `openrouter`, `mistral`, `deepseek`, `openai_compatible`, `zoho_books`, `xero`, `quickbooks`, `tally`, `bidzo` (the SampBidx link; the kind keeps its old name, see docs/SAMPBIDX_INTEGRATION.md), `razorpay`, `stripe`, `push`, `backup_storage`, `ip_reputation`.
