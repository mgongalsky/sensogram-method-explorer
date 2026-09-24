// Result tabs of the experiments workspace: Spectra, Sensograms, Overview, Diagnostics
// and Export.

import { NK, NPAD, type Params } from '../../analysis/constants';
import type { AnalysisResult, Series, SeriesKey } from '../../analysis/types';
import { NumberRange, Seg, Tag } from '../../components/Controls';
import { Plot, type PlotBand, type PlotSpec } from '../../components/Plot';
import { diagnosticsCsv, download, paramsJson, resultsCsv } from '../../io/exportResults';
import { useApp, type AppState } from '../../state';
import { noteStyle } from './DataTab';

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;
const fmt = (v: number, d: number) => Number.isFinite(v) ? v.toFixed(d) : '—';

/** Shared derived values: time units and precision, interval bands, series lookup. */
function useResultView(r: AnalysisResult) {
  const { state: st, actions, compact } = useApp();
  const p = st.p, up = st.src === 'upload';
  const tv = r.times, tA = tv[0], tB = tv[tv.length - 1];
  const tStep = tv.length > 1 ? Math.abs(tv[1] - tv[0]) || 1 : 1;
  // label precision follows the scan spacing so sub-minute windows stay readable
  const tDec = tStep >= 10 ? 0 : tStep >= 1 ? 1 : tStep >= 0.1 ? 2 : 3;
  const U = up && st.useImported ? 'u' : 'min';
  const hMain = compact ? 240 : 300, hSmall = compact ? 200 : 240;
  const S = (k: SeriesKey) => r.series.find(s => s.key === k) as Series;
  const onBand = (key: string, a: number, b: number) => {
    const q = (x: number) => +(+x).toFixed(2);
    if (key === 'base') actions.setPs({ baseA: q(a), baseB: q(b) });
    else actions.setPs({ respA: q(a), respB: q(b) });
  };
  const bands: PlotBand[] = [
    { key: 'base', label: 'Baseline', a: p.baseA, b: p.baseB, fill: 'rgba(122,138,94,0.12)', edge: '#7a8a5e' },
    { key: 'resp', label: 'Response', a: p.respA, b: p.respB, fill: 'rgba(198,113,57,0.10)', edge: '#c67139' }
  ];
  const j = Math.min(st.timeIdx, r.n - 1);
  const tf = (x: number) => (+x).toFixed(tDec);
  const timeLabel = 't = ' + tf(r.times[j]) + ' ' + U + '  (spectrum ' + (j + 1) + ' of ' + r.n + (r.names && r.names[j] ? ' · ' + String(r.names[j]).slice(0, 28) : '') + ')';
  const baseWinLabel = (+p.baseA).toFixed(tDec) + '–' + (+p.baseB).toFixed(tDec) + ' ' + U;
  const respWinLabel = (+p.respA).toFixed(tDec) + '–' + (+p.respB).toFixed(tDec) + ' ' + U;
  return { st, p, up, tA, tB, tStep, tDec, U, hMain, hSmall, S, onBand, bands, j, tf, timeLabel, baseWinLabel, respWinLabel };
}

