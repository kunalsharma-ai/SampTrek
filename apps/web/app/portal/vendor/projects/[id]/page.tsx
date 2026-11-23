'use client';
import clsx from 'clsx';
import { ArrowLeft, Download, FileText } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { NotesView } from '@/components/notes-view';
import { PAYMENT_MODES } from '@/components/finance/bill-document';
import { NoticeList, type Notice } from '@/components/portal/vendor-extras';
import { CopyButton } from '@/components/project/vendors-tab';
import { FILE_KIND_LABEL, fileSize, type FileKind } from '@/components/requests/types';
import { Empty, ErrorBox, Loading, PageHeader, Progress, Section, StatusChip, money } from '@/components/ui';
import { get, post } from '@/lib/api';
import { countryName, flag } from '@/lib/countries';
import { downloadFile } from '@/lib/download';

interface Market {
  id: string; countryCode: string; language: string; targetGroup: string | null; status: string; accepting: boolean; currency: string; cpi: number | null; targetCompletes: number;
  projectLoi: number; projectIr: number; clicks: number; completes: number; terminates: number; overquota: number; security: number; dropouts: number; inProgress: number;
  approved: number; pending: number; rejected: number; avgLoi: number | null; ir: number | null; conversion: number | null;
  entryLink: string | null; testEntryLink: string; uniqueLinksOnly: boolean; uniqueLinks: { total: number; unused: number };
}
interface Detail {
  project: { id: string; projectCode: string; name: string; status: string; category: string; devices: Record<string, boolean>; fieldStartAt: string | null; fieldEndAt: string | null };
  description: string | null; quotaNotes: string | null; quotaNotesUpdatedAt: string | null; hidePayout: boolean;
  markets: Market[];
  files: { id: string; kind: FileKind; name: string; size: number; note: string | null; createdAt: string }[];
  billing: { number: string | null; status: string; currency: string; completes: number; amount: number | null; dueAt: string | null; paidAt: string | null; paymentMode: string | null }[];
  chargebacks: { id: string; uid: string; countryCode: string; completedAt: string | null; rejectedAt: string | null; payout: number | null; currency: string }[];
  notices: Notice[];
}

const sum = (ms: Market[], k: keyof Market) => ms.reduce((s, m) => s + (Number(m[k]) || 0), 0);
const avg = (ms: Market[], k: 'projectLoi' | 'projectIr') => (ms.length ? Math.round((ms.reduce((s, m) => s + m[k], 0) / ms.length) * 10) / 10 : null);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '–');

/**
 * One project in the vendor login (feedback 2026-11-23): your links, clicks, completes, over quota,
 * current and project LOI and IR, documents, quota notes, billing and chargebacks. Nothing about
 * security settings, the client or other vendors.
 */
