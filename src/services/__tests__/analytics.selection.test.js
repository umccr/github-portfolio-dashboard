import { describe, expect, it } from 'vitest'
import { selectAnalyticsRepositories } from '../analytics'

const repo = (id, orgLogin, stars) => ({
  id,
  name: `repo-${id}`,
  orgLogin,
  stargazers_count: stars,
  forks_count: 0,
  watchers_count: 0,
  pushed_at: '2026-09-01T00:00:00Z',
})

describe('selectAnalyticsRepositories', () => {
  const repos = [
    ...Array.from({ length: 8 }, (_, index) => repo(index, 'OrcaBus', index)),
    ...Array.from({ length: 8 }, (_, index) => repo(index + 10, 'umccr', index)),
  ]

  it('caps anonymous analysis independently for each organization', () => {
    const selected = selectAnalyticsRepositories(repos, 'all', false, 5)

    expect(selected.filter(item => item.orgLogin === 'OrcaBus')).toHaveLength(5)
    expect(selected.filter(item => item.orgLogin === 'umccr')).toHaveLength(5)
  })

  it('applies the global organization scope before sampling', () => {
    const selected = selectAnalyticsRepositories(repos, 'umccr', false, 5)

    expect(selected).toHaveLength(5)
    expect(selected.every(item => item.orgLogin === 'umccr')).toBe(true)
  })

  it('returns every repository in scope for authenticated analysis', () => {
    const selected = selectAnalyticsRepositories(repos, 'OrcaBus', true, 5)

    expect(selected).toHaveLength(8)
  })

  it('applies authentication independently for each organization', () => {
    const selected = selectAnalyticsRepositories(repos, 'all', orgLogin => orgLogin === 'umccr', 5)

    expect(selected.filter(item => item.orgLogin === 'OrcaBus')).toHaveLength(5)
    expect(selected.filter(item => item.orgLogin === 'umccr')).toHaveLength(8)
  })
})
