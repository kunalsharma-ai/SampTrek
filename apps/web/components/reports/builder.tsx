'use client';
/**
 * The four reports of the REPORT menu (feedback 2026-11-23): Overall, Client, Vendor and Conversion.
 * Date presets, multi-select filters, a column chooser in groups, paging, Excel and CSV download.
 * The conversion report also approves or rejects completes, one by one or the selected ones;
 * completes already on a client invoice or a vendor bill show “Already invoiced” instead.
 *
 * Picking a column from the Data group splits the rows by it (e.g. Vendor name gives one row per
 * project and vendor). API: POST /reports/builder/:kind (src/reports/report-builder.ts).
 */
import clsx from 'clsx';
import { Check, Columns3, Download, FileSpreadsheet, Play, RotateCcw, X } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Combobox, type Option } from '@/components/form/combobox';
import { canEdit, useMe } from '@/components/me';
import { Pager } from '@/components/pager';
import { Empty, ErrorBox, Field, Loading, OutcomeChip, PageHeader, Section, money } from '@/components/ui';
import { get, post } from '@/lib/api';
import { countryName, flag } from '@/lib/countries';
import { downloadCsv } from '@/lib/csv';
import { STATUS_LABEL } from '@/lib/types';
import { downloadXlsx } from '@/lib/xlsx';

export type ReportKind = 'overall' | 'client' | 'vendor' | 'conversion';
type Dim = 'client' | 'contact' | 'vendor' | 'project' | 'pm' | 'sales' | 'type' | 'category' | 'market' | 'country' | 'targetGroup' | 'device' | 'os';
type Fmt = 'num' | 'money' | 'pct' | 'min' | 'date' | 'text' | 'status' | 'approval';
interface Col { key: string; label: string; group: string; dim?: Dim; fmt?: Fmt; on?: boolean }

interface Options {
  clients: { id: string; code: string; name: string }[];
  contacts: { id: string; name: string; clientId: string }[];
  vendors: { id: string; code: string; name: string }[];
  projects: { id: string; projectCode: string; workOrderNo: string | null; name: string; clientId: string }[];
  projectManagers: { id: string; name: string }[];
  salesPeople: { id: string; name: string }[];
  projectTypes: string[];
  countries: string[];
  statuses: string[];
}
type Row = Record<string, unknown>;
interface Result { rows: Row[]; total: number; totals?: Row | null; currency: string; missingRates?: string[]; questions?: { key: string; label: string }[]; truncated?: boolean }

const TYPE_LABEL: Record<string, string> = { AD_HOC: 'Ad-hoc', TRACKER: 'Tracker', QUALITATIVE: 'Qualitative', LONGITUDINAL: 'Longitudinal' };
const APPROVAL_LABEL: Record<string, string> = { PENDING: 'Pending', APPROVED: 'Approved', REJECTED: 'Rejected', NOT_APPLICABLE: 'Not applicable' };
const statusName = (s: string) => (s === 'SPEEDER' ? 'Speeder' : STATUS_LABEL[s] ?? s);

/* ---------- Columns ---------- */

