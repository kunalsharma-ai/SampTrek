import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '../../src/prisma/client';
import { AiService } from '../../src/ai/ai.service';
import { Http } from '../../src/ai/provider';
import { IntegrationsService } from '../../src/integrations/integrations.service';
import { api, createApp, login, makeOrg, resetDb, saveIntegration } from './helpers';

type Req = { url: string; headers: Record<string, string>; body: Record<string, any> };
type Reply = { status?: number; body: unknown };

/** Every AI provider behind one scripted transport: each call to a host takes that host's next reply. */
function fakeProviders() {
  const calls: Req[] = [];
  const queues: Record<string, Reply[]> = {};
  const host = (url: string) => new URL(url).host;
  const http: Http = async (url, init) => {
    const r: Req = { url, headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(r);
    const next = queues[host(url)]?.shift();
    if (!next) throw new Error(`Unexpected AI call ${url}`);
    return { status: next.status ?? 200, json: async () => next.body, text: async () => JSON.stringify(next.body) };
  };
  const push = (h: string, ...r: Reply[]) => (queues[h] = [...(queues[h] ?? []), ...r]);
  const oaText = (t: string) => ({ body: { choices: [{ message: { role: 'assistant', content: t }, finish_reason: 'stop' }], usage: { prompt_tokens: 50, completion_tokens: 7 } } });
  const oaCall = (name: string, args: object) => ({ body: { choices: [{ message: { role: 'assistant', content: null, tool_calls: [{ id: 'call_1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 40, completion_tokens: 5 } } });
  const claudeCall = (name: string, args: object) => ({ body: { content: [{ type: 'thinking', thinking: '', signature: 'sig-c' }, { type: 'tool_use', id: 'toolu_1', name, input: args }], stop_reason: 'tool_use', usage: { input_tokens: 80, output_tokens: 12 } } });
  const claudeText = (t: string) => ({ body: { content: [{ type: 'text', text: t }], stop_reason: 'end_turn', usage: { input_tokens: 90, output_tokens: 20, cache_read_input_tokens: 10 } } });
  const geminiText = (t: string) => ({ body: { candidates: [{ content: { role: 'model', parts: [{ text: t }] }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 } } });
  return { http, calls, push, oaText, oaCall, claudeCall, claudeText, geminiText, left: () => Object.values(queues).flat().length };
}

const GROQ = 'api.groq.com';
const CLAUDE = 'api.anthropic.com';
const GEMINI = 'generativelanguage.googleapis.com';
const OWN = 'llm.example.test';
const busy = { status: 429, body: { error: { message: 'Rate limit reached for model on tokens per day (TPD)' } } };

describe('AI copilot with several providers (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let svc: AiService;
  let admin: ReturnType<typeof api>;
  let pm: ReturnType<typeof api>;
  let f: ReturnType<typeof fakeProviders>;
  let org: string;
  let token: string;

  beforeAll(async () => {
    ({ app, prisma } = await createApp());
    svc = app.get(AiService);
    await resetDb(prisma);
    const a = await makeOrg(prisma, 'aip');
    org = a.org.id;
    admin = api(app, await login(app, a.users.ADMIN.email));
    token = await login(app, a.users.PROJECT_MANAGER.email);
    pm = api(app, token);
    await prisma.organization.update({ where: { id: org }, data: { aiSettings: { perUserPerMinute: 60 } } });
    await saveIntegration(prisma, org, 'groq', { GROQ_API_KEY: 'gsk-free' });
    await saveIntegration(prisma, org, 'anthropic', { ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_FALLBACK_MODEL: '' });
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(() => {
    f = fakeProviders();
    svc.http = f.http;
    app.get(IntegrationsService).http = async (url, init) => {
      const r = await f.http(url, { method: init?.method ?? 'GET', headers: init?.headers ?? {}, body: init?.body });
      return { status: r.status, text: r.text };
    };
  });
  afterEach(() => expect(f.left()).toBe(0));

  const ask = (message: string, extra: object = {}) => pm.post('/ai/chat', { message, ...extra });

  it('lists the providers in the chosen order, with voice only from Gemini', async () => {
    let s = (await pm.get('/ai/status').expect(200)).body;
    // Default order: Claude comes before Groq.
    expect(s).toMatchObject({ configured: true, provider: 'anthropic', providerLabel: 'Anthropic Claude', model: 'claude-test', liveModel: null });
    expect(s.providers.map((p: { kind: string }) => p.kind)).toEqual(['anthropic', 'groq']);
    expect(s.providers[1]).toMatchObject({ label: 'Groq', model: 'llama-3.3-70b-versatile', fallbackModel: 'llama-3.1-8b-instant', files: [] });
    const settings = (await admin.get('/ai/status').expect(200)).body.settings;
    await admin.put('/ai/settings', { ...settings, providers: ['groq', 'groq'] }).expect(400);
    await admin.put('/ai/settings', { ...settings, providers: ['groq', 'gemini', 'anthropic'] }).expect(200);
    s = (await pm.get('/ai/status').expect(200)).body;
    expect(s.providers.map((p: { kind: string }) => p.kind)).toEqual(['groq', 'anthropic']);
  });

  it('moves to the next provider when a free key runs out, and stays with it for the tool steps', async () => {
    f.push(GROQ, busy, busy);
    f.push(CLAUDE, f.claudeCall('list_projects', {}), f.claudeText('You have no projects yet.'));
    const r = (await ask('List my projects').expect(200)).body;
    expect(r.messages[1].text).toBe('You have no projects yet.');

    const [g1, g2, c1, c2] = f.calls;
    // Groq: main model, then its free fallback model, both OpenAI-style.
    expect(g1.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(g1.headers.Authorization).toBe('Bearer gsk-free');
    expect(g1.body).toMatchObject({ model: 'llama-3.3-70b-versatile', tool_choice: 'auto' });
    expect(g1.body.messages[0]).toMatchObject({ role: 'system' });
    expect(g1.body.tools[0]).toMatchObject({ type: 'function', function: { name: expect.any(String), parameters: { type: 'object' } } });
    expect(g2.body.model).toBe('llama-3.1-8b-instant');
    // Claude: Messages API with tools, then the tool result in the next user turn after its own blocks.
    expect(c1.url).toBe('https://api.anthropic.com/v1/messages');
    expect(c1.headers).toMatchObject({ 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01' });
    expect(c1.body).toMatchObject({ model: 'claude-test', max_tokens: 16000, tool_choice: { type: 'auto' } });
    expect(c1.body.temperature).toBeUndefined();
    expect(c1.body.tools.find((t: { name: string }) => t.name === 'list_projects').input_schema).toMatchObject({ type: 'object' });
    expect(c2.body.messages.at(-2)).toEqual({ role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig-c' }, { type: 'tool_use', id: 'toolu_1', name: 'list_projects', input: {} }] });
    expect(c2.body.messages.at(-1).content[0]).toMatchObject({ type: 'tool_result', tool_use_id: 'toolu_1' });
    expect(f.calls).toHaveLength(4);

    const usage = await prisma.aiUsage.findMany({ where: { organizationId: org }, orderBy: { createdAt: 'asc' } });
    expect(usage.map((u) => [u.provider, u.model, u.kind, u.ok])).toEqual([
      ['groq', 'llama-3.3-70b-versatile', 'chat_tool', false],
      ['groq', 'llama-3.1-8b-instant', 'chat_tool', false],
      ['anthropic', 'claude-test', 'chat', true],
      ['anthropic', 'claude-test', 'chat_tool', true],
    ]);
    expect(usage[0].error).toMatch(/^Groq: Groq is busy or its free allowance is used up/);
    expect(usage[3]).toMatchObject({ promptTokens: 100, outputTokens: 20 });
  });

  it('skips a provider whose key is refused, and reports when every provider fails', async () => {
    f.push(GROQ, { status: 401, body: { error: { message: 'Invalid API Key' } } });
    f.push(CLAUDE, f.claudeText('Hello.'));
    await ask('Hello').expect(200);
    // The refused key is not tried again with the fallback model.
    expect(f.calls.map((c) => new URL(c.url).host)).toEqual([GROQ, CLAUDE]);

    f.push(GROQ, busy, busy);
    f.push(CLAUDE, { status: 529, body: { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } } });
    const r = await ask('Hello again').expect(502);
    expect(r.body.message).toMatch(/Every AI provider set up here failed\. The last one said: Anthropic Claude is unavailable \(529\)/);
  });

  it('reads PDFs only with a provider that can, and keeps text files for every provider', async () => {
    const upload = (name: string, content: string, type: string) => request(app.getHttpServer()).post('/api/v1/ai/documents').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from(content), { filename: name, contentType: type });
    const pdf = (await upload('rfp.pdf', '%PDF-1.4 fake', 'application/pdf').expect(201)).body;
    const txt = (await upload('notes.txt', 'Need 300 completes in FR.', 'text/plain').expect(201)).body;
    f.push(CLAUDE, f.claudeText('The RFP asks for 300 completes.'));
    await ask('What does it ask?', { documentIds: [pdf.id] }).expect(200);
    expect(f.calls).toHaveLength(1); // Groq cannot read PDFs, so it is not asked
    expect(f.calls[0].body.messages.at(-1).content).toEqual(expect.arrayContaining([{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from('%PDF-1.4 fake').toString('base64') }, title: 'rfp.pdf' }]));

    f.push(GROQ, f.oaText('300 completes in France.'));
    await ask('And this?', { documentIds: [txt.id] }).expect(200);
    expect(f.calls[1].body.messages.at(-1).content).toMatch(/\[Attached file: notes.txt\]\nNeed 300 completes in FR\./);

    // Without a provider that reads PDFs the person is told which ones do.
    await prisma.integrationSetting.deleteMany({ where: { organizationId: org, kind: 'anthropic' } });
    expect((await ask('Again', { documentIds: [pdf.id] }).expect(503)).body.message).toMatch(/Gemini, Claude and OpenAI read PDFs/);
    await saveIntegration(prisma, org, 'anthropic', { ANTHROPIC_API_KEY: 'sk-ant-test', ANTHROPIC_MODEL: 'claude-test', ANTHROPIC_FALLBACK_MODEL: '' });
  });

  it('uses the browser for voice without Gemini, and Gemini Live once it is added', async () => {
    expect((await pm.post('/ai/voice/session', { path: '/' }).expect(502)).body).toMatchObject({ fallback: 'browser', message: expect.stringMatching(/Live voice needs Google Gemini/) });
    const send = () => request(app.getHttpServer()).post('/api/v1/ai/voice/transcribe').set('Authorization', `Bearer ${token}`).attach('audio', Buffer.from('RIFF....WAVE'), { filename: 'q.wav', contentType: 'audio/wav' });
    expect((await send().expect(503)).body.message).toMatch(/Writing down speech needs Google Gemini/);

    await saveIntegration(prisma, org, 'gemini', { GEMINI_API_KEY: 'gem-free' });
    expect((await pm.get('/ai/status').expect(200)).body.liveModel).toBe('gemini-3.8-live');
    // Speech goes to Gemini even though Groq is first in the order.
    f.push(GEMINI, f.geminiText('How many completes today?'));
    expect((await send().expect(200)).body.text).toBe('How many completes today?');
    expect(f.calls[0].url).toContain('/models/gemini-3.8-flash:generateContent');
    await prisma.integrationSetting.deleteMany({ where: { organizationId: org, kind: 'gemini' } });
  });

  it('reads a brief with an own OpenAI-compatible server (no key) and asks for the brief tool by name', async () => {
    await saveIntegration(prisma, org, 'openai_compatible', { AI_COMPAT_NAME: 'Ollama', AI_COMPAT_URL: `http://${OWN}:11434/v1/`, AI_COMPAT_MODEL: 'llama3.1' });
    const settings = (await admin.get('/ai/status').expect(200)).body.settings;
    await admin.put('/ai/settings', { ...settings, providers: ['openai_compatible', 'groq', 'anthropic'] }).expect(200);
    f.push(`${OWN}:11434`, f.oaCall('project_brief', { projectName: 'Pet food study', summary: 'Usage and attitudes.', countries: [{ countryCode: 'US', targetCompletes: 500 }], missing: [] }));
    const r = (await pm.post('/ai/brief', { text: 'Hi team, we need 500 completes of US dog owners for a pet food study. LOI tbc.' }).expect(201)).body;
    expect(r.draftId).toBeTruthy();
    const c = f.calls[0];
    expect(c.url).toBe(`http://${OWN}:11434/v1/chat/completions`);
    expect(c.headers.Authorization).toBeUndefined();
    expect(c.body).toMatchObject({ model: 'llama3.1', temperature: 0, tool_choice: { type: 'function', function: { name: 'project_brief' } } });
    expect((await pm.get('/ai/status').expect(200)).body.providers[0]).toMatchObject({ kind: 'openai_compatible', label: 'Ollama' });
    await admin.put('/ai/settings', { ...settings, providers: undefined }).expect(200);
  });

  it('tests a key by listing the provider’s models', async () => {
    f.push(GROQ, { body: { data: [{ id: 'llama-3.3-70b-versatile' }, { id: 'llama-3.1-8b-instant' }] } });
    const ok = (await admin.post('/integrations/settings/groq/test').expect(200)).body;
    expect(ok).toMatchObject({ ok: true, message: 'Groq answered. llama-3.3-70b-versatile is available.' });
    expect(f.calls[0]).toMatchObject({ url: 'https://api.groq.com/openai/v1/models', headers: { Authorization: 'Bearer gsk-free' } });

    f.push(CLAUDE, { body: { data: [{ id: 'claude-other' }] } });
    const bad = (await admin.post('/integrations/settings/anthropic/test').expect(200)).body;
    expect(bad.ok).toBe(false);
    expect(bad.message).toMatch(/not available to it: claude-test\. For example: claude-other/);
    expect(f.calls[1]).toMatchObject({ url: 'https://api.anthropic.com/v1/models?limit=1000', headers: { 'x-api-key': 'sk-ant-test', 'anthropic-version': '2023-06-01' } });

    f.push(GROQ, { status: 401, body: { error: { message: 'Invalid API Key' } } });
    expect((await admin.post('/integrations/settings/groq/test').expect(200)).body.message).toBe('Groq did not accept the API key: Invalid API Key');
  });

  it('saves keys encrypted from the screen and shows every AI provider card', async () => {
    const list = (await admin.get('/integrations/settings').expect(200)).body.integrations;
    expect(list.filter((i: { group: string }) => i.group === 'AI').map((i: { kind: string }) => i.kind)).toEqual(['gemini', 'anthropic', 'openai', 'groq', 'openrouter', 'mistral', 'deepseek', 'openai_compatible']);
    await admin.put('/integrations/settings/openai', { values: {} }).expect(400);
    await admin.put('/integrations/settings/openai', { values: { OPENAI_API_KEY: 'sk-openai-secret' } }).expect(200);
    const row = await prisma.integrationSetting.findFirstOrThrow({ where: { organizationId: org, kind: 'openai' } });
    expect(row.secrets).not.toContain('sk-openai-secret');
    const card = (await admin.get('/integrations/settings').expect(200)).body.integrations.find((i: { kind: string }) => i.kind === 'openai');
    expect(card).toMatchObject({ status: { state: 'connected' }, secretsSet: { OPENAI_API_KEY: true }, values: { OPENAI_MODEL: 'gpt-5-mini' } });
    expect(JSON.stringify(card)).not.toContain('sk-openai-secret');

    // OpenAI's own models keep the default temperature.
    const settings = (await admin.get('/ai/status').expect(200)).body.settings;
    await admin.put('/ai/settings', { ...settings, providers: ['openai'] }).expect(200);
    f.push('api.openai.com', f.oaText('Hi.'));
    await ask('Hi').expect(200);
    expect(f.calls[0].body.model).toBe('gpt-5-mini');
    expect(f.calls[0].body.temperature).toBeUndefined();
    await admin.delete('/integrations/settings/openai').expect(200);
  });
});
