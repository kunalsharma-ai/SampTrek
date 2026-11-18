# AI copilot and voice assistant

> **Set up in the app.** An admin adds AI provider keys and models in **Settings → Integrations → AI** (see `docs/INTEGRATIONS.md`) and picks the order under **Settings → AI copilot**. Keys are kept encrypted in the database and are never read from the server environment.

SampTrek's copilot answers questions about projects, fieldwork, tasks, the team and finance, reads briefs into project drafts, and proposes changes that a person confirms. It talks to the model through a provider-independent gateway (`apps/api/src/ai/provider.ts`) with three implementations:

| File | Providers |
| --- | --- |
| `gemini.provider.ts` | Google Gemini (AI Studio key). The only one with live voice and tap-to-talk speech-to-text. |
| `anthropic.provider.ts` | Anthropic Claude (Messages API, plain HTTP). |
| `openai.provider.ts` | Everything with an OpenAI-style chat completions API: OpenAI, Groq, OpenRouter, Mistral, DeepSeek, and an own server (Ollama, LM Studio, vLLM). |

## Providers (added 2026-11-18)

| Integration | Free? | Reads PDFs / images | Default main → fallback model |
| --- | --- | --- | --- |
| Google Gemini (`gemini`) | Free tier | Both, plus audio | `gemini-3.8-flash` → `gemini-3.5-flash-lite`, voice `gemini-3.8-live` |
| Anthropic Claude (`anthropic`) | Paid | Both | `claude-opus-5-5` → `claude-haiku-5-5` |
| OpenAI (`openai`) | Paid | Both | `gpt-5-mini` → `gpt-5-nano` |
| Groq (`groq`) | Free tier | Text only | `llama-3.3-70b-versatile` → `llama-3.1-8b-instant` |
| OpenRouter (`openrouter`) | Free `:free` models | PDFs | `meta-llama/llama-3.3-70b-instruct:free` |
| Mistral (`mistral`) | Free Experiment plan | Images | `mistral-small-latest` → `open-mistral-nemo` |
| DeepSeek (`deepseek`) | Low cost | Text only | `deepseek-chat` |
| Own AI server (`openai_compatible`) | Free (self-hosted) | Text only | set on the card, e.g. `llama3.1` |

Model names move often, so each is a field on the card. **Test** lists the provider's models with the key and says if a chosen model is not there. Pick models that support tool (function) calling. Text files (TXT, Markdown, CSV, HTML, JSON) are sent as text to every provider.

**Order and fallback.** Settings → AI copilot lists the providers in the order they are tried (`aiSettings.providers`; default Gemini, Claude, OpenAI, Groq, OpenRouter, Mistral, DeepSeek, own server). For each question SampTrek tries the first provider's main model, then its fallback model, then the next provider, and so on. It moves on when a provider is busy or its free allowance is used up (429), has no credit (402), refuses the key (401/403, the fallback model of that key is skipped), refuses the request (400/404) or is down. It stops only when the AI declines the message. The tool steps of one question stay with the provider that answered the first step. Every failed try is logged in `AiUsage` (provider, model, error), so the usage table shows which key ran out. Requests with a PDF or image only go to providers that read them; tap-to-talk only goes to Gemini. Live voice needs Gemini; without it the app uses the browser's speech with the normal chat, which works with any provider.

**Own server.** For Ollama run `ollama pull llama3.1`, start it with `OLLAMA_HOST=0.0.0.0`, and enter `http://<host>:11434/v1` with no key. Only the organisation that runs the SampTrek server may enter a private or `http://` address (other organisations need a public `https://` one, checked on save).

**Plans.** One plan feature, `integration.gemini` ("AI providers"), covers every AI provider, so plans made before keep working. The server owner can share any AI card as the server default, like the Gemini card.

## Gemini setup

1. Sign in to Google AI Studio (aistudio.google.com) with the Google account that should own the key, and create an API key in a Google Cloud project used only for SampTrek.
2. Paste it on the **Google Gemini** card in Settings → Integrations, save and press Test.
3. The copilot appears in the menu and as the sparkle button in the header. Admins can tune it in **Settings → AI copilot**.

Fields on the card:

| Field | Default | Meaning |
| --- | --- | --- |
| `AI_MODEL` | `gemini-3.8-flash` | Model for chat, tools and documents |
| `AI_FALLBACK_MODEL` | `gemini-3.5-flash-lite` | Tried once when the main model fails, before the next provider |
| `AI_LIVE_MODEL` | `gemini-3.8-live` | Model for spoken conversations |

`GEMINI_API_URL`, `ANTHROPIC_API_URL`, `OPENAI_API_URL`, `GROQ_API_URL`, `OPENROUTER_API_URL`, `MISTRAL_API_URL` and `DEEPSEEK_API_URL` in the env only change the address, for tests or a private gateway; they are not keys.

Without any AI provider in Settings → Integrations (the organisation's own, or the server owner's shared default) the copilot says it is not set up and makes no calls.

## Models, limits and cost (checked 2026-11-02)

