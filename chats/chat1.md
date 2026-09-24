# Dataset upload feature

_Started 2026-09-03 04:36 UTC_

---

## User

<system-info comment="Only acknowledge these if relevant">
Project title is now "Reflectance Sensogram Method Explorer??Technical and design brief for Claude Des"
Current date is now September 3, 2026
</system-info>

<attached aesthetic_system_instructions>
A design system or theme is attached to this project. That attachment already answers the visual-style question: apply it. Do NOT ask the user which visual style to use — no questions about vibe, colors or palette directions (including color-swatch svg-options questions), typography, mood, or art direction, and skip the "divergent visuals" question from the question-asking tips; offer divergent visual directions only if the user themselves asks for alternatives. This rule bans asking the user to pre-pick a style in the abstract — swatches, mood words, palette pickers. It does not ban asking them to choose among candidates you have already built: putting built candidates on a file-options board for the user to pick from is encouraged. Treat the attachment as the confirmed starting point and product context — the "confirm the starting point" tip is already satisfied, so do not ask the user to confirm or re-pick it. Spend your questions on everything else you need: audience, purpose, content, structure, scope, interactions, tone of copy.
</attached aesthetic_system_instructions>

<pasted_text name="Pasted text (684 lines)">
Reflectance Sensogram Method Explorer

Technical and design brief for Claude Design

Build a polished scientific demonstration website for an article comparing methods used to derive sensograms from porous-silicon reflectance spectra.

This is an interactive article companion, not a commercial data platform. The first release must run entirely in the browser. Do not create a backend, database, account system, or server-side file upload. User spectra must remain on the user's device.

Scientific scope

ESW means Effective Shift in Wavelength, as defined in Sharma et al., Advanced Sensor Research 2025, DOI: 10.1002/adsr.202500007, and implemented in the supplied Sensogram5V2colormap.m:

[
S_{\mathrm{ESW}}(t)=
\frac{I(\lambda_c,t)}{I(\lambda_{\mathrm{next}},t)}
]

where lambda_next is the wavelength sample immediately after the selected center wavelength.

The relative sensogram is:

[
\Delta ESW(t)=ESW(t)-\overline{ESW}_{baseline}.
]

Savitzky–Golay filtering is optional post-processing. Always preserve the raw result.

The second analysis method is Morlet Wavelet Phase / Linear Average Morlet Phase (MWP/LAMP), based on the supplied MorletWaveletPhaseMethod.m and Ward et al., ACS Sensors 2021, DOI: 10.1021/acssensors.1c00787.

For a useful method-comparison website, include these five outputs:

conventional microcavity center-wavelength shift;

ESW;

Interferogram Average over Wavelength (IAW);

RIFTS/FFT effective optical thickness shift;

Morlet Wavelet Phase (MWP/LAMP).

The first four are computationally simple. MWP is the only substantially heavier method.

Product goals

The website should let a reader:

Understand why porous-silicon reflectance spectra contain Fabry–Pérot fringes.

Understand how center shift, ESW, IAW, RIFTS, and Morlet phase convert a sequence of spectra into sensograms.

Load a built-in synthetic experiment and immediately see all methods working.

Upload their own spectral time series and process it locally.

Compare methods using normalized sensograms and objective noise/error metrics.

Export calculated results and the selected parameters.

The site should clearly separate scientific signal processing from display-only smoothing.

Recommended stack

Vite

React

TypeScript with strict type checking

Tailwind CSS

shadcn/ui for restrained interface components

Plotly.js for line plots and spectral overlays

Papa Parse for CSV/TSV parsing; add a small custom parser for whitespace-delimited TXT files

ml-savitzky-golay for optional Savitzky–Golay filtering

fft.js for initial FFT implementation

Web Worker for FFT, convolution, interpolation, and batch processing

KaTeX or react-katex for equations

SheetJS only if XLSX export is included; CSV and JSON export are sufficient for the MVP

Vitest for numerical and parser tests

