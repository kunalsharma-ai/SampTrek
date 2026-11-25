'use client';
import clsx from 'clsx';
import { Eye, ImagePlus, Palette, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ErrorBox, Field, Loading, Section, Toggle } from '@/components/ui';
import { API_URL, authInit, api, get } from '@/lib/api';

export interface CustomField { label: string; value: string }
export interface InvoiceTemplate { id: string; name: string; description: string; accent: string }
interface StandardField { key: string; label: string; canHide: boolean }
interface Design {
  template?: string; accentColor?: string | null; labels?: Record<string, string>; hidden?: string[]; customFields?: CustomField[];
  signatureImage?: string | null; stampImage?: string | null; signatoryName?: string | null; signatoryTitle?: string | null;
}
interface DesignResponse { design: Design; templates: InvoiceTemplate[]; fields: StandardField[] }

const MAX_IMAGE_BYTES = 300 * 1024;

/** A small drawing of each template, so people pick by look rather than by name. */
export function TemplateThumb({ id, accent }: { id: string; accent: string }) {
  const bar = (w: string, c = 'bg-line') => <div className={clsx('h-1 rounded', c)} style={{ width: w }} />;
  return (
    <div className="relative h-28 overflow-hidden rounded-md border border-line bg-white p-2" aria-hidden>
      {id === 'corporate' && <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: accent }} />}
      {id === 'modern' ? (
        <div className="-mx-2 -mt-2 mb-2 flex items-center justify-between px-2 py-2" style={{ background: accent }}>
          <div className="h-1.5 w-10 rounded bg-white/80" /><div className="h-2 w-8 rounded bg-white" />
        </div>
      ) : id === 'elegant' ? (
        <div className="mb-2 flex flex-col items-center gap-1"><div className="h-2 w-14 rounded" style={{ background: accent }} /><div className="h-px w-20" style={{ background: accent }} /></div>
      ) : (
        <div className="mb-2 flex items-start justify-between">
          <div className="space-y-1">{bar('40px', 'bg-gray-700')}{bar('30px')}</div>
          <div className={clsx('rounded', id === 'bold' ? 'h-3 w-14' : 'h-2 w-10')} style={{ background: id === 'minimal' ? '#111827' : accent }} />
        </div>
      )}
      <div className={clsx('mb-2 grid grid-cols-2 gap-2', (id === 'corporate' || id === 'bold') && '[&>div]:border [&>div]:p-1')}>
        <div className="space-y-1" style={{ borderColor: accent }}>{bar('70%')}{bar('50%')}</div>
        <div className="space-y-1" style={{ borderColor: accent }}>{bar('60%')}{bar('40%')}</div>
      </div>
      <div className="space-y-1">
        <div className="h-1.5 rounded" style={{ background: id === 'bold' || id === 'modern' || id === 'corporate' ? accent + '55' : '#e5e7eb' }} />
        {[0, 1, 2].map((i) => <div key={i} className={clsx('h-1 rounded', id === 'elegant' || id === 'modern' ? (i % 2 ? 'bg-gray-100' : 'bg-gray-200') : 'bg-gray-100')} />)}
      </div>
      <div className="mt-2 flex justify-end"><div className={clsx('rounded', id === 'bold' ? 'h-2.5 w-16' : 'h-1.5 w-12')} style={{ background: id === 'minimal' ? '#9ca3af' : accent }} /></div>
    </div>
  );
}

/** Rows of label + value, for invoice extra fields. */
export function CustomFieldsEditor({ value, onChange, disabled }: { value: CustomField[]; onChange: (v: CustomField[]) => void; disabled?: boolean }) {
  return (
    <div className="space-y-2">
      {value.map((f, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2">
          <input className="input w-44" placeholder="Label, e.g. PO number" maxLength={60} value={f.label} disabled={disabled} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, label: e.target.value } : x)))} aria-label={`Field ${i + 1} label`} />
          <input className="input min-w-[12rem] flex-1" placeholder="Value" maxLength={300} value={f.value} disabled={disabled} onChange={(e) => onChange(value.map((x, k) => (k === i ? { ...x, value: e.target.value } : x)))} aria-label={`Field ${i + 1} value`} />
          {!disabled && <button type="button" className="btn-ghost p-2" aria-label={`Remove field ${i + 1}`} onClick={() => onChange(value.filter((_, k) => k !== i))}><Trash2 className="h-4 w-4" /></button>}
        </div>
      ))}
      {!disabled && value.length < 12 && (
        <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={() => onChange([...value, { label: '', value: '' }])}><Plus className="h-3.5 w-3.5" /> Add a field</button>
      )}
    </div>
  );
}