export function SpectraTab({ r }: { r: AnalysisResult }) {
  const { actions, C } = useApp();
  const { st, p, hMain, j, tf, U, timeLabel } = useResultView(r);
  const refI = r.refI;
  const kx = r.kg.map(k => k * 1e4);
  const isK = st.axis === 'k';
  const asX = isK ? kx : r.lam;
  const rowOf = (i: number) => isK ? r.kSig[i] : r.spec[i];
  const plot: PlotSpec = {
    title: isK ? 'Baseline-removed spectra against reciprocal wavelength' : 'Measured reflectance spectra',
    note: isK ? 'uniform k grid, ' + NK + ' samples, linear trend removed' : r.lam[0].toFixed(2) + '–' + r.lam[r.lam.length - 1].toFixed(2) + ' nm at ' + r.dl.toFixed(3) + ' nm',
    x: asX,
    series: [
      { y: rowOf(refI), x: asX, color: C.ref, label: 'Reference — #' + (refI + 1), width: 1.8 },
      { y: rowOf(j), x: asX, color: C.cur, label: 'Current — ' + tf(r.times[j]) + ' ' + U, width: 1.8 }],
    xlabel: isK ? '1/λ  (10⁻⁴ nm⁻¹)' : 'Wavelength (nm)',
    ylabel: isK ? 'Reflectance (detrended)' : 'Reflectance',
    vlines: isK ? [] : [{ key: 'esw', x: p.eswLc, color: C.eswSm, label: 'λc' }],
    onVline: (_k, x) => actions.setP('eswLc', +x.toFixed(3)), h: hMain + 40
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 14 }}>
        <Plot plot={plot} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 240, display: 'flex', flexDirection: 'column', gap: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
              <span>Time point</span><span className="sg-num" style={{ fontWeight: 600 }}>{timeLabel}</span>
            </div>
            <input className="sg-range" type="range" min={0} max={r.n - 1} step={1} value={j} onChange={e => actions.set({ timeIdx: +e.target.value })} aria-label="Time point" />
          </div>
          <Seg name="sgax" value={st.axis} size={12.5} pad="6px 14px" options={[['lambda', 'λ'], ['k', '1/λ']]} onChange={v => actions.set({ axis: v })} />
        </div>
      </div>
    </div>
  );
}

