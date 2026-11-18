/**
 * Excel workbooks with several sheets, typed cells and real Excel charts (pie, column), written
 * without a library (feedback 2026-11-18: client report "with charting, pie chart format, visual
 * comparison"). Charts are native DrawingML charts that point at cells on a data sheet, so they
 * stay live in Excel, LibreOffice and Google Sheets. Uses the zip writer of lib/xlsx.ts.
 */
import { columnName, xmlEscape, zip } from './xlsx';

export type Cell = string | number | null | undefined | { v: number; fmt: 'money' | 'percent' | 'int' };
export interface SheetSpec {
  name: string;
  rows: Cell[][];
  /** Header rows in bold (default 1). */
  headerRows?: number;
  widths?: number[];
}
export interface ChartSpec {
  type: 'pie' | 'doughnut' | 'column';
  title: string;
  /** Sheet (index in `sheets`) the data is on. */
  dataSheet: number;
  /** Category labels: column index and the first/last row (0-based, inclusive). */
  categories: { col: number; from: number; to: number };
  series: { name: string; col: number }[];
  /** Where the chart sits on `onSheet`: top-left cell and size in cells. */
  onSheet: number;
  at: { col: number; row: number; cols: number; rows: number };
}

const enc = new TextEncoder();
const STYLE = { text: 0, bold: 1, money: 2, percent: 3, int: 4, title: 5 } as const;
const PALETTE = ['4F46E5', '06B6D4', 'F59E0B', '10B981', 'EC4899', '8B5CF6', 'EF4444', '84CC16', '0EA5E9', 'F97316'];

const sheetRef = (name: string) => `'${name.replace(/'/g, "''")}'`;
const abs = (col: number, row: number) => `$${columnName(col)}$${row + 1}`;

function cellXml(v: Cell, ri: number, ci: number, header: boolean): string {
  const ref = `${columnName(ci)}${ri + 1}`;
  if (v === null || v === undefined || v === '') return '';
  if (typeof v === 'number') return Number.isFinite(v) ? `<c r="${ref}"${header ? ` s="${STYLE.bold}"` : ''}><v>${v}</v></c>` : '';
  if (typeof v === 'object') return Number.isFinite(v.v) ? `<c r="${ref}" s="${STYLE[v.fmt]}"><v>${v.v}</v></c>` : '';
  return `<c r="${ref}" t="inlineStr"${header ? ` s="${STYLE.bold}"` : ''}><is><t xml:space="preserve">${xmlEscape(String(v))}</t></is></c>`;
}

