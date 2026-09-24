// The method selector and summary shared by the Home and Methods pages.

import { eduFigures, methodSensogram } from '../content/figures';
import { METHODS, REFS, type MethodInfo } from '../content/methods';
import type { PlotSpec } from './Plot';
import { useApp } from '../state';

export interface MethodView extends MethodInfo {
  kicker: string;
  figA: PlotSpec;
  figB: PlotSpec;
  sens: PlotSpec;
  refList: { text: string; doi: string; url: string }[];
}

export function useMethodView(): MethodView {
  const { state, res, demoRes, C } = useApp();
  const cur = METHODS.find(m => m.key === state.method) || METHODS[0];
  const idx = METHODS.indexOf(cur);
  const hr = (state.src === 'synth' && res) ? res : (demoRes || res);
  const fig = eduFigures(C).fig[cur.key];
  return {
    ...cur, kicker: 'Method ' + (idx + 1) + ' of 4',
    figA: fig[0], figB: fig[1], sens: methodSensogram(hr, cur, C),
    refList: cur.refs.map(k => ({ text: REFS[k].text, doi: REFS[k].doi, url: 'https://doi.org/' + REFS[k].doi }))
  };
}

export function MethodTabs({ long = false }: { long?: boolean }) {
  const { state, actions } = useApp();
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: long ? 22 : 0 }}>
      {METHODS.map(m => (
        <button key={m.key} className="sg-tab" style={long ? { fontSize: 15, padding: '9px 18px' } : undefined}
          aria-selected={m.key === state.method} onClick={() => actions.set({ method: m.key })}>
          {long ? m.abbr + ' · ' + m.title.replace(/\s*\(.*?\)\s*/, ' ').trim() : m.abbr}
        </button>
      ))}
    </div>
  );
}

/** Kicker, title, formula and summary — plus, on Home, the "reads / watch for" lines. */
export function MethodPanel({ compact = false }: { compact?: boolean }) {
  const { actions } = useApp();
  const mth = useMethodView();
  if (!compact) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card-kicker">{mth.kicker}</div>
        <h2 style={{ fontSize: 30, margin: 0, textWrap: 'pretty' }}>{mth.title}</h2>
        <div className="sg-formula" style={{ fontSize: 15, padding: '10px 16px' }}>{mth.formula}</div>
        <p style={{ margin: 0, fontSize: 16, lineHeight: 1.65, maxWidth: '52em', textWrap: 'pretty' }}>{mth.summary}</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card-kicker">{mth.kicker}</div>
      <h3 style={{ fontSize: 25, margin: 0, textWrap: 'pretty' }}>{mth.title}</h3>
      <div className="sg-formula" style={{ fontSize: 14, padding: '9px 14px' }}>{mth.formula}</div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, textWrap: 'pretty' }}>{mth.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13.5, lineHeight: 1.5 }}>
        <div style={{ fontWeight: 600 }}>Reads</div><div>{mth.reads}</div>
        <div style={{ fontWeight: 600 }}>Watch for</div><div>{mth.watch}</div>
      </div>
      <button className="btn btn-secondary" style={{ fontSize: 13.5, padding: '8px 16px', alignSelf: 'flex-start', marginTop: 4 }} onClick={actions.goMethods}>How it works, step by step</button>
    </div>
  );
}
