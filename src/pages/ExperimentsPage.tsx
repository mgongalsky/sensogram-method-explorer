import { Seg } from '../components/Controls';
import { DEFAULTS, pick } from '../analysis/constants';
import { useApp } from '../state';
import { ControlsColumn } from './experiments/ControlsColumn';
import { DataTab } from './experiments/DataTab';
import { DiagTab, ExportTab, OverviewTab, SensTab, SpectraTab } from './experiments/ResultTabs';

export function ExperimentsPage() {
  const { state: st, actions, res: r } = useApp();
  const p = st.p, D = st.dataset, up = st.src === 'upload';
  const showWork = !up || !!D;
  const srcNote = st.src === 'synth'
    ? 'Reproducible in-browser experiment, seed ' + p.seed + '. The simulated response is known, so RMSE is real.'
    : (D ? D.spec.length + ' spectra loaded from ' + (D.shape === 'matrix' ? 'a matrix file' : 'individual files') + ' · ' + D.lo.toFixed(1) + '–' + D.hi.toFixed(1) + ' nm · processed locally, never uploaded'
      : 'Drop TXT, CSV, TSV or a ZIP archive of spectra. Everything is parsed and analysed in this tab — no upload, no server.');
  const progLabel = st.parsing ? (st.progress || 'Reading files…') : (st.prog ? st.prog.phase + ' — ' + st.prog.done + ' of ' + st.prog.total + ' spectra' : '');

  return (
    <main className="sg-page" style={{ maxWidth: 1440, margin: '0 auto', padding: '22px 26px 90px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
        <Seg name="sgsrc" value={st.src} size={13} pad="7px 16px" options={[['synth', 'Synthetic example'], ['upload', 'Upload spectra']]}
          onChange={v => v === 'synth'
            ? actions.edit(s => ({ src: 'synth', tab: s.tab === 'data' ? 'overview' : s.tab, p: { ...s.p, ...pick(DEFAULTS) } }))
            : actions.edit(s => ({
              src: 'upload', tab: s.dataset ? s.tab : 'data',
              p: { ...s.p, ...(s.dataset ? s.dataset.derived : {}), sgWin: Math.min(s.p.sgWin, s.dataset ? (s.dataset.spec.length % 2 ? s.dataset.spec.length : s.dataset.spec.length - 1) : s.p.sgWin) }
            }))} />
        <div style={{ fontSize: 12.5, color: 'color-mix(in srgb,var(--color-text) 55%,transparent)' }}>{srcNote}</div>
      </div>

      <div className="sg-work">
        <aside className="sg-scroll sg-controls">
          <ControlsColumn />
        </aside>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, minWidth: 0 }}>
          {(st.prog || st.parsing) && (
            <div className="card elev-lg" role="status" style={{ position: 'fixed', left: '50%', bottom: 22, transform: 'translateX(-50%)', zIndex: 40, width: 'min(460px,calc(100vw - 40px))', gap: 8, padding: 'var(--space-3)' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
                <div style={{ fontSize: 13 }}>{progLabel}</div>
                <button className="btn btn-ghost" style={{ fontSize: 12, padding: 0 }} onClick={actions.cancelRun}>Cancel</button>
              </div>
              <div style={{ height: 7, borderRadius: 999, background: 'color-mix(in srgb,var(--color-text) 12%,transparent)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 999, background: 'var(--color-accent)', width: st.prog ? st.prog.pct : '100%', transition: 'width .12s linear' }} />
              </div>
            </div>
          )}

          {up && st.tab === 'data' && <DataTab />}
          {showWork && r && st.tab === 'overview' && <OverviewTab r={r} />}
          {showWork && r && st.tab === 'sens' && <SensTab r={r} />}
          {showWork && r && st.tab === 'spectra' && <SpectraTab r={r} />}
          {showWork && r && st.tab === 'diag' && <DiagTab r={r} />}
          {showWork && r && st.tab === 'export' && <ExportTab r={r} st={st} />}
          {showWork && !r && st.tab !== 'data' && (
            <div className="card elev-sm" style={{ padding: 'var(--space-4)', fontSize: 13.5 }}>Computing the first analysis…</div>
          )}
        </div>
      </div>
    </main>
  );
}
