'use client';
import { Check, Pencil, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CopyIcon } from '@/components/copy';
import { AddableSelect } from '@/components/form/option-select';
import { PartyContact } from '@/components/parties/contact-line';
import { ContactPicker, PartyPicker, type ClientOpt } from '@/components/parties/quick-add';
import { ErrorBox, Field } from '@/components/ui';
import { get, patch } from '@/lib/api';
import { CATEGORIES } from '@/lib/types';
import type { ProjectDetail } from './types';

/**
 * The project's client with its logo and the contact person (email masked), with a way to pick
 * or add another contact, and the work order number, editable (docs/WORK_ORDERS_AND_UID_PREFIX.md).
 */
export function ProjectParties({ project, editable, reload }: { project: ProjectDetail; editable: boolean; reload: () => void }) {
  const [editContact, setEditContact] = useState(false);
  const [contacts, setContacts] = useState(project.client.contacts ?? []);
  const [wo, setWo] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [details, setDetails] = useState(false);
  const client: ClientOpt = { id: project.client.id, name: project.client.name, code: project.client.code ?? '', logoUrl: project.client.logoUrl, contacts };

  async function save(body: Record<string, unknown>) {
    setError(null);
    try {
      await patch(`/projects/${project.id}`, body);
      reload();
      return true;
    } catch (e) {
      setError(e);
      return false;
    }
  }

  return (
    <div className="mb-4 space-y-3 border-b border-line pb-4">
      <div className="flex items-start justify-between gap-3">
        <PartyContact name={project.client.name} logoUrl={project.client.logoUrl} website={project.client.website} contact={project.clientContact ?? null} />
        {editable && !editContact && !details && (
          <div className="flex shrink-0 gap-1">
            <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => setDetails(true)}><Pencil className="h-3.5 w-3.5" /> Client, category, PM</button>
            <button className="btn-ghost h-8 px-2.5 text-xs" onClick={() => setEditContact(true)}><Pencil className="h-3.5 w-3.5" /> Contact</button>
          </div>
        )}
      </div>
      {details && <DetailsForm project={project} onCancel={() => setDetails(false)} onSave={async (body) => { if (await save(body)) setDetails(false); }} />}
      {editContact && (
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1">
            <ContactPicker
              client={client}
              value={project.clientContact?.id ?? ''}
              onAdded={setContacts}
              onChange={async (id) => { if (await save({ clientContactId: id || null })) setEditContact(false); }}
            />
          </div>
          <button className="btn-ghost h-9 px-2" aria-label="Close" onClick={() => setEditContact(false)}><X className="h-4 w-4" /></button>
        </div>
      )}
      {project.client.status === 'INACTIVE' && <p className="text-xs text-warn">This client is inactive. The project keeps working; new projects cannot use the client until it is active again.</p>}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="w-[140px] text-muted">Work order</span>
        {wo === null ? (
          <>
            <span className="font-mono">{project.workOrderNo ?? '–'}</span>
            {project.workOrderNo && <CopyIcon text={project.workOrderNo} label="work order number" />}
            {editable && <button className="btn-ghost h-7 px-2 text-xs" aria-label="Edit work order" onClick={() => setWo(project.workOrderNo ?? '')}><Pencil className="h-3.5 w-3.5" /></button>}
          </>
        ) : (
          <form className="flex items-center gap-1.5" onSubmit={async (e) => { e.preventDefault(); if (await save({ workOrderNo: wo.trim() || null })) setWo(null); }}>
            <input className="input h-8 w-40 py-1 font-mono text-sm" aria-label="Work order number" value={wo} onChange={(e) => setWo(e.target.value)} autoFocus maxLength={50} />
            <button className="btn-primary h-8 px-2" aria-label="Save work order"><Check className="h-4 w-4" /></button>
            <button type="button" className="btn-ghost h-8 px-2" aria-label="Cancel" onClick={() => setWo(null)}><X className="h-4 w-4" /></button>
          </form>
        )}
      </div>
      <ErrorBox error={error} />
    </div>
  );
}

type UserOpt = { id: string; name: string; role: string; active?: boolean };

/**
 * Client, category and project manager can be changed after the project is created, for a project
 * that was made under the wrong client by mistake. A new client clears the old client's contact.
 */
function DetailsForm({ project, onCancel, onSave }: { project: ProjectDetail; onCancel: () => void; onSave: (body: Record<string, unknown>) => Promise<void> }) {
  const [clients, setClients] = useState<ClientOpt[]>([]);
  const [users, setUsers] = useState<UserOpt[]>([]);
  const [clientId, setClientId] = useState(project.client.id);
  const [category, setCategory] = useState(project.category);
  const [pm, setPm] = useState(project.projectManager.id ?? '');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    get<ClientOpt[]>('/clients?status=ACTIVE').then((cs) => setClients(cs.some((c) => c.id === project.client.id) ? cs : [{ id: project.client.id, name: project.client.name, code: project.client.code ?? '', logoUrl: project.client.logoUrl, contacts: [] }, ...cs])).catch(() => {});
    get<UserOpt[]>('/users').then(setUsers).catch(() => {});
  }, [project.client.id, project.client.name, project.client.code, project.client.logoUrl]);
  const managers = users.filter((x) => ['ADMIN', 'PROJECT_MANAGER'].includes(x.role) || x.id === pm);
  const body: Record<string, unknown> = {};
  if (clientId && clientId !== project.client.id) body.clientId = clientId;
  if (category.trim() && category !== project.category) body.category = category.trim();
  if (pm && pm !== project.projectManager.id) body.projectManagerId = pm;
  const changed = Object.keys(body).length > 0;
  return (
    <form
      className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-sunken/40 p-3 sm:grid-cols-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        await onSave(body);
        setBusy(false);
      }}
    >
      <Field label="Client" hint={clientId !== project.client.id ? 'The contact person is cleared; pick one of the new client after saving.' : 'Active clients only'}>
        <PartyPicker<ClientOpt> kind="client" parties={clients} value={clientId} taken={clients.map((c) => c.code)} onChange={setClientId} onAdded={(c) => setClients((cs) => [...cs, { ...c, contacts: c.contacts ?? [] }])} />
      </Field>
      <Field label="Category">
        <AddableSelect field="category" base={CATEGORIES} value={category} onChange={setCategory} />
      </Field>
      <Field label="Project manager">
        <select className="input" value={pm} onChange={(e) => setPm(e.target.value)} aria-label="Project manager">
          {!managers.some((x) => x.id === pm) && <option value={pm}>{project.projectManager.name}</option>}
          {managers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      </Field>
      <div className="flex justify-end gap-2 sm:col-span-3">
        <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>
        <button className="btn-primary" disabled={!changed || busy}>{busy ? 'Saving…' : 'Save details'}</button>
      </div>
    </form>
  );
}
