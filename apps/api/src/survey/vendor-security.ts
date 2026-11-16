import { z } from 'zod';
import { SECURITY_KEYS } from '../projects/projects.schemas';

/**
 * Security per vendor (feedback 2026-11-16): a vendor can have looser or tighter checks than the
 * project, either everywhere (Vendor.securityOverrides, set on the Vendors page) or in one project
 * (VendorAllocation.securityOverrides, set on the Vendors & links tab). Only the switches that are
 * set override; the rest follow the project. The project's own setting for the vendor wins over the
 * vendor's, which wins over the project. "deviceLimits": false lets every device and system in.
 */
export const OVERRIDE_KEYS = [...SECURITY_KEYS, 'deviceLimits'] as const;
export type OverrideKey = (typeof OVERRIDE_KEYS)[number];
export type SecurityOverrides = Partial<Record<OverrideKey, boolean>>;

export const securityOverridesSchema = z
  .record(z.string(), z.boolean())
  .superRefine((o, ctx) => {
    for (const k of Object.keys(o)) if (!(OVERRIDE_KEYS as readonly string[]).includes(k)) ctx.addIssue({ code: 'custom', message: `Unknown security switch ${k}` });
  })
  .transform((o) => o as SecurityOverrides);

/** Overrides as stored: only known keys with boolean values; null when nothing is set. */
export function overridesOf(raw: unknown): SecurityOverrides {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: SecurityOverrides = {};
  for (const k of OVERRIDE_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'boolean') out[k] = v;
  }
  return out;
}

export function cleanOverrides(o: SecurityOverrides | null | undefined): SecurityOverrides | null {
  const c = overridesOf(o);
  return Object.keys(c).length ? c : null;
}

/** The switches that apply to one respondent of this vendor: project, then vendor, then this project's vendor setting. */
export function effectiveSecurity(project: unknown, vendor: unknown, allocation: unknown): Record<string, boolean> {
  const out = { ...((project ?? {}) as Record<string, boolean>) };
  for (const layer of [overridesOf(vendor), overridesOf(allocation)]) {
    for (const [k, v] of Object.entries(layer)) if (k !== 'deviceLimits') out[k] = v!;
  }
  return out;
}

/** False when the vendor (or the project's setting for it) switches device and system limits off. */
export function deviceLimitsOn(vendor: unknown, allocation: unknown): boolean {
  return overridesOf(allocation).deviceLimits ?? overridesOf(vendor).deviceLimits ?? true;
}