- On Gemini's free tier the stable text models include `gemini-3.8-flash`, `gemini-3.6-flash`, `gemini-3.5-flash-lite` and `gemini-3.1-flash-lite`. The larger `gemini-4-argon` is paid only. `gemini-3.8-live` is the free Live (voice) model.
- Google shows the exact free-tier rate limits only in AI Studio (aistudio.google.com/rate-limit). Limits apply per Google Cloud project; daily limits reset at midnight Pacific time. Over the limit Gemini answers 429, which SampTrek shows as "The AI service is busy" after one try on the fallback model.
- SampTrek's own limits sit in front of Gemini (Settings → AI copilot): questions per person per minute (default 8) and per day (100), and per organisation per day (1000). Keep them under your Gemini plan. Tool follow-up rounds inside one question do not count against the person.
- **Data use on the free tier:** Google's terms say free-tier prompts and answers may be used to improve Google's products. That includes the project, client and finance details the copilot looks up. Before using the copilot with confidential client work, turn on billing for the Google Cloud project (paid tier data is not used that way). The settings page shows this warning.

## What it can do

Every tool runs on the server as the person asking, inside their organisation and role. The model never sees a record the person could not open in the app, and tables and charts are built from records, not by the model.

Read tools (all staff roles the admin allows):

- `list_projects`, `project_details`, `fieldwork_status`, `delayed_projects`, `activity_summary` (today's or a period's activity)
- `list_tasks`, `team_workload`, `list_people`
- `performance_report` (overall/client/vendor numbers), `finance_overview`, `list_invoices`, `list_vendor_bills` (money kept per currency)
- `reallocation_suggestions` (quota cells)

Actions (shown as a card; nothing changes until the person presses **Confirm**):

- `create_task` (admins and project managers), `update_task` (editors; others only their own tasks' status and notes)
- `create_project` (asks for LOI, IR and CPI if missing)
- `set_project_status`, `set_vendor_link_status`, `run_fieldwork_check`

A proposal expires after 30 minutes. Role and settings are checked again when it is confirmed. The audit log records `ai.action.proposed`, `ai.action.confirmed`, `ai.action.failed` and `ai.action.cancelled`, plus the normal entry of the change itself (for example `task.create.ai`).

SampTrek has no teams, departments, budgets or expenses. When asked about them the copilot says so rather than guessing; "the design team" is resolved to a named person.

## Documents

Attach a PDF, image (PNG or JPEG), plain text, Markdown, CSV or JSON file (10 MB max) and ask for a summary, the requirements, or what is missing. PDFs are read by Gemini directly (about 258 tokens per page); Word files must be saved as PDF first. Files are stored in the database for the uploader and can be deleted from the attachment list.

## Project from a brief

Create project can also read a brief into the form with one forced tool call. It uses the same settings and limits, and counts as usage kind `brief`. See `docs/PROJECT_FROM_BRIEF.md`.

## Voice

The microphone button starts a spoken conversation.

1. The server asks Gemini for a single-use token valid for 15 minutes (must start within 60 seconds), bound to the Live model, the system instructions and the tools the person may use. The API key never reaches the browser.
2. The browser streams 16 kHz microphone audio to Gemini Live and plays the spoken answer.
3. When Gemini wants data or an action, the browser forwards the call to `POST /api/v1/ai/voice/tool`, which runs the same server-side tools and confirmation cards as text chat.
4. Each finished turn's transcript is saved with `POST /api/v1/ai/voice/turn`, so voice conversations appear in the history.

If Live cannot start (no AudioWorklet, network, or Gemini refuses), SampTrek falls back to the browser's speech recognition and speech synthesis with normal text chat, where the browser supports it (Chrome and Edge do; Firefox has no speech recognition).

The phone app uses the same Live session and tools. Its fallback is **tap to talk**: the phone records one question, `POST /api/v1/ai/voice/transcribe` (multipart field `audio`, WAV/MP3/M4A/AAC/OGG/WebM, up to 4 MB) writes it down with the main model, the normal chat answers, and the phone reads the answer aloud. See docs/MOBILE_APP.md → Copilot voice.

## API

All under `/api/v1/ai`, signed-in staff only:

| Method | Path | |
| --- | --- | --- |
| GET | `/status` | Whether it is set up, the person's access and usage, and settings for admins |
| PUT | `/settings` | Admin: on/off, roles, actions, documents, voice, limits |
| GET | `/usage` | Admin: usage by day and person |
| POST | `/chat` | `{ conversationId?, message, documentIds?, path? }` |
| GET/DELETE | `/conversations`, `/conversations/:id` | The person's own conversations |
| POST | `/actions/:id/confirm`, `/actions/:id/cancel` | Decide a proposed change |
| GET/POST/DELETE | `/documents`, `/documents/:id` | Upload is multipart field `file` |
| POST | `/voice/session`, `/voice/tool`, `/voice/turn` | Voice, see above |
| POST | `/voice/transcribe` | Phone app tap to talk: multipart `audio` → `{ text }` |

Tasks: `GET/POST /api/v1/tasks`, `GET/PATCH /api/v1/tasks/:id`.

## Testing

`apps/api/test/e2e/ai.e2e.spec.ts` runs the whole loop against a scripted fake Gemini: tool calls, role scoping, confirmation, expiry, limits, documents and voice. Nothing in the test suite calls the real Gemini, so try it with a real key on a test organisation first.
