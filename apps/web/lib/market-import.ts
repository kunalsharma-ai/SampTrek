/**
 * Target markets from a spreadsheet (Create project → Target markets → Upload from Excel).
 * Columns: Country, Language, LOI, IR, CPI, Completes, Target group. A header row is optional,
 * and when it is there its column names decide the order.
 */
export const MARKET_TEMPLATE_HEADER = ['Country', 'Language', 'LOI (minutes)', 'IR %', 'CPI', 'Completes', 'Target group'];
export const MARKET_TEMPLATE_EXAMPLES: (string | number)[][] = [
  ['JP', 'ja', 15, 30, 12.5, 500, 'Gen Z'],
  ['Japan', 'ja', 15, 25, 11, 300, 'Parents'],
  ['United States', 'en', 12, 40, 6, 1000, ''],
];

export interface MarketImportRow { code: string; language?: string; loiMinutes?: number; irPercent?: number; cpi?: number; targetCompletes?: number; targetGroup?: string }
type Country = { code: string; name: string };
type Col = 'country' | 'language' | 'loi' | 'ir' | 'cpi' | 'completes' | 'targetGroup';
const ORDER: Col[] = ['country', 'language', 'loi', 'ir', 'cpi', 'completes', 'targetGroup'];

function headerCol(h: string): Col | null {
  const x = h.toLowerCase().replace(/[^a-z%]/g, '');
  if (/^(country|market|countrycode)/.test(x)) return 'country';
  if (/^(language|lang)/.test(x)) return 'language';
  if (/^(loi|length)/.test(x)) return 'loi';
  if (/^(ir|incidence)/.test(x)) return 'ir';
  if (/^(cpi|price|rate)/.test(x)) return 'cpi';
  if (/^(completes|target(completes)?$|n$|quota|sample)/.test(x)) return 'completes';
  if (/^(targetgroup|tg|audience|group)/.test(x)) return 'targetGroup';
  return null;
}

/** Splits pasted cells: tabs (copied from Excel) or commas / semicolons (CSV). */
export function splitPasted(text: string): string[][] {
  return text.split(/\r?\n/).filter((l) => l.trim()).map((l) => (l.includes('\t') ? l.split('\t') : l.split(/[,;]/)).map((s) => s.trim()));
}

/** Numbers as people type them in Excel: "12.50", "$12.50", "30%", "1,000". */
function number(v: string | undefined): number | undefined {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.replace(/[%$€£₹\s]/g, '').replace(/,(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseMarketSheet(rows: string[][], countries: Country[]): { rows: MarketImportRow[]; skipped: number } {
  const find = (v: string) => {
    const t = v.trim().toLowerCase();
    return t ? countries.find((c) => c.code.toLowerCase() === t || c.name.toLowerCase() === t) : undefined;
  };
  let order = ORDER;
  let body = rows.filter((r) => r.some((c) => (c ?? '').trim()));
  const first = body[0];
  if (first && !find(first[0] ?? '')) {
    const mapped = first.map((h) => headerCol(h ?? ''));
    if (mapped.includes('country')) { order = mapped as Col[]; body = body.slice(1); }
  }
  const out: MarketImportRow[] = [];
  let skipped = 0;
  for (const r of body) {
    const get = (c: Col) => { const i = order.indexOf(c); return i < 0 ? undefined : (r[i] ?? '').trim(); };
    const c = find(get('country') ?? '');
    if (!c) { skipped++; continue; }
    const row: MarketImportRow = { code: c.code };
    const lang = get('language'); if (lang) row.language = lang;
    const loi = number(get('loi')); if (loi !== undefined) row.loiMinutes = loi;
    const ir = number(get('ir')); if (ir !== undefined) row.irPercent = ir;
    const cpi = number(get('cpi')); if (cpi !== undefined) row.cpi = cpi;
    const n = number(get('completes')); if (n !== undefined) row.targetCompletes = n;
    const tg = get('targetGroup'); if (tg) row.targetGroup = tg;
    out.push(row);
  }
  return { rows: out, skipped };
}
