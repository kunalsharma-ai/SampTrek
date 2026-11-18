import { amount, Doc, footer, INK, LINE, MUTED, newDoc, table, toBuffer, widths } from './pdf';
import { resolveDesign, type CustomField, type InvoiceDesign, type ResolvedDesign } from './invoice-templates';

/** What the seller prints on its invoices (Settings → Finance → Invoice details). */
export interface InvoiceProfile {
  legalName: string | null;
  address: string | null;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  bankDetails: string | null;
  footer: string | null;
}
export const EMPTY_PROFILE: InvoiceProfile = { legalName: null, address: null, taxId: null, email: null, phone: null, bankDetails: null, footer: null };

export interface InvoicePdfInput {
  org: string;
  profile: InvoiceProfile;
  /** Template, colour, labels, custom fields, signature and stamp (Settings → Invoice design). */
  design?: InvoiceDesign | null;
  /** This invoice's own template and extra fields. */
  invoiceTemplate?: string | null;
  customFields?: CustomField[] | null;
  number: string;
  status: string;
  currency: string;
  issuedAt: string | null;
  dueAt: string | null;
  paidAt: string | null;
  paymentReference: string | null;
  client: { name: string; code: string; billingAddress: string | null; taxId: string | null };
  project: { code: string; name: string; workOrderNo: string | null };
  lines: { description: string; countryCode: string | null; quantity: number; unitPrice: number; amount: number }[];
  subtotal: number;
  taxName: string | null;
  taxPercent: number;
  taxAmount: number;
  total: number;
  notes: string | null;
}

const STAMP: Record<string, string> = { DRAFT: 'DRAFT', VOID: 'VOID', PAID: 'PAID' };

/** #rrggbb mixed with white, for tints of the accent colour. */
function tint(hex: string, amountOfWhite: number): string {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * amountOfWhite).toString(16).padStart(2, '0');
  return `#${mix((n >> 16) & 255)}${mix((n >> 8) & 255)}${mix(n & 255)}`;
}

