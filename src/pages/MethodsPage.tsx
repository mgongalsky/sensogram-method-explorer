import { MethodPanel, MethodTabs, useMethodView } from '../components/MethodView';
import { Plot } from '../components/Plot';
import { useApp } from '../state';

const muted = (pct: number) => `color-mix(in srgb,var(--color-text) ${pct}%,transparent)`;

export function MethodsPage() {
  const { actions } = useApp();
  const mth = useMethodView();
  const bullet = (color: string) => <span style={{ flex: 'none', width: 8, height: 8, borderRadius: 999, background: color, marginTop: 7 }} />;
  return (
    <main className="sg-page" style={{ maxWidth: 1320, margin: '0 auto', padding: '44px 26px 90px' }}>
      <span className="tag tag-accent-2">Methods</span>
      <h1 className="sg-hero" style={{ fontSize: 40, margin: '14px 0 0', maxWidth: '18em', textWrap: 'pretty' }}>How each method reads a spectrum</h1>
      <p style={{ maxWidth: '48em', fontSize: 16, lineHeight: 1.65, marginTop: 14, textWrap: 'pretty' }}>All four start from the same reflectance spectra and end with one number per time point. The figures below follow each one through its steps on a single porous layer, computed without noise and with the binding shift exaggerated, so every step can be seen. The sensogram at the bottom is the method's real output on the synthetic microcavity run.</p>
      <MethodTabs long />
      <div className="card elev-sm" style={{ marginTop: 16, padding: 'var(--space-6)', gap: 22 }}>
        <MethodPanel />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 26 }}>
          {([[mth.figA, mth.capA], [mth.figB, mth.capB]] as const).map(([fig, cap], i) => (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
              <Plot plot={fig} />
              <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: muted(62), textWrap: 'pretty' }}>{cap}</p>
            </div>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(260px,100%),1fr))', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="card-kicker">How it is computed</div>
            {mth.steps.map((t, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.55 }}>
                <span className="sg-num" style={{ flex: 'none', width: 24, height: 24, borderRadius: 999, background: 'var(--color-accent-200)', color: 'var(--color-accent-800)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</span>
                <span style={{ textWrap: 'pretty' }}>{t}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="card-kicker" style={{ color: 'var(--color-accent-2-800)' }}>Strengths</div>
            {mth.pros.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.55 }}>
                {bullet('var(--color-accent-2)')}<span style={{ textWrap: 'pretty' }}>{s}</span>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="card-kicker">Limits</div>
            {mth.cons.map((s, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.55 }}>
                {bullet('var(--color-accent)')}<span style={{ textWrap: 'pretty' }}>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Plot plot={mth.sens} />
        </div>
        {mth.refList.map((rf, i) => (
          <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: muted(62) }}>{rf.text} <a href={rf.url} target="_blank" rel="noopener">{rf.doi}</a></p>
        ))}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
          <button className="btn btn-primary" style={{ fontSize: 14, padding: '9px 18px' }} onClick={actions.goExp}>Try it on the synthetic demo</button>
          <button className="btn btn-secondary" style={{ fontSize: 14, padding: '9px 18px' }} onClick={actions.goExpUpload}>Analyze my data</button>
        </div>
      </div>
    </main>
  );
}
