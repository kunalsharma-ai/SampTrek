/**
 * "Login as" (feedback 2026-11-24): an admin opens SampTrek as one of their users or vendor/client
 * portal logins, in a new browser tab, without knowing that person's password.
 *
 * 1. POST /auth/login-as/:userId (admin) gives a one-time ticket that works for 2 minutes.
 * 2. The new tab opens /login-as#<ticket> and redeems it (POST /auth/login-as/redeem).
 * 3. The answer is a session token for that tab only (kept in the tab's sessionStorage and sent as
 *    a Bearer header). No cookie is set, so the admin's own session in the other tabs is untouched.
 *
 * Rules: same organisation, active account, never yourself and never the Super Admin. Only the
 * Super Admin may open another admin. The session lasts at most 2 hours, cannot change the person's
 * password or two-step sign-in, and every start is in the audit log with who did it.
 */
import { BadRequestException, Body, Controller, ForbiddenException, HttpCode, NotFoundException, Param, Post, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { z } from 'zod';
import { config } from '../common/config';
import { ZodPipe } from '../common/zod.pipe';
import { PrismaService } from '../prisma/prisma.service';
import { BLOCK_MESSAGE } from '../super-admin/entitlements';
import { AuthUser } from './auth.types';
import { AllowWithoutMfa, CurrentUser, Public, Roles } from './decorators';
import { homeOf } from './session.service';

const ticketSecret = () => `${config.jwtSecret}:login-as-ticket`;
export const LOGIN_AS_HOURS = 2;
/** Routes a "login as" session may not use: the person's own password and two-step sign-in. */
export const LOGIN_AS_BLOCKED = /\/auth\/(password\/change|mfa\/(setup|enable|disable|recovery-codes))$|\/auth\/login-as\//;

@Controller('auth/login-as')
export class LoginAsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** The new tab: swaps the ticket for a session for that tab only. */
  @Public()
  @AllowWithoutMfa()
  @Post('redeem')
  @HttpCode(200)
  async redeem(@Body(new ZodPipe(z.object({ ticket: z.string().min(20).max(4000) }).strict())) body: { ticket: string }) {
    let p: { sub: string; by: string; org: string; purpose?: string; jti?: string; iat?: number };
    try {
      p = await this.jwt.verifyAsync(body.ticket, { secret: ticketSecret() });
    } catch {
      throw new UnauthorizedException('This link has expired. Click “Login as” again.');
    }
    if (p.purpose !== 'login-as') throw new UnauthorizedException('Not a login-as link');
    // One use only: the audit event of the first redeem marks the ticket as used.
    const key = `${p.by}:${p.sub}:${p.iat ?? 0}`;
    const recent = await this.prisma.auditEvent.findMany({ where: { organizationId: p.org, action: 'auth.login_as', entityId: p.sub, createdAt: { gte: new Date(Date.now() - 5 * 60_000) } }, select: { detail: true } });
    if (recent.some((e) => (e.detail as { ticket?: string } | null)?.ticket === key))throw new UnauthorizedException('This link was already used. Click “Login as” again.');
    const [admin, user] = await Promise.all([
      this.prisma.user.findFirst({ where: { id: p.by, organizationId: p.org, active: true, role: 'ADMIN' }, select: { id: true, name: true, superAdmin: true } }),
      this.prisma.user.findFirst({ where: { id: p.sub, organizationId: p.org, active: true }, include: { organization: true } }),
    ]);
    if (!admin || !user || user.superAdmin) throw new UnauthorizedException('This login is no longer possible.');
    if (!user.organization.platformOwner && user.organization.status !== 'ACTIVE') throw new UnauthorizedException(user.organization.status === 'PENDING' ? BLOCK_MESSAGE.ORG_PENDING : BLOCK_MESSAGE.ORG_SUSPENDED);
    const token = await this.jwt.signAsync({ sub: user.id, org: user.organizationId, at: Date.now(), as: admin.id }, { secret: config.jwtSecret, expiresIn: `${LOGIN_AS_HOURS}h` });
    await this.prisma.auditEvent.create({ data: { organizationId: user.organizationId, actorId: admin.id, action: 'auth.login_as', entityType: 'User', entityId: user.id, detail: { ticket: key, name: user.name, role: user.role } } });
    return { token, home: homeOf(user.role), user: { id: user.id, name: user.name, email: user.email, role: user.role }, by: { id: admin.id, name: admin.name }, expiresInHours: LOGIN_AS_HOURS };
  }

  /** Admin: a ticket for opening this user in a new tab. */
  @Post(':userId')
  @HttpCode(200)
  @Roles('ADMIN')
  async ticket(@CurrentUser() u: AuthUser, @Param('userId') userId: string) {
    if (u.observing) throw new ForbiddenException('Exit observe mode first.');
    if (u.loginAsBy) throw new ForbiddenException('You are already logged in as someone else.');
    if (userId === u.id) throw new BadRequestException('This is you.');
    const target = await this.prisma.user.findFirst({ where: { id: userId, organizationId: u.organizationId }, select: { id: true, name: true, role: true, active: true, superAdmin: true } });
    if (!target) throw new NotFoundException('User not found');
    if (!target.active) throw new BadRequestException(`${target.name} is deactivated. Reactivate the account first.`);
    if (target.superAdmin) throw new ForbiddenException('Nobody can log in as the Super Admin.');
    if (target.role === 'ADMIN' && !u.superAdmin) throw new ForbiddenException('Only the Super Admin can log in as another admin.');
    const ticket = await this.jwt.signAsync({ sub: target.id, by: u.id, org: u.organizationId, purpose: 'login-as' }, { secret: ticketSecret(), expiresIn: '2m' });
    return { ticket, url: `/login-as#${ticket}`, name: target.name };
  }
}
