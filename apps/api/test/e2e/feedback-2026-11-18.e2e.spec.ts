import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../../src/prisma/client';
import { api, createApp, login, makeOrg, PASSWORD, resetDb } from './helpers';

/** Feedback of 2026-11-18: vendor hold/remove, one open survey per IP, prefixes, hidden payout, client report, invoice design. */
describe('Feedback 2026-11-18 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let admin: ReturnType<typeof api>;
  let pm: ReturnType<typeof api>;
  let viewer: ReturnType<typeof api>;
  let clientId: string;
  let vendorA: string;
  let vendorB: string;
  let n = 0;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    const a = await makeOrg(prisma, 'fb1118');
    admin = api(app, await login(app, a.users.ADMIN.email));
    pm = api(app, await login(app, a.users.PROJECT_MANAGER.email));
    viewer = api(app, await login(app, a.users.VIEWER.email));
    clientId = (await pm.post('/clients', { name: 'Report Client', code: 'RPC' }).expect(201)).body.id;
    vendorA = (await pm.post('/vendors', { name: 'Vendor A', code: 'VA' }).expect(201)).body.id;
    vendorB = (await pm.post('/vendors', { name: 'Vendor B', code: 'VB' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function liveProject(security: object = {}) {
    const p = (
      await pm
        .post('/projects', {
          name: `Feedback study ${++n}`, category: 'B2C', clientId, workOrderNo: `WO${n}`, security,
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

  it('puts a vendor on hold, makes it inactive and back, for every market', async () => {
    const { p, alloc } = await liveProject();
    await viewer.put(`/projects/${p.id}/vendors/${vendorA}/status`, { status: 'PAUSED' }).expect(403);
    await pm.put(`/projects/${p.id}/vendors/${vendorA}/status`, { status: 'SLEEPING' }).expect(400);
    await pm.put(`/projects/${p.id}/vendors/nope/status`, { status: 'PAUSED' }).expect(404);
    await pm.put(`/projects/${p.id}/vendors/${vendorA}/status`, { status: 'PAUSED' }).expect(200);
    expect((await prisma.vendorAllocation.findUniqueOrThrow({ where: { id: alloc(vendorA).id } })).status).toBe('PAUSED');
    expect((await prisma.vendorAllocation.findUniqueOrThrow({ where: { id: alloc(vendorB).id } })).status).toBe('ACTIVE');
    await pm.put(`/projects/${p.id}/vendors/${vendorA}/status`, { status: 'CLOSED' }).expect(200);
    await pm.put(`/projects/${p.id}/vendors/${vendorA}/status`, { status: 'ACTIVE' }).expect(200);
    expect((await prisma.vendorAllocation.findUniqueOrThrow({ where: { id: alloc(vendorA).id } })).status).toBe('ACTIVE');
  });

  it('removes a vendor added by mistake, but not one with real respondents', async () => {
    const { p, alloc } = await liveProject();
    // A test run only: it goes with the vendor.
    await http().get(`/s/${alloc(vendorB).testEntryCode}`).set('X-Forwarded-For', '198.51.100.10').expect(302);
    await pm.post(`/projects/${p.id}/unique-links`, { allocationId: alloc(vendorB).id, count: 3 }).expect(201);
    await viewer.delete(`/projects/${p.id}/vendors/${vendorB}`).expect(403);
    await pm.delete(`/projects/${p.id}/vendors/${vendorB}`).expect(200);
    expect(await prisma.vendorAllocation.count({ where: { id: alloc(vendorB).id } })).toBe(0);
    expect(await prisma.uniqueLink.count({ where: { projectId: p.id } })).toBe(0);
    expect(await prisma.respondentSession.count({ where: { vendorAllocationId: alloc(vendorB).id } })).toBe(0);

    await http().get(`/s/${alloc(vendorA).entryCode}?vid=R1`).set('X-Forwarded-For', '198.51.100.11').expect(302);
    const res = await pm.delete(`/projects/${p.id}/vendors/${vendorA}`).expect(400);
    expect(res.body.code).toBe('VENDOR_HAS_RESPONDENTS');
  });

  it('lets one IP open the survey again once "One open survey per IP" is off', async () => {
    const on = await liveProject({ duplicateDetection: false });
    expect((await pm.get(`/projects/${on.p.id}`).expect(200)).body.security.oneOpenPerIp).toBe(true);
    const code = on.alloc(vendorA).entryCode;
    await http().get(`/s/${code}?vid=A1`).set('X-Forwarded-For', '198.51.100.20').expect(302);
    const again = await http().get(`/s/${code}?vid=A2`).set('X-Forwarded-For', '198.51.100.20').expect(302);
    expect(again.headers.location).not.toContain('client.example.com');

    const off = await liveProject({ duplicateDetection: false, oneOpenPerIp: false });
    const code2 = off.alloc(vendorA).entryCode;
    await http().get(`/s/${code2}?vid=B1`).set('X-Forwarded-For', '198.51.100.21').expect(302);
    const second = await http().get(`/s/${code2}?vid=B2`).set('X-Forwarded-For', '198.51.100.21').expect(302);
    expect(second.headers.location).toContain('client.example.com');
  });

  it('adds a prefix to unique link keys and filters and exports by it', async () => {
    const { p, alloc } = await liveProject();
    const a = alloc(vendorA).id;
    await pm.post(`/projects/${p.id}/unique-links`, { allocationId: a, count: 2, prefix: 'bad prefix!' }).expect(400);
    await pm.post(`/projects/${p.id}/unique-links`, { allocationId: a, count: 4, prefix: 'pretest' }).expect(201);
    await pm.post(`/projects/${p.id}/unique-links`, { allocationId: a, count: 3, prefix: '78-' }).expect(201);
    await pm.post(`/projects/${p.id}/unique-links`, { allocationId: a, count: 2 }).expect(201);
    const keys = (await prisma.uniqueLink.findMany({ where: { projectId: p.id }, select: { key: true } })).map((k) => k.key);
    expect(keys.filter((k) => k.startsWith('pretest-'))).toHaveLength(4);
    expect(keys.filter((k) => k.startsWith('78-'))).toHaveLength(3);
    const summary = (await pm.get(`/projects/${p.id}/unique-links/summary`).expect(200)).body;
    expect(summary.batches.map((b: { prefix: string | null }) => b.prefix).sort()).toEqual(['78-', 'pretest-', null].sort());
    const csv = await pm.get(`/projects/${p.id}/unique-links/export.csv?prefix=pretest-`).expect(200);
    expect(csv.text.trim().split('\r\n')).toHaveLength(5);
    // The prefixed key opens like any other.
    const key = keys.find((k) => k.startsWith('78-'))!;
    expect((await http().get(`/u/${key}`).set('X-Forwarded-For', '198.51.100.30').expect(302)).headers.location).toContain('client.example.com');
  });

  it('hides CPI and payout from a vendor login when asked', async () => {
    await liveProject();
    await pm.post('/portal-users', { kind: 'vendor', partyId: vendorA, name: 'A user', email: 'a@vendor.example.com', password: PASSWORD }).expect(201);
    const v = api(app, await login(app, 'a@vendor.example.com'));
    expect((await v.get('/portal/vendor/summary').expect(200)).body.hidePayout).toBe(false);
    expect((await v.get('/portal/vendor/allocations').expect(200)).body[0].cpi).not.toBeNull();
    await pm.patch(`/vendors/${vendorA}`, { portalHidePayout: true }).expect(200);
    const s = (await v.get('/portal/vendor/summary').expect(200)).body;
    expect(s.hidePayout).toBe(true);
    expect(s.payout.approved.payout).toBeNull();
    expect((await v.get('/portal/vendor/allocations').expect(200)).body.every((x: { cpi: unknown }) => x.cpi === null)).toBe(true);
    await pm.patch(`/vendors/${vendorA}`, { portalHidePayout: false }).expect(200);
  });

  it('reports every project of a client, and all respondents of a project by outcome', async () => {
    const { p, alloc } = await liveProject();
    const res = await http().get(`/s/${alloc(vendorA).entryCode}?vid=C1`).set('X-Forwarded-For', '198.51.100.40').expect(302);
    const rid = new URL(res.headers.location).searchParams.get('rid')!;
    await http().get(`/r/complete?token=${rid}`).expect(302);
    await http().get(`/s/${alloc(vendorB).entryCode}?vid=C2`).set('X-Forwarded-For', '198.51.100.41').expect(302);

    const r = (await viewer.get(`/clients/${clientId}/projects-report`).expect(200)).body;
    expect(r.client.id).toBe(clientId);
    const row = r.rows.find((x: { id: string }) => x.id === p.id);
    expect(row).toMatchObject({ projectCode: p.projectCode, workOrderNo: p.workOrderNo, completes: 1, currency: 'USD' });
    expect(row.month).toMatch(/^\d{4}-\d{2}$/);
    expect(r.totals[0].currency).toBe('USD');

    const all = (await pm.get(`/projects/${p.id}/report`).expect(200)).body;
    expect(all.vendor.name).toBe('All vendors');
    expect(all.total).toBe(2);
    const done = (await pm.get(`/projects/${p.id}/report?status=COMPLETE`).expect(200)).body;
    expect(done.total).toBe(1);
    expect(done.rows[0].vendor).toContain('Vendor A');
  });

  it('saves the invoice design (template, renamed fields, custom fields) and previews it as PDF', async () => {
    const d = (await pm.get('/organization/invoice-design').expect(200)).body;
    expect(d.templates.length).toBeGreaterThanOrEqual(5);
    await pm.put('/organization/invoice-design', { template: 'modern' }).expect(403);
    await admin.put('/organization/invoice-design', { template: 'nope' }).expect(400);
    await admin.put('/organization/invoice-design', { signatureImage: 'data:text/html;base64,AAAA' }).expect(400);
    const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    const saved = (
      await admin
        .put('/organization/invoice-design', {
          template: 'modern', accentColor: '#0f766e', labels: { title: 'Tax invoice' }, hidden: ['market'],
          customFields: [{ label: 'Vendor code', value: 'V-778' }], signatureImage: png, stampImage: png, signatoryName: 'A. Signer', signatoryTitle: 'Director',
        })
        .expect(200)
    ).body;
    expect(saved.design).toMatchObject({ template: 'modern', labels: { title: 'Tax invoice' }, hidden: ['market'] });
    const pdf = await admin.post('/organization/invoice-design/preview', { template: 'bold' }).buffer(true).parse((res, cb) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(201);
    expect(pdf.headers['content-type']).toMatch(/pdf/);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
  });
});
