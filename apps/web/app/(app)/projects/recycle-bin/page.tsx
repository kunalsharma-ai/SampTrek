'use client';
import { ArrowLeft, RotateCcw, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Empty, ErrorBox, Loading, PageHeader, Section, StatusChip } from '@/components/ui';
import { api, get, post } from '@/lib/api';

interface Binned { id: string; projectCode: string; workOrderNo: string | null; name: string; status: string; client: string; respondents: number; invoices: number; deletedAt: string; deletedBy: string | null; purgeAt: string; daysLeft: number }
interface Request { id: string; projectCode: string; workOrderNo: string | null; name: string; status: string; client: string; requestedAt: string; requestedBy: string | null; reason: string | null }
interface Bin { days: number; canDelete: boolean; canPurge: boolean; projects: Binned[]; requests: Request[] }

const when = (d: string) => new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

/** Deleted projects (30 days to restore) and delete requests waiting for an admin (feedback 2026-11-23). */
export default function RecycleBinPage() {
  const [bin, setBin] = useState<Bin | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const load = useCallback(() => get<Bin>('/recycle-bin').then(setBin).catch(setError), []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(id: string, fn: () => Promise<unknown>, done: string) {
    setBusy(id);
    setError(null);
    setNote(null);
    try {
      await fn();
      setNote(done);
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(null);
    }
  }

  if (!bin) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <PageHeader title="Recycle bin" subtitle={`Deleted projects stay here for ${bin.days} days, then are removed for good with their respondents, links and invoices.`} />
      <div className="mb-4 space-y-2">
        <ErrorBox error={error} />
        {note && <p className="rounded-lg border border-ok/40 bg-ok/10 p-3 text-sm" role="status">{note}</p>}
      </div>

      {(bin.canDelete || bin.requests.length > 0) && (
        <Section title="Delete requests" className="mb-6">
          {bin.requests.length === 0 ? (
            <Empty>No requests. People without the delete permission ask here; you get a note on the bell.</Empty>
          ) : (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-y border-line bg-sunken/60"><tr><th className="th">Project</th><th className="th">Client</th><th className="th">Status</th><th className="th">Asked by</th><th className="th">Reason</th><th className="th" /></tr></thead>
                <tbody className="divide-y divide-line">
                  {bin.requests.map((r) => (
                    <tr key={r.id}>
                      <td className="td"><Link className="font-medium hover:text-brand hover:underline" href={`/projects/${r.id}`}>{r.projectCode}</Link> <span className="text-muted">{r.name}</span>{r.workOrderNo && <span className="block text-xs text-muted">WO {r.workOrderNo}</span>}</td>
                      <td className="td">{r.client}</td>
                      <td className="td"><StatusChip status={r.status} /></td>
                      <td className="td text-sm">{r.requestedBy ?? 'Someone'}<span className="block text-xs text-muted">{when(r.requestedAt)}</span></td>
                      <td className="td text-sm">{r.reason ?? <span className="text-muted">No reason given</span>}</td>
                      <td className="td">
                        {bin.canDelete && (
                          <div className="flex justify-end gap-1.5">
                            <button className="btn-danger px-2.5 py-1 text-xs" disabled={busy === r.id || r.status === 'LIVE'} title={r.status === 'LIVE' ? 'Close it or put it on hold first' : undefined} onClick={() => run(r.id, () => api(`/projects/${r.id}`, { method: 'DELETE' }), `${r.projectCode} moved to the recycle bin.`)}><Trash2 className="h-3.5 w-3.5" /> Approve and delete</button>
                            <button className="btn-ghost px-2.5 py-1 text-xs" disabled={busy === r.id} onClick={() => run(r.id, () => post(`/projects/${r.id}/delete-request/decline`), `Request for ${r.projectCode} declined.`)}><X className="h-3.5 w-3.5" /> Decline</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      <Section title="Deleted projects">
        {bin.projects.length === 0 ? (
          <Empty>The recycle bin is empty.</Empty>
        ) : (
          <div className="-mx-5 -mb-5 overflow-x-auto">
            <table className="w-full min-w-[860px]">
              <thead className="border-y border-line bg-sunken/60"><tr><th className="th">Project</th><th className="th">Client</th><th className="th text-right">Respondents</th><th className="th text-right">Invoices</th><th className="th">Deleted</th><th className="th">Removed for good</th><th className="th" /></tr></thead>
              <tbody className="divide-y divide-line">
                {bin.projects.map((p) => (
                  <tr key={p.id}>
                    <td className="td"><span className="font-medium">{p.projectCode}</span> <span className="text-muted">{p.name}</span>{p.workOrderNo && <span className="block text-xs text-muted">WO {p.workOrderNo}</span>}</td>
                    <td className="td">{p.client}</td>
                    <td className="td text-right tabular-nums">{p.respondents.toLocaleString()}</td>
                    <td className="td text-right tabular-nums">{p.invoices}</td>
                    <td className="td text-sm">{when(p.deletedAt)}<span className="block text-xs text-muted">by {p.deletedBy ?? 'someone'}</span></td>
                    <td className="td text-sm"><span className={p.daysLeft <= 3 ? 'font-medium text-bad' : ''}>in {p.daysLeft} {p.daysLeft === 1 ? 'day' : 'days'}</span><span className="block text-xs text-muted">{new Date(p.purgeAt).toLocaleDateString()}</span></td>
                    <td className="td">
                      <div className="flex justify-end gap-1.5">
                        {bin.canDelete && <button className="btn-primary px-2.5 py-1 text-xs" disabled={busy === p.id} onClick={() => run(p.id, () => post(`/recycle-bin/${p.id}/restore`), `${p.projectCode} is back, as it was.`)}><RotateCcw className="h-3.5 w-3.5" /> Restore</button>}
                        {bin.canPurge && <button className="btn-danger px-2.5 py-1 text-xs" disabled={busy === p.id} onClick={() => { if (confirm(`Delete ${p.projectCode} for good now? Its ${p.respondents} respondents${p.invoices ? ` and ${p.invoices} invoices` : ''} go too. This cannot be undone.`)) void run(p.id, () => api(`/recycle-bin/${p.id}`, { method: 'DELETE' }), `${p.projectCode} was deleted for good.`); }}><Trash2 className="h-3.5 w-3.5" /> Delete now</button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!bin.canDelete && <p className="mt-6 text-xs text-muted">Only admins and people with the delete permission (Settings → Team) can restore projects.</p>}
      </Section>
    </>
  );
}
