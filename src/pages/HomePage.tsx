import psiMl from '../assets/psi-ml.png';
import psiSl from '../assets/psi-sl.png';
import { Plot, type PlotSpec } from '../components/Plot';
import { MethodPanel, MethodTabs, useMethodView } from '../components/MethodView';
import { eduFigures, heroFigures } from '../content/figures';
import { REFS } from '../content/methods';
import { useApp } from '../state';

const REF_LIST = ([['EOT', 'eot'], ['IAW', 'iaw1'], ['IAW', 'iaw2'], ['MWP', 'mwp']] as const).map(([abbr, k]) => ({ abbr, ...REFS[k], url: 'https://doi.org/' + REFS[k].doi }));

export function HomePage() {
  const { state, res, demoRes, actions, C, showTruth } = useApp();
  const hr = (state.src === 'synth' && res) ? res : (demoRes || res);
  const hero = heroFigures(hr, C, showTruth);
  const edu = eduFigures(C);
  const mth = useMethodView();

  return (
    <main className="sg-page" style={{ maxWidth: 1320, margin: '0 auto', padding: '0 26px 90px' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(360px,100%),1fr))', gap: 44, alignItems: 'center', padding: '60px 0 40px' }}>
        <div>
          <span className="tag tag-accent">Interactive article companion</span>
          <h1 className="sg-hero" style={{ fontSize: 48, margin: '16px 0 0', maxWidth: '13em', textWrap: 'pretty' }}>Real-time spectral tracking in porous silicon</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6, maxWidth: '34em', marginTop: 16, textWrap: 'pretty' }}>A porous-silicon biosensor reports every binding event as a small shift of its reflectance spectrum — often smaller than one spectrometer pixel. How that shift is turned into a sensogram decides the detection limit, the baseline noise, and whether the result can be read while the experiment is still running.</p>
          <p className="sg-muted" style={{ fontSize: 15.5, lineHeight: 1.6, maxWidth: '36em', marginTop: 12, textWrap: 'pretty', ['--mute' as string]: '78%' }}>This page runs the four signal-processing methods compared in the manuscript — effective shift in wavelength (ESW), effective optical thickness (EOT), interferogram average over wavelength (IAW) and Morlet wavelet phase (MWP) — side by side on the same spectra, for single-layer films and multilayer microcavities alike.</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 26 }}>
            <button className="btn btn-primary" style={{ fontSize: 15, padding: '11px 22px' }} onClick={actions.goExp}>Open synthetic demo</button>
            <button className="btn btn-secondary" style={{ fontSize: 15, padding: '11px 22px' }} onClick={actions.goExpUpload}>Analyze my data</button>
            <button className="btn btn-ghost" style={{ fontSize: 15, padding: '11px 18px' }} onClick={actions.goMethods}>How the methods work</button>
          </div>
          <p style={{ fontSize: 12.5, color: 'color-mix(in srgb,var(--color-text) 55%,transparent)', marginTop: 14 }}>Everything runs in this browser tab. Nothing is uploaded.</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <Plot plot={hero.spec} />
          <Plot plot={hero.sens} />
        </div>
      </div>

      <div style={{ height: 1, background: 'color-mix(in srgb,var(--color-text) 12%,transparent)', margin: '24px 0 56px' }} />

      <h2 style={{ fontSize: 30 }}>What the spectrometer sees</h2>
      <p style={{ maxWidth: '48em', fontSize: 16, lineHeight: 1.65, textWrap: 'pretty' }}>White light reflects from the top of the porous film and from each interface inside it, and the returns interfere. As analyte fills the pores, the effective refractive index <em>n</em> rises, the effective optical thickness <strong>EOT = 2nL</strong> grows while the physical thickness <em>L</em> stays fixed, and the whole spectrum red-shifts. A change of amplitude, or a uniform offset with no shift, is not binding — it is noise every method has to reject.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, marginTop: 26 }}>
        <FilmCard img={psiSl} imgW={230} alt="Single porous-silicon layer on a silicon substrate" kicker="Single layer"
          text="One porous film is a Fabry–Pérot interferometer: evenly spaced fringes whose spacing is set by the optical thickness. Every maximum and minimum moves together."
          plot={edu.sl} />
        <FilmCard img={psiMl} imgW={210} alt="Porous-silicon microcavity: two Bragg mirrors around a defect layer" kicker="Multilayer microcavity"
          text="Two Bragg mirrors around a defect layer open a narrow resonance dip inside the photonic stopband. Tracking that dip directly is limited by the spectrometer's resolution — about 1.5 nm in the near infrared."
          plot={edu.ml} />
      </div>
      <p style={{ maxWidth: '48em', fontSize: 12.5, lineHeight: 1.55, color: 'color-mix(in srgb,var(--color-text) 52%,transparent)', marginTop: 12 }}>Both panels are computed with a transfer-matrix model of the film; the binding shift is exaggerated so it can be seen at this scale.</p>

      <h2 style={{ fontSize: 30, marginTop: 64 }}>Four signal-processing methods for sensing</h2>
      <p style={{ maxWidth: '48em', fontSize: 16, lineHeight: 1.65, textWrap: 'pretty' }}>Each method collapses a whole spectrum into one number per time point, and the series of those numbers is the sensogram. They differ in which part of the spectrum they read — a pair of pixels, the whole difference curve, a Fourier peak or a phase — and that choice decides what they are sensitive to. The traces come from the default synthetic microcavity run.</p>
      <div className="card elev-sm" style={{ marginTop: 22, padding: 'var(--space-5, 22px)', gap: 18 }}>
        <MethodTabs />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 28, alignItems: 'start' }}>
          <MethodPanel compact />
          <Plot plot={mth.sens} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(340px,100%),1fr))', gap: 26, marginTop: 64, alignItems: 'start' }}>
        <div className="card" style={{ background: 'var(--color-accent-2-100)', gap: 12, padding: 'var(--space-6)', borderRadius: 'var(--radius-lg)' }}>
          <div className="card-kicker" style={{ color: 'var(--color-accent-2-800)' }}>Local by design</div>
          <h3 style={{ fontSize: 24, margin: 0 }}>Your spectra are processed locally in this browser and are not uploaded.</h3>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.6, maxWidth: '40em' }}>There is no backend, no account and no database. Parsing, interpolation, FFT, wavelet convolution and every metric run in this page. Close the tab and the data is gone.</p>
        </div>
        <div className="card" style={{ gap: 10 }}>
          <div className="card-kicker">Method references</div>
          {REF_LIST.map((rf, i) => (
            <p key={i} style={{ margin: 0, fontSize: 13, lineHeight: 1.55 }}><strong>{rf.abbr}</strong> — {rf.text} <a href={rf.url} target="_blank" rel="noopener">{rf.doi}</a></p>
          ))}
          <p style={{ margin: 0, fontSize: 12.5, color: 'color-mix(in srgb,var(--color-text) 55%,transparent)' }}>Code and data availability: to be linked on publication.</p>
        </div>
      </div>
    </main>
  );
}

function FilmCard({ img, imgW, alt, kicker, text, plot }: { img: string; imgW: number; alt: string; kicker: string; text: string; plot: PlotSpec }) {
  return (
    <div className="card elev-sm" style={{ padding: 'var(--space-4)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 24, alignItems: 'center' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'flex-start' }}>
        <img src={img} alt={alt} style={{ width: '100%', maxWidth: imgW, height: 'auto', display: 'block' }} />
        <div className="card-kicker">{kicker}</div>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'color-mix(in srgb,var(--color-text) 62%,transparent)', textWrap: 'pretty' }}>{text}</p>
      </div>
      <div className="sg-span2" style={{ minWidth: 0 }}>
        <Plot plot={plot} />
      </div>
    </div>
  );
}
