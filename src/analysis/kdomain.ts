// Reciprocal-wavelength kernels shared by RIFTS (FFT peak → EOT) and Morlet
// wavelet phase (MWP). Conventions: k = 1/λ (not 2π/λ), λ in nm, EOT in nm,
// and the detrend is fitted against sample index.

import { NK, NPAD } from './constants';
import { detrend, fft, hannWindow, interp } from './numeric';

export interface KGrid {
  kmin: number; kmax: number; dk: number;
  /** increasing k grid, NK samples */
  kg: number[];
  /** the wavelengths of the k grid (decreasing) */
  lamQ: number[];
  kbar: number;
}

export function kGrid(lamFirst: number, lamLast: number): KGrid {
  const kmin = 1 / lamLast, kmax = 1 / lamFirst, dk = (kmax - kmin) / (NK - 1);
  const kg: number[] = [], lamQ: number[] = [];
  for (let i = 0; i < NK; i++) { const k = kmin + i * dk; kg.push(k); lamQ.push(1 / k); }
  return { kmin, kmax, dk, kg, lamQ, kbar: (kmin + kmax) / 2 };
}

/** Resamples one spectrum onto the uniform k grid and removes its linear trend. */
export function toK(lam: readonly number[], row: readonly number[], lamQ: readonly number[]): number[] {
  return detrend(interp(lam, row, lamQ));
}

