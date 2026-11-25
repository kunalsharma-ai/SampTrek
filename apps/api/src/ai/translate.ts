/**
 * Gate survey translation with the AI copilot's providers (feedback 2026-11-24): the staff member
 * picks a market language and gets a draft translation of every question, answer and grid row,
 * which they check and save with the project. Nothing is saved here.
 */
import { z } from 'zod';
import { LANG_RE, Question, questionSchema } from '../survey/questions';
import { ToolSpec } from './provider';

export const translateSchema = z
  .object({
    language: z.string().regex(LANG_RE, 'Use a language code such as es or pt-BR'),
    questions: z.array(questionSchema).min(1).max(30),
  })
  .strict();

export const TRANSLATE_TOOL: ToolSpec = {
  name: 'translations',
  description: 'Return the translation of every item, keeping each key exactly as given.',
  parameters: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        description: 'One entry per item that was given',
        items: { type: 'object', properties: { key: { type: 'string', description: 'The key as given' }, text: { type: 'string', description: 'The translated text' } }, required: ['key', 'text'] },
      },
    },
    required: ['items'],
  },
};

export type Translation = NonNullable<Question['translations']>[string];

/** Every text of the questions, keyed q:<id>, h:<id>, o:<id>:<option>, r:<id>:<row>. */
export function textsOf(qs: Question[]) {
  const out: { key: string; text: string }[] = [];
  for (const q of qs) {
    out.push({ key: `q:${q.id}`, text: q.text });
    if (q.help) out.push({ key: `h:${q.id}`, text: q.help });
    for (const o of q.options ?? []) out.push({ key: `o:${q.id}:${o.id}`, text: o.label });
    for (const r of q.rows ?? []) out.push({ key: `r:${q.id}:${r.id}`, text: r.label });
  }
  return out;
}

/** The AI's answer back into one translation per question id; unknown keys are ignored. */
export function translationsFrom(qs: Question[], items: unknown): Record<string, Translation> {
  const map = new Map<string, string>();
  for (const it of Array.isArray(items) ? items : []) {
    const k = (it as { key?: unknown })?.key;
    const t = (it as { text?: unknown })?.text;
    if (typeof k === 'string' && typeof t === 'string' && t.trim()) map.set(k, t.trim());
  }
  const out: Record<string, Translation> = {};
  for (const q of qs) {
    const tr: Translation = {};
    const text = map.get(`q:${q.id}`);
    if (text) tr.text = text.slice(0, 500);
    const help = map.get(`h:${q.id}`);
    if (help) tr.help = help.slice(0, 300);
    const options = Object.fromEntries((q.options ?? []).flatMap((o) => { const v = map.get(`o:${q.id}:${o.id}`); return v ? [[o.id, v.slice(0, 200)]] : []; }));
    if (Object.keys(options).length) tr.options = options;
    const rows = Object.fromEntries((q.rows ?? []).flatMap((r) => { const v = map.get(`r:${q.id}:${r.id}`); return v ? [[r.id, v.slice(0, 200)]] : []; }));
    if (Object.keys(rows).length) tr.rows = rows;
    if (Object.keys(tr).length) out[q.id] = tr;
  }
  return out;
}

export const translateSystem = (language: string) =>
  `You translate screening questions of a market research survey into the language with code "${language}". ` +
  'Write natural, neutral, polite wording that a respondent in that market understands. Keep numbers, brand names, ' +
  'units and placeholders as they are. Do not add or drop answers. Return every key with the translation through the translations tool.';
