// The full analysis pass: spectral filter, ESW, IAW, k-resample, RIFTS FFT peak,
// Morlet wavelet phase with RIFTS-driven 2π cycle selection, interval statistics and
// per-method computation cost. Runs cooperatively on the main thread, yielding between
// batches so progress can paint and a run can be cancelled.

import { NK, NPAD, type Params } from './constants';
import { fftPeak, filt, kGrid, maxMagnitude, phaseDiff, phaseWindow, toK, wavelet, type FftPeak } from './kdomain';
import { eswValue, iawValue } from './methods';
import { windowStats } from './metrics';
import { hannWindow, savGol } from './numeric';
import { synth } from './synthetic';
import type { AnalysisInput, AnalysisResult, MwpDiag, Note, Progress, TimingRow } from './types';

export const ALL_PASSED: Note = { level: 'ok', text: 'All validation checks passed: monotonic wavelength grid, no duplicate samples, ESW wavelength inside the common range, every spectrum covers the analysis range.' };

/**
 * Identity of everything the heavy pass (k-resample, FFT peak, wavelet phase) depends
 * on. The two interval pairs are deliberately absent: moving a band cannot change a
 * single fringe measurement, only the statistics taken over them.
 */
export function heavyKey(st: AnalysisInput): string {
  const skip: Record<string, 1> = { baseA: 1, baseB: 1, respA: 1, respB: 1 };
  const p = st.p as unknown as Record<string, number>;
  const pk = Object.keys(p).filter(k => !skip[k]).sort().map(k => k + '=' + p[k]).join(',');
  return [st.src, st.sgOn, st.convMode, st.denMode, st.useImported, st.dtUnit, st.synthModel, st.filmKind, st.nzShot, st.nzLamp, st.nzStretch,
    st.dataset ? st.dataset.spec.length + 'x' + st.dataset.lam.length + ':' + (st.dataset.names || []).join('|') : '-',
    pk].join('~');
}

/** Re-derives only the interval statistics of a cached result, in place. */
export function refreshWindows(r: AnalysisResult, p: Params, sgOn: boolean): void {
  Object.assign(r, windowStats(r, p, sgOn));
  r.warn = (r.warnBase || []).concat(r.windowWarn);
  if (!r.warn.length) r.warn.push(ALL_PASSED);
  r.cost.sg = r.sgMs;
}

export interface RunHooks {
  onProgress?: (p: Progress) => void;
  /** returns true once this run has been superseded or cancelled */
  cancelled?: () => boolean;
}

const hidden = () => typeof document !== 'undefined' && document.hidden;

/**
 * Runs the whole analysis. Resolves to null when there is nothing to analyse or when
 * the run was cancelled part-way.
 */
