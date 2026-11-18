'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, FileSpreadsheet, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBox, Loading, StatusChip, money } from '@/components/ui';
import { get } from '@/lib/api';
import { writeWorkbook, type Cell, type ChartSpec } from '@/lib/xlsx-charts';

export interface ClientReportRow {
  id: string; name: string; projectCode: string; status: string; month: string; workOrderNo: string | null; currency: string;
  cpiMin: number; cpiMax: number; targetCompletes: number; completes: number; approved: number; rejected: number; pending: number;
  revenue: number; cost: number; profit: number; marginPercent: number | null; rejectionPercent: number | null;
}
interface Totals { currency: string; projects: number; completes: number; approved: number; rejected: number; revenue: number; cost: number; profit: number }
export interface ClientReport { client: { id: string; name: string; code: string }; rows: ClientReportRow[]; totals: Totals[] }

const monthName = (m: string) => {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' });
};
const cpi = (r: ClientReportRow) => (r.cpiMin === r.cpiMax ? money(r.cpiMin, r.currency) : `${money(r.cpiMin, r.currency)}–${money(r.cpiMax)}`);
const pct = (n: number | null) => (n == null ? '–' : `${n}%`);

/** Builds the client's Excel: summary with charts, the project table, and totals per currency. */
export function clientReportWorkbook(r: ClientReport): Uint8Array {
  const header = ['Project name', 'Project ID', 'Month & year', 'Work order', 'Currency', 'CPI', 'Target', 'Completes achieved', 'Approved completes', 'Rejected', 'Pending approval', 'Revenue (approved)', 'Cost (approved)', 'Profit', 'Margin', 'Rejection ratio'];
  const data: Cell[][] = [
    header,
    ...r.rows.map((x) => [
      x.name, x.projectCode, monthName(x.month), x.workOrderNo ?? '', x.currency, { v: x.cpiMax, fmt: 'money' as const }, { v: x.targetCompletes, fmt: 'int' as const },
      { v: x.completes, fmt: 'int' as const }, { v: x.approved, fmt: 'int' as const }, { v: x.rejected, fmt: 'int' as const }, { v: x.pending, fmt: 'int' as const },
      { v: x.revenue, fmt: 'money' as const }, { v: x.cost, fmt: 'money' as const }, { v: x.profit, fmt: 'money' as const },
      x.marginPercent == null ? '' : { v: x.marginPercent / 100, fmt: 'percent' as const }, x.rejectionPercent == null ? '' : { v: x.rejectionPercent / 100, fmt: 'percent' as const },
    ]),
  ];
  const t = r.totals;
  const sumAll = (k: 'completes' | 'approved' | 'rejected') => t.reduce((a, x) => a + x[k], 0);
  const pending = Math.max(0, sumAll('completes') - sumAll('approved') - sumAll('rejected'));
  // Summary sheet: totals per currency (rows 3..), then the approval split the pie reads (fixed rows).
  const summary: Cell[][] = [
    [`${r.client.name} (${r.client.code}) · project report`],
    [`Made ${new Date().toLocaleString()} · money per project currency; revenue and cost count approved completes only`],
    ['Currency', 'Projects', 'Completes', 'Approved', 'Rejected', 'Revenue', 'Cost', 'Profit'],
    ...t.map((x) => [x.currency, { v: x.projects, fmt: 'int' as const }, { v: x.completes, fmt: 'int' as const }, { v: x.approved, fmt: 'int' as const }, { v: x.rejected, fmt: 'int' as const }, { v: x.revenue, fmt: 'money' as const }, { v: x.cost, fmt: 'money' as const }, { v: x.profit, fmt: 'money' as const }]),
  ];
  const splitAt = summary.length + 1;
  summary.push([], ['Completes', 'Count'], ['Approved', { v: sumAll('approved'), fmt: 'int' }], ['Rejected', { v: sumAll('rejected'), fmt: 'int' }], ['Pending approval', { v: pending, fmt: 'int' }]);
  const last = data.length - 1;
  const charts: ChartSpec[] = last >= 1
    ? [
        { type: 'pie', title: 'Revenue by project (approved)', dataSheet: 1, categories: { col: 1, from: 1, to: last }, series: [{ name: 'Revenue', col: 11 }], onSheet: 0, at: { col: 0, row: splitAt + 6, cols: 6, rows: 18 } },
        { type: 'doughnut', title: 'Approved, rejected and pending completes', dataSheet: 0, categories: { col: 0, from: splitAt + 1, to: splitAt + 3 }, series: [{ name: 'Completes', col: 1 }], onSheet: 0, at: { col: 6, row: splitAt + 6, cols: 6, rows: 18 } },
        { type: 'column', title: 'Revenue, cost and profit per project', dataSheet: 1, categories: { col: 1, from: 1, to: last }, series: [{ name: 'Revenue', col: 11 }, { name: 'Cost', col: 12 }, { name: 'Profit', col: 13 }], onSheet: 0, at: { col: 0, row: splitAt + 25, cols: 12, rows: 20 } },
        { type: 'pie', title: 'Completes achieved by project', dataSheet: 1, categories: { col: 1, from: 1, to: last }, series: [{ name: 'Completes', col: 7 }], onSheet: 0, at: { col: 0, row: splitAt + 46, cols: 6, rows: 18 } },
        { type: 'column', title: 'Approved vs rejected per project', dataSheet: 1, categories: { col: 1, from: 1, to: last }, series: [{ name: 'Approved', col: 8 }, { name: 'Rejected', col: 9 }], onSheet: 0, at: { col: 6, row: splitAt + 46, cols: 6, rows: 18 } },
      ]
    : [];
  return writeWorkbook(
    [
      { name: 'Summary', rows: summary, headerRows: 0, widths: [22, 12, 12, 12, 12, 14, 14, 14] },
      { name: 'Projects', rows: data },
    ],
    charts,
  );
}

