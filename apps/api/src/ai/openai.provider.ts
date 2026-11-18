import { createHash, randomUUID } from 'crypto';
import { AiConfig } from '../common/config';
import { AiProvider, AiProviderError, GenerateRequest, GenerateResult, Http, Message } from './provider';

/**
 * Every provider with an OpenAI-style chat completions API: OpenAI, Groq, OpenRouter, Mistral,
 * DeepSeek, and a server of your own (Ollama, LM Studio, vLLM). Function calling for tools.
 */

type OaPart = { type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } } | { type: 'file'; file: { filename: string; file_data: string } };
type OaMsg =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | OaPart[] }
  | { role: 'assistant'; content: string | null; tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[] }
  | { role: 'tool'; tool_call_id: string; content: string };

/** Turns the HTTP status of any AI provider into the error the copilot understands. */
export function providerError(label: string, status: number, detail: string | undefined): AiProviderError {
  const d = detail ? `: ${detail.slice(0, 300)}` : '';
  if (status === 429) return new AiProviderError(`${label} is busy or its free allowance is used up${d}`, 'rate_limited', 429);
  if (status === 401 || status === 403) return new AiProviderError(`${label} did not accept the API key. An admin should check it in Settings → Integrations → AI${d}`, 'auth', status);
  if (status === 402) return new AiProviderError(`${label} has no credit left on this key${d}`, 'rate_limited', 402);
  if (status === 400 || status === 404 || status === 413 || status === 422) return new AiProviderError(`${label} refused the request${d}`, 'bad_request', status);
  return new AiProviderError(`${label} is unavailable (${status}). Try again shortly.`, 'unavailable', status);
}

export async function postJson(http: Http, label: string, url: string, headers: Record<string, string>, body: unknown, timeoutMs = 90_000): Promise<Record<string, unknown>> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await http(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: ctl.signal });
    const j = (await res.json().catch(() => null)) as { error?: { message?: string } | string; message?: string } | null;
    if (res.status >= 400 || !j) {
      const msg = typeof j?.error === 'string' ? j.error : j?.error?.message ?? j?.message;
      throw providerError(label, res.status >= 400 ? res.status : 502, msg);
    }
    return j as Record<string, unknown>;
  } catch (e) {
    if (e instanceof AiProviderError) throw e;
    throw new AiProviderError((e as Error).name === 'AbortError' ? `${label} took too long to answer.` : `${label} could not be reached.`, 'unavailable');
  } finally {
    clearTimeout(t);
  }
}

export class OpenAiProvider implements AiProvider {
  readonly id: string;
  constructor(
    private readonly c: AiConfig,
    private readonly http: Http,
  ) {
    this.id = c.provider;
  }

  /** Mistral accepts only 9-character letter/digit tool call ids; others take what they gave. */
  private callId(id: string) {
    if (this.c.provider !== 'mistral' || /^[a-zA-Z0-9]{9}$/.test(id)) return id;
    return createHash('sha256').update(id).digest('base64').replace(/[^a-zA-Z0-9]/g, '').slice(0, 9);
  }

  toMessages(system: string, messages: Message[]): OaMsg[] {
    const out: OaMsg[] = [{ role: 'system', content: system }];
    for (const m of messages) {
      if (m.role === 'assistant') {
        const text = m.parts.map((p) => ('text' in p ? p.text : '')).join('');
        const calls = m.parts.flatMap((p) => ('call' in p ? [{ id: this.callId(p.call.id), type: 'function' as const, function: { name: p.call.name, arguments: JSON.stringify(p.call.args ?? {}) } }] : []));
        if (text || calls.length) out.push({ role: 'assistant', content: text || null, ...(calls.length ? { tool_calls: calls } : {}) });
        continue;
      }
      if (m.role === 'tool') {
        for (const p of m.parts) if ('result' in p) out.push({ role: 'tool', tool_call_id: this.callId(p.result.id), content: JSON.stringify(p.result.data ?? null) });
        continue;
      }
      const parts: OaPart[] = [];
      for (const p of m.parts) {
        if ('text' in p && p.text) parts.push({ type: 'text', text: p.text });
        if ('result' in p) parts.push({ type: 'text', text: JSON.stringify(p.result.data) });
        if ('file' in p) {
          const reads = this.c.files.includes(p.file.mimeType);
          if (!reads) parts.push({ type: 'text', text: `[Attached file ${p.file.name}: ${this.c.label} cannot read this type of file]` });
          else if (p.file.mimeType.startsWith('image/')) parts.push({ type: 'text', text: `[Attached file: ${p.file.name}]` }, { type: 'image_url', image_url: { url: `data:${p.file.mimeType};base64,${p.file.data}` } });
          else parts.push({ type: 'file', file: { filename: p.file.name, file_data: `data:${p.file.mimeType};base64,${p.file.data}` } });
        }
      }
      if (!parts.length) continue;
      // Plain text as a string: the widest support among small and local servers.
      out.push({ role: 'user', content: parts.every((p) => p.type === 'text') ? parts.map((p) => (p as { text: string }).text).join('\n') : parts });
    }
    return out;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const body: Record<string, unknown> = {
      model: req.model,
      messages: this.toMessages(req.system, req.messages),
      ...(req.tools.length
        ? {
            tools: req.tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
            tool_choice: req.forceTool ? { type: 'function', function: { name: req.forceTool } } : 'auto',
          }
        : {}),
      // OpenAI's newer models only take the default temperature.
      ...(this.c.provider === 'openai' ? {} : { temperature: req.temperature ?? 0.2 }),
    };
    const headers: Record<string, string> = this.c.apiKey ? { Authorization: `Bearer ${this.c.apiKey}` } : {};
    if (this.c.provider === 'openrouter') Object.assign(headers, { 'X-Title': 'SampTrek' });
    const j = (await postJson(this.http, this.c.label, `${this.c.apiUrl}/chat/completions`, headers, body)) as {
      choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[]; refusal?: string | null }; finish_reason?: string }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      error?: { message?: string };
    };
    const c = j.choices?.[0];
    if (!c) throw new AiProviderError(`${this.c.label} sent no answer${j.error?.message ? `: ${j.error.message}` : ''}`, 'unavailable');
    if (c.finish_reason === 'content_filter' || (c.message?.refusal && !c.message.content)) throw new AiProviderError('The AI service declined to answer this message.', 'blocked');
    const calls = (c.message?.tool_calls ?? []).filter((x) => x.function?.name).map((x) => {
      let args: Record<string, unknown> = {};
      try {
        const v = JSON.parse(x.function!.arguments || '{}');
        if (v && typeof v === 'object' && !Array.isArray(v)) args = v as Record<string, unknown>;
      } catch {
        // A model that wrote broken JSON gets an empty call; the tool answers with what is missing.
      }
      return { id: x.id || randomUUID(), name: x.function!.name!, args };
    });
    return {
      // Some local models wrap their reasoning in <think> tags.
      text: (c.message?.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '').trim(),
      calls,
      raw: { provider: this.id, parts: [] },
      usage: { promptTokens: j.usage?.prompt_tokens ?? 0, outputTokens: j.usage?.completion_tokens ?? 0 },
      finishReason: c.finish_reason === 'content_filter' ? 'SAFETY' : c.finish_reason ?? null,
    };
  }
}