Do not use Next.js: this application does not need server rendering or API routes. Keep it deployable as a static build.

Top-level navigation

Use three primary pages:

Home

Short title and one-sentence explanation.

Visual hero based on a reflectance spectrum evolving into several sensograms.

Two primary actions: Open synthetic demo and Analyze my data.

Short cards introducing ESW, IAW, Morlet phase, and local-only processing.

Article citation and code/data availability area near the bottom.

Theory

Explain the methods visually and concisely.

Sections:

Porous silicon as a Fabry–Pérot layer.

Reflectance as a function of wavelength and reciprocal wavelength.

Conventional center-wavelength shift.

ESW calculation.

IAW calculation.

Savitzky–Golay smoothing as optional visualization/post-processing.

RIFTS/FFT estimation of effective optical thickness.

Complex Morlet filtering and phase comparison.

What “best method” means: noise, drift, response, SNR, RMSE, and LOD when calibration data are available.

Use the approximate model:

[
R(k,t)=B(k,t)+A(t)\cos\left(2\pi,EOT(t),k+\phi_0\right)+\epsilon(k,t),
\qquad k=1/\lambda
]

with:

[
EOT=2nL.
]

Experiments

This is the main interactive workspace. At the top provide two source tabs:

Synthetic example

Upload spectra

Below the source controls, use a consistent analysis-and-results workspace rather than navigating to another page.

Synthetic experiment

Generate the example in the browser with a fixed random seed so it is reproducible.

Suggested defaults:

wavelength range: 1000–1400 nm

wavelength step: 1 nm

181 spectra

time step: 1 min

baseline EOT: 15,000 nm

microcavity center wavelength: 1200 nm

additive Gaussian noise

slow additive baseline drift

slow multiplicative lamp-intensity drift

Create a base spectrum containing Fabry–Pérot fringes and a distinct microcavity reflectance minimum. A suitable lightweight model is:

[
R_0(\lambda)=0.45+0.12\cos\left(2\pi EOT_0/\lambda+\phi\right)
-0.25\exp\left[-\frac{(\lambda-\lambda_c)^2}{2\sigma_c^2}\right].
]

Generate the time series by shifting the complete spectral pattern by a sub-resolution wavelength shift, then applying additive drift, multiplicative drift, and noise. The default maximum center-wavelength shift should be about 0.35 nm while the wavelength sampling interval is 1 nm. This illustrates why simple minimum tracking struggles and why ESW can resolve a smaller effective shift.

Use an association/dissociation-style normalized response function g(t):

[
g(t)=0,\qquad t&lt;40
]

[
g(t)=1-e^{-(t-40)/15},
\qquad 40\le t&lt;110
]

[
g(t)=g(110)e^{-(t-110)/25},
\qquad t\ge110.
]

and set deltaLambda(t) = 0.35 nm * g(t). Derive the corresponding synthetic EOT change from the common fractional spectral shift.

Provide compact controls for:

noise amplitude

additive drift

multiplicative drift

response magnitude in nm

center wavelength

randomize noise button

reset defaults button

The synthetic mode must display both known deltaLambda and deltaEOT ground truth. This makes it possible to calculate method-specific RMSE and demonstrate robustness to noise or drift.

Accepted experimental input formats

Support these two formats in the first release:

Multiple two-column files

Each TXT, CSV, or TSV file contains:

wavelength  reflectance
1000        0.431
1001        0.447
...

Requirements:

Support comma, tab, semicolon, or repeated whitespace delimiters.

Ignore blank lines and comment lines beginning with #, %, or //.

Permit one optional header row.

Apply natural filename sorting, so spectrum2.txt precedes spectrum10.txt.

Show the inferred order and allow the user to reorder or reverse it.

One matrix file

First column: wavelength.

Remaining columns: spectra ordered in time.

Optional first row: spectrum names or times.

Do not silently accept malformed data. Show a validation report before analysis.

Input validation and preprocessing

Validate:

at least two spectra for reference-based analysis

