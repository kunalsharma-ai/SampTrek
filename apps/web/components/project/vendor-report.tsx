'use client';
import clsx from 'clsx';
import { ChevronLeft, ChevronRight, Columns3, Download, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ErrorBox, Loading, OutcomeChip } from '@/components/ui';
import { get } from '@/lib/api';
import { countryName, flag } from '@/lib/countries';
import { downloadCsv } from '@/lib/csv';

interface Row {
  uid: string;
  respondentId: string;
  vendor: string;
  country: string;
  targetGroup: string | null;
  ipId: string | null;
  device: string | null;
  loiMinutes: number | null;
  status: string;
  statusDetail: string | null;
  test: boolean;
  gate: Record<string, string>;
  startedAt: string;
  endedAt: string | null;
}
interface Report { total: number; vendor: { name: string; code: string }; gateQuestions: { id: string; text: string }[]; rows: Row[] }

/** The outcomes as the team names them. */
const STATUS_TEXT: Record<string, string> = {
  DROPOUT: 'Dropout', STARTED: 'In survey', COMPLETE: 'Complete', TERMINATE: 'Terminate', QUALITY_FAIL: 'Quality fail',
  SECURITY_REJECT: 'Security', QUOTA_FULL: 'Quota full', DUPLICATE: 'Duplicate', TECHNICAL_ERROR: 'Technical error', SPEEDER: 'Speeder',
};
const when = (d: string | null) => (d ? new Date(d).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' }) : '');

type Col = { key: string; label: string; text: (r: Row) => string; cell?: (r: Row) => React.ReactNode };
const BASE_COLS: Col[] = [
  { key: 'uid', label: 'UID', text: (r) => r.uid, cell: (r) => <span className="font-mono text-xs">{r.uid}</span> },
  { key: 'respondentId', label: 'Respondent ID', text: (r) => r.respondentId, cell: (r) => <span className="font-mono text-xs">{r.respondentId}{r.test && <span className="ml-1.5 chip bg-info/15 text-info">test</span>}</span> },
  { key: 'vendor', label: 'Vendor (ID)', text: (r) => r.vendor },
  { key: 'country', label: 'Country', text: (r) => countryName(r.country), cell: (r) => <span className="whitespace-nowrap">{flag(r.country)} {countryName(r.country)}</span> },
  { key: 'ipId', label: 'IP used', text: (r) => r.ipId ?? '', cell: (r) => <span className="font-mono text-xs" title="Hashed IP ID: the same ID means the same IP address">{r.ipId ?? '–'}</span> },
  { key: 'targetGroup', label: 'Target group', text: (r) => r.targetGroup ?? '' },
  { key: 'loi', label: 'LOI (min)', text: (r) => (r.loiMinutes == null ? '' : String(r.loiMinutes)) },
  { key: 'status', label: 'Status', text: (r) => STATUS_TEXT[r.status] ?? r.status, cell: (r) => (r.status === 'DROPOUT' ? <span className="chip bg-sunken text-muted">Dropout</span> : <span title={r.statusDetail ?? undefined}><OutcomeChip status={r.status} /></span>) },
  { key: 'statusDetail', label: 'Reason', text: (r) => r.statusDetail ?? '' },
  { key: 'device', label: 'Device', text: (r) => r.device ?? '' },
  { key: 'startedAt', label: 'Start time', text: (r) => when(r.startedAt), cell: (r) => <span className="whitespace-nowrap text-xs">{when(r.startedAt)}</span> },
  { key: 'endedAt', label: 'End time', text: (r) => when(r.endedAt), cell: (r) => <span className="whitespace-nowrap text-xs">{when(r.endedAt)}</span> },
];
/** Shown until the person picks otherwise in this window. */
const HIDDEN_AT_START = new Set(['statusDetail', 'device']);

/**
 * "View report" for one vendor in a project: its respondents, 10 / 25 / 100 a page, with search,
 * a field chooser and a download of the chosen fields. The field choice lasts for this window
 * only; it is not saved and changes no other table.
 */
export function VendorReport({ projectId, projectCode, vendorId, vendorName, onClose }: { projectId: string; projectCode: string; vendorId: string; vendorName: string; onClose: () => void }) {
  return <RespondentReport projectId={projectId} projectCode={projectCode} vendorId={vendorId} title={vendorName} onClose={onClose} />;
}

/** The filters on a fieldwork status card, and in the View data popup. */
export const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: '', label: 'All outcomes' },
  { value: 'COMPLETE', label: 'Completes' },
  { value: 'STARTED', label: 'In progress' },
  { value: 'TERMINATE', label: 'Terminates' },
  { value: 'QUOTA_FULL', label: 'Overquota / quota full' },
  { value: 'SPEEDER', label: 'Speeders' },
  { value: 'QUALITY', label: 'Quality, duplicate, security' },
  { value: 'DUPLICATE', label: 'Duplicates only' },
  { value: 'SECURITY_REJECT', label: 'Security only' },
  { value: 'PARTIAL', label: 'Dropouts (partial)' },
];

