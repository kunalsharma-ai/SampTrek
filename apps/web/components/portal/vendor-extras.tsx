'use client';
import clsx from 'clsx';
import { Bell, CheckCheck } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { VendorStatement, type Statement } from '@/components/finance/vendor-statement';
import { Empty, ErrorBox, Loading, Section } from '@/components/ui';
import { get, post } from '@/lib/api';

export interface Notice { id: string; kind: 'quota' | 'notes' | 'files' | 'status'; title: string; detail: string; createdAt: string; readAt: string | null; projectId?: string }
const KIND: Record<Notice['kind'], [string, string]> = { quota: ['Quota', 'bg-brand/10 text-brand'], notes: ['Quota notes', 'bg-info/15 text-info'], files: ['Documents', 'bg-sunken text-muted'], status: ['Project', 'bg-ok/15 text-ok'] };

/** Quota updates from the team, with the time (feedback 2026-11-23). */
/**
 * Feedback 2026-11-24: the update has to be seen at once, without searching. New ones are marked
 * "New" and tinted, the one opened from the bell is outlined, and the message is shown in full in
 * normal text (not greyed out).
 */
export function NoticeList({ items, linkProjects = true, highlight, fresh }: { items: Notice[]; linkProjects?: boolean; /** The notice opened from the bell. */ highlight?: string; /** Unread when the page opened (marked read since). */ fresh?: Set<string> }) {
  if (!items.length) return <Empty>No updates yet. Quota changes from the team show here with the time.</Empty>;
  return (
    <ul className="-mx-2 space-y-1.5">
      {items.map((n) => {
        const isNew = !n.readAt || !!fresh?.has(n.id);
        return (
        <li key={n.id} id={`notice-${n.id}`} className={clsx('flex items-start gap-3 rounded-lg px-3 py-3', isNew && 'bg-brand/5', highlight === n.id && 'ring-2 ring-brand')}>
          <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', isNew ? 'bg-brand' : 'bg-line')} aria-hidden />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {isNew && <span className="chip bg-brand text-white">New</span>}
              <span className={clsx('chip', KIND[n.kind]?.[1])}>{KIND[n.kind]?.[0] ?? n.kind}</span>
              {linkProjects && n.projectId ? <Link className={clsx('hover:text-brand hover:underline', isNew && 'font-semibold')} href={`/portal/vendor/projects/${n.projectId}?notice=${n.id}`}>{n.title}</Link> : <span className={clsx(isNew && 'font-semibold')}>{n.title}</span>}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{n.detail}</p>
            {linkProjects && n.projectId && <Link className="mt-1 inline-block text-xs text-brand hover:underline" href={`/portal/vendor/projects/${n.projectId}?notice=${n.id}`}>Open the project</Link>}
          </div>
          <time className="shrink-0 text-xs font-normal text-muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
        </li>
        );
      })}
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

/**
 * Bell in the vendor portal header (feedback 2026-11-24): the unread count, and the latest updates.
 * Clicking one opens its project page with that update shown first.
 */
export function VendorBell() {
  const [data, setData] = useState<{ unread: number; items: Notice[] } | null>(null);
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const load = useCallback(() => get<{ unread: number; items: Notice[] }>('/portal/vendor/notices').then(setData).catch(() => undefined), []);
  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load, pathname]);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', out);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', out); document.removeEventListener('keydown', esc); };
  }, [open]);
  const unread = data?.unread ?? 0;
  return (
    <div className="relative" ref={box}>
      <button type="button" className="btn-ghost relative px-2.5 py-1.5" aria-label={unread ? `Notifications, ${unread} new` : 'Notifications'} aria-expanded={open} title="Notifications" onClick={() => { setOpen(!open); if (!open) load(); }}>
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-bad px-1 text-[10px] font-semibold leading-none text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(92vw,380px)] rounded-xl border border-line bg-panel p-2 shadow-2xl" role="dialog" aria-label="Notifications">
          <div className="flex items-center justify-between px-2 py-1.5">
            <span className="text-sm font-semibold">Notifications {unread > 0 && <span className="chip ml-1 bg-brand/10 text-brand">{unread} new</span>}</span>
            {unread > 0 && <button className="btn-ghost px-2 py-1 text-xs" onClick={() => post('/portal/vendor/notices/read', {}).then(load).catch(() => undefined)}><CheckCheck className="h-3.5 w-3.5" /> Mark all read</button>}
          </div>
          {!data ? <div className="p-4"><Loading /></div> : data.items.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted">No updates yet.</p>
          ) : (
            <ul className="max-h-[60vh] space-y-1 overflow-y-auto">
              {data.items.slice(0, 12).map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.projectId ? `/portal/vendor/projects/${n.projectId}?notice=${n.id}` : '/portal/vendor?tab=notifications'}
                    onClick={() => setOpen(false)}
                    className={clsx('block rounded-lg px-3 py-2 text-sm hover:bg-sunken', !n.readAt && 'bg-brand/5')}
                  >
                    <div className="flex items-center gap-2">
                      {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="New" />}
                      <span className={clsx('min-w-0 flex-1 truncate', !n.readAt && 'font-semibold')}>{n.title}</span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink/80">{n.detail}</p>
                    <time className="text-[11px] text-muted" dateTime={n.createdAt}>{new Date(n.createdAt).toLocaleString()}</time>
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Link href="/portal/vendor?tab=notifications" onClick={() => setOpen(false)} className="mt-1 block rounded-lg px-3 py-2 text-center text-xs text-brand hover:bg-sunken">See all notifications</Link>
        </div>
      )}
    </div>
  );
}
