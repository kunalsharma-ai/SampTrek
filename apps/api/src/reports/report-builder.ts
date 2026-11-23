/**
 * Report builder (feedback 2026-11-23): the Reports menu's four reports, with the filters and the
 * column chooser of the legacy Fieldwork platform.
 *
 * - Overall, Client and Vendor reports are aggregated. The "Data" columns a person picks decide the
 *   rows: picking Vendor name splits each row by vendor, picking Device splits it by device, and so
 *   on. Project is always a row key in the overall report, client in the client report and vendor
 *   in the vendor report. The client report never returns vendor columns, the vendor report never
 *   returns client columns.
 * - The Conversion report is one row per respondent, completes only unless other statuses are
 *   picked, with telemetry, gate survey answers and timeline columns. Completes can be approved or
 *   rejected from it, one by one or many at once, until they are on a client invoice or a vendor bill.
 *
 * Shared rules: this organisation only, test sessions never count, projects in the recycle bin are
 * left out, dates are the session start in UTC calendar days with `to` inclusive.
 *
 * Counts: gross clicks are every entry; clicks leave out duplicates and security rejects; dropouts
 * are partials, technical errors and open sessions that expired; security counts duplicates,
 * security rejects and quality fails (speeders are their own column). Money counts completes that
 * are not rejected, converted into the organisation's reporting currency with Settings → Finance rates.
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { ProjectType, RespondentStatus } from '@prisma/client';
import { z } from 'zod';
import { SPEEDER_DETAIL, SURVEY_START } from '../projects/field-metrics';
import { aggregate, countIf, mdate, msBetween, numOut } from '../prisma/agg';
import { PrismaService } from '../prisma/prisma.service';
import { ReportsService, dayRange } from './reports.service';

const id = z.string().min(1).max(64);
const ids = z.array(id).max(1000).default([]);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const DIMENSIONS = ['client', 'contact', 'vendor', 'project', 'pm', 'sales', 'type', 'category', 'market', 'country', 'targetGroup', 'device', 'os'] as const;
export type Dimension = (typeof DIMENSIONS)[number];
export const BUILDER_KINDS = ['overall', 'client', 'vendor', 'conversion'] as const;
export type BuilderKind = (typeof BUILDER_KINDS)[number];

/** Dimensions each aggregated report may split by, and the one it always splits by. */
const ALLOWED: Record<Exclude<BuilderKind, 'conversion'>, { always: Dimension; allowed: Dimension[] }> = {
  overall: { always: 'project', allowed: [...DIMENSIONS] },
  client: { always: 'client', allowed: ['client', 'contact', 'project', 'pm', 'sales', 'type', 'category', 'market', 'country', 'targetGroup', 'device', 'os'] },
  vendor: { always: 'vendor', allowed: ['vendor', 'project', 'market', 'country', 'targetGroup', 'device', 'os'] },
};

const STATUSES = Object.values(RespondentStatus) as [RespondentStatus, ...RespondentStatus[]];

export const builderSchema = z
  .object({
    from: day.optional(),
    to: day.optional(),
    clientIds: ids,
    contactIds: ids,
    vendorIds: ids,
    projectIds: ids,
    projectManagerIds: ids,
    salesPersonIds: ids,
    projectTypes: z.array(z.nativeEnum(ProjectType)).max(10).default([]),
    categories: z.array(z.string().max(100)).max(100).default([]),
    countryCodes: z.array(z.string().regex(/^[A-Z]{2}$/)).max(300).default([]),
    /** Conversion report: response statuses (default: completes) and approval ("conversion status"). */
    statuses: z.array(z.enum([...STATUSES, 'SPEEDER'] as [string, ...string[]])).max(20).default([]),
    approvals: z.array(z.enum(['PENDING', 'APPROVED', 'REJECTED', 'NOT_APPLICABLE'])).max(4).default([]),
    /** Aggregated reports: the dimensions to split rows by. */
    groupBy: z.array(z.enum(DIMENSIONS)).max(DIMENSIONS.length).default([]),
    page: z.number().int().min(1).max(100_000).default(1),
    pageSize: z.number().int().min(1).max(500).default(100),
    /** Download: one response with up to 50,000 rows. */
    export: z.boolean().default(false),
  })
  .strict()
  .refine((f) => !f.from || !f.to || f.from <= f.to, { message: '`from` must be on or before `to`', path: ['from'] });
