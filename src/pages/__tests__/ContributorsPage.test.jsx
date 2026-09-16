import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import ContributorsPage from '../ContributorsPage'

const mocks = vi.hoisted(() => ({
  fetchContributorStats: vi.fn(),
  state: {},
}))

vi.mock('../../context/app-context', () => ({ useApp: () => mocks.state }))
vi.mock('../../services/github', () => ({ fetchContributorStats: mocks.fetchContributorStats }))

function repository(name) {
  return {
    id: name,
    name,
    orgLogin: 'umccr',
    stargazers_count: 0,
    forks_count: 0,
    watchers_count: 0,
    pushed_at: new Date().toISOString(),
  }
}

describe('ContributorsPage period filter', () => {
  beforeEach(() => {
    mocks.fetchContributorStats.mockReset()
    mocks.state = {
      model: {
        contributors: [
          {
            id: 42,
            login: 'alice',
            avatar_url: 'https://example.test/alice.png',
            totalContribs: 99,
            repos: [
              { name: 'repo-a', org: 'umccr', count: 99, lastActive: '2026-09-01T00:00:00Z' },
            ],
            orgs: ['umccr'],
            lastActive: '2026-09-01T00:00:00Z',
            freshness: 100,
          },
        ],
        allRepos: [repository('repo-a')],
        totalRepos: [repository('repo-a')],
      },
      isComplete: true,
      loading: false,
      runFullExplore: vi.fn(),
      selectedOrg: 'umccr',
      getPatForOrg: vi.fn(() => 'test-token'),
      scopeHasPat: true,
    }
  })

  it('shows lifetime commits clearly and loads weekly data for a selected period', async () => {
    const recentWeek = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
    mocks.fetchContributorStats.mockResolvedValue([
      {
        author: { id: 42, login: 'alice', avatar_url: 'https://example.test/alice.png' },
        weeks: [{ w: recentWeek, a: 0, d: 0, c: 4 }],
      },
    ])
    const user = userEvent.setup()

    render(
      <MemoryRouter>
        <ContributorsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Commits across all accessible repositories')).toBeInTheDocument()
    expect(screen.getByText('1 / 1')).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: /commits/i })).toBeInTheDocument()
    expect(within(screen.getByText('alice').closest('tr')).getByText('99')).toBeInTheDocument()

    await user.selectOptions(screen.getByLabelText('Contribution period'), '3m')

    await waitFor(() =>
      expect(mocks.fetchContributorStats).toHaveBeenCalledWith('umccr', 'repo-a', 'test-token'),
    )
    const aliceRow = await screen.findByText('alice')
    expect(screen.getByRole('columnheader', { name: /commits in period/i })).toBeInTheDocument()
    expect(within(aliceRow.closest('tr')).getByText('4')).toBeInTheDocument()
  })

  it('labels unauthenticated results as sampled and does not calculate bus factor', () => {
    mocks.state = {
      ...mocks.state,
      isComplete: false,
      getPatForOrg: vi.fn(() => ''),
      scopeHasPat: false,
      model: {
        ...mocks.state.model,
        allRepos: Array.from({ length: 10 }, (_, index) => repository(`sample-${index + 1}`)),
        totalRepos: Array.from({ length: 12 }, (_, index) => repository(`repo-${index + 1}`)),
      },
    }

    render(
      <MemoryRouter>
        <ContributorsPage />
      </MemoryRouter>,
    )

    expect(screen.getByText('Sampled commits — top 10 repositories')).toBeInTheDocument()
    expect(screen.getByText('10 / 12')).toBeInTheDocument()
    expect(screen.getByText('Complete repository coverage required')).toBeInTheDocument()
    expect(screen.queryByText(/Bus Factor: \d/)).not.toBeInTheDocument()
    expect(screen.getAllByRole('link', { name: /add a pat/i })).not.toHaveLength(0)
    screen.getAllByRole('link', { name: /add a pat/i }).forEach(link => {
      expect(link).toHaveAttribute('href', '/settings')
    })
  })
})
