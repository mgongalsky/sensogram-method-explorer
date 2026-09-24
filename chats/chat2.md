# Conventional center wavelength shift

_Started 2026-09-15 05:32 UTC_

---

## User

Continuing from "Dataset upload feature".

## Assistant

We were building the upload feature for real spectral datasets. The prototype had synthetic-only mode working with all five analysis methods live — now we need to let users load their own data locally, validate it, and run the same pipeline.

Decisions made:

- Support two input formats: multiple two-column files (TXT/CSV/TSV, natural-sorted by filename) and one matrix file (wavelength column + spectra columns). Both must handle mixed delimiters (comma, tab, semicolon, whitespace), blank lines, and comment lines (#//%//).
- Validation gates analysis: at least two spectra, monotonic wavelength with no duplicates, numeric and finite values, every spectrum covers the selected range. Show a validation report before proceeding — do not silently accept malformed data.
- Wavelength grids that differ get interpolated onto their common overlapping range. Never extrapolate outside measured bounds.
- Reuse the full Experiments workspace UI — upload just swaps the data source, everything else (sliders, plots, export) stays identical.
- User-selectable reference spectrum (default: first), time step and units (or import from file), center wavelength constrained to the common range, ESW denominator mode (next wavelength by default, or select explicit second wavelength).
- All file processing stays local; add an explicit privacy note: "Your spectra are processed locally in this browser and are not uploaded."

Current state: The prototype runs synthetic mode end-to-end. The upload UI scaffold is in place (FileDropzone component, format selector), but the parser, validator, and data-source switcher are not yet implemented. The analysis worker and all five method modules are ready to consume uploaded data once it's parsed.

Next steps:

- Build parseSpectra() to handle both formats with robust delimiter detection and comment/blank-line skipping.
- Build validateSpectra() with the gate checks and a detailed report UI.
- Connect the upload flow to populate the same data model as synthetic mode, then run analysis through the existing worker.
- Add time-step input, reference-spectrum selector, and wavelength-range picker in the UI once upload succeeds.

Files involved: Sensogram Method Explorer.dc.html (main app), support.js (analysis and synthetic generation — will add parseSpectra and validateSpectra here).

## User

what is conventional center wavelength shift (subpixel or not). explain what you did.

## Assistant

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: grep]_

_[tool: read_file]_

Both — the app computes the two and plots them in the same panel, because the difference *is* the point of that method.

**What the code does** (one pass, lines ~961–981):

1. Search window: `±winHalf` nm around the selected centre wavelength λc gives index bounds `i0…i1`.
2. Grid result (`csGrid`): plain argmin — scan the row, take `lam[mi]` of the lowest reflectance sample. No interpolation, so it is quantized to the spectrometer's Δλ (`dl`) and its sensogram comes out as a staircase.
3. Sub-pixel result (`csFit`): three-point quadratic (parabolic) vertex fit on the minimum and its two neighbours, `d = 0.5(y₀−y₂)/(y₀−2y₁+y₂)`, then `λ = lam[mi] + d·dl`. `d` is rejected (set to 0) if it is non-finite or |d|>1, i.e. if the vertex falls outside the bracketing samples — that's the guard against a bad fit on a noisy or flat minimum.
4. Both are referenced to the chosen reference spectrum (`v − v[refI]`), so t=0 is exactly zero by construction.
5. Two guards feed the warnings panel: `edgeHits` counts spectra whose minimum landed on `i0` or `i1` (window too narrow or λc off-resonance — the tracked feature may have walked out), and the range check on λc.

**Terminology, since it matters for the writeup:** "conventional" in the porous-silicon literature means tracking the resonance extremum itself, as opposed to the Fourier/phase family (RIFTS, wavelet). Sub-pixel refinement is an implementation detail *within* the conventional method, not a separate method — which is why the panel is titled "Conventional centre-wavelength shift" and carries both traces, grid in the pale colour and the fit in the solid one.

Both columns are in the CSV export (`centerShift_grid_nm`, `centerShift_subpixel_nm`), and the SNR ranking treats `csFit` as the representative of the method.

One caveat worth knowing before you use real data: the parabolic fit is unbiased only when the minimum is roughly symmetric over three samples. On a sharp microcavity dip sampled at 1–2 nm, three points sit on the steep flanks and the fit systematically under-reads. If your real spectra are coarsely sampled I'd widen to a 5-point fit or fit the dip region properly — say the word and I'll add it as a third trace rather than replacing what's there.

## User

Here we want more controls. Like tools for rescale, enlarge, zoom in and out, data reader, etc.

## Assistant

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

Rebuilding the Plot component as an interactive one (zoom/pan/rescale/enlarge/readout) so every plot in the app gets the controls, then switching `mk()` to hand it data instead of pre-baked pixels.

_[tool: dc_write]_

