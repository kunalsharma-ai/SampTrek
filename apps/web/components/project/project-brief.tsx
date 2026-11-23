'use client';
import { Pencil, Save } from 'lucide-react';
import { useState } from 'react';
import { FilesPanel } from '@/components/requests/files-panel';
import { ErrorBox, Section } from '@/components/ui';
import { patch } from '@/lib/api';
import type { ProjectDetail } from './types';

/**
 * Project description (seen by vendors too) and the project documents vendors download:
 * questionnaire, screener and ZIP code file (feedback 2026-11-23).
 */
export function ProjectBrief({ project, editable, reload }: { project: ProjectDetail; editable: boolean; reload: () => void }) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(project.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await patch(`/projects/${project.id}`, { description: text.trim() || null });
      setEditing(false);
      reload();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Section
        title="Project description"
        help="project.description"
        actions={editable && !editing && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => { setText(project.description ?? ''); setEditing(true); }}><Pencil className="h-3.5 w-3.5" /> Edit</button>}
      >
        <ErrorBox error={error} />
        {editing ? (
          <div className="space-y-2">
            <textarea className="input min-h-32" maxLength={5000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Target audience, qualification, anything vendors need to know" aria-label="Project description" />
            <div className="flex items-center gap-2">
              <button className="btn-primary" disabled={busy} onClick={save}><Save className="h-4 w-4" /> {busy ? 'Saving…' : 'Save description'}</button>
              <button className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
              <span className="text-xs text-muted">Vendors working on the project see this text in their login.</span>
            </div>
          </div>
        ) : project.description ? (
          <p className="whitespace-pre-wrap text-sm">{project.description}</p>
        ) : (
          <p className="text-sm text-muted">No description yet.{editable && ' Add one with Edit; vendors see it in their login.'}</p>
        )}
      </Section>
      <Section title="Project documents" help="project.documents">
        <p className="mb-4 text-sm text-muted">Questionnaire, screener, ZIP code file (Excel or zip) and other documents. Shared with every vendor of the project, they can see and download them in their login; staff only stays internal.</p>
        <FilesPanel
          portal={false}
          query={{ projectId: project.id }}
          kinds={['QUESTIONNAIRE', 'SCREENER', 'ZIP_CODES', 'OTHER']}
          audiences={[{ value: 'vendors', label: 'Every vendor of the project', vendorsAll: true }, { value: 'staff', label: 'Staff only' }]}
          fixed={{ projectId: project.id }}
          canUpload={editable}
          canDelete={() => editable}
          showSharedWith
          empty="No documents yet."
        />
      </Section>
    </>
  );
}
