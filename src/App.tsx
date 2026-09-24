import { useEffect, useRef, useState } from 'react';
import { DEFAULTS, pick } from './analysis/constants';
import { fftMag, phaseDiff } from './analysis/kdomain';
import { heavyKey, refreshWindows, runAnalysis } from './analysis/pipeline';
import { pickLc, synth, type FilmModel } from './analysis/synthetic';
import type { AnalysisResult, Note } from './analysis/types';
import { FIGURE_SETTINGS, PALETTES } from './content/methods';
import { unzip, inflateRaw } from './io/unzip';
import { ingest, type RawFile } from './io/validateSpectra';
import { ExperimentsPage } from './pages/ExperimentsPage';
import { HomePage } from './pages/HomePage';
import { MethodsPage } from './pages/MethodsPage';
import { Ctx, INITIAL_STATE, isSingleFilm, type Actions, type AppState, type Patch, type Tab } from './state';

const toTop = () => requestAnimationFrame(() => window.scrollTo(0, 0));

export function App() {
  const [state, setState] = useState<AppState>(INITIAL_STATE);
  const stateRef = useRef(state);
  stateRef.current = state;
  const resRef = useRef<AnalysisResult | null>(null);
  const demoResRef = useRef<AnalysisResult | null>(null);
  const heavyKeyRef = useRef<string | null>(null);
  const tokenRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const magCache = useRef<{ r: AnalysisResult | null; j: number; v: Float64Array | null }>({ r: null, j: -1, v: null });
  const phCache = useRef<{ r: AnalysisResult | null; j: number; v: number[] | null }>({ r: null, j: -1, v: null });

  const set = (patch: Patch) => setState(prev => {
    const next = { ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) };
    stateRef.current = next;
    return next;
  });

  async function compute() {
    const token = ++tokenRef.current;
    const t0 = performance.now();
    const st = stateRef.current;
    const r = resRef.current;
    if (r && heavyKeyRef.current && heavyKeyRef.current === heavyKey(st)) {
      // only the intervals changed: re-derive statistics against the cached arrays
      refreshWindows(r, st.p, st.sgOn);
      set({ ms: Math.round(performance.now() - t0), prog: null, busy: false });
      return;
    }
    const out = await runAnalysis(st, {
      onProgress: prog => { if (tokenRef.current === token) set({ prog }); },
      cancelled: () => tokenRef.current !== token
    });
    if (tokenRef.current !== token) return;
    if (!out) {
      resRef.current = null;
      set({ ms: 0, prog: null, busy: false });
      return;
    }
    resRef.current = out;
    heavyKeyRef.current = heavyKey(st);
    if (st.src === 'synth') demoResRef.current = out;
    set(s => ({ ms: Math.round(performance.now() - t0), prog: null, busy: false, timeIdx: Math.min(s.timeIdx, out.n - 1) }));
  }

  const schedule = () => {
    clearTimeout(timerRef.current);
    set({ busy: true });
    timerRef.current = setTimeout(() => { void compute(); }, 50);
  };

  useEffect(() => {
    void compute();
    return () => clearTimeout(timerRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyIngest = (raw: RawFile[], pre: Note[], kind: FilmModel) => {
    const st = stateRef.current;
    const out = ingest(raw, pre, kind, st.dtUnit);
    if (!out.ok) {
      set({ report: out.report, dataset: null, parsing: false, files: [] });
      return;
    }
    const n = out.dataset.spec.length;
    set(s => ({
      report: out.report, parsing: false, progress: '', useImported: !!out.dataset.importedTimes,
      dataset: out.dataset, files: out.files, timeIdx: n - 1, tab: 'overview',
      p: { ...s.p, ...out.dataset.derived, sgWin: Math.min(s.p.sgWin, n % 2 === 1 ? n : n - 1) }
    }));
    schedule();
  };

  const actions: Actions = {
    set,
    edit: patch => { set(patch); schedule(); },
    setP: (k, v) => { set(s => ({ p: { ...s.p, [k]: v } })); schedule(); },
    setPs: obj => { set(s => ({ p: { ...s.p, ...obj } })); schedule(); },
    // The baseline and response windows are stored in minutes, so changing the scan
    // interval has to carry them along or they stop matching the run they describe.
    setDt: (val, unit) => {
      const st = stateRef.current, oldMin = (st.dtUnit === 's' ? st.p.dtU / 60 : st.p.dtU) || 1;
      const newMin = (unit === 's' ? val / 60 : val) || 1, k = newMin / oldMin;
      actions.edit(s => ({ dtUnit: unit, p: { ...s.p, dtU: val, baseA: s.p.baseA * k, baseB: s.p.baseB * k, respA: s.p.respA * k, respB: s.p.respB * k } }));
    },
    cancelRun: () => { tokenRef.current++; set({ prog: null, busy: false }); },

    handleFiles: (fileList, kind) => {
      const files = Array.from(fileList || []);
      if (!files.length) return;
      set({ filmKind: kind, parsing: true, drag: null, report: [], progress: 'Reading ' + files.length + ' file' + (files.length === 1 ? '' : 's') + '…' });
      void (async () => {
        const raw: RawFile[] = [], pre: Note[] = [], dec = new TextDecoder();
        try {
          for (const f of files) {
            if (/\.zip$/i.test(f.name)) {
              const { entries, skipped } = await unzip(f);
              if (!entries.length) { pre.push({ level: 'error', text: f.name + ' — no TXT, CSV, TSV, DAT, ASC, PRN or XY entries inside the archive.' }); continue; }
              pre.push({ level: 'ok', text: f.name + ' — ' + entries.length + ' spectrum file' + (entries.length === 1 ? '' : 's') + ' expanded in this browser' + (skipped ? ', ' + skipped + ' non-spectral entr' + (skipped === 1 ? 'y' : 'ies') + ' ignored' : '') + '.' });
              for (let i = 0; i < entries.length; i++) {
                const en = entries[i];
                const bytes = en.method === 0 ? en.data : await inflateRaw(en.data);
                raw.push({ name: en.name, text: dec.decode(bytes) });
                if (i % 40 === 0) set({ progress: 'Expanding ' + f.name + ' — ' + (i + 1) + ' of ' + entries.length + '…' });
              }
            } else {
              let text = '';
              try { text = await f.text(); } catch { text = ''; }
              raw.push({ name: f.name, text });
            }
          }
        } catch (err) {
          set({ parsing: false, progress: '', dataset: null, report: [{ level: 'error', text: 'Could not read the archive — ' + (err instanceof Error ? err.message : String(err)) }] });
          return;
        }
        set({ progress: 'Parsing ' + raw.length + ' spectra…' });
        setTimeout(() => applyIngest(raw, pre, kind), 16);
      })();
    },

    loadBundled: (id, kind) => {
      if (stateRef.current.parsing) return;
      set({ filmKind: kind, parsing: true, progress: 'Loading the bundled example…' });
      void (async () => {
        try {
          const res = await fetch(import.meta.env.BASE_URL + 'examples/' + id + '.json');
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const d = await res.json() as { label: string; file: string; note: string; lam: number[]; spec: number[][]; names: string[] };
          const pre: Note[] = [{ level: 'ok', text: d.label + ' (' + d.file + ') — ' + d.note }];
          applyIngest(d.spec.map((row, j) => ({
            name: d.names[j],
            text: '# ' + d.file + ' — two columns: wavelength (nm), intensity (counts)\nwavelength\tintensity\n' + d.lam.map((l, i) => l + '\t' + row[i]).join('\n')
          })), pre, kind);
        } catch (e) {
          set({
            parsing: false, progress: '',
            report: [{ level: 'error', text: 'The bundled example could not be loaded (' + (e instanceof Error ? e.message : String(e)) + '). Open the page over http rather than from the file system, or drop your own spectra.' }]
          });
        }
      })();
    },

    // exports the synthetic demo as two-column text files and feeds it through the
    // upload path, so the whole parser and validator can be seen working
    loadSyntheticAsUpload: () => {
      const st = stateRef.current;
      const s = synth({ ...DEFAULTS, nSpec: 61, dt: 3 }, st.synthModel, st);
      applyIngest(s.spec.map((row, j) => ({
        name: 'spectrum' + (j + 1) + '.txt',
        text: '# exported demo — two columns: wavelength (nm), reflectance\n% acquired at t = ' + (j * 3) + ' min\nwavelength\treflectance\n' +
          s.lam.map((l, i) => l.toFixed(1) + '\t' + row[i].toFixed(6)).join('\n')
      })), [], st.filmKind);
    },

    clearData: () => {
      resRef.current = null; heavyKeyRef.current = null; tokenRef.current++;
      set(s => ({ dataset: null, files: [], report: [], tab: 'data', prog: null, busy: false, ms: 0, p: { ...s.p, anaMin: 0, anaMax: 0 } }));
    },

    reorder: (kind, i = 0) => {
      const d = stateRef.current.dataset; if (!d) return;
      const order = d.spec.map((_, q) => q);
      if (kind === 'reverse') order.reverse();
      else if (kind === 'up' && i > 0) { order[i] = i - 1; order[i - 1] = i; }
      else if (kind === 'down' && i < order.length - 1) { order[i] = i + 1; order[i + 1] = i; }
      else if (kind === 'remove') { if (order.length < 3) return; order.splice(i, 1); }
      else return;
      const files = stateRef.current.files;
      set({
        dataset: { ...d, spec: order.map(q => d.spec[q]), names: order.map(q => d.names[q]), importedTimes: d.importedTimes ? order.map(q => (d.importedTimes as number[])[q]) : null },
        files: order.map(q => ({ name: d.names[q], meta: files[q] ? files[q].meta : '' }))
      });
      schedule();
    },

    autoLc: () => {
      const r = resRef.current; if (!r) return;
      const lam = r.lam, ref = r.spec[r.refI];
      if (lam.length < 5) return;
      const mi = pickLc(lam, ref, isSingleFilm(stateRef.current));
      actions.setP('eswLc', +lam[mi].toFixed(3));
    },

    // Any navigation to a different page lands at the top, so the page's heading and main
    // figure are what the reader sees first. In-page switches keep the scroll position.
    goHome: () => { set({ view: 'home' }); toTop(); },
    goMethods: () => { set({ view: 'methods' }); toTop(); },
    goExp: () => { actions.edit(s => ({ view: 'exp', tab: 'spectra', src: 'synth', p: { ...s.p, ...pick(DEFAULTS) } })); toTop(); },
    goExpUpload: () => { actions.edit(s => ({ view: 'exp', src: 'upload', tab: s.dataset ? 'overview' : 'data' })); toTop(); },
    goTab: (t: Tab) => {
      const nav = stateRef.current.view !== 'exp' || stateRef.current.tab !== t;
      set({ view: 'exp', tab: t });
      if (nav) toTop();
    },

    magFor: j => {
      const r = resRef.current; if (!r) return null;
      const c = magCache.current;
      if (c.r !== r || c.j !== j) magCache.current = { r, j, v: fftMag(r.kSig[j], r.hann) };
      return magCache.current.v;
    },
    phaseKFor: j => {
      const r = resRef.current; if (!r) return null;
      const c = phCache.current;
      if (c.r !== r || c.j !== j) phCache.current = { r, j, v: phaseDiff(r.kSig[j], r.Wre, r.Wim, r.yr, r.lo, r.hi, r.mmax, true).dphiK };
      return phCache.current.v;
    }
  };

  const up = state.src === 'upload', D = state.dataset;
  const tabs: [Tab, string][] = (up ? [['data', D ? 'Data · ' + D.spec.length : 'Data'] as [Tab, string]] : []).concat(
    (!up || D) ? [['spectra', 'Spectra'], ['sens', 'Sensograms'], ['overview', 'Overview'], ['diag', 'Diagnostics'], ['export', 'Export']] : []);

  const ctx = {
    state, actions, res: resRef.current, demoRes: demoResRef.current,
    C: PALETTES[FIGURE_SETTINGS.palette], showTruth: FIGURE_SETTINGS.showSimulated, compact: FIGURE_SETTINGS.compact
  };

  return (
    <Ctx.Provider value={ctx}>
      <div style={{ minHeight: '100vh', background: 'var(--color-bg)', color: 'var(--color-text)', fontFamily: 'var(--font-body)' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 20, background: 'color-mix(in srgb,var(--color-bg) 92%,transparent)', backdropFilter: 'blur(8px)', borderBottom: '1px solid color-mix(in srgb,var(--color-text) 10%,transparent)' }}>
          <div className="sg-page" style={{ maxWidth: 1440, margin: '0 auto', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '10px 18px', padding: '10px 26px' }}>
            <button className="sg-brand" onClick={actions.goHome} title="Home">
              <svg width="26" height="26" viewBox="0 0 26 26" fill="none" style={{ display: 'block', flex: 'none' }}>
                <circle cx="13" cy="13" r="12" fill="#c67139" fillOpacity="0.16" />
                <path d="M2 16 C5 16 5.5 7 8.5 7 C11.5 7 12 19 15 19 C18 19 18.5 9 21.5 9 C23 9 23.5 13 24 14" stroke="#c67139" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              <span style={{ fontFamily: 'var(--font-heading)', fontSize: 17, letterSpacing: '-0.01em' }}>Sensogram Method Explorer</span>
            </button>
            <nav style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              <button className="sg-tab" aria-selected={state.view === 'home'} onClick={actions.goHome}>Home</button>
              <button className="sg-tab" aria-selected={state.view === 'methods'} onClick={actions.goMethods}>Methods</button>
              {tabs.map(([k, label]) => (
                <button key={k} className="sg-tab" aria-selected={state.view === 'exp' && state.tab === k} onClick={() => actions.goTab(k)}>{label}</button>
              ))}
            </nav>
          </div>
        </header>
        {state.view === 'home' && <HomePage />}
        {state.view === 'methods' && <MethodsPage />}
        {state.view === 'exp' && <ExperimentsPage />}
      </div>
    </Ctx.Provider>
  );
}