Now `mk()` becomes a spec builder instead of a pixel builder.

_[tool: str_replace_edit]_

_[tool: grep]_

_[tool: ready_for_verification]_

Every plot in the app now carries its own toolbar, since they all go through the shared `Plot` component — the normalized-comparison card included.

**Controls added**

- **Zoom in / out** buttons, plus wheel-zoom anchored at the cursor.
- **Drag a range** on the plot to zoom to it (dashed selection rect), **shift-drag to pan**, **double-click to reset**.
- **Rescale Y** toggle — autoscales the y-axis to whatever is inside the current x-window, which is the one you'll want most on the normalized card where traces separate only after zooming.
- **Data reader** toggle (on by default) — crosshair snaps to the nearest sample per series and a chip row under the plot reads out x plus every series value, colour-keyed to the legend.
- **Enlarge** — the same figure lifts into a full-window overlay at up to 1500px, Esc or backdrop-click to close; zoom state carries over.

**Structural change:** `mk()` in the app no longer bakes pixel coordinates — it hands `Plot` the data and the axis metadata, and `Plot` owns projection, ticks, domain and interaction state. That's what makes zoom possible (the geometry has to be recomputed per view) and it keeps all ~20 call sites unchanged. Each plot holds its own view state independently, so zooming one doesn't disturb the others; re-running analysis leaves the zoom where you left it.

Not done yet, tell me if you want it: linked x-axes across the sensogram panels (zoom one, all follow) would be genuinely useful for comparing methods at the same time window, but it needs a shared state owner in the app rather than per-plot state. Also no y-axis-only zoom or cursor-pair delta measurement yet.

## User

and in that "Experiment" panel as well.

## Assistant

_[tool: read_file]_

_[tool: grep]_

_[tool: read_file]_

_[tool: grep]_

_[tool: run_script]_

_[tool: ready_for_verification]_

I read the comment as: the number itself should be a control, not just a label. Every slider readout in the Experiment panel (and the Dataset, Spectral filter, Smoothing and Advanced cards — 5 slider groups in all) now has:

- **Click the value to type an exact number** — Enter commits, Esc cancels, out-of-range or off-step entries snap to the nearest legal value. This is the thing a slider can't do: 0.35 nm exactly, or λc = 1187.24.
- **− / + nudge buttons** stepping by the slider's own step, so you can walk a parameter one increment at a time without fighting the drag.

The Spectral-filter "Filter from/to" sliders went through the same factory, so they behave identically and still respect the live data bounds.

Note the plots in that panel already got zoom/pan/rescale/reader/enlarge in the previous change — if what you actually meant was a different set of tools for the Experiment panel (say, parameter presets, save/compare parameter sets, or linked axes), tell me which and I'll do that instead.

## User

make defaults: range start 500 nm, range end  800 nm.
feature center, ESW wavelength, closest to 611 nm

## Assistant

_[tool: grep]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Applied to the defaults derived when a dataset loads:

- **Analysis range** defaults to 500–800 nm, clipped to the data's own bounds. If that window doesn't fit the file (needs at least ~12 samples of overlap), it falls back to the full range and the validation report says so.
- **Feature centre λ** and **ESW wavelength λc** default to the grid sample nearest 611 nm; λ₂ stays one sample above. If 611 nm isn't within the window (or isn't within ~5 samples of one), it falls back to the deepest minimum as before, again noted in the report.
- Centre search half-window now sizes off the 500–800 window rather than the full file.

Synthetic mode is untouched — it generates 1000–1400 nm, where 611 nm doesn't exist. Say the word if you want the synthetic generator moved to the visible range too.

## User

Found issues — fixing…

## Assistant

_[tool: grep]_

_[tool: show_html]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: get_webview_logs]_

_[tool: grep]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

_[tool: eval_js]_

Root cause found: the app does compute and draw — but `compute()` yields between batches with `setTimeout(0)`, which browsers clamp to ≥1s in a hidden/unfocused frame. With 181 spectra and ~16 batches × 2 passes, the initial run took **230 seconds** in the background preview, so it looked permanently stuck at "computing…". Fixing the yield.

_[tool: str_replace_edit]_

_[tool: read_file]_

_[tool: str_replace_edit]_

_[tool: dc_set_props]_

_[tool: ready_for_verification]_

Two things in this turn:

**The stall the verifier hit** — the app did compute and draw, but `compute()` yielded between batches with `setTimeout(0)`, which browsers clamp to ≥1 s in a hidden or unfocused frame. With 181 spectra that turned a sub-second run into 230 s, so an unfocused preview sat on "computing…". It now yields through a `MessageChannel` macrotask (not throttled) and skips yielding and progress ticks entirely while `document.hidden` — nothing to paint, so it runs straight through.

**Palette from the figure** (now the default, "Article figure" in Tweaks):

