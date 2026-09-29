// Per-spectrum sensogram values for the two direct-read methods, ESW and IAW, and the
// automatic choice of the ESW wavelength.

import { savGol } from './numeric';

/**
 * Effective shift in wavelength: the ratio of the reflectance at the ESW wavelength
 * (index ic) to the reflectance at the denominator wavelength (index i2 — by default
 * the next measured sample). A near-zero denominator returns NaN and is flagged by the
 * caller, never Infinity.
 */
export function eswValue(row: readonly number[], ic: number, i2: number): number {
  const dn = row[i2];
  return Math.abs(dn) < 1e-6 ? NaN : row[ic] / dn;
}

/**
 * Interferogram average over wavelength. The difference D = Rref − R is zeroed by its
 * mean, and |D′| is integrated with the trapezoidal rule and divided by the wavelength
 * span, so the result does not depend on the sampling density. It is zero for the
 * reference itself and for any pure additive offset.
 */
export function iawValue(ref: readonly number[], row: readonly number[], lam: readonly number[]): number {
  const n = row.length, span = lam[n - 1] - lam[0];
  let sm = 0;
  for (let i = 0; i < n; i++) sm += ref[i] - row[i];
  sm /= n;
  let acc = 0;
  for (let i = 1; i < n; i++) acc += 0.5 * (Math.abs(ref[i] - row[i] - sm) + Math.abs(ref[i - 1] - row[i - 1] - sm)) * (lam[i] - lam[i - 1]);
  return acc / span;
}

/**
 * Index of the ESW wavelength inside [lo, hi] nm: the local reflectance minimum reached
 * by walking downhill from the sample nearest the centre of the range. The walk runs on
 * a lightly smoothed copy (Savitzky–Golay, ~8 nm, quadratic) so detector noise does not
 * stop it on a spurious dip; smoothing of that width leaves the minimum in place. If the
 * walk reaches an edge of the range, that edge is returned.
 */
export function eswAutoLc(lam: readonly number[], ref: readonly number[], lo: number, hi: number): number {
  const n = lam.length;
  if (n < 3) return 0;
  const dl = (lam[n - 1] - lam[0]) / (n - 1) || 1;
  const clampI = (x: number) => Math.max(0, Math.min(n - 1, Math.round((x - lam[0]) / dl)));
  const a = clampI(Math.min(lo, hi)), b = clampI(Math.max(lo, hi));
  if (b - a < 2) return a;
  let win = Math.max(5, Math.round(8 / dl) | 1);
  if (win > b - a + 1) win = (b - a + 1) % 2 ? b - a + 1 : b - a;
  const y = win >= 5 ? savGol(ref.slice(a, b + 1), win, 2) : ref.slice(a, b + 1);
  let i = Math.round((b - a) / 2);
  for (;;) {
    const l = i > 0 ? y[i - 1] : Infinity, r = i < y.length - 1 ? y[i + 1] : Infinity;
    if (!(l < y[i] || r < y[i])) break;
    i += l < r ? -1 : 1;
  }
  return a + i;
}
