// Interactive SVG line plot: zoom (buttons, wheel, drag-a-range), shift-drag pan,
// Y rescale to the visible window, crosshair data reader, enlarge-to-overlay, 2× PNG
// export, draggable interval bands and draggable vertical markers. The caller hands in
// data and axis metadata; projection, ticks and view state live here.

import { Component, createRef, type CSSProperties, type PointerEvent as RPointerEvent, type ReactNode } from 'react';

export interface PlotSeries {
  y: readonly number[];
  x?: readonly number[];
  color: string;
  label?: string;
  width?: number;
  dash?: string;
  opacity?: number;
}
export interface PlotBand { key?: string; label?: string; a: number; b: number; fill: string; edge?: string }
export interface PlotDot { x: number; y: number; color: string; r?: number }
export interface PlotVline { key?: string; x: number; color: string; label?: string }

export interface PlotSpec {
  title?: string;
  note?: string;
  h?: number;
  L?: number;
  legend?: boolean;
  zero?: boolean;
  reader?: boolean;
  x: readonly number[];
  series: (PlotSeries | null | undefined | false)[];
  bands?: PlotBand[];
  onBand?: (key: string, a: number, b: number) => void;
  dots?: PlotDot[];
  vlines?: PlotVline[];
  onVline?: (key: string, x: number) => void;
  xmin?: number; xmax?: number; ymin?: number; ymax?: number;
  xlabel?: string; ylabel?: string;
  xfmt?: (v: number) => string;
  xunit?: string;
}

interface PlotState {
  zx: [number, number] | null;
  fitY: boolean;
  big: boolean;
  reader: boolean;
  hov: number | null;
  box: { a: number; b: number } | null;
}

interface Geometry {
  W: number; H: number; L: number; R: number; T: number; B: number;
  fx0: number; fx1: number; x0: number; x1: number; y0: number; y1: number;
  inv: (sx: number) => number;
  hasData: boolean;
}

const INK = '#201e1d';
const PAPER = '#fdfaf3';
const FONT = 'Figtree, system-ui, sans-serif';
let PID = 0;

function ticks(a: number, b: number, n: number): number[] {
  if (!(b > a)) return [a];
  const raw = (b - a) / n, mag = Math.pow(10, Math.floor(Math.log10(raw))), norm = raw / mag;
  const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
  const out: number[] = [];
  for (let v = Math.ceil(a / step) * step; v <= b + step * 1e-6; v += step) out.push(+v.toFixed(10));
  return out;
}
function fmtTick(v: number, span: number): string {
  const a = Math.abs(span);
  const d = a >= 100 ? 0 : a >= 10 ? 1 : a >= 1 ? 2 : a >= 0.1 ? 3 : a >= 0.01 ? 4 : 5;
  return v.toFixed(d);
}
function fmtVal(v: number, span: number): string {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(span);
  const d = a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : a >= 0.1 ? 4 : 5;
  return v.toFixed(d);
}