export async function renderInvoicePdf(e: InvoicePdfInput): Promise<Buffer> {
  const p = e.profile;
  const d = resolveDesign(e.design, { template: e.invoiceTemplate, customFields: e.customFields });
  const seller = p.legalName || e.org;
  const doc = newDoc({ title: `${d.label('title')} ${e.number}`, author: seller });
  const L = doc.page.margins.left;
  const R = doc.page.width - doc.page.margins.right;
  const accent = d.accent;
  const t = d.template;

  const sellerLines = [p.address, d.shows('sellerTaxId') && p.taxId && `${d.label('sellerTaxId')}: ${p.taxId}`, [p.email, p.phone].filter(Boolean).join(' · ')].filter(Boolean) as string[];
  const meta: [string, string][] = [
    ['Number', e.number],
    ['Date', e.issuedAt ?? '–'],
    ...(d.shows('dueDate') ? [[d.label('dueDate'), e.dueAt ?? '–'] as [string, string]] : []),
    ...(e.paidAt ? [['Paid', `${e.paidAt}${e.paymentReference ? ` (${e.paymentReference})` : ''}`] as [string, string]] : []),
  ];

  // ── Header ─────────────────────────────────────────────────────────────
  if (t === 'corporate') doc.rect(0, 0, 14, doc.page.height).fill(accent);
  if (t === 'modern') {
    const h = 110;
    doc.rect(0, 0, doc.page.width, h).fill(accent);
    doc.font('bold').fontSize(16).fillColor('#ffffff').text(seller, L, 32, { width: 300 });
    doc.font('body').fontSize(8).fillColor(tint(accent, 0.8));
    for (const l of sellerLines) doc.text(l, { width: 300 });
    doc.font('bold').fontSize(24).fillColor('#ffffff').text(d.label('title').toUpperCase(), R - 220, 32, { width: 220, align: 'right' });
    doc.font('body').fontSize(9).fillColor('#ffffff').text(e.number, R - 220, doc.y, { width: 220, align: 'right' });
    doc.y = h + 18;
    metaBlock(doc, meta.slice(1), R - 220, doc.y, accent, false);
    doc.y += 4;
  } else if (t === 'elegant') {
    const top = doc.y;
    doc.font('bold').fontSize(26).fillColor(accent).text(d.label('title').toUpperCase(), L, top, { width: R - L, align: 'center', characterSpacing: 4 });
    doc.moveTo(L + 120, doc.y + 4).lineTo(R - 120, doc.y + 4).lineWidth(0.5).strokeColor(accent).stroke();
    doc.moveDown(0.8);
    const y = doc.y;
    doc.font('bold').fontSize(12).fillColor(INK).text(seller, L, y, { width: 280 });
    doc.font('body').fontSize(8.5).fillColor(MUTED);
    for (const l of sellerLines) doc.text(l, { width: 280 });
    const sellerBottom = doc.y;
    const metaBottom = metaBlock(doc, meta, R - 220, y, accent, false);
    doc.y = Math.max(sellerBottom, metaBottom) + 16;
  } else {
    const top = doc.y;
    const x0 = t === 'corporate' ? L + 4 : L;
    doc.font('bold').fontSize(t === 'minimal' ? 12 : 14).fillColor(INK).text(seller, x0, top, { width: 280 });
    doc.font('body').fontSize(8.5).fillColor(MUTED);
    for (const l of sellerLines) doc.text(l, { width: 280 });
    const sellerBottom = doc.y;
    const titleSize = t === 'bold' ? 30 : t === 'minimal' ? 18 : 22;
    doc.font('bold').fontSize(titleSize).fillColor(t === 'minimal' ? INK : accent).text(d.label('title').toUpperCase(), R - 240, top, { width: 240, align: 'right' });
    doc.moveDown(0.3);
    const metaBottom = metaBlock(doc, meta, R - 220, doc.y, accent, t === 'corporate');
    doc.y = Math.max(sellerBottom, metaBottom) + 20;
  }

  // ── Bill to and project ────────────────────────────────────────────────
  const y0 = doc.y;
  const boxed = t === 'corporate' || t === 'bold';
  const billLines = [e.client.billingAddress, d.shows('clientTaxId') && e.client.taxId && `${d.label('clientTaxId')}: ${e.client.taxId}`].filter(Boolean) as string[];
  const forLines = d.shows('for') ? [`${e.project.code} · ${e.project.name}`] : [];
  const woLine = d.shows('workOrder') && e.project.workOrderNo ? `${d.label('workOrder')} ${e.project.workOrderNo}` : null;
  const colW = (R - L - 20) / 2;
  const drawParty = (x: number, title: string, name: string | null, lines: string[]) => {
    doc.font('bold').fontSize(7.5).fillColor(t === 'minimal' ? MUTED : accent).text(title.toUpperCase(), x + (boxed ? 8 : 0), y0 + (boxed ? 8 : 0), { width: colW - 16 });
    if (name) doc.font('bold').fontSize(10).fillColor(INK).text(name, x + (boxed ? 8 : 0), doc.y + 2, { width: colW - 16 });
    doc.font('body').fontSize(8.5).fillColor(MUTED);
    for (const l of lines) doc.text(l, x + (boxed ? 8 : 0), doc.y, { width: colW - 16 });
    return doc.y + (boxed ? 8 : 0);
  };
  const billBottom = drawParty(L, d.label('billTo'), e.client.name, billLines);
  const forBottom = forLines.length || woLine ? drawParty(L + colW + 20, d.label('for'), forLines[0] ?? null, woLine ? [woLine] : []) : y0;
  const partyBottom = Math.max(billBottom, forBottom);
  if (boxed) {
    doc.rect(L, y0, colW, partyBottom - y0).lineWidth(0.75).strokeColor(tint(accent, 0.6)).stroke();
    if (forLines.length || woLine) doc.rect(L + colW + 20, y0, colW, partyBottom - y0).lineWidth(0.75).strokeColor(tint(accent, 0.6)).stroke();
  }
  doc.y = partyBottom + 14;
  doc.x = L;

  // Custom fields (e.g. PO number, PAN, LUT), two per row.
  if (d.customFields.length) {
    const cw = (R - L) / 2;
    for (let i = 0; i < d.customFields.length; i += 2) {
      const y = doc.y;
      let bottom = y;
      for (const [k, f] of d.customFields.slice(i, i + 2).entries()) {
        const x = L + k * cw;
        doc.font('bold').fontSize(8).fillColor(MUTED).text(`${f.label}:`, x, y, { width: 110 });
        doc.font('body').fontSize(8.5).fillColor(INK).text(f.value, x + 112, y, { width: cw - 120 });
        bottom = Math.max(bottom, doc.y);
      }
      doc.y = bottom + 3;
    }
    doc.y += 10;
    doc.x = L;
  }

  // ── Lines ──────────────────────────────────────────────────────────────
  type Ln = InvoicePdfInput['lines'][number];
  const showMarket = d.shows('market');
  const w = widths(doc, showMarket ? [4, 1, 1, 1.4, 1.6] : [5, 1, 1.4, 1.6]);
  const cols = [
    { label: 'Description', width: w[0], value: (l: Ln) => l.description },
    ...(showMarket ? [{ label: d.label('market'), width: w[1], value: (l: Ln) => l.countryCode ?? '' }] : []),
    { label: d.label('quantity'), width: w[showMarket ? 2 : 1], align: 'right' as const, value: (l: Ln) => l.quantity.toLocaleString('en-US') },
    { label: `${d.label('unitPrice')} (${e.currency})`, width: w[showMarket ? 3 : 2], align: 'right' as const, value: (l: Ln) => amount(l.unitPrice) },
    { label: `${d.label('amount')} (${e.currency})`, width: w[showMarket ? 4 : 3], align: 'right' as const, value: (l: Ln) => amount(l.amount) },
  ];
  if (t === 'bold' || t === 'modern' || t === 'corporate') {
    // A coloured band behind the table header.
    const hy = doc.y;
    doc.rect(L, hy, R - L, 20).fill(tint(accent, t === 'bold' ? 0.75 : 0.88));
    doc.y = hy;
  }
  table<Ln>(doc, cols, e.lines, { zebra: t === 'elegant' || t === 'modern' });

  // ── Totals ─────────────────────────────────────────────────────────────
  doc.moveDown(0.6);
  const sums: [string, string, boolean][] = [
    ['Subtotal', amount(e.subtotal), false],
    ...(e.taxPercent > 0 ? [[`${e.taxName ?? 'Tax'} (${e.taxPercent}%)`, amount(e.taxAmount), false] as [string, string, boolean]] : []),
    [`Total (${e.currency})`, amount(e.total), true],
  ];
  if (doc.y + sums.length * 18 + 30 > doc.page.height - doc.page.margins.bottom) doc.addPage();
  for (const [k, v, strong] of sums) {
    const y = doc.y;
    if (strong && t === 'bold') {
      doc.rect(R - 250, y - 4, 250, 26).fill(accent);
      doc.font('bold').fontSize(12).fillColor('#ffffff');
      doc.text(k, R - 242, y + 3, { width: 130 });
      doc.text(v, R - 120, y + 3, { width: 112, align: 'right' });
      doc.y = y + 28;
      continue;
    }
    if (strong) doc.moveTo(R - 240, y - 2).lineTo(R, y - 2).lineWidth(0.75).strokeColor(t === 'minimal' ? LINE : accent).stroke();
    doc.font(strong ? 'bold' : 'body').fontSize(strong ? 11 : 9).fillColor(strong && t !== 'minimal' ? accent : INK);
    doc.text(k, R - 240, y + 2, { width: 130 });
    doc.text(v, R - 110, y + 2, { width: 110, align: 'right' });
    doc.y = y + (strong ? 20 : 16);
  }
  doc.x = L;

  const block = (title: string, body: string | null) => {
    if (!body) return;
    doc.moveDown(0.8);
    doc.font('bold').fontSize(7.5).fillColor(t === 'minimal' ? MUTED : accent).text(title.toUpperCase(), L);
    doc.font('body').fontSize(8.5).fillColor(INK).text(body, L, doc.y + 2, { width: R - L });
  };
  if (d.shows('notes')) block(d.label('notes'), e.notes);
  if (d.shows('paymentDetails')) block(d.label('paymentDetails'), p.bankDetails);

  signatureBlock(doc, d, seller, R);

  const stamp = STAMP[e.status];
  if (stamp) {
    doc.switchToPage(doc.bufferedPageRange().start);
    doc.save();
    doc.rotate(-20, { origin: [doc.page.width / 2, doc.page.height / 2] });
    doc.font('bold').fontSize(90).fillColor(stamp === 'PAID' ? '#16a34a' : '#dc2626').fillOpacity(0.12).text(stamp, 0, doc.page.height / 2 - 50, { width: doc.page.width, align: 'center', lineBreak: false });
    doc.restore();
    doc.fillOpacity(1);
  }
  footer(doc, p.footer || `${seller} · ${d.label('title')} ${e.number}`);
  return toBuffer(doc);
}