const DATA: Col[] = [
  { key: 'projectCode', label: 'Project ID', group: 'Data', dim: 'project', on: true },
  { key: 'workOrderNo', label: 'Work order', group: 'Data', dim: 'project', on: true },
  { key: 'projectName', label: 'Project name', group: 'Data', dim: 'project', on: true },
  { key: 'projectStatus', label: 'Project status', group: 'Data', dim: 'project', fmt: 'status' },
  { key: 'clientName', label: 'Client name', group: 'Data', dim: 'client', on: true },
  { key: 'clientCode', label: 'Client ID', group: 'Data', dim: 'client' },
  { key: 'clientContact', label: 'Client contact', group: 'Data', dim: 'contact' },
  { key: 'vendorName', label: 'Vendor name', group: 'Data', dim: 'vendor' },
  { key: 'vendorCode', label: 'Vendor ID', group: 'Data', dim: 'vendor' },
  { key: 'projectManager', label: 'Project manager', group: 'Data', dim: 'pm' },
  { key: 'salesPerson', label: 'Sales person', group: 'Data', dim: 'sales' },
  { key: 'projectType', label: 'Project type', group: 'Data', dim: 'type' },
  { key: 'projectCategory', label: 'Category', group: 'Data', dim: 'category' },
  { key: 'market', label: 'Market', group: 'Data', dim: 'market' },
  { key: 'countryCode', label: 'Country', group: 'Data', dim: 'country' },
  { key: 'targetGroup', label: 'Target group', group: 'Data', dim: 'targetGroup' },
  { key: 'device', label: 'Device', group: 'Data', dim: 'device' },
  { key: 'os', label: 'Operating system', group: 'Data', dim: 'os' },
];
const OBSERVATION: Col[] = [
  { key: 'quotedIr', label: 'Quoted IR %', group: 'Observation', fmt: 'pct', on: true },
  { key: 'observedIr', label: 'Observed IR %', group: 'Observation', fmt: 'pct', on: true },
  { key: 'quotedLoi', label: 'Quoted LOI', group: 'Observation', fmt: 'min', on: true },
  { key: 'avgLoi', label: 'Average LOI', group: 'Observation', fmt: 'min', on: true },
];
const STATISTICS: Col[] = [
  { key: 'grossClicks', label: 'Gross clicks', group: 'Statistics', fmt: 'num' },
  { key: 'clicks', label: 'Clicks', group: 'Statistics', fmt: 'num', on: true },
  { key: 'completes', label: 'Completes', group: 'Statistics', fmt: 'num', on: true },
  { key: 'approved', label: 'Approved', group: 'Statistics', fmt: 'num' },
  { key: 'rejected', label: 'Rejected', group: 'Statistics', fmt: 'num' },
  { key: 'pending', label: 'Pending approval', group: 'Statistics', fmt: 'num' },
  { key: 'terminates', label: 'Terminates', group: 'Statistics', fmt: 'num', on: true },
  { key: 'overquota', label: 'Over quota', group: 'Statistics', fmt: 'num', on: true },
  { key: 'security', label: 'Security', group: 'Statistics', fmt: 'num', on: true },
  { key: 'speeders', label: 'Speeders', group: 'Statistics', fmt: 'num' },
  { key: 'dropouts', label: 'Drop-outs', group: 'Statistics', fmt: 'num' },
  { key: 'inProgress', label: 'In progress', group: 'Statistics', fmt: 'num' },
];
const FINANCIAL: Col[] = [
  { key: 'revenue', label: 'Revenue', group: 'Financial', fmt: 'money', on: true },
  { key: 'payout', label: 'Vendor cost', group: 'Financial', fmt: 'money', on: true },
  { key: 'profit', label: 'Profit', group: 'Financial', fmt: 'money', on: true },
  { key: 'margin', label: 'Margin %', group: 'Financial', fmt: 'pct', on: true },
];
const CALCULATIONS: Col[] = [
  { key: 'conversion', label: 'Conversion %', group: 'Calculations', fmt: 'pct', on: true },
  { key: 'approvalRatio', label: 'Approval ratio %', group: 'Calculations', fmt: 'pct' },
  { key: 'rejectionRatio', label: 'Rejection ratio %', group: 'Calculations', fmt: 'pct' },
  { key: 'costPerClick', label: 'Cost per click', group: 'Calculations', fmt: 'money' },
  { key: 'revenuePerClick', label: 'Revenue per click', group: 'Calculations', fmt: 'money' },
  { key: 'profitPerClick', label: 'Profit per click', group: 'Calculations', fmt: 'money' },
];
const VENDOR_DIMS: Dim[] = ['vendor'];
const CLIENT_DIMS: Dim[] = ['client', 'contact', 'pm', 'sales', 'type', 'category'];
const regroup = (cols: Col[], group: string) => cols.map((c) => ({ ...c, group }));