at least 21 time points before enabling the default 21-point Savitzky–Golay window

numeric and finite wavelength/reflectance values

monotonically increasing wavelength after sorting

no duplicated wavelength values

selected center wavelength lies inside the common range

every spectrum covers the selected analysis range

enough visible fringes for an FFT/Morlet result

If wavelength grids differ, interpolate all spectra onto a user-visible common overlapping grid. Never extrapolate outside the measured range.

Parameters exposed to the user:

reference spectrum: default first spectrum

time step and units, or imported time values

analysis wavelength range

center wavelength

ESW denominator mode: next measured wavelength by default; optionally allow a second explicitly selected wavelength

Savitzky–Golay on/off, window length, polynomial order

expected EOT search range for FFT/Morlet analysis

Keep advanced parameters collapsed by default.

ESW analysis module

Implement ESW as a pure function. Do not reproduce file-system, Excel, plotting, or user-input behavior from MATLAB.

For each spectrum j:

Find the nearest measured wavelength to the requested lambdaCenter.

Select the next higher wavelength sample for the published ESW mode.

Calculate:

[
S_j=I_j(\lambda_c)/I_j(\lambda_{c+1}).
]

Return the actual two wavelengths used, not only the requested wavelength.

Flag zero or near-zero denominators instead of returning infinity.

Optionally calculate a baseline-relative result:

[
\Delta S_j=S_j-\overline{S}_{baseline}
]

and a fractional result:

[
\Delta S_j/S_0.
]

Savitzky–Golay filtering must operate on a copy of the raw ESW vector. Always preserve and display the raw result.

Default smoothing settings matching the supplied example:

window length: 21

polynomial order: 3

derivative order: 0

Window length must be odd and greater than polynomial order.

Conventional center-wavelength module

Within a user-selected window around the microcavity resonance:

Locate the reflectance minimum for each spectrum.

Optionally refine its position with a three-point quadratic fit.

Report deltaLambda(t) = lambdaCenter(t) - baselineCenter.

Show both the raw spectrometer-grid result and the sub-pixel fitted result. Warn if the minimum is at the boundary of the selected window.

IAW module

For every spectrum, construct an interferogram relative to the reference:

[
D_j(\lambda)=R_{ref}(\lambda)-R_j(\lambda).
]

Zero it by removing its mean:

[
D'_j(\lambda)=D_j(\lambda)-\overline D_j.
]

Then calculate the wavelength-averaged absolute interferogram:

[
IAW_j=\frac{1}{\lambda_{max}-\lambda_{min}}
\int_{\lambda_{min}}^{\lambda_{max}}|D'_j(\lambda)|,d\lambda.
]

Use trapezoidal integration so the value is not accidentally dependent on the wavelength sampling density. Explain that IAW is sensitive to amplitude changes as well as spectral shifts.

Morlet Wavelet Phase module

Implement the algorithm independently from the MATLAB coding style. The scientific sequence is:

Restrict the reference and sample spectra to a common wavelength range.

Transform to reciprocal wavelength, k = 1 / lambda.

Interpolate onto a uniform increasing k grid.

Remove the mean or fitted low-order baseline.

Apply a Hann window for the RIFTS/FFT EOT estimate.

Find the dominant FFT peak within the specified EOT range.

Refine the peak location using local parabolic interpolation or a local direct DFT. Do not use enormous zero-padding.

Determine peak width in physical EOT units, not FFT-bin indices.

Construct a complex Morlet wavelet:

[
\psi(k)=
e^{i2\pi f_0 k}
e^{-k^2/(2\sigma_k^2)}.
]

Convolve using FFT-based convolution.

Extract and unwrap the complex phase.

Exclude or down-weight edge regions affected by convolution and points with negligible complex magnitude.

Calculate the mean sample-to-reference phase difference.

Use the coarse RIFTS deltaEOT estimate to select the correct 2*pi phase branch.

Convert phase to deltaEOT.