/** Number, date and due date, label left and value right. Returns the bottom. */
function metaBlock(doc: Doc, meta: [string, string][], x: number, y: number, accent: string, boxed: boolean): number {
  const top = y;
  doc.y = y + (boxed ? 6 : 0);
  for (const [k, v] of meta) {
    const yy = doc.y;
    doc.font('body').fontSize(8.5).fillColor(MUTED).text(k, x + (boxed ? 8 : 0), yy, { width: 80 });
    doc.font('bold').fillColor(INK).text(v, x + 80, yy, { width: 140 - (boxed ? 8 : 0), align: 'right' });
  }
  const bottom = doc.y + (boxed ? 6 : 0);
  if (boxed) doc.rect(x, top, 220, bottom - top).lineWidth(0.75).strokeColor(tint(accent, 0.6)).stroke();
  return bottom;
}

/** Company stamp and signature, bottom right, with the signatory's name and title. */
function signatureBlock(doc: Doc, d: ResolvedDesign, seller: string, R: number) {
  if (!d.signature && !d.stamp && !d.signatoryName) return;
  const need = 120;
  if (doc.y + need > doc.page.height - doc.page.margins.bottom) doc.addPage();
  const y = doc.y + 24;
  const x = R - 200;
  try {
    if (d.stamp) doc.image(d.stamp, x - 110, y, { fit: [90, 90] });
  } catch {
    /* an unreadable picture is left out */
  }
  try {
    if (d.signature) doc.image(d.signature, x + 20, y + 10, { fit: [160, 55] });
  } catch {
    /* an unreadable picture is left out */
  }
  const lineY = y + 70;
  doc.moveTo(x, lineY).lineTo(R, lineY).lineWidth(0.5).strokeColor(LINE).stroke();
  doc.font('body').fontSize(7.5).fillColor(MUTED).text(`For ${seller}`, x, lineY + 4, { width: 200, align: 'center' });
  if (d.signatoryName) doc.font('bold').fontSize(8.5).fillColor(INK).text(d.signatoryName, x, doc.y + 1, { width: 200, align: 'center' });
  if (d.signatoryTitle) doc.font('body').fontSize(8).fillColor(MUTED).text(d.signatoryTitle, x, doc.y, { width: 200, align: 'center' });
  doc.y = Math.max(doc.y, y + 100);
}