const COLUMNS: Record<Exclude<ReportKind, 'conversion'>, Col[]> = {
  overall: [...DATA, ...OBSERVATION, ...STATISTICS, ...FINANCIAL, ...CALCULATIONS],
  // No vendor fields: the client's projects, what they paid and how fieldwork went.
  client: [
    ...regroup([...DATA.filter((c) => !VENDOR_DIMS.includes(c.dim!)), ...STATISTICS], 'Common'),
    ...regroup([...FINANCIAL.filter((c) => c.key === 'revenue'), { key: 'revenuePerClick', label: 'Revenue per click', group: '', fmt: 'money' }, { key: 'conversion', label: 'Conversion %', group: '', fmt: 'pct', on: true }, { key: 'approvalRatio', label: 'Approval ratio %', group: '', fmt: 'pct' }, { key: 'rejectionRatio', label: 'Rejection ratio %', group: '', fmt: 'pct' }], 'Finance'),
    ...OBSERVATION,
  ],
  // No client information.
  vendor: [
    ...regroup([
      { key: 'vendorName', label: 'Vendor name', group: '', dim: 'vendor', on: true },
      { key: 'vendorCode', label: 'Vendor ID', group: '', dim: 'vendor', on: true },
      ...DATA.filter((c) => c.dim === 'project' || ['market', 'country', 'targetGroup', 'device', 'os'].includes(c.dim!)).map((c) => ({ ...c, on: c.dim === 'project' && c.key !== 'projectStatus' })),
      ...STATISTICS,
    ], 'Common'),
    ...regroup([FINANCIAL[1], { ...CALCULATIONS[3] }, { key: 'conversion', label: 'Conversion %', group: '', fmt: 'pct' as const, on: true }, CALCULATIONS[1], CALCULATIONS[2]], 'Finance'),
    ...OBSERVATION,
  ],
};
const CONVERSION: Col[] = [
  { key: 'projectCode', label: 'Project ID', group: 'Common', on: true },
  { key: 'workOrderNo', label: 'Work order', group: 'Common' },
  { key: 'projectName', label: 'Project name', group: 'Common' },
  { key: 'clientName', label: 'Client', group: 'Common', on: true },
  { key: 'vendorName', label: 'Vendor', group: 'Common', on: true },
  { key: 'market', label: 'Market', group: 'Common', on: true },
  { key: 'uid', label: 'UID (our ID)', group: 'Common', on: true },
  { key: 'vid', label: 'VID (vendor ID)', group: 'Common', on: true },
  { key: 'responseStatus', label: 'Response status', group: 'Common', fmt: 'status', on: true },
  { key: 'approval', label: 'Conversion status', group: 'Common', fmt: 'approval', on: true },
  { key: 'revenue', label: 'Revenue', group: 'Common', fmt: 'money', on: true },
  { key: 'payout', label: 'Vendor cost', group: 'Common', fmt: 'money', on: true },
  { key: 'profit', label: 'Profit', group: 'Common', fmt: 'money' },
  { key: 'loi', label: 'LOI', group: 'Common', fmt: 'min', on: true },
  { key: 'ipId', label: 'IP ID', group: 'Telemetry' },
  { key: 'language', label: 'Language', group: 'Telemetry' },
  { key: 'platform', label: 'Platform (browser)', group: 'Telemetry' },
  { key: 'deviceType', label: 'Device type', group: 'Telemetry' },
  { key: 'os', label: 'Operating system', group: 'Telemetry' },
  { key: 'country', label: 'Country (IP)', group: 'Telemetry' },
  { key: 'browserId', label: 'Browser ID', group: 'Telemetry' },
  { key: 'riskScore', label: 'Risk score', group: 'Telemetry', fmt: 'num' },
  { key: 'userAgent', label: 'User agent', group: 'Telemetry' },
  { key: 'captchaAt', label: 'Captcha passed', group: 'Timeline', fmt: 'date' },
  { key: 'gateAt', label: 'Gate passed', group: 'Timeline', fmt: 'date' },
  { key: 'surveyStartAt', label: 'Survey start', group: 'Timeline', fmt: 'date' },
  { key: 'endPageAt', label: 'End page', group: 'Timeline', fmt: 'date', on: true },
  { key: 'createdAt', label: 'Created', group: 'Timeline', fmt: 'date' },
];

const TITLES: Record<ReportKind, [string, string]> = {
  overall: ['Overall report', 'Every project, client and vendor in one table. Pick columns from Data to split the rows (e.g. by vendor or market).'],
  client: ['Client report', 'Per client: projects, fieldwork, revenue and observed IR and LOI. No vendor information.'],
  vendor: ['Vendor report', 'Per vendor: projects, clicks, completes, cost and quality. No client information.'],
  conversion: ['Conversion report', 'Every respondent, with telemetry, gate answers and timeline. Approve or reject completes at the end of each row, or many at once.'],
};

/* ---------- Dates ---------- */

