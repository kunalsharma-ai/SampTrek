'use client';
import clsx from 'clsx';
import { Plus, RotateCcw, Save, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCustomOptions } from '@/components/form/option-select';
import { canEdit, useMe } from '@/components/me';
import { cleanQuestion, QuestionBuilder, questionProblems } from '@/components/project/question-builder';
import type { QuestionSetInfo } from '@/components/project/question-sets';
import { ErrorBox, Field, Loading, PageHeader, Section } from '@/components/ui';
import { api, get } from '@/lib/api';
import { CATEGORIES, type Question } from '@/lib/types';

interface Draft { key: string; name: string; description: string; questions: Question[]; categories: string[] }
const toDraft = (s: QuestionSetInfo): Draft => ({ key: s.key, name: s.name, description: s.description ?? '', questions: structuredClone(s.questions), categories: [...(s.categories ?? [])] });

/**
 * Admin → Survey library: the gate survey for each audience (consumers, tobacco users, B2B, decision
 * makers, healthcare consumers, HCPs, caregivers and more). Each set has basic demographics plus its own
 * questions, and lists the project categories it is used for, so a new project in that category starts
 * with it and nobody has to pick a gate survey every time.
 */
export default function SurveyLibraryPage() {
  const me = useMe();
  const editable = canEdit(me);
  const custom = useCustomOptions('category');
  const categories = useMemo(() => [...new Set([...CATEGORIES, ...custom])], [custom]);
  const [sets, setSets] = useState<QuestionSetInfo[] | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (select?: string) => {
    const list = await get<QuestionSetInfo[]>('/question-templates/sets');
    setSets(list);
    const pick = list.find((s) => s.key === select) ?? list[0];
    if (pick) setDraft(toDraft(pick));
  }, []);
  useEffect(() => { load().catch(setError); }, [load]);

  const current = sets?.find((s) => s.key === draft?.key);
  const dirty = !!draft && (draft.key === 'new' || !current || JSON.stringify(toDraft(current)) !== JSON.stringify(draft));
  const problems = draft?.questions.some((q) => questionProblems(q).length);
  /** Category → the set new projects in it start with (the last set listing it wins, so your own sets win over standard ones). */
  const usedBy = useMemo(() => {
    const m: Record<string, string> = {};
    for (const s of sets ?? []) for (const c of s.categories ?? []) m[c] = s.name;
    return m;
  }, [sets]);

  const choose = (s: QuestionSetInfo) => {
    if (dirty && !window.confirm('Discard the changes to this set?')) return;
    setNote(null); setError(null); setDraft(toDraft(s));
  };

  async function run(fn: () => Promise<{ key?: string } | unknown>, done: string, select?: string) {
    setBusy(true); setError(null); setNote(null);
    try {
      const r = (await fn()) as { key?: string } | undefined;
      await load(r?.key ?? select);
      setNote(done);
    } catch (e) { setError(e); } finally { setBusy(false); }
  }

  const save = () => draft && run(
    () => api(`/question-templates/sets/${draft.key}`, { method: 'PUT', json: { name: draft.name.trim(), description: draft.description.trim() || null, questions: draft.questions.map(cleanQuestion), categories: draft.categories } }),
    `Saved “${draft.name.trim()}”.`, draft.key,
  );

  return (
    <>
      <PageHeader
        title="Survey library"
        subtitle="Gate surveys for each audience. Tick the project categories a set is for, and new projects in those categories start with its questions, so nobody has to choose a gate survey every time."
        help="settings.surveys"
      />
      <div className="mb-4 space-y-2">
        <ErrorBox error={error} />
        {note && <p className="rounded-lg border border-ok/40 bg-ok/10 px-3 py-2 text-sm">{note}</p>}
      </div>
      {!sets || !draft ? <Loading /> : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[18rem_1fr]">
          <Section title="Audiences" actions={editable && (
            <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => { if (dirty && !window.confirm('Discard the changes to this set?')) return; setNote(null); setDraft({ key: 'new', name: '', description: '', questions: [], categories: [] }); }}>
              <Plus className="h-3.5 w-3.5" /> New set
            </button>
          )}>
            <ul className="-mx-2 space-y-1" aria-label="Survey sets">
              {sets.map((s) => (
                <li key={s.key}>
                  <button type="button" onClick={() => choose(s)} aria-current={draft.key === s.key}
                    className={clsx('w-full rounded-lg px-2 py-2 text-left text-sm hover:bg-surface-2', draft.key === s.key && 'bg-surface-2 font-medium')}>
                    <span className="block">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.questions.length} questions{s.builtIn ? (s.edited ? ' · your version' : ' · standard') : ' · your own'}
                      {(s.categories ?? []).length > 0 && ` · ${s.categories.join(', ')}`}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </Section>

          <Section title={draft.key === 'new' ? 'New survey set' : draft.name || 'Survey set'} actions={editable && (
            <div className="flex flex-wrap gap-2">
              {current?.builtIn && current.edited && (
                <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busy} onClick={() => run(() => api(`/question-templates/sets/${current.key}`, { method: 'DELETE' }), `${current.name} is back to the standard questions.`, current.key)}>
                  <RotateCcw className="h-3.5 w-3.5" /> Reset to standard
                </button>
              )}
              {current && !current.builtIn && (
                <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs text-bad" disabled={busy} onClick={() => window.confirm(`Delete “${current.name}”? Projects that already use its questions keep them.`) && run(() => api(`/question-templates/sets/${current.key}`, { method: 'DELETE' }), `Deleted “${current.name}”.`)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </button>
              )}
              <button type="button" className="btn-primary px-3 py-1.5 text-xs" disabled={busy || !dirty || draft.name.trim().length < 2 || !draft.questions.length || !!problems} onClick={save}>
                <Save className="h-3.5 w-3.5" /> Save
              </button>
            </div>
          )}>
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <Field label="Name"><input className="input" value={draft.name} disabled={!editable} maxLength={80} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="e.g. Tobacco users 21+" /></Field>
                <Field label="Description"><input className="input" value={draft.description} disabled={!editable} maxLength={300} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Who this set is for" /></Field>
              </div>
              <fieldset>
                <legend className="mb-1 text-sm font-medium">Use for new projects in these categories</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                  {categories.map((c) => {
                    const on = draft.categories.includes(c);
                    const other = usedBy[c] && usedBy[c] !== current?.name ? usedBy[c] : null;
                    return (
                      <label key={c} className="flex items-center gap-2" title={other && !on ? `Now uses “${other}”` : undefined}>
                        <input type="checkbox" className="h-4 w-4" disabled={!editable} checked={on} onChange={(e) => setDraft({ ...draft, categories: e.target.checked ? [...draft.categories, c] : draft.categories.filter((x) => x !== c) })} />
                        {c}{other && !on && <span className="text-xs text-muted">({other})</span>}
                      </label>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-muted">The project can still change or remove these questions on its Gate & security tab.</p>
              </fieldset>
              <div>
                <p className="mb-2 text-sm font-medium">Questions</p>
                <p className="mb-2 text-xs text-muted">
                  Use <b>Add question</b> for your own questions, <b>Library</b> for single demographic questions (age, gender, income, education and more), or <b>Audience sets</b> to copy questions from another set. Click a question to edit its text, answers and which answers qualify or screen out, then <b>Save</b>.
                </p>
                <QuestionBuilder value={draft.questions} onChange={(q) => setDraft({ ...draft, questions: q })} editable={editable} templatesCurrency="USD" emptyText="No questions yet. Add basic demographics from the Library, then your own questions." />
              </div>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