export function SensTab({ r }: { r: AnalysisResult }) {
  const { actions, C, showTruth } = useApp();
  const { p, hSmall, S, onBand, bands, U, tA, tB, tStep } = useResultView(r);
  const truth = showTruth && r.hasTruth && r.truthE;
  const defs = [
    { title: 'ESW — I(λc) / I(λnext)', ylabel: 'ΔESW (ratio)', note: 'λc = ' + r.lamUsed[0].toFixed(2) + ' nm, λ₂ = ' + r.lamUsed[1].toFixed(2) + ' nm',
      s: [{ y: S('eswRaw').y, color: C.eswRaw, label: 'Raw ESW (always preserved)', width: 1.2 }, r.sgApplied ? { y: S('eswSm').y, color: C.eswSm, label: 'Savitzky–Golay ' + p.sgWin + '/' + p.sgPoly, width: 2.1 } : null] },
    { title: 'IAW — mean |zeroed interferogram|', ylabel: 'IAW (reflectance)', note: 'trapezoidal integration over λ',
      s: [{ y: S('iaw').y, color: C.iaw, label: 'IAW', width: 1.9 }] },
    { title: 'RIFTS ΔEOT from the FFT peak', ylabel: 'ΔEOT (nm)', note: 'parabolic peak refinement, no heavy zero-padding',
      s: [{ y: S('rifts').y, color: C.rifts, label: 'RIFTS', width: 1.5 }, truth ? { y: truth, color: C.truth, label: 'Simulated ΔEOT', width: 1.5, dash: '6 4' } : null] },
    { title: 'Morlet wavelet phase ΔEOT', ylabel: 'ΔEOT (nm)', note: p.nCyc.toFixed(2) + '-cycle wavelet at ' + (r.eotRef / 1000).toFixed(3) + ' µm',
      s: [{ y: S('mwp').y, color: C.mwp, label: 'MWP / LAMP', width: 2.1 }, truth ? { y: truth, color: C.truth, label: 'Simulated ΔEOT', width: 1.5, dash: '6 4' } : null] }
  ];
  const win: [keyof Params, string][] = [['baseA', 'Baseline start'], ['baseB', 'Baseline end'], ['respA', 'Response start'], ['respB', 'Response end']];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(420px,100%),1fr))', gap: 18 }}>
        {defs.map((d, i) => (
          <div key={i} className="card elev-sm" style={{ padding: 'var(--space-3)', minWidth: 0 }}>
            <Plot plot={{ title: d.title, note: d.note, x: r.times, series: d.s, xlabel: 'Time (' + U + ')', ylabel: d.ylabel, bands, onBand, h: hSmall }} />
          </div>
        ))}
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 10 }}>
        <div className="card-kicker">Intervals</div>
        <div style={{ fontSize: 12, lineHeight: 1.55, color: muted(60), maxWidth: '62em' }}>The sage band is the buffer pre-run the baseline is taken over; the terracotta band is the rinse window the response is read from. Type exact minutes here, or drag either band’s edges directly on the sensograms above.</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 14 }}>
          {win.map(([k, label]) => (
            <NumberRange key={k} label={label} min={tA} max={tB} step={tStep} value={p[k]} unit={U} onChange={v => actions.setP(k, v)} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function OverviewTab({ r }: { r: AnalysisResult }) {
  const { C, showTruth, state } = useApp();
  const { st, p, up, hMain, S, onBand, bands, U, baseWinLabel, respWinLabel } = useResultView(r);
  const normSeries = [
    { y: S('eswRaw').norm, color: C.eswRaw, label: 'ESW raw', width: 1.2, opacity: 0.85 },
    st.sgOn ? { y: S('eswSm').norm, color: C.eswSm, label: 'ESW smoothed', width: 2 } : null,
    { y: S('iaw').norm, color: C.iaw, label: 'IAW', width: 1.8 },
    { y: S('rifts').norm, color: C.rifts, label: 'RIFTS ΔEOT', width: 1.5 },
    { y: S('mwp').norm, color: C.mwp, label: 'Morlet phase ΔEOT', width: 2.2 },
    showTruth && r.hasTruth && r.truthNorm ? { y: r.truthNorm, color: C.truth, label: 'Simulated', width: 1.6, dash: '6 4' } : null
  ];
  const warnCount = warnCountLabel(r);
  const mwpS = S('mwp');
  const summary = [
    { kicker: up ? 'Loaded data' : 'Dataset', value: r.n + ' spectra', note: r.lam[0].toFixed(2) + '–' + r.lam[r.lam.length - 1].toFixed(2) + ' nm · ' + r.lam.length + ' samples · Δt ' + (up ? (st.useImported ? 'imported' : (st.dtUnit === 's' ? (+p.dtU / 60) : +p.dtU).toFixed(3) + ' min') : p.dt + ' min') },
    { kicker: 'Optical thickness', value: (r.eotRef / 1000).toFixed(3) + ' µm', note: r.cycles.toFixed(1) + ' fringe periods in the analysis window' },
    { kicker: 'MWP response', value: fmt(mwpS.response, 3) + ' nm', note: 'ΔEOT from ' + baseWinLabel + ' to ' + respWinLabel },
    { kicker: 'RIFTS response', value: fmt(S('rifts').response, 2) + ' nm', note: 'ΔEOT over the same two windows' },
    { kicker: 'Warnings', value: warnCount, note: state.busy ? 'recomputing' : 'see the Diagnostics tab' }
  ];
  const verdict = r.hasTruth
    ? ('Morlet phase reconstructs the simulated ΔEOT to ' + fmt(mwpS.rmse ?? NaN, 3) + ' nm across this run, where RIFTS manages ' +
      fmt(S('rifts').rmse ?? NaN, 2) + ' nm — the same fringes, read at two resolutions. ESW and IAW carry no EOT unit at all, so they are shapes to compare, not numbers to rank.')
    : ('These are measured spectra, so there is no simulated response to score against. Between ' + baseWinLabel + ' and ' + respWinLabel +
      ', Morlet phase reports ' + fmt(mwpS.response, 3) + ' nm of ΔEOT against ' + fmt(S('rifts').response, 2) +
      ' nm from RIFTS; where the two disagree strongly, check the FFT peak and the phase-cycle correction in Diagnostics before trusting either.');

  // ---- per-spectrum computation cost ----
  const tm = r.timingMeta, rows = r.timing;
  const sig3 = (val: number, unit: string) => (val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)) + ' ' + unit;
  const fmtMs = (ms: number) => !(ms > 0) ? '—' : ms >= 1 ? sig3(ms, 'ms') : ms >= 1e-3 ? sig3(ms * 1e3, 'µs') : sig3(ms * 1e6, 'ns');
  const fmtShare = (q: number) => q >= 10 ? q.toFixed(0) + '%' : q >= 1 ? q.toFixed(1) + '%' : q >= 0.01 ? q.toFixed(2) + '%' : '<0.01%';
  const worst = Math.max(...rows.map(q => q.ms)) || 1;
  const grid = { display: 'grid', gridTemplateColumns: 'minmax(130px,1.1fr) minmax(60px,1fr) 78px 54px', alignItems: 'center', gap: 10 } as const;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 12 }}>
        {summary.map((s, i) => (
          <div key={i} className="card elev-sm" style={{ padding: 'var(--space-3)', gap: 5 }}>
            <div className="card-kicker">{s.kicker}</div>
            <div className="sg-num" style={{ fontSize: 23, fontWeight: 600, lineHeight: 1.1 }}>{s.value}</div>
            <div style={{ fontSize: 11.5, lineHeight: 1.5, color: muted(58) }}>{s.note}</div>
          </div>
        ))}
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)' }}>
        <Plot plot={{
          title: 'All methods, baseline-centred and normalized to the response window',
          note: 'drag the sage and terracotta edges to set the buffer pre-run and the rinse window',
          x: r.times, series: normSeries, xlabel: 'Time (' + U + ')', ylabel: 'Normalized response', bands, onBand, h: hMain, ymin: -0.45, ymax: 1.45
        }} />
      </div>
      <div className="card elev-sm" style={{ gap: 12, padding: 'var(--space-4)' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div className="card-kicker">Computation cost per spectrum</div>
          <div className="sg-num" style={{ fontSize: 12, color: muted(58) }}>{fmtMs(tm.fastest.ms) + ' to ' + fmtMs(tm.slowest.ms) + ' per spectrum'}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div style={{ ...grid, fontSize: 10.5, letterSpacing: '0.04em', textTransform: 'uppercase', color: muted(45) }}>
            <span>Method</span><span /><span style={{ textAlign: 'right' }}>Per spectrum</span><span style={{ textAlign: 'right' }}>Share</span>
          </div>
          {rows.map(q => {
            const color = C[q.color] || C.truth;
            return (
              <div key={q.key} style={grid}>
                <span style={{ display: 'flex', alignItems: 'flex-start', gap: 7, minWidth: 0 }}>
                  <span className="sg-dot" style={{ width: 10, height: 10, background: color, marginTop: 4 }} />
                  <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                    <span style={{ fontSize: 12.5, lineHeight: 1.3 }}>{q.label}</span>
                    <span style={{ fontSize: 11, lineHeight: 1.35, color: muted(50) }}>{q.note}</span>
                  </span>
                </span>
                <span style={{ height: 8, borderRadius: 999, background: muted(8), overflow: 'hidden', display: 'block' }}>
                  <span style={{ display: 'block', height: '100%', borderRadius: 999, width: Math.max(1.5, 100 * q.ms / worst) + '%', background: color }} />
                </span>
                <span className="sg-num" style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right' }}>{fmtMs(q.ms)}</span>
                <span className="sg-num" style={{ fontSize: 11.5, textAlign: 'right', color: muted(52) }}>{fmtShare(q.share)}</span>
              </div>
            );
          })}
        </div>
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 8 }}>
        <div className="card-kicker">What this run shows</div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.65, textWrap: 'pretty' }}>{verdict}</p>
      </div>
    </div>
  );
}

