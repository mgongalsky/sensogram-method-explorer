// Tolerant text parsing for spectral files: two-column (wavelength, reflectance) files
// and matrix files (wavelength + one column per time point).

/** Natural filename order: "spectrum2" sorts before "spectrum10". */
export function natCmp(a: string, b: string): number {
  type Chunk = { n?: number; t?: string };
  const chunk = (s: string): Chunk[] => {
    const out: Chunk[] = [];
    String(s).replace(/(\d+)|(\D+)/g, (_m, n: string | undefined, t: string | undefined) => { out.push(n !== undefined ? { n: +n } : { t }); return ''; });
    return out;
  };
  const ax = chunk(a), bx = chunk(b);
  for (let i = 0; i < Math.min(ax.length, bx.length); i++) {
    const p1 = ax[i], p2 = bx[i];
    if (p1.n !== undefined && p2.n !== undefined) { if (p1.n !== p2.n) return p1.n - p2.n; }
    else if (p1.t !== undefined && p2.t !== undefined) { const d = p1.t.localeCompare(p2.t); if (d) return d; }
    else return p1.n !== undefined ? -1 : 1;
  }
  return ax.length - bx.length;
}

export type Delim = ',' | ';' | '\t' | 'ws';

/** Picks the most frequent of comma, semicolon and tab; falls back to whitespace. */
export function sniffDelim(lines: readonly string[]): Delim {
  const c: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 };
  lines.forEach(l => {
    c[','] += (l.match(/,/g) || []).length;
    c[';'] += (l.match(/;/g) || []).length;
    c['\t'] += (l.match(/\t/g) || []).length;
  });
  const best = (Object.keys(c) as (',' | ';' | '\t')[]).sort((a, b) => c[b] - c[a])[0];
  return c[best] > 0 ? best : 'ws';
}

export interface ParsedFile {
  cells: number[][];
  cols: number;
  delim: string;
  header: string[] | null;
  comments: number;
  blanks: number;
  bad: number;
}
export type ParseResult = ParsedFile | { error: string };

/**
 * Parses one text file. Blank lines and lines starting with #, % or // are skipped;
 * one non-numeric first row is taken as a header. With a non-comma delimiter a decimal
 * comma is accepted. Rows whose first two cells are not finite numbers are counted as
 * bad and dropped, never silently coerced.
 */
export function parseFile(text: string): ParseResult {
  const lines: string[] = [];
  let comments = 0, blanks = 0;
  for (const raw of String(text).split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) { blanks++; continue; }
    if (t[0] === '#' || t[0] === '%' || t.slice(0, 2) === '//') { comments++; continue; }
    lines.push(t);
  }
  if (lines.length < 3) return { error: 'fewer than three data lines once blanks and comment lines are removed' };
  const delim = sniffDelim(lines.slice(0, 20));
  const tok = (l: string) => (delim === 'ws' ? l.split(/\s+/) : l.split(delim)).map(s => s.trim()).filter(s => s !== '');
  const num = (s: string) => (s === '' || s == null) ? NaN : parseFloat(delim === ',' ? s : String(s).replace(',', '.'));
  let header: string[] | null = null, start = 0;
  const first = tok(lines[0]);
  if (first.some(s => !Number.isFinite(num(s)))) { header = first; start = 1; }
  const cells: number[][] = [];
  let bad = 0, cols = 0;
  for (let i = start; i < lines.length; i++) {
    const row = tok(lines[i]).map(num);
    if (row.length < 2 || !Number.isFinite(row[0]) || !Number.isFinite(row[1])) { bad++; continue; }
    cells.push(row);
    cols = Math.max(cols, row.length);
  }
  if (cells.length < 3) return { error: 'no numeric rows found — check the delimiter and the decimal separator' };
  return { cells, cols, delim: delim === 'ws' ? 'whitespace' : delim === '\t' ? 'tab' : delim, header, comments, blanks, bad };
}
