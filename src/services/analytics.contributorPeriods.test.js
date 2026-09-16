import { describe, expect, it } from 'vitest'
import { buildPeriodContributors, getContributorPeriodStart } from './analytics'

const DAY_MS = 24 * 60 * 60 * 1000

function weekAt(timestamp, commits) {
  return { w: Math.floor(timestamp / 1000), a: 0, d: 0, c: commits }
}

describe('contributor period analytics', () => {
  const now = Date.UTC(2026, 8, 15)

  it('uses rolling 30, 90, 180, and 365 day periods', () => {
    expect(getContributorPeriodStart('1m', now)).toBe(now - 30 * DAY_MS)
    expect(getContributorPeriodStart('3m', now)).toBe(now - 90 * DAY_MS)
    expect(getContributorPeriodStart('6m', now)).toBe(now - 180 * DAY_MS)
    expect(getContributorPeriodStart('12m', now)).toBe(now - 365 * DAY_MS)
    expect(getContributorPeriodStart('all', now)).toBeNull()
  })

  it('sums overlapping weekly commit buckets and deduplicates users by GitHub id', () => {
    const start = getContributorPeriodStart('3m', now)
    const statsByRepo = {
      'umccr/repo-a': [
        {
          author: { id: 42, login: 'alice-old', avatar_url: 'alice.png' },
          weeks: [
            weekAt(start - 8 * DAY_MS, 50),
            weekAt(start - 3 * DAY_MS, 2),
            weekAt(now - 7 * DAY_MS, 3),
          ],
        },
        {
          author: { id: 99, login: 'inactive', avatar_url: 'inactive.png' },
          weeks: [weekAt(start - 30 * DAY_MS, 12)],
        },
      ],
      'OrcaBus/repo-b': [
        {
          author: { id: 42, login: 'alice', avatar_url: 'alice-new.png' },
          weeks: [weekAt(now - 14 * DAY_MS, 4)],
        },
      ],
    }

    const contributors = buildPeriodContributors(statsByRepo, '3m', now)

    expect(contributors).toHaveLength(1)
    expect(contributors[0]).toMatchObject({
      id: 42,
      login: 'alice',
      avatar_url: 'alice-new.png',
      totalContribs: 9,
      isConnector: false,
      isCrossOrg: true,
    })
    expect(contributors[0].repos).toHaveLength(2)
    expect(contributors[0].orgs.sort()).toEqual(['OrcaBus', 'umccr'])
    expect(contributors[0].lastActive).toBe(new Date(now - 7 * DAY_MS).toISOString())
  })
})