function warnCountLabel(r: AnalysisResult): string {
  const c = r.warn.filter(w => w.level !== 'ok').length;
  return c + ' item' + (c === 1 ? '' : 's');
}

export function DiagTab({ r }: { r: AnalysisResult }) {
  const { actions, C, state } = useApp();
  const { p, hSmall, j, timeLabel } = useResultView(r);
  const d = r.riftsAll[j], md = r.mwDiag[j];
  const magJ = actions.magFor(j) || new Float64Array(0);
  const eAxis: number[] = [], eMag: number[] = [];
  for (let i = 1; i < NPAD / 2; i++) {
    const e = i / (NPAD * r.dk);
    if (e > Math.min(2000, p.eotMin * 0.4) && e < p.eotMax * 1.6) { eAxis.push(e / 1000); eMag.push(magJ[i]); }
  }
  const fftPlot: PlotSpec = {
    title: 'FFT power against effective optical thickness',
    note: 'Hann window · peak refined to ' + fmt(d.eot / 1000, 4) + ' µm',
    x: eAxis, series: [{ y: eMag, color: C.rifts, width: 1.4 }],
    bands: [{ key: 'eot', label: 'EOT search', a: p.eotMin / 1000, b: p.eotMax / 1000, fill: 'rgba(204,121,167,0.10)', edge: '#cc79a7' }],
    onBand: (_key, a, b) => { const lo = Math.max(500, Math.round(a * 1000)); actions.setPs({ eotMin: lo, eotMax: Math.max(lo + 500, Math.round(b * 1000)) }); },
    vlines: [{ x: d.eot / 1000, color: C.mwp }],
    xlabel: 'EOT (µm)', ylabel: 'Amplitude', h: hSmall, legend: false
  };
  const dphiK = actions.phaseKFor(j) || [];
  const phX: number[] = [], phY: number[] = [];
  for (let i = r.lo; i < r.hi; i++) { phX.push(r.kg[i] * 1e4); phY.push(Number.isFinite(dphiK[i]) ? dphiK[i] * 1000 : NaN); }
  const phasePlot: PlotSpec = {
    title: 'Morlet phase difference, sample against reference',
    note: 'edges excluded · weighted mean ' + fmt(md.dphi * 1000, 2) + ' mrad',
    x: phX,
    series: [{ y: phY, color: C.mwp, label: 'Δφ(k)', width: 1.4 }, { y: phX.map(() => md.dphi * 1000), color: C.truth, label: 'Weighted mean', width: 1.4, dash: '5 4' }],
    xlabel: '1/λ  (10⁻⁴ nm⁻¹)', ylabel: 'Δφ (mrad)', h: hSmall
  };
  const diagRows = [
    { label: 'Refined dominant EOT', value: fmt(d.eot / 1000, 4) + ' µm' },
    { label: 'FFT peak amplitude', value: fmt(d.amp, 3) },
    { label: 'Peak width (FWHM)', value: fmt(d.width, 0) + ' nm EOT' },
    { label: 'Peak / out-of-band', value: fmt(d.snr, 1) + '×' },
    { label: 'Raw mean Δφ', value: fmt(md.dphi * 1000, 3) + ' mrad' },
    { label: 'Phase-cycle correction', value: md.nCycCorr + ' × 2π' },
    { label: 'k samples used', value: md.used + ' of ' + (r.hi - r.lo) },
    { label: 'Final MWP ΔEOT', value: fmt(md.dEOT, 3) + ' nm' },
    { label: 'Confidence', value: md.conf },
    { label: r.hasTruth ? 'Simulated ΔEOT' : 'RIFTS ΔEOT', value: r.hasTruth && r.truthE ? fmt(r.truthE[j], 3) + ' nm' : fmt(r.rifts[j], 3) + ' nm' }
  ];
  const eotFields: [string, number, number, number, (v: number) => void][] = [
    ['EOT from', 0.5, Math.max(1, p.eotMax / 1000), +(p.eotMin / 1000).toFixed(2), v => actions.setP('eotMin', Math.max(500, v * 1000))],
    ['EOT to', Math.max(1, p.eotMin / 1000), 120, +(p.eotMax / 1000).toFixed(2), v => actions.setP('eotMax', v * 1000)]
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(420px,100%),1fr))', gap: 18 }}>
        <div className="card elev-sm" style={{ padding: 'var(--space-3)', gap: 10, minWidth: 0 }}>
          <Plot plot={fftPlot} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12 }}>
            {eotFields.map(([label, min, max, value, set]) => (
              <NumberRange key={label} label={label} min={min} max={max} step={0.25} value={value} unit="µm" onChange={set} inputWidth={78} />
            ))}
          </div>
          <div style={{ fontSize: 12, lineHeight: 1.55, color: muted(62) }}>The shaded band is the EOT search range: only peaks inside it are tracked. Drag its edges on the plot or type the bounds here.</div>
        </div>
        <div className="card elev-sm" style={{ padding: 'var(--space-3)', gap: 10, minWidth: 0 }}>
          <Plot plot={phasePlot} />
          <div style={{ fontSize: 12, lineHeight: 1.55, color: muted(62) }}>The green curve shows phase differences across the spectrum; the dashed line is their weighted mean. A smooth curve, including a gentle slope, is expected. If jumps or strong irregularities appear, check the wavelength window and EOT range, then verify that small changes to these settings do not substantially alter the result.</div>
        </div>
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 12 }}>
        <div className="card-kicker">Per-spectrum diagnostics — {timeLabel}</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(190px,1fr))', gap: 12 }}>
          {diagRows.map((dr, i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 0', borderTop: '1px solid ' + muted(10) }}>
              <span style={{ fontSize: 11.5, color: muted(55) }}>{dr.label}</span>
              <span className="sg-num" style={{ fontSize: 15 }}>{dr.value}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 10 }}>
        <div className="card-kicker">Validation &amp; warnings — {warnCountLabel(r)}</div>
        {r.warn.map((w, i) => {
          const s = noteStyle(w, false);
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
              <Tag level={s.level} bg={s.bg} fg={s.fg} /><span>{w.text}</span>
            </div>
          );
        })}
      </div>
      <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 8 }}>
        <button className="sg-disclose" onClick={() => actions.set(s => ({ paramsOpen: !s.paramsOpen }))} aria-expanded={state.paramsOpen}>
          <span className="card-kicker">Parameters used</span>
          <span className="sg-num" style={{ fontSize: 11, color: muted(55) }}>{state.paramsOpen ? '▾ hide' : '▸ show'}</span>
        </button>
        {state.paramsOpen && (
          <pre className="sg-num sg-mono" style={{ margin: 0, fontSize: 11.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', color: muted(78) }}>{paramsJson(state, r)}</pre>
        )}
      </div>
    </div>
  );
}

