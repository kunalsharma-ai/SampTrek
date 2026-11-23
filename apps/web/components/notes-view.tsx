'use client';
/**
 * Shows pasted text as it was: tables pasted from Excel or a client's quota report (tab-separated
 * lines, or lines like | a | b |) become tables; other lines stay as text. Nothing is read as HTML.
 */
type Block = { kind: 'text'; lines: string[] } | { kind: 'table'; rows: string[][] };

const cellsOf = (line: string): string[] | null => {
  if (line.includes('\t')) return line.split('\t').map((c) => c.trim());
  const t = line.trim();
  if (t.startsWith('|') && t.endsWith('|') && t.length > 2) return t.slice(1, -1).split('|').map((c) => c.trim());
  return null;
};

export function parseNotes(text: string): Block[] {
  const out: Block[] = [];
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const cells = cellsOf(line);
    // Skip the |---|---| line under a header.
    if (cells && cells.every((c) => /^:?-{2,}:?$/.test(c))) continue;
    const last = out[out.length - 1];
    if (cells) {
      if (last?.kind === 'table') last.rows.push(cells);
      else out.push({ kind: 'table', rows: [cells] });
    } else if (last?.kind === 'text') last.lines.push(line);
    else out.push({ kind: 'text', lines: [line] });
  }
  return out.filter((b) => b.kind === 'table' || b.lines.some((l) => l.trim()));
}

export function NotesView({ text }: { text: string }) {
  return (
    <div className="space-y-3 text-sm">
      {parseNotes(text).map((b, i) => {
        if (b.kind === 'text') return <p key={i} className="whitespace-pre-wrap">{b.lines.join('\n').trim()}</p>;
        const width = Math.max(...b.rows.map((r) => r.length));
        const [head, ...body] = b.rows;
        return (
          <div key={i} className="overflow-x-auto rounded-lg border border-line">
            <table className="w-full text-sm">
              <thead className="bg-sunken/60"><tr>{Array.from({ length: width }, (_, c) => <th key={c} className="th whitespace-nowrap">{head[c] ?? ''}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {body.map((r, n) => <tr key={n}>{Array.from({ length: width }, (_, c) => <td key={c} className="td whitespace-nowrap tabular-nums">{r[c] ?? ''}</td>)}</tr>)}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}
