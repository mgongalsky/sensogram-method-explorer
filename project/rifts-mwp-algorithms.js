// ============================================================================
// RIFTS (ΔEOT from FFT peak) and MWP (Morlet wavelet phase) — extracted
// algorithms from "Sensogram Method Explorer".
//
// Verbatim extraction: these are the exact routines the app runs, lifted out of
// the component class (this.x -> plain function calls) with the UI, progress
// ticking and per-method timing instrumentation removed. Nothing numeric was
// changed.
//
// Conventions
//   lam[]  wavelength grid, nm, strictly increasing
//   row[]  reflectance at those wavelengths for one spectrum
//   k      reciprocal wavelength 1/lambda, nm^-1  (NOT 2*pi/lambda)
//   EOT    effective optical thickness, nm; fringe frequency in k is EOT
//          because R ~ cos(2*pi*EOT*k)
// ============================================================================

const NK = 512;     // samples on the uniform k grid
const NPAD = 4096;  // zero-padded FFT length for the RIFTS peak search

// ---------------------------------------------------------------- primitives

// In-place radix-2 Cooley-Tukey FFT. re/im are same-length power-of-two
// arrays; inv=true gives the inverse transform (1/n normalised).
function fft(re, im, inv) {
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
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ur = re[i + k], ui = im[i + k];
        const xr = re[i + k + len / 2], xi = im[i + k + len / 2];
        const vr = xr * cr - xi * ci, vi = xr * ci + xi * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi;
        re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi;
        const ncr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = ncr;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// Linear interpolation of (xs, ys) onto grid, clamped at both ends.
// Binary search per point; xs must be increasing.
function interp(xs, ys, grid) {
  const n = xs.length, out = new Array(grid.length);
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

// Remove a least-squares straight line fitted against SAMPLE INDEX (not k).
// On the uniform k grid index is proportional to k, so this kills the DC and
// the linear baseline tilt before the FFT.
function detrend(y) {
  const n = y.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += y[i]; sxx += i * i; sxy += i * y[i]; }
  const b = (n * sxy - sx * sy) / (n * sxx - sx * sx), a = (sy - b * sx) / n;
  return y.map((v, i) => v - (a + b * i));
}

// The uniform-in-k resampling grid shared by both methods.
// dk is the k step; lamQ are the wavelengths to interpolate the spectrum at.
function kGrid(lam) {
  const kmin = 1 / lam[lam.length - 1], kmax = 1 / lam[0];
  const dk = (kmax - kmin) / (NK - 1);
  const kg = new Array(NK), lamQ = new Array(NK);
  for (let i = 0; i < NK; i++) { const k = kmin + i * dk; kg[i] = k; lamQ[i] = 1 / k; }
  return { kmin, kmax, dk, kg, lamQ, kbar: (kmin + kmax) / 2 };
}

function hannWindow() {
  const h = new Float64Array(NK);
  for (let i = 0; i < NK; i++) h[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NK - 1));
  return h;
}

// One spectrum -> the detrended, uniform-in-k signal both methods consume.
function kSignal(lam, row, lamQ) {
  return detrend(interp(lam, row, lamQ));
}

// ============================================================================
// RIFTS  —  Delta EOT from the FFT peak position
// ============================================================================
//
// R(k) is windowed, zero-padded NK -> NPAD and transformed. Bin m maps to
// EOT = m / (NPAD * dk). The dominant peak inside [emin, emax] is located on
// the bin grid and then refined sub-bin by a parabola fitted to the LOG
// magnitudes of the three bins around it (log-parabolic interpolation: exact
// for a Gaussian peak, which a Hann-windowed single tone approximates well).
//
// Returned per spectrum:
//   eot    refined peak position, nm
//   amp    peak magnitude
//   width  -3 dB (1/sqrt2 amplitude) width in EOT units, on the bin grid
//   snr    peak magnitude / mean magnitude in an out-of-band region
//          (1.4*emax .. 3*emax) used as the noise proxy
//
// The sensogram is the difference against the reference spectrum:
//   rifts[j] = eot[j] - eot[refIdx]

