// Interval-dependent statistics: baseline referencing, Savitzky–Golay copy of ESW,
// normalization, and the per-method noise / drift / response / RMSE figures.

import type { Params } from './constants';
import { mean, savGol } from './numeric';
import type { CoreResult, Note, Series, WindowStats } from './types';

export const finite = (a: readonly number[]): number[] => a.filter(Number.isFinite);

export function sd(a: readonly number[]): number {
  const q = finite(a), m = mean(q);
  return Math.sqrt(q.reduce((s, v) => s + (v - m) ** 2, 0) / (q.length || 1));
}

/** Median absolute deviation about the mean, scaled to match σ for normal data. */
export function mad(a: readonly number[]): number {
  const q = finite(a), m = mean(q);
  const dev = q.map(v => Math.abs(v - m)).sort((x, y) => x - y);
  return 1.4826 * (dev[Math.floor(dev.length / 2)] || 0);
}

/** Least-squares slope of a[idx] against times[idx]. */
export function slope(a: readonly number[], idx: readonly number[], times: readonly number[]): number {
  const xs = idx.map(j => times[j]), ys = idx.map(j => a[j]);
  const nn = xs.length;
  if (nn < 2) return 0;
  const sx = xs.reduce((s, v) => s + v, 0), sy = ys.reduce((s, v) => s + v, 0);
  const sxx = xs.reduce((s, v) => s + v * v, 0), sxy = xs.reduce((s, v, i) => s + v * ys[i], 0);
  return (nn * sxy - sx * sy) / (nn * sxx - sx * sx);
}

export function rmse(a: readonly number[], b: readonly number[]): number {
  let s = 0, c = 0;
  for (let j = 0; j < a.length; j++) if (Number.isFinite(a[j]) && Number.isFinite(b[j])) { s += (a[j] - b[j]) ** 2; c++; }
  return Math.sqrt(s / (c || 1));
}

/**
 * Window-only derivation: interval membership, the baseline-referenced ESW, its
 * Savitzky–Golay copy, and every per-series statistic. Cheap enough to run on every
 * frame of a band drag, so moving an interval never repeats the Fourier work.
 */
export function windowStats(r: CoreResult, p: Params, sgOn: boolean): WindowStats {
  const n = r.n, times = r.times, warn: Note[] = [];
  const bIdx: number[] = [], rIdx: number[] = [];
  for (let j = 0; j < n; j++) {
    if (times[j] >= p.baseA && times[j] <= p.baseB) bIdx.push(j);
    if (times[j] >= p.respA && times[j] <= p.respB) rIdx.push(j);
  }
  if (bIdx.length < 2) {
    bIdx.length = 0;
    for (let j = 0; j < Math.max(2, Math.round(n * 0.2)); j++) bIdx.push(j);
    warn.push({ level: 'check', text: 'The baseline interval held fewer than two points, so the first ' + bIdx.length + ' time points were used instead.' });
  }
  if (rIdx.length < 1) {
    rIdx.length = 0;
    for (let j = Math.max(0, n - Math.max(2, Math.round(n * 0.2))); j < n; j++) rIdx.push(j);
    warn.push({ level: 'check', text: 'The response interval held no points, so the last ' + rIdx.length + ' time points were used instead.' });
  }
  const eswBase = mean(finite(bIdx.map(j => r.esw[j])));
  const eswRel = r.esw.map(v => v - eswBase);
  const canSg = n >= p.sgWin && p.sgWin > p.sgPoly && p.sgWin % 2 === 1;
  const sgApplied = canSg && sgOn;
  const tSg0 = performance.now();
  // the filter always runs on a copy; the raw vector is kept and plotted
  const eswSm = sgApplied ? savGol(eswRel.map(v => Number.isFinite(v) ? v : 0), p.sgWin, p.sgPoly) : eswRel.slice();
  const sgMs = performance.now() - tSg0;
  if (sgOn && !canSg) warn.push({ level: 'check', text: 'Savitzky–Golay disabled: the window must be odd, larger than the polynomial order and no longer than the ' + n + ' available time points.' });

  const normOf = (a: readonly number[]) => {
    const bm = mean(finite(bIdx.map(j => a[j])));
    const rm = mean(finite(rIdx.map(j => a[j])));
    const amp = rm - bm;
    return a.map(v => (v - bm) / (Math.abs(amp) < 1e-15 ? 1 : amp));
  };

  const base: Omit<Series, 'norm' | 'sd' | 'mad' | 'slope' | 'response' | 'snr' | 'rmse' | 'rmseNorm'>[] = [
    { key: 'eswRaw', label: 'ESW, raw', unit: 'ratio', y: eswRel, color: 'eswRaw', truth: null },
    { key: 'eswSm', label: 'ESW, Savitzky–Golay', unit: 'ratio', y: eswSm, color: 'eswSm', truth: null, off: !sgApplied },
    { key: 'iaw', label: 'IAW', unit: 'reflectance', y: r.iaw, color: 'iaw', truth: null },
    { key: 'rifts', label: 'RIFTS ΔEOT', unit: 'nm (ΔEOT)', y: r.rifts, color: 'rifts', truth: r.truthE },
    { key: 'mwp', label: 'Morlet phase ΔEOT', unit: 'nm (ΔEOT)', y: r.mwp, color: 'mwp', truth: r.truthE }
  ];
  const truthNorm = r.hasTruth && r.truthE ? normOf(r.truthE) : null;
  const series: Series[] = base.map(s => {
    const norm = normOf(s.y);
    const sdv = sd(bIdx.map(j => s.y[j]));
    const response = mean(finite(rIdx.map(j => s.y[j]))) - mean(finite(bIdx.map(j => s.y[j])));
    return {
      ...s, norm, sd: sdv,
      mad: mad(bIdx.map(j => s.y[j])),
      slope: slope(s.y, bIdx, times),
      response,
      snr: sdv > 0 ? Math.abs(response) / sdv : Infinity,
      rmse: s.truth ? rmse(s.y, s.truth) : null,
      rmseNorm: truthNorm ? rmse(norm, truthNorm) : null
    };
  });
  return { bIdx, rIdx, eswBase, eswRel, eswSm, sgApplied, series, truthNorm, sgMs, windowWarn: warn };
}