export async function runAnalysis(st: AnalysisInput, hooks: RunHooks = {}): Promise<AnalysisResult | null> {
  const p = st.p;
  const synthRun = st.src === 'synth' ? synth(p, st.synthModel, st) : null;
  const base = synthRun ?? st.dataset;
  if (!base) return null;
  let lam = base.lam, spec = base.spec;
  let times: number[] = synthRun ? synthRun.times : [];
  const truthL = synthRun ? synthRun.truthL : null;
  let truthE = synthRun ? synthRun.truthE : null;
  const warn: Note[] = [];
  const fullLam = lam, fullRef = spec[Math.max(0, Math.min(spec.length - 1, st.src === 'synth' ? 0 : Math.round(p.refIdx)))];
  {
    // spectral filter: every method sees only [anaMin, anaMax]; at least 26 samples are kept
    const a = p.anaMin || lam[0], b = p.anaMax || lam[lam.length - 1];
    let ia = 0; while (ia < lam.length - 26 && lam[ia] < a - 1e-9) ia++;
    let ib = lam.length - 1; while (ib > ia + 25 && lam[ib] > b + 1e-9) ib--;
    if (ia > 0 || ib < lam.length - 1) {
      lam = lam.slice(ia, ib + 1); spec = spec.map(row => row.slice(ia, ib + 1));
    }
  }
  // uploaded scans are indexed by acquisition order; the interval field converts that
  // order into minutes, whatever unit the user typed it in
  const dtMin = st.dtUnit === 's' ? p.dtU / 60 : p.dtU;
  if (!synthRun) times = (st.useImported && st.dataset?.importedTimes) ? st.dataset.importedTimes : spec.map((_, j) => j * dtMin);
  const hasTruth = !!(truthE && truthL);
  const n = spec.length, dl = lam[1] - lam[0];
  const refI = st.src === 'synth' ? 0 : Math.max(0, Math.min(n - 1, Math.round(p.refIdx)));
  const big = n > 48;

  // setTimeout is clamped to >=1s in hidden/background tabs, which would stall the
  // batched passes below; a MessageChannel macrotask is not throttled, and when the
  // page is hidden there is nothing to paint, so it runs straight through.
  const chan = typeof MessageChannel !== 'undefined' ? new MessageChannel() : null;
  const yieldNow = () => {
    if (hidden() || !chan) return Promise.resolve();
    return new Promise<void>(res => { chan.port1.onmessage = () => res(); chan.port2.postMessage(0); });
  };
  const tick = (phase: string, done: number) => {
    if (!hidden() && hooks.onProgress) hooks.onProgress({ phase, done, total: n, pct: Math.max(2, Math.round(100 * done / n)) + '%' });
  };
  const stop = () => { chan?.port1.close(); return null; };
  const isCancelled = () => !!hooks.cancelled?.();
  if (big) tick('Preparing', 0);

  // --- window indices ---
  const ic = Math.max(0, Math.min(lam.length - 2, Math.round((p.eswLc - lam[0]) / dl)));
  const i2 = st.denMode === 'next' ? ic + 1 : Math.max(0, Math.min(lam.length - 1, Math.round((p.eswLam2 - lam[0]) / dl)));
  const { kmin, kmax, dk, kg, lamQ, kbar } = kGrid(lam[0], lam[lam.length - 1]);
  const hann = hannWindow(NK);
  const ref = spec[refI];
  const batch = Math.max(1, Math.min(24, Math.ceil(n / 40)));

  // --- pass one: ESW, IAW, k-transform, FFT peak ---
  const esw = new Array<number>(n), iaw = new Array<number>(n), kSig = new Array<number[]>(n), riftsAll = new Array<FftPeak>(n);
  let zeroDen = 0;
  // per-method cost accumulators (ms, summed over all spectra)
  const cost = { esw: 0, iaw: 0, kres: 0, rifts: 0, mwp: 0, sg: 0, wav: 0 };
  const now = () => performance.now();
  for (let j0 = 0; j0 < n; j0 += batch) {
    for (let j = j0; j < Math.min(n, j0 + batch); j++) {
      const row = spec[j];
      let tA = now();
      esw[j] = eswValue(row, ic, i2);
      if (!Number.isFinite(esw[j])) zeroDen++;
      let tB = now(); cost.esw += tB - tA;
      iaw[j] = iawValue(ref, row, lam);
      tA = now(); cost.iaw += tA - tB;
      kSig[j] = toK(lam, row, lamQ);
      tB = now(); cost.kres += tB - tA;
      riftsAll[j] = fftPeak(kSig[j], hann, dk, p.eotMin, p.eotMax);
      cost.rifts += now() - tB;
    }
    if (big) { tick('Fourier transforms', Math.min(n, j0 + batch)); await yieldNow(); if (isCancelled()) return stop(); }
  }
  if (zeroDen) warn.push({ level: 'warn', text: zeroDen + ' spectra had a near-zero ESW denominator at λ₂ = ' + lam[i2].toFixed(2) + ' nm; those points are flagged, not returned as infinity.' });
  if (i2 === ic) warn.push({ level: 'warn', text: 'The ESW numerator and denominator resolve to the same sample. Choose a different λ₂.' });
  if (st.src === 'synth' && p.add > 0.02) warn.push({ level: 'check', text: 'Additive baseline drift of ' + p.add.toFixed(3) + ' R shifts an intensity ratio directly, so ESW will show drift comparable to its response. Multiplicative lamp drift cancels in the ratio and does not.' });
  if (p.eswLc < lam[0] || p.eswLc > lam[lam.length - 1]) warn.push({ level: 'warn', text: 'The selected centre wavelength lies outside the analysis range ' + lam[0].toFixed(1) + '–' + lam[lam.length - 1].toFixed(1) + ' nm.' });
  if (n < 2) warn.push({ level: 'warn', text: 'Reference-based analysis needs at least two spectra.' });

  // --- reference wavelet, then per-spectrum phase ---
  const eotRef = riftsAll[refI].eot;
  const rifts = riftsAll.map(q => q.eot - eotRef);
  // the simulated ΔEOT is referred to the EOT actually measured, not the design value
  if (synthRun && Number.isFinite(eotRef)) truthE = synthRun.eps.map(e => eotRef * e);
  const cycles = eotRef * (kmax - kmin);
  if (!(cycles > 2)) warn.push({ level: 'warn', text: 'Only ' + cycles.toFixed(1) + ' fringes fall inside the analysis range. FFT and wavelet results need roughly three or more.' });
  const sk = p.nCyc / (4 * eotRef);
  const tWav0 = now();
  const { Wre, Wim } = wavelet(eotRef, sk, dk);
  const yr = filt(kSig[refI], Wre, Wim);
  cost.wav = now() - tWav0;
  const { lo, hi } = phaseWindow();
  const mmax = maxMagnitude(yr, lo, hi);
  const scaleTh = 2 * Math.PI * kbar;
  const mwp = new Array<number>(n), mwDiag = new Array<MwpDiag>(n);
  let lowConf = 0, cycCorr = 0;
  for (let j0 = 0; j0 < n; j0 += batch) {
    for (let j = j0; j < Math.min(n, j0 + batch); j++) {
      const tP0 = now();
      const ph = phaseDiff(kSig[j], Wre, Wim, yr, lo, hi, mmax, false);
      cost.mwp += now() - tP0;
      // RIFTS supplies the coarse ΔEOT that picks the 2π branch of the phase
      const nCycCorr = Number.isFinite(rifts[j]) && Number.isFinite(ph.dphi) ? Math.round((rifts[j] * scaleTh - ph.dphi) / (2 * Math.PI)) : 0;
      if (nCycCorr !== 0) cycCorr++;
      const total = ph.dphi + 2 * Math.PI * nCycCorr;
      const dEOT = st.convMode === 'theory' ? total / scaleTh : p.slope * total * 1000 + p.intercept;
      const conf: MwpDiag['conf'] = riftsAll[j].snr > 4 && ph.used > (hi - lo) * 0.4 ? 'high' : (riftsAll[j].snr > 2 ? 'medium' : 'low');
      if (conf === 'low') lowConf++;
      mwp[j] = dEOT;
      mwDiag[j] = { dphi: ph.dphi, nCycCorr, dEOT, used: ph.used, conf };
    }
    if (big) { tick('Wavelet phase', Math.min(n, j0 + batch)); await yieldNow(); if (isCancelled()) return stop(); }
  }
  if (cycCorr) warn.push({ level: 'check', text: cycCorr + ' spectra needed a non-zero 2π phase-cycle correction, selected from the coarse RIFTS estimate.' });
  if (lowConf) warn.push({ level: 'warn', text: lowConf + ' spectra carry a low-confidence flag: weak FFT peak relative to the out-of-band background.' });

  // Everything past this point depends only on the two intervals, so it is derived by
  // windowStats() — the same call the band-drag fast path uses against cached arrays.
  const warnBase = warn.slice();
  const core = { n, times, esw, iaw, rifts, mwp, truthE, hasTruth };
  const ws = windowStats(core, p, st.sgOn);
  warn.push(...ws.windowWarn);
  if (!warn.length) warn.push(ALL_PASSED);
  cost.sg = ws.sgMs;

  // Per-spectrum cost: total of each stage divided by the number of spectra.
  // The k-domain resample is a prerequisite of both RIFTS and Morlet phase, so it is
  // charged to each of them (either method alone would have to pay it). Morlet phase
  // additionally needs the RIFTS peak to choose its 2π cycle, so the MWP row carries the
  // full RIFTS cost plus its own wavelet and filtering work.
  const per = (ms: number) => ms / (n || 1);
  // performance.now() is clamped to ~0.1 ms in browsers, so a stage whose whole-dataset
  // total is only a few ticks cannot be reported honestly from the run above. Those
  // stages are re-timed over repeated passes until the elapsed time is far above the tick.
  const FLOOR = 3;
  const benchers: Record<string, () => number> = {
    esw: () => { let a = 0; for (let j = 0; j < n; j++) { const v = eswValue(spec[j], ic, i2); a += Number.isFinite(v) ? v : 0; } return a; },
    iaw: () => { let a = 0; for (let j = 0; j < n; j++) a += iawValue(ref, spec[j], lam); return a; },
    kres: () => { let a = 0; for (let j = 0; j < n; j++) a += toK(lam, spec[j], lamQ)[0]; return a; },
    sg: () => (ws.sgApplied ? savGol(ws.eswRel.map(v => Number.isFinite(v) ? v : 0), p.sgWin, p.sgPoly) : ws.eswRel.slice())[0]
  };
  let sink = 0;
  const benchMs = (fn: () => number) => {
    let reps = 1;
    for (let guard = 0; guard < 24; guard++) {
      let acc = 0;
      const t = now();
      for (let q = 0; q < reps; q++) acc += fn();
      const el = now() - t;
      sink += acc;
      if (el >= 25 || reps >= 8192) return el / reps;
      reps = Math.min(8192, Math.max(reps * 2, Math.ceil(reps * 30 / Math.max(el, 0.05))));
    }
    return 0;
  };
  let benchedAny = false;
  const resolve = (key: string, inRun: number) => {
    if (inRun >= FLOOR || !benchers[key]) return inRun;
    benchedAny = true;
    return benchMs(benchers[key]);
  };
  if (big) { tick('Timing the methods', n); await yieldNow(); if (isCancelled()) return stop(); }
  const sEsw = resolve('esw', cost.esw);
  const sSg = resolve('sg', cost.sg);
  const sIaw = resolve('iaw', cost.iaw);
  const sKres = resolve('kres', cost.kres);
  void sink;
  // composed additively, so a superset of work can never read as cheaper than its subset
  const rows: TimingRow[] = [
    { key: 'esw', color: 'eswRaw', label: 'ESW', ms: per(sEsw), note: 'one intensity ratio between two samples', share: 0 },
    { key: 'eswSm', color: 'eswSm', label: 'ESW + Savitzky–Golay', ms: per(sEsw + sSg), note: ws.sgApplied ? 'ratio plus the ' + p.sgWin + '-point, order-' + p.sgPoly + ' filter over the whole series' : 'filter disabled, ratio only', share: 0 },
    { key: 'iaw', color: 'iaw', label: 'IAW', ms: per(sIaw), note: 'trapezoidal integral over ' + lam.length + ' samples', share: 0 },
    { key: 'rifts', color: 'rifts', label: 'RIFTS ΔEOT', ms: per(sKres + cost.rifts), note: 'k-resample plus a ' + NPAD + '-point FFT and parabolic peak fit', share: 0 },
    { key: 'mwp', color: 'mwp', label: 'Morlet wavelet phase', ms: per(sKres + cost.rifts + cost.wav + cost.mwp), note: 'the whole RIFTS cost, which supplies the 2π cycle count, plus the wavelet kernel and two ' + NK + '-point FFTs per spectrum', share: 0 }
  ];
  const timing = rows.sort((a, b) => a.ms - b.ms);
  const tTotal = per(sEsw + sSg + sIaw + sKres + cost.rifts + cost.mwp + cost.wav);
  timing.forEach(q => { q.share = tTotal > 0 ? 100 * q.ms / tTotal : 0; });
  chan?.port1.close();

  return {
    ...core, ...ws,
    timing,
    timingMeta: { n, nSamples: lam.length, benchedAny, kres: per(sKres), wav: cost.wav, total: tTotal, fastest: timing[0], slowest: timing[timing.length - 1] },
    lam, spec, truthL, refI, fullLam, fullRef, kg, kSig, kbar, dk, kmin, kmax,
    riftsAll, mwDiag, eotRef, cycles, sk, warn, warnBase, lamUsed: [lam[ic], lam[i2]],
    hann, Wre, Wim, lo, hi, yr, mmax, scaleTh, dl, cost, i2, ic,
    names: st.src === 'synth' ? null : (st.dataset ? st.dataset.names : null),
    shape: st.src === 'synth' ? 'synthetic' : (st.dataset ? st.dataset.shape : '')
  };
}

/** EOT (nm) of FFT bin m for a result's k spacing. */
export const eotOfBin = (r: Pick<AnalysisResult, 'dk'>, m: number): number => m / (NPAD * r.dk);