function fftMag(y, hann) {
  const re = new Float64Array(NPAD), im = new Float64Array(NPAD);
  for (let i = 0; i < NK; i++) re[i] = y[i] * hann[i];
  fft(re, im, false);
  const mag = new Float64Array(NPAD / 2);
  for (let i = 0; i < NPAD / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return mag;
}

function fftPeak(y, hann, dk, emin, emax) {
  const mag = fftMag(y, hann), eotOf = m => m / (NPAD * dk);
  let bi = -1;
  for (let i = 1; i < NPAD / 2 - 1; i++) {
    const e = eotOf(i);
    if (e < emin || e > emax) continue;
    if (bi < 0 || mag[i] > mag[bi]) bi = i;
  }
  if (bi < 1) return { eot: NaN, amp: 0, width: NaN, snr: 0 };

  // sub-bin refinement on log magnitudes
  const l0 = Math.log(mag[bi - 1] + 1e-18),
        l1 = Math.log(mag[bi] + 1e-18),
        l2 = Math.log(mag[bi + 1] + 1e-18);
  const den = l0 - 2 * l1 + l2, d = den !== 0 ? 0.5 * (l0 - l2) / den : 0;

  // -3 dB width, walked outward on the bin grid
  const half = mag[bi] / Math.SQRT2;
  let lo = bi, hi = bi;
  while (lo > 1 && mag[lo] > half) lo--;
  while (hi < NPAD / 2 - 2 && mag[hi] > half) hi++;

  // out-of-band noise floor
  let noise = 0, cnt = 0;
  for (let i = 1; i < NPAD / 2; i++) {
    const e = eotOf(i);
    if (e > emax * 1.4 && e < emax * 3) { noise += mag[i]; cnt++; }
  }
  return {
    eot: eotOf(bi + d),
    amp: mag[bi],
    width: eotOf(hi) - eotOf(lo),
    snr: mag[bi] / ((noise / (cnt || 1)) || 1e-18)
  };
}

// Coarse standalone EOT estimate used to seed eotMin/eotMax and the wavelet
// centre frequency. Same machinery, wide fixed bracket (800..200000 nm), no
// sub-bin refinement; falls back to 15000 nm if nothing is found.
function estimateEOT(lam, row) {
  const { dk, lamQ } = kGrid(lam);
  const y = detrend(interp(lam, row, lamQ));
  const re = new Float64Array(NPAD), im = new Float64Array(NPAD);
  for (let i = 0; i < NK; i++) re[i] = y[i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (NK - 1)));
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

// ============================================================================
// MWP  —  Morlet wavelet phase
// ============================================================================
//
// A complex Morlet kernel is built directly in the k domain at centre
// frequency f0 = EOT_ref (so it is tuned to the fringe the film actually
// produces) and Gaussian bandwidth sk = nCyc / (4 * EOT_ref).
//
// wavelet() writes the kernel as a function of k with wrap-around ordering
// (i >= NK/2 counts as negative k), then FFTs it once. filt() therefore
// multiplies two spectra and inverse-transforms: a circular convolution of the
// signal with the analytic wavelet, giving a complex analytic signal over k.
//
// phaseDiff() compares a spectrum's analytic signal against the reference's
// sample by sample inside [lo, hi) (the app uses 0.28*NK .. 0.72*NK, i.e. the
// middle ~44% where edge wrap is negligible). Per sample it forms the
// conjugate product, takes atan2 -> a wrapped phase difference in (-pi, pi],
// and averages those with weight |ref| * |signal|. Samples whose reference
// magnitude is below 20% of the in-band maximum are skipped entirely.
//
// Because atan2 wraps, the weighted mean dphi is only defined modulo 2*pi. The
// integer cycle count is recovered from the (coarse but unwrapped) RIFTS value
// — see unwrapAgainstRifts below — and then
//
//   Delta EOT = (dphi + 2*pi*nCycCorr) / (2*pi*kbar)
//
// in the "theory" convention, or a user-supplied linear calibration
// slope*total*1000 + intercept in the "empirical" convention.

function wavelet(f0, sk, dk) {
  const Wre = new Float64Array(NK), Wim = new Float64Array(NK);
  for (let i = 0; i < NK; i++) {
    const nn = i < NK / 2 ? i : i - NK,   // signed index -> negative k half
          k = nn * dk,
          env = Math.exp(-k * k / (2 * sk * sk));
    Wre[i] = Math.cos(2 * Math.PI * f0 * k) * env;
    Wim[i] = Math.sin(2 * Math.PI * f0 * k) * env;
  }
  fft(Wre, Wim, false);
  return { Wre, Wim };
}

// Circular convolution with the analytic wavelet -> complex analytic signal.
function filt(y, Wre, Wim) {
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

// Magnitude-weighted mean wrapped phase difference against the reference.
//   yr     reference analytic signal (from filt)
//   mmax   max |yr| inside [lo, hi), for the 20% amplitude gate
//   keepK  also return the per-sample phase profile (diagnostics plot)
function phaseDiff(y, Wre, Wim, yr, lo, hi, mmax, keepK) {
  const ys = filt(y, Wre, Wim);
  let sw = 0, sp = 0, used = 0;
  const dphiK = keepK ? new Array(NK).fill(NaN) : null;
  for (let i = lo; i < hi; i++) {
    const mr = Math.hypot(yr.re[i], yr.im[i]), ms = Math.hypot(ys.re[i], ys.im[i]);
    if (mr < 0.2 * mmax) continue;                       // amplitude gate
    const cr = ys.re[i] * yr.re[i] + ys.im[i] * yr.im[i];  // conjugate product
    const ci = ys.im[i] * yr.re[i] - ys.re[i] * yr.im[i];
    const dp = Math.atan2(ci, cr);
    if (dphiK) dphiK[i] = dp;
    const w = mr * ms; sw += w; sp += w * dp; used++;
  }
  return { dphi: sw > 0 ? sp / sw : NaN, used, dphiK };
}

// 2*pi cycle selection from the coarse RIFTS value, and the final conversion.
//   riftsJ    RIFTS Delta EOT for this spectrum, nm (unwrapped, coarse)
//   dphi      wrapped weighted phase difference, rad
//   kbar      mid-band k, nm^-1
//   scaleTh = 2*pi*kbar  is the rad-per-nm-of-EOT conversion
function unwrapAgainstRifts(riftsJ, dphi, kbar) {
  const scaleTh = 2 * Math.PI * kbar;
  const nCycCorr = Number.isFinite(riftsJ) && Number.isFinite(dphi)
    ? Math.round((riftsJ * scaleTh - dphi) / (2 * Math.PI))
    : 0;
  const total = dphi + 2 * Math.PI * nCycCorr;
  return { nCycCorr, total, dEOT: total / scaleTh };
}

// ============================================================================
// Driver — the full pipeline for a stack of spectra
// ============================================================================
//
// spec: array of reflectance rows on the SAME lam grid (the app trims every
//       imported spectrum to the common analysis window first).
// opts: { refIdx = 0, eotMin, eotMax, nCyc = 2 }
//
// Returns per-spectrum RIFTS and MWP sensograms plus wavelet diagnostics.

function analyse(lam, spec, opts) {
  const o = Object.assign({ refIdx: 0, nCyc: 2 }, opts || {});
  const n = spec.length, refI = o.refIdx;
  const { dk, lamQ, kbar, kmin, kmax } = kGrid(lam);
  const hann = hannWindow();

  const est = estimateEOT(lam, spec[refI]);
  const eotMin = o.eotMin != null ? o.eotMin : Math.max(500, est * 0.6);
  const eotMax = o.eotMax != null ? o.eotMax : est * 1.6;

  // pass one: resample to k, detrend, locate the FFT peak
  const kSig = new Array(n), riftsAll = new Array(n);
  for (let j = 0; j < n; j++) {
    kSig[j] = kSignal(lam, spec[j], lamQ);
    riftsAll[j] = fftPeak(kSig[j], hann, dk, eotMin, eotMax);
  }
  const eotRef = riftsAll[refI].eot;
  const rifts = riftsAll.map(q => q.eot - eotRef);

  // fringe count inside the window — below ~3 both FFT and phase are unreliable
  const cycles = eotRef * (kmax - kmin);

  // pass two: one wavelet tuned to the reference, then phase per spectrum
  const sk = o.nCyc / (4 * eotRef);
  const { Wre, Wim } = wavelet(eotRef, sk, dk);
  const yr = filt(kSig[refI], Wre, Wim);
  const lo = Math.floor(NK * 0.28), hi = Math.floor(NK * 0.72);
  let mmax = 0;
  for (let i = lo; i < hi; i++) mmax = Math.max(mmax, Math.hypot(yr.re[i], yr.im[i]));

  const mwp = new Array(n), mwDiag = new Array(n);
  for (let j = 0; j < n; j++) {
    const ph = phaseDiff(kSig[j], Wre, Wim, yr, lo, hi, mmax, false);
    const u = unwrapAgainstRifts(rifts[j], ph.dphi, kbar);
    // confidence: strong FFT peak AND enough samples past the amplitude gate
    const conf = riftsAll[j].snr > 4 && ph.used > (hi - lo) * 0.4
      ? 'high' : (riftsAll[j].snr > 2 ? 'medium' : 'low');
    mwp[j] = u.dEOT;
    mwDiag[j] = { dphi: ph.dphi, nCycCorr: u.nCycCorr, dEOT: u.dEOT, used: ph.used, conf };
  }

  return {
    rifts, riftsAll, mwp, mwDiag,
    eotRef, eotMin, eotMax, cycles, sk, kbar, dk, kmin, kmax, kSig, hann, Wre, Wim, yr
  };
}

// Node / bundler convenience; harmless in a plain browser script.
if (typeof module !== 'undefined') {
  module.exports = {
    NK, NPAD, fft, interp, detrend, kGrid, hannWindow, kSignal,
    fftMag, fftPeak, estimateEOT, wavelet, filt, phaseDiff,
    unwrapAgainstRifts, analyse
  };
}
