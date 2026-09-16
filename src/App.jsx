import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppProvider } from './context/AppContext'
import { ThemeProvider } from './context/ThemeContext'
import Navbar from './components/Navbar'
import RateLimitBanner from './components/RateLimitBanner'
import RequireAnalysis from './components/RequireAnalysis'
import { Spinner } from './components/UI'

const OverviewPage = lazy(() => import('./pages/OverviewPage'))
const RepositoriesPage = lazy(() => import('./pages/RepositoriesPage'))
const ContributorsPage = lazy(() => import('./pages/ContributorsPage'))
const ContributorProfilePage = lazy(() => import('./pages/ContributorProfilePage'))
const AnalyticsPage = lazy(() => import('./pages/AnalyticsPage'))
const GovernancePage = lazy(() => import('./pages/GovernancePage'))
const SettingsPage = lazy(() => import('./pages/SettingsPage'))

function PageFallback() {
  return (
    <div
      style={{ minHeight: '55vh', display: 'grid', placeItems: 'center' }}
      role="status"
      aria-label="Loading page"
    >
      <Spinner />
    </div>
  )
}

function Layout({ children }) {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Navbar />
      <RateLimitBanner />
      <main style={{ flex: 1 }}>{children}</main>
    </div>
  )
}

function Guarded({ children }) {
  return <RequireAnalysis>{children}</RequireAnalysis>
}

function AppContent() {
  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route
            path="/overview"
            element={
              <Guarded>
                <OverviewPage />
              </Guarded>
            }
          />
          <Route
            path="/repositories"
            element={
              <Guarded>
                <RepositoriesPage />
              </Guarded>
            }
          />
          <Route
            path="/contributors"
            element={
              <Guarded>
                <ContributorsPage />
              </Guarded>
            }
          />
          <Route
            path="/contributors/:username"
            element={
              <Guarded>
                <ContributorProfilePage />
              </Guarded>
            }
          />
          <Route
            path="/analytics"
            element={
              <Guarded>
                <AnalyticsPage />
              </Guarded>
            }
          />
          <Route
            path="/governance"
            element={
              <Guarded>
                <GovernancePage />
              </Guarded>
            }
          />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </Layout>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ThemeProvider>
  )
}
