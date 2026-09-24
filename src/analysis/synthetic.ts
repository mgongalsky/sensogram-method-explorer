// Synthetic reflectance experiments computed from a normal-incidence transfer-matrix
// model of the film, with switchable noise sources and a known simulated response.

import type { Params } from './constants';
import { gaussGen, rng } from './numeric';

export type FilmModel = 'single' | 'cavity';

export interface Layer { n: number; d: number }
export interface Stack { layers: Layer[]; nSub: number; eot: number }

/**
 * Normal-incidence reflectance of a stack of (n, d) layers between air and a substrate.
 * Every layer matrix has the form [[A, iB], [iC, D]] with A…D real, and that form
 * survives multiplication, so the product is carried as four real numbers instead of a
 * complex-number class in the hot loop.
 */
export function stackR(layers: readonly Layer[], lam: number, nSub: number): number {
  let A = 1, B = 0, C = 0, D = 1;
  for (let q = 0; q < layers.length; q++) {
    const L = layers[q], dl = 2 * Math.PI * L.n * L.d / lam;
    const cs = Math.cos(dl), sn = Math.sin(dl), b2 = sn / L.n, c2 = L.n * sn;
    const A2 = A * cs - B * c2, B2 = A * b2 + B * cs;
    const C2 = C * cs + D * c2, D2 = -C * b2 + D * cs;
    A = A2; B = B2; C = C2; D = D2;
  }
  // [B_; C_] = M · [1; nSub], then r = (n0·B_ − C_)/(n0·B_ + C_) with n0 = 1
  const nr = A - D * nSub, ni = B * nSub - C;
  const dr = A + D * nSub, di = B * nSub + C;
  return (nr * nr + ni * ni) / (dr * dr + di * di);
}

/**
 * The two films this tool is about, each described the way it is actually fabricated.
 * 'single' is one porous layer on silicon — a Fabry–Pérot etalon whose reflectance is a
 * cosine in 1/λ. 'cavity' is a porous-silicon microcavity: two quarter-wave Bragg
 * mirrors of alternating porosity enclosing a half-wave defect layer, which opens a
 * narrow resonance inside the stopband. λc sets the quarter-wave design wavelength, so
 * the defect mode sits there.
 */
export function stack(model: FilmModel, lc: number): Stack {
  const nH = 1.78, nL = 1.36, nSub = 3.55;
  if (model === 'single') {
    // 2·n·d = EOT: a ~4.6 µm film reads ~15 µm of effective optical thickness
    const n = 1.62, d = 15000 / (2 * n);
    return { layers: [{ n, d }], nSub, eot: 2 * n * d };
  }
  const dH = lc / (4 * nH), dL = lc / (4 * nL), N = 6;
  const layers: Layer[] = [];
  for (let i = 0; i < N; i++) { layers.push({ n: nH, d: dH }); layers.push({ n: nL, d: dL }); }
  layers.push({ n: nL, d: lc / (2 * nL) });
  for (let i = 0; i < N; i++) { layers.push({ n: nL, d: dL }); layers.push({ n: nH, d: dH }); }
  const opt = layers.reduce((s, L) => s + L.n * L.d, 0);
  return { layers, nSub, eot: 2 * opt };
}

/** Reflectance of `model` on the grid `lam` with every porous index scaled by (1 + eps). */
export function modelSpectrum(model: FilmModel, lam: readonly number[], eps: number, lc = 1200): number[] {
  const s = stack(model, lc), L = s.layers.map(q => ({ n: q.n * (1 + eps), d: q.d }));
  return lam.map(l => stackR(L, l, s.nSub));
}

/** Normalized association/dissociation response g(t), t in minutes. */
export function responseShape(t: number): number {
  return t < 40 ? 0 : (t < 110 ? 1 - Math.exp(-(t - 40) / 15) : (1 - Math.exp(-70 / 15)) * Math.exp(-(t - 110) / 25));
}

export interface NoiseSwitches { nzShot: boolean; nzLamp: boolean; nzStretch: boolean }

export interface SyntheticRun {
  lam: number[];
  spec: number[][];
  /** simulated centre-wavelength shift, nm */
  truthL: number[];
  /** simulated ΔEOT against the design EOT, nm (rescaled to the measured EOT by the pipeline) */
  truthE: number[];
  /** fractional index change per spectrum */
  eps: number[];
  times: number[];
  model: FilmModel;
  eot0: number;
}

