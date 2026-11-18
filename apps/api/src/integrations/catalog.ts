/**
 * Every integration an admin can set up in Settings → Integrations (docs/INTEGRATIONS.md). All of
 * them are kept in the database. Field keys are the old environment variable names, so the config
 * builders (common/config.ts) stay the same and old .env values can be copied in once on start.
 */

export const INTEGRATION_KINDS = ['sampleon', 'smtp', 'sso_google', 'sso_microsoft', 'sso_zoho', 'gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'openai_compatible', 'zoho_books', 'xero', 'quickbooks', 'tally', 'bidzo', 'razorpay', 'stripe', 'push', 'backup_storage', 'ip_reputation'] as const;
/** Payment gateways the server owner uses to collect subscription payments (docs/SUBSCRIPTION_PAYMENTS.md). Never shown to other organisations. */
export const PAYMENT_KINDS = ['razorpay', 'stripe'] as const;
export const isPaymentKind = (k: string) => (PAYMENT_KINDS as readonly string[]).includes(k);
/** Set up once for the whole server by the organisation that runs it, never offered to other organisations. */
export const SERVER_ONLY_KINDS = [...PAYMENT_KINDS, 'backup_storage'] as const;
export const isServerOnlyKind = (k: string) => (SERVER_ONLY_KINDS as readonly string[]).includes(k);
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];
/** Organisation settings the server owner may share as the default for organisations without their own (as .env once did). */
export const SHAREABLE_KINDS = ['smtp', 'gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'openai_compatible', 'ip_reputation', 'bidzo'] as const;
export const isShareableKind = (k: string) => (SHAREABLE_KINDS as readonly string[]).includes(k);
/** AI providers besides Gemini: one plan feature (integration.gemini, "AI providers") covers them all. */
export const EXTRA_AI_KINDS = ['anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'openai_compatible'] as const;
export const isExtraAiKind = (k: string) => (EXTRA_AI_KINDS as readonly string[]).includes(k);
export const isKind = (k: string): k is IntegrationKind => (INTEGRATION_KINDS as readonly string[]).includes(k);

export type FieldType = 'text' | 'secret' | 'select' | 'url' | 'email';
export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  default?: string;
  /** Used once when saving and never stored (e.g. a one-time grant code). */
  transient?: boolean;
}
export interface KindDef {
  kind: IntegrationKind;
  group: 'SampAudience' | 'Email' | 'Sign-in' | 'AI' | 'Accounting' | 'SampBidx' | 'Payments' | 'Mobile' | 'Backups' | 'Fraud';
  label: string;
  summary: string;
  /** platform = one per SampTrek server, set by the organisation that runs it (sign-in and accounting apps). */
  scope: 'org' | 'platform';
  /** Only the organisation that runs the server may set it (reaches a private network). */
  ownerOnly?: boolean;
  fields: FieldDef[];
  /** Plain steps; {redirectUri}, {webOrigin} and {apiOrigin} are filled in by the server. */
  steps: string[];
  links: { label: string; href: string }[];
  testable: boolean;
  /** Where to finish the setup after saving. */
  next?: { label: string; href: string };
}

const ZOHO_DCS = [
  { value: 'com', label: 'zoho.com (US and global)' },
  { value: 'in', label: 'zoho.in (India)' },
  { value: 'eu', label: 'zoho.eu (Europe)' },
  { value: 'com.au', label: 'zoho.com.au (Australia)' },
  { value: 'jp', label: 'zoho.jp (Japan)' },
];
const ZOHO_ACCOUNTS = [
  { value: 'https://accounts.zoho.com', label: 'accounts.zoho.com (US and global)' },
  { value: 'https://accounts.zoho.in', label: 'accounts.zoho.in (India)' },
  { value: 'https://accounts.zoho.eu', label: 'accounts.zoho.eu (Europe)' },
  { value: 'https://accounts.zoho.com.au', label: 'accounts.zoho.com.au (Australia)' },
  { value: 'https://accounts.zoho.jp', label: 'accounts.zoho.jp (Japan)' },
  { value: 'https://accounts.zohocloud.ca', label: 'accounts.zohocloud.ca (Canada)' },
  { value: 'https://accounts.zoho.sa', label: 'accounts.zoho.sa (Saudi Arabia)' },
];


const AI_ORDER_STEP = 'Set up as many as you like. Under Settings → AI copilot choose the order: when one is busy, out of its free allowance or refuses the key, the copilot moves on to the next.';
const aiModels = (prefix: string, model: string, fallback: string | null, hint: string): FieldDef[] => [
  { key: `${prefix}_MODEL`, label: 'Main model', type: 'text', default: model, hint },
  { key: `${prefix}_FALLBACK_MODEL`, label: 'Fallback model', type: 'text', ...(fallback ? { default: fallback } : {}), hint: 'Optional. Tried once when the main model is busy, before the next provider.' },
];
/** The other AI providers. Field keys follow <PREFIX>_API_KEY / _MODEL / _FALLBACK_MODEL (common/config.ts aiProviderFrom). */
const AI_PROVIDER_CARDS: KindDef[] = [
  {
    kind: 'anthropic', group: 'AI', label: 'Anthropic Claude', scope: 'org', testable: true,
    summary: 'Claude for the copilot chat, document reading and project from a brief. Reads PDFs and images.',
    fields: [{ key: 'ANTHROPIC_API_KEY', label: 'API key', type: 'secret', required: true, placeholder: 'sk-ant-…' }, ...aiModels('ANTHROPIC', 'claude-opus-5-5', 'claude-haiku-5-5', 'claude-opus-5-5 is the most capable; claude-haiku-5-5 costs far less.')],
    steps: ['Open the Claude Console, sign in, and go to API keys → Create key.', 'Copy the key here. Add credit under Billing if the account has none.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'Claude Console API keys', href: 'https://console.anthropic.com/settings/keys' }, { label: 'Claude models and prices', href: 'https://docs.claude.com/en/docs/about-claude/models/overview' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'openai', group: 'AI', label: 'OpenAI', scope: 'org', testable: true,
    summary: 'OpenAI GPT models for the copilot chat, document reading and project from a brief. Reads PDFs and images.',
    fields: [{ key: 'OPENAI_API_KEY', label: 'API key', type: 'secret', required: true, placeholder: 'sk-…' }, ...aiModels('OPENAI', 'gpt-5-mini', 'gpt-5-nano', 'Any chat model your key can use, from platform.openai.com/docs/models.')],
    steps: ['Open platform.openai.com, sign in, and go to API keys → Create new secret key.', 'Copy the key here. OpenAI needs a little prepaid credit before the key works.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'OpenAI API keys', href: 'https://platform.openai.com/api-keys' }, { label: 'OpenAI models', href: 'https://platform.openai.com/docs/models' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'groq', group: 'AI', label: 'Groq (free tier)', scope: 'org', testable: true,
    summary: 'Very fast open models (Llama and others) with a free tier. Text only: no PDFs or images.',
    fields: [{ key: 'GROQ_API_KEY', label: 'API key', type: 'secret', required: true, placeholder: 'gsk_…' }, ...aiModels('GROQ', 'llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'Pick a model that supports tool use, from console.groq.com/docs/models.')],
    steps: ['Open console.groq.com and sign in (free, no card needed).', 'Go to API Keys → Create API Key and copy it here.', 'The free tier has per-minute and per-day limits; when they run out the copilot moves to the next provider.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'Groq API keys', href: 'https://console.groq.com/keys' }, { label: 'Groq free tier limits', href: 'https://console.groq.com/docs/rate-limits' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'openrouter', group: 'AI', label: 'OpenRouter (free models)', scope: 'org', testable: true,
    summary: 'One key for hundreds of models, including free ones (names ending in :free). Reads PDFs.',
    fields: [{ key: 'OPENROUTER_API_KEY', label: 'API key', type: 'secret', required: true, placeholder: 'sk-or-…' }, ...aiModels('OPENROUTER', 'meta-llama/llama-3.3-70b-instruct:free', null, 'Free models end in :free (see openrouter.ai/models?q=free). Pick one that supports tools.')],
    steps: ['Open openrouter.ai, sign in, and go to Keys → Create key.', 'Copy the key here. Free models need no credit but have daily limits; adding a small credit raises them.', 'Free models may log prompts. Do not use them for confidential client work.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'OpenRouter keys', href: 'https://openrouter.ai/settings/keys' }, { label: 'Free models', href: 'https://openrouter.ai/models?q=free' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'mistral', group: 'AI', label: 'Mistral (free tier)', scope: 'org', testable: true,
    summary: 'Mistral models, with a free experiment plan. Reads images.',
    fields: [{ key: 'MISTRAL_API_KEY', label: 'API key', type: 'secret', required: true }, ...aiModels('MISTRAL', 'mistral-small-latest', 'open-mistral-nemo', 'Model names from docs.mistral.ai/getting-started/models.')],
    steps: ['Open console.mistral.ai and sign in. Choose the free Experiment plan if asked (needs a phone number).', 'Go to API Keys → Create new key and copy it here.', 'On the free plan Mistral may use prompts to improve its models.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'Mistral API keys', href: 'https://console.mistral.ai/api-keys' }, { label: 'Mistral models', href: 'https://docs.mistral.ai/getting-started/models/' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'deepseek', group: 'AI', label: 'DeepSeek', scope: 'org', testable: true,
    summary: 'Low-cost DeepSeek models. Text only: no PDFs or images.',
    fields: [{ key: 'DEEPSEEK_API_KEY', label: 'API key', type: 'secret', required: true, placeholder: 'sk-…' }, ...aiModels('DEEPSEEK', 'deepseek-chat', null, 'deepseek-chat supports tool use.')],
    steps: ['Open platform.deepseek.com, sign in, and go to API keys → Create new API key.', 'Copy the key here and top up a small balance.', 'DeepSeek processes data in China. Check that suits your clients before using it.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'DeepSeek API keys', href: 'https://platform.deepseek.com/api_keys' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
  {
    kind: 'openai_compatible', group: 'AI', label: 'Own AI server (Ollama, LM Studio, vLLM or any OpenAI-compatible API)', scope: 'org', testable: true,
    summary: 'A model you run yourself, free and private, or any other service with an OpenAI-compatible API. Text only.',
    fields: [
      { key: 'AI_COMPAT_NAME', label: 'Name shown to people', type: 'text', placeholder: 'Ollama' },
      { key: 'AI_COMPAT_URL', label: 'API address', type: 'url', required: true, placeholder: 'http://192.168.1.20:11434/v1', hint: 'The address that ends in /v1. Only the organisation that runs this server may use a private or http:// address.' },
      { key: 'AI_COMPAT_API_KEY', label: 'API key', type: 'secret', hint: 'Leave empty for Ollama and LM Studio.' },
      { key: 'AI_COMPAT_MODEL', label: 'Main model', type: 'text', required: true, placeholder: 'llama3.1', hint: 'Use a model that supports tool calling (for example llama3.1, qwen2.5 or mistral-nemo).' },
      { key: 'AI_COMPAT_FALLBACK_MODEL', label: 'Fallback model', type: 'text', hint: 'Optional.' },
    ],
    steps: ['Ollama: install it on a machine the SampTrek server can reach, run `ollama pull llama3.1`, and start it with OLLAMA_HOST=0.0.0.0 so it listens on the network.', 'Enter its address with /v1 at the end, for example http://192.168.1.20:11434/v1, and the model name.', 'For another service, enter its OpenAI-compatible address, key and model.', AI_ORDER_STEP, 'Save and press Test.'],
    links: [{ label: 'Ollama', href: 'https://ollama.com' }, { label: 'Ollama OpenAI compatibility', href: 'https://github.com/ollama/ollama/blob/main/docs/openai.md' }],
    next: { label: 'Choose the order', href: '/settings#ai' },
  },
];

export const CATALOG: KindDef[] = [
  {
    // Integration kind and field keys keep the technical id "sampleon" (docs/SAMPLEON_INTEGRATION.md).
    kind: 'sampleon',
    group: 'SampAudience',
    label: 'SampAudience (audience and invitations)',
    summary: 'Sends audience requests from a project to SampAudience and receives its signed progress events.',
    scope: 'platform',
    fields: [
      { key: 'SAMPLEON_URL', label: 'SampAudience address', type: 'url', required: true, placeholder: 'https://audience.sampledge.com' },
      { key: 'SAMPLEON_CLIENT_ID', label: 'Client id at SampAudience', type: 'text', default: 'projexa', hint: 'The id SampTrek is registered under in SampAudience → Settings → Connected systems.' },
      { key: 'SAMPLEON_CLIENT_SECRET', label: 'Signing secret', type: 'secret', required: true, hint: 'Shown once by SampAudience when SampTrek is added there. Signs every call and checks the events it sends back.' },
    ],
    steps: [
      'In SampAudience, open the console → Settings → Connected systems and add SampTrek: client id projexa, kind SampTrek, events sent to {apiOrigin}/api/v1/integrations/sampleon/events.',
      'Copy the signing secret SampAudience shows (it is shown once).',
      'Enter the SampAudience address and that secret here, save, and press Test.',
    ],
    links: [],
    testable: true,
  },
  {
    kind: 'smtp',
    group: 'Email',
    label: 'Email sending (Zoho Mail)',
    summary: 'Sends scheduled reports, invitations, password resets, request replies and quote emails.',
    scope: 'org',
    fields: [
      {
        key: 'SMTP_HOST',
        label: 'SMTP server',
        type: 'text',
        default: 'smtppro.zoho.in',
        placeholder: 'smtppro.zoho.in',
        hint: 'Zoho Mail for an organisation (your own domain) in India: smtppro.zoho.in. Personal Zoho accounts use smtp.zoho.in; other data centres use smtppro.zoho.com or smtppro.zoho.eu. Any other SMTP server works too.',
      },
      { key: 'SMTP_PORT', label: 'Port', type: 'select', default: '465', options: [{ value: '465', label: '465 (SSL, recommended)' }, { value: '587', label: '587 (STARTTLS)' }] },
      {
        key: 'SMTP_SECURE',
        label: 'Encryption',
        type: 'select',
        default: 'true',
        options: [{ value: 'true', label: 'SSL/TLS (use with port 465)' }, { value: 'false', label: 'STARTTLS (use with port 587)' }],
        hint: 'Keep SSL/TLS with port 465. Pick STARTTLS only if you switch to port 587.',
      },
      { key: 'SMTP_USER', label: 'Mailbox (username)', type: 'email', required: true, placeholder: 'reports@yourcompany.com', hint: 'The full email address of the Zoho mailbox that sends.' },
      { key: 'SMTP_PASS', label: 'App password', type: 'secret', required: true, hint: 'A Zoho application-specific password, not the mailbox password.' },
      { key: 'MAIL_FROM', label: 'From address', type: 'text', placeholder: 'SampTrek Reports <reports@yourcompany.com>', hint: 'Must be the mailbox above or one of its aliases. Empty = the mailbox.' },
    ],
    steps: [
      'Sign in to Zoho with the mailbox that will send (for example reports@yourcompany.com).',
      'Open My Account → Security → App passwords, choose Generate new password, name it SampTrek and copy it.',
      'Keep the SMTP server smtppro.zoho.in and port 465 (SSL) for a company mailbox at zoho.in, or pick the server for your Zoho account type and data centre.',
      'Enter the mailbox and the app password here, save, then press Test. A test email is sent to you.',
    ],
    links: [
      { label: 'Zoho app passwords', href: 'https://accounts.zoho.com/home#security/app_password' },
      { label: 'Zoho SMTP settings help', href: 'https://www.zoho.com/mail/help/zoho-smtp.html' },
    ],
    testable: true,
  },
  {
    kind: 'sso_google',
    group: 'Sign-in',
    label: 'Sign in with Google',
    summary: 'Lets staff sign in with their Google Workspace account.',
    scope: 'platform',
    fields: [
      { key: 'GOOGLE_CLIENT_ID', label: 'Client ID', type: 'text', required: true, placeholder: '1234567890-abc.apps.googleusercontent.com' },
      { key: 'GOOGLE_CLIENT_SECRET', label: 'Client secret', type: 'secret', required: true },
    ],
    steps: [
      'Open Google Cloud Console → APIs & Services → OAuth consent screen. Choose Internal if you use Google Workspace, and fill in the app name.',
      'Go to Credentials → Create credentials → OAuth client ID → Web application.',
      'Under Authorised redirect URIs add exactly: {redirectUri}',
      'Create it, then copy the client ID and client secret here and save.',
      'Finally turn Google on for your organisation under Settings → Single sign-on and add your email domain.',
    ],
    links: [{ label: 'Google Cloud credentials', href: 'https://console.cloud.google.com/apis/credentials' }],
    testable: true,
    next: { label: 'Turn it on in Single sign-on', href: '/settings#sso' },
  },
  {
    kind: 'sso_microsoft',
    group: 'Sign-in',
    label: 'Sign in with Microsoft',
    summary: 'Lets staff sign in with their Microsoft 365 (Entra ID) work account.',
    scope: 'platform',
    fields: [
      { key: 'MICROSOFT_CLIENT_ID', label: 'Application (client) ID', type: 'text', required: true, placeholder: '00000000-0000-0000-0000-000000000000' },
      { key: 'MICROSOFT_CLIENT_SECRET', label: 'Client secret value', type: 'secret', required: true, hint: 'The secret Value, not the Secret ID.' },
    ],
    steps: [
      'Open Microsoft Entra admin center → App registrations → New registration.',
      'Supported account types: Accounts in any organizational directory (multitenant).',
      'Redirect URI: platform Web, value exactly: {redirectUri}',
      'After registering, copy the Application (client) ID from Overview.',
      'Open Certificates & secrets → New client secret, then copy its Value (shown once).',
      'Paste both here and save, then turn Microsoft on under Settings → Single sign-on with your tenant ID.',
    ],
    links: [{ label: 'Entra app registrations', href: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade' }],
    testable: true,
    next: { label: 'Turn it on in Single sign-on', href: '/settings#sso' },
  },
  {
    kind: 'sso_zoho',
    group: 'Sign-in',
    label: 'Sign in with Zoho',
    summary: 'Lets staff sign in with their Zoho account.',
    scope: 'platform',
    fields: [
      { key: 'ZOHO_ACCOUNTS_URL', label: 'Zoho data centre', type: 'select', default: 'https://accounts.zoho.com', options: ZOHO_ACCOUNTS, hint: 'Where you created the client in the API console.' },
      { key: 'ZOHO_CLIENT_ID', label: 'Client ID', type: 'text', required: true, placeholder: '1000.XXXXXXXX' },
      { key: 'ZOHO_CLIENT_SECRET', label: 'Client secret', type: 'secret', required: true },
    ],
    steps: [
      'Open the Zoho API Console for your data centre (api-console.zoho.in for India) and choose Add client → Server-based Applications.',
      'Homepage URL: {webOrigin}',
      'Authorized redirect URI: {redirectUri}',
      'Create it, copy the client ID and secret here, pick the same data centre and save.',
      'Then turn Zoho on under Settings → Single sign-on and add your email domain.',
    ],
    links: [
      { label: 'Zoho API Console (.com)', href: 'https://api-console.zoho.com' },
      { label: 'Zoho API Console (.in)', href: 'https://api-console.zoho.in' },
    ],
    testable: true,
    next: { label: 'Turn it on in Single sign-on', href: '/settings#sso' },
  },
  {
    kind: 'gemini',
    group: 'AI',
    label: 'Google Gemini (free tier, voice)',
    summary: 'The copilot chat, document reading and the only provider with live voice. Free tier in Google AI Studio.',
    scope: 'org',
    fields: [
      { key: 'GEMINI_API_KEY', label: 'Gemini API key', type: 'secret', required: true },
      { key: 'AI_MODEL', label: 'Main model', type: 'text', default: 'gemini-3.8-flash' },
      { key: 'AI_FALLBACK_MODEL', label: 'Fallback model', type: 'text', default: 'gemini-3.5-flash-lite', hint: 'Used once when the main model is busy.' },
      { key: 'AI_LIVE_MODEL', label: 'Voice model', type: 'text', default: 'gemini-3.8-live' },
    ],
    steps: [
      'Open Google AI Studio and sign in with a Google account of your company.',
      'Choose Get API key → Create API key, and copy it here. Leave the models as they are unless told otherwise.',
      'On the free tier Google may use prompts to improve its products. Turn on billing for the key\'s Google Cloud project before using confidential client data.',
      'Save and press Test, then choose who can use it under Settings → AI copilot.',
    ],
    links: [
      { label: 'Google AI Studio API keys', href: 'https://aistudio.google.com/app/apikey' },
      { label: 'Gemini pricing and data use', href: 'https://ai.google.dev/gemini-api/docs/pricing' },
    ],
    testable: true,
    next: { label: 'Choose who can use it', href: '/settings#ai' },
  },
  ...AI_PROVIDER_CARDS,
  {
    kind: 'zoho_books',
    group: 'Accounting',
    label: 'Zoho Books',
    summary: 'Sends invoices, vendor bills and payments to Zoho Books, by hand or every hour.',
    scope: 'org',
    fields: [
      { key: 'ZOHO_BOOKS_DC', label: 'Zoho data centre', type: 'select', default: 'com', options: ZOHO_DCS },
      { key: 'ZOHO_BOOKS_CLIENT_ID', label: 'Self client ID', type: 'text', required: true, placeholder: '1000.XXXXXXXX' },
      { key: 'ZOHO_BOOKS_CLIENT_SECRET', label: 'Self client secret', type: 'secret', required: true },
      { key: 'ZOHO_BOOKS_GRANT_CODE', label: 'Grant code', type: 'secret', transient: true, hint: 'From Generate Code. SampTrek swaps it for a lasting refresh token when you save. Only needed the first time.' },
      { key: 'ZOHO_BOOKS_REFRESH_TOKEN', label: 'Refresh token', type: 'secret', hint: 'Filled in for you from the grant code. Paste one only if you already have it.' },
      { key: 'ZOHO_BOOKS_ORGANIZATION_ID', label: 'Zoho Books organization ID', type: 'text', placeholder: '600000123', hint: 'Found for you when your Zoho login has one Books organisation. Otherwise see Zoho Books → Settings → Organisation profile.' },
    ],
    steps: [
      'Open the Zoho API Console for your data centre (api-console.zoho.in for India) signed in as a Zoho Books admin.',
      'Choose Add client → Self Client → Create. Copy the client ID and secret here.',
      'In the Self Client, open Generate Code, enter the scope ZohoBooks.fullaccess.all, a duration of 10 minutes and any description, then Create.',
      'Copy the code into Grant code and save within those 10 minutes. SampTrek gets the refresh token and your organization ID.',
      'Press Test, then pick what to sync on the Accounting page.',
    ],
    links: [
      { label: 'Zoho API Console (.com)', href: 'https://api-console.zoho.com' },
      { label: 'Zoho API Console (.in)', href: 'https://api-console.zoho.in' },
    ],
    testable: true,
    next: { label: 'Open Accounting', href: '/accounting' },
  },
  {
    kind: 'xero',
    group: 'Accounting',
    label: 'Xero',
    summary: 'The Xero app SampTrek signs in with. Each organisation then connects its own Xero company.',
    scope: 'platform',
    fields: [
      { key: 'XERO_CLIENT_ID', label: 'Client ID', type: 'text', required: true },
      { key: 'XERO_CLIENT_SECRET', label: 'Client secret', type: 'secret', required: true },
    ],
    steps: [
      'Open Xero Developer → My Apps → New app. Integration type: Web app.',
      'Company or application URL: {webOrigin}',
      'Redirect URI exactly: {redirectUri}',
      'Create the app, open Configuration, copy the client ID and generate a client secret. Paste both here and save.',
      'Then press Connect next to Xero on the Accounting page and pick your Xero organisation.',
    ],
    links: [{ label: 'Xero My Apps', href: 'https://developer.xero.com/app/manage' }],
    testable: true,
    next: { label: 'Connect on Accounting', href: '/accounting' },
  },
  {
    kind: 'quickbooks',
    group: 'Accounting',
    label: 'QuickBooks Online',
    summary: 'The Intuit app SampTrek signs in with. Each organisation then connects its own QuickBooks company.',
    scope: 'platform',
    fields: [
      { key: 'QUICKBOOKS_ENVIRONMENT', label: 'Environment', type: 'select', default: '', options: [{ value: '', label: 'Production (real companies)' }, { value: 'sandbox', label: 'Sandbox (testing)' }] },
      { key: 'QUICKBOOKS_CLIENT_ID', label: 'Client ID', type: 'text', required: true },
      { key: 'QUICKBOOKS_CLIENT_SECRET', label: 'Client secret', type: 'secret', required: true },
    ],
    steps: [
      'Open the Intuit Developer dashboard → Create an app → QuickBooks Online and Payments, with the Accounting scope.',
      'Under Keys & credentials (Development for sandbox, Production for real companies) add the redirect URI: {redirectUri}',
      'Copy the client ID and secret here, pick the same environment and save.',
      'Then press Connect next to QuickBooks on the Accounting page.',
    ],
    links: [{ label: 'Intuit Developer dashboard', href: 'https://developer.intuit.com/app/developer/dashboard' }],
    testable: true,
    next: { label: 'Connect on Accounting', href: '/accounting' },
  },
  {
    kind: 'tally',
    group: 'Accounting',
    label: 'Tally Prime',
    summary: "Posts vouchers straight into Tally Prime through its XML server on your office network.",
    scope: 'org',
    ownerOnly: true,
    fields: [{ key: 'TALLY_URL', label: 'Tally XML server address', type: 'url', required: true, placeholder: 'http://10.0.0.5:9000' }],
    steps: [
      'In Tally Prime press F1 (Help) → Settings → Connectivity → Client/Server configuration. Set TallyPrime is acting as to Both and note the port (9000).',
      'Make that computer reachable from the SampTrek server over your VPN or private network. Never open the port to the internet: anyone reaching it can change your books.',
      'Enter the address, for example http://10.0.0.5:9000, save and press Test with Tally open.',
    ],
    links: [{ label: 'Tally integration help', href: 'https://help.tallysolutions.com/integration-capabilities-tallyprime/' }],
    testable: true,
    next: { label: 'Open Accounting', href: '/accounting' },
  },
  {
    kind: 'bidzo',
    group: 'SampBidx',
    label: 'SampBidx link',
    summary: 'Where "New bid" opens. Won bids arrive through the signed SampBidx connection in Settings.',
    scope: 'org',
    fields: [{ key: 'SAMPBIDX_URL', label: 'SampBidx address', type: 'url', required: true, placeholder: 'https://sampbidx.sampledge.com' }],
    steps: [
      'Enter the address you open SampBidx at. "New bid" in the header and command palette then opens SampBidx there.',
      'To receive won bids automatically, use Connect SampBidx under Settings → SampBidx connection and give SampBidx the endpoint, tenant and secret shown there.',
    ],
    links: [],
    testable: false,
    next: { label: 'SampBidx connection', href: '/settings#sampbidx' },
  },
  {
    kind: 'razorpay',
    group: 'Payments',
    label: 'Razorpay',
    summary: 'Organisations pay for their plan by UPI, card, netbanking or wallet (India, and international cards when your account allows).',
    scope: 'platform',
    ownerOnly: true,
    fields: [
      { key: 'RAZORPAY_KEY_ID', label: 'Key ID', type: 'text', required: true, placeholder: 'rzp_live_…' },
      { key: 'RAZORPAY_KEY_SECRET', label: 'Key secret', type: 'secret', required: true },
      { key: 'RAZORPAY_WEBHOOK_SECRET', label: 'Webhook secret', type: 'secret', hint: 'Recommended: payments are confirmed even if the person closes the page.' },
    ],
    steps: [
      'Sign in to the Razorpay Dashboard. Use Test mode first (keys start with rzp_test_).',
      'Account & Settings → API Keys → Generate Key. Copy the Key ID and Key secret here.',
      'Account & Settings → Webhooks → Add New Webhook. URL: {apiOrigin}/api/v1/public/billing/razorpay/webhook. Choose a secret, tick the events payment.captured and order.paid, and paste the same secret here.',
      'Save and test. Then open Super Admin → Billing to set prices and turn online payment on.',
    ],
    links: [{ label: 'Razorpay API keys', href: 'https://dashboard.razorpay.com/app/website-app-settings/api-keys' }, { label: 'Razorpay webhooks', href: 'https://dashboard.razorpay.com/app/webhooks' }],
    testable: true,
    next: { label: 'Super Admin → Billing', href: '/super-admin/billing' },
  },
  {
    kind: 'stripe',
    group: 'Payments',
    label: 'Stripe',
    summary: 'Organisations pay for their plan by card on a Stripe checkout page (international).',
    scope: 'platform',
    ownerOnly: true,
    fields: [
      { key: 'STRIPE_SECRET_KEY', label: 'Secret key', type: 'secret', required: true, placeholder: 'sk_live_…' },
      { key: 'STRIPE_WEBHOOK_SECRET', label: 'Webhook signing secret', type: 'secret', hint: 'Recommended: payments are confirmed even if the person closes the page.', placeholder: 'whsec_…' },
    ],
    steps: [
      'Sign in to the Stripe Dashboard. Use test mode first (keys start with sk_test_).',
      'Developers → API keys: reveal the Secret key (or create a restricted key with write access to Checkout Sessions) and paste it here.',
      'Developers → Webhooks → Add endpoint. URL: {apiOrigin}/api/v1/public/billing/stripe/webhook, event checkout.session.completed. Copy its Signing secret here.',
      'Save and test. Then open Super Admin → Billing to set prices and turn online payment on.',
    ],
    links: [{ label: 'Stripe API keys', href: 'https://dashboard.stripe.com/apikeys' }, { label: 'Stripe webhooks', href: 'https://dashboard.stripe.com/webhooks' }],
    testable: true,
    next: { label: 'Super Admin → Billing', href: '/super-admin/billing' },
  },
  {
    kind: 'push',
    group: 'Mobile',
    label: 'Push notifications',
    summary: 'Alerts, request replies, task reminders and won bids on the SampTrek phone app, sent through Expo’s free push service.',
    scope: 'platform',
    fields: [
      { key: 'EXPO_PUSH', label: 'Push notifications', type: 'select', required: true, default: 'on', options: [{ value: 'on', label: 'On' }, { value: 'off', label: 'Off' }] },
      { key: 'EXPO_ACCESS_TOKEN', label: 'Expo access token (optional)', type: 'secret', hint: 'Only if you turned on “Enhanced security for push notifications” in your Expo account. Expo → Account settings → Access tokens.' },
    ],
    steps: [
      'Build the app with your Expo account (docs/MOBILE_APP.md → Android test build). Expo gives the app a project ID that push tokens belong to.',
      'Android: in the Firebase console create a project, add an Android app with package com.sampledge.projexa, then upload its service account key in expo.dev → your project → Credentials → Android → FCM V1. iOS needs an Apple developer account; EAS sets up the push key when you build.',
      'Save here with Push notifications On, then press Test. People choose what they get in the app under Account → Push notifications.',
    ],
    links: [
      { label: 'Expo push notifications', href: 'https://docs.expo.dev/push-notifications/overview/' },
      { label: 'FCM credentials for Expo', href: 'https://docs.expo.dev/push-notifications/fcm-credentials/' },
    ],
    testable: true,
  },
  {
    kind: 'backup_storage',
    group: 'Backups',
    label: 'Backup storage',
    summary: 'Where database backups are kept: a folder on this server, or a free S3-compatible bucket such as Cloudflare R2 or Backblaze B2.',
    scope: 'platform',
    ownerOnly: true,
    fields: [
      {
        key: 'BACKUP_TARGET', label: 'Keep backups in', type: 'select', required: true, default: 'local',
        options: [{ value: 'local', label: 'A folder on this server' }, { value: 's3', label: 'An S3-compatible bucket (Cloudflare R2, Backblaze B2, MinIO, Wasabi, AWS S3)' }],
        hint: 'A bucket keeps backups safe even if the server itself is lost. Cloudflare R2 and Backblaze B2 both have a free 10 GB tier.',
      },
      { key: 'BACKUP_DIR', label: 'Folder on the server', type: 'text', default: 'backups', placeholder: '/var/backups/samptrek', hint: 'Only for "A folder on this server". A relative path is inside the API folder. Use a disk other than the database disk if you can.' },
      { key: 'BACKUP_S3_ENDPOINT', label: 'Bucket endpoint', type: 'url', placeholder: 'https://<account-id>.r2.cloudflarestorage.com', hint: 'R2: https://<account-id>.r2.cloudflarestorage.com. Backblaze B2: https://s3.<region>.backblazeb2.com. MinIO: your MinIO address.' },
      { key: 'BACKUP_S3_REGION', label: 'Region', type: 'text', default: 'auto', placeholder: 'auto', hint: 'R2: auto. Backblaze B2: the region in the endpoint, e.g. us-west-004. MinIO: us-east-1.' },
      { key: 'BACKUP_S3_BUCKET', label: 'Bucket name', type: 'text', placeholder: 'samptrek-backups' },
      { key: 'BACKUP_S3_PREFIX', label: 'Folder in the bucket (optional)', type: 'text', placeholder: 'production' },
      { key: 'BACKUP_S3_STYLE', label: 'Address style', type: 'select', default: 'path', options: [{ value: 'path', label: 'Path (R2, B2, MinIO)' }, { value: 'virtual', label: 'Virtual-hosted (AWS S3 buckets made after 2020)' }] },
      { key: 'BACKUP_S3_ACCESS_KEY', label: 'Access key ID', type: 'text' },
      { key: 'BACKUP_S3_SECRET_KEY', label: 'Secret access key', type: 'secret' },
      { key: 'BACKUP_PASSPHRASE', label: 'Encryption passphrase (recommended)', type: 'secret', hint: 'Every backup is encrypted with it (AES-256). Write it down somewhere safe: a backup cannot be restored on a new server without it.' },
    ],
    steps: [
      'Free and simplest: keep "A folder on this server" and save. Backups then stay on this server, so also copy them off it now and then with Download.',
      'Safer and still free: create a bucket. Cloudflare R2: R2 → Create bucket, then Manage R2 API tokens → Create API token with Object Read & Write for that bucket; copy the access key ID, secret and the S3 endpoint. Backblaze B2: Buckets → Create a bucket (private), then Application Keys → Add a New Application Key for that bucket.',
      'Choose a long encryption passphrase, paste it here and keep a copy in your password manager.',
      'Save and press Test: SampTrek writes, reads and deletes a small test file and checks that mongodump (MongoDB Database Tools) is installed.',
      'Then open Super Admin → Backups to take the first backup and set a schedule.',
    ],
    links: [
      { label: 'Cloudflare R2 (10 GB free)', href: 'https://developers.cloudflare.com/r2/get-started/' },
      { label: 'Backblaze B2 (10 GB free)', href: 'https://www.backblaze.com/docs/cloud-storage-s3-compatible-api' },
    ],
    testable: true,
    next: { label: 'Super Admin → Backups', href: '/super-admin/backups' },
  },
  {
    kind: 'ip_reputation',
    group: 'Fraud',
    label: 'IP and proxy reputation',
    summary: 'Stops respondents coming through VPNs, proxies, data centres and known abusive addresses. Free sources only; used by projects with “IP and proxy reputation” on.',
    scope: 'org',
    fields: [
      {
        key: 'IP_LISTS',
        label: 'Free public lists',
        type: 'select',
        default: 'on',
        options: [{ value: 'on', label: 'On (VPN, data centre and abuse lists)' }, { value: 'off', label: 'Off' }],
        hint: 'X4BNet VPN and data centre ranges and FireHOL Level 1, refreshed every 12 hours. No account or key needed.',
      },
      {
        key: 'PROXYCHECK_API_KEY',
        label: 'proxycheck.io key (optional, free)',
        type: 'secret',
        hint: 'Free account: 1,000 lookups a day. Catches residential proxies the lists miss. Each address is looked up once a week at most.',
      },
      { key: 'IP_ALLOWLIST', label: 'Always allow (your office, QA)', type: 'text', placeholder: '203.0.113.7, 198.51.100.0/24', hint: 'Addresses or ranges, separated by commas. They pass this check even when a list names them.' },
      { key: 'IP_BLOCKLIST', label: 'Always block', type: 'text', placeholder: '192.0.2.0/24', hint: 'Addresses or ranges you have seen fraud from, separated by commas.' },
    ],
    steps: [
      'Keep Free public lists On. They work straight away, with nothing to sign up for.',
      'Optional: create a free account at proxycheck.io, open Dashboard → API key, copy the key and paste it here. It adds residential proxy detection (1,000 lookups a day on the free plan).',
      'Add your office or QA addresses to Always allow, so test runs from a VPN are not stopped.',
      'Save and press Test. Then turn on “IP and proxy reputation” in a project’s Gate & security tab.',
    ],
    links: [
      { label: 'proxycheck.io free plan', href: 'https://proxycheck.io/pricing' },
      { label: 'X4BNet VPN lists', href: 'https://github.com/X4BNet/lists_vpn' },
      { label: 'FireHOL Level 1', href: 'https://iplists.firehol.org/?ipset=firehol_level1' },
    ],
    testable: true,
  },
];

export const KIND: Record<IntegrationKind, KindDef> = Object.fromEntries(CATALOG.map((k) => [k.kind, k])) as Record<IntegrationKind, KindDef>;

/**
 * The only settings that stay in .env (docs/INTEGRATIONS.md): where the database is, the keys that
 * protect what is stored in it, and this server's own addresses. Everything else is in the database.
 */
export const BOOTSTRAP_ENV = [
  { name: 'DATABASE_URL', why: 'Where the database is.' },
  { name: 'JWT_SECRET', why: 'Signs sign-in sessions.' },
  { name: 'MFA_ENCRYPTION_KEY', why: 'Master key that encrypts saved secrets (integrations, accounting tokens, authenticator apps).' },
  { name: 'PUBLIC_BASE_URL', why: 'The public address of the API, used in links and redirect URIs.' },
  { name: 'WEB_ORIGIN', why: 'The address of the web app.' },
];
