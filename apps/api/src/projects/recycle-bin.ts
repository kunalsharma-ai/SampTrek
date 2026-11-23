/**
 * Recycle bin for projects (feedback 2026-11-23).
 *
 * - Delete moves a project to the recycle bin: it disappears from every list, report and dashboard
 *   (src/prisma/compat.ts leaves projects with deletedAt out of project reads), and its links stop
 *   taking respondents. It is removed for good 30 days later, with everything under it.
 * - Restore brings it back as it was, until then.
 * - Admins (and the Super Admin) may delete and restore. Anyone else needs the "may delete projects"
 *   permission an admin gives on Settings → Team; without it, Delete sends the admins a request
 *   (the bell and the recycle bin page), which they approve (delete) or decline.
 */
import { BadRequestException, Body, Controller, Delete, ForbiddenException, Get, HttpCode, Injectable, Logger, Module, NotFoundException, Param, Post } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { z } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CurrentUser, EDITORS, Roles } from '../auth/decorators';
import { AuthUser } from '../auth/auth.types';
import { config } from '../common/config';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';

export const BIN_DAYS = 30;
const DAY = 86_400_000;
const reasonSchema = z.object({ reason: z.string().trim().max(500).optional() }).strict();

@Injectable()
export class RecycleBinService {
  private readonly log = new Logger(RecycleBinService.name);
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async canDelete(u: AuthUser) {
    if (u.role === 'ADMIN' || u.superAdmin) return true;
    const me = await this.prisma.user.findUnique({ where: { id: u.id }, select: { canDeleteProjects: true } });
    return !!me?.canDeleteProjects;
  }

  private async live(u: AuthUser, id: string) {
    const p = await this.prisma.project.findFirst({ where: { id, organizationId: u.organizationId }, select: { id: true, projectCode: true, name: true, status: true, deleteRequestedAt: true } });
    if (!p) throw new NotFoundException('Project not found');
    return p;
  }

  private async binned(u: AuthUser, id: string) {
    const p = await this.prisma.project.findFirst({ where: { id, organizationId: u.organizationId, deletedAt: { not: null } }, select: { id: true, projectCode: true, name: true, deletedAt: true } });
    if (!p) throw new NotFoundException('This project is not in the recycle bin');
    return p;
  }

  /** Moves a project to the recycle bin. Live fieldwork must be stopped first. */
  async remove(u: AuthUser, id: string, reason?: string) {
    if (!(await this.canDelete(u))) throw new ForbiddenException({ message: 'You cannot delete projects. Ask an admin: use “Ask an admin to delete”.', code: 'DELETE_NEEDS_ADMIN' });
    const p = await this.live(u, id);
    if (p.status === 'LIVE') throw new BadRequestException({ message: `${p.projectCode} is live. Close it or put it on hold before deleting it.`, code: 'PROJECT_LIVE' });
    const now = new Date();
    await this.prisma.project.update({ where: { id }, data: { deletedAt: now, deletedById: u.id } });
    await this.audit.record({ organizationId: u.organizationId, actorId: u.id, action: 'project.delete', entityType: 'Project', entityId: id, detail: { projectCode: p.projectCode, reason, purgeAt: new Date(now.getTime() + BIN_DAYS * DAY), requested: !!p.deleteRequestedAt } });
    return { id, deletedAt: now, purgeAt: new Date(now.getTime() + BIN_DAYS * DAY) };
  }

  /** Someone without the permission asks the admins to delete the project. */
  async request(u: AuthUser, id: string, reason?: string) {
    const p = await this.live(u, id);
    await this.prisma.project.update({ where: { id }, data: { deleteRequestedAt: new Date(), deleteRequestedById: u.id, deleteRequestReason: reason || null } });
    await this.audit.record({ organizationId: u.organizationId, actorId: u.id, action: 'project.delete_requested', entityType: 'Project', entityId: id, detail: { projectCode: p.projectCode, reason } });
    return { requested: true };
  }

  async decline(u: AuthUser, id: string) {
    if (!(await this.canDelete(u))) throw new ForbiddenException('Only people who may delete projects can decline a request');
    const p = await this.live(u, id);
    if (!p.deleteRequestedAt) throw new BadRequestException('Nobody asked to delete this project');
    await this.prisma.project.update({ where: { id }, data: { deleteRequestedAt: null, deleteRequestedById: null, deleteRequestReason: null } });
    await this.audit.record({ organizationId: u.organizationId, actorId: u.id, action: 'project.delete_declined', entityType: 'Project', entityId: id, detail: { projectCode: p.projectCode } });
    return { declined: true };
  }

  async restore(u: AuthUser, id: string) {
    if (!(await this.canDelete(u))) throw new ForbiddenException('Only people who may delete projects can restore them');
    const p = await this.binned(u, id);
    await this.prisma.project.update({ where: { id }, data: { deletedAt: null, deletedById: null, deleteRequestedAt: null, deleteRequestedById: null, deleteRequestReason: null } });
    await this.audit.record({ organizationId: u.organizationId, actorId: u.id, action: 'project.restore', entityType: 'Project', entityId: id, detail: { projectCode: p.projectCode } });
    return { restored: true };
  }

  /** Empties one project from the bin now (admins only), instead of waiting 30 days. */
  async purgeNow(u: AuthUser, id: string) {
    if (u.role !== 'ADMIN' && !u.superAdmin) throw new ForbiddenException('Only admins can delete a project for good');
    const p = await this.binned(u, id);
    await this.purge(p.id);
    await this.audit.record({ organizationId: u.organizationId, actorId: u.id, action: 'project.purge', entityType: 'Project', entityId: id, detail: { projectCode: p.projectCode, early: true } });
    return { purged: true };
  }

