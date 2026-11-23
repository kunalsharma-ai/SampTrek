/**
 * Vendor portal, project view (feedback 2026-11-23).
 *
 * The vendor sees a list of its projects (a table, not cards) and opens one the way staff open a
 * project, but with only its own side: the description, its links per market, its clicks, completes,
 * terminates, over quota, current against planned LOI and IR, its billing and its chargebacks
 * (rejected completes), the quota notes and the documents shared with vendors. Never the client,
 * the client CPI, other vendors or any security setting. It also has a notices list: quota changes
 * staff made, with the time (src/portal/vendor-notices.ts).
 */
import { Body, Controller, ForbiddenException, Get, HttpCode, NotFoundException, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { config } from '../common/config';
import { forVendor } from '../common/vendor-safe';
import { ZodPipe } from '../common/zod.pipe';
import { SPEEDER_DETAIL } from '../projects/field-metrics';
import { entryQuery } from '../projects/markets';
import { PrismaService } from '../prisma/prisma.service';

const VISIBLE = ['TEST', 'LIVE', 'HOLD', 'CLOSED', 'INVOICED'] as const;
const readSchema = z.object({ ids: z.array(z.string().min(1).max(64)).max(500).optional() }).strict();
const round1 = (n: number) => Math.round(n * 10) / 10;

type Counts = { clicks: number; completes: number; terminates: number; overquota: number; security: number; speeders: number; dropouts: number; inProgress: number; approved: number; pending: number; rejected: number; loiMs: number; loiN: number };
const zero = (): Counts => ({ clicks: 0, completes: 0, terminates: 0, overquota: 0, security: 0, speeders: 0, dropouts: 0, inProgress: 0, approved: 0, pending: 0, rejected: 0, loiMs: 0, loiN: 0 });

@Controller('portal/vendor')
@Roles('VENDOR_USER')
export class VendorProjectsController {
  constructor(private readonly prisma: PrismaService) {}

  private async vendor(u: AuthUser) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, select: { vendorId: true } });
    if (!user.vendorId) throw new ForbiddenException('This account is not linked to a vendor');
    return this.prisma.vendor.findUniqueOrThrow({ where: { id: user.vendorId }, select: { id: true, name: true, code: true, portalHidePayout: true, uidMacro: true } });
  }

  /** Counts per allocation from this vendor's live (non-test) sessions. */
  private async counts(allocationIds: string[]) {
    const out = new Map<string, Counts>();
    if (!allocationIds.length) return out;
    const now = Date.now();
    const rows = await this.prisma.respondentSession.findMany({
      where: { vendorAllocationId: { in: allocationIds }, isTest: false },
      select: { vendorAllocationId: true, status: true, statusDetail: true, approval: true, startedAt: true, gatePassedAt: true, outcomeAt: true, expiresAt: true },
    });
    for (const s of rows) {
      const c = out.get(s.vendorAllocationId) ?? zero();
      c.clicks++;
      if (s.status === 'COMPLETE') {
        c.completes++;
        if (s.approval === 'APPROVED') c.approved++;
        else if (s.approval === 'REJECTED') c.rejected++;
        else c.pending++;
        if (s.outcomeAt) {
          c.loiMs += s.outcomeAt.getTime() - (s.gatePassedAt ?? s.startedAt).getTime();
          c.loiN++;
        }
      } else if (s.status === 'TERMINATE') c.terminates++;
      else if (s.status === 'QUOTA_FULL') c.overquota++;
      else if (s.status === 'QUALITY_FAIL' && s.statusDetail === SPEEDER_DETAIL) c.speeders++;
      else if (['QUALITY_FAIL', 'DUPLICATE', 'SECURITY_REJECT'].includes(s.status)) c.security++;
      else if (s.status === 'STARTED' && s.expiresAt.getTime() >= now) c.inProgress++;
      else c.dropouts++;
      out.set(s.vendorAllocationId, c);
    }
    return out;
  }

  private shapeCounts(c: Counts) {
    const { loiMs, loiN, ...rest } = c;
    return { ...rest, avgLoi: loiN ? round1(loiMs / loiN / 60_000) : null, ir: c.completes + c.terminates ? round1((c.completes / (c.completes + c.terminates)) * 100) : null, conversion: c.clicks ? round1((c.completes / c.clicks) * 100) : null };
  }

  /** This vendor's projects, one row each, newest first. */
  @Get('projects')
  async projects(@CurrentUser() u: AuthUser) {
    const v = await this.vendor(u);
    const allocs = await this.prisma.vendorAllocation.findMany({
      where: { vendorId: v.id, projectCountry: { project: { organizationId: u.organizationId, status: { in: [...VISIBLE] } } } },
      select: { id: true, status: true, targetCompletes: true, completes: true, projectCountry: { select: { status: true, countryCode: true, project: { select: { id: true, projectCode: true, workOrderNo: true, vendorTitle: true, name: true, status: true, category: true, createdAt: true } } } } },
    });
    const counts = await this.counts(allocs.map((a) => a.id));
    const notices = await this.prisma.vendorNotice.groupBy({ by: ['projectId'], where: { vendorId: v.id, readAt: null }, _count: { _all: true } });
    const byProject = new Map<string, { project: ReturnType<typeof forVendor>; markets: string[]; target: number; completes: number; accepting: boolean; counts: Counts; createdAt: Date }>();
    for (const a of allocs) {
      const p = a.projectCountry.project;
      const row = byProject.get(p.id) ?? { project: forVendor({ id: p.id, projectCode: p.projectCode, workOrderNo: p.workOrderNo, vendorTitle: p.vendorTitle, status: p.status, category: p.category }), markets: [], target: 0, completes: 0, accepting: false, counts: zero(), createdAt: p.createdAt };
      row.markets.push(a.projectCountry.countryCode);
      row.target += a.targetCompletes;
      row.completes += a.completes;
      row.accepting ||= a.status === 'ACTIVE' && a.projectCountry.status === 'LIVE' && p.status === 'LIVE';
      const c = counts.get(a.id);
      if (c) for (const k of Object.keys(row.counts) as (keyof Counts)[]) row.counts[k] += c[k];
      byProject.set(p.id, row);
    }
    return [...byProject.values()]
      .sort((a, b) => Number(b.accepting) - Number(a.accepting) || b.createdAt.getTime() - a.createdAt.getTime())
      .map(({ counts: c, createdAt, ...r }) => ({ ...r, markets: [...new Set(r.markets)], createdAt, ...this.shapeCounts(c), unreadNotices: notices.find((n) => n.projectId === r.project.id)?._count._all ?? 0 }));
  }

  /** One project, vendor side only. */
  @Get('projects/:id')
  async project(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    const v = await this.vendor(u);
    const p = await this.prisma.project.findFirst({
      where: { id, organizationId: u.organizationId, status: { in: [...VISIBLE] }, countries: { some: { allocations: { some: { vendorId: v.id } } } } },
      select: { id: true, projectCode: true, workOrderNo: true, vendorTitle: true, status: true, category: true, type: true, description: true, devices: true, quotaNotes: true, quotaNotesUpdatedAt: true, fieldStartAt: true, fieldEndAt: true },
    });
    if (!p) throw new NotFoundException('Project not found');
    const allocs = await this.prisma.vendorAllocation.findMany({
      where: { vendorId: v.id, projectCountry: { projectId: p.id } },
      orderBy: { createdAt: 'asc' },
      include: { projectCountry: { select: { id: true, countryCode: true, language: true, targetGroup: true, loiMinutes: true, irPercent: true, currency: true, status: true } } },
    });
    const ids = allocs.map((a) => a.id);
    const [counts, linkTotals, linkUnused, files, chargebacks, billed, notices] = await Promise.all([
      this.counts(ids),
      this.prisma.uniqueLink.groupBy({ by: ['vendorAllocationId'], where: { vendorAllocationId: { in: ids } }, _count: { _all: true } }),
      this.prisma.uniqueLink.groupBy({ by: ['vendorAllocationId'], where: { vendorAllocationId: { in: ids }, status: 'UNUSED', batch: { OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }] } }, _count: { _all: true } }),
      this.prisma.sharedFile.findMany({
        where: { organizationId: u.organizationId, projectId: p.id, OR: [{ vendorsAll: true }, { vendorId: v.id }] },
        select: { id: true, kind: true, name: true, size: true, note: true, createdAt: true, contentType: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.respondentSession.findMany({
        where: { vendorAllocationId: { in: ids }, isTest: false, status: 'COMPLETE', approval: 'REJECTED' },
        select: { id: true, vendorRespondentId: true, approvalAt: true, outcomeAt: true, payout: true, projectCountry: { select: { countryCode: true, currency: true } } },
        orderBy: { approvalAt: 'desc' },
        take: 1000,
      }),
      this.prisma.respondentSession.groupBy({ by: ['vendorBillId', 'projectCountryId'], where: { vendorAllocationId: { in: ids }, isTest: false, status: 'COMPLETE', approval: 'APPROVED' }, _count: { _all: true }, _sum: { payout: true } }),
      this.prisma.vendorNotice.findMany({ where: { vendorId: v.id, projectId: p.id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, kind: true, title: true, detail: true, createdAt: true, readAt: true } }),
    ]);
    const billIds = [...new Set(billed.map((b) => b.vendorBillId).filter((x): x is string => !!x))];
    const bills = billIds.length ? await this.prisma.vendorBill.findMany({ where: { id: { in: billIds }, status: { in: ['APPROVED', 'PAID'] } }, select: { id: true, number: true, status: true, currency: true, dueAt: true, paidAt: true, paymentMode: true } }) : [];
    const cur = new Map(allocs.map((a) => [a.projectCountry.id, a.projectCountry.currency]));
    const hide = v.portalHidePayout;
    const billing = new Map<string, { bill: (typeof bills)[number] | null; currency: string; completes: number; amount: number }>();
    for (const g of billed) {
      // Completes on a draft or voided bill count as not billed yet for the vendor.
      const bill = g.vendorBillId ? bills.find((b) => b.id === g.vendorBillId) ?? null : null;
      const currency = cur.get(g.projectCountryId) ?? '';
      const k = `${bill?.id ?? 'unbilled'}:${currency}`;
      const row = billing.get(k) ?? { bill, currency, completes: 0, amount: 0 };
      row.completes += g._count._all;
      row.amount = Math.round((row.amount + Number(g._sum.payout ?? 0)) * 100) / 100;
      billing.set(k, row);
    }
    const base = config.publicBaseUrl;
    return {
      project: { ...forVendor(p), quotaNotes: undefined, quotaNotesUpdatedAt: undefined },
      description: p.description,
      quotaNotes: p.quotaNotes,
      quotaNotesUpdatedAt: p.quotaNotesUpdatedAt,
      hidePayout: hide,
      markets: allocs.map((a) => {
        const c = this.shapeCounts(counts.get(a.id) ?? zero());
        const pc = a.projectCountry;
        return {
          id: a.id,
          countryCode: pc.countryCode,
          language: pc.language,
          targetGroup: pc.targetGroup,
          status: a.status,
          accepting: a.status === 'ACTIVE' && pc.status === 'LIVE' && p.status === 'LIVE',
          currency: pc.currency,
          cpi: hide ? null : Number(a.cpi),
          targetCompletes: a.targetCompletes,
          projectLoi: pc.loiMinutes,
          projectIr: pc.irPercent,
          ...c,
          entryLink: a.uniqueLinksOnly ? null : `${base}/s/${a.entryCode}?${entryQuery(a.uidParam, v)}`,
          testEntryLink: `${base}/s/${a.testEntryCode}?${entryQuery(a.uidParam, v)}&test=1`,
          uniqueLinksOnly: a.uniqueLinksOnly,
          uniqueLinks: { total: linkTotals.find((l) => l.vendorAllocationId === a.id)?._count._all ?? 0, unused: linkUnused.find((l) => l.vendorAllocationId === a.id)?._count._all ?? 0 },
        };
      }),
      files,
      billing: [...billing.values()].map((b) => ({ number: b.bill?.number ?? null, status: b.bill ? b.bill.status : 'NOT_BILLED', currency: b.currency, completes: b.completes, amount: hide ? null : b.amount, dueAt: b.bill?.dueAt ?? null, paidAt: b.bill?.paidAt ?? null, paymentMode: b.bill?.paymentMode ?? null })),
      chargebacks: chargebacks.map((s) => ({ id: s.id, uid: s.vendorRespondentId, countryCode: s.projectCountry.countryCode, completedAt: s.outcomeAt, rejectedAt: s.approvalAt, payout: hide ? null : s.payout == null ? null : Number(s.payout), currency: s.projectCountry.currency })),
      notices,
    };
  }

  /** Quota changes and other notices, newest first, with how many are unread. */
  @Get('notices')
  async notices(@CurrentUser() u: AuthUser) {
    const v = await this.vendor(u);
    const [rows, unread] = await Promise.all([
      this.prisma.vendorNotice.findMany({ where: { vendorId: v.id, organizationId: u.organizationId }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, kind: true, title: true, detail: true, createdAt: true, readAt: true, projectId: true } }),
      this.prisma.vendorNotice.count({ where: { vendorId: v.id, organizationId: u.organizationId, readAt: null } }),
    ]);
    return { unread, items: rows };
  }

  /** Marks notices read: the ones given, or all of them. */
  @Post('notices/read')
  @HttpCode(200)
  async read(@CurrentUser() u: AuthUser, @Body(new ZodPipe(readSchema)) body: z.infer<typeof readSchema>) {
    const v = await this.vendor(u);
    const r = await this.prisma.vendorNotice.updateMany({ where: { vendorId: v.id, organizationId: u.organizationId, readAt: null, ...(body.ids ? { id: { in: body.ids } } : {}) }, data: { readAt: new Date() } });
    return { marked: r.count };
  }
}