const PRESETS = ['today', 'yesterday', 'thisWeek', 'thisMonth', 'pastMonth', 'thisYear', 'pastYear', 'all', 'custom'] as const;
type Preset = (typeof PRESETS)[number];
const PRESET_LABEL: Record<Preset, string> = { today: 'Today', yesterday: 'Yesterday', thisWeek: 'This week', thisMonth: 'This month', pastMonth: 'Past month', thisYear: 'This year', pastYear: 'Past year', all: 'All time', custom: 'Custom' };
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function presetRange(p: Preset, now = new Date()): { from?: string; to?: string } {
  const y = now.getFullYear();
  const m = now.getMonth();
  const day = (offset: number) => new Date(y, m, now.getDate() + offset);
  switch (p) {
    case 'today': return { from: ymd(now), to: ymd(now) };
    case 'yesterday': return { from: ymd(day(-1)), to: ymd(day(-1)) };
    case 'thisWeek': return { from: ymd(day(-((now.getDay() + 6) % 7))), to: ymd(now) }; // weeks start on Monday
    case 'thisMonth': return { from: ymd(new Date(y, m, 1)), to: ymd(now) };
    case 'pastMonth': return { from: ymd(new Date(y, m - 1, 1)), to: ymd(new Date(y, m, 0)) };
    case 'thisYear': return { from: ymd(new Date(y, 0, 1)), to: ymd(now) };
    case 'pastYear': return { from: ymd(new Date(y - 1, 0, 1)), to: ymd(new Date(y - 1, 11, 31)) };
    default: return {};
  }
}

/* ---------- Filters ---------- */

interface Filters {
  preset: Preset; from: string; to: string;
  clientIds: string[]; contactIds: string[]; vendorIds: string[]; projectIds: string[]; projectManagerIds: string[]; salesPersonIds: string[]; projectTypes: string[]; countryCodes: string[];
  statuses: string[]; approvals: string[];
}
const EMPTY: Filters = { preset: 'thisMonth', from: '', to: '', clientIds: [], contactIds: [], vendorIds: [], projectIds: [], projectManagerIds: [], salesPersonIds: [], projectTypes: [], countryCodes: [], statuses: [], approvals: [] };
const startFilters = (kind: ReportKind): Filters => (kind === 'conversion' ? { ...EMPTY, statuses: ['COMPLETE'] } : EMPTY);

function body(kind: ReportKind, f: Filters, groupBy: Dim[], page: number, pageSize: number, exp = false) {
  const range = f.preset === 'custom' ? { from: f.from || undefined, to: f.to || undefined } : presetRange(f.preset);
  const b: Record<string, unknown> = { ...range, projectIds: f.projectIds, projectManagerIds: f.projectManagerIds, salesPersonIds: f.salesPersonIds, projectTypes: f.projectTypes, countryCodes: f.countryCodes, page, pageSize, export: exp };
  if (kind !== 'vendor') Object.assign(b, { clientIds: f.clientIds, contactIds: f.contactIds });
  if (kind !== 'client') b.vendorIds = f.vendorIds;
  if (kind === 'conversion') Object.assign(b, { statuses: f.statuses, approvals: f.approvals });
  else b.groupBy = groupBy;
  return b;
}

/* ---------- Formatting ---------- */

function show(c: Col, r: Row, currency: string): string {
  const v = c.key.startsWith('q:') ? (r.answers as Record<string, unknown> | undefined)?.[c.key.slice(2)] : r[c.key];
  if (v == null || v === '') return '';
  switch (c.fmt) {
    case 'money': return money(Number(v), (r.currency as string) ?? currency);
    case 'pct': return `${v}%`;
    case 'min': return `${v} min`;
    case 'num': return Number(v).toLocaleString();
    case 'date': return new Date(String(v)).toLocaleString();
    case 'status': return statusName(String(v));
    case 'approval': return APPROVAL_LABEL[String(v)] ?? String(v);
    default:
      if (c.key === 'projectType') return TYPE_LABEL[String(v)] ?? String(v);
      if (c.key === 'countryCode') return `${flag(String(v))} ${String(v)}`;
      return String(v);
  }
}
/** Plain value for Excel and CSV: numbers stay numbers. */
function raw(c: Col, r: Row): string | number | null {
  const v = c.key.startsWith('q:') ? (r.answers as Record<string, unknown> | undefined)?.[c.key.slice(2)] : r[c.key];
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (c.fmt === 'status') return statusName(String(v));
  if (c.fmt === 'approval') return APPROVAL_LABEL[String(v)] ?? String(v);
  if (c.fmt === 'date') return new Date(String(v)).toISOString().replace('T', ' ').slice(0, 19);
  if (c.key === 'projectType') return TYPE_LABEL[String(v)] ?? String(v);
  return String(v);
}

