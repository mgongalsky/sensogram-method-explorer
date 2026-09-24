// Method descriptions, references and plot palettes.

import type { SeriesKey } from '../analysis/types';

export type PaletteKey = SeriesKey | 'truth' | 'ref' | 'cur';
export type Palette = Record<PaletteKey, string>;

export const PALETTES: Record<'article' | 'cool' | 'warm', Palette> = {
  // matches the article figure: ESW light pink, ESW filtered crimson-pink, EOT blue,
  // MWP green, IAW orange.
  article: { eswRaw: '#f9a7c8', eswSm: '#e33d86', iaw: '#f4a259', rifts: '#4a72c8', mwp: '#5aa845', truth: '#201e1d', ref: '#8d8578', cur: '#4a72c8' },
  // colour-blind safe (Okabe–Ito)
  cool: { eswRaw: '#8fcdf0', eswSm: '#0072b2', iaw: '#009e73', rifts: '#cc79a7', mwp: '#d55e00', truth: '#201e1d', ref: '#7a8a5e', cur: '#0072b2' },
  // design-system warm
  warm: { eswRaw: '#b7c295', eswSm: '#7a8a5e', iaw: '#9a6b4f', rifts: '#5f6b45', mwp: '#8f3d16', truth: '#201e1d', ref: '#a8968a', cur: '#c67139' }
};

/** Figure settings that were designer "tweaks" in the prototype. */
export const FIGURE_SETTINGS = {
  palette: 'article' as keyof typeof PALETTES,
  showSimulated: true,
  compact: false
};

export interface Ref { text: string; doi: string }
export const REFS: Record<'eot' | 'iaw1' | 'iaw2' | 'mwp', Ref> = {
  eot: { text: 'K.P.S. Dancil, D.P. Greiner, M.J. Sailor, J. Am. Chem. Soc. 121 (1999) 7925–7930.', doi: '10.1021/ja991421n' },
  iaw1: { text: 'S. Mariani, L.M. Strambini, G. Barillaro, Anal. Chem. 88 (2016) 8502–8509.', doi: '10.1021/acs.analchem.6b01228' },
  iaw2: { text: 'S. Mariani, L. Pino, L.M. Strambini, L. Tedeschi, G. Barillaro, ACS Sens. 1 (2016) 1471–1479.', doi: '10.1021/acssensors.6b00634' },
  mwp: { text: 'S.J. Ward, R. Layouni, S. Arshavsky-Graham, E. Segal, S.M. Weiss, ACS Sens. 6 (2021) 2967–2978.', doi: '10.1021/acssensors.1c00787' }
};

export type MethodKey = 'esw' | 'eot' | 'iaw' | 'mwp';

export interface MethodInfo {
  key: MethodKey; abbr: string; title: string; formula: string; summary: string;
  reads: string; watch: string; steps: string[]; pros: string[]; cons: string[];
  capA: string; capB: string; refs: (keyof typeof REFS)[]; series: 'esw' | 'rifts' | 'iaw' | 'mwp';
}