export default function VendorProjectPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Detail | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    get<Detail>(`/portal/vendor/projects/${id}`)
      .then((r) => {
        setD(r);
        const unread = r.notices.filter((n) => !n.readAt).map((n) => n.id);
        if (unread.length) post('/portal/vendor/notices/read', { ids: unread }).catch(() => {});
      })
      .catch(setError);
  }, [id]);
  if (!d) return error ? <ErrorBox error={error} /> : <Loading />;

  const ms = d.markets;
  const completes = sum(ms, 'completes');
  const terms = sum(ms, 'terminates');
  const loiN = ms.filter((m) => m.avgLoi != null);
  const curLoi = loiN.length ? Math.round((loiN.reduce((s, m) => s + m.avgLoi! * m.completes, 0) / Math.max(1, sum(loiN, 'completes'))) * 10) / 10 : null;
  const curIr = completes + terms ? Math.round((completes / (completes + terms)) * 1000) / 10 : null;
  const tiles: [string, string, string?][] = [
    ['Clicks', sum(ms, 'clicks').toLocaleString()],
    ['Completes', completes.toLocaleString(), `of ${sum(ms, 'targetCompletes').toLocaleString()} wanted`],
    ['Over quota', sum(ms, 'overquota').toLocaleString()],
    ['Terminates', terms.toLocaleString()],
    ['LOI now', curLoi != null ? `${curLoi} min` : '–', `project ${avg(ms, 'projectLoi') ?? '–'} min`],
    ['IR now', curIr != null ? `${curIr}%` : '–', `project ${avg(ms, 'projectIr') ?? '–'}%`],
    ['Chargebacks', String(d.chargebacks.length), 'rejected completes'],
  ];

  return (
    <>
      <Link href="/portal/vendor" className="mb-3 inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink"><ArrowLeft className="h-4 w-4" /> Projects</Link>
      <PageHeader title={d.project.name} subtitle={<span className="flex flex-wrap items-center gap-2"><span>{d.project.projectCode}</span><span>· {d.project.category}</span><StatusChip status={d.project.status} />{d.project.fieldEndAt && <span>· field ends {date(d.project.fieldEndAt)}</span>}</span>} />

      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
        {tiles.map(([l, v, sub]) => (
          <div key={l} className="card p-4">
            <div className="text-xs text-muted">{l}</div>
            <div className="mt-1 text-xl font-semibold tabular-nums">{v}</div>
            {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
          </div>
        ))}
      </div>

      {d.notices.length > 0 && (
        <Section title="Updates from the team" className="mb-6">
          <NoticeList items={d.notices.slice(0, 5)} linkProjects={false} />
        </Section>
      )}

      <Section title="Your links and numbers" className="mb-6">
        <div className="-mx-5 -mb-5 overflow-x-auto">
          <table className="w-full min-w-[1080px] text-sm">
            <thead className="border-y border-line bg-sunken/60">
              <tr><th className="th">Market</th><th className="th">Status</th><th className="th">Completes</th>{!d.hidePayout && <th className="th text-right">Your CPI</th>}<th className="th text-right">Clicks</th><th className="th text-right">Terminates</th><th className="th text-right">Over quota</th><th className="th text-right">LOI now / project</th><th className="th text-right">IR now / project</th><th className="th text-right">Conversion</th><th className="th">Links</th></tr>
            </thead>
            <tbody className="divide-y divide-line">
              {ms.map((m) => (
                <tr key={m.id}>
                  <td className="td whitespace-nowrap">{flag(m.countryCode)} {countryName(m.countryCode)}<span className="block text-xs text-muted">{m.language.toUpperCase()}{m.targetGroup ? ` · ${m.targetGroup}` : ''}</span></td>
                  <td className="td"><span className={clsx('chip', m.accepting ? 'bg-ok/15 text-ok' : 'bg-sunken text-muted')}>{m.accepting ? 'Accepting' : 'Not accepting'}</span></td>
                  <td className="td"><Progress value={m.completes} max={m.targetCompletes} /></td>
                  {!d.hidePayout && <td className="td text-right tabular-nums">{m.cpi != null ? money(m.cpi, m.currency) : '–'}</td>}
                  <td className="td text-right tabular-nums">{m.clicks}</td>
                  <td className="td text-right tabular-nums">{m.terminates}</td>
                  <td className="td text-right tabular-nums">{m.overquota}</td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{m.avgLoi != null ? `${m.avgLoi}` : '–'} / {m.projectLoi} min</td>
                  <td className="td whitespace-nowrap text-right tabular-nums">{m.ir != null ? `${m.ir}%` : '–'} / {m.projectIr}%</td>
                  <td className="td text-right tabular-nums">{m.conversion != null ? `${m.conversion}%` : '–'}</td>
                  <td className="td">
                    <div className="flex flex-wrap gap-1.5">
                      {m.entryLink ? <CopyButton text={m.entryLink} label="Live link" /> : <span className="chip bg-sunken text-muted">Unique links only</span>}
                      <CopyButton text={m.testEntryLink} label="Test link" />
                      {m.uniqueLinks.total > 0 && (
                        <button className="btn-ghost px-2 py-1 text-xs" onClick={() => downloadFile(`/portal/vendor/allocations/${m.id}/unique-links.csv`, `${d.project.projectCode}-${m.countryCode}-unique-links.csv`).catch(setError)}><Download className="h-3.5 w-3.5" /> {m.uniqueLinks.unused} unique links</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-8 text-xs text-muted">Replace [UID] in the live link with your respondent ID. Devices: {Object.entries(d.project.devices).filter(([, v]) => v).map(([k]) => k).join(', ')}.</p>
      </Section>

      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Project description">
          {d.description ? <p className="whitespace-pre-wrap text-sm">{d.description}</p> : <p className="text-sm text-muted">No description.</p>}
        </Section>
        <Section title="Documents">
          {d.files.length === 0 ? <Empty>No documents shared yet.</Empty> : (
            <ul className="divide-y divide-line">
              {d.files.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5 text-sm">
                  <FileText className="h-4 w-4 shrink-0 text-muted" />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{f.name}</div><div className="text-xs text-muted">{FILE_KIND_LABEL[f.kind] ?? f.kind} · {fileSize(f.size)} · {date(f.createdAt)}{f.note ? ` · ${f.note}` : ''}</div></div>
                  <button className="btn-ghost px-2.5 py-1 text-xs" onClick={() => downloadFile(`/portal/files/${f.id}/download`, f.name).catch(setError)}><Download className="h-3.5 w-3.5" /> Download</button>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Quota and termination notes" className="mb-6">
        {d.quotaNotes ? (
          <>
            <NotesView text={d.quotaNotes} />
            {d.quotaNotesUpdatedAt && <p className="mt-3 text-xs text-muted">Updated {new Date(d.quotaNotesUpdatedAt).toLocaleString()}</p>}
          </>
        ) : <p className="text-sm text-muted">No quota notes from the team yet.</p>}
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Section title="Billing">
          {d.billing.length === 0 ? <Empty>Nothing to bill yet. Completes count once the client approves them.</Empty> : (
            <div className="-mx-5 -mb-5 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-line bg-sunken/60"><tr><th className="th">Bill</th><th className="th">Status</th><th className="th text-right">Completes</th>{!d.hidePayout && <th className="th text-right">Amount</th>}<th className="th">Paid</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {d.billing.map((b, i) => (
                    <tr key={`${b.number ?? 'unbilled'}:${b.currency}:${i}`}>
                      <td className="td font-mono text-xs">{b.number ?? 'Not billed yet'}</td>
                      <td className="td"><StatusChip status={b.status === 'NOT_BILLED' ? 'PENDING' : b.status} /></td>
                      <td className="td text-right tabular-nums">{b.completes}</td>
                      {!d.hidePayout && <td className="td text-right tabular-nums">{b.amount != null ? money(b.amount, b.currency) : '–'}</td>}
                      <td className="td text-xs">{b.paidAt ? `${date(b.paidAt)}${b.paymentMode ? ` · ${PAYMENT_MODES[b.paymentMode] ?? b.paymentMode}` : ''}` : b.dueAt ? `Due ${date(b.dueAt)}` : '–'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <Section title={`Chargebacks (${d.chargebacks.length})`}>
          {d.chargebacks.length === 0 ? <Empty>No completes rejected by the client.</Empty> : (
            <div className="-mx-5 -mb-5 max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead className="border-y border-line bg-sunken/60"><tr><th className="th">Your respondent ID</th><th className="th">Market</th><th className="th">Completed</th><th className="th">Rejected</th>{!d.hidePayout && <th className="th text-right">Payout</th>}</tr></thead>
                <tbody className="divide-y divide-line">
                  {d.chargebacks.map((c) => (
                    <tr key={c.id}>
                      <td className="td font-mono text-xs">{c.uid}</td>
                      <td className="td">{flag(c.countryCode)} {c.countryCode}</td>
                      <td className="td text-xs">{date(c.completedAt)}</td>
                      <td className="td text-xs">{date(c.rejectedAt)}</td>
                      {!d.hidePayout && <td className="td text-right tabular-nums">{c.payout != null ? money(c.payout, c.currency) : '–'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {d.chargebacks.length > 0 && <p className="mt-6 text-xs text-muted">Think a rejection is wrong? <Link className="text-brand hover:underline" href="/portal/requests?new=dispute">Open a dispute</Link>.</p>}
        </Section>
      </div>
    </>
  );
}
