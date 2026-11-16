'use client';
import clsx from 'clsx';
import { SECURITY_LABELS } from '@/lib/types';

/** Switch → true (on), false (off). Missing switches follow the project. "deviceLimits" covers devices and systems. */
export type SecurityOverrides = Record<string, boolean>;

export const OVERRIDE_LABELS: Record<string, string> = { ...SECURITY_LABELS, deviceLimits: 'Device and system limits' };
/** The switches people change per vendor most often come first. */
const ORDER = ['deviceLimits', 'duplicateDetection', 'gateSurvey', 'captcha', 'prescreening', 'browserFingerprinting', 'cookieValidation', 'crossProjectDuplicates', 'geolocation', 'timezoneTracking', 'browserLanguage', 'torDetection', 'proxyDetection', 'automationDetection', 'urlProtection'];
export const OVERRIDE_KEYS = [...ORDER, ...Object.keys(SECURITY_LABELS).filter((k) => !ORDER.includes(k))];

export function describeOverrides(o: SecurityOverrides | null | undefined): string {
  const set = Object.entries(o ?? {}).filter(([, v]) => typeof v === 'boolean');
  if (!set.length) return 'Same as the project';
  return set.map(([k, v]) => `${OVERRIDE_LABELS[k] ?? k} ${v ? 'on' : 'off'}`).join(' · ');
}

/**
 * One row per security switch with three choices: follow the project, always on, or always off
 * for this vendor. `base` names what "follow" means (e.g. "the project" or "the vendor's settings").
 */
export function SecurityOverridesEditor({ value, onChange, disabled, base = 'the project', projectValues }: {
  value: SecurityOverrides;
  onChange: (v: SecurityOverrides) => void;
  disabled?: boolean;
  base?: string;
  /** The project's own switches, to show what "follow" means right now. */
  projectValues?: Record<string, boolean>;
}) {
  const set = (k: string, v: '' | 'on' | 'off') => {
    const next = { ...value };
    if (v === '') delete next[k];
    else next[k] = v === 'on';
    onChange(next);
  };
  return (
    <div className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {OVERRIDE_KEYS.map((k) => {
        const v = value[k];
        const now = k === 'deviceLimits' ? true : projectValues?.[k];
        return (
          <label key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className={clsx(v !== undefined && 'font-medium')}>{OVERRIDE_LABELS[k] ?? k}</span>
            <select className={clsx('input w-auto py-1 text-xs', v === false && 'border-warn', v === true && 'border-ok')} disabled={disabled} value={v === undefined ? '' : v ? 'on' : 'off'} onChange={(e) => set(k, e.target.value as '' | 'on' | 'off')} aria-label={`${OVERRIDE_LABELS[k] ?? k} for this vendor`}>
              <option value="">Same as {base}{now !== undefined ? ` (${now ? 'on' : 'off'})` : ''}</option>
              <option value="on">On</option>
              <option value="off">Off</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
