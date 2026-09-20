import { Link } from 'react-router-dom'
import { SiteSection } from '../components/ui'

export default function About() {
  return (
    <div>
      <section className="hero-blob">
        <div className="container-site max-w-3xl py-14 text-center">
          <h1 className="font-display text-4xl leading-[1.05] sm:text-5xl">Helping everyday sorting decisions.</h1>
          <p className="mx-auto mt-4 max-w-xl text-[18px] leading-relaxed text-muted">
            EcoSort is an AI-powered waste identification and recycling assistant — designed to eventually power
            automated waste-sorting robots.
          </p>
        </div>
      </section>

      <section className="border-t border-line bg-surface/50">
        <div className="container-site max-w-3xl section-pad !py-12">
          <div className="card p-7 sm:p-9">
            <h2 className="text-[22px] font-bold text-ink">What EcoSort is</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              For a normal visitor, EcoSort is simple: show us your waste, and we'll help you identify it and know what
              to do with it. Underneath, a real image-recognition model does the looking — trained on thousands of
              waste photos, tested on images it has never seen, and improved through verified feedback.
            </p>
            <h2 className="mt-8 text-[22px] font-bold text-ink">What EcoSort isn't</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              EcoSort doesn't pretend a robot is connected when it isn't. It doesn't invent accuracy numbers or dataset
              sizes. Empty states are honest: if an evaluation hasn't been run yet, it says so. If no robot hardware is
              attached, it offers a simulation instead.
            </p>
            <h2 className="mt-8 text-[22px] font-bold text-ink">Where it's going</h2>
            <p className="mt-3 text-[16px] leading-relaxed text-muted">
              The same intelligence that helps you today could help sorting systems tomorrow — recognising and
              separating waste at scale. You can follow that journey in{' '}
              <Link to="/future" className="font-semibold text-emerald hover:underline">Where EcoSort is going</Link>,
              and inspect the real machinery in{' '}
              <Link to="/research" className="font-semibold text-emerald hover:underline">Research</Link>.
            </p>
          </div>

          <div className="mt-8">
            <SiteSection title="Try it yourself." sub="The fastest way to understand EcoSort is to scan something." />
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link to="/scan" className="btn-primary">Scan Your Waste</Link>
              <Link to="/guide" className="btn-ghost">Browse the Waste Guide</Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
