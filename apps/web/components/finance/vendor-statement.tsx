'use client';
import clsx from 'clsx';
import Link from 'next/link';
import { useState } from 'react';
import { Empty, StatusChip, money } from '@/components/ui';
import { PAYMENT_MODES } from './bill-document';

export interface StatementProject {
  project: { id: string; projectCode: string; name: string; status: string }; currency: string;
  completes: number; approved: number; pending: number; rejected: number;
  unbilled: number; unbilledAmount: number | null; billed: number; billedAmount: number | null; paid: number; paidAmount: number | null; bills: string[]; state: string;
}
export interface StatementBill { id: string; number: string; status: string; currency: string; completes: number; total: number | null; vendorReference: string | null; paymentReference: string | null; paymentMode: string | null; createdAt: string; dueAt: string | null; paidAt: string | null; overdue: boolean }
export interface Statement {
  vendor: { id: string; name: string; code: string }; hidePayout: boolean; projects: StatementProject[]; bills: StatementBill[];
  totals: { unbilled: { currency: string; amount: number }[]; pendingInvoices: { currency: string; amount: number }[]; paidInvoices: { currency: string; amount: number }[] } | null;
  counts: { projects: number; completedProjects: number; billedProjects: number; pendingBills: number; paidBills: number };
}

const VIEWS = ['projects', 'completed', 'invoiced', 'unbilled', 'pending', 'paid'] as const;
type View = (typeof VIEWS)[number];
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '–');
const sums = (xs: { currency: string; amount: number }[] | undefined) => (xs?.length ? xs.map((x) => money(x.amount, x.currency)).join(' + ') : '0');

/**
 * A vendor's projects and bills (feedback 2026-11-23): completed and invoiced projects, unbilled
 * completes, bills waiting for payment, and paid bills with the mode and date of payment.
 * `billHref` links a bill to its page (staff), or leaves it as text (vendor portal).
 */
export function VendorStatement({ s, billHref, projectHref }: { s: Statement; billHref?: (id: string) => string; projectHref?: (id: string) => string }) {
  const [view, setView] = useState<View>('projects');
  const label: Record<View, string> = {
    projects: `All projects (${s.counts.projects})`,
    completed: `Completed projects (${s.counts.completedProjects})`,
    invoiced: `Invoiced projects (${s.counts.billedProjects})`,
    unbilled: `Unbilled (${s.projects.filter((p) => p.unbilled > 0).length})`,
    pending: `Pending invoices (${s.counts.pendingBills})`,
    paid: `Paid invoices (${s.counts.paidBills})`,
  };
  const projects = s.projects.filter((p) => (view === 'completed' ? ['CLOSED', 'INVOICED'].includes(p.project.status) : view === 'invoiced' ? p.bills.length > 0 : view === 'unbilled' ? p.unbilled > 0 : true));
  const bills = s.bills.filter((b) => (view === 'pending' ? b.status === 'APPROVED' || b.status === 'DRAFT' : b.status === 'PAID'));
  const m = (v: number | null, c: string) => (v == null ? '' : money(v, c));
  return (
    <div className="space-y-4">
      {s.totals && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {([['Unbilled (approved, not on a bill)', s.totals.unbilled, 'unbilled'], ['Pending invoices', s.totals.pendingInvoices, 'pending'], ['Paid invoices', s.totals.paidInvoices, 'paid']] as const).map(([l, v, k]) => (
            <button key={l} type="button" className={clsx('card p-4 text-left hover:border-brand', view === k && 'border-brand')} onClick={() => setView(k)}>
              <div className="text-xs text-muted">{l}</div>
              <div className="mt-1 text-lg font-semibold tabular-nums">{sums(v)}</div>
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Show">
        {VIEWS.map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx('rounded-full border px-3 py-1 text-xs font-medium', view === v ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-panel text-muted hover:border-brand')}>{label[v]}</button>
        ))}
      </div>
      {view === 'pending' || view === 'paid' ? (
        bills.length === 0 ? <Empty>No {view === 'paid' ? 'paid' : 'pending'} invoices.</Empty> : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="border-b border-line bg-sunken/60"><tr><th className="th">Bill</th><th className="th">Vendor invoice</th><th className="th">Status</th><th className="th text-right">Completes</th>{!s.hidePayout && <th className="th text-right">Amount</th>}<th className="th">Due</th><th className="th">Paid on</th><th className="th">Mode of payment</th><th className="th">Reference</th></tr></thead>
              <tbody className="divide-y divide-line">
                {bills.map((b) => (
                  <tr key={b.id}>
                    <td className="td font-mono text-xs">{billHref ? <Link className="text-brand hover:underline" href={billHref(b.id)}>{b.number}</Link> : b.number}</td>
                    <td className="td">{b.vendorReference ?? '–'}</td>
                    <td className="td"><StatusChip status={b.overdue ? 'OVERDUE' : b.status} /></td>
                    <td className="td text-right tabular-nums">{b.completes}</td>
                    {!s.hidePayout && <td className="td text-right tabular-nums">{m(b.total, b.currency)}</td>}
                    <td className={clsx('td', b.overdue && 'text-bad')}>{date(b.dueAt)}</td>
                    <td className="td">{date(b.paidAt)}</td>
                    <td className="td">{b.paymentMode ? PAYMENT_MODES[b.paymentMode] ?? b.paymentMode : '–'}</td>
                    <td className="td font-mono text-xs">{b.paymentReference ?? '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : projects.length === 0 ? (
        <Empty>No projects here yet.</Empty>
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="border-b border-line bg-sunken/60"><tr><th className="th">Project</th><th className="th">Status</th><th className="th text-right">Completes</th><th className="th text-right">Approved</th><th className="th text-right">Rejected</th><th className="th text-right">Waiting approval</th><th className="th text-right">Unbilled</th><th className="th text-right">Billed, not paid</th><th className="th text-right">Paid</th><th className="th">Bills</th></tr></thead>
            <tbody className="divide-y divide-line">
              {projects.map((p) => (
                <tr key={`${p.project.id}:${p.currency}`}>
                  <td className="td">{projectHref ? <Link className="font-medium hover:text-brand hover:underline" href={projectHref(p.project.id)}>{p.project.projectCode}</Link> : <span className="font-medium">{p.project.projectCode}</span>} <span className="text-muted">{p.project.name}</span></td>
                  <td className="td"><StatusChip status={p.project.status} /></td>
                  <td className="td text-right tabular-nums">{p.completes}</td>
                  <td className="td text-right tabular-nums">{p.approved}</td>
                  <td className={clsx('td text-right tabular-nums', p.rejected && 'text-bad')}>{p.rejected}</td>
                  <td className="td text-right tabular-nums">{p.pending}</td>
                  <td className="td text-right tabular-nums">{p.unbilled}{p.unbilledAmount != null && p.unbilled > 0 && <div className="text-xs text-muted">{m(p.unbilledAmount, p.currency)}</div>}</td>
                  <td className="td text-right tabular-nums">{p.billed}{p.billedAmount != null && p.billed > 0 && <div className="text-xs text-muted">{m(p.billedAmount, p.currency)}</div>}</td>
                  <td className="td text-right tabular-nums">{p.paid}{p.paidAmount != null && p.paid > 0 && <div className="text-xs text-muted">{m(p.paidAmount, p.currency)}</div>}</td>
                  <td className="td font-mono text-xs">{p.bills.join(', ') || '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