/**
 * Respondents of a project, for one vendor (View report) or every vendor (status cards, View data),
 * optionally one outcome. Same table, paging, field chooser and download for both.
 */
export function RespondentReport({ projectId, projectCode, vendorId, title, status: initialStatus = '', onClose }: { projectId: string; projectCode: string; vendorId?: string; title: string; status?: string; onClose: () => void }) {
  const [status, setStatus] = useState(initialStatus);
  const [take, setTake] = useState(10);
  const [page, setPage] = useState(0);
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [includeTest, setIncludeTest] = useState(false);
  const [data, setData] = useState<Report | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hidden, setHidden] = useState<Set<string>>(HIDDEN_AT_START);
  const [chooser, setChooser] = useState(false);
  const [busy, setBusy] = useState(false);
  const chooserRef = useRef<HTMLDivElement>(null);

  // Search waits for a pause in typing.
  useEffect(() => {
    const t = setTimeout(() => { setSearch(q.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [q]);
  const params = (extra: Record<string, string>) => new URLSearchParams({ ...(search ? { q: search } : {}), ...(includeTest ? { includeTest: 'true' } : {}), ...(status ? { status } : {}), ...extra }).toString();
  const base = vendorId ? `/projects/${projectId}/vendors/${vendorId}/report` : `/projects/${projectId}/report`;
  useEffect(() => {
    setError(null);
    get<Report>(`${base}?${params({ skip: String(page * take), take: String(take) })}`).then(setData).catch(setError);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, page, take, search, includeTest, status]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && (chooser ? setChooser(false) : onClose());
    const out = (e: MouseEvent) => chooser && chooserRef.current && !chooserRef.current.contains(e.target as Node) && setChooser(false);
    document.addEventListener('keydown', esc);
    document.addEventListener('mousedown', out);
    return () => { document.removeEventListener('keydown', esc); document.removeEventListener('mousedown', out); };
  }, [chooser, onClose]);

  const cols = useMemo<Col[]>(() => {
    const gate: Col[] = (data?.gateQuestions ?? []).map((g) => ({ key: `gate:${g.id}`, label: `Gate: ${g.text}`, text: (r) => r.gate[g.id] ?? '' }));
    // Gate answers go before the times, as in the feedback's column list.
    const at = BASE_COLS.findIndex((c) => c.key === 'startedAt');
    return [...BASE_COLS.slice(0, at), ...gate, ...BASE_COLS.slice(at)];
  }, [data?.gateQuestions]);
  const shown = cols.filter((c) => !hidden.has(c.key));
  const pages = data ? Math.max(1, Math.ceil(data.total / take)) : 1;

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const all = await get<Report>(`${base}?${params({ all: 'true' })}`);
      downloadCsv(`${projectCode}-${title.replace(/[^\w-]+/g, '_')}${status ? `-${status.toLowerCase()}` : ''}-report.csv`, shown.map((c) => c.label), all.rows.map((r) => shown.map((c) => c.text(r))));
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="vendor-report-title" className="card w-full max-w-6xl">
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 id="vendor-report-title" className="text-base font-semibold">Report · {title}{status ? ` · ${STATUS_FILTERS.find((f) => f.value === status)?.label ?? status}` : ''}{data && <span className="font-normal text-muted"> · {data.total.toLocaleString()} {data.total === 1 ? 'respondent' : 'respondents'}</span>}</h2>
          <button className="btn-ghost p-1.5" aria-label="Close" onClick={onClose}><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
          <label className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-8" placeholder="Search UID, respondent ID, country code, target group, reason" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the report" />
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            Show
            <select className="input w-auto py-1.5" value={take} onChange={(e) => { setTake(Number(e.target.value)); setPage(0); }} aria-label="Entries per page">
              {[10, 25, 100].map((n) => <option key={n} value={n}>{n} entries</option>)}
            </select>
          </label>
          <select className="input w-auto py-1.5 text-xs" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} aria-label="Outcome">
            {STATUS_FILTERS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={includeTest} onChange={(e) => { setIncludeTest(e.target.checked); setPage(0); }} /> Test entries</label>
          <div className="relative" ref={chooserRef}>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" aria-expanded={chooser} onClick={() => setChooser(!chooser)}><Columns3 className="h-3.5 w-3.5" /> Fields ({shown.length}/{cols.length})</button>
            {chooser && (
              <div className="absolute right-0 z-10 mt-1 max-h-80 w-64 overflow-y-auto rounded-lg border border-line bg-panel p-2 shadow-lg" role="group" aria-label="Fields to show and download">
                <p className="px-2 pb-1 text-xs text-muted">For this window only. The download uses the same fields.</p>
                {cols.map((c) => (
                  <label key={c.key} className="flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-sunken">
                    <input type="checkbox" checked={!hidden.has(c.key)} disabled={!hidden.has(c.key) && shown.length === 1} onChange={(e) => setHidden((h) => { const n = new Set(h); if (e.target.checked) n.delete(c.key); else n.add(c.key); return n; })} />
                    <span className="truncate">{c.label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
          <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={busy || !data?.total} onClick={download}><Download className="h-3.5 w-3.5" /> {busy ? 'Preparing…' : 'Download CSV'}</button>
        </div>
        <div className="px-5 pt-3"><ErrorBox error={error} /></div>
        {!data ? (
          <div className="p-6"><Loading /></div>
        ) : data.rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">{search ? 'No respondent matches the search.' : status ? 'No respondents with this outcome yet.' : vendorId ? 'No respondents from this vendor yet.' : 'No respondents yet.'}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="border-y border-line bg-sunken/60"><tr>{shown.map((c) => <th key={c.key} className="th whitespace-nowrap">{c.label}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {data.rows.map((r) => (
                  <tr key={r.uid}>{shown.map((c) => <td key={c.key} className={clsx('td text-sm', c.key.startsWith('gate:') && 'max-w-[220px] truncate')} title={c.key.startsWith('gate:') ? c.text(r) : undefined}>{c.cell ? c.cell(r) : c.text(r) || <span className="text-muted">–</span>}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 text-sm">
          <span className="text-muted">{data && data.total > 0 ? `${(page * take + 1).toLocaleString()}–${Math.min(data.total, (page + 1) * take).toLocaleString()} of ${data.total.toLocaleString()}` : ''}</span>
          <div className="flex items-center gap-2">
            <button className="btn-ghost px-2 py-1" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></button>
            <span className="tabular-nums">Page {page + 1} of {pages}</span>
            <button className="btn-ghost px-2 py-1" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