- ESW raw — light pink `#f9a7c8`
- ESW filtered — crimson-pink `#e33d86`
- RIFTS ΔEOT — blue `#4a72c8`
- Morlet phase — green `#5aa845`
- IAW — orange `#f4a259`
- **Centre-wavelength shift — violet `#7b3fa0`** (pale violet `#c2a0dc` for the grid variant), since the article has no fifth colour for it and violet stays separable from all five
- Ground truth stays near-black

Okabe–Ito and the design-system warm palette are still available in Tweaks. Note the article labels "EOT" where this app says "RIFTS ΔEOT" — say the word if you want the legend wording matched too.

## User

Found issues — fixing…

## Assistant

_[tool: grep]_

The `.sg-range` thumb is already themed via `::-webkit-slider-thumb`/`::-moz-range-thumb` in the helmet — the blue the verifier saw is almost certainly the screenshot renderer not reproducing those pseudo-elements. Adding `accent-color` anyway costs nothing and covers any engine where the custom thumb doesn't take.

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Added `accent-color: var(--color-accent)` plus a themed `:focus-visible` ring to `.sg-range`. Worth noting the custom thumb styling was already there in the helmet CSS (`::-webkit-slider-thumb` / `::-moz-range-thumb`, terracotta with a cream ring) — pseudo-element styling like that doesn't survive the screenshot renderer, which is why it read as browser blue. The `accent-color` line is a real belt-and-braces improvement regardless: it covers the track fill and any engine that ignores the custom thumb.

## User

We wanna measurement of calculation time for each method per spectrum. you can apply to set of spectra but then divide by amount of spectra. and put into overview below the plot.

## Assistant

_[tool: read_file]_

Now instrumenting the two passes and the series-level steps.

_[tool: run_script]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: run_script]_

_[tool: ready_for_verification]_

Added a **Computation cost per spectrum** card in Overview, directly under the normalized-comparison plot.

**How it's measured:** each stage is timed *inside the real run* with `performance.now()`, accumulated across all spectra, then divided by the spectrum count — exactly the approach you described. Sub-millisecond per-spectrum work isn't reliably timeable individually (clock resolution is ~5 µs), but the summed total is milliseconds, so the average is sound. Rows sort fastest→slowest with a bar, absolute time (µs or ms), and a ×N multiple relative to the fastest.

**Seven rows**, so the variants are comparable rather than lumped: grid-only centre shift vs. sub-pixel fit (the fit row includes the argmin it depends on), raw ESW vs. ESW + Savitzky–Golay (the filter is a whole-series op, so its cost is divided by n too), IAW, RIFTS, Morlet phase.

**One attribution decision worth knowing:** the k-domain resample (interpolate onto a uniform 1/λ grid + detrend) is a prerequisite of both RIFTS and Morlet phase. I charge it to *both* rather than to neither, since either method alone would have to pay it — and the footnote states the resample cost separately so you can subtract it if you'd rather report the marginal cost of adding the second method. The reference wavelet build is a one-off; it's folded into the Morlet row and divided by n.

The numbers are machine- and browser-relative — only the ratios travel to a paper. If you want it in the CSV/JSON export too, or a fixed-benchmark mode (same spectrum N times, discard the first run for JIT warm-up) for more stable figures, say so.

## User

Found issues — fixing…

## Assistant

_[tool: read_file]_

_[tool: read_file]_

_[tool: run_script]_

_[tool: str_replace_edit]_

_[tool: ready_for_verification]_

Both were real bugs.

**Colour keys** — the timing rows carried analysis keys (`csGrid`, `csFit`, `esw`) while the palette uses plot keys, so three rows silently fell back to the ground-truth black. Rows now carry an explicit `color` field mapping to the palette (`csGrid→centerGrid`, `csFit→center`, `esw→eswRaw`), so the panel's dots and bars match the curve colours in the plots.

**False precision** — with `performance.now()` clamped to ~0.1 ms, the cheap stages were 2–7 clock ticks over the whole dataset and printed to 3 significant figures, which made an 81-sample argmin and a single division read as identical. Now any stage whose whole-dataset total lands under 3 ms gets re-timed properly: the same work is replayed over doubling repeat counts until elapsed exceeds 25 ms, then divided by `n × reps`. Those rows say "re-timed over repeated passes" in their note, and the caveat line mentions it whenever it happened. Stages already well above the clock (IAW, RIFTS, Morlet) keep their in-run measurement. Adds roughly 75 ms to a run, after the results are already computed.

One honest limitation left: the replayed stages run hot, with data in cache and the JIT fully warmed, so they represent best-case throughput rather than the cost in a cold single-spectrum pipeline. For comparing methods against each other — which is what this panel is for — that's the right basis.

## User

Found issues — fixing…

## User

Check didn’t complete

## User

Check didn’t complete

## Assistant

_[tool: eval_js]_