const Icon = ({ children }: { children: ReactNode }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.75" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

export class Plot extends Component<{ plot: PlotSpec }, PlotState> {
  state: PlotState = { zx: null, fitY: false, big: false, reader: true, hov: null, box: null };
  private pid = ++PID;
  private svgRef = createRef<SVGSVGElement>();
  private g: Geometry | null = null;
  private pan: { sx: number; x0: number; x1: number } | null = null;
  private bd: { key: string; which: 'a' | 'b' } | null = null;
  private vd: string | null = null;

  private onWheel = (e: WheelEvent) => {
    const o = this.props.plot;
    if (!o || !o.series || !o.series.some(Boolean)) return;
    e.preventDefault();
    const gm = this.g; if (!gm) return;
    const pt = this.pt(e); if (!pt) return;
    const ax = gm.inv(Math.max(gm.L, Math.min(gm.W - gm.R, pt.sx)));
    this.zoomAt(ax, e.deltaY > 0 ? 1 / 0.82 : 0.82);
  };
  private onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && this.state.big) this.setState({ big: false }); };

  componentDidMount() {
    this.svgRef.current?.addEventListener('wheel', this.onWheel, { passive: false });
    document.addEventListener('keydown', this.onKey);
  }
  componentWillUnmount() {
    this.svgRef.current?.removeEventListener('wheel', this.onWheel);
    document.removeEventListener('keydown', this.onKey);
  }

  private pt(e: { clientX: number; clientY: number }) {
    const el = this.svgRef.current; if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) return null;
    const gm = this.g || { W: 800, H: 270 };
    return { sx: (e.clientX - r.left) * gm.W / r.width, sy: (e.clientY - r.top) * gm.H / r.height };
  }
  private setDomain(x0: number, x1: number) {
    const gm = this.g; if (!gm) return;
    const full = gm.fx1 - gm.fx0, min = full / 400;
    let a = x0, b = x1;
    if (b - a < min) { const c = (a + b) / 2; a = c - min / 2; b = c + min / 2; }
    if (b - a >= full) { this.setState({ zx: null }); return; }
    if (a < gm.fx0) { b += gm.fx0 - a; a = gm.fx0; }
    if (b > gm.fx1) { a -= b - gm.fx1; b = gm.fx1; }
    this.setState({ zx: [Math.max(gm.fx0, a), Math.min(gm.fx1, b)] });
  }
  private zoomAt(anchor: number, f: number) {
    const gm = this.g; if (!gm) return;
    this.setDomain(anchor - (anchor - gm.x0) * f, anchor + (gm.x1 - anchor) * f);
  }

  // ---------- band and marker dragging ----------
  private bandDown(e: RPointerEvent<SVGGElement>, key: string, which: 'a' | 'b') {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.bd = { key, which };
  }
  private bandMove = (e: RPointerEvent<SVGGElement>) => {
    const bd = this.bd; if (!bd) return;
    const o = this.props.plot, g = this.g; if (!g || !o.onBand) return;
    const pt = this.pt(e); if (!pt) return;
    const band = (o.bands || []).find(x => x.key === bd.key); if (!band) return;
    const v = g.inv(Math.max(g.L, Math.min(g.W - g.R, pt.sx)));
    let a = bd.which === 'a' ? v : band.a, b = bd.which === 'b' ? v : band.b;
    if (a > b) { const t = a; a = b; b = t; }
    o.onBand(bd.key, Math.max(g.fx0, a), Math.min(g.fx1, b));
  };
  private bandUp = () => { this.bd = null; };

  private vlineDown(e: RPointerEvent<SVGGElement>, key: string) {
    e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    this.vd = key;
  }
  private vlineMove = (e: RPointerEvent<SVGGElement>) => {
    if (!this.vd) return;
    const o = this.props.plot, g = this.g;
    if (!g || !o.onVline) return;
    const pt = this.pt(e); if (!pt) return;
    o.onVline(this.vd, g.inv(Math.max(g.L, Math.min(g.W - g.R, pt.sx))));
  };
  private vlineUp = () => { this.vd = null; };

  /**
   * Writes the figure exactly as shown to a 2× PNG, so a reader can lift any panel
   * straight into a manuscript without a screenshot tool.
   */
  private savePng = () => {
    const el = this.svgRef.current; if (!el) return;
    const gm = this.g || { W: 800, H: 270 }, scale = 2;
    const clone = el.cloneNode(true) as SVGSVGElement;
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(gm.W));
    clone.setAttribute('height', String(gm.H));
    const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    bg.setAttribute('width', String(gm.W)); bg.setAttribute('height', String(gm.H)); bg.setAttribute('fill', PAPER);
    clone.insertBefore(bg, clone.firstChild);
    const svgText = new XMLSerializer().serializeToString(clone);
    const url = URL.createObjectURL(new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' }));
    const img = new Image();
    img.onload = () => {
      const cv = document.createElement('canvas');
      cv.width = gm.W * scale; cv.height = gm.H * scale;
      const cx = cv.getContext('2d');
      if (!cx) { URL.revokeObjectURL(url); return; }
      cx.fillStyle = PAPER; cx.fillRect(0, 0, cv.width, cv.height);
      cx.drawImage(img, 0, 0, cv.width, cv.height);
      URL.revokeObjectURL(url);
      const name = (this.props.plot.title || 'figure').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'figure';
      cv.toBlob(b => {
        if (!b) return;
        const u = URL.createObjectURL(b), a = document.createElement('a');
        a.href = u; a.download = name + '.png';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 3000);
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  };

  render() {
    const o = this.props.plot;
    const st = this.state;
    const W = 800, H = o.h || 270, L = o.L || 66, R = 16, T = 14, B = 34;
    const ser = (o.series || []).filter((s): s is PlotSeries => !!s && !!s.y && s.y.length > 0);
    const hasData = ser.length > 0;

    let fx0 = o.xmin, fx1 = o.xmax;
    if (fx0 === undefined || fx1 === undefined) {
      fx0 = Infinity; fx1 = -Infinity;
      for (const s of ser) {
        const xs = s.x || o.x || [];
        for (let i = 0; i < xs.length; i++) { const v = xs[i]; if (v < fx0) fx0 = v; if (v > fx1) fx1 = v; }
      }
    }
    if (!(fx1 > fx0)) { fx0 = 0; fx1 = 1; }
    const x0 = st.zx ? st.zx[0] : fx0, x1 = st.zx ? st.zx[1] : fx1;

    let y0: number, y1: number;
    if (o.ymin !== undefined && o.ymax !== undefined && !st.fitY) { y0 = o.ymin; y1 = o.ymax; }
    else {
      y0 = Infinity; y1 = -Infinity;
      for (const s of ser) {
        const xs = s.x || o.x || [];
        for (let i = 0; i < s.y.length; i++) {
          const v = s.y[i]; if (!Number.isFinite(v)) continue;
          if (st.fitY) { const xv = xs[i]; if (!(xv >= x0 && xv <= x1)) continue; }
          if (v < y0) y0 = v; if (v > y1) y1 = v;
        }
      }
      if (!(y1 > y0)) { const c = Number.isFinite(y0) ? y0 : 0; y0 = c - 1; y1 = c + 1; }
      const pad = (y1 - y0) * 0.09; y0 -= pad; y1 += pad;
    }

    const px = (v: number) => L + (v - x0) / (x1 - x0) * (W - L - R);
    const py = (v: number) => T + (1 - (v - y0) / (y1 - y0)) * (H - T - B);
    const inv = (sx: number) => x0 + (sx - L) / (W - L - R) * (x1 - x0);
    this.g = { W, H, L, R, T, B, fx0, fx1, x0, x1, y0, y1, inv, hasData };

    // ---- grid, tick marks (inward, on all four sides), tick labels ----
    const grid: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const xtl: { x: number; y: number; anchor: 'start' | 'middle' | 'end'; label: string }[] = [];
    const ytl: { x: number; y: number; label: string }[] = [];
    const tickMarks: { x1: number; y1: number; x2: number; y2: number }[] = [];
    const MAJ = 6, MIN = 3.5, xR = W - R, yB = H - B;
    const xv = ticks(x0, x1, 6), yv = ticks(y0, y1, 5);
    const tk = (sx: number, sy: number, dx: number, dy: number, len: number) => tickMarks.push({ x1: sx, y1: sy, x2: sx + dx * len, y2: sy + dy * len });
    const minors = (vals: number[], lim: [number, number]) => {
      if (vals.length < 2) return [];
      const step = (vals[1] - vals[0]) / 5, out: number[] = [];
      for (let v = vals[0] - step * 4; v <= vals[vals.length - 1] + step * 4 + step * 1e-6; v += step) {
        if (v < lim[0] || v > lim[1]) continue;
        if (vals.some(t => Math.abs(t - v) < Math.abs(step) * 1e-3)) continue;
        out.push(v);
      }
      return out;
    };
    xv.forEach((v, i) => {
      const sx = px(v);
      grid.push({ x1: sx, y1: T, x2: sx, y2: yB });
      // end labels are anchored inward so they cannot hang outside the frame
      const anchor = i === 0 && sx < L + 12 ? 'start' : (i === xv.length - 1 && sx > xR - 12 ? 'end' : 'middle');
      xtl.push({ x: sx, y: yB + 17, anchor, label: o.xfmt ? o.xfmt(v) : fmtTick(v, x1 - x0) });
      tk(sx, yB, 0, -1, MAJ); tk(sx, T, 0, 1, MAJ);
    });
    minors(xv, [x0, x1]).forEach(v => { const sx = px(v); tk(sx, yB, 0, -1, MIN); tk(sx, T, 0, 1, MIN); });
    yv.forEach(v => {
      const sy = py(v);
      grid.push({ x1: L, y1: sy, x2: xR, y2: sy });
      ytl.push({ x: L - 10, y: sy + 4, label: fmtTick(v, y1 - y0) });
      tk(L, sy, 1, 0, MAJ); tk(xR, sy, -1, 0, MAJ);
    });
    minors(yv, [y0, y1]).forEach(v => { const sy = py(v); tk(L, sy, 1, 0, MIN); tk(xR, sy, -1, 0, MIN); });

    const series = ser.map(s => {
      const xs = s.x || o.x;
      let d = '', pen = false;
      for (let i = 0; i < s.y.length; i++) {
        const v = s.y[i];
        if (!Number.isFinite(v) || !Number.isFinite(xs[i])) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + px(xs[i]).toFixed(2) + ' ' + py(v).toFixed(2) + ' ';
        pen = true;
      }
      return { d, color: s.color, width: s.width || 1.7, dash: s.dash || '', opacity: s.opacity === undefined ? 1 : s.opacity, label: s.label };
    });

    const bands = (o.bands || []).map(b => ({ x: px(b.a), y: T, w: Math.max(0, px(b.b) - px(b.a)), h: H - T - B, fill: b.fill }));
    // draggable band edges: a band carrying a key can be reshaped by pointer
    const bandHandles: { key: string; x: number; y: number; w: number; h: number; lineX: number; lineY2: number; color: string; title: string; bandKey: string; which: 'a' | 'b' }[] = [];
    if (o.onBand) (o.bands || []).forEach(b => {
      if (!b.key) return;
      (['a', 'b'] as const).forEach(which => {
        const sx = px(b[which]);
        if (!(sx >= L - 6 && sx <= W - R + 6)) return;
        bandHandles.push({
          key: b.key + which, x: sx - 6, y: T, w: 12, h: H - T - B, lineX: sx, lineY2: H - B,
          color: b.edge || INK,
          title: (b.label || 'Interval') + ' ' + (which === 'a' ? 'start' : 'end') + ' — drag to move',
          bandKey: b.key as string, which
        });
      });
    });
    const zero = (y0 < 0 && y1 > 0 && o.zero !== false) ? [{ x1: L, y1: py(0), x2: W - R, y2: py(0) }] : [];
    const dots = (o.dots || []).map(d => ({ x: px(d.x), y: py(d.y), r: d.r || 3.4, color: d.color }));
    const vlines = (o.vlines || []).map(v => ({ x: px(v.x), y1: T, y2: H - B, color: v.color }));
    // A vline carrying a key can be dragged along x, the same way band edges are.
    const vlineHandles: { key: string; x: number; y: number; w: number; h: number; lineX: number; capY: number; color: string; label: string; val: number; title: string }[] = [];
    if (o.onVline) (o.vlines || []).forEach(v => {
      if (!v.key) return;
      const sx = px(v.x);
      if (!(sx >= L - 7 && sx <= W - R + 7)) return;
      vlineHandles.push({
        key: v.key, x: sx - 7, y: T, w: 14, h: H - T - B, lineX: sx, capY: T + 5, color: v.color,
        label: v.label || '', val: v.x, title: (v.label || 'Marker') + ' — drag to move'
      });
    });
    const labels: { x: number; y: number; label: string; transform?: string }[] = [];
    if (o.xlabel) labels.push({ x: L + (W - L - R) / 2, y: H - 4, label: o.xlabel });
    if (o.ylabel) labels.push({ x: 14, y: T + (H - T - B) / 2, label: o.ylabel, transform: 'rotate(-90 14 ' + (T + (H - T - B) / 2) + ')' });

    const legend = series.filter(s => s.label).map(s => ({ label: s.label as string, color: s.color, width: Math.max(2, s.width), dash: s.dash }));

    // The reader row is always rendered when the reader is on, so the layout does not
    // jump as the pointer enters and leaves the plot; values fall back to em-dashes.
    const cross: { x: number; y1: number; y2: number }[] = [], crossDots: { x: number; y: number; color: string }[] = [];
    const readRows: { label: string; color: string; val: string }[] = [];
    let readX = '', hasRead = false;
    if (st.reader && hasData && o.reader !== false && ser.some(s => s.label)) {
      const live = st.hov !== null && !st.box;
      const sx = live ? Math.max(L, Math.min(W - R, st.hov as number)) : null;
      const xvv = sx !== null ? inv(sx) : NaN;
      if (sx !== null) cross.push({ x: sx, y1: T, y2: H - B });
      hasRead = true;
      const xName = o.xlabel ? o.xlabel.replace(/\s*\(.*\)\s*$/, '') + ' ' : '';
      readX = xName + (live ? fmtVal(xvv, x1 - x0) + (o.xunit ? ' ' + o.xunit : '') : '—');
      ser.forEach(s => {
        if (!s.label) return;
        const xs = s.x || o.x;
        let bi = -1, bdd = Infinity;
        if (live) for (let i = 0; i < s.y.length; i++) { const dd = Math.abs(xs[i] - xvv); if (dd < bdd) { bdd = dd; bi = i; } }
        const v = bi < 0 ? NaN : s.y[bi];
        if (live && bi >= 0 && Number.isFinite(v)) crossDots.push({ x: px(xs[bi]), y: py(v), color: s.color });
        readRows.push({ label: s.label, color: s.color, val: live ? fmtVal(v, y1 - y0) : '—' });
      });
    }

    const boxes: { x: number; y: number; w: number; h: number }[] = [];
    if (st.box && Math.abs(st.box.b - st.box.a) > 3) {
      const a = Math.min(st.box.a, st.box.b), b = Math.max(st.box.a, st.box.b);
      boxes.push({ x: Math.max(L, a), y: T, w: Math.min(W - R, b) - Math.max(L, a), h: H - T - B });
    }

    const zoomed = !!st.zx;
    const clipId = 'sgclip' + this.pid;
    const clip = { x: L, y: T - 1, w: W - L - R, h: H - T - B + 2 };
    const bigIcon = st.big ? 'M9 3H3v6M15 21h6v-6M3 3l7 7M21 21l-7-7' : 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7';
    const zoomNote = zoomed ? ' · showing ' + fmtVal(x0, x1 - x0) + '–' + fmtVal(x1, x1 - x0) : '';
    const wrapStyle: CSSProperties = st.big
      ? { position: 'fixed', inset: 0, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 26 }
      : { width: '100%' };
    const figStyle: CSSProperties = st.big
      ? { display: 'flex', flexDirection: 'column', gap: 6, margin: 0, width: '100%', position: 'relative', maxWidth: 1500, background: 'var(--color-bg)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: '20px 22px' }
      : { display: 'flex', flexDirection: 'column', gap: 6, margin: 0, width: '100%' };
    const txt = (key: string, x: number, y: number, anchor: 'start' | 'middle' | 'end', size: number, op: number, label: string, transform?: string) => (
      <text key={key} x={x} y={y} textAnchor={anchor} fontSize={size} fontFamily={FONT} fill={INK} fillOpacity={op} transform={transform}>{label}</text>
    );

    const zoomIn = () => this.zoomAt((x0 + x1) / 2, 0.62);
    const zoomOut = () => this.zoomAt((x0 + x1) / 2, 1 / 0.62);
    const reset = () => this.setState({ zx: null, fitY: false, box: null });

    return (
      <div style={wrapStyle}>
        {st.big && <div style={{ position: 'absolute', inset: 0, background: 'color-mix(in srgb,#201e1d 52%,transparent)', backdropFilter: 'blur(3px)' }} onClick={() => this.setState({ big: false })} />}
        <figure style={figStyle}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 20 }}>
            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: 14, letterSpacing: '-0.01em' }}>{o.title}</div>
              <div className="sg-muted" style={{ fontSize: 11, ['--mute' as string]: '52%' }}>{o.note}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 2, flex: 'none' }}>
              <button className="btn btn-ghost sg-tool" title="Zoom in (wheel up)" onClick={zoomIn}>
                <Icon><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" title="Zoom out (wheel down)" onClick={zoomOut}>
                <Icon><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" data-on={st.fitY} title="Rescale Y to the visible window" onClick={() => this.setState(s => ({ fitY: !s.fitY }))}>
                <Icon><path d="M8 6 12 2 16 6" /><path d="M8 18 12 22 16 18" /><line x1="12" y1="2" x2="12" y2="22" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" title="Rescale X to the full range" onClick={reset}>
                <Icon><path d="M6 8 2 12 6 16" /><path d="M18 8 22 12 18 16" /><line x1="2" y1="12" x2="22" y2="12" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" data-on={st.reader} title="Data reader — crosshair and values" onClick={() => this.setState(s => ({ reader: !s.reader, hov: null }))}>
                <Icon><circle cx="12" cy="12" r="9" /><line x1="22" y1="12" x2="18" y2="12" /><line x1="6" y1="12" x2="2" y2="12" /><line x1="12" y1="2" x2="12" y2="6" /><line x1="12" y1="18" x2="12" y2="22" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" title="Save this figure as a 2× PNG" onClick={this.savePng}>
                <Icon><path d="M12 3v12" /><path d="M7 11l5 5 5-5" /><path d="M4 21h16" /></Icon>
              </button>
              <button className="btn btn-ghost sg-tool" title={st.big ? 'Shrink (Esc)' : 'Enlarge'} onClick={() => this.setState(s => ({ big: !s.big }))}>
                <Icon><path d={bigIcon} /></Icon>
              </button>
            </div>
          </div>
          <svg ref={this.svgRef} viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="xMidYMid meet" className="sg-plot-svg">
            <defs>
              <clipPath id={clipId}><rect x={clip.x} y={clip.y} width={clip.w} height={clip.h} /></clipPath>
            </defs>
            <g clipPath={'url(#' + clipId + ')'}>
              {bands.map((b, i) => <rect key={'b' + i} x={b.x} y={b.y} width={b.w} height={b.h} fill={b.fill} />)}
              {grid.map((gl, i) => <line key={'g' + i} x1={gl.x1} y1={gl.y1} x2={gl.x2} y2={gl.y2} stroke={INK} strokeOpacity={0.09} strokeWidth={1} />)}
              {zero.map((z, i) => <line key={'z' + i} x1={z.x1} y1={z.y1} x2={z.x2} y2={z.y2} stroke={INK} strokeOpacity={0.3} strokeWidth={1} />)}
              {series.map((s, i) => <path key={'s' + i} d={s.d} fill="none" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash || undefined} strokeLinejoin="round" strokeLinecap="round" opacity={s.opacity} />)}
              {dots.map((d, i) => <circle key={'d' + i} cx={d.x} cy={d.y} r={d.r} fill={d.color} />)}
              {vlines.map((v, i) => <line key={'v' + i} x1={v.x} y1={v.y1} x2={v.x} y2={v.y2} stroke={v.color} strokeWidth={1.25} strokeDasharray="4 3" />)}
              {cross.map((c, i) => <line key={'c' + i} x1={c.x} y1={c.y1} x2={c.x} y2={c.y2} stroke={INK} strokeOpacity={0.45} strokeWidth={1} />)}
              {crossDots.map((c, i) => <circle key={'cd' + i} cx={c.x} cy={c.y} r={3.6} fill={PAPER} stroke={c.color} strokeWidth={2} />)}
              {boxes.map((b, i) => <rect key={'bx' + i} x={b.x} y={b.y} width={b.w} height={b.h} fill="#c67139" fillOpacity={0.13} stroke="#c67139" strokeWidth={1} strokeDasharray="3 3" />)}
            </g>
            <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="none" stroke={INK} strokeOpacity={0.55} strokeWidth={1.1} />
            {tickMarks.map((t, i) => <line key={'t' + i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={INK} strokeOpacity={0.55} strokeWidth={1.1} />)}
            <g aria-hidden="true">
              {xtl.map((t, i) => txt('x' + i, t.x, t.y, t.anchor, 11, 0.62, t.label))}
              {ytl.map((t, i) => txt('y' + i, t.x, t.y, 'end', 11, 0.62, t.label))}
              {labels.map((l, i) => txt('l' + i, l.x, l.y, 'middle', 11.5, 0.75, l.label, l.transform))}
            </g>
            <rect
              x={clip.x} y={clip.y} width={clip.w} height={clip.h} fill="transparent" style={{ cursor: 'crosshair' }}
              onPointerDown={e => {
                if (!hasData) return;
                const p = this.pt(e); if (!p) return;
                (e.target as Element).setPointerCapture?.(e.pointerId);
                if (e.shiftKey) this.pan = { sx: p.sx, x0, x1 };
                else this.setState({ box: { a: p.sx, b: p.sx }, hov: null });
              }}
              onPointerMove={e => {
                const p = this.pt(e); if (!p) return;
                if (this.pan) {
                  const d = (p.sx - this.pan.sx) / (W - L - R) * (this.pan.x1 - this.pan.x0);
                  this.setDomain(this.pan.x0 - d, this.pan.x1 - d);
                } else if (this.state.box) this.setState(s => ({ box: s.box ? { a: s.box.a, b: p.sx } : null }));
                else if (this.state.reader) this.setState({ hov: p.sx });
              }}
              onPointerUp={() => {
                this.pan = null;
                const b = this.state.box;
                if (b && Math.abs(b.b - b.a) > 6) this.setDomain(inv(Math.min(b.a, b.b)), inv(Math.max(b.a, b.b)));
                if (b) this.setState({ box: null });
              }}
              onPointerLeave={() => { this.pan = null; if (this.state.hov !== null || this.state.box) this.setState({ hov: null, box: null }); }}
              onDoubleClick={reset}
            />
            {vlineHandles.map(v => (
              <g key={'vh' + v.key} style={{ cursor: 'col-resize' }} onPointerDown={e => this.vlineDown(e, v.key)} onPointerMove={this.vlineMove} onPointerUp={this.vlineUp}>
                <title>{v.title}</title>
                <rect x={v.x} y={v.y} width={v.w} height={v.h} fill="transparent" />
                <circle cx={v.lineX} cy={v.capY} r={4.5} fill={v.color} />
              </g>
            ))}
            <g aria-hidden="true" style={{ pointerEvents: 'none' }}>
              {vlineHandles.filter(v => v.label).map((v, i) => {
                const end = v.lineX > W - R - 70;
                return (
                  <text key={'m' + i} x={v.lineX + (end ? -8 : 8)} y={T + 9} textAnchor={end ? 'end' : 'start'} fontSize={10.5} fontFamily={FONT} fontWeight={600} fill={v.color}>
                    {v.label + ' ' + fmtVal(v.val, x1 - x0)}
                  </text>
                );
              })}
            </g>
            {bandHandles.map(b => (
              <g key={'bh' + b.key} style={{ cursor: 'col-resize' }} onPointerDown={e => this.bandDown(e, b.bandKey, b.which)} onPointerMove={this.bandMove} onPointerUp={this.bandUp}>
                <title>{b.title}</title>
                <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="transparent" />
                <line x1={b.lineX} y1={b.y} x2={b.lineX} y2={b.lineY2} stroke={b.color} strokeOpacity={0.34} strokeWidth={1.5} strokeDasharray="3 3" />
                <rect x={b.x} y={b.y} width={b.w} height={9} rx={4} fill={b.color} fillOpacity={0.34} />
              </g>
            ))}
          </svg>
          {hasRead && (
            <div className="sg-reader">
              <span style={{ fontWeight: 600 }}>{readX}</span>
              {readRows.map((r, i) => (
                <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span className="sg-dot" style={{ width: 9, height: 9, background: r.color }} />
                  <span className="sg-muted" style={{ ['--mute' as string]: '62%' }}>{r.label}</span>
                  <span style={{ fontWeight: 600 }}>{r.val}</span>
                </span>
              ))}
            </div>
          )}
          {o.legend !== false && legend.length > 1 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', paddingTop: 2 }}>
              {legend.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, whiteSpace: 'nowrap', flex: 'none' }}>
                  <svg width="20" height="8" style={{ display: 'block', flex: 'none' }}><line x1="0" y1="4" x2="20" y2="4" stroke={s.color} strokeWidth={s.width} strokeDasharray={s.dash || undefined} strokeLinecap="round" /></svg>
                  <span>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {hasData && (
            <div className="sg-muted" style={{ fontSize: 10.5, ['--mute' as string]: '40%' }}>Drag to zoom a range · shift-drag to pan · wheel to zoom · double-click to reset{zoomNote}</div>
          )}
        </figure>
      </div>
    );
  }
}
