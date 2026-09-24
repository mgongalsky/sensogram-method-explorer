// Turns parsed files into one validated dataset on a common wavelength grid, with a
// human-readable validation report. Malformed input is reported, never silently accepted.

import type { Params } from '../analysis/constants';
import { estimateEOT } from '../analysis/kdomain';
import { interp } from '../analysis/numeric';
import { pickLc } from '../analysis/synthetic';
import type { Dataset, DtUnit, Note } from '../analysis/types';
import { natCmp, parseFile, type ParsedFile } from './parseSpectra';

export interface RawFile { name: string; text: string }
export interface FileRow { name: string; meta: string }

export type IngestResult =
  | { ok: false; report: Note[] }
  | { ok: true; report: Note[]; dataset: Dataset; files: FileRow[] };

interface Regime { id: string; min: number; max: number; prefLc: number | null; label: string; needsAbove: number }

/**
 * Parses, validates and grids a set of files.
 * - one file with more than two columns is read as a matrix (wavelength + spectra);
 *   a numeric header row becomes the time axis
 * - otherwise every file is a two-column spectrum, ordered by natural filename sort
 * - spectra are sorted by wavelength, duplicate wavelengths averaged, non-finite values
 *   dropped, and everything is interpolated onto the common overlap — never extrapolated
 */