const storeKey = (kind: ReportKind) => `samptrek:report-columns:${kind}`;
function loadCols(kind: ReportKind, all: Col[]): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(kind)) ?? 'null');
    if (Array.isArray(v) && v.length) return v.filter((k: unknown) => typeof k === 'string');
  } catch {}
  return all.filter((c) => c.on).map((c) => c.key);
}

/* ---------- Component ---------- */

export function ReportBuilder({ kind }: { kind: ReportKind }) {
  const me = useMe();
  const editor = canEdit(me);
  const [opts, setOpts] = useState<Options | null>(null);
  const [f, setF] = useState<Filters>(() => startFilters(kind));
  const [applied, setApplied] = useState<Filters>(() => startFilters(kind));
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [res, setRes] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [choosing, setChoosing] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const baseCols = useMemo(() => (kind === 'conversion' ? CONVERSION : COLUMNS[kind]), [kind]);
  const allCols = useMemo<Col[]>(() => (kind === 'conversion' ? [...CONVERSION, ...(res?.questions ?? []).map((q) => ({ key: `q:${q.key}`, label: q.label, group: 'Gate survey' }))] : baseCols), [kind, baseCols, res?.questions]);
  const [cols, setCols] = useState<string[]>(() => baseCols.filter((c) => c.on).map((c) => c.key));
  useEffect(() => setCols(loadCols(kind, baseCols)), [kind, baseCols]);
  const saveCols = (next: string[]) => {
    setCols(next);
    try {
      localStorage.setItem(storeKey(kind), JSON.stringify(next));
    } catch {}
  };
  const shown = allCols.filter((c) => cols.includes(c.key));
  const groupBy = useMemo(() => [...new Set(shown.map((c) => c.dim).filter((d): d is Dim => !!d))], [shown]);
  const groupKey = groupBy.join(',');

  useEffect(() => {
    get<Options>('/reports/builder/options').then(setOpts).catch(setError);
  }, []);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setRes(await post<Result>(`/reports/builder/${kind}`, body(kind, applied, groupKey ? (groupKey.split(',') as Dim[]) : [], page, pageSize)));
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [kind, applied, groupKey, page, pageSize]);
  useEffect(() => {
    void run();
  }, [run]);

  async function download(type: 'xlsx' | 'csv') {
    setError(null);
    try {
      const all = await post<Result>(`/reports/builder/${kind}`, body(kind, applied, groupBy, 1, 500, true));
      const header = shown.map((c) => (c.fmt === 'money' && kind !== 'conversion' ? `${c.label} (${all.currency})` : c.label));
      const rows = all.rows.map((r) => shown.map((c) => raw(c, r)));
      if (kind === 'conversion' && shown.some((c) => c.fmt === 'money')) {
        header.push('Currency');
        all.rows.forEach((r, i) => rows[i].push(String(r.currency ?? '')));
      }
      if (all.totals) rows.push(shown.map((c, i) => (i === 0 ? 'Total' : c.dim ? null : raw(c, all.totals!))));
      const name = `${kind}-report-${new Date().toISOString().slice(0, 10)}`;
      if (type === 'csv') downloadCsv(`${name}.csv`, header, rows);
      else downloadXlsx(`${name}.xlsx`, [header, ...rows], TITLES[kind][0]);
      if (all.truncated) setNote('The download has the first 50,000 rows. Narrow the dates or filters for the rest.');
    } catch (e) {
      setError(e);
    }
  }

  async function approve(ids: string[], approval: 'APPROVED' | 'REJECTED') {
    if (!ids.length) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const r = await post<{ updated: number; locked: number; skipped: number }>('/reports/builder/conversion/approval', { sessionIds: ids, approval });
      const verb = approval === 'APPROVED' ? 'approved' : 'rejected';
      setNote(`${r.updated} ${r.updated === 1 ? 'complete' : 'completes'} ${verb}.${r.locked ? ` ${r.locked} already invoiced or billed, left as they were.` : ''}${r.skipped ? ` ${r.skipped} not completes, left out.` : ''}`);
      setPicked(new Set());
      await run();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  const apply = () => {
    setPage(1);
    setApplied(f);
  };
  const reset = () => {
    const s = startFilters(kind);
    setF(s);
    setApplied(s);
    setPage(1);
  };

  const o = (xs: { id: string; name: string; code?: string }[] | undefined): Option[] => (xs ?? []).map((x) => ({ value: x.id, label: x.name, hint: x.code }));
  const projectOpts: Option[] = (opts?.projects ?? []).filter((p) => !f.clientIds.length || f.clientIds.includes(p.clientId)).map((p) => ({ value: p.id, label: `${p.projectCode} · ${p.name}`, hint: p.workOrderNo ?? undefined }));
  const contactOpts: Option[] = (opts?.contacts ?? []).filter((c) => !f.clientIds.length || f.clientIds.includes(c.clientId)).map((c) => ({ value: c.id, label: c.name }));
  const rows = res?.rows ?? [];
  const completes = rows.filter((r) => r.responseStatus === 'COMPLETE');
  const selectable = completes.filter((r) => !r.locked);
  const pickedRows = rows.filter((r) => picked.has(String(r.id)));
  const toReject = pickedRows.filter((r) => r.responseStatus === 'COMPLETE' && !r.locked && r.approval !== 'REJECTED').map((r) => String(r.id));
  const toApprove = pickedRows.filter((r) => r.responseStatus === 'COMPLETE' && !r.locked && r.approval === 'REJECTED').map((r) => String(r.id));
  const groups = [...new Set(allCols.map((c) => c.group))];
  const [title, subtitle] = TITLES[kind];

  return (
    <>
      <PageHeader title={title} subtitle={subtitle} help={`page:/reports/${kind}`} actions={<Link className="btn-ghost" href="/reports">Older report views</Link>} />

      <Section title="Filters" className="mb-4">
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-2" role="radiogroup" aria-label="Date range">
            {PRESETS.map((p) => (
              <button key={p} type="button" role="radio" aria-checked={f.preset === p} onClick={() => setF({ ...f, preset: p })} className={clsx('rounded-full border px-3 py-1 text-xs font-medium', f.preset === p ? 'border-brand bg-brand text-brand-ink' : 'border-line bg-panel text-muted hover:border-brand')}>
                {PRESET_LABEL[p]}
              </button>
            ))}
            {f.preset === 'custom' && (
              <span className="flex items-end gap-2">
                <label className="text-xs text-muted">From<input type="date" className="input mt-0.5 py-1 text-sm" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></label>
                <label className="text-xs text-muted">To<input type="date" className="input mt-0.5 py-1 text-sm" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></label>
              </span>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {kind !== 'vendor' && <Field label="Client"><Combobox multiple options={o(opts?.clients)} value={f.clientIds} onChange={(v) => setF({ ...f, clientIds: v })} placeholder="All clients" /></Field>}
            {kind !== 'vendor' && <Field label="Client contact"><Combobox multiple options={contactOpts} value={f.contactIds} onChange={(v) => setF({ ...f, contactIds: v })} placeholder="All contacts" /></Field>}
            {kind !== 'client' && <Field label="Vendor"><Combobox multiple options={o(opts?.vendors)} value={f.vendorIds} onChange={(v) => setF({ ...f, vendorIds: v })} placeholder="All vendors" /></Field>}
            <Field label="Project"><Combobox multiple options={projectOpts} value={f.projectIds} onChange={(v) => setF({ ...f, projectIds: v })} placeholder="All projects" /></Field>
            {kind !== 'conversion' && <Field label="Project type"><Combobox multiple options={(opts?.projectTypes ?? []).map((t) => ({ value: t, label: TYPE_LABEL[t] ?? t }))} value={f.projectTypes} onChange={(v) => setF({ ...f, projectTypes: v })} placeholder="Ad-hoc, tracker, qualitative, longitudinal" /></Field>}
            {kind !== 'conversion' && kind !== 'vendor' && <Field label="Project manager"><Combobox multiple options={o(opts?.projectManagers)} value={f.projectManagerIds} onChange={(v) => setF({ ...f, projectManagerIds: v })} placeholder="Anyone" /></Field>}
            {kind !== 'conversion' && kind !== 'vendor' && <Field label="Sales person"><Combobox multiple options={o(opts?.salesPeople)} value={f.salesPersonIds} onChange={(v) => setF({ ...f, salesPersonIds: v })} placeholder="Anyone" /></Field>}
            {kind === 'conversion' && <Field label="Response status"><Combobox multiple options={(opts?.statuses ?? []).map((s) => ({ value: s, label: statusName(s) }))} value={f.statuses} onChange={(v) => setF({ ...f, statuses: v })} placeholder="Every status" /></Field>}
            {kind === 'conversion' && <Field label="Conversion status"><Combobox multiple options={Object.entries(APPROVAL_LABEL).map(([value, label]) => ({ value, label }))} value={f.approvals} onChange={(v) => setF({ ...f, approvals: v })} placeholder="Any" /></Field>}
            <Field label="Country"><Combobox multiple options={(opts?.countries ?? []).map((c) => ({ value: c, label: `${flag(c)} ${countryName(c)}` }))} value={f.countryCodes} onChange={(v) => setF({ ...f, countryCodes: v })} placeholder="All countries" /></Field>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-primary" onClick={apply} disabled={loading}><Play className="h-4 w-4" /> Run report</button>
            <button className="btn-ghost" onClick={reset}><RotateCcw className="h-4 w-4" /> Reset</button>
          </div>
        </div>
      </Section>

      <Section
        title={<span>Results {res && <span className="font-normal text-muted">· {res.total.toLocaleString()} {res.total === 1 ? 'row' : 'rows'}{kind !== 'conversion' && ` · money in ${res.currency}`}</span>}</span>}
        actions={
          <div className="flex flex-wrap gap-1.5">
            <button className={clsx('btn-ghost px-2.5 py-1.5 text-xs', choosing && 'text-brand')} aria-expanded={choosing} onClick={() => setChoosing(!choosing)}><Columns3 className="h-3.5 w-3.5" /> Columns ({shown.length})</button>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={!res?.total} onClick={() => download('xlsx')}><FileSpreadsheet className="h-3.5 w-3.5" /> Excel</button>
            <button className="btn-ghost px-2.5 py-1.5 text-xs" disabled={!res?.total} onClick={() => download('csv')}><Download className="h-3.5 w-3.5" /> CSV</button>
          </div>
        }
      >
        <div className="space-y-3">
          <ErrorBox error={error} />
          {note && <p className="rounded-lg border border-ok/40 bg-ok/10 p-3 text-sm" role="status">{note}</p>}
          {res?.missingRates && res.missingRates.length > 0 && <p className="text-xs text-warn">No exchange rate for {res.missingRates.join(', ')}: those amounts count as 0. Add rates in Vendor payables → Finance settings.</p>}
          {choosing && (
            <div className="rounded-lg border border-line bg-sunken/50 p-4" aria-label="Choose columns">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
                {groups.map((g) => {
                  const gc = allCols.filter((c) => c.group === g);
                  const all = gc.every((c) => cols.includes(c.key));
                  return (
                    <fieldset key={g}>
                      <legend className="mb-1.5 flex w-full items-center justify-between gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
                        {g}
                        <button type="button" className="text-[11px] font-medium normal-case text-brand hover:underline" onClick={() => saveCols(all ? cols.filter((k) => !gc.some((c) => c.key === k)) : [...new Set([...cols, ...gc.map((c) => c.key)])])}>{all ? 'None' : 'All'}</button>
                      </legend>
                      <div className="space-y-1">
                        {gc.map((c) => (
                          <label key={c.key} className="flex items-center gap-2 text-sm">
                            <input type="checkbox" checked={cols.includes(c.key)} onChange={(e) => saveCols(e.target.checked ? [...cols, c.key] : cols.filter((k) => k !== c.key))} />
                            {c.label}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
              {kind !== 'conversion' && <p className="mt-3 text-xs text-muted">Columns under {kind === 'overall' ? 'Data' : 'Common'} that name a project, client, vendor, market or device split the rows by it.</p>}
              {kind === 'conversion' && !res?.questions?.length && <p className="mt-3 text-xs text-muted">Gate survey answers appear here when the respondents shown answered gate questions.</p>}
            </div>
          )}
          {kind === 'conversion' && editor && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">{picked.size} selected</span>
              <button className="btn-danger px-2.5 py-1 text-xs" disabled={busy || !toReject.length} onClick={() => approve(toReject, 'REJECTED')}><X className="h-3.5 w-3.5" /> Reject selected ({toReject.length})</button>
              <button className="btn-primary px-2.5 py-1 text-xs" disabled={busy || !toApprove.length} onClick={() => approve(toApprove, 'APPROVED')}><Check className="h-3.5 w-3.5" /> Approve selected ({toApprove.length})</button>
              <span className="text-xs text-muted">Complete → reject; rejected → approve. Already invoiced completes cannot change.</span>
            </div>
          )}
        </div>
        {loading && !res ? (
          <Loading />
        ) : !rows.length ? (
          <div className="mt-4"><Empty>No respondents match. Try a wider date range or fewer filters.</Empty></div>
        ) : (
          <div className="-mx-5 -mb-5 mt-4 overflow-x-auto">
            <table className={clsx('w-full text-sm', loading && 'opacity-60')} style={{ minWidth: Math.max(720, shown.length * 120) }}>
              <thead className="border-y border-line bg-sunken/60">
                <tr>
                  {kind === 'conversion' && editor && (
                    <th className="th w-8"><input type="checkbox" aria-label="Select all completes on this page" checked={selectable.length > 0 && selectable.every((r) => picked.has(String(r.id)))} onChange={(e) => setPicked(e.target.checked ? new Set(selectable.map((r) => String(r.id))) : new Set())} /></th>
                  )}
                  {shown.map((c) => <th key={c.key} className={clsx('th whitespace-nowrap', c.fmt && !['text', 'status', 'approval', 'date'].includes(c.fmt) && 'text-right')}>{c.label}</th>)}
                  {kind === 'conversion' && editor && <th className="th text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {rows.map((r, i) => (
                  <tr key={String(r.id ?? r.key ?? i)}>
                    {kind === 'conversion' && editor && (
                      <td className="td">{r.responseStatus === 'COMPLETE' && !r.locked && <input type="checkbox" aria-label={`Select ${String(r.uid)}`} checked={picked.has(String(r.id))} onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(String(r.id)); else n.delete(String(r.id)); return n; })} />}</td>
                    )}
                    {shown.map((c) => (
                      <td key={c.key} className={clsx('td', c.fmt && !['text', 'status', 'approval', 'date'].includes(c.fmt) && 'text-right tabular-nums', c.key === 'userAgent' ? 'max-w-[280px] truncate text-xs' : 'whitespace-nowrap', ['uid', 'ipId', 'browserId'].includes(c.key) && 'font-mono text-xs')} title={c.key === 'userAgent' ? String(r.userAgent ?? '') : undefined}>
                        {c.fmt === 'status' && kind === 'conversion' ? <OutcomeChip status={r.responseStatus === 'SPEEDER' ? 'QUALITY_FAIL' : String(r.responseStatus)} /> : c.key === 'projectCode' && r.projectId ? <Link className="font-medium hover:text-brand hover:underline" href={`/projects/${String(r.projectId)}`}>{String(r.projectCode)}</Link> : show(c, r, res?.currency ?? '')}
                        {c.fmt === 'status' && r.responseStatus === 'SPEEDER' && <span className="ml-1 text-xs text-muted">speeder</span>}
                      </td>
                    ))}
                    {kind === 'conversion' && editor && (
                      <td className="td whitespace-nowrap text-right">
                        {r.responseStatus !== 'COMPLETE' ? null : r.locked ? (
                          <span className="chip bg-sunken text-muted" title={r.locked === 'client-invoice' ? 'On a client invoice. Void the invoice to change it.' : 'On a vendor bill. Void the bill to change it.'}>Already invoiced</span>
                        ) : r.approval === 'REJECTED' ? (
                          <button className="btn-ghost px-2 py-1 text-xs text-ok" disabled={busy} onClick={() => approve([String(r.id)], 'APPROVED')}><Check className="h-3.5 w-3.5" /> Approve</button>
                        ) : (
                          <button className="btn-ghost px-2 py-1 text-xs text-bad" disabled={busy} onClick={() => approve([String(r.id)], 'REJECTED')}><X className="h-3.5 w-3.5" /> Reject</button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              {res?.totals && (
                <tfoot className="border-t-2 border-line bg-sunken/40 font-semibold">
                  <tr>{shown.map((c, i) => <td key={c.key} className={clsx('td whitespace-nowrap', c.fmt && !['text', 'status', 'approval', 'date'].includes(c.fmt) && 'text-right tabular-nums')}>{i === 0 ? 'Total' : c.dim ? '' : show(c, res.totals!, res.currency)}</td>)}</tr>
                </tfoot>
              )}
            </table>
            <Pager page={page} pageSize={pageSize} total={res?.total ?? 0} onPage={(p) => { setPage(p); setPicked(new Set()); }} onPageSize={setPageSize} sizes={[25, 50, 100, 500]} />
          </div>
        )}
      </Section>
    </>
  );
}
