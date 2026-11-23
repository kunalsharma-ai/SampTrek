'use client';
import { Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ErrorBox, Field, Section } from '@/components/ui';
import { api, post } from '@/lib/api';
import type { ProjectDetail } from './types';

/**
 * Delete moves the project to the recycle bin for 30 days (feedback 2026-11-23). People without the
 * "may delete projects" permission send the admins a request instead.
 */
export function DeleteProject({ project, canDelete, onClose, onRequested }: { project: ProjectDetail; canDelete: boolean; onClose: () => void; onRequested: () => void }) {
  const router = useRouter();
  const [reason, setReason] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const live = project.status === 'LIVE';

  async function go() {
    setBusy(true);
    setError(null);
    try {
      if (canDelete) {
        await api(`/projects/${project.id}`, { method: 'DELETE' });
        router.push('/projects/recycle-bin');
      } else {
        await post(`/projects/${project.id}/delete-request`, reason.trim() ? { reason: reason.trim() } : {});
        onRequested();
        onClose();
      }
    } catch (e) {
      setError(e);
      setBusy(false);
    }
  }

  return (
    <Section title={canDelete ? 'Delete project' : 'Ask an admin to delete this project'} className="mb-6 border-bad/40">
      <div className="space-y-3 text-sm">
        {canDelete ? (
          <p className="text-muted">
            {project.projectCode} moves to the <Link className="text-brand hover:underline" href="/projects/recycle-bin">recycle bin</Link>. It leaves every list, report and dashboard, and its links stop taking respondents. You can restore it for 30 days; after that it is removed for good, with its respondents, links and invoices.
          </p>
        ) : (
          <p className="text-muted">You do not have permission to delete projects. The admins get a request on the bell and in the recycle bin, and either delete it or decline. An admin can give you the permission on Settings → Team.</p>
        )}
        {project.deleteRequestedAt && !canDelete && <p className="text-warn">A delete request is already waiting for an admin.</p>}
        {live && <p className="text-warn">The project is live. Close it or put it on hold before it can be deleted.</p>}
        {!canDelete && <div className="max-w-xl"><Field label="Reason (optional)"><input className="input" maxLength={500} value={reason} placeholder="e.g. Duplicate of WO 4411" onChange={(e) => setReason(e.target.value)} /></Field></div>}
        <ErrorBox error={error} />
        <div className="flex gap-2">
          <button className="btn-danger" disabled={busy || (canDelete && live)} onClick={go}><Trash2 className="h-4 w-4" /> {busy ? 'Working…' : canDelete ? 'Move to recycle bin' : 'Send request'}</button>
          <button className="btn-ghost" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Section>
  );
}