/** FFT magnitude of a Hann-windowed, zero-padded k-domain signal (first NPAD/2 bins). */
export function fftMag(y: readonly number[], hann: Float64Array): Float64Array {
  const re = new Float64Array(NPAD), im = new Float64Array(NPAD);
  for (let i = 0; i < NK; i++) re[i] = y[i] * hann[i];
  fft(re, im, false);
  const mag = new Float64Array(NPAD / 2);
  for (let i = 0; i < NPAD / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

export interface FftPeak {
  /** refined dominant EOT, nm */
  eot: number;
  /** peak magnitude */
  amp: number;
  /** −3 dB full width, nm of EOT */
  width: number;
  /** peak over the mean out-of-band magnitude */
  snr: number;
}

/**
 * Dominant FFT peak inside [emin, emax] (nm of EOT), refined between bins by a
 * parabola through the log-magnitudes of the peak bin and its two neighbours.
 */
export function fftPeak(y: readonly number[], hann: Float64Array, dk: number, emin: number, emax: number): FftPeak {
  const mag = fftMag(y, hann), eotOf = (m: number) => m / (NPAD * dk);
  let bi = -1;
  for (let i = 1; i < NPAD / 2 - 1; i++) {
    const e = eotOf(i);
    if (e < emin || e > emax) continue;
    if (bi < 0 || mag[i] > mag[bi]) bi = i;
  }
  if (bi < 1) return { eot: NaN, amp: 0, width: NaN, snr: 0 };
  const l0 = Math.log(mag[bi - 1] + 1e-18), l1 = Math.log(mag[bi] + 1e-18), l2 = Math.log(mag[bi + 1] + 1e-18);
  const den = l0 - 2 * l1 + l2, d = den !== 0 ? 0.5 * (l0 - l2) / den : 0;
  const half = mag[bi] / Math.SQRT2;
  let lo = bi, hi = bi;
  while (lo > 1 && mag[lo] > half) lo--;
  while (hi < NPAD / 2 - 2 && mag[hi] > half) hi++;
  let noise = 0, cnt = 0;
  for (let i = 1; i < NPAD / 2; i++) { const e = eotOf(i); if (e > emax * 1.4 && e < emax * 3) { noise += mag[i]; cnt++; } }
  return { eot: eotOf(bi + d), amp: mag[bi], width: eotOf(hi) - eotOf(lo), snr: mag[bi] / ((noise / (cnt || 1)) || 1e-18) };
}

/** Rough optical thickness of one spectrum, from the dominant peak between 0.8 and 200 µm. */
export function estimateEOT(lam: readonly number[], row: readonly number[]): number {
  const { dk, lamQ } = kGrid(lam[0], lam[lam.length - 1]);
  const y = toK(lam, row, lamQ);
  const hann = hannWindow(NK);
  const re = new Float64Array(NPAD), im = new Float64Array(NPAD);
  for (let i = 0; i < NK; i++) re[i] = y[i] * hann[i];
  fft(re, im, false);
  let bi = -1, bm = 0;
  for (let i = 3; i < NPAD / 2; i++) {
    const e = i / (NPAD * dk);
    if (e < 800 || e > 200000) continue;
    const m = Math.hypot(re[i], im[i]);
    if (m > bm) { bm = m; bi = i; }
  }
  return bi > 0 ? bi / (NPAD * dk) : 15000;
}

// ---------- Morlet wavelet phase ----------

export interface Wavelet { Wre: Float64Array; Wim: Float64Array }
export interface Complex { re: Float64Array; im: Float64Array }

/**
 * Frequency response of a complex Morlet wavelet ψ(k) = exp(i2πf0k)·exp(−k²/2σk²),
 * centred at f0 (the reference EOT) with Gaussian width σk, laid out for circular
 * FFT convolution on the NK-point k grid.
 */
export function wavelet(f0: number, sk: number, dk: number): Wavelet {
  const Wre = new Float64Array(NK), Wim = new Float64Array(NK);
  for (let i = 0; i < NK; i++) {
    const nn = i < NK / 2 ? i : i - NK, k = nn * dk, env = Math.exp(-k * k / (2 * sk * sk));
    Wre[i] = Math.cos(2 * Math.PI * f0 * k) * env;
    Wim[i] = Math.sin(2 * Math.PI * f0 * k) * env;
  }
  fft(Wre, Wim, false);
  return { Wre, Wim };
}

/** FFT convolution of a real k-domain signal with the wavelet; returns the complex result. */
export function filt(y: readonly number[], Wre: Float64Array, Wim: Float64Array): Complex {
  const re = Float64Array.from(y), im = new Float64Array(NK);
  fft(re, im, false);
  for (let i = 0; i < NK; i++) {
    const a = re[i], b = im[i];
    re[i] = a * Wre[i] - b * Wim[i];
    im[i] = a * Wim[i] + b * Wre[i];
  }
  fft(re, im, true);
  return { re, im };
}

export interface PhaseDiff {
  /** amplitude-weighted mean phase difference, rad */
  dphi: number;
  /** k samples that passed the magnitude threshold */
  used: number;
  /** per-sample phase difference (rad), NaN where excluded; only when requested */
  dphiK: number[] | null;
}

/**
 * Phase of sample against reference across k-indices [lo, hi), skipping points where
 * the reference wavelet magnitude is under 20 % of its maximum `mmax`, averaged with
 * weight |ref|·|sample|.
 */
export function phaseDiff(
  y: readonly number[], Wre: Float64Array, Wim: Float64Array, yr: Complex,
  lo: number, hi: number, mmax: number, keepK: boolean
): PhaseDiff {
  const ys = filt(y, Wre, Wim);
  let sw = 0, sp = 0, used = 0;
  const dphiK = keepK ? new Array<number>(NK).fill(NaN) : null;
  for (let i = lo; i < hi; i++) {
    const mr = Math.hypot(yr.re[i], yr.im[i]), ms = Math.hypot(ys.re[i], ys.im[i]);
    if (mr < 0.2 * mmax) continue;
    const cr = ys.re[i] * yr.re[i] + ys.im[i] * yr.im[i], ci = ys.im[i] * yr.re[i] - ys.re[i] * yr.im[i];
    const dp = Math.atan2(ci, cr);
    if (dphiK) dphiK[i] = dp;
    const w = mr * ms;
    sw += w; sp += w * dp; used++;
  }
  return { dphi: sw > 0 ? sp / sw : NaN, used, dphiK };
}

/** Edge exclusion: the central 44 % of the k grid is used for phase comparison. */
export const phaseWindow = (): { lo: number; hi: number } => ({ lo: Math.floor(NK * 0.28), hi: Math.floor(NK * 0.72) });

export function maxMagnitude(c: Complex, lo: number, hi: number): number {
  let m = 0;
  for (let i = lo; i < hi; i++) m = Math.max(m, Math.hypot(c.re[i], c.im[i]));
  return m;
}
