// Shared numerical constants and the default parameter set.

/** Samples on the uniform reciprocal-wavelength (k = 1/λ) grid. */
export const NK = 512;
/** Zero-padded FFT length for the RIFTS peak search. */
export const NPAD = 4096;

export interface Params {
  lamMin: number; lamMax: number; nSpec: number; dt: number;
  lc: number; resp: number; noise: number; lampSd: number; stretchSd: number; add: number; mult: number; seed: number;
  sgWin: number; sgPoly: number; eswLc: number; eswLam2: number;
  eotMin: number; eotMax: number; nCyc: number; slope: number; intercept: number;
  baseA: number; baseB: number; respA: number; respB: number;
  refIdx: number; anaMin: number; anaMax: number; dtU: number;
}

export const DEFAULTS: Params = {
  lamMin: 900, lamMax: 1700, nSpec: 181, dt: 1,
  lc: 1200, resp: 0.35, noise: 0.0003, lampSd: 0.002, stretchSd: 0.000008, add: 0.005, mult: 0.02, seed: 12345,
  sgWin: 21, sgPoly: 3, eswLc: 1200, eswLam2: 1210,
  eotMin: 8000, eotMax: 25000, nCyc: 2, slope: 0.0105, intercept: 0,
  baseA: 0, baseB: 38, respA: 95, respB: 112,
  refIdx: 0, anaMin: 0, anaMax: 0, dtU: 15
};

/** The subset of parameters that switching data source or re-entering the demo resets. */
export const PICK_KEYS: (keyof Params)[] = ['refIdx', 'anaMin', 'anaMax', 'dtU', 'lc', 'eswLc', 'eswLam2', 'noise', 'lampSd', 'stretchSd', 'eotMin', 'eotMax', 'baseA', 'baseB', 'respA', 'respB', 'sgWin'];

export function pick(src: Params): Partial<Params> {
  const out: Partial<Params> = {};
  for (const k of PICK_KEYS) (out as Record<string, number>)[k] = src[k];
  return out;
}