  /** The bin and the open delete requests. */
  async list(u: AuthUser) {
    const [binned, requests] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId: u.organizationId, deletedAt: { not: null } },
        orderBy: { deletedAt: 'desc' },
        select: { id: true, projectCode: true, workOrderNo: true, name: true, status: true, deletedAt: true, deletedById: true, client: { select: { name: true } }, _count: { select: { sessions: true, invoices: true } } },
      }),
      this.prisma.project.findMany({
        where: { organizationId: u.organizationId, deleteRequestedAt: { not: null } },
        orderBy: { deleteRequestedAt: 'desc' },
        select: { id: true, projectCode: true, workOrderNo: true, name: true, status: true, deleteRequestedAt: true, deleteRequestedById: true, deleteRequestReason: true, client: { select: { name: true } } },
      }),
    ]);
    const ids = [...new Set([...binned.map((b) => b.deletedById), ...requests.map((r) => r.deleteRequestedById)].filter((x): x is string => !!x))];
    const people = new Map((await this.prisma.user.findMany({ where: { id: { in: ids }, organizationId: u.organizationId }, select: { id: true, name: true } })).map((x) => [x.id, x.name]));
    const now = Date.now();
    return {
      days: BIN_DAYS,
      canDelete: await this.canDelete(u),
      canPurge: u.role === 'ADMIN' || !!u.superAdmin,
      projects: binned.map((b) => {
        const purgeAt = new Date(b.deletedAt!.getTime() + BIN_DAYS * DAY);
        return { id: b.id, projectCode: b.projectCode, workOrderNo: b.workOrderNo, name: b.name, status: b.status, client: b.client.name, respondents: b._count.sessions, invoices: b._count.invoices, deletedAt: b.deletedAt, deletedBy: b.deletedById ? people.get(b.deletedById) ?? null : null, purgeAt, daysLeft: Math.max(0, Math.ceil((purgeAt.getTime() - now) / DAY)) };
      }),
      requests: requests.map((r) => ({ id: r.id, projectCode: r.projectCode, workOrderNo: r.workOrderNo, name: r.name, status: r.status, client: r.client.name, requestedAt: r.deleteRequestedAt, requestedBy: r.deleteRequestedById ? people.get(r.deleteRequestedById) ?? null : null, reason: r.deleteRequestReason })),
    };
  }

  /**
   * Removes a project and everything under it. The respondent data is deleted in batches first (it
   * is by far the largest part), then the project itself, whose relations cascade.
   */
  async purge(projectId: string) {
    const BATCH = 5000;
    for (;;) {
      const ids = (await this.prisma.respondentSession.findMany({ where: { projectId }, select: { id: true }, take: BATCH })).map((s) => s.id);
      if (!ids.length) break;
      await this.prisma.respondentEvent.deleteMany({ where: { sessionId: { in: ids } } });
      await this.prisma.redirectExecution.deleteMany({ where: { sessionId: { in: ids } } });
      await this.prisma.clientUniqueLink.updateMany({ where: { sessionId: { in: ids } }, data: { sessionId: null } });
      await this.prisma.respondentSession.deleteMany({ where: { id: { in: ids } } });
    }
    await this.prisma.uniqueLink.deleteMany({ where: { projectId } });
    await this.prisma.clientUniqueLink.deleteMany({ where: { projectId } });
    await this.prisma.vendorNotice.deleteMany({ where: { projectId } });
    await this.prisma.project.update({ where: { id: projectId }, data: { activeRedirectVersionId: null } });
    await this.prisma.project.delete({ where: { id: projectId } });
  }

  /** Every hour: projects 30 days in the bin are removed for good. */
  @Interval(3_600_000)
  async sweep() {
    if (!config.automationSchedulerEnabled) return;
    await this.purgeExpired();
  }

  async purgeExpired(now = new Date()) {
    const due = await this.prisma.project.findMany({ where: { deletedAt: { lt: new Date(now.getTime() - BIN_DAYS * DAY) } }, select: { id: true, organizationId: true, projectCode: true }, take: 20 });
    for (const p of due) {
      try {
        await this.purge(p.id);
        await this.audit.record({ organizationId: p.organizationId, actorId: null, action: 'project.purge', entityType: 'Project', entityId: p.id, detail: { projectCode: p.projectCode, afterDays: BIN_DAYS } });
      } catch (e) {
        this.log.warn(`Could not purge ${p.projectCode}: ${(e as Error).message}`);
      }
    }
    return due.length;
  }
}

@Controller()
export class RecycleBinController {
  constructor(private readonly bin: RecycleBinService) {}

  @Get('recycle-bin')
  list(@CurrentUser() u: AuthUser) {
    return this.bin.list(u);
  }

  @Delete('projects/:id')
  @Roles(...EDITORS)
  remove(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bin.remove(u, id);
  }

  @Post('projects/:id/delete-request')
  @Roles(...EDITORS)
  @HttpCode(200)
  request(@CurrentUser() u: AuthUser, @Param('id') id: string, @Body(new ZodPipe(reasonSchema)) body: z.infer<typeof reasonSchema>) {
    return this.bin.request(u, id, body.reason);
  }

  @Post('projects/:id/delete-request/decline')
  @Roles(...EDITORS)
  @HttpCode(200)
  decline(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bin.decline(u, id);
  }

  @Post('recycle-bin/:id/restore')
  @Roles(...EDITORS)
  @HttpCode(200)
  restore(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bin.restore(u, id);
  }

  @Delete('recycle-bin/:id')
  @Roles('ADMIN')
  purge(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bin.purgeNow(u, id);
  }
}

@Module({ controllers: [RecycleBinController], providers: [RecycleBinService], exports: [RecycleBinService] })
export class RecycleBinModule {}
