// The sticky left column of the experiments workspace: experiment / dataset controls,
// spectral filter, smoothing and advanced parameters.

import { useRef } from 'react';
import { DEFAULTS, type Params } from '../../analysis/constants';
import { NumberInput, Seg, Slider } from '../../components/Controls';
import { isSingleFilm, useApp } from '../../state';

const note = (pct = 55) => ({ fontSize: 11, lineHeight: 1.5, color: `color-mix(in srgb,var(--color-text) ${pct}%,transparent)` });

function niceTicks(min: number, max: number, want: number): number[] {
  const span = max - min;
  if (!(span > 0)) return [min];
  const raw = span / want, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max + step * 1e-6; v += step) out.push(Math.abs(v) < step * 1e-6 ? 0 : v);
  return out;
}

export function ControlsColumn() {
  const { state: st, actions, res: r } = useApp();
  const p = st.p, D = st.dataset, up = st.src === 'upload';
  const NS = D ? D.spec.length : 1;
  const lmin = D ? D.lam[0] : 1000, lmax = D ? D.lam[D.lam.length - 1] : 1400, lStep = D ? D.step : 1;
  const S = <K extends keyof Params>(k: K, label: string, min: number, max: number, step: number, fmt: (v: number) => string, value?: number) => (
    <Slider key={k} id={k} label={label} min={min} max={max} step={step} value={value === undefined ? p[k] : value} fmt={fmt} onChange={v => actions.setP(k, v as Params[K])} />
  );

  if (up && !D) return null;

  const busyLabel = st.busy || st.prog ? 'computing…' : st.ms + ' ms · ' + (r ? r.times.length : 0) + ' spectra';
  const noiseRows = [
    { key: 'nzShot' as const, pk: 'noise' as const, label: 'Photon / read noise', unit: '× 10⁻⁴ R', step: 1, scale: 1e4,
      note: 'Per pixel, scaled by √R — the quantum count in each detector element fluctuates.' },
    { key: 'nzLamp' as const, pk: 'lampSd' as const, label: 'Lamp intensity jitter', unit: '%', step: 0.05, scale: 100,
      note: 'One random factor per spectrum, multiplying the whole curve at once.' },
    { key: 'nzStretch' as const, pk: 'stretchSd' as const, label: 'Optical-thickness jitter', unit: 'ppm', step: 1, scale: 1e6,
      note: 'The fringe period itself wanders, as under a drifting temperature.' }
  ];

  return (
    <>
      <div className="card elev-sm" style={{ gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div className="card-kicker">{up ? 'Dataset' : 'Experiment'}</div>
          <div className="sg-num" style={{ fontSize: 11, color: 'color-mix(in srgb,var(--color-text) 50%,transparent)' }}>{busyLabel}</div>
        </div>
        {up ? (
          S('refIdx', 'Reference spectrum', 0, Math.max(0, NS - 1), 1, x => '#' + (Math.round(x) + 1) + (D && D.names[Math.round(x)] ? ' · ' + String(D.names[Math.round(x)]).slice(0, 18) : ''))
        ) : (
          <>
            {S('resp', 'Response magnitude', 0, 1.2, 0.01, x => x.toFixed(2) + ' nm')}
            {S('add', 'Additive baseline drift', 0, 0.05, 0.001, x => x.toFixed(3) + ' R')}
            {S('mult', 'Multiplicative lamp drift', 0, 0.2, 0.005, x => (100 * x).toFixed(1) + ' %')}
          </>
        )}
        {up && (
          <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={{ margin: 0, fontSize: 12 }}>Interval between scans</label>
            <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
              <NumberInput value={p.dtU} min={0} step="any" width={82} accept={q => q > 0} onCommit={q => actions.setDt(q, st.dtUnit)} />
              <Seg name="sgdtu" value={st.dtUnit} fill pad="5px 10px" options={[['s', 'seconds'], ['min', 'minutes']]} onChange={u => actions.setDt(p.dtU, u)} />
            </div>
            <div style={note()}>
              {st.useImported
                ? 'Imported times from the file headers are in use, so this interval is ignored.'
                : 'Spectrum order × this interval, plotted in minutes — ' + ((st.dtUnit === 's' ? p.dtU / 60 : +p.dtU) * Math.max(0, NS - 1)).toFixed(2) + ' min over the whole run.'}
            </div>
          </div>
        )}
        {!up && (
          <>
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ margin: 0, fontSize: 12 }}>Noise sources</label>
              {noiseRows.map(q => (
                <div key={q.key} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, cursor: 'pointer', margin: 0, flex: 1, minWidth: 0, lineHeight: 1.3, color: 'inherit' }}>
                      <input type="checkbox" checked={st[q.key]} onChange={() => actions.edit(s => ({ [q.key]: !s[q.key] }))} style={{ width: 15, height: 15, accentColor: 'var(--color-accent)' }} />
                      {q.label}
                    </label>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                      <NumberInput value={+(p[q.pk] * q.scale).toFixed(3)} min={0} step={q.step} width={76} disabled={!st[q.key]}
                        accept={x => x >= 0} onCommit={x => actions.setP(q.pk, x / q.scale)} />
                      <span style={{ fontSize: 11, color: 'color-mix(in srgb,var(--color-text) 55%,transparent)' }}>{q.unit}</span>
                    </span>
                  </div>
                  <div style={note(52)}>{q.note}</div>
                </div>
              ))}
            </div>
            <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ margin: 0, fontSize: 12 }}>Film model</label>
              <Seg name="sgmodel" value={st.synthModel} pad="5px 10px" fill options={[['cavity', 'Multilayer'], ['single', 'Single layer']]}
                onChange={m => actions.edit(s => ({ synthModel: m, p: { ...s.p, lamMin: m === 'single' ? 1000 : 900, lamMax: m === 'single' ? 1400 : 1700, anaMin: 0, anaMax: 0, eotMin: 8000, eotMax: 25000 } }))} />
              <div style={note()}>
                {st.synthModel === 'single'
                  ? 'One porous layer on silicon — a Fabry–Pérot etalon, so the reflectance is a cosine in 1/λ with no resonance. Generated over 1000–1400 nm.'
                  : 'Two quarter-wave Bragg mirrors around a half-wave defect layer, which opens a narrow resonance inside the stopband. Generated over 900–1700 nm, where the full-stack fringes fall outside that band.'}
              </div>
            </div>
          </>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {!up && <button className="btn btn-secondary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => actions.setP('seed', Math.floor(Math.random() * 1e6) + 1)}>Randomize noise</button>}
          {D && D.importedTimes && (
            <button className="btn btn-secondary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => actions.edit(s => ({ useImported: !s.useImported }))}>
              Use {st.useImported ? 'index × step' : 'imported times'}
            </button>
          )}
          <button className="btn btn-ghost" style={{ fontSize: 12.5 }}
            onClick={() => actions.edit(s => ({ p: { ...DEFAULTS, ...(s.src === 'upload' && s.dataset ? s.dataset.derived : {}) }, sgOn: true, denMode: 'next', convMode: 'theory', dtUnit: 's', nzShot: true, nzLamp: true, nzStretch: true }))}>
            Reset defaults
          </button>
        </div>
      </div>

      <SpectralFilter />

      <div className="card elev-sm" style={{ gap: 12 }}>
        <div className="card-kicker">Smoothing (display only)</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={st.sgOn} onChange={() => actions.edit(s => ({ sgOn: !s.sgOn }))} style={{ width: 16, height: 16, accentColor: 'var(--color-accent)' }} />
          Savitzky–Golay on ESW
        </label>
        {S('sgWin', 'Window length', 5, Math.min(41, Math.max(5, (NS % 2 ? NS : NS - 1))), 2, x => x.toFixed(0) + ' pts')}
        {S('sgPoly', 'Polynomial order', 1, 5, 1, x => x.toFixed(0))}
        <div style={{ ...note(), fontSize: 11.5 }}>The raw ESW vector is always kept and always plotted. Smoothing never feeds a metric unless the row says so.</div>
      </div>

      <div className="card elev-sm" style={{ gap: 10 }}>
        <button className="btn btn-ghost" style={{ justifyContent: 'space-between', padding: 0, fontSize: 13 }} onClick={() => actions.set(s => ({ advOpen: !s.advOpen }))} aria-expanded={st.advOpen}>
          <span>Advanced parameters</span><span>{st.advOpen ? '▾' : '▸'}</span>
        </button>
        {st.advOpen && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 2 }}>
            {/* ESW denominator wavelength, used only when the denominator is "Chosen λ₂". On the
                opposite flank of the resonance from λc the ratio swings hardest per nm of shift;
                far from the resonance ESW degenerates into a lamp-drift monitor. */}
            {S('eswLam2', 'ESW second wavelength λ₂', up ? lmin : 1100, up ? lmax : 1300, up ? lStep : 1, x => x.toFixed(up ? 2 : 0) + ' nm')}
            {/* Bracket for the RIFTS FFT peak search, in nm of effective optical thickness. Peaks
                outside it are ignored, which keeps the tracker off harmonics and off low-frequency
                baseline curvature. It is the shaded band on the Diagnostics FFT plot. */}
            {S('eotMin', 'EOT search minimum', 500, Math.max(1000, p.eotMax), 250, x => (x / 1000).toFixed(2) + ' µm')}
            {S('eotMax', 'EOT search maximum', Math.max(1000, p.eotMin), up ? 120000 : 40000, 250, x => (x / 1000).toFixed(2) + ' µm')}
            {/* Wavelet bandwidth in fringe cycles: σk = nCyc / (4·EOT_ref). Narrow (1–2) tracks fast
                change and tolerates a drifting fringe frequency; wide (3–4) averages more fringes for
                less noise but smears the response and needs more k-span inside the window. */}
            {S('nCyc', 'Morlet width', 1, 4, 0.25, x => x.toFixed(2) + ' cycles')}
            {/* Active only under the empirical conversion: ΔEOT = slope·Δφ + intercept, in nm per
                mrad. Instrument-specific calibration — the defaults are the published example
                values, not universal constants. */}
            {S('slope', 'Empirical slope', 0, 0.05, 0.0005, x => x.toFixed(4) + ' nm/mrad')}
            {S('intercept', 'Empirical intercept', -1, 1, 0.005, x => x.toFixed(3) + ' nm')}
            <div className="field">
              <label style={{ fontSize: 12 }}>ESW denominator</label>
              {/* "Next sample" takes the adjacent spectrometer sample (λ₂ = λc + one grid step),
                  which is self-calibrating against lamp drift; "Chosen λ₂" uses the slider above. */}
              <Seg name="sgden" value={st.denMode} fill options={[['next', 'Next sample'], ['pick', 'Chosen λ₂']]} onChange={v => actions.edit({ denMode: v })} />
            </div>
            <div className="field">
              <label style={{ fontSize: 12 }}>Phase → ΔEOT conversion</label>
              {/* Theoretical divides the unwrapped phase by 2π·mean k, which follows from the fringe
                  physics and needs no calibration; Empirical substitutes the user's own linear fit. */}
              <Seg name="sgconv" value={st.convMode} fill options={[['theory', 'Theoretical'], ['emp', 'Empirical']]} onChange={v => actions.edit({ convMode: v })} />
              <div style={{ ...note(), fontSize: 11.5, marginTop: 6 }}>
                {st.convMode === 'theory'
                  ? 'ΔEOT = Δφ / (2π·mean k), computed from the reciprocal-wavelength grid in use. No calibration constants.'
                  : 'ΔEOT = slope·Δφ + intercept, using the values below. Supply calibration from your own instrument — the published example constants are not universal.'}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Drag-to-select wavelength window over the reference spectrum, plus exact fields. */