export function ingest(raw: readonly RawFile[], pre: readonly Note[], filmKind: 'single' | 'cavity', dtUnit: DtUnit): IngestResult {
  const report: Note[] = pre.slice();
  const parsed = raw.map(f => ({ name: f.name, res: parseFile(f.text) }));
  parsed.forEach(f => { if ('error' in f.res) report.push({ level: 'error', text: f.name + ' — ' + f.res.error }); });
  const good = parsed.filter((f): f is { name: string; res: ParsedFile } => !('error' in f.res)).map(f => ({ name: f.name, ...f.res }));
  const fail = (extra?: Note): IngestResult => { if (extra) report.push(extra); return { ok: false, report }; };
  if (!good.length) return fail();

  const sets: { name: string; wl: number[]; r: number[] }[] = [];
  let importedTimes: number[] | null = null, shape: Dataset['shape'] = 'files';
  if (good.length === 1 && good[0].cols > 2) {
    const f = good[0]; shape = 'matrix';
    const wl = f.cells.map(rw => rw[0]), m = f.cols - 1;
    for (let c = 1; c <= m; c++) sets.push({ name: (f.header && f.header[c]) || ('column ' + (c + 1)), wl, r: f.cells.map(rw => rw[c]) });
    if (f.header) {
      const t = f.header.slice(1, m + 1).map(x => parseFloat(x));
      if (t.length === m && t.every(Number.isFinite)) importedTimes = t;
    }
    report.push({ level: 'ok', text: 'Matrix file read: ' + m + ' spectra × ' + wl.length + ' wavelength rows, ' + f.delim + '-delimited' + (importedTimes ? '. The numeric header row was taken as time values.' : (f.header ? '. The header row was taken as spectrum names.' : '.')) });
  } else {
    const sorted = good.slice().sort((a, b) => natCmp(a.name, b.name));
    sorted.forEach(f => {
      if (f.cols > 2) report.push({ level: 'warn', text: f.name + ' — ' + f.cols + ' columns present; columns 1 and 2 were used as wavelength and reflectance.' });
      sets.push({ name: f.name, wl: f.cells.map(rw => rw[0]), r: f.cells.map(rw => rw[1]) });
    });
    report.push({ level: 'ok', text: sets.length + ' file' + (sets.length === 1 ? '' : 's') + ' read as two columns, ordered by natural filename sort: ' + sorted.slice(0, 3).map(f => f.name).join(', ') + (sorted.length > 3 ? ' … ' + sorted[sorted.length - 1].name : '') + '. Delimiter detected: ' + good[0].delim + '.' });
    const hdr = good.filter(f => f.header).length;
    if (hdr) report.push({ level: 'ok', text: hdr + ' file' + (hdr === 1 ? '' : 's') + ' carried a header row, which was skipped.' });
    const cm = good.reduce((s, f) => s + (f.comments || 0), 0);
    if (cm) report.push({ level: 'ok', text: cm + ' comment line' + (cm === 1 ? '' : 's') + ' ignored (#, % or //).' });
  }
  const badRows = good.reduce((s, f) => s + (f.bad || 0), 0);
  if (badRows) report.push({ level: 'warn', text: badRows + ' row' + (badRows === 1 ? '' : 's') + ' skipped as non-numeric or incomplete.' });

  let nonFinite = 0, dups = 0, unsorted = 0;
  const clean = sets.map(s => {
    const pts: [number, number][] = [];
    for (let i = 0; i < s.wl.length; i++) {
      const w = s.wl[i], y = s.r[i];
      if (!Number.isFinite(w) || !Number.isFinite(y)) { nonFinite++; continue; }
      pts.push([w, y]);
    }
    for (let i = 1; i < pts.length; i++) if (pts[i][0] < pts[i - 1][0]) { unsorted++; break; }
    pts.sort((a, b) => a[0] - b[0]);
    const out: [number, number][] = [];
    for (const pt of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(pt[0] - last[0]) < 1e-9) { dups++; last[1] = (last[1] + pt[1]) / 2; continue; }
      out.push([pt[0], pt[1]]);
    }
    return { name: s.name, wl: out.map(q => q[0]), r: out.map(q => q[1]) };
  }).filter(s => s.wl.length > 8);
  if (nonFinite) report.push({ level: 'warn', text: nonFinite + ' non-finite value' + (nonFinite === 1 ? '' : 's') + ' dropped.' });
  if (unsorted) report.push({ level: 'warn', text: unsorted + ' spectra were not monotonically increasing in wavelength and have been sorted.' });
  if (dups) report.push({ level: 'warn', text: dups + ' duplicated wavelength value' + (dups === 1 ? '' : 's') + ' averaged.' });
  if (clean.length < 2) return fail({ level: 'error', text: 'Reference-based analysis needs at least two spectra; ' + clean.length + ' usable spectrum was found.' });

  const { grid, lo, hi, step, nPts, error } = commonGrid(clean.map(s => s.wl));
  if (error) return fail({ level: 'error', text: error });
  const spec = clean.map(s => interp(s.wl, s.r, grid));
  const differing = clean.some(s => Math.abs(s.wl[0] - lo) > 1e-6 || Math.abs(s.wl[s.wl.length - 1] - hi) > 1e-6 || s.wl.length !== nPts);
  report.push({
    level: differing ? 'warn' : 'ok', text: differing
      ? 'Wavelength grids differed, so every spectrum was linearly interpolated onto the common overlap ' + lo.toFixed(2) + '–' + hi.toFixed(2) + ' nm at ' + step.toFixed(3) + ' nm (' + nPts + ' samples). Nothing was extrapolated beyond the measured range.'
      : 'All spectra share one grid: ' + lo.toFixed(2) + '–' + hi.toFixed(2) + ' nm at ' + step.toFixed(3) + ' nm (' + nPts + ' samples).'
  });
  if (clean.length < 21) report.push({ level: 'warn', text: 'Only ' + clean.length + ' time points, so the default 21-point Savitzky–Golay window cannot be used; shorten it or leave smoothing off.' });

  const ref = spec[0];
  // Two measurement regimes get their own defaults. A multilayer run reaching past
  // ~1300 nm is analysed over 1000–1400 nm with the feature and ESW wavelength at
  // 1164 nm; if that sample is unavailable the sample's own resonance minimum is used.
  // Anything in the visible falls back to the 500–800 nm window with the 611 nm feature.
  const singleFilm = filmKind === 'single';
  const REGIMES: Regime[] = singleFilm ? [
    { id: 'sl', min: 1000, max: 1400, prefLc: null, label: 'single layer, 1000–1400 nm', needsAbove: 1300 },
    { id: 'vis', min: 500, max: 800, prefLc: null, label: 'single layer, visible 500–800 nm', needsAbove: 0 }
  ] : [
    { id: 'mc', min: 1000, max: 1400, prefLc: 1164, label: 'multilayer, 1000–1400 nm', needsAbove: 1300 },
    { id: 'vis', min: 500, max: 800, prefLc: 611, label: 'visible, 500–800 nm', needsAbove: 0 }
  ];
  let regime: Regime | null = null, anaMin = lo, anaMax = hi;
  for (const rg of REGIMES) {
    if (hi < rg.needsAbove) continue;
    const a = Math.max(lo, Math.min(hi, rg.min)), b = Math.min(hi, Math.max(lo, rg.max));
    if (b - a > 12 * step) { regime = rg; anaMin = a; anaMax = b; break; }
  }
  let mi = 0, md = Infinity;
  const prefLc = regime ? regime.prefLc : null;
  if (prefLc) for (let i = 0; i < nPts; i++) { const d = Math.abs(grid[i] - prefLc); if (d < md) { md = d; mi = i; } }
  const lcPref = !!prefLc && md <= 5 * step && grid[mi] >= anaMin && grid[mi] <= anaMax;
  if (!lcPref) {
    const iA = Math.max(1, Math.round((anaMin - lo) / step)), iB = Math.min(nPts - 2, Math.round((anaMax - lo) / step));
    mi = pickLc(grid, ref, singleFilm, iA, iB);
  }
  const lc = grid[mi];
  const est = estimateEOT(grid, ref);
  const cyc = est * (1 / lo - 1 / hi);
  report.push({
    level: 'ok', text: 'Defaults: analysis window ' + anaMin.toFixed(1) + '–' + anaMax.toFixed(1) + ' nm' +
      (regime ? ' (' + regime.label + ')' : ' (neither the 1000–1400 nm multilayer window nor the 500–800 nm visible window fits this dataset, so the full range is used)') +
      '; feature and ESW wavelength ' + lc.toFixed(2) + ' nm' +
      (lcPref ? ' (nearest sample to ' + prefLc + ' nm).' : singleFilm ? ' (the fringe minimum nearest the middle of the window).' : ' (the sharpest reflectance notch in the window — this sample’s resonance).')
  });
  report.push(cyc < 3
    ? { level: 'warn', text: 'Only about ' + cyc.toFixed(1) + ' fringe periods are visible at the estimated optical thickness of ' + (est / 1000).toFixed(2) + ' µm. FFT and wavelet phase need roughly three or more.' }
    : { level: 'ok', text: 'Estimated effective optical thickness ' + (est / 1000).toFixed(3) + ' µm — about ' + cyc.toFixed(1) + ' fringe periods in range.' });
  if (est < 2000 || est > 20000) report.push({ level: 'warn', text: 'The estimated optical thickness of ' + (est / 1000).toFixed(2) + ' µm falls outside the default 2–20 µm EOT search bracket. Widen it under Advanced parameters or RIFTS will lock onto the wrong peak.' });
  if (report.some(w => w.level === 'error')) return fail();

  const dtMin0 = dtUnit === 's' ? 15 / 60 : 15;
  const n = spec.length, tt = importedTimes || spec.map((_, j) => j * dtMin0);
  const derived: Partial<Params> = {
    refIdx: 0, anaMin, anaMax, lc, eswLc: lc, eswLam2: Math.min(anaMax, lc + step), dtU: 15,
    eotMin: 2000, eotMax: 20000,
    baseA: tt[0], baseB: tt[Math.max(1, Math.round((n - 1) * 0.2))],
    respA: tt[Math.round((n - 1) * 0.6)], respB: tt[n - 1]
  };
  return {
    ok: true, report,
    dataset: { lam: grid, spec, names: clean.map(q => q.name), importedTimes, shape, step, lo, hi, est, derived },
    files: clean.map(q => ({ name: q.name, meta: q.wl.length + ' pts · ' + q.wl[0].toFixed(1) + '–' + q.wl[q.wl.length - 1].toFixed(1) + ' nm' }))
  };
}

