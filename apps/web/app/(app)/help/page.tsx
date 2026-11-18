'use client';
import clsx from 'clsx';
import { ExternalLink, Film, Image as ImageIcon, Minus, Plus, RotateCcw, Search, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { PageHeader, Section } from '@/components/ui';
import { FAQ, GUIDE_GROUPS, GUIDES, type Guide } from '@/lib/help-guides';
import shotsJson from '@/lib/help-shots.json';

/** Written by scripts/help-shots.mjs: picture size and, per step, the box it points at (in % of the picture). */
interface Shot { w: number; h: number; gif?: boolean; markers: { step: number; x: number; y: number; w: number; h: number }[] }
const SHOTS = shotsJson as Record<string, Shot>;

function Markers({ shot }: { shot: Shot }) {
  return (
    <>
      {shot.markers.map((m) => (
        <span key={m.step} className="pointer-events-none absolute" style={{ left: `${m.x}%`, top: `${m.y}%`, width: `${m.w}%`, height: `${m.h}%` }}>
          <span className="absolute inset-0 rounded-md ring-[3px] ring-rose-600/90" />
          <span className="absolute -left-3 -top-3 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-rose-600 text-[11px] font-bold text-white shadow">{m.step}</span>
        </span>
      ))}
    </>
  );
}

/** Full-screen picture: wheel or + / − to zoom, drag to move, Esc to close. */
function Lightbox({ g, gif, onClose }: { g: Guide; gif: boolean; onClose: () => void }) {
  const shot = SHOTS[g.id];
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') setZoom((z) => Math.min(5, z * 1.25));
      if (e.key === '-') setZoom((z) => Math.max(1, z / 1.25));
    };
    window.addEventListener('keydown', key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', key); document.body.style.overflow = prev; };
  }, [onClose]);
  useEffect(() => { if (zoom === 1) setPos({ x: 0, y: 0 }); }, [zoom]);
  const src = `/help/guides/${g.id}.${gif ? 'gif' : 'jpg'}`;
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={`${g.title} picture`} className="fixed inset-0 z-[100] flex flex-col bg-black/85">
      <div className="flex items-center justify-between gap-3 px-4 py-2 text-white">
        <div className="truncate text-sm font-medium">{g.title}</div>
        <div className="flex items-center gap-1">
          <button className="rounded p-2 hover:bg-white/10" aria-label="Zoom out" onClick={() => setZoom((z) => Math.max(1, z / 1.25))}><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs tabular-nums">{Math.round(zoom * 100)}%</span>
          <button className="rounded p-2 hover:bg-white/10" aria-label="Zoom in" onClick={() => setZoom((z) => Math.min(5, z * 1.25))}><Plus className="h-4 w-4" /></button>
          <button className="rounded p-2 hover:bg-white/10" aria-label="Reset zoom" onClick={() => setZoom(1)}><RotateCcw className="h-4 w-4" /></button>
          <button className="ml-2 rounded p-2 hover:bg-white/10" aria-label="Close" onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
      </div>
      <div
        className={clsx('relative flex-1 overflow-hidden', zoom > 1 ? 'cursor-grab active:cursor-grabbing' : 'cursor-zoom-in')}
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        onWheel={(e) => setZoom((z) => Math.min(5, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
        onPointerDown={(e) => { drag.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y }; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }}
        onPointerMove={(e) => { if (drag.current && zoom > 1) setPos({ x: drag.current.px + e.clientX - drag.current.x, y: drag.current.py + e.clientY - drag.current.y }); }}
        onPointerUp={(e) => { const d = drag.current; drag.current = null; if (d && zoom === 1 && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 4) setZoom(2); }}
      >
        <div className="absolute left-1/2 top-1/2 w-[min(96vw,calc((100vh-4rem)*var(--ar)))]" style={{ ['--ar' as string]: shot ? shot.w / shot.h : 1.6, transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${zoom})`, transition: drag.current ? 'none' : 'transform .12s' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={g.title} draggable={false} className="block h-auto w-full select-none rounded" />
          {!gif && shot && <Markers shot={shot} />}
        </div>
      </div>
      <p className="px-4 pb-3 text-center text-xs text-white/70">Scroll or use + and − to zoom. Drag to move. Esc closes.</p>
    </div>,
    document.body,
  );
}

function Picture({ g }: { g: Guide }) {
  const shot = SHOTS[g.id];
  const [gif, setGif] = useState(false);
  const [open, setOpen] = useState(false);
  if (!shot) return null;
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} className="group relative block w-full cursor-zoom-in overflow-hidden rounded-lg border border-line bg-sunken text-left" aria-label={`Open the ${g.title} picture large`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/help/guides/${g.id}.${gif ? 'gif' : 'jpg'}`} alt={`${g.title}${gif ? ' walkthrough' : ''}`} className="block h-auto w-full" loading="lazy" width={shot.w} height={shot.h} />
        {!gif && <Markers shot={shot} />}
        <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2 py-0.5 text-[11px] text-white opacity-0 transition group-hover:opacity-100">Click to zoom</span>
      </button>
      {shot.gif && (
        <div className="mt-2 inline-flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Picture or walkthrough">
          <button type="button" className={clsx('flex items-center gap-1 rounded-md px-2 py-1', !gif ? 'bg-surface-2 font-medium' : 'text-muted')} aria-pressed={!gif} onClick={() => setGif(false)}><ImageIcon className="h-3.5 w-3.5" />Picture</button>
          <button type="button" className={clsx('flex items-center gap-1 rounded-md px-2 py-1', gif ? 'bg-surface-2 font-medium' : 'text-muted')} aria-pressed={gif} onClick={() => setGif(true)}><Film className="h-3.5 w-3.5" />Walkthrough (GIF)</button>
        </div>
      )}
      {open && <Lightbox g={g} gif={gif} onClose={() => setOpen(false)} />}
    </div>
  );
}

