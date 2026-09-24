// results.csv, parameters.json and diagnostics.csv.

import { NK, NPAD, type Params } from '../analysis/constants';
import type { AnalysisResult, ConvMode, Dataset, DenMode, DtUnit, Source } from '../analysis/types';
import type { FilmModel } from '../analysis/synthetic';

export interface ExportState {
  src: Source; p: Params; dataset: Dataset | null; useImported: boolean; dtUnit: DtUnit;
  synthModel: FilmModel; nzShot: boolean; nzLamp: boolean; nzStretch: boolean;
  denMode: DenMode; convMode: ConvMode;
}

export function paramsJson(st: ExportState, r: AnalysisResult | null): string {
  const p = st.p, D = st.dataset, upload = st.src === 'upload';
  return JSON.stringify({
    source: upload ? 'uploaded spectra (processed locally, never transmitted)' : 'synthetic',
    dataset: upload && D ? {
      shape: D.shape === 'matrix' ? 'single matrix file' : 'individual two-column files',
      spectra: D.spec.length, fileNames: D.names.slice(0, 400),
      commonGrid_nm: [D.lo, D.hi], gridStep_nm: D.step, samples: D.lam.length,
      timeSource: st.useImported ? 'imported from file header' : 'index × time step',
      scanInterval: p.dtU, scanIntervalUnit: st.dtUnit === 's' ? 'seconds' : 'minutes', timeAxisUnit: st.useImported ? 'imported' : 'minutes', referenceSpectrum: Math.round(p.refIdx) + 1,
      estimatedEOT_nm: D.est
    } : null,
    spectralFilter: { from_nm: p.anaMin || (r ? r.fullLam[0] : null), to_nm: p.anaMax || (r ? r.fullLam[r.fullLam.length - 1] : null), appliedRange_nm: r ? [r.lam[0], r.lam[r.lam.length - 1]] : null, samplesUsed: r ? r.lam.length : null },
    generator: upload ? null : {
      model: st.synthModel === 'single' ? 'single porous layer on silicon, transfer matrix at normal incidence' : 'porous-silicon microcavity: (HL)^6 · half-wave defect · (LH)^6 on silicon, transfer matrix at normal incidence',
      designWavelength_nm: p.lc,
      noiseSources: { photon: st.nzShot ? p.noise : null, lampJitter: st.nzLamp ? p.lampSd : null, thicknessJitter: st.nzStretch ? p.stretchSd : null },
      seed: p.seed, nSpectra: p.nSpec, timeStep_min: p.dt, lambda_nm: [p.lamMin, p.lamMax], lambdaStep_nm: 1, responseMagnitude_nm: p.resp,
      noiseAmplitude: p.noise, additiveDrift: p.add, multiplicativeDrift: p.mult,
      responseFunction: 'g(t)=0 (t<40); 1−exp(−(t−40)/15) (40≤t<110); g(110)·exp(−(t−110)/25) (t≥110)'
    },
    analysis: {
      eswWavelength_nm: p.eswLc, eswDenominatorMode: st.denMode, eswLambda2_nm: p.eswLam2, eswWavelengthsUsed_nm: r ? r.lamUsed : null,
      referenceSpectrum: r ? r.refI + 1 : 1, kGridSamples: NK, fftLength: NPAD, eotSearch_nm: [p.eotMin, p.eotMax],
      refinedReferenceEOT_nm: r ? r.eotRef : null, fringesInRange: r ? +r.cycles.toFixed(2) : null, morletCycles: p.nCyc, morletSigmaK: r ? r.sk : null,
      phaseConversion: st.convMode, empiricalSlope_nm_per_mrad: p.slope, empiricalIntercept_nm: p.intercept,
      edgeExclusion: '28 % of the k range at each end', magnitudeThreshold: '0.2 × reference peak'
    },
    smoothing: { applied: !!(r && r.sgApplied), appliesTo: 'display copy of the ESW vector only', window: p.sgWin, polynomial: p.sgPoly, derivative: 0 },
    intervals: { baseline: [p.baseA, p.baseB], response: [p.respA, p.respB] }
  }, null, 2);
}

const cell = (x: string | number): string => typeof x === 'number' ? (Number.isFinite(x) ? x.toPrecision(8) : 'NaN') : x;

export function resultsCsv(r: AnalysisResult, st: Pick<ExportState, 'src' | 'p'>): string {
  const up = st.src === 'upload';
  const head = ['time', 'spectrum', 'ESW_raw', 'ESW_relative', 'ESW_smoothed', 'IAW', 'RIFTS_dEOT_nm', 'MWP_dEOT_nm', 'simulated_dEOT_nm', 'confidence', 'warnings'];
  const rows = r.times.map((t, j) => {
    const flags: string[] = [];
    if (!Number.isFinite(r.esw[j])) flags.push('esw_denominator');
    if (r.mwDiag[j].nCycCorr !== 0) flags.push('phase_cycle_' + r.mwDiag[j].nCycCorr);
    if (r.mwDiag[j].conf === 'low') flags.push('low_confidence');
    return [t, (r.names && r.names[j]) ? String(r.names[j]).replace(/[,\n]/g, ' ') : (j + 1), r.esw[j], r.eswRel[j], r.sgApplied ? r.eswSm[j] : '', r.iaw[j], r.rifts[j], r.mwp[j], r.hasTruth && r.truthE ? r.truthE[j] : '', r.mwDiag[j].conf, flags.join('|')]
      .map(cell).join(',');
  });
  return ['# Reflectance Sensogram Method Explorer — results',
    up ? '# uploaded spectra, reference #' + (r.refI + 1) + ', processed locally' : '# synthetic experiment, seed ' + st.p.seed,
    '# analysis range ' + r.lam[0].toFixed(3) + '–' + r.lam[r.lam.length - 1].toFixed(3) + ' nm, ESW λ = ' + r.lamUsed.map(x => x.toFixed(2)).join(' / ') + ' nm',
    head.join(','), ...rows].join('\n');
}

export function diagnosticsCsv(r: AnalysisResult): string {
  const head = ['time', 'refined_EOT_nm', 'fft_peak_amplitude', 'fft_peak_fwhm_nm', 'peak_to_background', 'mean_dphi_rad', 'phase_cycles_applied', 'MWP_dEOT_nm', 'k_samples_used', 'confidence'];
  const rows = r.times.map((t, j) => [t, r.riftsAll[j].eot, r.riftsAll[j].amp, r.riftsAll[j].width, r.riftsAll[j].snr, r.mwDiag[j].dphi, r.mwDiag[j].nCycCorr, r.mwDiag[j].dEOT, r.mwDiag[j].used, r.mwDiag[j].conf]
    .map(cell).join(','));
  return [head.join(','), ...rows].join('\n');
}

export function download(name: string, text: string | Blob, type: string): void {
  const b = typeof text === 'string' ? new Blob([text], { type }) : text;
  const u = URL.createObjectURL(b), a = document.createElement('a');
  a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(u), 3000);
}