export const METHODS: MethodInfo[] = [
  { key: 'esw', abbr: 'ESW', title: 'Effective shift in wavelength (ESW)', formula: 'ESW = R(λc) / R(λc + Δλ)',
    summary: 'A ratio of two reflectance values: one at a characteristic wavelength λc on a well-defined dip or peak, the other one spectrometer pixel further. As the spectrum shifts, the two values move in opposite directions and the ratio changes continuously — even while the feature is still inside a single pixel.',
    reads: 'two neighbouring pixels of each spectrum',
    watch: 'shot noise at the dip, which is why the trace is usually smoothed (ESW-filtered)',
    steps: [
      'In the first buffer spectrum, pick λc on a well-defined reflectance minimum or maximum.',
      'Read the reflectance at λc and at the next pixel, λc + Δλ.',
      'Divide the two. On a peak rather than a dip, invert the ratio so the response keeps its sign.',
      'Optionally smooth the ratio over time with a Savitzky–Golay filter — the ESW-filtered trace.'
    ],
    pros: [
      'Changes that hit both pixels alike — lamp intensity, detector gain, a uniform offset — cancel in the ratio.',
      'Resolves shifts below the spectrometer resolution, where tracking the minimum registers nothing.',
      'Two numbers and one division: it runs live inside the acquisition software.',
      'Works on single layers, microcavities and Bragg mirrors alike.'
    ],
    cons: [
      'It reads the spectrum where reflectance is lowest, so the raw trace carries the most shot noise.',
      'The output is a dimensionless ratio, not nanometres of optical thickness.'
    ],
    capA: 'Around one fringe minimum. The dashed lines are λc and the next pixel; the dots show where each spectrum is read. A shift of less than half a pixel already changes both values.',
    capB: 'The ratio against the shift of the spectrum, in pixels. It rises smoothly through the sub-pixel range — the shift is measured, not rounded to the grid.',
    refs: [], series: 'esw' },
  { key: 'eot', abbr: 'EOT', title: 'Effective optical thickness (EOT) by RIFTS', formula: 'EOT = 2nL = peak position of FFT{ R(1/λ) }',
    summary: 'The fringes of a porous film are evenly spaced in reciprocal wavelength, so a Fourier transform turns them into a single peak whose position is the effective optical thickness. Binding raises n and moves that peak. This is reflective interferometric Fourier transform spectroscopy, RIFTS — the conventional method.',
    reads: 'the Fourier peak of the whole spectrum',
    watch: 'high baseline noise, and slow baseline distortions that drag the peak',
    steps: [
      'Resample the spectrum onto an even grid in 1/λ.',
      'Remove the slow baseline and apply a window.',
      'Fourier-transform and find the dominant peak inside the expected EOT range; refine its position between bins.',
      'Report ΔEOT against the reference spectrum.'
    ],
    pros: [
      'Physical units — nanometres of optical thickness — and the longest track record.',
      'Simple, fast, and unaffected by a uniform change of brightness.'
    ],
    cons: [
      'The highest baseline noise of the four, which limits detection at low concentration.',
      'Slowly varying baseline distortions in complex media — scattering, absorption — move the peak without any binding.',
      'In multilayers several Fourier components coexist, and the dominant peak becomes ambiguous.'
    ],
    capA: 'Against 1/λ the single-layer fringes become one clean sinusoid. Buffer and bound spectra overlaid.',
    capB: 'Fourier magnitude against optical thickness. Binding moves the peak by ΔEOT.',
    refs: ['eot'], series: 'rifts' },
  { key: 'iaw', abbr: 'IAW', title: 'Interferogram average over wavelength (IAW)', formula: 'IAW = ⟨ |R(t) − Rref| ⟩λ',
    summary: 'Subtract the reference spectrum and average what is left across the whole wavelength window. Every pixel contributes, so random noise averages away — but so does the distinction between a shift and any other change.',
    reads: 'the whole difference spectrum',
    watch: 'amplitude and offset changes, which it counts as signal',
    steps: [
      'Record a reference spectrum in buffer.',
      'Subtract it from each new spectrum, leaving the interferogram of the change.',
      'Average the magnitude of that difference across the analysis window.',
      'Track the average over time.'
    ],
    pros: [
      'Averaging hundreds of pixels suppresses random noise; the original report improved the detection limit by orders of magnitude over EOT.',
      'No Fourier transform or fringe model is needed.'
    ],
    cons: [
      'Responds to amplitude and offset changes as readily as to shifts, so lamp drift or non-specific adsorption can look like binding.',
      'Baseline subtraction and averaging are done after acquisition.'
    ],
    capA: 'Buffer and bound spectra, zoomed onto a few fringes.',
    capB: 'The difference spectrum for a real shift (solid) and for a 2 % brightness change with no shift at all (dashed). Both average to a non-zero value, so IAW registers each as a response.',
    refs: ['iaw1', 'iaw2'], series: 'iaw' },
  { key: 'mwp', abbr: 'MWP', title: 'Morlet wavelet phase (MWP)', formula: 'ΔEOT = Δφ / (2π · k̄)',
    summary: 'Filter the fringes with a complex Morlet wavelet tuned to their own frequency, then compare the phase of each spectrum with the reference. The phase moves with the fringes but ignores their brightness.',
    reads: 'the phase of the wavelet-filtered fringes',
    watch: 'computation cost, and phase jumps in multilayer spectra',
    steps: [
      'Resample onto an even grid in 1/λ, as for EOT.',
      'Convolve with a complex Morlet wavelet centred on the fringe frequency — a narrow band-pass that removes white noise and the slow envelope together.',
      'Take the phase difference against the reference at every sample and average it, weighted by amplitude.',
      'Resolve whole 2π cycles with the coarse EOT value and convert Δφ to ΔEOT.'
    ],
    pros: [
      'Insensitive to intensity changes — lamp fluctuation, optical drift, bulk index steps.',
      'Low baseline noise; the current state of the art for single-layer films.'
    ],
    cons: [
      'The heaviest pipeline — Fourier transform, convolution, phase extraction and unwrapping — and the slowest per spectrum.',
      'Built on a single-frequency fringe model; multilayers with several close Fourier components can make the phase jump.'
    ],
    capA: 'Detrended fringes (thin) and the wavelet-filtered signal (bold) against 1/λ.',
    capB: 'Phase difference between bound and buffer spectra across the window. The dashed line is the weighted mean that becomes Δφ.',
    refs: ['mwp'], series: 'mwp' }
];
