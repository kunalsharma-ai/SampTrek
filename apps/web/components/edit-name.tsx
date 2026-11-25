'use client';
import { Check, Pencil, X } from 'lucide-react';
import { useState } from 'react';

/**
 * A name with a pencil to correct it in place (feedback 2026-11-25: a misspelt name could not be
 * fixed after the person was added). Enter saves, Escape cancels.
 */
export function EditName({ name, onSave, editable = true, suffix }: { name: string; onSave: (name: string) => Promise<void>; editable?: boolean; suffix?: React.ReactNode }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(name);
  const [busy, setBusy] = useState(false);
  const clean = value.trim();
  const save = async () => {
    if (!clean || clean === name) return setEditing(false);
    setBusy(true);
    try {
      await onSave(clean);
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };
  if (!editing)
    return (
      <div className="group flex items-center gap-1 font-medium">
        <span>{name}</span>
        {suffix}
        {editable && (
          <button type="button" className="rounded p-0.5 text-muted opacity-60 hover:bg-brand/10 hover:text-brand group-hover:opacity-100" title="Edit name" aria-label={`Edit name of ${name}`} onClick={() => { setValue(name); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    );
  return (
    <form className="flex items-center gap-1" onSubmit={(e) => { e.preventDefault(); void save(); }}>
      <input className="input h-7 min-w-0 max-w-[14rem] px-2 py-0 text-sm" value={value} maxLength={120} autoFocus aria-label="Name" onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === 'Escape' && setEditing(false)} />
      <button className="rounded p-1 text-ok hover:bg-ok/10" disabled={busy || !clean} title="Save name" aria-label="Save name"><Check className="h-4 w-4" /></button>
      <button type="button" className="rounded p-1 text-muted hover:bg-sunken" title="Cancel" aria-label="Cancel" onClick={() => setEditing(false)}><X className="h-4 w-4" /></button>
    </form>
  );
}
