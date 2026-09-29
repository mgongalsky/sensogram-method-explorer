// Analytic floating-point operation counts per spectrum, for the kernels exactly as
// they are implemented here (not for the cheapest possible implementation). Additions,
// subtractions, multiplications, divisions and each elementary function (abs, sqrt,
// hypot, exp, log, pow, sin, cos, atan2) count as one FLOP; comparisons, integer index
// arithmetic, array copies and branching count as zero.

import { NK, NPAD } from './constants';

/** FLOPs of one in-place radix-2 FFT of length n (butterfly 10, twiddle recurrence 6, plus 2n for the 1/n scaling of the inverse). */
export function fftFlops(n: number, inv = false): number {
  return 16 * (n / 2) * Math.log2(n) + (inv ? 2 * n : 0);
}

/** ESW: one ratio of two samples (the |denominator| guard is one abs). */
export const eswFlops = (): number => 2;

/** IAW over nS samples: mean of the difference, then trapezoidal |D′| integral. */
export const iawFlops = (nS: number): number => 2 * nS + 1 + 11 * (nS - 1) + 2;

/** Linear interpolation onto the NK-point k grid, then a least-squares linear detrend. */
export const kresFlops = (): number => 6 * NK + (6 * NK + 10) + 3 * NK;

/** Hann window, zero-padded NPAD-point FFT, magnitudes, peak search, out-of-band mean, parabolic refinement. */
export const riftsPeakFlops = (): number => NK + fftFlops(NPAD) + 2 * (NPAD / 2) + 2 * (NPAD / 2) + 3 * (NPAD / 2) + 30;

/** One wavelet filtering: forward FFT, complex spectral product, inverse FFT. */
const filtFlops = (): number => fftFlops(NK) + 6 * NK + fftFlops(NK, true);

/** Per-spectrum Morlet phase: filtering plus the weighted phase difference over the phaseWindow() span, and the 2π branch choice. */
export const mwpOwnFlops = (span: number): number => filtFlops() + 19 * span + 12;

/** One-off per run: wavelet kernel (NK samples of exp, sin, cos), its FFT, filtering the reference, and |ref| maximum. */
export const wavSetupFlops = (span: number): number => 12 * NK + fftFlops(NK) + filtFlops() + 2 * span;

/**
 * Savitzky–Golay over a series of nT points, as implemented: at every point a fresh
 * win-point least-squares normal-equation build and an (order+1)² Gaussian solve.
 * Returned per point of the series, i.e. per spectrum.
 */
export function sgFlopsPerPoint(win: number, poly: number): number {
  const m = poly + 1;
  const build = win * (2 * m + m * m + 2 * m);
  let elim = 0;
  for (let c = 0; c < m; c++) elim += (m - c - 1) * (1 + 2 * (m - c) + 2);
  const back = m * m + m;
  return build + elim + back;
}
