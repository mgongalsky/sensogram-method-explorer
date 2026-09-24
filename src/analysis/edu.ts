// Noise-free illustration spectra for the Home and Methods pages. Computed once from the
// same transfer-matrix model the generator uses; the binding shift is exaggerated so
// each processing step is visible at page scale.

import { NK, NPAD } from './constants';
import { fftMag, fftPeak, filt, kGrid, maxMagnitude, phaseDiff, phaseWindow, toK, wavelet } from './kdomain';
import { hannWindow, mean } from './numeric';
import { modelSpectrum, pickLc } from './synthetic';

export interface EduData {
  slLam: number[]; sl0: number[]; sl1: number[];
  mlLam: number[]; ml0: number[]; ml1: number[]; mlRes: number;
  lc: number; shiftPx: number; zLam: number[]; z0: number[]; z1: number[]; pA: number[]; pB: number[]; shX: number[]; ratio: number[];
  kx: number[]; k0: number[]; k1: number[]; eAx: number[]; e0: number[]; e1: number[]; eot0: number; eot1: number;
  izLam: number[]; iz0s: number[]; iz1s: number[];
  dShift: number[]; dAmp: number[]; mShift: number; mAmp: number;
  filtRe: number[]; phX: number[]; phY: number[]; dphi: number;
}

let cache: EduData | null = null;

const grid = (a: number, b: number, st: number): number[] => {
  const o: number[] = [];
  for (let i = 0; a + i * st <= b + 1e-9; i++) o.push(+(a + i * st).toFixed(3));
  return o;
};

export function eduData(): EduData {
  if (cache) return cache;
  const EPS = 0.004;
  const slLam = grid(500, 800, 0.5), mlLam = grid(900, 1700, 1.5);
  const sl0 = modelSpectrum('single', slLam, 0), sl1 = modelSpectrum('single', slLam, EPS);
  const ml0 = modelSpectrum('cavity', mlLam, 0), ml1 = modelSpectrum('cavity', mlLam, EPS);
  const mlRes = mlLam[pickLc(mlLam, ml0, false)];

  // ESW: the single-layer minimum nearest 611 nm, read on a 1 nm pixel grid
  let mi = -1;
  for (let i = 1; i < slLam.length - 1; i++) {
    if (!(sl0[i] <= sl0[i - 1] && sl0[i] <= sl0[i + 1])) continue;
    if (mi < 0 || Math.abs(slLam[i] - 611) < Math.abs(slLam[mi] - 611)) mi = i;
  }
  const lc = Math.round(slLam[mi]), shiftPx = 0.4, epsZ = shiftPx / lc;
  const zLam = grid(lc - 10, lc + 11, 0.1);
  const z0 = modelSpectrum('single', zLam, 0), z1 = modelSpectrum('single', zLam, epsZ);
  const pA = modelSpectrum('single', [lc, lc + 1], 0), pB = modelSpectrum('single', [lc, lc + 1], epsZ);
  const shX = grid(0, 2, 0.05), ratio = shX.map(s => { const a = modelSpectrum('single', [lc, lc + 1], s / lc); return a[0] / a[1]; });

  // k domain, shared by EOT and MWP
  const { kg, lamQ, dk } = kGrid(500, 800);
  const k0 = toK(slLam, sl0, lamQ), k1 = toK(slLam, sl1, lamQ);
  const hann = hannWindow(NK);
  const m0 = fftMag(k0, hann), m1 = fftMag(k1, hann);
  const p0 = fftPeak(k0, hann, dk, 2000, 30000), p1 = fftPeak(k1, hann, dk, 2000, 30000);
  const eAx: number[] = [], e0: number[] = [], e1: number[] = [];
  for (let i = 1; i < NPAD / 2; i++) {
    const e = i / (NPAD * dk);
    if (e > p0.eot - 2500 && e < p0.eot + 2500) { eAx.push(e / 1000); e0.push(m0[i]); e1.push(m1[i]); }
  }

  // IAW: a real shift against a pure 2 % brightness change
  const dShift = sl1.map((v, i) => Math.abs(v - sl0[i])), dAmp = sl0.map(v => Math.abs(v * 0.02));

  // MWP
  const { Wre, Wim } = wavelet(p0.eot, 2 / (4 * p0.eot), dk);
  const yr = filt(k0, Wre, Wim);
  const { lo, hi } = phaseWindow();
  const mmax = maxMagnitude(yr, lo, hi);
  const ph = phaseDiff(k1, Wre, Wim, yr, lo, hi, mmax, true);
  const kMax = Math.max(...k0.map(Math.abs)), fMax = Math.max(...Array.from(yr.re).slice(lo, hi).map(Math.abs)) || 1;
  const filtRe = Array.from(yr.re).map((v, i) => i >= lo && i < hi ? v * kMax / fMax : NaN);
  const phX: number[] = [], phY: number[] = [];
  const dphiK = ph.dphiK as number[];
  for (let i = lo; i < hi; i++) { phX.push(kg[i] * 1e4); phY.push(Number.isFinite(dphiK[i]) ? dphiK[i] * 1000 : NaN); }

  const iz0 = slLam.findIndex(l => l >= 585), iz1 = slLam.findIndex(l => l >= 665);
  cache = {
    slLam, sl0, sl1, mlLam, ml0, ml1, mlRes,
    lc, shiftPx, zLam, z0, z1, pA, pB, shX, ratio,
    kx: kg.map(k => k * 1e4), k0, k1, eAx, e0, e1, eot0: p0.eot, eot1: p1.eot,
    izLam: slLam.slice(iz0, iz1), iz0s: sl0.slice(iz0, iz1), iz1s: sl1.slice(iz0, iz1),
    dShift, dAmp, mShift: mean(dShift), mAmp: mean(dAmp),
    filtRe, phX, phY, dphi: ph.dphi * 1000
  };
  return cache;
}
