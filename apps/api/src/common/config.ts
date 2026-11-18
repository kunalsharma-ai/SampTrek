export const config = {
  get jwtSecret(): string {
    const s = process.env.JWT_SECRET;
    if (!s || s.length < 16) {
      if (process.env.NODE_ENV === 'production') throw new Error('JWT_SECRET must be set (16+ chars)');
      return 'dev-only-insecure-jwt-secret-change-me';
    }
    return s;
  },
  get publicBaseUrl(): string {
    return (process.env.PUBLIC_BASE_URL ?? 'http://localhost:4000').replace(/\/$/, '');
  },
  get publicHost(): string {
    return new URL(this.publicBaseUrl).host;
  },
  get webOrigins(): string[] {
    return (process.env.WEB_ORIGIN ?? 'http://localhost:3000').split(',').map((s) => s.trim()).filter(Boolean);
  },
  /** http:// destinations are only accepted outside production (local QA). */
  get allowHttpRedirects(): boolean {
    return process.env.NODE_ENV !== 'production';
  },
  get callbackWorkerEnabled(): boolean {
    return process.env.CALLBACK_WORKER_ENABLED !== 'false';
  },
  /** Fieldwork monitor: checks live fieldwork every five minutes. */
  get monitorEnabled(): boolean {
    return process.env.MONITOR_ENABLED !== 'false';
  },
  /** Request header carrying the respondent's country from the CDN/edge, e.g. cf-ipcountry. Unset = geolocation cannot run. */
  get geoCountryHeader(): string | null {
    const h = process.env.GEO_COUNTRY_HEADER?.trim().toLowerCase();
    return h ? h : null;
  },
  /** Key that encrypts two-step sign-in secrets. Falls back to JWT_SECRET; set it separately so rotating JWT_SECRET does not break authenticator apps. */
  get mfaEncryptionKey(): string {
    const k = process.env.MFA_ENCRYPTION_KEY;
    return k && k.length >= 16 ? k : this.jwtSecret;
  },
  /** Scheduled redirect version activation (docs/REDIRECT_DESTINATIONS.md). */
  get redirectSchedulerEnabled(): boolean {
    return process.env.REDIRECT_SCHEDULER_ENABLED !== 'false';
  },
  /** Data retention (docs/PRIVACY.md): the hourly job that anonymises old respondent data. */
  get automationSchedulerEnabled(): boolean {
    return process.env.AUTOMATION_SCHEDULER_ENABLED !== 'false';
  },
  get limitAlertsEnabled(): boolean {
    return process.env.LIMIT_ALERTS_ENABLED !== 'false';
  },
  get privacySchedulerEnabled(): boolean {
    return process.env.PRIVACY_SCHEDULER_ENABLED !== 'false';
  },
  /** Scheduled report emails: the minute-by-minute scheduler. */
  get reportSchedulerEnabled(): boolean {
    return process.env.REPORT_SCHEDULER_ENABLED !== 'false';
  },
  get zohoBooksSchedulerEnabled(): boolean {
    return process.env.ZOHO_BOOKS_SCHEDULER_ENABLED !== 'false';
  },
  get ledgerSchedulerEnabled(): boolean {
    return process.env.LEDGER_SCHEDULER_ENABLED !== 'false';
  },
  /** Key that encrypts accounting sign-in tokens. Falls back to the two-step sign-in key. */
  get accountingEncryptionKey(): string {
    const k = process.env.ACCOUNTING_ENCRYPTION_KEY;
    return k && k.length >= 16 ? k : this.mfaEncryptionKey;
  },
  /** Key that encrypts secrets saved in Settings → Integrations. Falls back to the accounting key. */
  get integrationsEncryptionKey(): string {
    const k = process.env.INTEGRATIONS_ENCRYPTION_KEY;
    return k && k.length >= 16 ? k : this.accountingEncryptionKey;
  },
  cookieName: 'projexa_token',
};

/** An integration's settings, keyed by the old environment variable names (saved in Settings → Integrations). */
export type EnvMap = Record<string, string | undefined>;

/**
 * Outgoing email (docs/INTEGRATIONS.md). Zoho Mail SMTP by default: smtp.zoho.com, or
 * smtp.zoho.in / smtp.zoho.eu for accounts in those data centres. Null when not set up.
 */
export function smtpFrom(env: EnvMap): { host: string; port: number; secure: boolean; user: string; pass: string; from: string } | null {
  const user = env.SMTP_USER?.trim();
  const pass = env.SMTP_PASS;
  if (!user || !pass) return null;
  const port = Number(env.SMTP_PORT || 465);
  return {
    host: env.SMTP_HOST?.trim() || 'smtp.zoho.com',
    port,
    secure: env.SMTP_SECURE ? env.SMTP_SECURE === 'true' : port === 465,
    user,
    pass,
    from: env.MAIL_FROM?.trim() || user,
  };
}

