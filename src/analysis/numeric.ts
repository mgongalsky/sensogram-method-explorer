// Core numerical primitives: radix-2 FFT, linear detrend, linear interpolation,
// Savitzky–Golay smoothing, and a seeded random generator.

/** In-place iterative radix-2 FFT. `re.length` must be a power of two. */
export function fft(re: Float64Array | number[], im: Float64Array | number[], inv = false): void {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      const tr = re[i]; re[i] = re[j]; re[j] = tr;
      const ti = im[i]; im[i] = im[j]; im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (inv ? 2 : -2) * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
    const half = len / 2;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + half], xi = im[i + k + half];
        const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + half] = ur - vr; im[i + k + half] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

/**
 * Savitzky–Golay smoothing (derivative order 0) by a local least-squares
 * polynomial fit at every point. Near the ends the window is shifted inward
 * rather than shrunk, so every point sees a full `win`-point fit.
 * Returns a copy; the input is never modified.
 */
export function savGol(y: readonly number[], win: number, poly: number): number[] {
  const n = y.length, half = (win - 1) >> 1, out = new Array<number>(n);
  if (win > n || win < 3 || poly >= win) return y.slice();
  const m = poly + 1;
  for (let i = 0; i < n; i++) {
    let a = i - half, b = i + half;
    if (a < 0) { a = 0; b = win - 1; }
    if (b > n - 1) { b = n - 1; a = n - win; }
    const A: number[][] = [], rhs: number[] = [];
    for (let r = 0; r < m; r++) { A.push(new Array<number>(m).fill(0)); rhs.push(0); }
    for (let j = a; j <= b; j++) {
      const x = j - i, pw: number[] = [];
      for (let q = 0; q < 2 * m; q++) pw.push(Math.pow(x, q));
      for (let r = 0; r < m; r++) {
        for (let c = 0; c < m; c++) A[r][c] += pw[r + c];
        rhs[r] += pw[r] * y[j];
      }
    }
    for (let c = 0; c < m; c++) {
      let piv = c;
      for (let r = c + 1; r < m; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
      const tA = A[c]; A[c] = A[piv]; A[piv] = tA;
      const tb = rhs[c]; rhs[c] = rhs[piv]; rhs[piv] = tb;
      if (Math.abs(A[c][c]) < 1e-12) continue;
      for (let r = c + 1; r < m; r++) {
        const f = A[r][c] / A[c][c];
        for (let k = c; k < m; k++) A[r][k] -= f * A[c][k];
        rhs[r] -= f * rhs[c];
      }
    }
    const sol = new Array<number>(m).fill(0);
    for (let r = m - 1; r >= 0; r--) {
      let s = rhs[r];
      for (let k = r + 1; k < m; k++) s -= A[r][k] * sol[k];
      sol[r] = Math.abs(A[r][r]) < 1e-12 ? 0 : s / A[r][r];
    }
    out[i] = sol[0];
  }
  return out;
}

/** Removes a least-squares straight line fitted against the sample index. */
export function detrend(y: readonly number[]): number[] {
  const n = y.length;
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  return y.map((v, i) => v - (a + b * i));
}

/**
 * Linear interpolation of (xs, ys) onto `grid`; `xs` must be increasing.
 * Grid points outside [xs[0], xs[n-1]] are clamped to the end values — callers
 * only ever pass grids inside the measured range, so nothing is extrapolated.
 */
export function interp(xs: readonly number[], ys: readonly number[], grid: readonly number[]): number[] {
  const n = xs.length, out = new Array<number>(grid.length);
  for (let g = 0; g < grid.length; g++) {
    const x = grid[g];
    let a = 0, b = n - 1;
    if (x <= xs[0]) { out[g] = ys[0]; continue; }
    if (x >= xs[n - 1]) { out[g] = ys[n - 1]; continue; }
    while (b - a > 1) { const m = (a + b) >> 1; if (xs[m] <= x) a = m; else b = m; }
    const f = (x - xs[a]) / (xs[b] - xs[a]);
    out[g] = ys[a] + f * (ys[b] - ys[a]);
  }
  return out;
}

/** Periodic Hann window of length n (symmetric form, zero at both ends). */
export function hannWindow(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (n - 1));
  return w;
}

/** Mulberry32: a small, fast, seedable PRNG returning uniform numbers in [0, 1). */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/** Standard-normal generator (Box–Muller, both outputs used) driven by `rnd`. */
export function gaussGen(rnd: () => number): () => number {
  let spare: number | null = null;
  return () => {
    if (spare !== null) { const v = spare; spare = null; return v; }
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    const r = Math.sqrt(-2 * Math.log(u)), th = 2 * Math.PI * v;
    spare = r * Math.sin(th);
    return r * Math.cos(th);
  };
}

export const mean = (a: readonly number[]): number => a.reduce((s, v) => s + v, 0) / (a.length || 1);