Do not hard-code the MATLAB calibration values 0.0105 and -0.0655 as universal constants.

Provide two conversion modes:

Theoretical, based on the selected reciprocal-wavelength grid, with an approximate scale 2*pi*mean(k).

Empirical calibration, where the article authors can supply slope and intercept values.

Return diagnostics for every spectrum:

refined dominant EOT

FFT peak amplitude and width

raw average phase difference

selected phase-cycle correction

final deltaEOT

warning flags and a quality/confidence indicator

Comparison and results UI

Results should contain the following tabs or sections:

Overview

compact summary cards

number of spectra and wavelength range

reference spectrum

ESW baseline noise

MWP baseline noise

warning count

in synthetic mode, RMSE against known deltaEOT

Sensograms

ESW raw

ESW smoothed

conventional center shift

IAW

RIFTS deltaEOT

Morlet/MWP deltaEOT

synthetic ground truth when applicable

Because the methods use different units, provide:

a physical/raw-values view

a baseline-centered and normalized comparison view

Never imply that vertical amplitudes in unlike units are directly comparable.

Spectra

overlay selected spectra

scrub through time with a slider

show reference and current spectrum prominently

optional reciprocal-wavelength view

Diagnostics

FFT power spectrum and selected EOT peak

Morlet-filtered phase for reference and selected spectrum

validation warnings

parameters used

Method-ranking metrics

If the user selects a baseline interval and a response interval, calculate:

[
\mathrm{SNR}=
\frac{|\overline y_{response}-\overline y_{baseline}|}
{s_{baseline}}.
]

Also report:

baseline standard deviation

robust baseline MAD

baseline linear drift slope

response magnitude

response CV if replicate grouping exists

synthetic RMSE and bias when ground truth is available

Do not automatically declare one method scientifically superior from a single metric. Present a short explanation such as “lowest baseline noise,” “highest SNR,” or “lowest synthetic RMSE.”

LOD calculation is out of scope for the first synthetic/upload demo unless concentration labels and replicate groups are supplied.

Export

Allow download of:

results.csv: time, center shift, raw ESW, smoothed ESW, IAW, RIFTS deltaEOT, MWP deltaEOT, and warnings

parameters.json: all analysis and preprocessing settings

optional results.xlsx with separate Results, Parameters, and Diagnostics sheets

PNG or SVG exports of publication-ready plots

Performance requirements

Perform analysis in a dedicated Web Worker so the page remains responsive.

Use transferable ArrayBuffer objects where practical.

Process spectra sequentially or in small batches to cap memory use.

Show progress and allow cancellation.

Cache reference-spectrum preprocessing and its wavelet result.

Do not create a 16-million-point FFT for every spectrum.

Do not perform a 50,000-point direct convolution for every spectrum.

Target smooth processing for approximately 200 spectra × 500–2000 wavelength samples on a normal laptop.

Suggested source structure

src/
  analysis/
    types.ts
    centerShift.ts
    esw.ts
    iaw.ts
    savitzkyGolay.ts
    reciprocalGrid.ts
    rifts.ts
    morlet.ts
    phaseUnwrap.ts
    metrics.ts
    synthetic.ts
  workers/
    analysis.worker.ts
  io/
    parseSpectra.ts
    validateSpectra.ts
    exportResults.ts
  components/
    FileDropzone.tsx
    AnalysisControls.tsx
    SensogramPlot.tsx
    SpectrumPlot.tsx
    DiagnosticsPanel.tsx
  pages/
    HomePage.tsx
    TheoryPage.tsx
    ExperimentsPage.tsx

All analysis functions should be deterministic and independent of React.

Numerical tests

At minimum, add tests for:

Constant spectra give constant ESW.

The selected ESW wavelengths are reported correctly.

Zero denominators produce a warning, not infinity.

Savitzky–Golay preserves a low-order polynomial away from the boundaries.

A three-point quadratic fit recovers a known sub-grid center shift.

IAW is zero for the reference spectrum and positive for a shifted spectrum.

