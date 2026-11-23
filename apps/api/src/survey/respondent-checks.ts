import { createHash } from 'crypto';
import { hmacSha256, safeEqualHex } from '../common/crypto';
import TIMEZONES from './timezones.json';

/**
 * Respondent security checks. Each returns a CheckResult; the caller decides whether a failure
 * is enforced (live links) or only logged (test links).
 *
 * Reason codes are stored in RespondentSession.statusDetail and shown in reports.
 */
export interface CheckResult {
  check: string;
  ok: boolean;
  /** Reason code when the check fails, or a short note (e.g. "not configured") when it could not run. */
  reason?: string;
  /** Status the session gets when this failure is enforced. */
  status?: 'SECURITY_REJECT' | 'DUPLICATE' | 'TERMINATE' | 'QUOTA_FULL' | 'PARTIAL';
  note?: string;
  /** Risk points a passing check still adds (soft signals), and their names. See fraud.ts. */
  risk?: number;
  signals?: string[];
}

export const REASON_LABELS: Record<string, string> = {
  BAD_SIGNATURE: 'Entry link signature missing or wrong',
  DEVICE_NOT_ALLOWED: 'Device type not allowed',
  MOBILE_OS_NOT_ALLOWED: 'Phone system (Android / iOS) not allowed',
  OS_NOT_ALLOWED: 'Operating system not allowed on this device (desktop or tablet)',
  TOR_EXIT: 'Connected through TOR',
  GEO_MISMATCH: 'Located outside the survey country',
  CAPTCHA_FAILED: 'Failed the background bot check',
  LANGUAGE_MISMATCH: 'Browser language does not match',
  TIMEZONE_MISMATCH: 'Time zone outside the survey country',
  COOKIES_BLOCKED: 'Cookies blocked',
  SAME_BROWSER: 'Same browser entered before',
  SAME_FINGERPRINT: 'Same device fingerprint entered before',
  SAME_DEVICE: 'Same IP and browser entered before',
  SAME_IP_OPEN: 'Same IP already has the survey open (another tab or window)',
  SAME_BROWSER_ENTRY: 'This browser already entered the project',
  SAME_DEVICE_OTHER_BROWSER: 'Same device and network already entered the project in another browser',
  PRESCREEN: 'Did not qualify on the prescreener',
  GATE_SCREENOUT: 'Did not qualify on the gate survey',
  GATE_INCOMPLETE: 'Gave missing or invalid gate answers',
  CONSENT_DECLINED: 'Did not agree to the consent notice',
  HUMAN_CHECK_FAILED: 'Failed the human check',
  GATE_SKIPPED: 'Skipped the entry checks',
  EXPIRED: 'Session expired',
  SPEEDER: 'Speeder: completed faster than the speeder check allows',
  PROXY_VPN: 'Connected through a VPN or proxy',
  DATACENTER_IP: 'Connected from a data centre or hosting network',
  IP_ABUSE: 'IP address on a public abuse list',
  IP_BLOCKED: 'IP address on your block list',
  AUTOMATED_BROWSER: 'Automated or faked browser',
  CROSS_VENDOR: 'Same person already came in through another vendor',
  SEEN_IN_OTHER_PROJECT: 'Same person already took part in another project',
  HIGH_RISK: 'Fraud risk score too high',
};

export type DeviceType = 'desktop' | 'mobile' | 'tablet';

/** Device class from the user agent. iPads on iPadOS 13+ report a Mac UA and count as desktop. */
export function deviceType(ua: string | undefined): DeviceType {
  const u = ua ?? '';
  if (/iPad|Tablet|PlayBook|Silk|Kindle|(Android(?!.*Mobile))/i.test(u)) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Windows Phone|BlackBerry|Opera Mini/i.test(u)) return 'mobile';
  return 'desktop';
}

export type DeviceOs = 'android' | 'ios' | 'other';

/** Operating system from the user agent (phones and tablets; desktops report "other"). */
export function deviceOs(ua: string | undefined): DeviceOs {
  const u = ua ?? '';
  if (/Android/i.test(u)) return 'android';
  if (/iPhone|iPod|iPad/i.test(u)) return 'ios';
  return 'other';
}

export type DesktopOs = 'windows' | 'mac' | 'linux' | 'other';

/** Desktop operating system. iPads on iPadOS 13+ send a Mac user agent and count as Mac. ChromeOS is "other". */
export function desktopOs(ua: string | undefined): DesktopOs {
  const u = ua ?? '';
  if (/Windows/i.test(u)) return 'windows';
  if (/Macintosh|Mac OS X/i.test(u)) return 'mac';
  if (/CrOS/i.test(u)) return 'other';
  if (/Linux|X11/i.test(u)) return 'linux';
  return 'other';
}

/**
 * Devices and systems allowed at entry. Every key is optional and missing means allowed, except
 * `mobileOther`: when it is missing (projects saved before it existed), phones on another system
 * are allowed only while both Android and iOS are.
 */
export interface DeviceRules {
  desktop?: boolean;
  mobile?: boolean;
  tablet?: boolean;
  /** Phone systems. */
  android?: boolean;
  ios?: boolean;
  mobileOther?: boolean;
  /** Desktop systems. */
  windows?: boolean;
  mac?: boolean;
  linux?: boolean;
  desktopOther?: boolean;
  /** Tablet systems. */
  tabletAndroid?: boolean;
  tabletIos?: boolean;
  tabletOther?: boolean;
}

