import { z } from 'zod';

/**
 * Invoice layouts and what a company can change on them (feedback 2026-11-18): six templates, an
 * accent colour, which standard fields show and what they are called, extra fields of its own,
 * and a signature and company stamp printed at the foot. Set in Settings → Invoice design; each
 * invoice can add its own fields (e.g. a PO number) and pick another template.
 */
export const INVOICE_TEMPLATES = [
  { id: 'classic', name: 'Classic', description: 'Seller top left, INVOICE in your colour, clean lines.', accent: '#1d4ed8' },
  { id: 'modern', name: 'Modern', description: 'A full colour band across the top with the seller in white.', accent: '#7c3aed' },
  { id: 'minimal', name: 'Minimal', description: 'Black and grey only, lots of white space.', accent: '#111827' },
  { id: 'bold', name: 'Bold', description: 'Big total box and a coloured table header.', accent: '#ea580c' },
  { id: 'corporate', name: 'Corporate', description: 'Coloured side bar, boxed bill-to and details.', accent: '#0f766e' },
  { id: 'elegant', name: 'Elegant', description: 'Centred title with thin rules and a striped table.', accent: '#9d174d' },
] as const;
export type InvoiceTemplateId = (typeof INVOICE_TEMPLATES)[number]['id'];
export const TEMPLATE_IDS = INVOICE_TEMPLATES.map((t) => t.id) as [InvoiceTemplateId, ...InvoiceTemplateId[]];

/** Standard fields that can be hidden or renamed. */
export const STANDARD_FIELDS = [
  { key: 'title', label: 'INVOICE', canHide: false },
  { key: 'billTo', label: 'Bill to', canHide: false },
  { key: 'for', label: 'For', canHide: true },
  { key: 'workOrder', label: 'Work order', canHide: true },
  { key: 'market', label: 'Market', canHide: true },
  { key: 'quantity', label: 'Quantity', canHide: false },
  { key: 'unitPrice', label: 'Unit price', canHide: false },
  { key: 'amount', label: 'Amount', canHide: false },
  { key: 'dueDate', label: 'Due', canHide: true },
  { key: 'sellerTaxId', label: 'Tax ID', canHide: true },
  { key: 'clientTaxId', label: 'Client tax ID', canHide: true },
  { key: 'notes', label: 'Notes', canHide: true },
  { key: 'paymentDetails', label: 'Payment details', canHide: true },
] as const;
export type StandardField = (typeof STANDARD_FIELDS)[number]['key'];

/** Pictures are stored as data URLs (PNG or JPEG) of at most this many characters (~300 KB). */
const MAX_IMAGE = 420_000;
export const imageDataUrl = z
  .string()
  .max(MAX_IMAGE, 'Use a picture under 300 KB')
  .regex(/^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/, 'Use a PNG or JPEG picture');

export const customFieldSchema = z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().max(300) });
export type CustomField = z.infer<typeof customFieldSchema>;

export const invoiceDesignSchema = z
  .object({
    template: z.enum(TEMPLATE_IDS).optional(),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Use a colour like #1d4ed8').nullable().optional(),
    /** Renamed standard fields, e.g. { title: 'TAX INVOICE', billTo: 'Customer' }. */
    labels: z.record(z.string(), z.string().trim().max(40)).optional(),
    /** Standard fields switched off, e.g. ['market', 'workOrder']. */
    hidden: z.array(z.string()).max(STANDARD_FIELDS.length).optional(),
    /** Printed on every invoice, e.g. PAN, CIN, LUT number. */
    customFields: z.array(customFieldSchema).max(12).optional(),
    signatureImage: imageDataUrl.nullable().optional(),
    stampImage: imageDataUrl.nullable().optional(),
    signatoryName: z.string().trim().max(120).nullable().optional(),
    signatoryTitle: z.string().trim().max(120).nullable().optional(),
  })
  .strict()
  .superRefine((d, ctx) => {
    const known = STANDARD_FIELDS.map((f) => f.key) as string[];
    for (const k of Object.keys(d.labels ?? {})) if (!known.includes(k)) ctx.addIssue({ code: 'custom', message: `Unknown field ${k}`, path: ['labels'] });
    for (const k of d.hidden ?? []) {
      const f = STANDARD_FIELDS.find((x) => x.key === k);
      if (!f) ctx.addIssue({ code: 'custom', message: `Unknown field ${k}`, path: ['hidden'] });
      else if (!f.canHide) ctx.addIssue({ code: 'custom', message: `${f.label} cannot be hidden`, path: ['hidden'] });
    }
  });
export type InvoiceDesign = z.infer<typeof invoiceDesignSchema>;

export interface ResolvedDesign {
  template: InvoiceTemplateId;
  accent: string;
  label: (k: StandardField) => string;
  shows: (k: StandardField) => boolean;
  customFields: CustomField[];
  signature: Buffer | null;
  stamp: Buffer | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export function imageBuffer(dataUrl: string | null | undefined): Buffer | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(png|jpeg|jpg);base64,(.+)$/.exec(dataUrl);
  return m ? Buffer.from(m[2], 'base64') : null;
}

/** The organisation's design with the invoice's own template and fields on top. */
export function resolveDesign(org: InvoiceDesign | null | undefined, invoice: { template?: string | null; customFields?: CustomField[] | null } = {}): ResolvedDesign {
  const d = org ?? {};
  const template = (TEMPLATE_IDS as string[]).includes(invoice.template ?? '') ? (invoice.template as InvoiceTemplateId) : d.template ?? 'classic';
  const preset = INVOICE_TEMPLATES.find((t) => t.id === template)!;
  const hidden = new Set(d.hidden ?? []);
  return {
    template,
    accent: d.accentColor || preset.accent,
    label: (k) => d.labels?.[k]?.trim() || STANDARD_FIELDS.find((f) => f.key === k)!.label,
    shows: (k) => !hidden.has(k),
    customFields: [...(d.customFields ?? []), ...(invoice.customFields ?? [])].filter((f) => f.label && f.value),
    signature: imageBuffer(d.signatureImage),
    stamp: imageBuffer(d.stampImage),
    signatoryName: d.signatoryName ?? null,
    signatoryTitle: d.signatoryTitle ?? null,
  };
}