function sheetXml(s: SheetSpec, drawing: boolean): string {
  const head = s.headerRows ?? 1;
  const widths = s.widths ?? (s.rows[head - 1] ?? s.rows[0] ?? []).map((_, i) => Math.min(48, Math.max(10, ...s.rows.map((r) => String(typeof r[i] === 'object' && r[i] ? (r[i] as { v: number }).v : r[i] ?? '').length + 2))));
  const rows = s.rows.map((r, ri) => `<row r="${ri + 1}">${r.map((v, ci) => cellXml(v, ri, ci, ri < head)).join('')}</row>`).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetViews><sheetView workbookViewId="0">${head ? `<pane ySplit="${head}" topLeftCell="A${head + 1}" activePane="bottomLeft" state="frozen"/>` : ''}</sheetView></sheetViews><cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${rows}</sheetData>${drawing ? '<drawing r:id="rId1"/>' : ''}</worksheet>`;
}

function text(v: Cell): string {
  if (v === null || v === undefined) return '';
  return typeof v === 'object' ? String(v.v) : String(v);
}
function num(v: Cell): number {
  const n = typeof v === 'object' && v ? v.v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

function chartXml(c: ChartSpec, sheets: SheetSpec[]): string {
  const data = sheets[c.dataSheet];
  const ref = sheetRef(data.name);
  const n = c.categories.to - c.categories.from + 1;
  const catRef = `${ref}!${abs(c.categories.col, c.categories.from)}:${abs(c.categories.col, c.categories.to)}`;
  const cats = Array.from({ length: n }, (_, i) => text(data.rows[c.categories.from + i]?.[c.categories.col]));
  const ser = c.series
    .map((s, si) => {
      const vals = Array.from({ length: n }, (_, i) => num(data.rows[c.categories.from + i]?.[s.col]));
      const pie = c.type !== 'column';
      const points = pie
        ? cats.map((_, i) => `<c:dPt><c:idx val="${i}"/><c:bubble3D val="0"/><c:spPr><a:solidFill><a:srgbClr val="${PALETTE[i % PALETTE.length]}"/></a:solidFill></c:spPr></c:dPt>`).join('')
        : '';
      return `<c:ser><c:idx val="${si}"/><c:order val="${si}"/><c:tx><c:v>${xmlEscape(s.name)}</c:v></c:tx>${pie ? '' : `<c:spPr><a:solidFill><a:srgbClr val="${PALETTE[si % PALETTE.length]}"/></a:solidFill></c:spPr><c:invertIfNegative val="0"/>`}${points}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="${pie ? 0 : 0}"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="${pie ? 1 : 0}"/><c:showBubbleSize val="0"/></c:dLbls><c:cat><c:strRef><c:f>${xmlEscape(catRef)}</c:f><c:strCache><c:ptCount val="${n}"/>${cats.map((v, i) => `<c:pt idx="${i}"><c:v>${xmlEscape(v)}</c:v></c:pt>`).join('')}</c:strCache></c:strRef></c:cat><c:val><c:numRef><c:f>${xmlEscape(`${ref}!${abs(s.col, c.categories.from)}:${abs(s.col, c.categories.to)}`)}</c:f><c:numCache><c:formatCode>General</c:formatCode><c:ptCount val="${n}"/>${vals.map((v, i) => `<c:pt idx="${i}"><c:v>${v}</c:v></c:pt>`).join('')}</c:numCache></c:numRef></c:val></c:ser>`;
    })
    .join('');
  const plot =
    c.type === 'column'
      ? `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${ser}<c:gapWidth val="80"/><c:axId val="111"/><c:axId val="222"/></c:barChart><c:catAx><c:axId val="111"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="222"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="222"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="#,##0" sourceLinked="0"/><c:tickLblPos val="nextTo"/><c:crossAx val="111"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>`
      : c.type === 'doughnut'
        ? `<c:doughnutChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/><c:holeSize val="55"/></c:doughnutChart>`
        : `<c:pieChart><c:varyColors val="1"/>${ser}<c:firstSliceAng val="0"/></c:pieChart>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr sz="1300" b="1"/></a:pPr><a:r><a:rPr lang="en-US" sz="1300" b="1"/><a:t>${xmlEscape(c.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:autoTitleDeleted val="0"/><c:plotArea><c:layout/>${plot}</c:plotArea><c:legend><c:legendPos val="${c.type === 'column' ? 'b' : 'r'}"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function drawingXml(charts: { c: ChartSpec; rid: string }[]): string {
  const anchors = charts
    .map(({ c, rid }, i) => `<xdr:twoCellAnchor editAs="oneCell"><xdr:from><xdr:col>${c.at.col}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.at.row}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c.at.col + c.at.cols}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${c.at.row + c.at.rows}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${i + 2}" name="Chart ${i + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="${rid}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`)
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors}</xdr:wsDr>`;
}

const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const rels = (items: [string, string, string][]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${items.map(([id, type, target]) => `<Relationship Id="${id}" Type="${REL}/${type}" Target="${target}"/>`).join('')}</Relationships>`;

/** A workbook of several sheets with native charts. */
export function writeWorkbook(sheets: SheetSpec[], charts: ChartSpec[] = []): Uint8Array {
  const files: [string, string][] = [];
  const names = sheets.map((s, i) => s.name.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || `Sheet${i + 1}`);
  sheets.forEach((s, i) => (s.name = names[i]));
  const drawingSheets = [...new Set(charts.map((c) => c.onSheet))];
  let chartNo = 0;
  const overrides: string[] = [];
  sheets.forEach((s, i) => {
    const has = drawingSheets.includes(i);
    files.push([`xl/worksheets/sheet${i + 1}.xml`, sheetXml(s, has)]);
    overrides.push(`<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    if (!has) return;
    const d = drawingSheets.indexOf(i) + 1;
    files.push([`xl/worksheets/_rels/sheet${i + 1}.xml.rels`, rels([['rId1', 'drawing', `../drawings/drawing${d}.xml`]])]);
    const mine = charts.filter((c) => c.onSheet === i).map((c, k) => ({ c, rid: `rId${k + 1}`, no: ++chartNo }));
    files.push([`xl/drawings/drawing${d}.xml`, drawingXml(mine)]);
    files.push([`xl/drawings/_rels/drawing${d}.xml.rels`, rels(mine.map((m) => [m.rid, 'chart', `../charts/chart${m.no}.xml`]))]);
    overrides.push(`<Override PartName="/xl/drawings/drawing${d}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
    for (const m of mine) {
      files.push([`xl/charts/chart${m.no}.xml`, chartXml(m.c, sheets)]);
      overrides.push(`<Override PartName="/xl/charts/chart${m.no}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
    }
  });
  files.unshift(
    ['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${overrides.join('')}</Types>`],
    ['_rels/.rels', rels([['rId1', 'officeDocument', 'xl/workbook.xml']])],
    ['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${REL}"><sheets>${names.map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`],
    ['xl/_rels/workbook.xml.rels', rels([...names.map((_, i) => [`rId${i + 1}`, 'worksheet', `worksheets/sheet${i + 1}.xml`] as [string, string, string]), [`rId${names.length + 1}`, 'styles', 'styles.xml']])],
    ['xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0.00"/></numFmts><fonts count="3"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/></cellXfs></styleSheet>`],
  );
  return zip(files.map(([n, d]) => ({ name: n, data: enc.encode(d) })));
}
