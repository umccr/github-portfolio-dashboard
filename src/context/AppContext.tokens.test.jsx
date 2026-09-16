import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { AppProvider } from './AppContext'
import { useApp } from './app-context'
import { STORAGE_KEYS } from '../config/dashboard'

const mocks = vi.hoisted(() => ({
  fetchOrg: vi.fn(),
  fetchRepos: vi.fn(),
  fetchContributors: vi.fn(),
}))

vi.mock('../services/github', () => ({
  cacheClear: vi.fn(),
  fetchOrg: mocks.fetchOrg,
  fetchRepos: mocks.fetchRepos,
  fetchContributors: mocks.fetchContributors,
  fetchIssues: vi.fn(),
  fetchPulls: vi.fn(),
  fetchRateLimit: vi.fn(),
}))

vi.mock('../services/cache', () => ({
  clearAnalysis: vi.fn(),
  loadAnalysis: vi.fn().mockResolvedValue(null),
  saveAnalysis: vi.fn(),
}))

function Probe() {
  const { model } = useApp()
  return <div>{model ? 'loaded' : 'waiting'}</div>
}

describe('AppProvider organization credentials', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.clear()
    sessionStorage.setItem(STORAGE_KEYS.tokens.OrcaBus, 'orcabus-token')
    sessionStorage.setItem(STORAGE_KEYS.tokens.umccr, 'umccr-token')

    mocks.fetchOrg.mockReset().mockImplementation((organization, token) =>
      Promise.resolve({
        login: organization,
        public_repos: 1,
        token,
      }),
    )
    mocks.fetchRepos.mockReset().mockImplementation((organization, _count, token) =>
      Promise.resolve([
        {
          id: `${organization}-repo`,
          name: 'repo',
          orgLogin: organization,
          pushed_at: '2026-09-01T00:00:00Z',
          token,
        },
      ]),
    )
    mocks.fetchContributors.mockReset().mockResolvedValue([])
  })

  it('routes every GitHub request through the repository owner token', async () => {
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    )

    await waitFor(() => expect(mocks.fetchContributors).toHaveBeenCalledTimes(2))

    expect(mocks.fetchOrg).toHaveBeenCalledWith('OrcaBus', 'orcabus-token')
    expect(mocks.fetchOrg).toHaveBeenCalledWith('umccr', 'umccr-token')
    expect(mocks.fetchRepos).toHaveBeenCalledWith('OrcaBus', 1, 'orcabus-token')
    expect(mocks.fetchRepos).toHaveBeenCalledWith('umccr', 1, 'umccr-token')
    expect(mocks.fetchContributors).toHaveBeenCalledWith('OrcaBus', 'repo', 'orcabus-token')
    expect(mocks.fetchContributors).toHaveBeenCalledWith('umccr', 'repo', 'umccr-token')
  })
})
