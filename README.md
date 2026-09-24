# Sensogram Method Explorer

Interactive article companion comparing four ways to turn porous-silicon reflectance
spectra into sensograms — **ESW**, **EOT (RIFTS)**, **IAW** and **Morlet wavelet phase (MWP)** —
side by side, on a reproducible synthetic experiment or on the user's own spectra.
Everything runs in the browser; there is no backend and nothing is uploaded.

## Develop

```sh
npm ci
npm run dev        # http://localhost:5173
npm test           # Vitest numerical + parser tests
npm run build      # type-check, then static build into dist/
npm run preview    # serve dist/ locally
```

Requires Node 20+.

## Deploy

`npm run build` produces a fully static `dist/` (HTML, JS, CSS, fonts, images and the two
bundled example datasets under `dist/examples/`). Asset paths are relative (`base: './'`),
so `dist/` can be served from any directory or sub-path by any static web server
(nginx, Caddy, Apache, GitHub Pages…). No server-side configuration or routing rules
are needed — the app has no client-side routes. The bundled examples are fetched over
HTTP, so open the site through a web server rather than from `file://`.

## Layout

```
src/
  analysis/     pure, React-free numerics
    numeric.ts      FFT, Savitzky–Golay, detrend, interpolation, seeded RNG
    kdomain.ts      1/λ resampling, RIFTS FFT peak, Morlet wavelet phase
    methods.ts      ESW and IAW per-spectrum values
    synthetic.ts    transfer-matrix film models, noisy time series, feature picking
    metrics.ts      interval statistics (SD, MAD, drift, response, SNR, RMSE)
    pipeline.ts     the full analysis pass, cooperative yielding, per-method timing
    edu.ts          noise-free illustration data for Home / Methods
  io/           parsing (TXT/CSV/TSV/matrix/ZIP), validation + common grid, export
  components/   Plot (interactive SVG), form controls, method panels
  pages/        Home, Methods, Experiments (data, spectra, sensograms, overview,
                diagnostics, export)
  styles/       Organic design-system tokens + app styles
public/examples/  bundled PrS-47-MC (multilayer) and SL-P2-MA (single layer) excerpts
project/, chats/, HANDOFF.md   the Claude Design prototype this app implements
```