/**
 * Generates a reproducible time series. Analyte infiltration raises the index of every
 * porous layer by the same fraction, so the whole spectrum scales in wavelength:
 * Δλ/λ = ΔEOT/EOT = eps.
 *
 * Three independent noise sources, each switchable, because they enter the
 * measurement at different points and the methods are not equally vulnerable to them:
 *   shot    — per pixel, variance proportional to the signal (photon counting)
 *   lamp    — one random factor per spectrum, scaling the whole curve at once
 *   stretch — a random fractional change of the optical thickness itself, so the
 *             fringe period jitters exactly like a real thermal or etch fluctuation
 */
export function synth(p: Params, model: FilmModel, nz: NoiseSwitches): SyntheticRun {
  const lam: number[] = [];
  for (let l = p.lamMin; l <= p.lamMax; l += 1) lam.push(l);
  const st0 = stack(model, p.lc);
  const gs = gaussGen(rng(p.seed));
  const spec: number[][] = [], truthL: number[] = [], truthE: number[] = [], epsAll: number[] = [], times: number[] = [];
  for (let j = 0; j < p.nSpec; j++) {
    const t = j * p.dt, eps0 = p.resp * responseShape(t) / p.lc, f = j / (p.nSpec - 1);
    const eps = eps0 + (nz.nzStretch ? p.stretchSd * gs() : 0);
    const lamp = (1 + p.mult * f) * (nz.nzLamp ? 1 + p.lampSd * gs() : 1);
    const layers = st0.layers.map(L => ({ n: L.n * (1 + eps), d: L.d }));
    // additive offset = stray light, multiplicative factor = lamp drift
    spec.push(lam.map(l => {
      const R = stackR(layers, l, st0.nSub);
      const shot = nz.nzShot ? p.noise * Math.sqrt(Math.max(R, 1e-4)) * gs() : 0;
      return (R + p.add * f) * lamp + shot;
    }));
    // the stretch fluctuation is part of the film state, so it belongs in the simulated response
    truthL.push(p.lc * eps); truthE.push(st0.eot * eps); epsAll.push(eps); times.push(t);
  }
  return { lam, spec, truthL, truthE, eps: epsAll, times, model, eot0: st0.eot };
}

/**
 * Index of the reflectance feature the ESW wavelength should sit on, searched between
 * iA and iB. A multilayer has one feature worth tracking — the defect resonance — and
 * it is the SHARPEST notch, not the deepest point: the fringe minima outside the
 * stopband can go lower but belong to a slow oscillation, so local contrast against a
 * ±20 nm neighbourhood separates them. A single layer is a plain fringe train where
 * every minimum is equivalent, so the one nearest the middle of the window is the
 * stable choice — it stays furthest from both edges as the film swells.
 */
export function pickLc(lam: readonly number[], ref: readonly number[], single: boolean, iA?: number, iB?: number): number {
  const n = lam.length;
  const a = Math.max(1, iA === undefined ? 1 : iA), b = Math.min(n - 2, iB === undefined ? n - 2 : iB);
  if (b <= a) return a;
  const isMin = (i: number) => ref[i] <= ref[i - 1] && ref[i] <= ref[i + 1];
  if (single) {
    const c = Math.round((a + b) / 2);
    for (let d = 0; d <= b - a; d++) {
      if (c - d >= a && isMin(c - d)) return c - d;
      if (c + d <= b && isMin(c + d)) return c + d;
    }
  }
  const dl = (lam[n - 1] - lam[0]) / (n - 1), w = Math.max(2, Math.round(20 / (dl || 1)));
  let mi = -1, best = -Infinity;
  for (let i = a; i <= b; i++) {
    if (!isMin(i)) continue;
    let s = 0, c = 0;
    for (let q = Math.max(0, i - w); q <= Math.min(n - 1, i + w); q++) { s += ref[q]; c++; }
    const prom = s / c - ref[i];
    if (prom > best) { best = prom; mi = i; }
  }
  if (mi < 0) { mi = a; for (let i = a; i <= b; i++) if (ref[i] < ref[mi]) mi = i; }
  return mi;
}
