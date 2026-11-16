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

describe('Feedback 2026-11-16: security per vendor and per system (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let pm: ReturnType<typeof api>;
  let clientId: string;
  let loose: string;
  let strict: string;
  const http = () => request(app.getHttpServer());
  const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 Version/17.5 Safari/605.1.15';

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const a = await makeOrg(prisma, 'fb1116sec');
    pm = api(app, await login(app, a.users.PROJECT_MANAGER.email));
    clientId = (await pm.post('/clients', { name: 'Sec Client', code: 'SC' }).expect(201)).body.id;
    loose = (await pm.post('/vendors', { name: 'Loose', code: 'LO', securityOverrides: { duplicateDetection: false } }).expect(201)).body.id;
    strict = (await pm.post('/vendors', { name: 'Strict', code: 'ST' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function liveProject(devices?: object) {
    const p = (
      await pm
        .post('/projects', {
          name: 'Per vendor security', category: 'B2C', clientId,
          security: { duplicateDetection: true },
          ...(devices ? { devices } : {}),
          defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' },
          countries: [{ countryCode: 'US' }],
          vendors: [{ vendorId: loose, cpi: 4 }, { vendorId: strict, cpi: 4 }],
        })
        .expect(201)
    ).body;
    await pm.patch(`/projects/${p.id}/countries/${p.countries[0].id}`, { status: 'LIVE' }).expect(200);
    await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
    const code = (v: string) => p.countries[0].allocations.find((x: { vendorId: string }) => x.vendorId === v).entryCode;
    return { p, code };
  }
  const status = async (uid: string) => (await prisma.respondentSession.findFirst({ where: { vendorRespondentId: uid } }))?.status;

  it('lets a vendor skip duplicate detection, and lets the project set it back for that vendor', async () => {
    const { p, code } = await liveProject();
    const enter = (v: string, uid: string) => http().get(`/s/${code(v)}?vid=${uid}`).set('User-Agent', MAC).set('X-Forwarded-For', '203.0.113.9').expect(302);
    // Finished sessions (an open one from the same IP is always blocked, see below).
    const finish = (uid: string) => prisma.respondentSession.updateMany({ where: { vendorRespondentId: uid }, data: { status: 'TERMINATE' } });
    await enter(loose, 'L1');
    await finish('L1');
    await enter(loose, 'L2');
    expect(await status('L2')).toBe('STARTED');
    await finish('L2');
    await enter(strict, 'S1');
    expect(await status('S1')).toBe('DUPLICATE');

    await pm.put(`/projects/${p.id}/vendors/${loose}/security`, { overrides: { duplicateDetection: true } }).expect(200);
    await enter(loose, 'L3');
    expect(await status('L3')).toBe('DUPLICATE');
    await pm.put(`/projects/${p.id}/vendors/${loose}/security`, { overrides: { nonsense: true } }).expect(400);
  });

  it('always blocks a second open session from the same IP on live links, even with duplicate detection off', async () => {
    const { p } = await liveProject();
    const a = p.countries[0].allocations.find((x: { vendorId: string }) => x.vendorId === loose);
    const enter = (code: string, uid: string, ip: string, extra = '') => http().get(`/s/${code}?vid=${uid}${extra}`).set('User-Agent', MAC).set('X-Forwarded-For', ip).expect(302);
    await enter(a.entryCode, 'TAB1', '203.0.113.20');
    expect(await status('TAB1')).toBe('STARTED');
    // Second tab, same IP, duplicate detection off for this vendor: blocked while the first is open.
    await enter(a.entryCode, 'TAB2', '203.0.113.20');
    const tab2 = await prisma.respondentSession.findFirst({ where: { vendorRespondentId: 'TAB2' } });
    expect(tab2).toMatchObject({ status: 'DUPLICATE', statusDetail: 'SAME_IP_OPEN' });
    // Another IP is fine.
    await enter(a.entryCode, 'OTHER1', '203.0.113.21');
    expect(await status('OTHER1')).toBe('STARTED');
    // Test links are never blocked, and test=1 on a live link does not make it a test.
    await enter(a.testEntryCode, 'QA1', '203.0.113.20', '&test=1');
    expect(await prisma.respondentSession.findFirst({ where: { vendorRespondentId: 'QA1' } })).toMatchObject({ isTest: true, status: 'STARTED' });
    await enter(a.entryCode, 'TAB3', '203.0.113.20', '&test=1');
    expect(await prisma.respondentSession.findFirst({ where: { vendorRespondentId: 'TAB3' } })).toMatchObject({ isTest: false, status: 'DUPLICATE' });
    // Once the first session ends, the same IP may come in again (duplicate detection is off for this vendor).
    await prisma.respondentSession.updateMany({ where: { vendorRespondentId: 'TAB1' }, data: { status: 'COMPLETE' } });
    await enter(a.entryCode, 'TAB4', '203.0.113.20');
    expect(await status('TAB4')).toBe('STARTED');
  });

  it('marks test links with test=1 so they look different from live links', async () => {
    const { p } = await liveProject();
    const links = (await pm.get(`/projects/${p.id}`).expect(200)).body.countries[0].allocations[0];
    expect(links.testEntryLink).toContain('&test=1');
    expect(links.entryLink).not.toContain('test=1');
  });

  it('blocks a desktop system that is unticked, unless device limits are off for the vendor', async () => {
    const { p, code } = await liveProject({ desktop: true, mobile: true, tablet: true, mac: false });
    await http().get(`/s/${code(strict)}?vid=M1`).set('User-Agent', MAC).set('X-Forwarded-For', '203.0.113.20').expect(302);
    expect(await prisma.respondentSession.findFirst({ where: { vendorRespondentId: 'M1' } })).toMatchObject({ status: 'SECURITY_REJECT', statusDetail: 'OS_NOT_ALLOWED' });
    await pm.put(`/projects/${p.id}/vendors/${strict}/security`, { overrides: { deviceLimits: false } }).expect(200);
    await http().get(`/s/${code(strict)}?vid=M2`).set('User-Agent', MAC).set('X-Forwarded-For', '203.0.113.21').expect(302);
    expect(await status('M2')).toBe('STARTED');
  });
});

describe('Feedback 2026-11-16: vendor setup and report (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let pm: ReturnType<typeof api>;
  let clientId: string;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    const a = await makeOrg(prisma, 'fb1116vend');
    pm = api(app, await login(app, a.users.PROJECT_MANAGER.email));
    clientId = (await pm.post('/clients', { name: 'Vend Client', code: 'VC' }).expect(201)).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  const create = (o: object = {}) =>
    pm.post('/projects', {
      name: 'Vendor setup', category: 'B2C', clientId,
      security: { gateSurvey: true },
      gateQuestions: [{ id: 'age', type: 'number', text: 'How old are you?', validation: { min: 1, max: 120, integer: true } }],
      defaults: { language: 'en', loiMinutes: 10, irPercent: 50, cpi: 10, targetCompletes: 50, liveSurveyUrl: 'https://client.example.com/s?rid={uid}' },
      countries: [{ countryCode: 'US' }, { countryCode: 'GB', cpi: 20 }],
      ...o,
    });

  it('needs a payout share to auto assign, and adds auto-assigned vendors paid their share', async () => {
    await pm.post('/vendors', { name: 'No share', code: 'NS', autoAssign: true }).expect(400);
    const fc = (await pm.post('/vendors', { name: 'FC', code: 'FC', payoutSharePercent: 60, autoAssign: true, uidParam: 'vid', uidMacro: '{TID}' }).expect(201)).body;
    expect(fc).toMatchObject({ payoutSharePercent: 60, autoAssign: true, uidMacro: '{TID}' });
    await pm.patch(`/vendors/${fc.id}`, { payoutSharePercent: null }).expect(400);
    await pm.patch(`/vendors/${fc.id}`, { uidMacro: 'TID' }).expect(400);

    const p = (await create().expect(201)).body;
    const us = p.countries.find((c: { countryCode: string }) => c.countryCode === 'US');
    const gb = p.countries.find((c: { countryCode: string }) => c.countryCode === 'GB');
    expect(Number(us.allocations[0].cpi)).toBe(6);
    expect(Number(gb.allocations[0].cpi)).toBe(12);
    expect(us.allocations[0].entryLink).toMatch(/\?vid=\{TID\}$/);

    // The web form lists the vendors itself and turns the server-side auto assign off.
    const q = (await create({ autoAssignVendors: false }).expect(201)).body;
    expect(q.countries[0].allocations).toHaveLength(0);
    // Added by hand without a payout: the share fills it.
    const a = (await pm.post(`/projects/${q.id}/countries/${q.countries[0].id}/allocations`, { vendorId: fc.id, targetCompletes: 10 }).expect(201)).body;
    expect(a).toMatchObject({ uidParam: 'vid' });
    expect(Number(a.cpi)).toBeGreaterThan(0);
    const other = (await pm.post('/vendors', { name: 'Manual', code: 'MA' }).expect(201)).body.id;
    await pm.post(`/projects/${q.id}/countries/${q.countries[0].id}/allocations`, { vendorId: other, targetCompletes: 10 }).expect(400);
    await pm.patch(`/vendors/${fc.id}`, { autoAssign: false }).expect(200);
  });

  const us = (p: { countries: { countryCode: string }[] }) => p.countries.find((c) => c.countryCode === 'US') as unknown as { id: string; allocations: { entryCode: string }[] };

  it('treats an unfilled {TID} as no respondent ID', async () => {
    const fcId = (await prisma.vendor.findFirst({ where: { code: 'FC', organization: { slug: 'fb1116vend' } } }))!.id;
    const p = (await create({ vendors: [{ vendorId: fcId }] }).expect(201)).body;
    const fc = us(p).allocations[0];
    await pm.patch(`/projects/${p.id}/countries/${us(p).id}`, { status: 'LIVE' }).expect(200);
    await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
    expect((await http().get(`/s/${fc.entryCode}?vid={TID}`).expect(302)).headers.location).toMatch(/security/i);
  });

  it('reports one vendor’s respondents with paging, search and gate answers', async () => {
    const fcId = (await prisma.vendor.findFirst({ where: { code: 'FC', organization: { slug: 'fb1116vend' } } }))!.id;
    const p = (await create({ vendors: [{ vendorId: fcId, cpi: 3 }] }).expect(201)).body;
    const c = us(p);
    await pm.patch(`/projects/${p.id}/countries/${c.id}`, { status: 'LIVE' }).expect(200);
    await pm.patch(`/projects/${p.id}`, { status: 'LIVE' }).expect(200);
    for (let i = 1; i <= 12; i++) await http().get(`/s/${c.allocations[0].entryCode}?vid=R${i}`).set('X-Forwarded-For', `198.51.100.${60 + i}`).expect(302);
    const s = await prisma.respondentSession.findFirst({ where: { projectId: p.id, vendorRespondentId: 'R1' } });
    await prisma.respondentSession.update({ where: { id: s!.id }, data: { answers: { gate: { age: { value: 34, label: '34' } } } } });

    const page1 = (await pm.get(`/projects/${p.id}/vendors/${fcId}/report?take=10`).expect(200)).body;
    expect(page1.total).toBe(12);
    expect(page1.rows).toHaveLength(10);
    expect(page1.gateQuestions).toEqual([{ id: 'age', text: 'How old are you?' }]);
    expect(page1.rows[0]).toEqual(expect.objectContaining({ vendor: 'FC (FC)', country: 'US', status: 'STARTED' }));
    expect(page1.rows[0].ipId).toMatch(/^[0-9a-f]{10}$/);
    const page2 = (await pm.get(`/projects/${p.id}/vendors/${fcId}/report?take=10&skip=10`).expect(200)).body;
    expect(page2.rows).toHaveLength(2);
    const found = (await pm.get(`/projects/${p.id}/vendors/${fcId}/report?q=R1`).expect(200)).body;
    expect(found.rows.map((r: { respondentId: string }) => r.respondentId).sort()).toEqual(['R1', 'R10', 'R11', 'R12']);
    expect(found.rows.find((r: { respondentId: string }) => r.respondentId === 'R1').gate).toEqual({ age: '34' });
    expect((await pm.get(`/projects/${p.id}/vendors/${fcId}/report?all=true`).expect(200)).body.rows).toHaveLength(12);
    await pm.get(`/projects/${p.id}/vendors/${fcId}/report?take=500`).expect(400);
  });

  it('shows each vendor’s expense on the Vendors page', async () => {
    const fcId = (await prisma.vendor.findFirst({ where: { code: 'FC', organization: { slug: 'fb1116vend' } } }))!.id;
    const s = await prisma.respondentSession.findFirst({ where: { vendorAllocation: { vendorId: fcId }, isTest: false } });
    await prisma.respondentSession.update({ where: { id: s!.id }, data: { status: 'COMPLETE', payout: 3, outcomeAt: new Date() } });
    const scores = (await pm.get('/vendors/scores').expect(200)).body;
    expect(scores.vendors.find((v: { id: string }) => v.id === fcId).expense).toEqual({ USD: 3 });
  });
});
