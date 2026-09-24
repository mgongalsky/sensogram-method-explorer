import { describe, expect, it } from 'vitest';
import { DEFAULTS, NK } from './constants';
import { fftPeak, filt, kGrid, maxMagnitude, phaseDiff, phaseWindow, toK, wavelet } from './kdomain';
import { eswValue, iawValue } from './methods';
import { savGol, hannWindow } from './numeric';
import { runAnalysis } from './pipeline';
import { modelSpectrum, pickLc, synth } from './synthetic';
import type { AnalysisInput } from './types';

const range = (a: number, b: number, st: number) => { const o: number[] = []; for (let x = a; x <= b + 1e-9; x += st) o.push(+x.toFixed(6)); return o; };
const NZ_ON = { nzShot: true, nzLamp: true, nzStretch: true };
const NZ_OFF = { nzShot: false, nzLamp: false, nzStretch: false };

/** A clean single-layer fringe pattern R(λ) = 0.4 + 0.1 cos(2π·EOT/λ). */
const fringes = (lam: number[], eot: number) => lam.map(l => 0.4 + 0.1 * Math.cos(2 * Math.PI * eot / l));

describe('ESW', () => {
  it('is constant for constant spectra', () => {
    const rows = [0, 1, 2, 3].map(() => new Array(50).fill(0.42));
    const vals = rows.map(r => eswValue(r, 20, 21));
    expect(new Set(vals).size).toBe(1);
    expect(vals[0]).toBeCloseTo(1, 12);
  });

  it('reports the wavelengths it actually used', async () => {
    const r = await runAnalysis(input({ p: { ...DEFAULTS, nSpec: 30, eswLc: 1200.4 } }));
    expect(r).not.toBeNull();
    // 1 nm synthetic grid: nearest sample to 1200.4 is 1200, the next sample is 1201
    expect(r!.lamUsed).toEqual([1200, 1201]);
  });

  it('flags a zero denominator instead of returning Infinity', () => {
    const row = [0.3, 0.5, 0, 0.4];
    const v = eswValue(row, 1, 2);
    expect(Number.isNaN(v)).toBe(true);
    expect(v).not.toBe(Infinity);
  });
});

describe('Savitzky–Golay', () => {
  it('preserves a low-order polynomial away from the boundaries', () => {
    const y = range(0, 60, 1).map(x => 0.5 + 0.1 * x - 0.02 * x * x + 0.0003 * x ** 3);
    const s = savGol(y, 21, 3);
    for (let i = 10; i < y.length - 10; i++) expect(s[i]).toBeCloseTo(y[i], 8);
  });

  it('never modifies its input', () => {
    const y = [1, 5, 2, 8, 3, 9, 4, 7, 5, 6, 1];
    const copy = y.slice();
    savGol(y, 5, 2);
    expect(y).toEqual(copy);
  });
});

describe('IAW', () => {
  const lam = range(1000, 1400, 1);
  const ref = fringes(lam, 15000);
  it('is zero for the reference spectrum', () => {
    expect(iawValue(ref, ref, lam)).toBe(0);
  });
  it('is positive for a shifted spectrum', () => {
    expect(iawValue(ref, fringes(lam, 15010), lam)).toBeGreaterThan(1e-4);
  });
  it('removes a pure additive offset', () => {
    expect(iawValue(ref, ref.map(v => v + 0.05), lam)).toBeLessThan(1e-12);
  });
  it('does not depend on the sampling density', () => {
    const lam2 = range(1000, 1400, 0.25);
    const a = iawValue(ref, fringes(lam, 15010), lam);
    const b = iawValue(fringes(lam2, 15000), fringes(lam2, 15010), lam2);
    expect(Math.abs(a - b) / a).toBeLessThan(0.02);
  });
});

describe('RIFTS', () => {
  it('recovers a synthetic EOT within tolerance', () => {
    const lam = range(1000, 1400, 1);
    const { lamQ, dk } = kGrid(lam[0], lam[lam.length - 1]);
    for (const eot of [12000, 15000, 18500]) {
      const pk = fftPeak(toK(lam, fringes(lam, eot), lamQ), hannWindow(NK), dk, 2000, 30000);
      expect(Math.abs(pk.eot - eot)).toBeLessThan(0.02 * eot);
    }
  });
});

describe('Morlet wavelet phase', () => {
  const lam = range(1000, 1400, 1);
  const { lamQ, dk, kbar } = kGrid(lam[0], lam[lam.length - 1]);
  const hann = hannWindow(NK);
  const k0 = toK(lam, fringes(lam, 15000), lamQ);
  const eotRef = fftPeak(k0, hann, dk, 2000, 30000).eot;
  const { Wre, Wim } = wavelet(eotRef, 2 / (4 * eotRef), dk);
  const yr = filt(k0, Wre, Wim);
  const { lo, hi } = phaseWindow();
  const mmax = maxMagnitude(yr, lo, hi);
  const dEOT = (eot: number) => phaseDiff(toK(lam, fringes(lam, eot), lamQ), Wre, Wim, yr, lo, hi, mmax, false).dphi / (2 * Math.PI * kbar);

  it('returns ~0 for the reference spectrum', () => {
    expect(Math.abs(dEOT(15000))).toBeLessThan(1e-9);
  });
  it('recovers the sign and magnitude of a known shift', () => {
    for (const shift of [-3, 1.5, 4]) {
      const got = dEOT(15000 + shift);
      expect(Math.sign(got)).toBe(Math.sign(shift));
      expect(Math.abs(got - shift)).toBeLessThan(0.1 * Math.abs(shift));
    }
  });
});

describe('synthetic experiment', () => {
  it('is identical for the same seed and differs for another', () => {
    const p = { ...DEFAULTS, nSpec: 12 };
    const a = synth(p, 'cavity', NZ_ON), b = synth(p, 'cavity', NZ_ON), c = synth({ ...p, seed: 7 }, 'cavity', NZ_ON);
    expect(a.spec).toEqual(b.spec);
    expect(a.spec).not.toEqual(c.spec);
  });

  it('places the multilayer resonance at the design wavelength', () => {
    const lam = range(900, 1700, 1);
    const R = modelSpectrum('cavity', lam, 0, 1200);
    expect(Math.abs(lam[pickLc(lam, R, false)] - 1200)).toBeLessThanOrEqual(1);
  });

  it('lets MWP track the simulated ΔEOT far better than RIFTS on the default run', async () => {
    const r = await runAnalysis(input({ nz: NZ_ON }));
    expect(r).not.toBeNull();
    const rmse = (k: string) => r!.series.find(s => s.key === k)!.rmse as number;
    expect(rmse('mwp')).toBeLessThan(0.5);
    expect(rmse('mwp')).toBeLessThan(rmse('rifts'));
  });

  it('returns exactly zero change at the reference spectrum', async () => {
    const r = await runAnalysis(input({ nz: NZ_OFF }));
    expect(r!.rifts[0]).toBe(0);
    expect(Math.abs(r!.mwp[0])).toBeLessThan(1e-9);
    expect(r!.iaw[0]).toBe(0);
  });
});

function input(o: { p?: typeof DEFAULTS; nz?: typeof NZ_ON } = {}): AnalysisInput {
  return {
    src: 'synth', p: o.p ?? { ...DEFAULTS }, sgOn: true, denMode: 'next', convMode: 'theory', useImported: false, dtUnit: 's',
    synthModel: 'cavity', filmKind: 'cavity', ...(o.nz ?? NZ_ON), dataset: null
  };
}
