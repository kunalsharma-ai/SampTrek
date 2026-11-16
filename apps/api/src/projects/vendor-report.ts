import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../prisma/prisma.service';

/**
 * One vendor's respondents in one project, for the "View report" popup on Vendors & links
 * (feedback 2026-11-16): UID, the vendor's respondent ID, market and target group, IP, LOI,
 * outcome, gate survey answers, start and end. Raw IP addresses are never stored, so the IP
 * column is a short hashed IP ID: the same ID means the same IP address.
 */
export const vendorReportQuery = z.object({
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(10),
  q: z.string().trim().max(200).optional(),
  /** Every row (up to MAX_ALL), for the download. */
  all: z.enum(['true', 'false']).optional(),
  includeTest: z.enum(['true', 'false']).optional(),
});
const MAX_ALL = 20_000;

type Answer = { value?: unknown; label?: unknown };
function answerText(a: unknown): string {
  if (a == null) return '';
  if (typeof a !== 'object') return String(a);
  const x = a as Answer;
  const v = x.label ?? x.value;
  return Array.isArray(v) ? v.join('; ') : v == null ? '' : String(v);
}

export async function vendorReport(prisma: PrismaService, organizationId: string, projectId: string, vendorId: string, q: z.infer<typeof vendorReportQuery>) {
  const project = await prisma.project.findFirst({ where: { id: projectId, organizationId }, select: { id: true, gateQuestions: true } });
  if (!project) throw new NotFoundException('Project not found');
  const vendor = await prisma.vendor.findFirst({ where: { id: vendorId, organizationId }, select: { id: true, name: true, code: true } });
  if (!vendor) throw new NotFoundException('Vendor not found');
  const where: Prisma.RespondentSessionWhereInput = {
    projectId,
    vendorAllocation: { vendorId },
    ...(q.includeTest === 'true' ? {} : { isTest: false }),
    ...(q.q
      ? {
          OR: [
            { vendorRespondentId: { contains: q.q, mode: 'insensitive' } },
            { token: { contains: q.q, mode: 'insensitive' } },
            { projectCountry: { countryCode: { equals: q.q.toUpperCase() } } },
            { projectCountry: { targetGroup: { contains: q.q, mode: 'insensitive' } } },
            { statusDetail: { contains: q.q, mode: 'insensitive' } },
          ],
        }
      : {}),
  };
  const all = q.all === 'true';
  const [total, rows] = await Promise.all([
    prisma.respondentSession.count({ where }),
    prisma.respondentSession.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: all ? 0 : q.skip,
      take: all ? MAX_ALL : q.take,
      select: {
        token: true, vendorRespondentId: true, status: true, statusDetail: true, isTest: true, ipHash: true, deviceType: true,
        answers: true, startedAt: true, outcomeAt: true, expiresAt: true, approval: true,
        projectCountry: { select: { countryCode: true, targetGroup: true } },
      },
    }),
  ]);
  if (all && total > MAX_ALL) throw new BadRequestException(`More than ${MAX_ALL.toLocaleString()} respondents; narrow the search first`);
  const gateQuestions = (Array.isArray(project.gateQuestions) ? (project.gateQuestions as { id?: string; text?: string }[]) : []).filter((x) => x?.id).map((x) => ({ id: String(x.id), text: String(x.text ?? x.id) }));
  const now = Date.now();
  return {
    total,
    vendor,
    gateQuestions,
    rows: rows.map((r) => {
      const gate = ((r.answers as { gate?: Record<string, unknown> } | null)?.gate ?? {}) as Record<string, unknown>;
      const end = r.outcomeAt ?? null;
      // Still "in survey" past its expiry, or partial: the respondent dropped out.
      const dropped = r.status === 'PARTIAL' || (r.status === 'STARTED' && r.expiresAt.getTime() < now);
      return {
        uid: r.token,
        respondentId: r.vendorRespondentId,
        vendor: `${vendor.name} (${vendor.code})`,
        country: r.projectCountry.countryCode,
        targetGroup: r.projectCountry.targetGroup,
        ipId: r.ipHash ? r.ipHash.slice(0, 10) : null,
        device: r.deviceType,
        loiMinutes: end ? Math.round(((end.getTime() - r.startedAt.getTime()) / 60_000) * 10) / 10 : null,
        status: dropped ? 'DROPOUT' : r.status,
        statusDetail: r.statusDetail,
        approval: r.approval,
        test: r.isTest,
        gate: Object.fromEntries(Object.entries(gate).map(([k, v]) => [k, answerText(v)])),
        startedAt: r.startedAt,
        endedAt: end,
      };
    }),
  };
}
