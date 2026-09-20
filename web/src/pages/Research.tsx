import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { Layout } from '../components/Layout'
import Dashboard from './Dashboard'
import Dataset from './Dataset'
import Models from './Models'
import Experiments from './Experiments'
import Evaluation from './Evaluation'
import ErrorAnalysisPage from './ErrorAnalysis'
import ActiveLearning from './ActiveLearning'
import Acquisition from './Acquisition'
import Explainability from './Explainability'
import Predictions from './Predictions'
import AnalyticsPage from './Analytics'
import Training from './Training'
import Review from './Review'
import { cx } from '../components/ui'

const TABS = [
  { to: '/research', label: 'Overview', end: true },
  { to: '/research/dataset', label: 'Dataset' },
  { to: '/research/models', label: 'Models' },
  { to: '/research/experiments', label: 'Experiments' },
  { to: '/research/evaluation', label: 'Evaluation' },
  { to: '/research/errors', label: 'Error Analysis' },
  { to: '/research/active-learning', label: 'Active Learning' },
  { to: '/research/acquisition', label: 'Data Acquisition' },
  { to: '/research/explainability', label: 'Explainability' },
  { to: '/research/predictions', label: 'Predictions' },
  { to: '/research/analytics', label: 'Analytics' },
  { to: '/research/training', label: 'Training' },
  { to: '/research/review', label: 'Review & Learning' },
]

function Shell({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  return (
    <div className="container-site max-w-[1400px] py-8">
      <div className="max-w-3xl">
        <div className="kicker-tech">Research & ML — technical area</div>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">Under the hood.</h1>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
          Dataset, models, experiments, evaluation, active learning and system health. Real numbers from the backend —
          nothing here is mocked. Currently at <span className="font-mono text-[13px]">{loc.pathname}</span>.
        </p>
      </div>
      <nav className="mt-6 flex flex-wrap gap-1.5 border-b border-line pb-3" aria-label="Research">
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            end={t.end}
            className={({ isActive }) =>
              cx(
                'rounded-full px-4 py-2 text-[14px] font-semibold transition',
                isActive ? 'bg-ink text-bg' : 'border border-line bg-surface text-muted hover:text-ink',
              )
            }
          >
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className="mt-6">{children}</div>
    </div>
  )
}

export default function Research() {
  return (
    <Layout>
      <Shell>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="dataset" element={<Dataset />} />
          <Route path="models" element={<Models />} />
          <Route path="experiments" element={<Experiments />} />
          <Route path="evaluation" element={<Evaluation />} />
          <Route path="errors" element={<ErrorAnalysisPage />} />
          <Route path="active-learning" element={<ActiveLearning />} />
          <Route path="acquisition" element={<Acquisition />} />
          <Route path="explainability" element={<Explainability />} />
          <Route path="predictions" element={<Predictions />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="training" element={<Training />} />
          <Route path="review" element={<Review />} />
        </Routes>
      </Shell>
    </Layout>
  )
}
