import { describe, expect, it } from 'vitest';
import { natCmp, parseFile } from './parseSpectra';
import { commonGrid, ingest } from './validateSpectra';

const twoCol = (lam: number[], f: (l: number) => number, delim = '\t') => lam.map(l => l + delim + f(l).toFixed(6)).join('\n');
const range = (a: number, b: number, st: number) => { const o: number[] = []; for (let x = a; x <= b + 1e-9; x += st) o.push(+x.toFixed(6)); return o; };
const R = (l: number) => 0.4 + 0.1 * Math.cos(2 * Math.PI * 15000 / l);

describe('natural file order', () => {
  it('puts spectrum2 before spectrum10', () => {
    const names = ['spectrum10.txt', 'spectrum2.txt', 'spectrum1.txt', 'Spectrum-03.txt'];
    expect(names.slice(0, 3).sort(natCmp)).toEqual(['spectrum1.txt', 'spectrum2.txt', 'spectrum10.txt']);
  });
});

describe('parser', () => {
  it('skips comments, blanks and one header row, and detects the delimiter', () => {
    const text = '# instrument X\n% more\n// and more\n\nwavelength;reflectance\n1000;0,431\n1001;0,447\n1002;0,452\n';
    const f = parseFile(text);
    expect('error' in f).toBe(false);
    if ('error' in f) return;
    expect(f.delim).toBe(';');
    expect(f.header).toEqual(['wavelength', 'reflectance']);
    expect(f.comments).toBe(3);
    expect(f.cells).toEqual([[1000, 0.431], [1001, 0.447], [1002, 0.452]]);
  });

  it('reads repeated-whitespace files', () => {
    const f = parseFile('1000   0.1\n1001  0.2\n1002    0.3\n');
    expect('error' in f ? f.error : f.delim).toBe('whitespace');
  });

  it('rejects files with no numeric rows', () => {
    expect('error' in parseFile('a b\nc d\ne f\ng h')).toBe(true);
  });
});

describe('validation and gridding', () => {
  it('restricts differing grids to their overlap and interpolates onto it', () => {
    const g = commonGrid([range(990, 1410, 1), range(1000, 1400, 0.5)]);
    expect(g.lo).toBe(1000);
    expect(g.hi).toBe(1400);
    expect(g.step).toBe(1);
    expect(g.grid[0]).toBe(1000);
    expect(g.grid[g.grid.length - 1]).toBe(1400);
  });

  it('accepts two-column files in natural order and reports the interpolation', () => {
    const files = [3, 1, 10, 2].map(i => ({ name: 'spectrum' + i + '.txt', text: twoCol(i % 2 ? range(990, 1410, 1) : range(1000, 1400, 0.5), R) }));
    const out = ingest(files, [], 'single', 's');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataset.names).toEqual(['spectrum1.txt', 'spectrum2.txt', 'spectrum3.txt', 'spectrum10.txt']);
    expect(out.dataset.lo).toBe(1000);
    expect(out.dataset.hi).toBe(1400);
    expect(out.report.some(n => n.level === 'warn' && /interpolated onto the common overlap/.test(n.text))).toBe(true);
    // interpolated values stay on the measured curve
    const i = out.dataset.lam.indexOf(1200);
    expect(out.dataset.spec[0][i]).toBeCloseTo(R(1200), 5);
  });

  it('reads a matrix file with numeric header times', () => {
    const lam = range(1000, 1400, 1);
    const text = 'wl\t0\t0.5\t1\n' + lam.map(l => [l, R(l), R(l) + 0.001, R(l) + 0.002].join('\t')).join('\n');
    const out = ingest([{ name: 'm.tsv', text }], [], 'cavity', 's');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.dataset.shape).toBe('matrix');
    expect(out.dataset.importedTimes).toEqual([0, 0.5, 1]);
  });

  it('refuses a single spectrum', () => {
    const out = ingest([{ name: 'a.txt', text: twoCol(range(1000, 1400, 1), R) }], [], 'single', 's');
    expect(out.ok).toBe(false);
    expect(out.report.some(n => n.level === 'error')).toBe(true);
  });

  it('refuses spectra with no overlapping range', () => {
    const out = ingest([
      { name: 'a.txt', text: twoCol(range(500, 700, 1), R) },
      { name: 'b.txt', text: twoCol(range(900, 1100, 1), R) }
    ], [], 'single', 's');
    expect(out.ok).toBe(false);
  });

  it('sorts unsorted wavelengths and averages duplicates, with a report entry for each', () => {
    const lam = range(1000, 1400, 1);
    const shuffled = lam.slice().reverse();
    const withDup = twoCol(shuffled, R) + '\n1200\t' + R(1200).toFixed(6);
    const out = ingest([{ name: 'a.txt', text: withDup }, { name: 'b.txt', text: twoCol(lam, R) }], [], 'single', 's');
    expect(out.ok).toBe(true);
    expect(out.report.some(n => /not monotonically increasing/.test(n.text))).toBe(true);
    expect(out.report.some(n => /duplicated wavelength/.test(n.text))).toBe(true);
  });
});