function SpectralFilter() {
  const { state: st, actions, res: r } = useApp();
  const p = st.p;
  const brushRef = useRef<{ a: number; b: number } | null>(null);
  if (!r) {
    return (
      <div className="card elev-sm" style={{ gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <div className="card-kicker">Spectral filter</div>
          <span className="sg-num" style={{ fontSize: 12, fontWeight: 600 }}>—</span>
        </div>
      </div>
    );
  }
  const FL = r.fullLam, FR = r.fullRef, RW = 760, RH = 96, RL = 14, RR = 14, RT = 10, RB = 22;
  const la = FL[0], lb = FL[FL.length - 1];
  let fmin = Infinity, fmax = -Infinity;
  for (const y of FR) if (Number.isFinite(y)) { if (y < fmin) fmin = y; if (y > fmax) fmax = y; }
  const rx = (l: number) => RL + (l - la) / ((lb - la) || 1) * (RW - RL - RR);
  const ry = (y: number) => RT + (1 - (y - fmin) / ((fmax - fmin) || 1)) * (RH - RT - RB);
  const skip = Math.max(1, Math.floor(FL.length / 700));
  let d = '';
  for (let i = 0; i < FL.length; i += skip) d += (i ? 'L' : 'M') + rx(FL[i]).toFixed(1) + ' ' + ry(FR[i]).toFixed(1) + ' ';
  const selA = st.brush ? Math.min(st.brush.a, st.brush.b) : (p.anaMin || la);
  const selB = st.brush ? Math.max(st.brush.a, st.brush.b) : (p.anaMax || lb);
  const dlFull = FL.length > 1 ? FL[1] - FL[0] : 1;
  const toLam = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / (rect.width || 1)) * RW;
    return Math.min(lb, Math.max(la, la + (x - RL) / (RW - RL - RR) * (lb - la)));
  };
  const top = RT, bottom = RH - RB, plotH = RH - RT - RB;
  const lcX = rx(Math.min(lb, Math.max(la, p.eswLc)));
  const endBrush = () => {
    const br = brushRef.current; if (!br) return;
    brushRef.current = null;
    const a = Math.min(br.a, br.b), b = Math.max(br.a, br.b);
    actions.set({ brush: null });
    if (b - a > 12 * dlFull) actions.setPs({ anaMin: a, anaMax: b });
  };
  const single = isSingleFilm(st);

  return (
    <div className="card elev-sm" style={{ gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="card-kicker">Spectral filter</div>
        <span className="sg-num" style={{ fontSize: 12, fontWeight: 600 }}>{selA.toFixed(2) + ' – ' + selB.toFixed(2) + ' nm'}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        <svg viewBox={'0 0 ' + RW + ' ' + RH} preserveAspectRatio="none"
          style={{ width: '100%', height: 78, display: 'block', background: '#fdfaf3', border: '1px solid color-mix(in srgb,var(--color-text) 12%,transparent)', borderRadius: 12, cursor: 'crosshair', touchAction: 'none' }}
          onPointerDown={e => {
            const l = toLam(e);
            try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* capture is best-effort */ }
            brushRef.current = { a: l, b: l };
            actions.set({ brush: { a: l, b: l } });
          }}
          onPointerMove={e => {
            if (!brushRef.current) return;
            brushRef.current = { a: brushRef.current.a, b: toLam(e) };
            actions.set({ brush: brushRef.current });
          }}
          onPointerUp={endBrush} onPointerLeave={endBrush}>
          <path d={d} fill="none" stroke="#7a8a5e" strokeWidth={1.1} strokeLinejoin="round" />
          <rect x={RL} y={top} width={Math.max(0, rx(selA) - RL)} height={plotH} fill="#201e1d" fillOpacity={0.12} />
          <rect x={rx(selB)} y={top} width={Math.max(0, RW - RR - rx(selB))} height={plotH} fill="#201e1d" fillOpacity={0.12} />
          <line x1={rx(selA)} y1={top} x2={rx(selA)} y2={bottom} stroke="#c67139" strokeWidth={2} />
          <line x1={rx(selB)} y1={top} x2={rx(selB)} y2={bottom} stroke="#c67139" strokeWidth={2} />
          <line x1={lcX} y1={top} x2={lcX} y2={bottom} stroke="#e33d86" strokeWidth={1.6} strokeDasharray="4 3" />
          {niceTicks(la, lb, 5).map((t, i) => (
            <text key={i} x={rx(t)} y={RH - 6} textAnchor="middle" fontSize={9} fontFamily="Figtree, system-ui, sans-serif" fill="#201e1d" fillOpacity={0.55}>{t.toFixed(0)}</text>
          ))}
        </svg>
        <div style={note(58)} className="sg-num">
          {(selB - selA).toFixed(2) + ' nm wide · ' + (Math.floor((selB - selA) / dlFull) + 1) + ' samples · ' +
            (r.eotRef * (1 / selA - 1 / selB)).toFixed(1) + ' fringe periods' + (p.anaMin || p.anaMax ? '' : ' · full range')}
        </div>
        <Slider id="anaMin" label="Filter from" min={la} max={lb} step={dlFull} value={selA} fmt={x => x.toFixed(2) + ' nm'} onChange={v => actions.setP('anaMin', v)} />
        <Slider id="anaMax" label="Filter to" min={la} max={lb} step={dlFull} value={selB} fmt={x => x.toFixed(2) + ' nm'} onChange={v => actions.setP('anaMax', v)} />
        <Slider id="eswLc" label="ESW wavelength λc" min={la} max={lb} step={dlFull} value={p.eswLc} fmt={x => x.toFixed(2) + ' nm'} onChange={v => actions.setP('eswLc', v)} />
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ fontSize: 11.5, padding: '5px 11px' }} onClick={() => actions.setPs({ anaMin: 0, anaMax: 0 })}>Full range</button>
          <button className="btn btn-secondary" style={{ fontSize: 11.5, padding: '5px 11px' }} onClick={() => actions.setPs({ anaMin: la + (lb - la) * 0.05, anaMax: lb - (lb - la) * 0.05 })}>Trim 5 % edges</button>
          <button className="btn btn-secondary" style={{ fontSize: 11.5, padding: '5px 11px' }} onClick={() => actions.setPs({ anaMin: Math.max(la, p.eswLc - (lb - la) * 0.2), anaMax: Math.min(lb, p.eswLc + (lb - la) * 0.2) })}>Around feature</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" style={{ fontSize: 11.5, padding: '5px 11px' }} onClick={actions.autoLc}
            title={single ? 'Move the ESW wavelength to the fringe minimum nearest the middle of the analysis window' : 'Move the ESW wavelength to the deepest reflectance minimum in the analysis window'}>
            Find minimum
          </button>
        </div>
        <div style={note()}>{'ESW wavelength λc = ' + (+p.eswLc).toFixed(2) + ' nm — ' + (single ? 'fringe minimum nearest the window centre' : 'sharpest reflectance notch') + '. Drag the pink marker on the Spectra plot, set it here, or use Find minimum.'}</div>
        <div style={note()}>Drag across the spectrum to choose the wavelength window. Every method — ESW, IAW, RIFTS and Morlet phase — sees only this window.</div>
      </div>
    </div>
  );
}
