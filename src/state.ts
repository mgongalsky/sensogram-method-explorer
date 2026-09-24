import { createContext, useContext } from 'react';
import { DEFAULTS, type Params } from './analysis/constants';
import type { FilmModel } from './analysis/synthetic';
import type { AnalysisResult, ConvMode, Dataset, DenMode, DtUnit, Note, Progress, Source } from './analysis/types';
import type { MethodKey, Palette } from './content/methods';
import type { FileRow } from './io/validateSpectra';

export type View = 'home' | 'methods' | 'exp';
export type Tab = 'data' | 'spectra' | 'sens' | 'overview' | 'diag' | 'export';

export interface AppState {
  view: View;
  tab: Tab;
  method: MethodKey;
  src: Source;
  p: Params;
  sgOn: boolean;
  denMode: DenMode;
  convMode: ConvMode;
  timeIdx: number;
  axis: 'lambda' | 'k';
  synthModel: FilmModel;
  nzShot: boolean;
  nzLamp: boolean;
  nzStretch: boolean;
  advOpen: boolean;
  paramsOpen: boolean;
  busy: boolean;
  ms: number;
  prog: Progress | null;
  dataset: Dataset | null;
  files: FileRow[];
  report: Note[];
  parsing: boolean;
  progress: string;
  useImported: boolean;
  dtUnit: DtUnit;
  /** which drop zone the current upload arrived in */
  filmKind: FilmModel;
  drag: FilmModel | null;
  editSlider: string | null;
  brush: { a: number; b: number } | null;
}

export const INITIAL_STATE: AppState = {
  view: 'home', tab: 'spectra', method: 'esw', src: 'synth', p: { ...DEFAULTS },
  sgOn: true, denMode: 'next', convMode: 'theory',
  timeIdx: 110, axis: 'lambda', synthModel: 'cavity', nzShot: true, nzLamp: true, nzStretch: true,
  advOpen: false, paramsOpen: false, busy: false, ms: 0, prog: null,
  dataset: null, files: [], report: [], parsing: false, progress: '', useImported: false, dtUnit: 's', filmKind: 'cavity', drag: null,
  editSlider: null, brush: null
};

export type Patch = Partial<AppState> | ((s: AppState) => Partial<AppState>);

export interface Actions {
  /** merge state without re-running the analysis */
  set: (patch: Patch) => void;
  /** merge state and schedule a re-analysis */
  edit: (patch: Patch) => void;
  setP: <K extends keyof Params>(k: K, v: Params[K]) => void;
  setPs: (obj: Partial<Params>) => void;
  setDt: (val: number, unit: DtUnit) => void;
  cancelRun: () => void;
  handleFiles: (files: FileList | File[] | null, kind: FilmModel) => void;
  loadBundled: (id: string, kind: FilmModel) => void;
  loadSyntheticAsUpload: () => void;
  clearData: () => void;
  reorder: (kind: 'reverse' | 'up' | 'down' | 'remove', i?: number) => void;
  autoLc: () => void;
  goHome: () => void;
  goMethods: () => void;
  goExp: () => void;
  goExpUpload: () => void;
  goTab: (t: Tab) => void;
  magFor: (j: number) => Float64Array | null;
  phaseKFor: (j: number) => number[] | null;
}

export interface AppCtx {
  state: AppState;
  actions: Actions;
  /** current analysis result */
  res: AnalysisResult | null;
  /** most recent synthetic-demo result, used by the Home and Methods sensograms */
  demoRes: AnalysisResult | null;
  C: Palette;
  showTruth: boolean;
  compact: boolean;
}

export const Ctx = createContext<AppCtx | null>(null);

export function useApp(): AppCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useApp outside provider');
  return c;
}

/** Which film the current data is: the synthetic model, or the drop zone it arrived in. */
export const isSingleFilm = (st: AppState): boolean => st.src === 'synth' ? st.synthModel === 'single' : st.filmKind === 'single';
