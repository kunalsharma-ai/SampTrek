'use client';
import { useState } from 'react';
import { ErrorBox } from '@/components/ui';
import { patch } from '@/lib/api';

/**
 * Rename a project after it was created (feedback 2026-11-24). The internal name only: vendors keep
 * seeing "Name vendors see", and the project ID and work order number do not change.
 */
export function RenameProject({ project, onClose, onSaved }: { project: { id: string; name: string }; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(project.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const clean = name.trim();
  async function save() {
    setBusy(true);
    setError(null);
    try {
      await patch(`/projects/${project.id}`, { name: clean });
      onSaved();
      onClose();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="card mb-5 p-4" role="group" aria-label="Rename project">
      <ErrorBox error={error} />
      <form className="flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (clean && clean !== project.name) void save(); }}>
        <label className="block min-w-[260px] flex-1">
          <span className="mb-1 block text-xs font-medium text-muted">Project name</span>
          <input className="input" value={name} maxLength={300} autoFocus onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && onClose()} />
        </label>
        <button className="btn-primary" disabled={busy || !clean || clean === project.name}>{busy ? 'Saving…' : 'Save name'}</button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </form>
      <p className="mt-2 text-xs text-muted">Changes the internal name only. The project ID, work order number, links and the name vendors see stay the same.</p>
    </div>
  );
}
