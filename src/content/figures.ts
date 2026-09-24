// Figure specs for the Home and Methods pages: noise-free illustrations of each method
// and the demo sensograms.

import { eduData } from '../analysis/edu';
import type { AnalysisResult } from '../analysis/types';
import type { PlotSpec } from '../components/Plot';
import type { MethodInfo, MethodKey, Palette } from './methods';

const EMPTY = (title = ''): PlotSpec => ({ x: [0, 1], series: [], title });

export function eduFigures(C: Palette): { ml: PlotSpec; sl: PlotSpec; fig: Record<MethodKey, [PlotSpec, PlotSpec]> } {
  const E = eduData();
  const bufL = 'Buffer', bndL = 'After binding';
  const ml: PlotSpec = {
    title: 'Microcavity: a resonance dip inside the stopband', note: 'two Bragg mirrors around a defect layer',
    x: E.mlLam, series: [{ y: E.ml0, color: C.ref, label: bufL, width: 1.6 }, { y: E.ml1, color: C.cur, label: bndL, width: 1.6 }],
    vlines: [{ x: E.mlRes, color: C.eswSm }], xlabel: 'Wavelength (nm)', ylabel: 'Reflectance', h: 250
  };
  const sl: PlotSpec = {
    title: 'Single layer: Fabry–Pérot fringes', note: 'one porous film on silicon',
    x: E.slLam, series: [{ y: E.sl0, color: C.ref, label: bufL, width: 1.6 }, { y: E.sl1, color: C.cur, label: bndL, width: 1.6 }],
    xlabel: 'Wavelength (nm)', ylabel: 'Reflectance', h: 250
  };
  const fig: Record<MethodKey, [PlotSpec, PlotSpec]> = {
    esw: [
      { title: 'Reading two pixels at a fringe minimum', note: 'λc = ' + E.lc + ' nm, Δλ = 1 nm · bound spectrum shifted by ' + E.shiftPx + ' pixel',
        x: E.zLam, series: [{ y: E.z0, color: C.ref, label: bufL, width: 1.8 }, { y: E.z1, color: C.cur, label: bndL, width: 1.8 }],
        vlines: [{ x: E.lc, color: C.eswSm }, { x: E.lc + 1, color: C.eswRaw }],
        dots: [{ x: E.lc, y: E.pA[0], color: C.ref, r: 4.5 }, { x: E.lc + 1, y: E.pA[1], color: C.ref, r: 4.5 }, { x: E.lc, y: E.pB[0], color: C.cur, r: 4.5 }, { x: E.lc + 1, y: E.pB[1], color: C.cur, r: 4.5 }],
        xlabel: 'Wavelength (nm)', ylabel: 'Reflectance', h: 250 },
      { title: 'The ratio follows sub-pixel shifts', note: 'R(λc) / R(λc + Δλ) as the spectrum moves',
        x: E.shX, series: [{ y: E.ratio, color: C.eswSm, label: 'ESW ratio', width: 2.2 }],
        vlines: [{ x: E.shiftPx, color: C.cur }], xlabel: 'Spectral shift (pixels)', ylabel: 'ESW ratio', h: 250 }
    ],
    eot: [
      { title: 'Fringes against reciprocal wavelength', note: 'detrended, even grid in 1/λ',
        x: E.kx, series: [{ y: E.k0, color: C.ref, label: bufL, width: 1.6 }, { y: E.k1, color: C.cur, label: bndL, width: 1.6 }],
        xlabel: '1/λ  (10⁻⁴ nm⁻¹)', ylabel: 'Reflectance (detrended)', h: 250 },
      { title: 'Fourier peak at the optical thickness', note: 'ΔEOT = ' + (E.eot1 - E.eot0).toFixed(1) + ' nm',
        x: E.eAx, series: [{ y: E.e0, color: C.ref, label: bufL, width: 1.8 }, { y: E.e1, color: C.rifts, label: bndL, width: 1.8 }],
        vlines: [{ x: E.eot0 / 1000, color: C.ref }, { x: E.eot1 / 1000, color: C.rifts }], xlabel: 'Effective optical thickness (µm)', ylabel: 'FFT magnitude', h: 250 }
    ],
    iaw: [
      { title: 'Buffer and bound spectra', note: 'zoomed onto a few fringes',
        x: E.izLam, series: [{ y: E.iz0s, color: C.ref, label: bufL, width: 1.8 }, { y: E.iz1s, color: C.cur, label: bndL, width: 1.8 }],
        xlabel: 'Wavelength (nm)', ylabel: 'Reflectance', h: 250 },
      { title: 'The difference spectrum, averaged', note: 'means: shift ' + (E.mShift * 1e3).toFixed(2) + ' · brightness ' + (E.mAmp * 1e3).toFixed(2) + ' (×10⁻³)',
        x: E.slLam, series: [{ y: E.dShift, color: C.iaw, label: 'Real shift', width: 1.6 }, { y: E.dAmp, color: C.truth, label: '2 % brighter, no shift', width: 1.5, dash: '5 4' }],
        xlabel: 'Wavelength (nm)', ylabel: '|R − Rref|', h: 250 }
    ],
    mwp: [
      { title: 'Wavelet band-pass on the fringes', note: 'complex Morlet tuned to EOT = ' + (E.eot0 / 1000).toFixed(2) + ' µm',
        x: E.kx, series: [{ y: E.k0, color: C.ref, label: 'Detrended', width: 1 }, { y: E.filtRe, color: C.mwp, label: 'Filtered', width: 2.2 }],
        xlabel: '1/λ  (10⁻⁴ nm⁻¹)', ylabel: 'Reflectance (detrended)', h: 250 },
      { title: 'Phase difference across the spectrum', note: 'weighted mean Δφ = ' + E.dphi.toFixed(0) + ' mrad',
        x: E.phX, series: [{ y: E.phY, color: C.mwp, label: 'Δφ per sample', width: 2 }, { y: E.phX.map(() => E.dphi), color: C.truth, label: 'Weighted mean', width: 1.4, dash: '6 4' }],
        xlabel: '1/λ  (10⁻⁴ nm⁻¹)', ylabel: 'Δφ (mrad)', h: 250 }
    ]
  };
  return { ml, sl, fig };
}

