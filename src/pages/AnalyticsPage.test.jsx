import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AnalyticsPage from './AnalyticsPage'

const app = vi.hoisted(() => ({
  state: {
    model: { totalRepos: [] },
    issuesData: {},
    pullsData: {},
    govLoading: false,
    advanceAnalyticsLoading: true,
    advanceAnalyticsComplete: false,
    runFullAnalytics: vi.fn(),
    auditComplete: false,
    loading: false,
    selectedOrg: 'all',
    analyticsError: '',
    rateLimit: { remaining: 50, reset: 0 },
    scopeHasPat: false,
  },
}))

vi.mock('../context/app-context', () => ({ useApp: () => app.state }))

describe('AnalyticsPage loading state', () => {
  it('renders anonymous advanced-analytics progress without crashing', () => {
    render(
      <MemoryRouter>
        <AnalyticsPage />
      </MemoryRouter>,
    )

    expect(
      screen.getByText(
        /fetching pull request history for a repository sample where a token is missing/i,
      ),
    ).toBeInTheDocument()
  })
})
