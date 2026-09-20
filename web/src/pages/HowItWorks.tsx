import { Link } from 'react-router-dom'
import { SiteSection, TechDetails } from '../components/ui'

export default function HowItWorks() {
  return (
    <div>
      <section className="hero-blob">
        <div className="container-site max-w-3xl py-14 text-center">
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">How EcoSort works.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-relaxed text-muted">
            Simple on the outside, careful on the inside. Here's the journey from your photo to useful guidance.
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface/50">
        <div className="container-site max-w-3xl section-pad !py-12">
          <div className="space-y-3">
            {[
              { t: 'How EcoSort sees waste', d: 'You share a photo. EcoSort looks at shapes, textures, colours and materials — the visual clues that distinguish a glass jar from a plastic bottle, or cardboard from paper.' },
              { t: 'How images are prepared', d: 'Photos come in all sizes and lighting. EcoSort tidies each image into a consistent format first, so it can focus on the waste itself rather than the background.' },
              { t: 'How EcoSort learned', d: 'EcoSort studied thousands of real waste photos, each labelled by material. It practised on most of them and was tested on photos it had never seen — so we know how it handles the real world.' },
              { t: 'How predictions are checked', d: 'EcoSort is tested on a separate set of images it never trained on. We look at where it shines and where it confuses similar materials — and we share those results honestly in the Research area.' },
              { t: 'How feedback helps', d: 'When you say “not quite” and tell EcoSort what something actually was, that correction is saved. Verified corrections become examples for future versions to learn from.' },
              { t: 'How this connects to a robot', d: 'The same identification skill could one day guide a sorting arm: camera sees an item, EcoSort recognises it, and the system decides which bin it belongs in. Today you can watch that idea in the simulation.' },
            ].map((s, i) => (
              <div key={s.t} className="card p-6 sm:p-7">
                <div className="flex items-center gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest text-[16px] font-bold text-white dark:bg-emerald">{i + 1}</span>
                  <h2 className="text-[19px] font-bold text-ink">{s.t}</h2>
                </div>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{s.d}</p>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <TechDetails summary="See the technical details">
              <div className="text-[14px] leading-relaxed text-muted">
                <p>
                  Underneath, EcoSort runs an EfficientNet-B0 image classifier (224 × 224 input) trained with transfer
                  learning, evaluated on a held-out test split with per-class precision, recall and F1, and explained
                  with Grad-CAM. Confidence gating decides whether a prediction is acted on or held for review.
                </p>
                <p className="mt-2">
                  Full numbers, training runs, confusion pairs and dataset health live in{' '}
                  <Link to="/research" className="font-semibold text-emerald hover:underline">Research</Link>.
                </p>
              </div>
            </TechDetails>
          </div>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            <Link to="/scan" className="btn-primary">Try a scan</Link>
            <Link to="/future" className="btn-ghost">See where this is going</Link>
          </div>
        </div>
      </section>

      <section>
        <div className="container-site max-w-3xl py-6 pb-16">
          <SiteSection title="Honest by design." sub="If EcoSort isn't sure, it says so. If hardware isn't connected, it says that too. You'll never see a fake robot or a made-up accuracy here." />
        </div>
      </section>
    </div>
  )
}
