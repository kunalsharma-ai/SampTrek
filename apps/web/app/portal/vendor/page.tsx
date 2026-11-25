'use client';
import { Copyable } from '@/components/copy';
import clsx from 'clsx';
import { Download } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { VendorBills } from '@/components/finance/vendor-bills';
import { PortalStatement, VendorNotices } from '@/components/portal/vendor-extras';
import { CopyButton } from '@/components/project/vendors-tab';
import { Empty, ErrorBox, Loading, OutcomeChip, PageHeader, Progress, Section, StatusChip, money } from '@/components/ui';
import { get } from '@/lib/api';
import { countryName, flag } from '@/lib/countries';
import { downloadCsv } from '@/lib/csv';
import { downloadFile } from '@/lib/download';

interface Summary {
  vendor: { name: string; code: string };
  liveAllocations: number;
  clicks: number;
  conversion: number;
  stats: Record<string, number>;
  payout: Record<'approved' | 'pending' | 'rejected', { completes: number; payout: number | null }>;
  hidePayout?: boolean;
  currencyNote: string;
}
interface Allocation {
  id: string; project: { projectCode: string; name: string; status: string; category: string; devices: Record<string, boolean> };
  countryCode: string; language: string; targetGroup: string | null; loiMinutes: number; irPercent: number; status: string; accepting: boolean;
  cpi: string | null; currency: string; targetCompletes: number; completes: number; entryLink: string; testEntryLink: string; stats: Record<string, number>;
  uniqueLinksOnly?: boolean; uniqueLinks?: { total: number; unused: number };
}
interface ProjectRow {
  project: { id: string; projectCode: string; name: string; status: string; category: string };
  markets: string[]; target: number; completes: number; accepting: boolean; clicks: number; terminates: number; overquota: number; security: number; dropouts: number;
  avgLoi: number | null; ir: number | null; conversion: number | null; unreadNotices: number;
}
interface SessionRow {
  id: string; vendorRespondentId: string; status: string; approval: string; isTest: boolean; payout: string | null; startedAt: string;
  project: { projectCode: string; name: string }; projectCountry: { countryCode: string; currency: string };
}
interface Callback { id: string; url: string; state: string; attempts: number; lastStatusCode: number | null; lastError: string | null; createdAt: string }

const TABS = ['Projects', 'Notifications', 'Respondents', 'Callbacks', 'Statements'] as const;

export default function VendorPortalWrap() {
  return <Suspense fallback={<Loading />}><VendorPortal /></Suspense>;
}

