'use client';
import clsx from 'clsx';
import { ChevronDown, Monitor, Smartphone, Tablet } from 'lucide-react';
import { useState } from 'react';
import { InfoTip } from '@/components/help';

/**
 * Devices allowed, and the operating systems allowed on each: Windows / Mac / Linux / other on
 * desktops, Android / iOS / other on phones and on tablets.
 */
export type DeviceSettings = {
  desktop: boolean; mobile: boolean; tablet: boolean;
  android: boolean; ios: boolean; mobileOther: boolean;
  windows: boolean; mac: boolean; linux: boolean; desktopOther: boolean;
  tabletAndroid: boolean; tabletIos: boolean; tabletOther: boolean;
};
type OsKey = Exclude<keyof DeviceSettings, 'desktop' | 'mobile' | 'tablet'>;

/** Fills in the systems for projects saved before they existed (all allowed; other phones only with both Android and iOS, as before). */
export function withOs(d: Partial<Record<string, boolean>> | null | undefined): DeviceSettings {
  const yes = (k: string) => d?.[k] !== false;
  return {
    desktop: yes('desktop'), mobile: yes('mobile'), tablet: yes('tablet'),
    android: yes('android'), ios: yes('ios'), mobileOther: d?.mobileOther ?? (yes('android') && yes('ios')),
    windows: yes('windows'), mac: yes('mac'), linux: yes('linux'), desktopOther: yes('desktopOther'),
    tabletAndroid: yes('tabletAndroid'), tabletIos: yes('tabletIos'), tabletOther: yes('tabletOther'),
  };
}

export const DEVICE_GROUPS: { key: 'desktop' | 'mobile' | 'tablet'; label: string; Icon: typeof Monitor; os: { key: OsKey; label: string }[] }[] = [
  { key: 'desktop', label: 'Desktop', Icon: Monitor, os: [{ key: 'windows', label: 'Windows' }, { key: 'mac', label: 'Mac' }, { key: 'linux', label: 'Linux' }, { key: 'desktopOther', label: 'Other' }] },
  { key: 'mobile', label: 'Mobile', Icon: Smartphone, os: [{ key: 'android', label: 'Android' }, { key: 'ios', label: 'iOS' }, { key: 'mobileOther', label: 'Other' }] },
  { key: 'tablet', label: 'Tablet', Icon: Tablet, os: [{ key: 'tabletAndroid', label: 'Android' }, { key: 'tabletIos', label: 'iOS' }, { key: 'tabletOther', label: 'Other' }] },
];

/** Message to show when the device choice cannot be saved, or null. */
export function devicesProblem(d: DeviceSettings): string | null {
  if (!d.desktop && !d.mobile && !d.tablet) return 'Allow at least one device.';
  for (const g of DEVICE_GROUPS) if (d[g.key] && !g.os.some((o) => d[o.key])) return `Choose at least one ${g.label.toLowerCase()} system.`;
  return null;
}

/** Short text such as "Desktop (Windows, Mac) · Mobile (all)". */
export function describeDevices(d: DeviceSettings): string {
  return DEVICE_GROUPS.filter((g) => d[g.key]).map((g) => {
    const on = g.os.filter((o) => d[o.key]);
    return `${g.label} (${on.length === g.os.length ? 'all' : on.map((o) => o.label).join(', ') || 'none'})`;
  }).join(' · ') || 'none';
}

/**
 * Desktop, Mobile and Tablet, each with its operating systems underneath. Unticking a device
 * blocks it; unticking a system blocks only that system on that device.
 */
export function DevicePicker({ devices, onChange, disabled }: { devices: DeviceSettings; onChange: (d: DeviceSettings) => void; disabled?: boolean }) {
  const [open, setOpen] = useState<Record<string, boolean>>({ desktop: true, mobile: true, tablet: true });
  return (
    <div className="divide-y divide-line rounded-lg border border-line" role="group" aria-label="Devices and systems allowed">
      {DEVICE_GROUPS.map(({ key, label, Icon, os }) => {
        const on = devices[key];
        return (
          <div key={key} className="p-3">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" className="h-4 w-4" disabled={disabled} checked={on} onChange={(e) => onChange({ ...devices, [key]: e.target.checked })} />
                <Icon className="h-4 w-4 text-muted" aria-hidden /> {label}
              </label>
              <button type="button" className="btn-ghost p-1" aria-expanded={!!open[key]} aria-label={`${open[key] ? 'Hide' : 'Show'} ${label} systems`} onClick={() => setOpen({ ...open, [key]: !open[key] })}>
                <ChevronDown className={clsx('h-4 w-4 transition-transform', open[key] && 'rotate-180')} />
              </button>
            </div>
            {open[key] && (
              <div className={clsx('mt-2 flex flex-wrap gap-x-5 gap-y-2 pl-6 text-sm', !on && 'opacity-50')}>
                {os.map((o) => (
                  <label key={o.key} className="flex items-center gap-2">
                    <input type="checkbox" className="h-4 w-4" disabled={disabled || !on} checked={devices[o.key]} onChange={(e) => onChange({ ...devices, [o.key]: e.target.checked })} />
                    {o.label}
                  </label>
                ))}
                {on && !os.some((o) => devices[o.key]) && <span className="text-xs text-warn">Pick at least one</span>}
              </div>
            )}
          </div>
        );
      })}
      <p className="flex items-center gap-1 p-3 text-xs text-muted">iPads on iPadOS 13 or later identify as a Mac and count as Desktop · Mac. <InfoTip id="device.mobileOs" /></p>
    </div>
  );
}
