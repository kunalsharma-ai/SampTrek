'use client';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/** Rows per page and page buttons under a table (feedback 2026-11-23: 10 by default, 25 or 100). */
export function Pager({ page, pageSize, total, onPage, onPageSize, sizes = [10, 25, 100], noun = 'rows' }: { page: number; pageSize: number; total: number; onPage: (p: number) => void; onPageSize: (n: number) => void; sizes?: number[]; noun?: string }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total ? (page - 1) * pageSize + 1 : 0;
  const to = Math.min(total, page * pageSize);
  // First, last, and two either side of the current page.
  const shown = [...new Set([1, page - 2, page - 1, page, page + 1, page + 2, pages])].filter((p) => p >= 1 && p <= pages).sort((a, b) => a - b);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3 text-xs text-muted">
      <label className="flex items-center gap-2">
        Show
        <select className="input w-auto px-2 py-1 text-xs" aria-label="Rows per page" value={pageSize} onChange={(e) => { onPageSize(Number(e.target.value)); onPage(1); }}>
          {sizes.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <span className="tabular-nums">{from}–{to} of {total.toLocaleString()} {noun}</span>
      </label>
      {pages > 1 && (
        <nav className="flex items-center gap-1" aria-label="Pages">
          <button className="btn-ghost px-2 py-1" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page"><ChevronLeft className="h-3.5 w-3.5" /></button>
          {shown.map((p, i) => (
            <span key={p} className="flex items-center">
              {i > 0 && p - shown[i - 1] > 1 && <span className="px-1">…</span>}
              <button className={p === page ? 'btn-primary px-2.5 py-1 text-xs' : 'btn-ghost px-2.5 py-1 text-xs'} aria-current={p === page ? 'page' : undefined} onClick={() => onPage(p)}>{p}</button>
            </span>
          ))}
          <button className="btn-ghost px-2 py-1" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page"><ChevronRight className="h-3.5 w-3.5" /></button>
        </nav>
      )}
    </div>
  );
}

/** The rows of one page. */
export function pageOf<T>(rows: T[], page: number, pageSize: number) {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}
