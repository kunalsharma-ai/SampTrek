'use client';
import clsx from 'clsx';
import { RotateCcw } from 'lucide-react';
import { InfoTip } from '@/components/help';
import { SECURITY_LABELS } from '@/lib/types';

/** Switch → true (on), false (off). Missing switches follow the project. "deviceLimits" covers devices and systems. */
export type SecurityOverrides = Record<string, boolean>;

export const OVERRIDE_LABELS: Record<string, string> = { ...SECURITY_LABELS, deviceLimits: 'Device and system limits' };
/** The switches people change per vendor most often come first. */
const ORDER = ['deviceLimits', 'duplicateDetection', 'oneOpenPerIp', 'oneEntryPerBrowser', 'gateSurvey', 'captcha', 'prescreening', 'browserFingerprinting', 'cookieValidation', 'crossProjectDuplicates', 'geolocation', 'timezoneTracking', 'browserLanguage', 'torDetection', 'proxyDetection', 'automationDetection', 'urlProtection'];
export const OVERRIDE_KEYS = [...ORDER, ...Object.keys(SECURITY_LABELS).filter((k) => !ORDER.includes(k))];

export function describeOverrides(o: SecurityOverrides | null | undefined): string {
  const set = Object.entries(o ?? {}).filter(([, v]) => typeof v === 'boolean');
  if (!set.length) return 'Same as the project';
  return set.map(([k, v]) => `${OVERRIDE_LABELS[k] ?? k} ${v ? 'on' : 'off'}`).join(' · ');
}

/** An ON / OFF switch with the words on it (feedback 2026-11-18: toggles, not drop-downs). */
export function OnOffSwitch({ checked, onChange, disabled, label, dim }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string; dim?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-6 w-[58px] shrink-0 items-center rounded-full border text-[10px] font-bold tracking-wide transition-colors disabled:cursor-not-allowed',
        checked ? 'border-ok/60 bg-ok text-white' : 'border-line bg-sunken text-muted',
        dim && 'opacity-60',
      )}
    >
      <span className={clsx('absolute', checked ? 'left-2' : 'right-2')}>{checked ? 'ON' : 'OFF'}</span>
      <span className={clsx('absolute top-0.5 h-[18px] w-[18px] rounded-full bg-white shadow transition-all', checked ? 'left-[35px]' : 'left-0.5')} />
    </button>
  );
}

/**
 * One ON / OFF switch per security check. A switch nobody has touched shows what it is now (the
 * project's value, dimmed, labelled "as project"); flipping it sets it for this vendor, and "Reset"
 * puts it back to follow `base`. `projectValues` are the project's own switches; without them
 * (the vendor page, which covers every project) an untouched switch shows ON: the check runs
 * whenever a project has it on.
 */
export function SecurityOverridesEditor({ value, onChange, disabled, base = 'the project', projectValues }: {
  value: SecurityOverrides;
  onChange: (v: SecurityOverrides) => void;
  disabled?: boolean;
  base?: string;
  projectValues?: Record<string, boolean>;
}) {
  const set = (k: string, v: boolean | undefined) => {
    const next = { ...value };
    if (v === undefined) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-2.5 sm:grid-cols-2">
      {OVERRIDE_KEYS.map((k) => {
        const v = value[k];
        const follow = projectValues?.[k] ?? true;
        const shown = v ?? follow;
        const name = OVERRIDE_LABELS[k] ?? k;
        return (
          <div key={k} className="flex items-center justify-between gap-3 text-sm">
            <span className="min-w-0">
              <span className={clsx('inline-flex items-center gap-1', v !== undefined && 'font-medium')}>{name}<InfoTip id={`check:${k}`} label={name} /></span>
              <span className="block text-[11px] text-muted">
                {v === undefined ? (projectValues ? `As ${base} (${follow ? 'on' : 'off'})` : `Follows ${base}`) : `Set for this vendor`}
                {v !== undefined && !disabled && (
                  <button type="button" className="ml-1.5 inline-flex items-center gap-0.5 text-brand hover:underline" onClick={() => set(k, undefined)}>
                    <RotateCcw className="h-3 w-3" /> Reset
                  </button>
                )}
              </span>
            </span>
            <OnOffSwitch checked={shown} dim={v === undefined} disabled={disabled} onChange={(n) => set(k, n)} label={`${name} for this vendor`} />
          </div>
        );
      })}
    </div>
  );
}
