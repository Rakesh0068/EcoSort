import { Component, type ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorState } from './components/ui'
import Home from './pages/Home'
import Scan from './pages/Scan'
import HowItWorks from './pages/HowItWorks'
import Guide from './pages/Guide'
import About from './pages/About'
import MyScans from './pages/MyScans'
import Future from './pages/Future'
import Research from './pages/Research'

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryFallback>
      <div className="animate-fadeUp">{children}</div>
    </ErrorBoundaryFallback>
  )
}

class ErrorBoundaryFallback extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return (
        <Layout>
          <div className="container-site max-w-2xl py-16">
            <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
          </div>
        </Layout>
      )
    }
    return this.props.children
  }
}

function Public({ children }: { children: React.ReactNode }) {
  return (
    <Layout>
      <Page>{children}</Page>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Consumer site */}
      <Route path="/" element={<Public><Home /></Public>} />
      <Route path="/scan" element={<Public><Scan /></Public>} />
      <Route path="/how-it-works" element={<Public><HowItWorks /></Public>} />
      <Route path="/guide" element={<Public><Guide /></Public>} />
      <Route path="/about" element={<Public><About /></Public>} />
      <Route path="/my-scans" element={<Public><MyScans /></Public>} />
      <Route path="/future" element={<Public><Future /></Public>} />

      {/* Research & ML — all technical functionality preserved */}
      <Route path="/research/*" element={<Page><Research /></Page>} />

      {/* Legacy technical routes → research (keeps bookmarks & backend docs working) */}
      <Route path="/dashboard" element={<Navigate to="/research" replace />} />
      <Route path="/dataset" element={<Navigate to="/research/dataset" replace />} />
      <Route path="/training" element={<Navigate to="/research/training" replace />} />
      <Route path="/evaluation" element={<Navigate to="/research/evaluation" replace />} />
      <Route path="/review" element={<Navigate to="/research/review" replace />} />
      <Route path="/history" element={<Navigate to="/my-scans" replace />} />
      <Route path="/learn" element={<Navigate to="/guide" replace />} />
      <Route path="/robot" element={<Navigate to="/future" replace />} />

      <Route
        path="*"
        element={
          <Public>
            <div className="container-site max-w-xl py-20 text-center">
              <h1 className="font-display text-4xl">That page isn't here.</h1>
              <p className="mt-3 text-[16px] text-muted">Let's get you back to something useful.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <a href="/" className="btn-primary">Home</a>
                <a href="/scan" className="btn-ghost">Scan waste</a>
              </div>
            </div>
          </Public>
        }
      />
    </Routes>
  )
}