function ImagePicker({ label, hint, value, onChange, disabled }: { label: string; hint: string; value: string | null | undefined; onChange: (v: string | null) => void; disabled?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div>
      <div className="mb-1 text-sm font-medium">{label}</div>
      <div className="flex items-center gap-3">
        <div className="grid h-20 w-36 place-items-center overflow-hidden rounded-lg border border-dashed border-line bg-white">
          {value ? <img src={value} alt={label} className="max-h-full max-w-full object-contain" /> : <ImagePlus className="h-5 w-5 text-muted" aria-hidden />}
        </div>
        {!disabled && (
          <div className="flex flex-col gap-1.5">
            <label className="btn-ghost cursor-pointer px-2.5 py-1.5 text-xs">
              <ImagePlus className="h-3.5 w-3.5" /> {value ? 'Change' : 'Upload'}
              <input
                type="file"
                accept="image/png,image/jpeg"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (!/^image\/(png|jpeg)$/.test(f.type)) return setError('Use a PNG or JPEG picture.');
                  if (f.size > MAX_IMAGE_BYTES) return setError('Use a picture under 300 KB.');
                  setError(null);
                  const r = new FileReader();
                  r.onload = () => onChange(String(r.result));
                  r.readAsDataURL(f);
                }}
              />
            </label>
            {value && <button type="button" className="btn-ghost px-2.5 py-1.5 text-xs text-bad" onClick={() => onChange(null)}><X className="h-3.5 w-3.5" /> Remove</button>}
          </div>
        )}
      </div>
      <p className={clsx('mt-1 text-xs', error ? 'text-bad' : 'text-muted')}>{error ?? hint}</p>
    </div>
  );
}

/**
 * Settings → Invoice design (feedback 2026-11-18): six templates, an accent colour, which standard
 * fields show and what they are called, extra fields printed on every invoice, and the signature and
 * company stamp. "Preview" opens a sample invoice in the design as it stands, before saving.
 */
