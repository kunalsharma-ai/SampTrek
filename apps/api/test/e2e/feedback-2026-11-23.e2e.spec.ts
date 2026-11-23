import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../../src/prisma/client';
import { RecycleBinService } from '../../src/projects/recycle-bin';
import { api, createApp, login, makeOrg, PASSWORD, resetDb } from './helpers';

const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');

/**
 * Feedback of 2026-11-23: recycle bin and delete permission, one entry per browser, quota notes and
 * vendor notices, project documents for vendors, report builder, vendor payables, vendor portal.
 */
describe('Feedback 2026-11-23 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof api>;
  let pm: ReturnType<typeof api>;
  let pmToken: string;
  let viewer: ReturnType<typeof api>;
  let pmId: string;
  let clientId: string;
  let vendorA: string;
  let vendorB: string;
  let vendorPortal: ReturnType<typeof api>;
  let n = 0;
  let ip = 10;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    const a = await makeOrg(prisma, 'fb1123');
    admin = api(app, await login(app, a.users.ADMIN.email));
    pmToken = await login(app, a.users.PROJECT_MANAGER.email);
    pm = api(app, pmToken);
    pmId = a.users.PROJECT_MANAGER.id;
    viewer = api(app, await login(app, a.users.VIEWER.email));
    clientId = (await pm.post('/clients', { name: 'Bin Client', code: 'BNC' }).expect(201)).body.id;
    vendorA = (await pm.post('/vendors', { name: 'Vendor A', code: 'VA' }).expect(201)).body.id;
    vendorB = (await pm.post('/vendors', { name: 'Vendor B', code: 'VB' }).expect(201)).body.id;
    await pm.post('/portal-users', { kind: 'vendor', partyId: vendorA, name: 'A user', email: 'a@vendor.example.com', password: PASSWORD }).expect(201);
    vendorPortal = api(app, await login(app, 'a@vendor.example.com'));
  });

  afterAll(async () => {
    await app.close();
  });

  async function liveProject(security: object = {}, extra: object = {}) {
    const p = (
      await pm
        .post('/projects', {
          name: `Feedback study ${++n}`, category: 'B2C', clientId, workOrderNo: `WO${n}`, security, ...extra,
          defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' },
          countries: [{ countryCode: 'US', currency: 'USD' }],
          vendors: [{ vendorId: vendorA, cpi: 4 }, { vendorId: vendorB, cpi: 3 }],
        })
        .expect(201)
    ).body;
    await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}`, { status: 'LIVE' }).expect(200);
    await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
    const alloc = (v: string) => p.countries[0].allocations.find((x: { vendorId: string }) => x.vendorId === v);
    return { p, alloc };
  }

  async function complete(entryCode: string, vid: string) {
    const res = await http().get(`/s/${entryCode}?vid=${vid}`).set('X-Forwarded-For', `198.51.100.${++ip}`).expect(302);
    const rid = new URL(res.headers.location).searchParams.get('rid')!;
    await http().get(`/r/complete?token=${rid}`).expect(302);
    return rid;
  }

  describe('recycle bin', () => {
    it('only admins delete by default; others ask, and admins see the request', async () => {
      const { p } = await liveProject();
      const del = await pm.delete(`/projects/${p.id}`).expect(403);
      expect(del.body.code).toBe('DELETE_NEEDS_ADMIN');
      await viewer.delete(`/projects/${p.id}`).expect(403);
      expect((await pm.get('/auth/me').expect(200)).body.canDeleteProjects).toBe(false);
      expect((await admin.get('/auth/me').expect(200)).body.canDeleteProjects).toBe(true);

      await pm.post(`/projects/${p.id}/delete-request`, { reason: 'Duplicate of WO1' }).expect(200);
      const bin = (await admin.get('/recycle-bin').expect(200)).body;
      expect(bin).toMatchObject({ days: 30, canDelete: true, canPurge: true, projects: [] });
      expect(bin.requests).toEqual([expect.objectContaining({ id: p.id, reason: 'Duplicate of WO1', requestedBy: expect.any(String) })]);
      const insights = (await admin.get('/insights').expect(200)).body;
      expect(JSON.stringify(insights)).toContain('/projects/recycle-bin');

      // Live projects must be stopped first.
      expect((await admin.delete(`/projects/${p.id}`).expect(400)).body.code).toBe('PROJECT_LIVE');
      await pm.post(`/projects/${p.id}/delete-request/decline`).expect(403);
      await admin.post(`/projects/${p.id}/delete-request/decline`).expect(200);
      expect((await admin.get('/recycle-bin').expect(200)).body.requests).toEqual([]);
    });

    it('a binned project leaves every list, refuses respondents, and comes back on restore', async () => {
      const { p, alloc } = await liveProject();
      const code = alloc(vendorA).entryCode;
      await pm.patch(`/projects/${p.id}`, { status: 'CLOSED' }).expect(200);
      const r = (await admin.delete(`/projects/${p.id}`).expect(200)).body;
      expect(new Date(r.purgeAt).getTime() - new Date(r.deletedAt).getTime()).toBe(30 * 86_400_000);
      await pm.get(`/projects/${p.id}`).expect(404);
      const list = (await pm.get('/projects').expect(200)).body;
      expect(JSON.stringify(list)).not.toContain(p.id);
      const res = await http().get(`/s/${code}?vid=BIN1`).set('X-Forwarded-For', '198.51.100.200');
      expect(res.headers.location ?? '').not.toContain('client.example.com');
      expect((await admin.get('/recycle-bin').expect(200)).body.projects).toEqual([expect.objectContaining({ id: p.id, daysLeft: 30 })]);

      await pm.post(`/recycle-bin/${p.id}/restore`).expect(403);
      await admin.post(`/recycle-bin/${p.id}/restore`).expect(200);
      await pm.get(`/projects/${p.id}`).expect(200);
      await admin.post(`/recycle-bin/${p.id}/restore`).expect(404);
    });

    it('admins give the delete permission on Team; purge removes for good after 30 days', async () => {
      const { p, alloc } = await liveProject();
      await complete(alloc(vendorA).entryCode, 'P1');
      await pm.patch(`/projects/${p.id}`, { status: 'CLOSED' }).expect(200);
      await pm.patch(`/team/${pmId}`, { canDeleteProjects: true }).expect(403);
      await admin.patch(`/team/${pmId}`, { canDeleteProjects: true }).expect(200);
      expect((await pm.get('/auth/me').expect(200)).body.canDeleteProjects).toBe(true);
      await pm.delete(`/projects/${p.id}`).expect(200);
      // Only admins can empty it early.
      await pm.delete(`/recycle-bin/${p.id}`).expect(403);

      const bin = app.get(RecycleBinService);
      expect(await bin.purgeExpired(new Date())).toBe(0);
      expect(await bin.purgeExpired(new Date(Date.now() + 31 * 86_400_000))).toBe(1);
      expect(await prisma.project.count({ where: { id: p.id, deletedAt: { not: null } } })).toBe(0);
      expect(await prisma.respondentSession.count({ where: { projectId: p.id } })).toBe(0);
      await admin.patch(`/team/${pmId}`, { canDeleteProjects: false }).expect(200);
    });
  });

  describe('one entry per browser', () => {
    it('stops a second entry from the same browser, and from another browser on the same device', async () => {
      const { alloc } = await liveProject({ oneEntryPerBrowser: true });
      const code = alloc(vendorA).entryCode;
      const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
      const first = await http().get(`/s/${code}?vid=B1`).set('X-Forwarded-For', '203.0.113.5').set('User-Agent', ua).expect(302);
      expect(first.headers.location).toContain('client.example.com');
      const cookie = String(first.headers['set-cookie']).match(/pxb=[^;]+/)![0];
      // Same browser cookie, different IP and respondent ID.
      const again = await http().get(`/s/${code}?vid=B2`).set('X-Forwarded-For', '203.0.113.6').set('User-Agent', ua).set('Cookie', cookie).expect(302);
      expect(again.headers.location).not.toContain('client.example.com');
      // Another browser (no cookie, Firefox) on the same device and network, after the first one finished.
      await http().get(`/r/complete?token=${new URL(first.headers.location).searchParams.get('rid')}`).expect(302);
      const ff = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
      const other = await http().get(`/s/${code}?vid=B3`).set('X-Forwarded-For', '203.0.113.5').set('User-Agent', ff).expect(302);
      expect(other.headers.location).not.toContain('client.example.com');
      const statuses = await prisma.respondentSession.findMany({ where: { vendorRespondentId: { in: ['B2', 'B3'] } }, select: { vendorRespondentId: true, statusDetail: true } });
      expect(statuses.map((s) => s.statusDetail).sort()).toEqual(['SAME_BROWSER_ENTRY', 'SAME_DEVICE_OTHER_BROWSER']);
    });

    it('is off by default', async () => {
      const { alloc } = await liveProject();
      const code = alloc(vendorA).entryCode;
      const first = await http().get(`/s/${code}?vid=D1`).set('X-Forwarded-For', '203.0.113.20').expect(302);
      const cookie = String(first.headers['set-cookie']).match(/pxb=[^;]+/)![0];
      const again = await http().get(`/s/${code}?vid=D2`).set('X-Forwarded-For', '203.0.113.21').set('Cookie', cookie).expect(302);
      expect(again.headers.location).toContain('client.example.com');
    });
  });

  describe('quota notes, documents and vendor notices', () => {
    it('vendors see quota changes and pasted quota notes with the time', async () => {
      const { p, alloc } = await liveProject();
      await vendorPortal.post('/portal/vendor/notices/read', {}).expect(200);
      await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}`, { targetCompletes: 80 }).expect(200);
      await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}/allocations/${alloc(vendorA).id}`, { targetCompletes: 30 }).expect(200);
      await pm.patch(`/projects/${p.id}`, { quotaNotes: 'Quota\tTarget\nMale\t40\nFemale\t40' }).expect(200);
      const notices = (await vendorPortal.get('/portal/vendor/notices').expect(200)).body;
      expect(notices.unread).toBeGreaterThanOrEqual(3);
      expect(notices.items.map((x: { kind: string }) => x.kind)).toEqual(expect.arrayContaining(['quota', 'notes']));
      // Vendor-safe: never the internal project name or the client.
      expect(JSON.stringify(notices)).not.toContain('Bin Client');
      expect(JSON.stringify(notices)).not.toContain(`Feedback study ${n}`);
      const d = (await vendorPortal.get(`/portal/vendor/projects/${p.id}`).expect(200)).body;
      expect(d.quotaNotes).toContain('Female\t40');
      expect(d.quotaNotesUpdatedAt).toBeTruthy();
      await vendorPortal.post('/portal/vendor/notices/read', {}).expect(200);
      expect((await vendorPortal.get('/portal/vendor/notices').expect(200)).body.unread).toBe(0);
    });

    it('project documents shared with all vendors appear in their portal and download', async () => {
      const { p } = await liveProject();
      const up = (fields: Record<string, string>) => {
        let r = http().post('/api/v1/files').set('Authorization', `Bearer ${pmToken}`);
        for (const [k, v] of Object.entries(fields)) r = r.field(k, v);
        return r.attach('file', PDF, 'Screener v2.pdf');
      };
      const f = (await up({ kind: 'SCREENER', projectId: p.id, vendorsAll: 'true' }).expect(201)).body;
      await up({ kind: 'ZIP_CODES', projectId: p.id }).expect(201); // internal only
      const files = (await vendorPortal.get(`/portal/files?projectId=${p.id}`).expect(200)).body;
      expect(files.map((x: { id: string }) => x.id)).toEqual([f.id]);
      await vendorPortal.get(`/portal/files/${f.id}/download`).expect(200);
      expect((await vendorPortal.get(`/portal/vendor/projects/${p.id}`).expect(200)).body.files.map((x: { id: string }) => x.id)).toEqual([f.id]);
    });

    it('shows the project description to vendors, and lets staff change it later', async () => {
      const { p } = await liveProject({}, { description: 'Grocery shoppers, 18-65' });
      await pm.patch(`/projects/${p.id}`, { description: 'Grocery shoppers, 18-65, weekly buyers' }).expect(200);
      const d = (await vendorPortal.get(`/portal/vendor/projects/${p.id}`).expect(200)).body;
      expect(d.description).toBe('Grocery shoppers, 18-65, weekly buyers');
    });
  });

  describe('reports', () => {
    let pid: string;
    let tokens: string[];
    beforeAll(async () => {
      const { p, alloc } = await liveProject();
      pid = p.id;
      tokens = [await complete(alloc(vendorA).entryCode, 'R1'), await complete(alloc(vendorA).entryCode, 'R2'), await complete(alloc(vendorB).entryCode, 'R3')];
    });

    it('overall, client and vendor reports split by what is picked', async () => {
      const o = (await viewer.post('/reports/builder/overall', { projectIds: [pid], groupBy: ['vendor'] }).expect(201)).body;
      expect(o.dims).toEqual(['project', 'vendor']);
      expect(o.rows).toHaveLength(2);
      expect(o.totals).toMatchObject({ completes: 3, revenue: 30, payout: 11, profit: 19 });
      await viewer.post('/reports/builder/client', { groupBy: ['vendor'] }).expect(400);
      await viewer.post('/reports/builder/client', { vendorIds: [vendorA] }).expect(400);
      const c = (await viewer.post('/reports/builder/client', { projectIds: [pid] }).expect(201)).body;
      expect(c.rows[0]).not.toHaveProperty('vendorName');
      await viewer.post('/reports/builder/vendor', { clientIds: [clientId] }).expect(400);
      const v = (await viewer.post('/reports/builder/vendor', { projectIds: [pid] }).expect(201)).body;
      expect(v.rows[0]).not.toHaveProperty('clientName');
      expect(v.rows.map((r: { vendorCode: string }) => r.vendorCode).sort()).toEqual(['VA', 'VB']);
      await viewer.post('/reports/builder/nope', {}).expect(404);
      const opts = (await viewer.get('/reports/builder/options').expect(200)).body;
      expect(JSON.stringify(opts)).toContain('Bin Client');
    });

    it('conversion report lists completes and approves or rejects them, never billed ones', async () => {
      const conv = (await viewer.post('/reports/builder/conversion', { projectIds: [pid] }).expect(201)).body;
      expect(conv.total).toBe(3);
      expect(conv.rows.map((r: { uid: string }) => r.uid).sort()).toEqual([...tokens].sort());
      const ids = conv.rows.map((r: { id: string }) => r.id);
      await viewer.post('/reports/builder/conversion/approval', { sessionIds: ids, approval: 'REJECTED' }).expect(403);
      expect((await pm.post('/reports/builder/conversion/approval', { sessionIds: [ids[0]], approval: 'REJECTED' }).expect(201)).body).toMatchObject({ updated: 1, locked: 0 });
      const rejected = (await viewer.post('/reports/builder/conversion', { projectIds: [pid], approvals: ['REJECTED'] }).expect(201)).body;
      expect(rejected.rows.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
      await pm.post('/reports/builder/conversion/approval', { sessionIds: ids, approval: 'APPROVED' }).expect(201);

      // Bill vendor A, then its completes are locked.
      await pm.post('/payables/bills', { vendorId: vendorA }).expect(201);
      const after = (await viewer.post('/reports/builder/conversion', { projectIds: [pid] }).expect(201)).body;
      expect(after.rows.filter((r: { locked: string | null }) => r.locked === 'vendor-bill')).toHaveLength(2);
      expect((await pm.post('/reports/builder/conversion/approval', { sessionIds: ids, approval: 'REJECTED' }).expect(201)).body).toMatchObject({ updated: 1, locked: 2 });
      await pm.post('/reports/builder/conversion/approval', { sessionIds: ids, approval: 'APPROVED' }).expect(201);
    });

    it('vendor payables: statement per vendor, payment mode and date when paid', async () => {
      const [bill] = (await pm.get(`/payables/bills?vendorId=${vendorA}&status=DRAFT`).expect(200)).body;
      await pm.patch(`/payables/bills/${bill.id}`, { status: 'APPROVED', vendorReference: 'VA-1' }).expect(200);
      await pm.patch(`/payables/bills/${bill.id}`, { status: 'PAID', paymentMode: 'CRYPTO' }).expect(400);
      await pm.patch(`/payables/bills/${bill.id}`, { status: 'PAID', paymentMode: 'WISE', paidOn: '2999-01-01' }).expect(400);
      const paid = (await pm.patch(`/payables/bills/${bill.id}`, { status: 'PAID', paymentMode: 'WISE', paidOn: '2026-11-20', paymentReference: 'W-9' }).expect(200)).body;
      expect(paid).toMatchObject({ status: 'PAID', paymentMode: 'WISE' });
      expect(String(paid.paidAt)).toContain('2026-11-20');

      const st = (await viewer.get(`/payables/vendors/${vendorA}`).expect(200)).body;
      const row = st.projects.find((x: { project: { id: string } }) => x.project.id === pid);
      expect(row).toMatchObject({ completes: 2, approved: 2, paid: 2 });
      expect(st.bills.map((b: { id: string }) => b.id)).toContain(bill.id);
      expect(st.totals).toHaveProperty('unbilled');

      const portal = (await vendorPortal.get('/portal/vendor/statement').expect(200)).body;
      expect(portal.bills.map((b: { id: string }) => b.id)).toContain(bill.id);
      const d = (await vendorPortal.get(`/portal/vendor/projects/${pid}`).expect(200)).body;
      expect(d.billing).toEqual([expect.objectContaining({ status: 'PAID', paymentMode: 'WISE', completes: 2 })]);
    });

    it('vendor portal lists projects as rows with own numbers only', async () => {
      const list = (await vendorPortal.get('/portal/vendor/projects').expect(200)).body;
      const row = list.find((x: { project: { id: string } }) => x.project.id === pid);
      expect(row).toMatchObject({ completes: 2, markets: ['US'] });
      const s = JSON.stringify(list);
      expect(s).not.toContain('Bin Client');
      expect(s).not.toContain('Vendor B');
      const d = (await vendorPortal.get(`/portal/vendor/projects/${pid}`).expect(200)).body;
      expect(d.markets).toHaveLength(1);
      expect(d.markets[0]).toMatchObject({ projectLoi: 10, projectIr: 50 });
      expect(d.project).not.toHaveProperty('security');
      expect(JSON.stringify(d)).not.toContain('geolocation');
      // Projects of other vendors only are not reachable.
      const onlyB = (await pm.post('/projects', { name: 'B only', category: 'B2C', clientId, workOrderNo: 'WOB', defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 5, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' }, countries: [{ countryCode: 'US', currency: 'USD' }], vendors: [{ vendorId: vendorB, cpi: 3 }] }).expect(201)).body;
      await vendorPortal.get(`/portal/vendor/projects/${onlyB.id}`).expect(404);
    });
  });
});
