/**
 * Vendor notices (feedback 2026-11-23): when staff change a quota, the vendors working on that
 * market see it in their portal with the time, so the team does not have to email every vendor.
 *
 * A notice is written for each vendor on the market (or on the project, for project-wide notes).
 * Text is vendor-safe: the project is named the way vendors see it, never by the internal name
 * or the client.
 */
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { vendorProjectName } from '../common/vendor-safe';

const log = new Logger('VendorNotices');

export type NoticeKind = 'quota' | 'notes' | 'files' | 'status';

/** Notices for the vendors of one market (countryId) or of the whole project. Never throws. */
export async function notifyVendors(
  prisma: PrismaService,
  n: { projectId: string; countryId?: string; vendorIds?: string[]; kind: NoticeKind; title: (projectLabel: string, market: string | null) => string; detail: string },
) {
  try {
    const project = await prisma.project.findFirst({ where: { id: n.projectId }, select: { id: true, organizationId: true, projectCode: true, workOrderNo: true, vendorTitle: true } });
    if (!project) return 0;
    const allocations = await prisma.vendorAllocation.findMany({
      where: { projectCountry: { projectId: n.projectId, ...(n.countryId ? { id: n.countryId } : {}) }, ...(n.vendorIds ? { vendorId: { in: n.vendorIds } } : {}), status: { not: 'CLOSED' } },
      select: { vendorId: true, projectCountry: { select: { countryCode: true, targetGroup: true } } },
    });
    const vendors = [...new Set(allocations.map((a) => a.vendorId))];
    if (!vendors.length) return 0;
    const c = n.countryId ? allocations[0]?.projectCountry : undefined;
    const market = c ? `${c.countryCode}${c.targetGroup ? ` · ${c.targetGroup}` : ''}` : null;
    const title = n.title(vendorProjectName(project), market).slice(0, 300);
    await prisma.vendorNotice.createMany({
      data: vendors.map((vendorId) => ({ organizationId: project.organizationId, vendorId, projectId: project.id, projectCountryId: n.countryId ?? null, kind: n.kind, title, detail: n.detail.slice(0, 2000) })),
    });
    return vendors.length;
  } catch (e) {
    log.warn(`Vendor notice failed: ${(e as Error).message}`);
    return 0;
  }
}
