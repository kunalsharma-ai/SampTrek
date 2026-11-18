import { NotFoundException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import { sessionGroups } from '../prisma/session-totals';

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Every project of one client with its money (feedback 2026-11-18, Manage client): project name and
 * ID, month and year, work order, CPI, completes achieved, approved completes (from reconciliation),
 * revenue and cost on the approved completes, profit and rejection ratio. Money is in each
 * project's own currency; totals are given per currency.
 */
export async function clientProjectsReport(prisma: PrismaService, organizationId: string, clientId: string) {
  const client = await prisma.client.findFirst({ where: { id: clientId, organizationId }, select: { id: true, name: true, code: true } });
  if (!client) throw new NotFoundException('Client not found');
  const projects = await prisma.project.findMany({
    where: { organizationId, clientId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, projectCode: true, name: true, workOrderNo: true, status: true, createdAt: true, fieldStartAt: true,
      countries: { select: { cpi: true, currency: true, targetCompletes: true } },
    },
  });
  const ids = projects.map((p) => p.id);
  const groups = ids.length ? await sessionGroups(prisma, { projectId: { in: ids }, isTest: false, status: 'COMPLETE' }, ['projectId', 'approval']) : [];
  const rows = projects.map((p) => {
    const mine = groups.filter((g) => g.projectId === p.id);
    const sum = (pick: (a: string) => boolean, f: 'n' | 'revenue' | 'payout') => mine.filter((g) => pick(g.approval ?? '')).reduce((a, g) => a + g[f], 0);
    const completes = sum(() => true, 'n');
    const approved = sum((a) => a === 'APPROVED', 'n');
    const rejected = sum((a) => a === 'REJECTED', 'n');
    const revenue = r2(sum((a) => a === 'APPROVED', 'revenue'));
    const cost = r2(sum((a) => a === 'APPROVED', 'payout'));
    const cpis = p.countries.map((c) => Number(c.cpi));
    const when = p.fieldStartAt ?? p.createdAt;
    return {
      id: p.id,
      name: p.name,
      projectCode: p.projectCode,
      status: p.status,
      month: `${when.getUTCFullYear()}-${String(when.getUTCMonth() + 1).padStart(2, '0')}`,
      workOrderNo: p.workOrderNo,
      currency: p.countries[0]?.currency ?? 'USD',
      cpiMin: cpis.length ? Math.min(...cpis) : 0,
      cpiMax: cpis.length ? Math.max(...cpis) : 0,
      targetCompletes: p.countries.reduce((a, c) => a + c.targetCompletes, 0),
      completes,
      approved,
      rejected,
      pending: completes - approved - rejected,
      revenue,
      cost,
      profit: r2(revenue - cost),
      marginPercent: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null,
      rejectionPercent: approved + rejected ? Math.round((rejected / (approved + rejected)) * 1000) / 10 : null,
    };
  });
  const totals = new Map<string, { currency: string; projects: number; completes: number; approved: number; rejected: number; revenue: number; cost: number; profit: number }>();
  for (const r of rows) {
    const t = totals.get(r.currency) ?? { currency: r.currency, projects: 0, completes: 0, approved: 0, rejected: 0, revenue: 0, cost: 0, profit: 0 };
    t.projects += 1;
    t.completes += r.completes;
    t.approved += r.approved;
    t.rejected += r.rejected;
    t.revenue = r2(t.revenue + r.revenue);
    t.cost = r2(t.cost + r.cost);
    t.profit = r2(t.profit + r.profit);
    totals.set(r.currency, t);
  }
  return { client, rows, totals: [...totals.values()] };
}
