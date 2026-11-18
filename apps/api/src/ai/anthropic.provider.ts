import { AiConfig } from '../common/config';
import { postJson } from './openai.provider';
import { AiProvider, AiProviderError, GenerateRequest, GenerateResult, Http, Message } from './provider';

/**
 * Anthropic Claude over the Messages API (POST /v1/messages), with tool use. Plain HTTP like the
 * other providers, so tests swap the transport and no SDK is bundled.
 *
 * Current Claude models think before answering and do not accept a forced tool or a temperature, so
 * the brief's "use this tool" is asked for in the prompt instead. Thinking blocks are replayed as the
 * model sent them when Claude continues its own tool exchange.
 */

type Block = Record<string, unknown> & { type: string };
type AMsg = { role: 'user' | 'assistant'; content: Block[] };

export class AnthropicProvider implements AiProvider {
  readonly id = 'anthropic';
  constructor(
    private readonly c: AiConfig,
    private readonly http: Http,
  ) {}

  toMessages(messages: Message[]): AMsg[] {
    const out: AMsg[] = [];
    const push = (role: AMsg['role'], content: Block[]) => {
      if (!content.length) return;
      // Consecutive turns of the same role are merged: tool results must sit in the user turn right after the calls.
      const last = out[out.length - 1];
      if (last?.role === role) last.content.push(...content);
      else out.push({ role, content });
    };
    for (const m of messages) {
      if (m.role === 'assistant') {
        if (m.raw?.provider === this.id && m.raw.parts.length) {
          push('assistant', m.raw.parts as Block[]);
          continue;
        }
        const content: Block[] = [];
        for (const p of m.parts) {
          if ('text' in p && p.text) content.push({ type: 'text', text: p.text });
          if ('call' in p) content.push({ type: 'tool_use', id: p.call.id, name: p.call.name, input: p.call.args ?? {} });
        }
        push('assistant', content);
        continue;
      }
      const content: Block[] = [];
      for (const p of m.parts) {
        if ('result' in p) content.push({ type: 'tool_result', tool_use_id: p.result.id, content: JSON.stringify(p.result.data ?? null) });
        if ('text' in p && p.text) content.push({ type: 'text', text: p.text });
        if ('file' in p) {
          const source = { type: 'base64', media_type: p.file.mimeType, data: p.file.data };
          if (p.file.mimeType === 'application/pdf') content.push({ type: 'document', source, title: p.file.name });
          else if (p.file.mimeType.startsWith('image/') && this.c.files.includes(p.file.mimeType)) content.push({ type: 'text', text: `[Attached file: ${p.file.name}]` }, { type: 'image', source });
          else content.push({ type: 'text', text: `[Attached file ${p.file.name}: Claude cannot read this type of file]` });
        }
      }
      push('user', content);
    }
    // Claude expects the conversation to start with the person.
    while (out.length && out[0].role !== 'user') out.shift();
    return out;
  }

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    const system = req.forceTool ? `${req.system}\n\nAnswer only by calling the ${req.forceTool} tool once.` : req.system;
    const body = {
      model: req.model,
      max_tokens: 16000,
      system,
      messages: this.toMessages(req.messages),
      ...(req.tools.length ? { tools: req.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })), tool_choice: { type: 'auto' } } : {}),
    };
    const j = (await postJson(this.http, this.c.label, `${this.c.apiUrl}/v1/messages`, { 'x-api-key': this.c.apiKey ?? '', 'anthropic-version': '2023-06-01' }, body, 120_000)) as {
      content?: Block[];
      stop_reason?: string;
      usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number };
    };
    if (j.stop_reason === 'refusal') throw new AiProviderError('The AI service declined to answer this message.', 'blocked');
    const content = j.content ?? [];
    const calls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: String(b.id), name: String(b.name), args: (b.input ?? {}) as Record<string, unknown> }));
    const u = j.usage ?? {};
    return {
      text: content.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('').trim(),
      calls,
      raw: { provider: this.id, parts: content },
      usage: { promptTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0), outputTokens: u.output_tokens ?? 0 },
      finishReason: j.stop_reason ?? null,
    };
  }
}
