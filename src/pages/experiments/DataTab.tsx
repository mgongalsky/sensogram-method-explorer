// Upload workspace: two film-specific drop zones, bundled examples, the validation
// report and the time-order list.

import { Tag } from '../../components/Controls';
import type { FilmModel } from '../../analysis/synthetic';
import type { Note } from '../../analysis/types';
import { useApp } from '../../state';

export const noteStyle = (w: Note, forReport: boolean) => ({
  level: forReport
    ? (w.level === 'ok' ? 'pass' : w.level === 'warn' ? 'check' : 'error')
    : (w.level === 'ok' ? 'pass' : w.level === 'warn' ? 'warning' : 'check'),
  bg: w.level === 'ok' ? 'var(--color-accent-2-100)' : w.level === 'warn' ? 'var(--color-accent-100)'
    : forReport ? 'color-mix(in srgb,#b3261e 14%,transparent)' : 'color-mix(in srgb, var(--color-text) 8%, transparent)',
  fg: w.level === 'ok' ? 'var(--color-accent-2-800)' : w.level === 'warn' ? 'var(--color-accent-800)' : forReport ? '#7a1a12' : 'var(--color-text)'
});

const ZONES: { kind: FilmModel; title: string; example: string; exampleLabel: string; body: string }[] = [
  { kind: 'cavity', title: 'Multilayer', example: 'multilayer', exampleLabel: 'PrS-47-MC example',
    body: 'Bragg mirrors around a defect layer. The ESW wavelength snaps to the sharpest notch — the resonance.' },
  { kind: 'single', title: 'Single layer', example: 'single-layer', exampleLabel: 'SL-P2-MA example',
    body: 'One porous film, a plain fringe train. The ESW wavelength snaps to the fringe minimum nearest the window centre.' }
];

export function DataTab() {
  const { state: st, actions } = useApp();
  const p = st.p, up = st.src === 'upload';
  const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(300px,100%),1fr))', gap: 16 }}>
        {ZONES.map(z => {
          const on = st.drag === z.kind;
          return (
            <div key={z.kind}
              style={{ border: '2px dashed ' + (on ? 'var(--color-accent)' : muted(22)), borderRadius: 'var(--radius-lg)', padding: '24px 22px', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, background: on ? 'color-mix(in srgb,var(--color-accent) 8%,#fdfaf3)' : 'color-mix(in srgb,#fdfaf3 70%,transparent)' }}
              onDrop={e => { e.preventDefault(); actions.handleFiles(e.dataTransfer.files, z.kind); }}
              onDragOver={e => { e.preventDefault(); if (st.drag !== z.kind) actions.set({ drag: z.kind }); }}
              onDragLeave={e => { e.preventDefault(); actions.set({ drag: null }); }}>
              <h3 style={{ fontSize: 21, margin: 0 }}>{z.title}</h3>
              <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, textWrap: 'pretty', color: muted(68) }}>{z.body}</p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginTop: 2 }}>
                <label className="btn btn-primary" style={{ cursor: 'pointer', fontSize: 12.5, padding: '6px 14px' }}>
                  Browse files or ZIP
                  <input type="file" multiple accept=".txt,.csv,.tsv,.dat,.asc,.prn,.xy,.zip" style={{ display: 'none' }}
                    onChange={e => { actions.handleFiles(e.target.files ? Array.from(e.target.files) : null, z.kind); e.target.value = ''; }} />
                </label>
                <button className="btn btn-secondary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={() => actions.loadBundled(z.example, z.kind)}>{z.exampleLabel}</button>
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className="btn btn-ghost" style={{ fontSize: 12.5 }} onClick={actions.loadSyntheticAsUpload}>Synthetic demo</button>
        {st.dataset && <button className="btn btn-secondary" style={{ fontSize: 12.5, padding: '6px 14px' }} onClick={actions.clearData}>Clear loaded data</button>}
      </div>
      <p style={{ margin: 0, fontSize: 12.5, lineHeight: 1.6, color: muted(58), maxWidth: '60em' }}>
        Either zone accepts a <strong>ZIP archive</strong>, a folder's worth of <strong>two-column</strong> TXT / CSV / TSV / DAT files, or a single <strong>matrix file</strong> with wavelength in column one and one column per time point. Comma, tab, semicolon and whitespace delimiters are detected; comment lines beginning <code>#</code>, <code>%</code> or <code>//</code> and one optional header row are skipped; files are ordered by natural filename sort, so <code>spectrum2</code> precedes <code>spectrum10</code>. Telling the page which film it is only sets the starting window and which reflectance feature the ESW wavelength snaps to — you can override both. Spectra are processed locally in this browser and are not uploaded.
      </p>

      {st.report.length > 0 && (
        <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 10 }}>
          <div className="card-kicker">Validation report</div>
          {st.report.map((w, i) => {
            const s = noteStyle(w, true);
            return (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5 }}>
                <Tag level={s.level} bg={s.bg} fg={s.fg} /><span>{w.text}</span>
              </div>
            );
          })}
        </div>
      )}

      {st.dataset && (
        <div className="card elev-sm" style={{ padding: 'var(--space-4)', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div className="card-kicker">Order in time — {st.files.length} spectra</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" style={{ fontSize: 12, padding: '5px 12px' }} onClick={() => actions.reorder('reverse')}>Reverse order</button>
            </div>
          </div>
          <div style={{ fontSize: 12, color: muted(58) }}>{st.useImported ? 'Times imported from the file header are in use.' : 'Times are the spectrum order multiplied by the scan interval, in minutes.'} The first row is the reference unless you pick another.</div>
          <div style={{ maxHeight: 420, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {st.files.map((f, i) => {
              const isRef = up && Math.round(p.refIdx) === i;
              return (
                <div key={i + ':' + f.name} style={{ display: 'grid', gridTemplateColumns: '44px minmax(0,1fr) auto', alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 10, border: '1px solid ' + (isRef ? 'color-mix(in srgb,var(--color-accent) 45%,transparent)' : muted(8)) }}>
                  <span className="sg-num" style={{ fontSize: 12, color: muted(55) }}>#{i + 1}</span>
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 13 }}>
                    {f.name}<span className="sg-num" style={{ color: muted(50), fontSize: 11.5 }}> · {f.meta}</span>
                  </span>
                  <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12, fontWeight: isRef ? 700 : undefined }} title="Use as reference spectrum" onClick={() => actions.setP('refIdx', i)}>ref</button>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} title="Move earlier" onClick={() => actions.reorder('up', i)}>↑</button>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} title="Move later" onClick={() => actions.reorder('down', i)}>↓</button>
                    <button className="btn btn-ghost" style={{ padding: '2px 8px', fontSize: 12 }} title="Remove this spectrum" onClick={() => actions.reorder('remove', i)}>✕</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
