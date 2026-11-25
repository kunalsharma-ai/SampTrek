const CONFIGURED_API = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const MAIN_WEB = (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? 'http://localhost:3000').replace(/\/$/, '');
/**
 * White-label custom domains (docs/WHITE_LABEL.md): when turned on and the app is opened on an
 * address other than the main one, the API is reached through this web server (/api/v1 is
 * proxied by next.config.mjs), so the sign-in cookie belongs to the custom domain.
 */
export const API_URL =
  process.env.NEXT_PUBLIC_CUSTOM_DOMAINS === 'true' && typeof window !== 'undefined' && window.location.origin !== MAIN_WEB ? window.location.origin : CONFIGURED_API;

export class ApiError extends Error {
  constructor(public status: number, message: string, public issues: string[] = [], public code?: string) {
    super(message);
  }
}

/**
 * Super Admin feature switches (docs/SUPER_ADMIN.md): every response carries X-Features-Version.
 * When it changes, the app reloads what this person may use, so a switch applies at once.
 */
export const FEATURES_EVENT = 'projexa:features';
let featuresVersion: string | null = null;
function watchFeatures(res: Response) {
  const v = res.headers.get('X-Features-Version');
  if (!v || typeof window === 'undefined') return;
  if (featuresVersion && v !== featuresVersion) window.dispatchEvent(new CustomEvent(FEATURES_EVENT, { detail: v }));
  featuresVersion = v;
}

function issueText(i: unknown): string {
  if (typeof i === 'string') return i;
  if (i && typeof i === 'object') {
    const o = i as { path?: string; message?: string; status?: string; scope?: { countryCode?: string; vendorId?: string } };
    const where = [o.status, o.scope?.countryCode, o.path].filter(Boolean).join(' · ');
    return where ? `${where}: ${o.message}` : String(o.message);
  }
  return String(i);
}

/**
 * "Login as" (feedback 2026-11-24): an admin opened this tab as another user. The session lives in
 * this tab's sessionStorage only and is sent as a Bearer header, so the admin's own sign-in (the
 * cookie) in other tabs is never touched.
 */
export const LOGIN_AS_KEY = 'samptrek:login-as';
export function loginAsToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return sessionStorage.getItem(LOGIN_AS_KEY);
  } catch {
    return null;
  }
}
/** Ends a "login as" tab: forgets its session and closes it (or shows the admin's own app). */
export function endLoginAs() {
  try {
    sessionStorage.removeItem(LOGIN_AS_KEY);
  } catch {}
  window.close();
  // Tabs not opened by script cannot close themselves.
  setTimeout(() => window.location.replace('/'), 150);
}
/** Headers and cookie mode for any call to the API from this tab. */
export function authInit(): { credentials: RequestCredentials; headers: Record<string, string> } {
  const t = loginAsToken();
  return t ? { credentials: 'omit', headers: { Authorization: `Bearer ${t}` } } : { credentials: 'include', headers: {} };
}

export async function api<T = unknown>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const auth = authInit();
  const res = await fetch(`${API_URL}/api/v1${path}`, {
    credentials: auth.credentials,
    ...rest,
    headers: { ...auth.headers, ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  watchFeatures(res);
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined' && !path.startsWith('/auth/')) {
      if (loginAsToken()) {
        // The "login as" session ended (2 hours, or the account changed): back to the admin's own app.
        try { sessionStorage.removeItem(LOGIN_AS_KEY); } catch {}
        window.location.href = '/';
      } else window.location.href = '/login';
    }
    // The organization requires two-step sign-in and this person has not set it up yet.
    if (res.status === 403 && data?.code === 'MFA_SETUP_REQUIRED' && typeof window !== 'undefined' && window.location.pathname !== '/account/security') {
      window.location.href = '/account/security';
    }
    const msg = data?.message && typeof data.message === 'object' ? data.message.message : data?.message;
    const issues = (data?.issues ?? data?.message?.issues ?? []).map(issueText);
    // A feature was switched off, or the organisation was paused: refresh the menu.
    if (res.status === 403 && ['FEATURE_DISABLED', 'ORG_SUSPENDED', 'SUBSCRIPTION_INACTIVE', 'ORG_PENDING'].includes(data?.code) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(FEATURES_EVENT, { detail: data.code }));
    }
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`, issues, data?.code);
  }
  return data as T;
}

export const get = <T,>(p: string) => api<T>(p);
export const post = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'POST', json: json ?? {} });
export const patch = <T,>(p: string, json?: unknown) => api<T>(p, { method: 'PATCH', json: json ?? {} });
