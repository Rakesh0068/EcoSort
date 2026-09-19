import { Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { ErrorState } from './components/ui'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import Scan from './pages/Scan'
import History from './pages/History'
import Robot from './pages/Robot'
import Dataset from './pages/Dataset'
import Training from './pages/Training'
import Evaluation from './pages/Evaluation'
import Review from './pages/Review'
import Learn from './pages/Learn'

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundaryFallback>
      <div className="animate-fadeUp">{children}</div>
    </ErrorBoundaryFallback>
  )
}

/** Minimal guard so a single broken page cannot blank the whole app. */
import { Component, type ReactNode } from 'react'

class ErrorBoundaryFallback extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  render() {
    if (this.state.error) {
      return <ErrorState message={this.state.error.message} onRetry={() => this.setState({ error: null })} />
    }
    return this.props.children
  }
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route
        path="/dashboard"
        element={
          <Layout>
            <Page>
              <Dashboard />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/scan"
        element={
          <Layout>
            <Page>
              <Scan />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/history"
        element={
          <Layout>
            <Page>
              <History />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/robot"
        element={
          <Layout>
            <Page>
              <Robot />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/dataset"
        element={
          <Layout>
            <Page>
              <Dataset />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/training"
        element={
          <Layout>
            <Page>
              <Training />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/evaluation"
        element={
          <Layout>
            <Page>
              <Evaluation />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/review"
        element={
          <Layout>
            <Page>
              <Review />
            </Page>
          </Layout>
        }
      />
      <Route
        path="/learn"
        element={
          <Layout>
            <Page>
              <Learn />
            </Page>
          </Layout>
        }
      />
      <Route
        path="*"
        element={
          <Layout>
            <ErrorState message={`No route matches this URL.`} />
          </Layout>
        }
      />
    </Routes>
  )
}
