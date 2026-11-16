import { MARKET_TEMPLATE_EXAMPLES, MARKET_TEMPLATE_HEADER, parseMarketSheet, splitPasted } from '../lib/market-import.ts';
import { readXlsx, writeXlsx } from '../lib/xlsx.ts';

/** Checks the target market upload (lib/market-import.ts): template, header detection, numbers, pasted text. */
let failed = 0;
function ok(name: string, cond: boolean, got?: unknown) {
  if (!cond) { failed++; console.log(`✗ ${name}${got !== undefined ? ` (got ${JSON.stringify(got)})` : ''}`); }
}
const C = [{ code: 'JP', name: 'Japan' }, { code: 'US', name: 'United States' }, { code: 'GB', name: 'United Kingdom' }];

// The downloadable template reads back into three markets.
const sheet = await readXlsx(writeXlsx([MARKET_TEMPLATE_HEADER, ...MARKET_TEMPLATE_EXAMPLES], 'Markets'));
const t = parseMarketSheet(sheet, C);
ok('template rows', t.rows.length === 3 && t.skipped === 0, t);
ok('template values', JSON.stringify(t.rows[0]) === JSON.stringify({ code: 'JP', language: 'ja', loiMinutes: 15, irPercent: 30, cpi: 12.5, targetCompletes: 500, targetGroup: 'Gen Z' }), t.rows[0]);
ok('country by name', t.rows[1].code === 'JP' && t.rows[2].code === 'US' && t.rows[2].targetGroup === undefined, t.rows);

// Columns in another order, found by the header names; formatted numbers; unknown countries skipped.
const other = parseMarketSheet([['Completes', 'Market', 'CPI', 'IR'], ['1,000', 'united kingdom', '$7.25', '35%'], ['10', 'Atlantis', '1', '1'], ['', '', '', '']], C);
ok('header order', other.rows.length === 1 && other.skipped === 1, other);
ok('formatted numbers', JSON.stringify(other.rows[0]) === JSON.stringify({ code: 'GB', irPercent: 35, cpi: 7.25, targetCompletes: 1000 }), other.rows[0]);

// Pasted Excel cells (tabs) and CSV, without a header.
const pasted = parseMarketSheet(splitPasted('JP\tja\t15\t30\t12.50\t500\tGen Z\nUS,en,10,20,5,200\n'), C);
ok('pasted rows', pasted.rows.length === 2 && pasted.rows[1].targetCompletes === 200 && pasted.rows[0].targetGroup === 'Gen Z', pasted);

if (failed) { console.log(`${failed} market import check(s) failed`); process.exit(1); }
console.log('✓ market import');
