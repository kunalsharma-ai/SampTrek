'use client';
import clsx from 'clsx';
import { ChevronDown, ChevronRight, Languages, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { ErrorBox } from '@/components/ui';
import { post } from '@/lib/api';
import type { Question, QuestionTranslation } from '@/lib/types';

const CHOICE = ['single', 'multi', 'dropdown', 'grid'];

/** "es" → "Spanish (es)". */
export function languageLabel(code: string) {
  try {
    const n = new Intl.DisplayNames(['en'], { type: 'language' }).of(code);
    return n && n.toLowerCase() !== code.toLowerCase() ? `${n} (${code})` : code;
  } catch {
    return code;
  }
}

/** How many texts a question has, and how many of them are translated into this language. */
function counts(qs: Question[], lang: string) {
  let total = 0;
  let done = 0;
  for (const q of qs) {
    const t = q.translations?.[lang];
    total += 1 + (q.help ? 1 : 0) + (CHOICE.includes(q.type) ? q.options?.length ?? 0 : 0) + (q.type === 'grid' ? q.rows?.length ?? 0 : 0);
    done += (t?.text?.trim() ? 1 : 0) + (q.help && t?.help?.trim() ? 1 : 0);
    if (CHOICE.includes(q.type)) done += (q.options ?? []).filter((o) => t?.options?.[o.id]?.trim()).length;
    if (q.type === 'grid') done += (q.rows ?? []).filter((r) => t?.rows?.[r.id]?.trim()).length;
  }
  return { total, done };
}

/**
 * Gate survey in the market's language (feedback 2026-11-24). One card per language of the
 * project's markets: type the translation, or let the AI draft it and check it. A respondent who
 * enters through a Spanish market link then sees the Spanish questions, buttons and messages;
 * a language without a translation shows the original. Answers are scored the same in every
 * language, so reports stay comparable.
 */
export function QuestionTranslations({ questions, onChange, languages, editable, what = 'gate survey' }: { questions: Question[]; onChange: (qs: Question[]) => void; languages: string[]; editable: boolean; what?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const langs = [...new Set(languages.map((l) => l.trim()).filter((l) => l && l.split('-')[0].toLowerCase() !== 'en'))];
  if (!questions.length) return null;

  const setT = (qi: number, lang: string, patch: (t: QuestionTranslation) => QuestionTranslation) =>
    onChange(questions.map((q, i) => (i === qi ? { ...q, translations: { ...(q.translations ?? {}), [lang]: patch(q.translations?.[lang] ?? {}) } } : q)));

  async function translate(lang: string) {
    setBusy(lang);
    setError(null);
    setNote(null);
    try {
      const strip = questions.map(({ translations, ...q }) => q);
      const r = await post<{ translations: Record<string, QuestionTranslation> }>('/ai/translate-questions', { language: lang, questions: strip });
      onChange(questions.map((q) => (r.translations[q.id] ? { ...q, translations: { ...(q.translations ?? {}), [lang]: { ...(q.translations?.[lang] ?? {}), ...r.translations[q.id], options: { ...(q.translations?.[lang]?.options ?? {}), ...(r.translations[q.id].options ?? {}) }, rows: { ...(q.translations?.[lang]?.rows ?? {}), ...(r.translations[q.id].rows ?? {}) } } } } : q)));
      setOpen(lang);
      setNote(`AI draft for ${languageLabel(lang)} added. Check it, then save.`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 rounded-lg border border-line p-3" role="group" aria-label={`Languages of the ${what}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
        <Languages className="h-4 w-4 text-brand" /> Languages
        <span className="text-xs font-normal text-muted">Respondents see the {what} in their market’s language. Without a translation they see the original.</span>
      </div>
      <ErrorBox error={error} />
      {note && <p className="mb-2 rounded bg-ok/10 px-2 py-1.5 text-xs text-ok" role="status">{note}</p>}
      {langs.length === 0 ? (
        <p className="text-xs text-muted">All markets use English. Add a market in another language (Overview → markets) to translate the questions for it.</p>
      ) : (
        <ul className="space-y-2">
          {langs.map((lang) => {
            const c = counts(questions, lang);
            const isOpen = open === lang;
            return (
              <li key={lang} className="rounded-lg border border-line" data-lang={lang}>
                <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left text-sm font-medium" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : lang)}>
                    {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    {languageLabel(lang)}
                  </button>
                  <span className={clsx('chip', c.done === 0 ? 'bg-sunken text-muted' : c.done < c.total ? 'bg-warn/15 text-warn' : 'bg-ok/15 text-ok')}>{c.done === 0 ? 'Not translated' : `${c.done} of ${c.total} texts`}</span>
                  {editable && <button type="button" className="btn-ghost px-2.5 py-1 text-xs" disabled={!!busy} onClick={() => translate(lang)}><Sparkles className="h-3.5 w-3.5 text-brand" /> {busy === lang ? 'Translating…' : c.done ? 'Translate again with AI' : 'Translate with AI'}</button>}
                </div>
                {isOpen && (
                  <div className="space-y-4 border-t border-line p-3">
                    {questions.map((q, qi) => {
                      const t = q.translations?.[lang] ?? {};
                      return (
                        <div key={q.id} className="space-y-1.5">
                          <div className="text-xs font-semibold text-muted">{qi + 1}. {q.text}</div>
                          <input className="input px-2 py-1 text-sm" disabled={!editable} dir="auto" aria-label={`Question ${qi + 1} in ${lang}`} placeholder={q.text} value={t.text ?? ''} onChange={(e) => setT(qi, lang, (x) => ({ ...x, text: e.target.value }))} />
                          {q.help && <input className="input px-2 py-1 text-xs" disabled={!editable} dir="auto" aria-label={`Help of question ${qi + 1} in ${lang}`} placeholder={q.help} value={t.help ?? ''} onChange={(e) => setT(qi, lang, (x) => ({ ...x, help: e.target.value }))} />}
                          {CHOICE.includes(q.type) && (q.options ?? []).length > 0 && (
                            <div className="grid grid-cols-1 gap-1.5 pl-4 sm:grid-cols-2">
                              {(q.options ?? []).map((o) => (
                                <input key={o.id} className="input px-2 py-1 text-xs" disabled={!editable} dir="auto" aria-label={`Answer ${o.label} in ${lang}`} placeholder={o.label} value={t.options?.[o.id] ?? ''} onChange={(e) => setT(qi, lang, (x) => ({ ...x, options: { ...(x.options ?? {}), [o.id]: e.target.value } }))} />
                              ))}
                            </div>
                          )}
                          {q.type === 'grid' && (q.rows ?? []).length > 0 && (
                            <div className="grid grid-cols-1 gap-1.5 pl-4 sm:grid-cols-2">
                              {(q.rows ?? []).map((r) => (
                                <input key={r.id} className="input px-2 py-1 text-xs" disabled={!editable} dir="auto" aria-label={`Row ${r.label} in ${lang}`} placeholder={r.label} value={t.rows?.[r.id] ?? ''} onChange={(e) => setT(qi, lang, (x) => ({ ...x, rows: { ...(x.rows ?? {}), [r.id]: e.target.value } }))} />
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
