import { INestApplication } from '@nestjs/common';
import { createHash } from 'crypto';
import request from 'supertest';
import { config } from '../../src/common/config';
import { leadingZeroBits, powChallenge, POW_BITS } from '../../src/survey/respondent-checks';
import { AiService } from '../../src/ai/ai.service';
import { Http } from '../../src/ai/provider';
import { PrismaClient } from '../../src/prisma/client';
import { api, createApp, login, makeOrg, PASSWORD, resetDb, saveIntegration } from './helpers';

function solve(token: string) {
  const challenge = powChallenge(config.jwtSecret, token);
  for (let n = 0; ; n++) if (leadingZeroBits(createHash('sha256').update(`${challenge}:${n}`).digest()) >= POW_BITS) return n;
}

const DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

/**
 * Feedback of 2026-11-24: new portal password and "Login as", vendor respondents behind each number,
 * renaming a project, and the gate survey in the market's language.
 */
describe('Feedback 2026-11-24 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof api>;
  let pm: ReturnType<typeof api>;
  let users: Record<string, { id: string; email: string }>;
  let org: string;
  let clientId: string;
  let vendorA: string;
  let vendorB: string;
  let vendorUserId: string;
  let ip = 20;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    const a = await makeOrg(prisma, 'fb1124');
    org = a.org.id;
    users = a.users;
    admin = api(app, await login(app, a.users.ADMIN.email));
    pm = api(app, await login(app, a.users.PROJECT_MANAGER.email));
    clientId = (await pm.post('/clients', { name: 'Lang Client', code: 'LNC' }).expect(201)).body.id;
    vendorA = (await pm.post('/vendors', { name: 'Vendor A', code: 'VA' }).expect(201)).body.id;
    vendorB = (await pm.post('/vendors', { name: 'Vendor B', code: 'VB' }).expect(201)).body.id;
    vendorUserId = (await pm.post('/portal-users', { kind: 'vendor', partyId: vendorA, name: 'A user', email: 'a@vendor.example.com', password: PASSWORD }).expect(201)).body.id;
  });
  afterAll(async () => {
    await app.close();
  });

  describe('portal password and login as', () => {
    it('sets a new password for a vendor login; the old one and old sessions stop working', async () => {
      const old = await login(app, 'a@vendor.example.com');
      await pm.post(`/portal-users/${vendorUserId}/password`, { password: 'short' }).expect(400);
      await pm.post(`/portal-users/${vendorUserId}/password`, { password: 'Brand-new-pass-42' }).expect(200);
      await http().post('/api/v1/auth/login').send({ email: 'a@vendor.example.com', password: PASSWORD }).expect(401);
      await http().get('/api/v1/auth/me').set('Authorization', `Bearer ${old}`).expect(401);
      const fresh = (await http().post('/api/v1/auth/login').send({ email: 'a@vendor.example.com', password: 'Brand-new-pass-42' }).expect(200)).body;
      expect(fresh.home).toBe('/portal/vendor');
      // Staff logins are not changed here.
      await pm.post(`/portal-users/${users.VIEWER.id}/password`, { password: 'Brand-new-pass-42' }).expect(404);
      const list = (await pm.get('/portal-users').expect(200)).body;
      expect(list[0]).toHaveProperty('passwordSetAt');
      expect(JSON.stringify(list)).not.toMatch(/passwordHash/);
      await prisma.user.update({ where: { id: vendorUserId }, data: { passwordHash: (await prisma.user.findFirstOrThrow({ where: { id: users.VIEWER.id } })).passwordHash } });
    });

    it('lets an admin open a vendor login in its own session, once, and logs it', async () => {
      await pm.post(`/auth/login-as/${vendorUserId}`).expect(403);
      const t = (await admin.post(`/auth/login-as/${vendorUserId}`).expect(200)).body;
      expect(t.url).toMatch(/^\/login-as#/);
      const r = (await http().post('/api/v1/auth/login-as/redeem').send({ ticket: t.ticket }).expect(200)).body;
      expect(r).toMatchObject({ home: '/portal/vendor', user: { id: vendorUserId }, by: { id: users.ADMIN.id } });
      // No cookie: the admin's own session elsewhere stays as it is.
      const again = await http().post('/api/v1/auth/login-as/redeem').send({ ticket: t.ticket }).expect(401);
      expect(again.body.message).toMatch(/already used/);
      expect(again.headers['set-cookie']).toBeUndefined();
      const as = api(app, r.token);
      const me = (await as.get('/auth/me').expect(200)).body;
      expect(me.user.id).toBe(vendorUserId);
      expect(me.loginAs.by.id).toBe(users.ADMIN.id);
      await as.get('/portal/vendor/projects').expect(200);
      // Not their password or two-step sign-in, and no chain of logins.
      expect((await as.post('/auth/password/change', { currentPassword: PASSWORD, newPassword: 'Another-pass-1234' }).expect(403)).body.code).toBe('LOGIN_AS_LIMIT');
      await as.post('/auth/mfa/setup').expect(403);
      const audit = await prisma.auditEvent.findFirstOrThrow({ where: { organizationId: org, action: 'auth.login_as' } });
      expect(audit).toMatchObject({ actorId: users.ADMIN.id, entityId: vendorUserId });
    });

    it('works for staff, but not for yourself, other admins or someone deactivated', async () => {
      const t = (await admin.post(`/auth/login-as/${users.PROJECT_MANAGER.id}`).expect(200)).body;
      const r = (await http().post('/api/v1/auth/login-as/redeem').send({ ticket: t.ticket }).expect(200)).body;
      expect(r.home).toBe('/');
      const as = api(app, r.token);
      expect((await as.get('/auth/me').expect(200)).body.user.role).toBe('PROJECT_MANAGER');
      await as.post(`/auth/login-as/${users.VIEWER.id}`).expect(403);
      await admin.post(`/auth/login-as/${users.ADMIN.id}`).expect(400);
      await prisma.user.update({ where: { id: users.VIEWER.id }, data: { active: false } });
      await admin.post(`/auth/login-as/${users.VIEWER.id}`).expect(400);
      await prisma.user.update({ where: { id: users.VIEWER.id }, data: { active: true } });
      const other = await makeOrg(prisma, 'fb1124-other');
      await admin.post(`/auth/login-as/${other.users.PROJECT_MANAGER.id}`).expect(404);
      await http().post('/api/v1/auth/login-as/redeem').send({ ticket: 'x'.repeat(40) }).expect(401);
    });
  });

  describe('vendor portal numbers and project name', () => {
    let projectId: string;
    beforeAll(async () => {
      const p = (
        await pm
          .post('/projects', {
            name: 'Number study', category: 'B2C', clientId, workOrderNo: 'WO-N1',
            defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' },
            countries: [{ countryCode: 'US', currency: 'USD' }, { countryCode: 'DE', language: 'de', currency: 'USD' }],
            vendors: [{ vendorId: vendorA, cpi: 4 }, { vendorId: vendorB, cpi: 3 }],
          })
          .expect(201)
      ).body;
      projectId = p.id;
      for (const c of p.countries) await pm.patch(`/projects/${p.id}/countries/${c.id}`, { status: 'LIVE' }).expect(200);
      await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
      const code = (cc: string, v: string) => p.countries.find((c: { countryCode: string }) => c.countryCode === cc).allocations.find((x: { vendorId: string }) => x.vendorId === v).entryCode;
      const go = async (entry: string, vid: string, outcome: string) => {
        const res = await http().get(`/s/${entry}?vid=${vid}`).set('X-Forwarded-For', `198.51.100.${++ip}`).set('User-Agent', DESKTOP).expect(302);
        const rid = new URL(res.headers.location).searchParams.get('rid')!;
        await http().get(`/r/${outcome}?token=${rid}`).expect(302);
      };
      await go(code('US', vendorA), 'a-us-1', 'complete');
      await go(code('US', vendorA), 'a-us-2', 'terminate');
      await go(code('DE', vendorA), 'a-de-1', 'complete');
      await go(code('DE', vendorA), 'a-de-2', 'quota_full');
      await go(code('US', vendorB), 'b-us-1', 'complete');
    });

    it('shows a vendor the respondents behind each number, its own only', async () => {
      const vendor = api(app, await login(app, 'a@vendor.example.com'));
      const all = (await vendor.get(`/portal/vendor/projects/${projectId}/report?take=50`).expect(200)).body;
      expect(all.total).toBe(4);
      expect(all.rows.map((r: { respondentId: string }) => r.respondentId).sort()).toEqual(['a-de-1', 'a-de-2', 'a-us-1', 'a-us-2']);
      // Nothing about security, other vendors or gate answers.
      expect(all.rows.every((r: { ipId: unknown; statusDetail: unknown; vendor: string }) => r.ipId === null && r.statusDetail === null && r.vendor === '')).toBe(true);
      expect(all.gateQuestions).toEqual([]);
      expect((await vendor.get(`/portal/vendor/projects/${projectId}/report?status=COMPLETE`).expect(200)).body.total).toBe(2);
      expect((await vendor.get(`/portal/vendor/projects/${projectId}/report?status=TERMINATE`).expect(200)).body.total).toBe(1);
      expect((await vendor.get(`/portal/vendor/projects/${projectId}/report?status=QUOTA_FULL`).expect(200)).body.total).toBe(1);
      const de = (await vendor.get(`/portal/vendor/projects/${projectId}/report?q=DE`).expect(200)).body;
      expect(de.total).toBe(2);
      const page2 = (await vendor.get(`/portal/vendor/projects/${projectId}/report?take=1&skip=1`).expect(200)).body;
      expect(page2.rows).toHaveLength(1);
      expect((await vendor.get(`/portal/vendor/projects/${projectId}/report?all=true`).expect(200)).body.rows).toHaveLength(4);
      // Another vendor's project, or staff routes, are refused.
      const other = (await pm.post('/projects', { name: 'Not yours', category: 'B2C', clientId, defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50 }, countries: [{ countryCode: 'US' }], vendors: [{ vendorId: vendorB, cpi: 3 }] }).expect(201)).body;
      await prisma.project.update({ where: { id: other.id }, data: { status: 'LIVE' } });
      await vendor.get(`/portal/vendor/projects/${other.id}/report`).expect(404);
      await vendor.get(`/projects/${projectId}/report`).expect(403);
    });

    it('renames a project; vendors keep their own title', async () => {
      await pm.patch(`/projects/${projectId}`, { name: 'Number study (renamed)' }).expect(200);
      expect((await pm.get(`/projects/${projectId}`).expect(200)).body.name).toBe('Number study (renamed)');
      await pm.patch(`/projects/${projectId}`, { name: '' }).expect(400);
      const vendor = api(app, await login(app, 'a@vendor.example.com'));
      const d = (await vendor.get(`/portal/vendor/projects/${projectId}`).expect(200)).body;
      expect(d.project.name).toBe('Survey WO-N1 · ' + d.project.projectCode);
      expect(JSON.stringify(d)).not.toMatch(/renamed/);
    });
  });

  describe('gate survey in the market language', () => {
    const questions = [
      { id: 'age', type: 'number', text: 'How old are you?', required: true, validation: { min: 18, max: 99, integer: true } },
      {
        id: 'role', type: 'single', text: 'What is your role?', help: 'Choose one.', required: true, validation: {},
        options: [{ id: 'it', label: 'IT decision maker', action: 'accept' }, { id: 'no', label: 'None of these', action: 'terminate' }],
        translations: { es: { text: '¿Cuál es su puesto?', help: 'Elija uno.', options: { it: 'Responsable de TI', no: 'Ninguno de estos' } }, 'pt-BR': { text: 'Qual é o seu cargo?' } },
      },
    ];

    it('keeps translations, shows each market its language, and scores answers the same', async () => {
      const p = (
        await pm
          .post('/projects', {
            name: 'Language study', category: 'B2B', clientId, security: { gateSurvey: true, captcha: false },
            defaults: { loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' },
            countries: [{ countryCode: 'ES', language: 'es' }, { countryCode: 'BR', language: 'pt-BR' }, { countryCode: 'US', language: 'en' }],
            vendors: [{ vendorId: vendorA, cpi: 4 }],
            gateQuestions: questions,
          })
          .expect(201)
      ).body;
      await pm.patch(`/projects/${p.id}`, { captchaStyle: 'invisible' }).expect(200);
      const saved = (await pm.get(`/projects/${p.id}`).expect(200)).body.gateQuestions;
      expect(saved[1].translations.es.options.it).toBe('Responsable de TI');
      await pm.patch(`/projects/${p.id}`, { gateQuestions: [{ ...questions[1], translations: { 'not a code': { text: 'x' } } }] }).expect(400);
      for (const c of p.countries) await pm.patch(`/projects/${p.id}/countries/${c.id}`, { status: 'LIVE' }).expect(200);
      await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
      const entry = (cc: string) => p.countries.find((c: { countryCode: string }) => c.countryCode === cc).allocations[0].entryCode;
      const page = async (cc: string, uid: string) => {
        const e = await http().get(`/s/${entry(cc)}?vid=${uid}`).set('X-Forwarded-For', `198.51.100.${++ip}`).set('User-Agent', DESKTOP).expect(302);
        expect(e.headers.location).toMatch(/\/g\//);
        const token = decodeURIComponent(e.headers.location.split('/g/')[1]);
        const res = await http().get(`/g/${encodeURIComponent(token)}`).expect(200);
        return { html: res.text, token, jar: ((res.headers['set-cookie'] as unknown as string[]) ?? []).map((c) => c.split(';')[0]) };
      };
      const es = await page('ES', 'es-1');
      expect(es.html).toContain('<html lang="es"');
      expect(es.html).toContain('¿Cuál es su puesto?');
      expect(es.html).toContain('Responsable de TI');
      expect(es.html).toContain('Elija uno.');
      expect(es.html).toContain('Empezar la encuesta');
      // Untranslated texts fall back to the original.
      expect(es.html).toContain('How old are you?');
      expect(es.html).not.toContain('What is your role?');

      const br = await page('BR', 'br-1');
      expect(br.html).toContain('<html lang="pt"');
      expect(br.html).toContain('Qual é o seu cargo?');
      expect(br.html).toContain('IT decision maker');
      expect(br.html).toContain('Iniciar pesquisa');

      const us = await page('US', 'us-1');
      expect(us.html).toContain('<html lang="en"');
      expect(us.html).toContain('What is your role?');
      expect(us.html).toContain('Start survey');
      expect(us.html).not.toContain('translations');

      // The Spanish respondent answers with the same ids; the stored answer keeps the original label.
      const done = await http().post(`/g/${encodeURIComponent(es.token)}`).set('Cookie', es.jar.join('; ')).send({ nonce: solve(es.token), answers: { gate: { age: 30, role: 'it' } } }).expect(200);
      expect(done.body.location).toMatch(/client\.example\.com/);
      const s = await prisma.respondentSession.findFirstOrThrow({ where: { projectId: p.id, vendorRespondentId: 'es-1' } });
      expect((s.answers as { gate: Record<string, { label: string }> }).gate.role.label).toBe('IT decision maker');
    });

    it('drafts a translation with the AI', async () => {
      const svc = app.get(AiService);
      const calls: { body: Record<string, any> }[] = [];
      const http0: Http = async (url, init) => {
        const body = init.body ? JSON.parse(init.body) : null;
        calls.push({ body });
        const items = [
          { key: 'q:role', text: 'Quel est votre poste ?' },
          { key: 'h:role', text: 'Choisissez-en un.' },
          { key: 'o:role:it', text: 'Décideur informatique' },
          { key: 'o:role:ghost', text: 'ignored' },
        ];
        const out = { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name: 'translations', args: { items } } }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 } };
        return { status: 200, json: async () => out, text: async () => JSON.stringify(out) };
      };
      svc.http = http0;
      await pm.post('/ai/translate-questions', { language: 'fr', questions: [questions[1]] }).expect(503);
      await saveIntegration(prisma, org, 'gemini', { GEMINI_API_KEY: 'test-key', AI_MODEL: 'gemini-test-flash' });
      const r = (await pm.post('/ai/translate-questions', { language: 'fr', questions: [questions[1]] }).expect(200)).body;
      expect(r.translations.role).toEqual({ text: 'Quel est votre poste ?', help: 'Choisissez-en un.', options: { it: 'Décideur informatique' } });
      expect(r.missing).toBe(1);
      expect(JSON.stringify(calls[0].body)).toContain('IT decision maker');
      expect(calls[0].body.systemInstruction.parts[0].text).toMatch(/"fr"/);
      await pm.post('/ai/translate-questions', { language: 'French', questions: [questions[1]] }).expect(400);
      const viewer = api(app, await login(app, users.VIEWER.email));
      await viewer.post('/ai/translate-questions', { language: 'fr', questions: [questions[1]] }).expect(403);
      expect(await prisma.aiUsage.count({ where: { organizationId: org, kind: 'translate' } })).toBe(1);
    });
  });
});