export function ExportTab({ r, st }: { r: AnalysisResult; st: AppState }) {
  const card = { gap: 12, padding: 'var(--space-4)' } as const;
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(280px,100%),1fr))', gap: 18 }}>
      <div className="card elev-sm" style={card}>
        <div className="card-kicker">results.csv</div>
        <div className="card-title">One row per time point</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>Time, raw ESW, smoothed ESW, IAW, RIFTS ΔEOT, Morlet ΔEOT, the simulated response and a warning column.</p>
        <button className="btn btn-primary" onClick={() => download('results.csv', resultsCsv(r, st), 'text/csv')}>Download CSV</button>
      </div>
      <div className="card elev-sm" style={card}>
        <div className="card-kicker">parameters.json</div>
        <div className="card-title">Everything needed to reproduce</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>Data provenance — synthetic seed or the loaded file names and common grid — plus the spectral filter, reference spectrum, smoothing settings, EOT search window and phase-conversion mode.</p>
        <button className="btn btn-primary" onClick={() => download('parameters.json', paramsJson(st, r), 'application/json')}>Download JSON</button>
      </div>
      <div className="card elev-sm" style={card}>
        <div className="card-kicker">diagnostics.csv</div>
        <div className="card-title">Per-spectrum FFT and phase</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>Refined dominant EOT, peak amplitude and width, raw mean phase difference, applied phase-cycle correction and the confidence flag for every spectrum.</p>
        <button className="btn btn-secondary" onClick={() => download('diagnostics.csv', diagnosticsCsv(r), 'text/csv')}>Download CSV</button>
      </div>
      <div className="card" style={{ gap: 10, padding: 'var(--space-4)', background: 'var(--color-accent-2-100)' }}>
        <div className="card-kicker" style={{ color: 'var(--color-accent-2-800)' }}>Plots</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6 }}>Every figure carries a save button in its toolbar — the download icon writes a 2× PNG of that figure exactly as shown, zoom and all. For a vector copy, print the page to PDF.</p>
      </div>
    </div>
  );
}