/**
 * Direct sync to Zoho Books (docs/ZOHO_BOOKS.md). A self-client refresh token for one Zoho Books
 * organisation, bound to one SampTrek organisation by its slug. Null when any part is missing.
 */
export function zohoBooksFrom(env: EnvMap): { clientId: string; clientSecret: string; refreshToken: string; organizationId: string; tenant: string; apiUrl: string; accountsUrl: string; dc: string } | null {
  const v = (k: string) => env[k]?.trim() || '';
  const dc = (v('ZOHO_BOOKS_DC') || 'com').replace(/^\./, '');
  const c = {
    clientId: v('ZOHO_BOOKS_CLIENT_ID'),
    clientSecret: v('ZOHO_BOOKS_CLIENT_SECRET'),
    refreshToken: v('ZOHO_BOOKS_REFRESH_TOKEN'),
    organizationId: v('ZOHO_BOOKS_ORGANIZATION_ID'),
    tenant: v('ZOHO_BOOKS_TENANT'),
    apiUrl: (v('ZOHO_BOOKS_API_URL') || `https://www.zohoapis.${dc}/books/v3`).replace(/\/$/, ''),
    accountsUrl: (v('ZOHO_BOOKS_ACCOUNTS_URL') || `https://accounts.zoho.${dc}`).replace(/\/$/, ''),
    dc,
  };
  return c.clientId && c.clientSecret && c.refreshToken && c.organizationId && c.tenant ? c : null;
}

/** Names of the Zoho Books settings that are not set, for the settings screen. */
export function zohoBooksMissingFrom(env: EnvMap): string[] {
  return ['ZOHO_BOOKS_CLIENT_ID', 'ZOHO_BOOKS_CLIENT_SECRET', 'ZOHO_BOOKS_REFRESH_TOKEN', 'ZOHO_BOOKS_ORGANIZATION_ID', 'ZOHO_BOOKS_TENANT'].filter((k) => !env[k]?.trim());
}

/**
 * Direct sync to Xero, QuickBooks Online and Tally Prime (docs/ACCOUNTING_SYNC.md). Xero and
 * QuickBooks use an OAuth app per SampTrek server; each organisation signs in to its own company.
 * The URL settings only change for testing.
 */
export function ledgersFrom(env: EnvMap) {
  const v = (k: string) => env[k]?.trim() || '';
  const qbSandbox = v('QUICKBOOKS_ENVIRONMENT') === 'sandbox';
  return {
    xero: v('XERO_CLIENT_ID') && v('XERO_CLIENT_SECRET')
      ? {
          clientId: v('XERO_CLIENT_ID'),
          clientSecret: v('XERO_CLIENT_SECRET'),
          authorizeUrl: v('XERO_AUTHORIZE_URL') || 'https://login.xero.com/identity/connect/authorize',
          tokenUrl: v('XERO_TOKEN_URL') || 'https://identity.xero.com/connect/token',
          revokeUrl: v('XERO_REVOKE_URL') || 'https://identity.xero.com/connect/revocation',
          apiUrl: (v('XERO_API_URL') || 'https://api.xero.com').replace(/\/$/, ''),
          scopes: v('XERO_SCOPES') || '',
        }
      : null,
    quickbooks: v('QUICKBOOKS_CLIENT_ID') && v('QUICKBOOKS_CLIENT_SECRET')
      ? {
          clientId: v('QUICKBOOKS_CLIENT_ID'),
          clientSecret: v('QUICKBOOKS_CLIENT_SECRET'),
          sandbox: qbSandbox,
          authorizeUrl: v('QUICKBOOKS_AUTHORIZE_URL') || 'https://appcenter.intuit.com/connect/oauth2',
          tokenUrl: v('QUICKBOOKS_TOKEN_URL') || 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer',
          revokeUrl: v('QUICKBOOKS_REVOKE_URL') || 'https://developer.api.intuit.com/v2/oauth2/tokens/revoke',
          apiUrl: (v('QUICKBOOKS_API_URL') || (qbSandbox ? 'https://sandbox-quickbooks.api.intuit.com' : 'https://quickbooks.api.intuit.com')).replace(/\/$/, ''),
          minorVersion: v('QUICKBOOKS_MINOR_VERSION') || '75',
        }
      : null,
    /** Tally Prime's XML server is not safe on the internet, so it is bound to one organisation. */
    tally: v('TALLY_URL') && v('TALLY_TENANT') ? { url: v('TALLY_URL').replace(/\/$/, ''), tenant: v('TALLY_TENANT') } : null,
    schedulerEnabled: env.LEDGER_SCHEDULER_ENABLED !== 'false',
  };
}
export type LedgerApps = ReturnType<typeof ledgersFrom>;