/**
 * The common overlapping grid of several increasing wavelength vectors, at the coarsest
 * median sampling step among them (capped at 4000 samples).
 */
export function commonGrid(wls: readonly (readonly number[])[]): { grid: number[]; lo: number; hi: number; step: number; nPts: number; error?: string } {
  const lo = Math.max(...wls.map(w => w[0])), hi = Math.min(...wls.map(w => w[w.length - 1]));
  if (!(hi - lo > 0)) return { grid: [], lo, hi, step: 0, nPts: 0, error: 'The spectra share no overlapping wavelength range, so no common grid can be built.' };
  const steps = wls.map(w => { const d: number[] = []; for (let i = 1; i < w.length; i++) d.push(w[i] - w[i - 1]); d.sort((a, b) => a - b); return d[Math.floor(d.length / 2)] || 1; });
  let step = Math.max(...steps), nPts = Math.floor((hi - lo) / step) + 1;
  if (nPts > 4000) { step = (hi - lo) / 3999; nPts = 4000; }
  if (nPts < 32) return { grid: [], lo, hi, step, nPts, error: 'Only ' + nPts + ' wavelength samples fall inside the common range — too few for FFT or wavelet analysis.' };
  const grid: number[] = [];
  for (let i = 0; i < nPts; i++) grid.push(lo + i * step);
  return { grid, lo, hi, step, nPts };
}