/** One method's normalized sensogram on the synthetic microcavity run. */
export function methodSensogram(hr: AnalysisResult | null, m: MethodInfo, C: Palette): PlotSpec {
  if (!hr) return EMPTY('Sensogram');
  const key = m.series === 'esw' ? (hr.sgApplied ? 'eswSm' : 'eswRaw') : m.series;
  const s = hr.series.find(q => q.key === key);
  if (!s) return EMPTY('Sensogram');
  const col = m.series === 'esw' ? C.eswSm : m.series === 'rifts' ? C.rifts : m.series === 'iaw' ? C.iaw : C.mwp;
  return {
    title: m.abbr + ' sensogram', note: 'synthetic microcavity run · normalized, baseline 0, response 1',
    x: hr.times, series: [{ y: s.norm, color: col, label: m.abbr, width: 2 }, hr.hasTruth && hr.truthNorm ? { y: hr.truthNorm, color: C.truth, label: 'Simulated', width: 1.4, dash: '6 4' } : null],
    xlabel: 'Time (min)', ylabel: 'Normalized response', h: 270, ymin: -0.45, ymax: 1.45
  };
}

/** The Home hero: one spectrum, and the same run read four ways. */
export function heroFigures(hr: AnalysisResult | null, C: Palette, showTruth: boolean): { spec: PlotSpec; sens: PlotSpec } {
  if (!hr) return { spec: EMPTY('Reflectance'), sens: EMPTY('Sensograms') };
  const HS = (k: string) => hr.series.find(s => s.key === k);
  const esw = HS(hr.sgApplied ? 'eswSm' : 'eswRaw'), iaw = HS('iaw'), mwp = HS('mwp');
  return {
    spec: {
      title: 'One reflectance spectrum', note: 'porous-silicon microcavity, ' + hr.lam[0] + '–' + hr.lam[hr.lam.length - 1] + ' nm',
      x: hr.lam, series: [{ y: hr.spec[0], color: C.ref, width: 1.6 }], xlabel: 'Wavelength (nm)', ylabel: 'Reflectance', h: 230, legend: false,
      vlines: [{ x: hr.lamUsed[0], color: C.eswSm }]
    },
    sens: {
      title: 'The same ' + hr.times.length + ' spectra, read four ways', note: 'normalized so the shapes can be compared',
      x: hr.times, series: [
        esw ? { y: esw.norm, color: hr.sgApplied ? C.eswSm : C.eswRaw, label: 'ESW', width: 2 } : null,
        iaw ? { y: iaw.norm, color: C.iaw, label: 'IAW', width: 1.8 } : null,
        mwp ? { y: mwp.norm, color: C.mwp, label: 'Morlet phase', width: 2.2 } : null,
        showTruth && hr.hasTruth && hr.truthNorm ? { y: hr.truthNorm, color: C.truth, label: 'Simulated', width: 1.6, dash: '6 4' } : null
      ], xlabel: 'Time (min)', ylabel: 'Normalized', h: 230, ymin: -0.45, ymax: 1.45
    }
  };
}