/**
 * AI copilot, project from a brief and voice (docs/AI_COPILOT.md). Each AI provider is its own
 * integration with its own key, kept in the database. An organisation can set up several; the
 * copilot uses them in the order chosen in Settings → AI copilot and moves to the next one when a
 * provider is busy, out of free allowance or refuses the key. Model names move often, so each is a
 * setting with a current default.
 */
export const AI_KINDS = ['gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'openai_compatible'] as const;
export type AiKind = (typeof AI_KINDS)[number];
export const isAiKind = (k: string): k is AiKind => (AI_KINDS as readonly string[]).includes(k);

export interface AiConfig {
  provider: AiKind;
  /** Shown to people, e.g. "Groq". */
  label: string;
  /** null for a local server that needs no key (Ollama). */
  apiKey: string | null;
  apiUrl: string;
  model: string;
  fallbackModel: string | null;
  /** Gemini Live only. */
  liveModel: string | null;
  /** Attached file types (PDF, images) the provider reads directly. Text files always work. */
  files: string[];
  /** Can write down a spoken question (tap to talk). */
  audio: boolean;
}

const IMAGES = ['image/png', 'image/jpeg', 'image/webp'];
interface AiDef { label: string; prefix: string; url: string; model: string; fallback: string | null; files: string[] }
/** The OpenAI-style providers and Claude. Gemini has its own field names (GEMINI_API_KEY, AI_MODEL) from before. */
export const AI_DEFS: Record<Exclude<AiKind, 'gemini'>, AiDef> = {
  anthropic: { label: 'Anthropic Claude', prefix: 'ANTHROPIC', url: 'https://api.anthropic.com', model: 'claude-opus-5-5', fallback: 'claude-haiku-5-5', files: ['application/pdf', ...IMAGES] },
  openai: { label: 'OpenAI', prefix: 'OPENAI', url: 'https://api.openai.com/v1', model: 'gpt-5-mini', fallback: 'gpt-5-nano', files: ['application/pdf', ...IMAGES] },
  groq: { label: 'Groq', prefix: 'GROQ', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile', fallback: 'llama-3.1-8b-instant', files: [] },
  openrouter: { label: 'OpenRouter', prefix: 'OPENROUTER', url: 'https://openrouter.ai/api/v1', model: 'meta-llama/llama-3.3-70b-instruct:free', fallback: null, files: ['application/pdf'] },
  mistral: { label: 'Mistral', prefix: 'MISTRAL', url: 'https://api.mistral.ai/v1', model: 'mistral-small-latest', fallback: 'open-mistral-nemo', files: IMAGES },
  deepseek: { label: 'DeepSeek', prefix: 'DEEPSEEK', url: 'https://api.deepseek.com/v1', model: 'deepseek-chat', fallback: null, files: [] },
  openai_compatible: { label: 'Own AI server', prefix: 'AI_COMPAT', url: '', model: '', fallback: null, files: [] },
};

/** Google Gemini (AI Studio key): the only provider with live voice and speech-to-text. */
export function aiFrom(env: EnvMap): AiConfig | null {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return null;
  return {
    provider: 'gemini',
    label: 'Google Gemini',
    apiKey: key,
    apiUrl: (env.GEMINI_API_URL?.trim() || 'https://generativelanguage.googleapis.com').replace(/\/$/, ''),
    model: env.AI_MODEL?.trim() || 'gemini-3.8-flash',
    fallbackModel: env.AI_FALLBACK_MODEL === '' ? null : env.AI_FALLBACK_MODEL?.trim() || 'gemini-3.5-flash-lite',
    liveModel: env.AI_LIVE_MODEL?.trim() || 'gemini-3.8-live',
    files: ['application/pdf', ...IMAGES],
    audio: true,
  };
}

/** Any AI provider from its saved fields; null when it is not set up. `<PREFIX>_API_URL` overrides the address (tests). */
export function aiProviderFrom(kind: AiKind, env: EnvMap): AiConfig | null {
  if (kind === 'gemini') return aiFrom(env);
  const d = AI_DEFS[kind];
  const v = (k: string) => env[`${d.prefix}_${k}`]?.trim() ?? '';
  const key = v('API_KEY');
  const own = kind === 'openai_compatible';
  const url = (own ? v('URL') : v('API_URL') || d.url).replace(/\/$/, '');
  const model = v('MODEL') || d.model;
  if (own ? !url || !model : !key) return null;
  const fallback = env[`${d.prefix}_FALLBACK_MODEL`] === '' ? null : v('FALLBACK_MODEL') || d.fallback;
  return {
    provider: kind,
    label: own ? v('NAME') || d.label : d.label,
    apiKey: key || null,
    apiUrl: url,
    model,
    fallbackModel: fallback && fallback !== model ? fallback : null,
    liveModel: null,
    files: d.files,
    audio: false,
  };
}
export type SmtpConfig = NonNullable<ReturnType<typeof smtpFrom>>;
export type ZohoBooksConfig = NonNullable<ReturnType<typeof zohoBooksFrom>>;
