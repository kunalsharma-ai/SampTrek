/**
 * Vendors never see a project's internal name: it often names the client or the topic
 * (docs/CLIENTS_VENDORS_EDITING.md). They see Project.vendorTitle, or, when it is empty,
 * "Survey <work order> · <project code>" (just "Survey <code>" when there is no work order).
 */
export function defaultVendorTitle(p: { projectCode: string; workOrderNo?: string | null }): string {
  const wo = p.workOrderNo?.trim();
  return wo ? `Survey ${wo} · ${p.projectCode}` : `Survey ${p.projectCode}`;
}

export function vendorProjectName(p: { projectCode: string; vendorTitle?: string | null; workOrderNo?: string | null }): string {
  return p.vendorTitle?.trim() || defaultVendorTitle(p);
}

/** Replaces `name` with the vendor-facing title and drops vendorTitle from the payload. */
export function forVendor<T extends { projectCode: string; name?: string; vendorTitle?: string | null; workOrderNo?: string | null }>(p: T): Omit<T, 'vendorTitle'> & { name: string } {
  const { vendorTitle: _v, ...rest } = p;
  return { ...rest, name: vendorProjectName(p) };
}
