import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../../src/prisma/client';
import { api, createApp, login, makeOrg, resetDb } from './helpers';

/** Feedback of 2026-11-16: editable client, {uid} in survey links, test links, vendor title, unique link markets. */
describe('Feedback 2026-11-16: project setup (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let pm: ReturnType<typeof api>;
  let clientA: string;
  let clientB: string;
  let vendor: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    await resetDb(prisma);
    const a = await makeOrg(prisma, 'fb1116');
    pm = api(app, await login(app, a.users.PROJECT_MANAGER.email));
    clientA = (await pm.post('/clients', { name: 'Right Client', code: 'RC', contacts: [{ name: 'R', email: 'r@client.example.com' }] }).expect(201)).body.id;
    clientB = (await pm.post('/clients', { name: 'Wrong Client', code: 'WC', contacts: [{ name: 'W', email: 'w@client.example.com' }] }).expect(201)).body.id;
    vendor = (await pm.post('/vendors', { name: 'FC', code: 'FC' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const project = (o: object = {}) =>
    pm.post('/projects', {
      name: 'FR9128 Healthcare Professionals Japan',
      category: 'Healthcare',
      clientId: clientB,
      workOrderNo: 'FR9128',
      defaults: { language: 'ja', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?sid=10028&rid={uid}' },
      countries: [
        { countryCode: 'JP', targetGroup: 'Economic' },
        { countryCode: 'JP', targetGroup: 'Surgeon' },
      ],
      vendors: [{ vendorId: vendor, cpi: 4 }],
      ...o,
    });

  it('refuses a client survey link without the {uid} variable', async () => {
    const res = await project({ defaults: { language: 'ja', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?sid=10028&rid=XXXX' } }).expect(400);
    expect(JSON.stringify(res.body)).toContain('{uid}');
    const p = (await project().expect(201)).body;
    await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}`, { liveSurveyUrl: 'https://client.example.com/s?rid=XXXX' }).expect(400);
    await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}`, { liveSurveyUrl: 'https://client.example.com/s?rid={session_token}' }).expect(200);
  });

  it('fills {uid} with the respondent UID when sending them to the client survey', async () => {
    const p = (await project({ workOrderNo: 'FR9129' }).expect(201)).body;
    const c = p.countries[0];
    await pm.patch(`/projects/${p.id}/countries/${c.id}`, { status: 'LIVE' }).expect(200);
    await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
    const res = await http().get(`/s/${c.allocations[0].entryCode}?vid=R-1`).set('X-Forwarded-For', '198.51.100.40').expect(302);
    const url = new URL(res.headers.location);
    expect(url.searchParams.get('rid')).toMatch(/\S{8,}/);
    expect(url.searchParams.get('rid')).not.toBe('{uid}');
    expect(url.searchParams.has('token')).toBe(false);
  });

  it('lets the client, category and project manager be changed after creation', async () => {
    const p = (await project({ workOrderNo: 'FR9130' }).expect(201)).body;
    const contact = p.client.contacts[0].id;
    await pm.patch(`/projects/${p.id}`, { clientContactId: contact }).expect(200);
    const after = (await pm.patch(`/projects/${p.id}`, { clientId: clientA, category: 'B2B' }).expect(200)).body;
    expect(after.client.id).toBe(clientA);
    expect(after.category).toBe('B2B');
    expect(after.clientContactId).toBeNull();
    await pm.patch(`/projects/${p.id}`, { clientId: 'nope' }).expect(400);
    await pm.patch(`/projects/${p.id}`, { projectManagerId: 'nope' }).expect(400);
  });

  it('opens a test link copied with [UID] still in it', async () => {
    const p = (await project({ workOrderNo: 'FR9131' }).expect(201)).body;
    const a = p.countries[0].allocations[0];
    const res = await http().get(`/s/${a.testEntryCode}?vid=[UID]`).set('X-Forwarded-For', '198.51.100.41').expect(302);
    expect(res.headers.location).not.toContain('SECURITY_REJECT');
    const s = await prisma.respondentSession.findFirst({ where: { vendorAllocationId: a.id, isTest: true } });
    expect(s?.vendorRespondentId).toMatch(/^TEST-/);
    // The live link still needs the vendor's respondent ID.
    expect((await http().get(`/s/${a.entryCode}?vid=[UID]`).expect(302)).headers.location).toMatch(/security/i);
  });

  it('shows vendors "Survey <work order> · <project ID>" by default', async () => {
    const p = (await project({ workOrderNo: 'FR9132' }).expect(201)).body;
    const { vendorProjectName } = await import('../../src/common/vendor-safe');
    expect(vendorProjectName({ projectCode: p.projectCode, workOrderNo: 'FR9132' })).toBe(`Survey FR9132 · ${p.projectCode}`);
    expect(vendorProjectName({ projectCode: p.projectCode, workOrderNo: null })).toBe(`Survey ${p.projectCode}`);
  });

  it('names each unique link market with its target group', async () => {
    const p = (await project({ workOrderNo: 'FR9133' }).expect(201)).body;
    const summary = (await pm.get(`/projects/${p.id}/unique-links/summary`).expect(200)).body;
    expect(summary.allocations.map((a: { projectCountry: { targetGroup: string } }) => a.projectCountry.targetGroup).sort()).toEqual(['Economic', 'Surgeon']);
  });
});