export function downloadClientReport(r: ClientReport) {
  const bytes = clientReportWorkbook(r);
  const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${r.client.code}-projects-report.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** A bar of approved / rejected / pending, for the eye. */
function ApprovalBar({ r }: { r: ClientReportRow }) {
  if (!r.completes) return <span className="text-xs text-muted">–</span>;
  const w = (n: number) => `${(n / r.completes) * 100}%`;
  return (
    <div className="flex h-1.5 w-16 overflow-hidden rounded-full bg-sunken" title={`${r.approved} approved, ${r.rejected} rejected, ${r.pending} pending`}>
      <span className="bg-ok" style={{ width: w(r.approved) }} /><span className="bg-bad" style={{ width: w(r.rejected) }} /><span className="bg-warn/60" style={{ width: w(r.pending) }} />
    </div>
  );
}

/**
 * The client's projects with completes, approvals and money: 10, 25 or 100 a page, and an Excel
 * download with charts. Used in the projects popup and under the client's edit form.
 */
export function ClientProjectsReport({ clientId }: { clientId: string; compact?: boolean }) {
  const [data, setData] = useState<ClientReport | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [take, setTake] = useState(10);
  const [page, setPage] = useState(0);
  useEffect(() => {
    setData(null);
    setPage(0);
    get<ClientReport>(`/clients/${clientId}/projects-report`).then(setData).catch(setError);
  }, [clientId]);
  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const pages = Math.max(1, Math.ceil(data.rows.length / take));
  const rows = data.rows.slice(page * take, page * take + take);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {data.totals.map((t) => (
            <div key={t.currency} className="rounded-lg border border-line px-3 py-1.5 text-xs">
              <span className="font-semibold">{t.projects} projects</span> · {t.approved.toLocaleString()} approved of {t.completes.toLocaleString()} · revenue <b>{money(t.revenue, t.currency)}</b> · profit <b className={clsx(t.profit < 0 ? 'text-bad' : 'text-ok')}>{money(t.profit, t.currency)}</b>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Show
            <select className="input w-auto py-1 text-xs" value={take} onChange={(e) => { setTake(Number(e.target.value)); setPage(0); }} aria-label="Projects per page">
              {[10, 25, 100].map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button className="btn-primary px-3 py-1.5 text-xs" disabled={!data.rows.length} onClick={() => downloadClientReport(data)}><FileSpreadsheet className="h-3.5 w-3.5" /> Download Excel with charts</button>
        </div>
      </div>
      {data.rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No projects for this client yet.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className={clsx('w-full min-w-[1040px] [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5')}>
            <thead className="border-y border-line bg-sunken/60">
              <tr>
                <th className="th">Project name</th><th className="th">Project ID</th><th className="th">Month &amp; year</th><th className="th">Work order</th><th className="th text-right">CPI</th>
                <th className="th text-right">Completes</th><th className="th text-right">Approved</th><th className="th text-right">Revenue</th><th className="th text-right">Cost</th><th className="th text-right">Profit</th><th className="th text-right">Rejection</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="td max-w-[220px]"><Link href={`/projects/${r.id}`} className="block truncate font-medium hover:text-brand hover:underline" title={r.name}>{r.name}</Link><StatusChip status={r.status} /></td>
                  <td className="td font-mono text-xs">{r.projectCode}</td>
                  <td className="td whitespace-nowrap text-sm">{monthName(r.month)}</td>
                  <td className="td text-sm">{r.workOrderNo ?? <span className="text-muted">–</span>}</td>
                  <td className="td whitespace-nowrap text-right text-sm tabular-nums">{cpi(r)}</td>
                  <td className="td text-right tabular-nums">{r.completes.toLocaleString()}<span className="text-xs text-muted"> / {r.targetCompletes.toLocaleString()}</span></td>
                  <td className="td text-right tabular-nums">{r.approved.toLocaleString()}<div className="mt-1 flex justify-end"><ApprovalBar r={r} /></div></td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{money(r.revenue, r.currency)}</td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{money(r.cost, r.currency)}</td>
                  <td className={clsx('td whitespace-nowrap text-right font-medium tabular-nums', r.profit < 0 ? 'text-bad' : r.profit > 0 && 'text-ok')}>{money(r.profit, r.currency)}{r.marginPercent != null && <span className="block text-[11px] font-normal text-muted">{r.marginPercent}% margin</span>}</td>
                  <td className={clsx('td text-right tabular-nums', (r.rejectionPercent ?? 0) > 10 && 'text-bad')}>{pct(r.rejectionPercent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {data.rows.length > take && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">{page * take + 1}–{Math.min(data.rows.length, (page + 1) * take)} of {data.rows.length}</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="tabular-nums">Page {page + 1} of {pages}</span>
            <button className="btn-ghost px-2 py-1" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      )}
      <p className="mt-3 text-xs text-muted">Approved completes come from reconciliation (project → Reconcile &amp; invoice). Revenue and cost count approved completes only. Rejection ratio = rejected ÷ (approved + rejected).</p>
    </div>
  );
}

/** Popup from the Projects number on the Clients list. */
export function ClientProjectsPopup({ client, onClose }: { client: { id: string; name: string }; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [onClose]);
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="client-report-title" className="card w-full max-w-7xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="client-report-title" className="text-base font-semibold">Projects · {client.name}</h2>
          <button className="btn-ghost p-1.5" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="px-5 py-4"><ClientProjectsReport clientId={client.id} compact /></div>
      </div>
    </div>,
    document.body,
  );
}
