'use client';
import { Eye, EyeOff, KeyRound, Plus, RefreshCw } from 'lucide-react';
import { LoginAsButton } from '@/components/login-as-button';
import { EditName } from '@/components/edit-name';
import { useEffect, useState } from 'react';
import { canEdit, useMe } from '@/components/me';
import { Empty, ErrorBox, Field, Loading, PageHeader, Section, Toggle } from '@/components/ui';
import { get, patch, post } from '@/lib/api';
import type { Option } from '@/lib/types';

interface PortalUser {
  id: string; name: string; email: string; role: 'CLIENT_USER' | 'VENDOR_USER'; active: boolean; createdAt: string; lastLoginAt?: string | null; passwordSetAt?: string | null;
  client: { id: string; name: string } | null; vendor: { id: string; name: string } | null;
}

export default function PortalAccessPage() {
  const me = useMe();
  const editable = canEdit(me);
  const [users, setUsers] = useState<PortalUser[] | null>(null);
  const [clients, setClients] = useState<Option[]>([]);
  const [vendors, setVendors] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ kind: 'vendor' as 'client' | 'vendor', partyId: '', name: '', email: '', password: '' });
  const [error, setError] = useState<unknown>(null);
  const [pwFor, setPwFor] = useState<PortalUser | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [showPw, setShowPw] = useState(false);

  const load = () => get<PortalUser[]>('/portal-users').then(setUsers).catch(setError);
  useEffect(() => {
    if (!editable) return;
    load();
    get<Option[]>('/clients').then(setClients).catch(setError);
    get<Option[]>('/vendors').then(setVendors).catch(setError);
  }, [editable]);

  async function invite() {
    setError(null);
    try {
      await post('/portal-users', form);
      setForm({ ...form, partyId: '', name: '', email: '', password: '' });
      setOpen(false);
      load();
    } catch (e) {
      setError(e);
    }
  }

  async function setActive(u: PortalUser, active: boolean) {
    try {
      await patch(`/portal-users/${u.id}`, { active });
      load();
    } catch (e) {
      setError(e);
    }
  }

  const rename = (u: PortalUser) => async (name: string) => {
    setError(null);
    try {
      await patch(`/portal-users/${u.id}`, { name });
      setNote(`Name changed from “${u.name}” to “${name}”.`);
      load();
    } catch (e) {
      setError(e);
      throw e;
    }
  };

  if (!editable) return <Empty>Only admins and project managers can manage portal access.</Empty>;
  const parties = form.kind === 'client' ? clients : vendors;

  return (
    <>
      <PageHeader
        title="Portal access"
        subtitle="Client and vendor logins. Vendors see their own links, respondents and payouts; clients see their own projects and approve completes."
        actions={<button className="btn-primary" onClick={() => setOpen(!open)}><Plus className="h-4 w-4" /> Add portal user</button>}
      />
      <div className="mb-4"><ErrorBox error={error} /></div>
      {open && (
        <Section title="New portal user" className="mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Field label="Portal">
              <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as 'client' | 'vendor', partyId: '' })}>
                <option value="vendor">Vendor portal</option><option value="client">Client portal</option>
              </select>
            </Field>
            <Field label={form.kind === 'client' ? 'Client' : 'Vendor'}>
              <select className="input" value={form.partyId} onChange={(e) => setForm({ ...form, partyId: e.target.value })}>
                <option value="">Choose…</option>{parties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
            <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
            <Field label="Temporary password" hint="At least 10 characters. Share it privately.">
              <PasswordInput value={form.password} onChange={(v) => setForm({ ...form, password: v })} show={showPw} setShow={setShowPw} />
            </Field>
          </div>
          <button className="btn-primary mt-4" onClick={invite} disabled={!form.partyId || !form.name || !form.email || form.password.length < 10}>Create login</button>
        </Section>
      )}
      {note && <p className="mb-4 rounded-lg bg-ok/10 p-3 text-sm text-ok" role="status">{note}</p>}
      {pwFor && <NewPassword user={pwFor} onClose={() => setPwFor(null)} onDone={(text) => { setPwFor(null); setNote(text); load(); }} />}
      {!users ? <Loading /> : users.length === 0 ? <Empty>No portal users yet.</Empty> : (
        <div className="card overflow-x-auto">
          <table className="w-full">
            <thead className="border-b border-line bg-sunken/60"><tr><th className="th">Name</th><th className="th">Email</th><th className="th">Portal</th><th className="th">Company</th><th className="th">Created</th><th className="th">Last sign-in</th><th className="th">Active</th><th className="th" /></tr></thead>
            <tbody className="divide-y divide-line">
              {users.map((u) => (
                <tr key={u.id} className={u.active ? undefined : 'opacity-60'}>
                  <td className="td"><EditName name={u.name} onSave={rename(u)} /></td>
                  <td className="td">{u.email}</td>
                  <td className="td">{u.role === 'CLIENT_USER' ? 'Client' : 'Vendor'}</td>
                  <td className="td">{u.client?.name ?? u.vendor?.name}</td>
                  <td className="td text-muted">{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td className="td whitespace-nowrap text-xs text-muted">{u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}</td>
                  <td className="td"><Toggle label={`${u.name} active`} checked={u.active} onChange={(v) => setActive(u, v)} /></td>
                  <td className="td">
                    <div className="flex justify-end gap-1.5">
                      <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => { setPwFor(u); setNote(null); }} aria-label={`New password for ${u.name}`}><KeyRound className="h-3.5 w-3.5" /> Password</button>
                      {me?.user.role === 'ADMIN' && u.active && <LoginAsButton userId={u.id} name={u.name} onError={setError} />}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** A strong password that is easy to read out: no 0/O or 1/l. */
function generate() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const a = new Uint32Array(14);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}

function PasswordInput({ value, onChange, show, setShow }: { value: string; onChange: (v: string) => void; show: boolean; setShow: (v: boolean) => void }) {
  return (
    <div className="flex gap-1">
      <input className="input min-w-0 flex-1 font-mono" type={show ? 'text' : 'password'} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} />
      <button type="button" className="btn-ghost px-2" title={show ? 'Hide' : 'Show'} aria-label={show ? 'Hide password' : 'Show password'} onClick={() => setShow(!show)}>{show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
      <button type="button" className="btn-ghost px-2" title="Generate a strong password" aria-label="Generate a password" onClick={() => { onChange(generate()); setShow(true); }}><RefreshCw className="h-4 w-4" /></button>
    </div>
  );
}

/**
 * Feedback 2026-11-24: a forgotten portal password. Saved passwords are stored scrambled (hashed)
 * and can never be shown again, so the admin sets a new one, sees it here once and shares it.
 */
function NewPassword({ user, onClose, onDone }: { user: PortalUser; onClose: () => void; onDone: (note: string) => void }) {
  const [pw, setPw] = useState(generate);
  const [show, setShow] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Section title={`New password for ${user.name}`} className="mb-6">
      <p className="mb-3 text-sm text-muted">Passwords are stored scrambled, so nobody (not even an admin) can see the old one. Set a new password here, copy it and share it with {user.name} privately. They can change it after signing in. Their other sessions end.</p>
      <ErrorBox error={error} />
      <div className="flex flex-wrap items-end gap-2">
        <div className="w-full max-w-sm"><Field label={`Password for ${user.email}`} hint="At least 10 characters"><PasswordInput value={pw} onChange={setPw} show={show} setShow={setShow} /></Field></div>
        <button type="button" className="btn-ghost" onClick={() => navigator.clipboard?.writeText(pw)}>Copy</button>
        <button
          type="button"
          className="btn-primary"
          disabled={busy || pw.length < 10}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await post(`/portal-users/${user.id}/password`, { password: pw });
              onDone(`New password saved for ${user.name} (${user.email}). Share it with them privately.`);
            } catch (e) {
              setError(e);
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? 'Saving…' : 'Save new password'}
        </button>
        <button type="button" className="btn-ghost" onClick={onClose}>Cancel</button>
      </div>
    </Section>
  );
}