A pure additive offset is removed by IAW zeroing.

FFT recovers a synthetic EOT within a defined tolerance.

Morlet phase recovers the sign and magnitude of a known synthetic EOT shift.

The reference spectrum returns approximately zero deltaEOT.

File ordering uses natural sort.

Different wavelength grids are correctly restricted and interpolated to their overlap.

Synthetic output is identical for the same random seed.

Visual direction

Use a clean scientific style rather than a generic SaaS dashboard:

light neutral background

deep blue/teal accents inspired by porous-silicon optical spectra

restrained cards and borders

large plots with legible axes and units

color-blind-safe line colors

equations and explanations close to the relevant controls

responsive desktop-first layout; mobile may stack plots vertically

Do not use decorative 3D molecular imagery or excessive gradients. The spectra and sensograms should be the main visual identity.

Required MVP behavior

On first visit, the user must be able to click Open synthetic demo and, without configuring anything, see:

several example reflectance spectra;

conventional center-shift, raw ESW, smoothed ESW, and IAW sensograms;

RIFTS and Morlet/MWP deltaEOT sensograms;

synthetic ground truth;

baseline-noise and RMSE comparison;

an explanation of why the methods respond differently to noise and drift.

The upload workflow should reuse the same plots and controls. All file processing must be local, and the interface should explicitly state: “Your spectra are processed locally in this browser and are not uploaded.”

Do not do these things

Do not copy MATLAB UI, plotting, directory, or Excel logic.

Do not reproduce MATLAB indexing assumptions.

Do not require MATLAB Runtime or Python.

Do not create a backend for the MVP.

Do not silently smooth data.

Do not silently extrapolate spectra.

Do not hard-code one experimental acquisition rate.

Do not hard-code one filename convention.

Do not spend MVP effort on colormaps. They may be added later as an optional diagnostic view.

Do not claim ESW or MWP is “best” without showing the metric used.
</pasted_text>

