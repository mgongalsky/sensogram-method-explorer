import type { Params } from './constants';
import type { FilmModel } from './synthetic';
import type { Complex, FftPeak } from './kdomain';

export type Level = 'ok' | 'warn' | 'error' | 'check';
export interface Note { level: Level; text: string }

export type Source = 'synth' | 'upload';
export type DenMode = 'next' | 'pick';
export type ConvMode = 'theory' | 'emp';
export type DtUnit = 's' | 'min';

/** A validated uploaded dataset on its common wavelength grid. */
export interface Dataset {
  lam: number[];
  spec: number[][];
  names: string[];
  importedTimes: number[] | null;
  shape: 'files' | 'matrix';
  step: number;
  lo: number;
  hi: number;
  /** rough EOT of the first spectrum, nm */
  est: number;
  /** parameter defaults derived on import */
  derived: Partial<Params>;
}

/** Everything the analysis depends on. */
export interface AnalysisInput {
  src: Source;
  p: Params;
  sgOn: boolean;
  denMode: DenMode;
  convMode: ConvMode;
  useImported: boolean;
  dtUnit: DtUnit;
  synthModel: FilmModel;
  filmKind: FilmModel;
  nzShot: boolean;
  nzLamp: boolean;
  nzStretch: boolean;
  dataset: Dataset | null;
}

export type SeriesKey = 'eswRaw' | 'eswSm' | 'iaw' | 'rifts' | 'mwp';

export interface Series {
  key: SeriesKey;
  label: string;
  unit: string;
  y: number[];
  color: SeriesKey;
  truth: number[] | null;
  off?: boolean;
  norm: number[];
  /** baseline standard deviation */
  sd: number;
  /** robust baseline MAD (scaled by 1.4826) */
  mad: number;
  /** baseline linear drift, per time unit */
  slope: number;
  /** mean(response) − mean(baseline) */
  response: number;
  snr: number;
  rmse: number | null;
  rmseNorm: number | null;
}

export interface MwpDiag { dphi: number; nCycCorr: number; dEOT: number; used: number; conf: 'high' | 'medium' | 'low' }

export interface TimingRow { key: string; color: SeriesKey; label: string; ms: number; note: string; share: number }
export interface TimingMeta {
  n: number; nSamples: number; benchedAny: boolean;
  kres: number; wav: number; total: number;
  fastest: TimingRow; slowest: TimingRow;
}

export interface WindowStats {
  bIdx: number[];
  rIdx: number[];
  eswBase: number;
  eswRel: number[];
  eswSm: number[];
  sgApplied: boolean;
  series: Series[];
  truthNorm: number[] | null;
  sgMs: number;
  windowWarn: Note[];
}

export interface CoreResult {
  n: number;
  times: number[];
  esw: number[];
  iaw: number[];
  rifts: number[];
  mwp: number[];
  truthE: number[] | null;
  hasTruth: boolean;
}

export interface AnalysisResult extends CoreResult, WindowStats {
  timing: TimingRow[];
  timingMeta: TimingMeta;
  lam: number[];
  spec: number[][];
  truthL: number[] | null;
  refI: number;
  /** the full, unfiltered wavelength grid and reference spectrum (for the range brush) */
  fullLam: number[];
  fullRef: number[];
  kg: number[];
  kSig: number[][];
  kbar: number;
  dk: number;
  kmin: number;
  kmax: number;
  riftsAll: FftPeak[];
  mwDiag: MwpDiag[];
  eotRef: number;
  cycles: number;
  sk: number;
  warn: Note[];
  warnBase: Note[];
  lamUsed: [number, number];
  hann: Float64Array;
  Wre: Float64Array;
  Wim: Float64Array;
  lo: number;
  hi: number;
  yr: Complex;
  mmax: number;
  scaleTh: number;
  dl: number;
  cost: Record<'esw' | 'iaw' | 'kres' | 'rifts' | 'mwp' | 'sg' | 'wav', number>;
  i2: number;
  ic: number;
  names: string[] | null;
  shape: string;
}

export interface Progress { phase: string; done: number; total: number; pct: string }
