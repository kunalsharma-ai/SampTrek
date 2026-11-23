'use client';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { VendorStatement, type Statement } from '@/components/finance/vendor-statement';
import { Empty, ErrorBox, Loading, Section } from '@/components/ui';
import { get, post } from '@/lib/api';

export interface Notice { id: string; kind: 'quota' | 'notes' | 'files' | 'status'; title: string; detail: string; createdAt: string; readAt: string | null; projectId?: string }
const KIND: Record<Notice['kind'], [string, string]> = { quota: ['Quota', 'bg-brand/10 text-brand'], notes: ['Quota notes', 'bg-info/15 text-info'], files: ['Documents', 'bg-sunken text-muted'], status: ['Project', 'bg-ok/15 text-ok'] };

/** Quota updates from the team, with the time (feedback 2026-11-23). */
export function NoticeList({ items, linkProjects = true }: { items: Notice[]; linkProjects?: boolean }) {
  if (!items.length) return <Empty>No updates yet. Quota changes from the team show here with the time.</Empty>;
  return (
    <ul className="divide-y divide-line">
      {items.map((n) => (
        <li key={n.id} className={clsx('flex items-start gap-3 py-3', !n.readAt && 'font-medium')}>
          <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-brand')} aria-label={n.readAt ? undefined : 'New'} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className={clsx('chip', KIND[n.kind]?.[1])}>{KIND[n.kind]?.[0] ?? n.kind}</span>
              {linkProjects && n.projectId ? <Link className="hover:text-brand hover:underline" href={`/portal/vendor/projects/${n.projectId}`}>{n.title}</Link> : <span>{n.title}</span>}
            </div>
            <p className="mt-0.5 whitespace-pre-wrap text-sm font-normal text-muted">{n.detail}</p>
          </div>
          <time className="shrink-0 text-xs font-normal text-muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
        </li>
      ))}
    </ul>
  );
}

export function VendorNotices() {
  const [data, setData] = useState<{ unread: number; items: Notice[] } | null>(null);
  const [error, setError] = useState<unknown>(null);
  const load = useCallback(() => get<{ unread: number; items: Notice[] }>('/portal/vendor/notices').then(setData).catch(setError), []);
  useEffect(() => {
    load();
  }, [load]);
  if (!data) return error ? <ErrorBox error={error} /> : <Loading />;
  return (
    <Section
      title={<span className="inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Notifications {data.unread > 0 && <span className="chip bg-brand/10 text-brand">{data.unread} new</span>}</span>}
      actions={data.unread > 0 && <button className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => post('/portal/vendor/notices/read', {}).then(load).catch(setError)}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
    >
      <NoticeList items={data.items} />
    </Section>
  );
}

/** Completed and invoiced projects, unbilled completes, pending and paid invoices. */
export function PortalStatement() {
  const [s, setS] = useState<Statement | null>(null);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    get<Statement>('/portal/vendor/statement').then(setS).catch(setError);
  }, []);
  if (!s) return error ? <ErrorBox error={error} /> : <Loading />;
  return <VendorStatement s={s} projectHref={(id) => `/portal/vendor/projects/${id}`} />;
}