<!-- The user explicitly selected the following skills for this project, as attachments to their message. These are not optional context — they define how you work. Use them. -->
<attached-skill name="Design Components">
This project uses Design Components: every design is a single streaming `Name.dc.html` file. The full authoring spec is in your system prompt under "Writing code — Design Components" — follow it. Author and edit `.dc.html` content with the `dc_write`, `dc_html_str_replace`, `dc_js_str_replace`, and `dc_set_props` tools (not `write_file`; `str_replace_edit` works but won't stream); template edits stream into the live preview as you type.
</attached-skill>

<attached-skill name="Organic (design system)">
[Design System] This project uses the **Organic** design system. This is a binding choice for visual style — every visual must follow it. Don't invent colors, type, spacing, or components not grounded here.

Scope: the design system is a visual style reference only. Its guide may describe example products, brands, or people that are unrelated to the user and unrelated to the subject of this conversation. Never treat anything in the design system as a fact about the user, their work, or the topic they asked about.

This project has the **Organic_organi** design system bound at `_ds/organic-294d1fd7-f409-4ee6-9c79-6121ef98acc2/`. If anything under that path is missing or fails to load, the folder name may differ — `list_files` `_ds/` and use the folder whose name ends with 294d1fd7-f409-4ee6-9c79-6121ef98acc2 instead, including in the <link>/<script> paths below.

**Loading the bundle is how you use this design system.** Every Design Component you build must load `_ds/organic-294d1fd7-f409-4ee6-9c79-6121ef98acc2/_ds_bundle.js` in `<helmet>` (include it in child DCs too — de-duped by URL) and compose with its components — do not recreate those components from scratch or restyle raw HTML to look like them. At the top of the template:

```html
<helmet>
  <link rel="stylesheet" href="_ds/organic-294d1fd7-f409-4ee6-9c79-6121ef98acc2/styles.css">
  <script src="_ds/organic-294d1fd7-f409-4ee6-9c79-6121ef98acc2/_ds_bundle.js"></script>
</helmet>
```

Then mount any component directly in the template — no logic class needed:

```html
<x-import component-from-global-scope="Organic_organi.Button" hint-size="auto,40px">Label</x-import>
```

Props are template attributes (kebab → camelCase); template children pass through as `props.children`. The linked stylesheet(s) carry the design tokens (colors, type, spacing) — style against those via `var(--*)` and the design system's classes rather than guessing values.

**Start from a template if one matches.** Before building from scratch, check whether a template below matches the user's request. Read the template (list its folder, `read_file` the entry) and decide: if it's close to what's asked, `copy_files` the folder as your starting point; if you'd rather re-author in DC, `dc_write` a new page using the template as your structural reference. When this design system is bound, `copy_files` repoints the copied `ds-base.js` automatically — only edit its base line yourself if the copy result says so, or when copying from an unbound project (change `'../..'` to your `_ds/organic-294d1fd7-f409-4ee6-9c79-6121ef98acc2` path). (Older templates have no `ds-base.js` and carry `../../…` bundle/stylesheet refs in their pages instead — repoint those by hand.)

- `Deck` (`/projects/294d1fd7-f409-4ee6-9c79-6121ef98acc2/templates/deck/`) — A twenty-one-slide presentation starter: cover, contents, dividers, columns, quadrants, a data table, SVG charts and timeline, bleed imagery, a quote and a close, on the theme's tokens
- `Landing` (`/projects/294d1fd7-f409-4ee6-9c79-6121ef98acc2/templates/landing/`) — A one-page product landing in the system's own voice — an invented product (Little Acre: a seed-box subscription), a warm hero, a seed bed of numbered circles, a washed photograph and a sign-up patch

The full design-system source tree lives at `/projects/294d1fd7-f409-4ee6-9c79-6121ef98acc2/` — use `list_files` / `read_file` from there for anything not under `_ds/` (layout varies by brand; don't assume folder names). Its guide is reproduced below so you don't need to fetch it:

<design-system-guide>
# Organic design system

Organic is warm, rounded and a little playful: a cream-and-sand ground with a terracotta accent and a sage second accent, Caprasimo display headings over Figtree, 16px radii that grow into pills and soft circular shapes. Photographs are washed so they sit back into the warm page instead of on top of it.

## How to use this

- Link the one stylesheet from every page — `&lt;link rel="stylesheet" href="styles.css"&gt;` (adjust the relative path) — and take every color, font, spacing, radius and shadow from its variables (`var(--color-*)`, `var(--font-*)`, `var(--space-*)`, `var(--radius-*)`, `var(--shadow-*)`). Never hard-code a hex, a font name or a px value the tokens already carry.
- Build with the classes below rather than inventing parallel ones; the component pages are plain HTML, so view source and copy the markup.
- `templates/` holds starting points a consuming project can copy whole.
- The whole system was derived from `theme.json`. To change the look, edit the tokens at the top of `styles.css` — every page, the thumbnail and this guide read from them — and keep `theme.json` and the written guidance in step so they don't drift from what the CSS actually does.

## Direction

Left-aligned, asymmetric layouts. Flush-left headings; content hugs the left edge with whitespace on the right. Lean into round shapes — over-rounded containers, pill buttons (`border-radius: 999px`), soft circular accents. Wrap hero and inline images in the `.washed` class — desaturated, lower-contrast and lifted, so they sit back into the page rather than on top of it.

## Color

A light ground (`--color-bg` #f5ead8) with `--color-text` #201e1d and two accents — `--color-accent` #c67139 and `--color-accent-2` #7a8a5e. Each role carries a 100–900 tonal ramp (`--color-neutral-100` … `--color-accent-2-900`) generated in OKLCH on a shared perceptual lightness scale, so the same step of any ramp has the same visual weight. Use the light steps (100–300) for tinted fills, hovers and subtle borders, 500 as the role's base, and the dark steps (700–900) for text on tinted fills and for pressed states; prefer ramp steps over ad-hoc `color-mix()`. For elevation use `--shadow-sm/md/lg` (already tuned to the ground) rather than ad-hoc box-shadows.

## Type

Caprasimo for headings over Figtree for body text, loaded as `--font-heading` / `--font-body`. Density 1.10× and radius 16px are already baked into the `--space-*` / `--radius-*` scales — use the variables, not raw numbers.

## Icons

Use Lucide icons (https://lucide.dev), at stroke-width 2.75 for a rounder, heavier look throughout.

## Interaction states

Interactive states are themed, never browser defaults: give every interactive element a `:hover` tint and a pressed state from the accent ramp (one step past the base — `--color-accent-600` on a light ground, `--color-accent-400` on a dark one, or a `color-mix()` tint for outlined/ghost variants), and style keyboard focus with `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }` — never leave the default blue focus ring.

## Components

| Class | What it is | Shown in |
| --- | --- | --- |
| `.btn` with `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-icon`, `.btn-block` | Actions — the primary is a solid accent fill | components/buttons.html |
| `.tag` with `.tag-accent`, `.tag-accent-2`, `.tag-neutral`, `.tag-outline` | Small labels tinted from the ramps | components/buttons.html |
| `.field` + `label`, `.input`, `.radio` + `.dot`, `.seg` + `.seg-opt` | Form fields and choices on native elements — no script | components/forms.html |
| `.card` with `.card-kicker`, `.card-title`, `.card-body`, `.card-meta`; `.elev-sm/md/lg` | Surface-filled content cards; elevation utilities | components/cards.html |
| `.nav` + `.nav-brand` | The header bar | components/navigation.html |
| `.table` | Data tables with themed header and row rules | components/table.html |
| `.dialog-backdrop` + `.dialog` (+ `.dialog-title/-body/-actions`) | A modal at the top elevation | components/dialog.html |
| `.hr` | A horizontal rule — present, but this system prefers whitespace; avoid it | — |
| `.washed` | The image wrapper — every content photograph goes through it | foundations/image.html |

States are built in: hovers and pressed states come from the accent ramp, keyboard focus is the 2px accent `:focus-visible` ring, `::selection` is an accent tint, and disabled controls drop to 45% opacity. Don't restyle them per page. The accent-to-ground pair is tuned to at least 3:1 — enough for icons, large text and interface chrome, not for body copy — so for paragraph-size text in the accent use a deep ramp step (`--color-accent-700` on this ground) rather than the accent itself.

## Do

- Over-round: `--radius-lg` for containers, `border-radius: 999px` for buttons and inputs.
- Use soft shapes — circles and blobs — as decoration and imagery masks.
- Reach for the sage `--color-accent-2-*` ramp as a genuine second voice, not just a highlight.
- Wash photography with the `.washed` wrapper and keep its edges rounded.

## Don't

- Do not draw sharp corners or hairline-only geometry.
- Do not desaturate the palette into greys — warmth is the point.
- Do not use condensed or geometric display faces; Caprasimo is the only display voice.
- Do not crowd elements; the rounded shapes need air to read as soft.

## Files

- `styles.css` — the only stylesheet: the token sheet (`:root` variables, ramps, base type) plus the component layer. Link it from every page.
- `readme.md` — this guide.
- `theme.json` — the parameters these files were derived from (a machine-readable record of the theme).
- `thumbnail.html` — the project cover (brand mark + swatches).
- `foundations/type.html` — the type scale and the heading/body pairing at real sizes.
- `foundations/color.html` — color roles and the 100-900 tonal ramps, with usage notes.
- `foundations/layout.html` — the spacing scale, the grid and how edges are drawn.
- `foundations/icons.html` — the icon set at interface sizes, inline and in buttons.
- `foundations/image.html` — how photographs and figures are treated.
- `components/buttons.html` — buttons, icon buttons and tags in every variant and state.
- `components/forms.html` — text fields, radios and the segmented control on native elements.
- `components/cards.html` — content cards and the elevation steps.
- `components/navigation.html` — the header bar pattern.
- `components/table.html` — a data table with the themed header and row rules.
- `components/dialog.html` — a modal over its backdrop at the top elevation.
- `theme.html` — the theme's parameters rendered as a reference sheet.
- `templates/landing/` — a starter page consuming the system the intended way (`index.html`, its `ds-base.js` loader, and the vendored `image-slot.js` its photograph mounts).
- `assets/photo.jpg` — the reference photograph the imagery page treats.

</design-system-guide>
</attached-skill>

## Assistant



## User

Answered — deliverable: A working browser prototype — real math, real plots, runs standalone; methods: Center-wavelength shift (+ quadratic sub-pixel), ESW, IAW, RIFTS / FFT ΔEOT, Morlet wavelet phase (MWP/LAMP); pages: Home, Experiments workspace; upload: Synthetic only for now; audience: Broad interdisciplinary readers new to interferometric sensing; theory_depth: Visual-first, minimal math; notes: no idea. let's decide later.

## Assistant

Before building: this environment produces a single self-contained interactive HTML artifact, not a Vite/React/TS repo with Vitest — so a few scope calls matter.

_[tool: ask_user]_

_[tool: grep]_

No answers came through — I'll take the calls myself: a working browser prototype, all five methods computing for real, synthetic + upload, design-system chrome with a colour-blind-safe plot palette. First, validating the numerics before I build UI around them.

_[tool: run_script]_

Math checks out — MWP recovers ΔEOT at 0.40 nm RMSE where RIFTS gives 6.7 nm and grid-limited minimum tracking is pure noise. That's the article's story. Building now: Home + Experiments, all five methods, synthetic only.

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: show_html]_

_[tool: get_webview_logs]_

_[tool: show_html]_

Plot lines are overflowing their frames — adding a clip region, and trimming the hero to the readable subset.

_[tool: dc_html_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

ESW was being read at the resonance minimum, where its slope — and therefore its sensitivity — is zero. Splitting it onto its own flank wavelength.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

ESW responds through local curvature, so its signal is ~6×10⁻⁴ — the default noise floor was two orders too high for any method except Morlet to be alive. Recalibrating the defaults to a realistic averaged-NIR spectrometer.

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: show_html]_

_[tool: multi_screenshot]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: dc_html_str_replace]_

_[tool: multi_screenshot]_

_[tool: dc_html_str_replace]_

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Built as a working prototype: Home explains the physics with real figures, Experiments runs the full pipeline in-page.

All five methods compute for real — sub-pixel minimum tracking, ESW with raw always preserved alongside the SG copy, IAW by trapezoidal integration, RIFTS with parabolic peak refinement, and Morlet phase with RIFTS-driven 2π branch selection, theoretical or empirical conversion (no hard-coded calibration constants). Live sliders, ranking table with SNR/MAD/drift/RMSE, per-spectrum diagnostics, CSV + JSON export. Default run: MWP recovers ΔEOT to ~0.04 nm against RIFTS ~1.6 nm.

Two things I decided that you may want to overrule:

- **Noise defaults.** At the brief's implied noise level, ESW's signal (~6×10⁻⁴ ratio, driven by local curvature) was buried and only Morlet survived. I set the default noise to 2×10⁻⁴ R so all five are alive and the comparison is about physics, not one dead method. Slider goes higher if you want the harsh case.
- **No separate Theory page** (you picked Home + Experiments), so the theory is folded into Home as visual-first sections. Upload is a signposted panel, not a parser — say the word and I'll build the parser and validation report next.

## User

Found issues — fixing…

## Assistant

_[tool: dc_js_str_replace]_

_[tool: ready_for_verification]_

Fixed: the ranking table's SD, MAD, drift-slope and response columns now pick precision from each value's magnitude, falling back to scientific notation below 1×10⁻³, so IAW's statistics no longer collapse onto the same rounded figure.

## User

now we want to upload real datasets. give us this feature.