function VendorPortal() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [allocs, setAllocs] = useState<Allocation[] | null>(null);
  const [projects, setProjects] = useState<ProjectRow[] | null>(null);
  const [unread, setUnread] = useState(0);
  const [sessions, setSessions] = useState<SessionRow[] | null>(null);
  const [callbacks, setCallbacks] = useState<Callback[] | null>(null);
  const [tab, setTab] = useState<(typeof TABS)[number]>('Projects');
  // The bell's "See all notifications" opens that tab (feedback 2026-11-24).
  const tabParam = useSearchParams().get('tab');
  useEffect(() => {
    const t = TABS.find((x) => x.toLowerCase() === tabParam?.toLowerCase());
    if (t) setTab(t);
  }, [tabParam]);
  const [allocFilter, setAllocFilter] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [disputable, setDisputable] = useState(0);

  useEffect(() => {
    get<Summary>('/portal/vendor/summary').then(setSummary).catch(setError);
    get<Allocation[]>('/portal/vendor/allocations').then(setAllocs).catch(setError);
    get<ProjectRow[]>('/portal/vendor/projects').then(setProjects).catch(setError);
    get<{ unread: number }>('/portal/vendor/notices').then((r) => setUnread(r.unread)).catch(() => {});
    get<unknown[]>('/portal/vendor/disputable').then((r) => setDisputable(r.length)).catch(() => {});
  }, []);
  const requestNo = useRef(0);
  const loadSessions = useCallback(() => {
    const n = ++requestNo.current; // only the latest filter's response is shown
    setSessions(null);
    get<SessionRow[]>(`/portal/vendor/sessions${allocFilter ? `?allocationId=${allocFilter}` : ''}`)
      .then((r) => n === requestNo.current && setSessions(r))
      .catch(setError);
  }, [allocFilter]);
  useEffect(() => {
    if (tab === 'Respondents') loadSessions();
    if (tab === 'Callbacks' && !callbacks) get<Callback[]>('/portal/vendor/callbacks').then(setCallbacks).catch(setError);
  }, [tab, loadSessions, callbacks]);

  if (error) return <ErrorBox error={error} />;
  if (!summary) return <Loading />;

  const tiles = [
    ['Live projects', summary.liveAllocations],
    ['Clicks', summary.clicks],
    ['Completes', summary.stats.COMPLETE ?? 0],
    ['Conversion', `${summary.conversion}%`],
    ...(summary.hidePayout
      ? [['Approved completes', summary.payout.approved.completes], ['Awaiting approval', summary.payout.pending.completes]]
      : [['Approved payout', money(summary.payout.approved.payout)], ['Pending payout', money(summary.payout.pending.payout)]]),
  ];

  return (
    <>
      <PageHeader title={summary.vendor.name} subtitle="Your projects, entry links, respondents and payouts." />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        {tiles.map(([l, v]) => (
          <div key={l} className="card p-4">
            <div className="text-xs text-muted">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <p className="mb-6 mt-2 text-xs text-muted">
        {summary.hidePayout ? `Rejected completes: ${summary.payout.rejected.completes}. A complete counts once the client approves it.` : <>{summary.currencyNote} Rejected completes: {summary.payout.rejected.completes}. Payout becomes final when the client approves a complete.</>}
        {disputable > 0 && (
          <>
            {' '}
            <Link className="font-medium text-brand hover:underline" href="/portal/requests?new=dispute">Dispute {disputable} rejected complete{disputable === 1 ? '' : 's'}</Link>
          </>
        )}
      </p>

      <div className="mb-5 flex gap-1 overflow-x-auto border-b border-line" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={clsx('-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm', tab === t ? 'border-brand font-medium text-brand' : 'border-transparent text-muted hover:text-ink')}>
            {t}
            {t === 'Notifications' && unread > 0 && <span className="ml-1.5 rounded-full bg-brand px-1.5 text-[11px] font-semibold text-white">{unread}</span>}
          </button>
        ))}
      </div>

      {tab === 'Projects' &&
        (!projects ? <Loading /> : projects.length === 0 ? <Empty>No projects have been assigned to you yet.</Empty> : (
          <Section title={`Projects (${projects.length})`} help="portal.vendorProjects">
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead className="border-b border-line bg-sunken/60">
                  <tr><th className="th">Project</th><th className="th">Markets</th><th className="th">Status</th><th className="th">Completes</th><th className="th text-right">Clicks</th><th className="th text-right">Terminates</th><th className="th text-right">Over quota</th><th className="th text-right">Avg LOI</th><th className="th text-right">IR</th><th className="th text-right">Conversion</th><th className="th" /></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {projects.map((r) => (
                    <tr key={r.project.id} className="hover:bg-sunken/40">
                      <td className="td">
                        <Link className="font-medium hover:text-brand hover:underline" href={`/portal/vendor/projects/${r.project.id}`}>{r.project.name}</Link>
                        <span className="block text-xs text-muted">{r.project.projectCode} · {r.project.category}</span>
                      </td>
                      <td className="td whitespace-nowrap">{r.markets.map((m) => flag(m)).join(' ')} <span className="text-xs text-muted">{r.markets.join(', ')}</span></td>
                      <td className="td"><span className={clsx('chip', r.accepting ? 'bg-ok/15 text-ok' : 'bg-sunken text-muted')}>{r.accepting ? 'Accepting traffic' : 'Not accepting'}</span></td>
                      <td className="td"><Progress value={r.completes} max={r.target} /></td>
                      <td className="td text-right tabular-nums">{r.clicks}</td>
                      <td className="td text-right tabular-nums">{r.terminates}</td>
                      <td className="td text-right tabular-nums">{r.overquota}</td>
                      <td className="td text-right tabular-nums">{r.avgLoi != null ? `${r.avgLoi} min` : '–'}</td>
                      <td className="td text-right tabular-nums">{r.ir != null ? `${r.ir}%` : '–'}</td>
                      <td className="td text-right tabular-nums">{r.conversion != null ? `${r.conversion}%` : '–'}</td>
                      <td className="td text-right">
                        <span className="inline-flex items-center gap-2">
                          {r.unreadNotices > 0 && <span className="chip bg-brand/10 text-brand" title="New updates">{r.unreadNotices} new</span>}
                          <Link className="btn-ghost px-2.5 py-1 text-xs" href={`/portal/vendor/projects/${r.project.id}`}>Open</Link>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        ))}

      {tab === 'Notifications' && <VendorNotices />}

      {tab === 'Respondents' && (
        <Section
          title="Respondents (latest 500)"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <select className="input w-64 py-1.5" value={allocFilter} onChange={(e) => setAllocFilter(e.target.value)} aria-label="Filter by project">
                <option value="">All projects</option>
                {allocs?.map((a) => <option key={a.id} value={a.id}>{a.project.projectCode} · {a.countryCode}</option>)}
              </select>
              <button
                className="btn-ghost px-2.5 py-1.5 text-xs"
                disabled={!sessions?.length}
                onClick={() =>
                  sessions &&
                  downloadCsv(
                    'respondents.csv',
                    summary.hidePayout ? ['UID', 'Project', 'Country', 'Status', 'Approval', 'Test', 'Started'] : ['UID', 'Project', 'Country', 'Status', 'Approval', 'Payout', 'Currency', 'Test', 'Started'],
                    sessions.map((s) => (summary.hidePayout ? [s.vendorRespondentId, s.project.projectCode, s.projectCountry.countryCode, s.status, s.approval, s.isTest ? 'yes' : 'no', s.startedAt] : [s.vendorRespondentId, s.project.projectCode, s.projectCountry.countryCode, s.status, s.approval, s.payout ?? '', s.projectCountry.currency, s.isTest ? 'yes' : 'no', s.startedAt])),
                  )
                }
              >
                <Download className="h-3.5 w-3.5" /> CSV
              </button>
            </div>
          }
        >
          {!sessions ? <Loading /> : sessions.length === 0 ? <Empty>No respondents yet.</Empty> : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-line bg-sunken/60"><tr><th className="th">UID</th><th className="th">Project</th><th className="th">Market</th><th className="th">Status</th><th className="th">Approval</th>{!summary.hidePayout && <th className="th">Payout</th>}<th className="th">Started</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {sessions.map((s) => (
                    <tr key={s.id} className={s.isTest ? 'opacity-70' : undefined}>
                      <td className="td font-mono text-xs"><Copyable text={s.vendorRespondentId} label="respondent ID" />{s.isTest && <span className="chip ml-2 bg-info/15 text-info">test</span>}</td>
                      <td className="td">{s.project.projectCode}</td>
                      <td className="td">{flag(s.projectCountry.countryCode)} {s.projectCountry.countryCode}</td>
                      <td className="td"><OutcomeChip status={s.status} /></td>
                      <td className="td text-xs">{s.approval === 'NOT_APPLICABLE' ? '–' : s.approval.toLowerCase()}</td>
                      {!summary.hidePayout && <td className="td tabular-nums">{s.payout ? money(s.payout, s.projectCountry.currency) : '–'}</td>}
                      <td className="td text-xs text-muted">{new Date(s.startedAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}

      {tab === 'Callbacks' && (
        <Section title="Server-to-server callbacks sent to you">
          {!callbacks ? <Loading /> : callbacks.length === 0 ? <Empty>No callbacks yet. Callbacks are sent only when a project&apos;s redirect rule asks for one and a callback URL is set up for you.</Empty> : (
            <div className="-m-5 overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="border-b border-line bg-sunken/60"><tr><th className="th">State</th><th className="th">URL</th><th className="th">Attempts</th><th className="th">Last response</th><th className="th">Created</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {callbacks.map((c) => (
                    <tr key={c.id}>
                      <td className="td"><span className={clsx('chip', c.state === 'DELIVERED' ? 'bg-ok/15 text-ok' : ['FAILED', 'DEAD_LETTER'].includes(c.state) ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn')}>{c.state.toLowerCase().replace('_', ' ')}</span></td>
                      <td className="td max-w-[420px] font-mono text-xs" title={c.url}><Copyable text={c.url} label="URL" /></td>
                      <td className="td tabular-nums">{c.attempts}</td>
                      <td className="td text-xs">{c.lastStatusCode ?? c.lastError ?? '–'}</td>
                      <td className="td text-xs text-muted">{new Date(c.createdAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
      )}
      {tab === 'Statements' && (
        <div className="space-y-6">
          <PortalStatement />
          <VendorBills />
        </div>
      )}
    </>
  );
}