/** Whether the system is allowed on that device type, and the reason code when it is not. */
function osAllowed(d: DeviceRules | null | undefined, type: DeviceType, ua: string | undefined): { ok: boolean; os: string } {
  if (type === 'desktop') {
    const os = desktopOs(ua);
    const key = ({ windows: 'windows', mac: 'mac', linux: 'linux', other: 'desktopOther' } as const)[os];
    return { ok: d?.[key] !== false, os };
  }
  const os = deviceOs(ua);
  if (type === 'tablet') {
    const key = ({ android: 'tabletAndroid', ios: 'tabletIos', other: 'tabletOther' } as const)[os];
    return { ok: d?.[key] !== false, os };
  }
  const android = d?.android !== false;
  const ios = d?.ios !== false;
  const other = d?.mobileOther ?? (android && ios);
  return { ok: os === 'android' ? android : os === 'ios' ? ios : other, os };
}

/**
 * Device type must be allowed, and then its operating system: Windows / Mac / Linux on desktops,
 * Android / iOS / other on phones and on tablets.
 */
export function checkDevice(devices: DeviceRules | null | undefined, ua: string | undefined): CheckResult {
  const type = deviceType(ua);
  if (devices?.[type] === false) return { check: 'device', ok: false, reason: 'DEVICE_NOT_ALLOWED', status: 'SECURITY_REJECT', note: type };
  const os = osAllowed(devices, type, ua);
  if (!os.ok) return { check: 'device', ok: false, reason: type === 'mobile' ? 'MOBILE_OS_NOT_ALLOWED' : 'OS_NOT_ALLOWED', status: 'SECURITY_REJECT', note: type };
  return { check: 'device', ok: true, note: type };
}

/**
 * URL protection: the vendor signs each entry link.
 * sig = hex HMAC-SHA256(vendor signing secret, uid). Stops respondents from inventing or
 * swapping respondent IDs in the link.
 */
export function signEntry(secret: string, uid: string): string {
  return hmacSha256(secret, uid);
}
export function checkEntrySignature(secret: string, uid: string, sig: string | undefined): CheckResult {
  const ok = !!sig && /^[0-9a-f]{64}$/i.test(sig) && safeEqualHex(signEntry(secret, uid), sig.toLowerCase());
  return ok ? { check: 'urlProtection', ok } : { check: 'urlProtection', ok, reason: 'BAD_SIGNATURE', status: 'SECURITY_REJECT' };
}

/** Countries a time zone is used in (IANA zone.tab / zone1970.tab, plus legacy aliases). */
export function timezoneCountries(tz: string | undefined): string[] {
  if (!tz) return [];
  return (TIMEZONES as Record<string, string[]>)[tz] ?? [];
}

export function checkTimezone(tz: string | undefined, countryCode: string): CheckResult {
  const countries = timezoneCountries(tz);
  // Unknown or generic zones (UTC, Etc/*) cannot prove a mismatch, so they pass.
  if (!countries.length) return { check: 'timezone', ok: true, note: tz ? `unmapped ${tz}` : 'not reported' };
  if (countries.includes(countryCode.toUpperCase())) return { check: 'timezone', ok: true, note: tz };
  return { check: 'timezone', ok: false, reason: 'TIMEZONE_MISMATCH', status: 'SECURITY_REJECT', note: tz };
}

/** At least one of the browser's languages has the same primary subtag as the survey language. */
export function checkLanguage(languages: string[] | undefined, surveyLanguage: string): CheckResult {
  const want = primary(surveyLanguage);
  const have = (languages ?? []).map(primary).filter(Boolean);
  if (!have.length) return { check: 'language', ok: true, note: 'not reported' };
  return have.includes(want)
    ? { check: 'language', ok: true, note: have.join(',') }
    : { check: 'language', ok: false, reason: 'LANGUAGE_MISMATCH', status: 'SECURITY_REJECT', note: have.slice(0, 5).join(',') };
}
function primary(lang: string) {
  return (lang ?? '').trim().toLowerCase().split(/[-_]/)[0];
}

/**
 * Captcha: a proof-of-work challenge solved by the gate page in the background (no third party,
 * nothing for the respondent to type). Bots must spend CPU per entry; scripted link-hitting
 * without a browser fails.
 * The challenge is derived from the session token, so nothing has to be stored.
 */
export const POW_BITS = 16;
export function powChallenge(serverSecret: string, token: string): string {
  return hmacSha256(serverSecret, `pow:${token}`).slice(0, 32);
}
export function checkPow(challenge: string, nonce: unknown, bits = POW_BITS): CheckResult {
  const n = typeof nonce === 'number' || typeof nonce === 'string' ? String(nonce) : '';
  const ok = /^\d{1,12}$/.test(n) && leadingZeroBits(createHash('sha256').update(`${challenge}:${n}`).digest()) >= bits;
  return ok ? { check: 'captcha', ok } : { check: 'captcha', ok, reason: 'CAPTCHA_FAILED', status: 'SECURITY_REJECT' };
}
export function leadingZeroBits(buf: Buffer): number {
  let bits = 0;
  for (const byte of buf) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    return bits + Math.clz32(byte) - 24;
  }
  return bits;
}

/** Geolocation from the edge/CDN country header (e.g. CF-IPCountry). */
export function checkGeo(headerValue: string | undefined, countryCode: string): CheckResult {
  const v = (headerValue ?? '').trim().toUpperCase();
  // XX = unknown, T1 = TOR (Cloudflare); neither is evidence of a different country.
  if (!/^[A-Z]{2}$/.test(v) || v === 'XX' || v === 'T1') return { check: 'geolocation', ok: true, note: v ? `unknown (${v})` : 'not reported' };
  return v === countryCode.toUpperCase()
    ? { check: 'geolocation', ok: true, note: v }
    : { check: 'geolocation', ok: false, reason: 'GEO_MISMATCH', status: 'SECURITY_REJECT', note: v };
}