export type BuilderInput = z.infer<typeof builderSchema>;

export const builderApprovalSchema = z.object({ sessionIds: z.array(id).min(1).max(5000), approval: z.enum(['APPROVED', 'REJECTED']), reason: z.string().max(500).optional() }).strict();

const EXPORT_LIMIT = 50_000;
const round = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
const pct = (a: number, b: number) => (b > 0 ? round((a / b) * 100, 1) : null);

/** Operating system from a user agent, as stored on the session. */
const OS_EXPR = (ua: string) => ({
  $switch: {
    branches: [
      { case: { $regexMatch: { input: { $ifNull: [ua, ''] }, regex: 'Android', options: 'i' } }, then: 'Android' },
      { case: { $regexMatch: { input: { $ifNull: [ua, ''] }, regex: 'iPhone|iPad|iPod', options: 'i' } }, then: 'iOS' },
      { case: { $regexMatch: { input: { $ifNull: [ua, ''] }, regex: 'Windows', options: 'i' } }, then: 'Windows' },
      { case: { $regexMatch: { input: { $ifNull: [ua, ''] }, regex: 'Macintosh|Mac OS', options: 'i' } }, then: 'Mac' },
      { case: { $regexMatch: { input: { $ifNull: [ua, ''] }, regex: 'Linux|X11|CrOS', options: 'i' } }, then: 'Linux' },
    ],
    default: 'Other',
  },
});
export function osOf(ua: string | null | undefined): string {
  const u = ua ?? '';
  if (/Android/i.test(u)) return 'Android';
  if (/iPhone|iPad|iPod/i.test(u)) return 'iOS';
  if (/Windows/i.test(u)) return 'Windows';
  if (/Macintosh|Mac OS/i.test(u)) return 'Mac';
  if (/Linux|X11|CrOS/i.test(u)) return 'Linux';
  return 'Other';
}
export function browserOf(ua: string | null | undefined): string {
  const u = ua ?? '';
  if (/Edg\//.test(u)) return 'Edge';
  if (/OPR\/|Opera/.test(u)) return 'Opera';
  if (/SamsungBrowser/.test(u)) return 'Samsung Internet';
  if (/Firefox\//.test(u)) return 'Firefox';
  if (/Chrome\//.test(u)) return 'Chrome';
  if (/Safari\//.test(u)) return 'Safari';
  return u ? 'Other' : '';
}

type Part = {
  _id: { a: string; d: string | null; o: string | null };
  gross: number; dup: number; sec: number; quality: number; speeders: number; completes: number; approved: number; rejected: number; pending: number;
  terminates: number; quotaFull: number; dropouts: number; inProgress: number; revenue: number; payout: number; loiSum: number; loiN: number;
};

@Injectable()
export class ReportBuilderService {
  constructor(private readonly prisma: PrismaService, private readonly reports: ReportsService) {}

  /** Everything the filter boxes offer, for this organisation. */
  async options(org: string) {
    const [clients, contacts, vendors, projects, users, countries] = await Promise.all([
      this.prisma.client.findMany({ where: { organizationId: org }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.clientContact.findMany({ where: { client: { organizationId: org } }, select: { id: true, name: true, clientId: true }, orderBy: { name: 'asc' } }),
      this.prisma.vendor.findMany({ where: { organizationId: org }, select: { id: true, code: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.project.findMany({ where: { organizationId: org }, select: { id: true, projectCode: true, workOrderNo: true, name: true, clientId: true, type: true, category: true, projectManagerId: true, salesPersonId: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.user.findMany({ where: { organizationId: org, role: { in: ['ADMIN', 'PROJECT_MANAGER', 'SALES', 'VIEWER'] } }, select: { id: true, name: true, role: true, active: true }, orderBy: { name: 'asc' } }),
      this.prisma.projectCountry.findMany({ where: { project: { organizationId: org } }, distinct: ['countryCode'], select: { countryCode: true }, orderBy: { countryCode: 'asc' } }),
    ]);
    const pmIds = new Set(projects.map((p) => p.projectManagerId));
    const salesIds = new Set(projects.map((p) => p.salesPersonId).filter(Boolean));
    return {
      clients,
      contacts,
      vendors,
      projects,
      projectManagers: users.filter((x) => pmIds.has(x.id) || x.role === 'PROJECT_MANAGER').map(({ id, name }) => ({ id, name })),
      salesPeople: users.filter((x) => salesIds.has(x.id) || x.role === 'SALES').map(({ id, name }) => ({ id, name })),
      categories: [...new Set(projects.map((p) => p.category))].sort(),
      projectTypes: Object.values(ProjectType),
      countries: countries.map((c) => c.countryCode),
      statuses: [...STATUSES, 'SPEEDER'],
    };
  }

  /** The session $match for the filters; null when the filters match no project or vendor. */
  private async match(org: string, f: BuilderInput) {
    const projects = await this.prisma.project.findMany({
      where: {
        organizationId: org,
        ...(f.clientIds.length ? { clientId: { in: f.clientIds } } : {}),
        ...(f.contactIds.length ? { clientContactId: { in: f.contactIds } } : {}),
        ...(f.projectIds.length ? { id: { in: f.projectIds } } : {}),
        ...(f.projectManagerIds.length ? { projectManagerId: { in: f.projectManagerIds } } : {}),
        ...(f.salesPersonIds.length ? { salesPersonId: { in: f.salesPersonIds } } : {}),
        ...(f.projectTypes.length ? { type: { in: f.projectTypes } } : {}),
        ...(f.categories.length ? { category: { in: f.categories } } : {}),
      },
      select: { id: true },
    });
    if (!projects.length) return null;
    const m: Record<string, unknown> = { organizationId: org, isTest: false, projectId: { $in: projects.map((p) => p.id) } };
    const { gte, lt } = dayRange(f);
    if (gte || lt) m.startedAt = { ...(gte ? { $gte: mdate(gte) } : {}), ...(lt ? { $lt: mdate(lt) } : {}) };
    if (f.vendorIds.length) {
      const as = await this.prisma.vendorAllocation.findMany({ where: { vendorId: { in: f.vendorIds }, projectCountry: { projectId: { in: projects.map((p) => p.id) } } }, select: { id: true } });
      if (!as.length) return null;
      m.vendorAllocationId = { $in: as.map((a) => a.id) };
    }
    if (f.countryCodes.length) {
      const cs = await this.prisma.projectCountry.findMany({ where: { countryCode: { in: f.countryCodes }, projectId: { in: projects.map((p) => p.id) } }, select: { id: true } });
      if (!cs.length) return null;
      m.projectCountryId = { $in: cs.map((c) => c.id) };
    }
    return m;
  }

  /** Overall, client or vendor report: aggregated rows split by the chosen dimensions. */
  async aggregated(org: string, kind: Exclude<BuilderKind, 'conversion'>, f: BuilderInput) {
    const rule = ALLOWED[kind];
    const bad = f.groupBy.filter((d) => !rule.allowed.includes(d));
    if (bad.length) throw new BadRequestException(`The ${kind} report cannot be split by ${bad.join(', ')}`);
    if (kind === 'client' && f.vendorIds.length) throw new BadRequestException('The client report has no vendor filter');
    if (kind === 'vendor' && (f.clientIds.length || f.contactIds.length)) throw new BadRequestException('The vendor report has no client filter');
    const dims = [...new Set<Dimension>([rule.always, ...f.groupBy])];
    const fx = await this.reports.rateTable(org);
    const empty = { kind, dims, rows: [], totals: null, currency: fx.base, missingRates: [] as string[], total: 0 };
    const m = await this.match(org, f);
    if (!m) return empty;

    const now = mdate(new Date());
    const st = (x: string) => ({ $eq: ['$status', x] });
    const complete = st('COMPLETE');
    const billable = { $and: [complete, { $ne: ['$approval', 'REJECTED'] }] };
    const parts = await aggregate<Part>(this.prisma.respondentSession, [
      { $match: m },
      {
        $group: {
          _id: { a: '$vendorAllocationId', d: dims.includes('device') ? { $ifNull: ['$deviceType', 'unknown'] } : null, o: dims.includes('os') ? OS_EXPR('$userAgent') : null },
          gross: { $sum: 1 },
          dup: countIf(st('DUPLICATE')),
          sec: countIf(st('SECURITY_REJECT')),
          quality: countIf({ $and: [st('QUALITY_FAIL'), { $ne: ['$statusDetail', SPEEDER_DETAIL] }] }),
          speeders: countIf({ $and: [st('QUALITY_FAIL'), { $eq: ['$statusDetail', SPEEDER_DETAIL] }] }),
          completes: countIf(complete),
          approved: countIf({ $and: [complete, { $eq: ['$approval', 'APPROVED'] }] }),
          rejected: countIf({ $and: [complete, { $eq: ['$approval', 'REJECTED'] }] }),
          pending: countIf({ $and: [complete, { $eq: ['$approval', 'PENDING'] }] }),
          terminates: countIf(st('TERMINATE')),
          quotaFull: countIf(st('QUOTA_FULL')),
          dropouts: countIf({ $or: [{ $in: ['$status', ['PARTIAL', 'TECHNICAL_ERROR']] }, { $and: [st('STARTED'), { $lt: ['$expiresAt', now] }] }] }),
          inProgress: countIf({ $and: [st('STARTED'), { $gte: ['$expiresAt', now] }] }),
          revenue: { $sum: { $cond: [billable, { $ifNull: ['$revenue', 0] }, 0] } },
          payout: { $sum: { $cond: [billable, { $ifNull: ['$payout', 0] }, 0] } },
          loiSum: { $sum: { $cond: [{ $and: [complete, { $ne: [{ $ifNull: ['$outcomeAt', null] }, null] }] }, { $ifNull: [msBetween(SURVEY_START, '$outcomeAt'), 0] }, 0] } },
          loiN: countIf({ $and: [complete, { $ne: [{ $ifNull: ['$outcomeAt', null] }, null] }] }),
        },
      },
    ]);

    const allocIds = [...new Set(parts.map((p) => p._id.a))];
    const allocs = await this.prisma.vendorAllocation.findMany({
      where: { id: { in: allocIds } },
      select: {
        id: true,
        vendor: { select: { id: true, code: true, name: true } },
        projectCountry: {
          select: {
            id: true, countryCode: true, targetGroup: true, language: true, currency: true, irPercent: true, loiMinutes: true,
            project: { select: { id: true, projectCode: true, workOrderNo: true, name: true, status: true, type: true, category: true, client: { select: { id: true, code: true, name: true } }, clientContact: { select: { id: true, name: true } }, projectManager: { select: { id: true, name: true } }, salesPerson: { select: { id: true, name: true } } } },
          },
        },
      },
    });
    const A = new Map(allocs.map((a) => [a.id, a]));
    const missing = new Set<string>();
    const rate = (c: string) => {
      const r = c === fx.base ? 1 : fx.rates.get(c);
      if (r == null) missing.add(c);
      return r ?? 0;
    };

    type Acc = Record<string, unknown> & { _n: Record<string, number>; _markets: Map<string, { ir: number; loi: number }> };
    const rows = new Map<string, Acc>();
    const N = ['gross', 'dup', 'sec', 'quality', 'speeders', 'completes', 'approved', 'rejected', 'pending', 'terminates', 'quotaFull', 'dropouts', 'inProgress', 'revenue', 'payout', 'loiSum', 'loiN'] as const;
    for (const part of parts) {
      const a = A.get(part._id.a);
      const c = a?.projectCountry;
      const p = c?.project;
      if (!a || !c || !p) continue; // the project is in the recycle bin or gone
      const keyCols: Record<string, unknown> = {};
      const keys: string[] = [];
      for (const d of dims) {
        switch (d) {
          case 'client': Object.assign(keyCols, { clientId: p.client.id, clientCode: p.client.code, clientName: p.client.name }); keys.push(p.client.id); break;
          case 'contact': Object.assign(keyCols, { clientContact: p.clientContact?.name ?? '' }); keys.push(p.clientContact?.id ?? '-'); break;
          case 'vendor': Object.assign(keyCols, { vendorId: a.vendor.id, vendorCode: a.vendor.code, vendorName: a.vendor.name }); keys.push(a.vendor.id); break;
          case 'project': Object.assign(keyCols, { projectId: p.id, projectCode: p.projectCode, workOrderNo: p.workOrderNo, projectName: p.name, projectStatus: p.status }); keys.push(p.id); break;
          case 'pm': Object.assign(keyCols, { projectManager: p.projectManager.name }); keys.push(p.projectManager.id); break;
          case 'sales': Object.assign(keyCols, { salesPerson: p.salesPerson?.name ?? '' }); keys.push(p.salesPerson?.id ?? '-'); break;
          case 'type': Object.assign(keyCols, { projectType: p.type }); keys.push(p.type); break;
          case 'category': Object.assign(keyCols, { projectCategory: p.category }); keys.push(p.category); break;
          case 'market': Object.assign(keyCols, { market: `${c.countryCode}${c.targetGroup ? ` · ${c.targetGroup}` : ''}`, countryCode: c.countryCode, targetGroup: c.targetGroup ?? '', language: c.language }); keys.push(c.id); break;
          case 'country': Object.assign(keyCols, { countryCode: c.countryCode }); keys.push(c.countryCode); break;
          case 'targetGroup': Object.assign(keyCols, { targetGroup: c.targetGroup ?? '' }); keys.push(c.targetGroup ?? '-'); break;
          case 'device': Object.assign(keyCols, { device: part._id.d ?? 'unknown' }); keys.push(part._id.d ?? '-'); break;
          case 'os': Object.assign(keyCols, { os: part._id.o ?? 'Other' }); keys.push(part._id.o ?? '-'); break;
        }
      }
      const key = keys.join('\u0000');
      let r = rows.get(key);
      if (!r) {
        r = { key, ...keyCols, _n: Object.fromEntries(N.map((k) => [k, 0])), _markets: new Map() };
        rows.set(key, r);
      }
      for (const k of N) {
        const v = numOut(part[k]);
        r._n[k] += k === 'revenue' || k === 'payout' ? v * rate(c.currency) : v;
      }
      r._markets.set(c.id, { ir: c.irPercent, loi: c.loiMinutes });
    }

    const finish = (r: Acc) => {
      const n = r._n;
      const clicks = n.gross - n.dup - n.sec;
      const revenue = round(n.revenue);
      const payout = round(n.payout);
      const profit = round(revenue - payout);
      const markets = [...r._markets.values()];
      const { _n, _markets, ...cols } = r;
      return {
        ...cols,
        grossClicks: n.gross,
        clicks,
        completes: n.completes,
        approved: n.approved,
        rejected: n.rejected,
        pending: n.pending,
        speeders: n.speeders,
        terminates: n.terminates,
        overquota: n.quotaFull,
        dropouts: n.dropouts,
        inProgress: n.inProgress,
        security: n.dup + n.sec + n.quality,
        quotedIr: markets.length ? round(markets.reduce((s, x) => s + x.ir, 0) / markets.length, 1) : null,
        quotedLoi: markets.length ? round(markets.reduce((s, x) => s + x.loi, 0) / markets.length, 1) : null,
        avgLoi: n.loiN ? round(n.loiSum / n.loiN / 60_000, 1) : null,
        observedIr: pct(n.completes, n.completes + n.terminates),
        revenue,
        payout,
        profit,
        margin: pct(profit, revenue),
        costPerClick: clicks ? round(payout / clicks) : null,
        revenuePerClick: clicks ? round(revenue / clicks) : null,
        profitPerClick: clicks ? round(profit / clicks) : null,
        conversion: pct(n.completes, clicks),
        approvalRatio: pct(n.approved, n.completes),
        rejectionRatio: pct(n.rejected, n.completes),
      };
    };
    const all = [...rows.values()];
    const out = all.map(finish).sort((x, y) => (y.grossClicks as number) - (x.grossClicks as number) || String((x as Record<string, unknown>).key).localeCompare(String((y as Record<string, unknown>).key)));
    const total: Acc = { key: 'total', _n: Object.fromEntries(N.map((k) => [k, all.reduce((s, r) => s + r._n[k], 0)])), _markets: new Map(all.flatMap((r) => [...r._markets])) };
    const take = f.export ? EXPORT_LIMIT : f.pageSize;
    const skip = f.export ? 0 : (f.page - 1) * f.pageSize;
    return { kind, dims, rows: out.slice(skip, skip + take), total: out.length, page: f.export ? 1 : f.page, pageSize: take, totals: all.length ? finish(total) : null, currency: fx.base, missingRates: [...missing].sort() };
  }

  /** Conversion report: one row per respondent. Completes only unless other statuses are picked. */
  async conversion(org: string, f: BuilderInput) {
    const fx = await this.reports.rateTable(org);
    const m = await this.match(org, f);
    if (!m) return { rows: [], total: 0, page: 1, pageSize: f.pageSize, truncated: false, questions: [], currency: fx.base };
    const statuses = f.statuses.length ? f.statuses : ['COMPLETE'];
    const real = statuses.filter((s) => s !== 'SPEEDER') as RespondentStatus[];
    const where = {
      organizationId: org,
      isTest: false,
      projectId: { in: (m.projectId as { $in: string[] }).$in },
      ...(m.vendorAllocationId ? { vendorAllocationId: { in: (m.vendorAllocationId as { $in: string[] }).$in } } : {}),
      ...(m.projectCountryId ? { projectCountryId: { in: (m.projectCountryId as { $in: string[] }).$in } } : {}),
      ...((): object => {
        const { gte, lt } = dayRange(f);
        return gte || lt ? { startedAt: { ...(gte ? { gte } : {}), ...(lt ? { lt } : {}) } } : {};
      })(),
      OR: [...(real.length ? [{ status: { in: real } }] : []), ...(statuses.includes('SPEEDER') ? [{ status: 'QUALITY_FAIL' as const, statusDetail: SPEEDER_DETAIL }] : [])],
      ...(f.approvals.length ? { approval: { in: f.approvals } } : {}),
    };
    const take = f.export ? EXPORT_LIMIT : f.pageSize;
    const skip = f.export ? 0 : (f.page - 1) * f.pageSize;
    const [total, rows] = await Promise.all([
      this.prisma.respondentSession.count({ where }),
      this.prisma.respondentSession.findMany({
        where,
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
        take,
        skip,
        select: {
          id: true, token: true, vendorRespondentId: true, status: true, statusDetail: true, approval: true, approvalAt: true, revenue: true, payout: true,
          ipHash: true, userAgent: true, deviceType: true, geoCountry: true, browserIdHash: true, answers: true, riskScore: true,
          startedAt: true, humanPassedAt: true, gatePassedAt: true, outcomeAt: true, invoiceId: true, vendorBillId: true,
          project: { select: { id: true, projectCode: true, workOrderNo: true, name: true, gateQuestions: true, prescreen: true, client: { select: { code: true, name: true } } } },
          projectCountry: { select: { countryCode: true, targetGroup: true, language: true, currency: true } },
          vendorAllocation: { select: { vendor: { select: { code: true, name: true } } } },
        },
      }),
    ]);
    // Gate and prescreener questions become columns, named by their text (the same question in two
    // projects shares one column).
    const questions = new Map<string, string>();
    const textOf = (list: unknown, qid: string) => (Array.isArray(list) ? (list as { id?: string; text?: string }[]).find((q) => q?.id === qid)?.text : undefined);
    const answerCols = (a: unknown, proj: { gateQuestions: unknown; prescreen: unknown }): Record<string, string> => {
      const out: Record<string, string> = {};
      const all = (a ?? {}) as Record<string, Record<string, { label?: unknown; value?: unknown }>>;
      for (const stage of ['gate', 'prescreen'] as const) {
        for (const [qid, ans] of Object.entries(all[stage] ?? {})) {
          const text = textOf(stage === 'gate' ? proj.gateQuestions : proj.prescreen, qid) ?? qid;
          const key = `${stage}:${text.trim().toLowerCase().slice(0, 120)}`;
          if (!questions.has(key)) questions.set(key, `${stage === 'gate' ? 'Gate' : 'Prescreener'}: ${text}`);
          const v = ans?.label ?? ans?.value;
          out[key] = Array.isArray(v) ? v.join(', ') : v == null ? '' : String(v);
        }
      }
      return out;
    };
    const minutes = (a: Date | null, b: Date | null) => (a && b ? round((b.getTime() - a.getTime()) / 60_000, 1) : null);
    return {
      total,
      page: f.export ? 1 : f.page,
      pageSize: take,
      truncated: f.export && total > EXPORT_LIMIT,
      currency: fx.base,
      rows: rows.map((s) => {
        const speeder = s.status === 'QUALITY_FAIL' && s.statusDetail === SPEEDER_DETAIL;
        const revenue = s.status === 'COMPLETE' && s.revenue != null ? Number(s.revenue) : null;
        const payout = s.status === 'COMPLETE' && s.payout != null ? Number(s.payout) : null;
        return {
          id: s.id,
          projectId: s.project.id,
          projectCode: s.project.projectCode,
          workOrderNo: s.project.workOrderNo,
          projectName: s.project.name,
          clientCode: s.project.client.code,
          clientName: s.project.client.name,
          vendorCode: s.vendorAllocation.vendor.code,
          vendorName: s.vendorAllocation.vendor.name,
          market: `${s.projectCountry.countryCode}${s.projectCountry.targetGroup ? ` · ${s.projectCountry.targetGroup}` : ''}`,
          uid: s.token,
          vid: s.vendorRespondentId,
          responseStatus: speeder ? 'SPEEDER' : s.status,
          statusDetail: s.statusDetail,
          approval: s.approval,
          approvalAt: s.approvalAt,
          currency: s.projectCountry.currency,
          revenue,
          payout,
          profit: revenue != null && payout != null ? round(revenue - payout) : null,
          loi: s.status === 'COMPLETE' ? minutes(s.gatePassedAt ?? s.startedAt, s.outcomeAt) : null,
          // Raw IP addresses are never stored: the IP ID is a short form of the address's hash.
          ipId: s.ipHash ? s.ipHash.slice(0, 12) : '',
          language: s.projectCountry.language,
          platform: browserOf(s.userAgent),
          deviceType: s.deviceType ?? '',
          os: osOf(s.userAgent),
          country: s.geoCountry ?? '',
          browserId: s.browserIdHash ? s.browserIdHash.slice(0, 12) : '',
          riskScore: s.riskScore,
          userAgent: s.userAgent ?? '',
          captchaAt: s.humanPassedAt,
          gateAt: s.gatePassedAt,
          surveyStartAt: s.gatePassedAt ?? s.startedAt,
          endPageAt: s.outcomeAt,
          createdAt: s.startedAt,
          answers: answerCols(s.answers, s.project),
          // Billed completes are locked: approve or reject them only after the document is voided.
          locked: s.invoiceId ? 'client-invoice' : s.vendorBillId ? 'vendor-bill' : null,
        };
      }),
      questions: [...questions].map(([key, label]) => ({ key, label })),
    };
  }

  /**
   * Approve or reject completes from the conversion report, across projects. Completes already on a
   * client invoice or a vendor bill are left as they are and counted in `locked`.
   */
  async approval(org: string, body: z.infer<typeof builderApprovalSchema>) {
    const base = { id: { in: body.sessionIds }, organizationId: org, isTest: false, status: 'COMPLETE' as const };
    const locked = await this.prisma.respondentSession.count({ where: { ...base, OR: [{ invoiceId: { not: null } }, { vendorBillId: { not: null } }] } });
    const r = await this.prisma.respondentSession.updateMany({ where: { ...base, invoiceId: null, vendorBillId: null }, data: { approval: body.approval, approvalAt: new Date() } });
    return { updated: r.count, locked, skipped: body.sessionIds.length - r.count - locked };
  }
}
