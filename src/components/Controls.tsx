// Form controls for the experiment workspace.

import { useState, type CSSProperties, type ReactNode } from 'react';
import { useApp } from '../state';

/** Clamps to [min, max] and snaps to the step grid anchored at min. */
export function snap(min: number, max: number, step: number, v: number): number {
  let x = Math.min(max, Math.max(min, v));
  if (step > 0) { x = min + Math.round((x - min) / step) * step; x = Math.min(max, Math.max(min, x)); }
  return +(+x).toPrecision(12);
}

export interface SliderProps {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  fmt: (v: number) => string;
  onChange: (v: number) => void;
}

/**
 * A labelled range slider whose readout is itself a control: click it to type an exact
 * value (Enter commits, Esc cancels, out-of-range or off-step entries snap to the nearest
 * legal value), or step it with the − / + buttons.
 */
export function Slider({ id, label, min, max, step, value, fmt, onChange }: SliderProps) {
  const { state, actions } = useApp();
  const editing = state.editSlider === id;
  return (
    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minHeight: 22 }}>
        <label style={{ margin: 0, fontSize: 12 }}>{label}</label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 3, flex: 'none' }}>
          {editing ? (
            <input className="input" type="number" min={min} max={max} step={step} defaultValue={+(+value).toPrecision(10)} autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter') e.currentTarget.blur();
                else if (e.key === 'Escape') actions.set({ editSlider: null });
              }}
              onBlur={e => {
                const x = parseFloat(String(e.target.value).replace(',', '.'));
                if (Number.isFinite(x)) onChange(snap(min, max, step, x));
                actions.set({ editSlider: null });
              }}
              style={{ width: 84, padding: '1px 8px', fontSize: 12, textAlign: 'right', minHeight: 0 }} />
          ) : (
            <button className="sg-num sg-valbtn" title="Click to type an exact value" onClick={() => actions.set({ editSlider: id })}>{fmt(value)}</button>
          )}
          <button className="sg-step" title="One step down" onClick={() => onChange(snap(min, max, step, value - step))}>−</button>
          <button className="sg-step" title="One step up" onClick={() => onChange(snap(min, max, step, value + step))}>+</button>
        </span>
      </div>
      <input className="sg-range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} aria-label={label} />
    </div>
  );
}

/** A labelled number field with unit, plus a slider underneath — for interval and EOT bounds. */
export function NumberRange({ label, min, max, step, value, unit, onChange, inputWidth = 82 }: {
  label: string; min: number; max: number; step: number; value: number; unit: string; onChange: (v: number) => void; inputWidth?: number;
}) {
  return (
    <div className="field" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <label style={{ margin: 0, fontSize: 12 }}>{label}</label>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 'none' }}>
          <NumberInput value={value} min={min} max={max} step={step} onCommit={onChange} width={inputWidth} />
          <span className="sg-muted" style={{ fontSize: 11.5 }}>{unit}</span>
        </span>
      </div>
      <input className="sg-range" type="range" min={min} max={max} step={step} value={value} onChange={e => onChange(+e.target.value)} aria-label={label} />
    </div>
  );
}

/**
 * Number input that commits on change like the prototype's native `onChange`: typing a
 * valid number applies it; the field re-syncs whenever the value changes elsewhere.
 */
export function NumberInput({ value, min, max, step, onCommit, width, disabled, accept }: {
  value: number; min?: number; max?: number; step?: number | 'any'; onCommit: (v: number) => void; width: number; disabled?: boolean;
  /** extra validity test before a typed value is applied */
  accept?: (v: number) => boolean;
}) {
  // a local draft lets the field be cleared or hold a half-typed number without snapping back
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  return (
    <input className="input sg-num" type="number" min={min} max={max} step={step} value={shown} disabled={disabled}
      onChange={e => {
        setDraft(e.target.value);
        const x = parseFloat(e.target.value);
        if (Number.isFinite(x) && (!accept || accept(x))) onCommit(x);
      }}
      onBlur={() => setDraft(null)}
      style={{ width, padding: '2px 9px', fontSize: 12, textAlign: 'right', minHeight: 0 }} />
  );
}

/** Pill-shaped segmented control over native radio inputs. */
export function Seg<T extends string>({ name, value, options, onChange, fill = false, size = 12, pad = '6px 10px' }: {
  name: string; value: T; options: [T, ReactNode][]; onChange: (v: T) => void; fill?: boolean; size?: number; pad?: string;
}) {
  return (
    <div className="seg" style={{ width: fill ? '100%' : undefined, flex: fill ? 1 : undefined }}>
      {options.map(([v, label]) => (
        <label key={v} className="seg-opt" style={{ fontSize: size, padding: pad, flex: fill ? 1 : undefined, justifyContent: 'center' }}>
          <input type="radio" name={name} checked={value === v} onChange={() => onChange(v)} />{label}
        </label>
      ))}
    </div>
  );
}

export function Kicker({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div className="card-kicker" style={style}>{children}</div>;
}

export function Tag({ level, bg, fg }: { level: string; bg: string; fg: string }) {
  return <span className="tag" style={{ flex: 'none', background: bg, color: fg }}>{level}</span>;
}
