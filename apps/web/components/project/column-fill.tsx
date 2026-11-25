'use client';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface ColumnRule { min?: number; max?: number; integer?: boolean; maxLength?: number }

/** Why a value cannot be used in this column, or null. Empty text is allowed for text columns. */
export function columnProblem(value: string, type: 'number' | 'text', rule: ColumnRule = {}): string | null {
  const v = value.trim();
  if (type === 'text') return rule.maxLength && v.length > rule.maxLength ? `Use at most ${rule.maxLength} characters.` : null;
  if (v === '') return 'Enter a number.';
  const n = Number(v);
  if (!Number.isFinite(n)) return 'Enter a number.';
  if (rule.integer && !Number.isInteger(n)) return 'Enter a whole number.';
  if (rule.min !== undefined && n < rule.min) return `Use ${rule.min} or more.`;
  if (rule.max !== undefined && n > rule.max) return `Use ${rule.max.toLocaleString()} or less.`;
  return null;
}

/**
 * A column heading on the markets table that fills the whole column (feedback 2026-11-24): click
 * LOI, type the value once (checked against the same limits as a single cell) and every market, or
 * only the ticked ones, gets it.
 */
export function ColumnFill({ label, type = 'number', rule, step, count, selected, onFill, hint }: { label: string; type?: 'number' | 'text'; rule?: ColumnRule; step?: string; count: number; selected: number; onFill: (value: string) => void; hint?: string }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [touched, setTouched] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', out);
    return () => document.removeEventListener('mousedown', out);
  }, [open]);
  const n = selected || count;
  const problem = columnProblem(value, type, rule);
  const apply = () => {
    setTouched(true);
    if (problem || !n) return;
    onFill(value.trim());
    setOpen(false);
    setValue('');
    setTouched(false);
  };
  const limits = type === 'number' && rule ? [rule.min !== undefined && `min ${rule.min}`, rule.max !== undefined && `max ${rule.max.toLocaleString()}`, rule.integer && 'whole numbers'].filter(Boolean).join(', ') : '';
  return (
    <div className="relative inline-block" ref={box}>
      <button type="button" className="inline-flex items-center gap-1 rounded px-1 py-0.5 uppercase hover:bg-brand/10 hover:text-brand" aria-expanded={open} title={`Fill ${label} for ${selected ? 'the ticked' : 'all'} markets`} onClick={() => setOpen(!open)}>
        {label}<ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 z-30 mt-1 w-64 rounded-lg border border-line bg-panel p-3 text-left normal-case shadow-xl" role="dialog" aria-label={`Fill ${label}`}>
          <div className="mb-1 text-xs font-semibold text-ink">{label} for {selected ? `${selected} ticked` : `all ${count}`} {n === 1 ? 'market' : 'markets'}</div>
          <input
            className="input px-2 py-1 text-sm"
            type={type === 'number' ? 'number' : 'text'}
            step={step}
            min={rule?.min}
            max={rule?.max}
            autoFocus
            value={value}
            aria-label={`${label} for every market`}
            aria-invalid={touched && !!problem}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } if (e.key === 'Escape') setOpen(false); }}
          />
          <p className={touched && problem ? 'mt-1 text-xs text-bad' : 'mt-1 text-xs text-muted'}>{touched && problem ? problem : hint ?? (limits ? `Allowed: ${limits}.` : 'Leave empty to clear.')}</p>
          <div className="mt-2 flex gap-1.5">
            <button type="button" className="btn-primary px-3 py-1 text-xs" disabled={!n} onClick={apply}>OK, fill {n}</button>
            <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