export function InvoiceDesignSettings({ isAdmin }: { isAdmin: boolean }) {
  const [data, setData] = useState<DesignResponse | null>(null);
  const [d, setD] = useState<Design>({});
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    get<DesignResponse>('/organization/invoice-design').then((r) => { setData(r); setD(r.design ?? {}); }).catch(setError);
  }, []);
  const set = (patch: Partial<Design>) => { setD((x) => ({ ...x, ...patch })); setSaved(false); };
  const clean = (): Design => ({
    ...d,
    customFields: (d.customFields ?? []).filter((f) => f.label.trim() && f.value.trim()),
    labels: Object.fromEntries(Object.entries(d.labels ?? {}).filter(([, v]) => v.trim())),
  });

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<DesignResponse>('/organization/invoice-design', { method: 'PUT', json: clean() });
      setData(r);
      setD(r.design);
      setSaved(true);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  async function preview() {
    setError(null);
    try {
      const res = await fetch(`${API_URL}/api/v1/organization/invoice-design/preview`, { method: 'POST', credentials: authInit().credentials, headers: { ...authInit().headers, 'Content-Type': 'application/json' }, body: JSON.stringify(clean()) });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? `Preview failed (${res.status})`);
      const url = URL.createObjectURL(await res.blob());
      window.open(url, '_blank', 'noopener');
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (e) {
      setError(e);
    }
  }

  if (!data) return <Section title="Invoice design">{error ? <ErrorBox error={error} /> : <Loading />}</Section>;
  const template = d.template ?? 'classic';
  const preset = data.templates.find((t) => t.id === template) ?? data.templates[0];
  const accent = d.accentColor || preset.accent;
  const hidden = new Set(d.hidden ?? []);

  return (
    <Section help="settings.invoiceDesign" title={<span className="inline-flex items-center gap-2"><Palette className="h-4 w-4" />Invoice design</span>} className="mb-6" actions={<button type="button" className="btn-ghost px-2.5 py-1.5 text-xs" onClick={preview}><Eye className="h-3.5 w-3.5" /> Preview sample PDF</button>}>
      <p className="mb-4 text-sm text-muted">
        How invoice PDFs look. Pick a template, then change its colour, rename or hide its fields, add your own fields, and upload a signature and company stamp. Each draft invoice can still pick another template and add fields of its own (e.g. a PO number).
      </p>
      <ErrorBox error={error} />
      <fieldset disabled={!isAdmin} className="space-y-6">
        <div>
          <div className="mb-2 text-sm font-medium">Template</div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" role="radiogroup" aria-label="Invoice template">
            {data.templates.map((t) => (
              <button key={t.id} type="button" role="radio" aria-checked={template === t.id} onClick={() => set({ template: t.id })} className={clsx('rounded-xl border p-2 text-left transition', template === t.id ? 'border-brand ring-2 ring-brand/30' : 'border-line hover:border-brand/50')}>
                <TemplateThumb id={t.id} accent={template === t.id ? accent : t.accent} />
                <div className="mt-1.5 text-sm font-semibold">{t.name}</div>
                <div className="text-[11px] leading-snug text-muted">{t.description}</div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-4">
          <Field label="Accent colour" hint="Empty = the template's own colour">
            <span className="flex items-center gap-2">
              <input type="color" className="h-9 w-12 cursor-pointer rounded border border-line bg-transparent" value={accent} onChange={(e) => set({ accentColor: e.target.value })} aria-label="Accent colour" />
              <code className="text-xs">{accent}</code>
              {d.accentColor && <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => set({ accentColor: null })}>Use template colour</button>}
            </span>
          </Field>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Fields on the template</div>
          <p className="mb-2 text-xs text-muted">Rename any field (e.g. INVOICE → TAX INVOICE, Bill to → Customer), or switch it off.</p>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 md:grid-cols-2">
            {data.fields.map((f) => (
              <div key={f.key} className="flex items-center gap-2">
                <input className="input flex-1 py-1.5 text-sm" placeholder={f.label} maxLength={40} value={d.labels?.[f.key] ?? ''} onChange={(e) => set({ labels: { ...(d.labels ?? {}), [f.key]: e.target.value } })} aria-label={`Name for ${f.label}`} disabled={!isAdmin || hidden.has(f.key)} />
                {f.canHide ? (
                  <span className="flex w-24 items-center gap-1.5 text-xs text-muted">
                    <Toggle checked={!hidden.has(f.key)} onChange={(on) => set({ hidden: on ? [...hidden].filter((k) => k !== f.key) : [...hidden, f.key] })} label={`Show ${f.label}`} />
                    {hidden.has(f.key) ? 'Hidden' : 'Shown'}
                  </span>
                ) : <span className="w-24 text-xs text-muted">Always shown</span>}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1 text-sm font-medium">Your own fields</div>
          <p className="mb-2 text-xs text-muted">Printed on every invoice under the bill-to block, e.g. PAN, CIN, LUT number, HSN/SAC code.</p>
          <CustomFieldsEditor value={d.customFields ?? []} onChange={(v) => set({ customFields: v })} disabled={!isAdmin} />
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <ImagePicker label="Signature" hint="PNG with a transparent background looks best. Under 300 KB." value={d.signatureImage} onChange={(v) => set({ signatureImage: v })} disabled={!isAdmin} />
          <ImagePicker label="Company stamp or seal" hint="Printed next to the signature. PNG or JPEG, under 300 KB." value={d.stampImage} onChange={(v) => set({ stampImage: v })} disabled={!isAdmin} />
          <Field label="Signed by (name)"><input className="input" maxLength={120} value={d.signatoryName ?? ''} onChange={(e) => set({ signatoryName: e.target.value || null })} /></Field>
          <Field label="Title" hint="e.g. Authorised signatory, Director"><input className="input" maxLength={120} value={d.signatoryTitle ?? ''} onChange={(e) => set({ signatoryTitle: e.target.value || null })} /></Field>
        </div>

        {isAdmin && (
          <div className="flex justify-end gap-2">
            <button type="button" className="btn-ghost" onClick={preview}><Eye className="h-4 w-4" /> Preview</button>
            <button type="button" className="btn-primary" disabled={busy} onClick={save}>{busy ? 'Saving…' : saved ? 'Saved' : 'Save invoice design'}</button>
          </div>
        )}
      </fieldset>
    </Section>
  );
}
