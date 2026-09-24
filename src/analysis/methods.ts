// Per-spectrum sensogram values for the two direct-read methods, ESW and IAW.

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
