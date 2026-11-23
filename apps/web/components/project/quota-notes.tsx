'use client';
import { Pencil, Save } from 'lucide-react';
import { useState } from 'react';
import { NotesView } from '@/components/notes-view';
import { ErrorBox, Section } from '@/components/ui';
import { patch } from '@/lib/api';
import type { ProjectDetail } from './types';

/**
 * Open text for the client's quota or termination report (feedback 2026-11-23). Paste text or
 * tables straight from Excel or an email; vendors see it in their login, with the time it changed.
 * It is not linked to the gate survey or prescreener.
 */
export function QuotaNotes({ project, editable }: { project: ProjectDetail; editable: boolean }) {
  const [saved, setSaved] = useState({ text: project.quotaNotes ?? '', at: project.quotaNotesUpdatedAt ?? null });
  const [text, setText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save() {
    if (text == null) return;
    setBusy(true);
    setError(null);
    try {
      const p = await patch<ProjectDetail>(`/projects/${project.id}`, { quotaNotes: text.trim() || null });
      setSaved({ text: p.quotaNotes ?? '', at: p.quotaNotesUpdatedAt ?? new Date().toISOString() });
      setText(null);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Section
      title="Quota and termination notes"
      help="project.quotaNotes"
      actions={editable && text == null && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => setText(saved.text)}><Pencil className="h-3.5 w-3.5" /> {saved.text ? 'Edit' : 'Paste report'}</button>}
    >
      <ErrorBox error={error} />
      {text != null ? (
        <div className="space-y-2">
          <textarea className="input min-h-48 font-mono text-xs" maxLength={50000} value={text} onChange={(e) => setText(e.target.value)} placeholder={'Paste the client\'s quota or termination report here. Tables copied from Excel stay tables.\n\nQuota\tTarget\tAchieved\nMale 18-34\t50\t32'} aria-label="Quota and termination notes" />
          {text.trim() && (
            <div className="rounded-lg border border-dashed border-line p-3">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Preview</div>
              <NotesView text={text} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save and tell vendors'}</button>
            <button className="btn-ghost" onClick={() => setText(null)}>Cancel</button>
            <span className="text-xs text-muted">Every vendor on the project gets a notice with the time.</span>
          </div>
        </div>
      ) : saved.text ? (
        <>
          <NotesView text={saved.text} />
          {saved.at && <p className="mt-3 text-xs text-muted">Updated {new Date(saved.at).toLocaleString()} · vendors see this in their login</p>}
        </>
      ) : (
        <p className="text-sm text-muted">Nothing yet. Paste the client&apos;s latest quota or termination report so vendors see where to send traffic.</p>
      )}
    </Section>
  );
}