const text = (g: Guide) => [g.title, g.objective, ...g.steps.map((s) => s.text), ...(g.fields ?? []).flatMap((f) => [f.name, f.text]), ...(g.tips ?? [])].join(' ').toLowerCase();

/** Help: every menu and project tab, with numbered steps on screenshots, walkthrough GIFs, fields and common questions. */
export default function HelpPage() {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const guides = useMemo(() => GUIDES.filter((g) => !term || text(g).includes(term)), [term]);
  const faq = FAQ.filter((f) => !term || `${f.q} ${f.a}`.toLowerCase().includes(term));
  return (
    <>
      <PageHeader title="Help" subtitle="Every menu, step by step. Numbers on each picture match the steps beside it; click a picture to zoom, or play its walkthrough. Every (i) on a page also explains that item." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:self-start lg:overflow-y-auto">
          <label className="relative mb-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
            <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search help" aria-label="Search help" />
          </label>
          <nav aria-label="Help topics" className="space-y-3 text-sm">
            {GUIDE_GROUPS.map((grp) => {
              const items = guides.filter((g) => g.group === grp);
              if (!items.length) return null;
              return (
                <div key={grp}>
                  <div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted">{grp}</div>
                  <ul>
                    {items.map((g) => <li key={g.id}><a href={`#${g.id}`} className="block rounded px-2 py-1 hover:bg-surface-2">{g.title}</a></li>)}
                  </ul>
                </div>
              );
            })}
            {faq.length > 0 && <a href="#faq" className="block rounded px-2 py-1 font-medium hover:bg-surface-2">Common questions</a>}
          </nav>
        </aside>
        <div className="min-w-0 space-y-6">
          {!guides.length && !faq.length && <p className="text-sm text-muted">Nothing matches “{q}”.</p>}
          {GUIDE_GROUPS.map((grp) => {
            const items = guides.filter((g) => g.group === grp);
            if (!items.length) return null;
            return (
              <div key={grp} className="space-y-6">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">{grp}</h2>
                {items.map((g) => (
                  <Section key={g.id} id={g.id} title={g.title} actions={g.href && !g.href.includes(':') ? <Link href={g.href} className="flex items-center gap-1 text-xs text-brand hover:underline">Open page<ExternalLink className="h-3 w-3" /></Link> : undefined}>
                    <div className="space-y-4 text-sm">
                      <p className="text-muted">{g.objective}</p>
                      <div className={clsx('grid grid-cols-1 gap-5', SHOTS[g.id] && 'xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]')}>
                        <Picture g={g} />
                        <ol className="space-y-2">
                          {g.steps.map((s, i) => (
                            <li key={i} className="flex gap-3">
                              <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">{i + 1}</span>
                              <span>{s.text}</span>
                            </li>
                          ))}
                        </ol>
                      </div>
                      {g.fields && g.fields.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1.5 pr-3 font-medium">Field or button</th><th className="py-1.5 font-medium">What it does</th></tr></thead>
                            <tbody>
                              {g.fields.map((f) => <tr key={f.name} className="border-b border-line/60 align-top"><td className="whitespace-nowrap py-1.5 pr-3 font-medium">{f.name}</td><td className="py-1.5 text-muted">{f.text}</td></tr>)}
                            </tbody>
                          </table>
                        </div>
                      )}
                      {g.tips && g.tips.length > 0 && (
                        <ul className="list-disc space-y-1.5 rounded-lg bg-surface-2 p-3 pl-7 text-xs">
                          {g.tips.map((t) => <li key={t}>{t}</li>)}
                        </ul>
                      )}
                    </div>
                  </Section>
                ))}
              </div>
            );
          })}
          {faq.length > 0 && (
            <Section id="faq" title="Common questions">
              <div className="divide-y divide-line">
                {faq.map((f) => (
                  <details key={f.q} className="py-3 text-sm">
                    <summary className="cursor-pointer font-medium">{f.q}</summary>
                    <p className="mt-2 text-muted">{f.a}</p>
                  </details>
                ))}
              </div>
            </Section>
          )}
        </div>
      </div>
    </>
  );
}
