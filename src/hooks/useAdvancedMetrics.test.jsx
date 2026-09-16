import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { useAdvancedMetrics } from './useSortedData'

describe('useAdvancedMetrics', () => {
  it('returns a truthful empty result when no pull requests are loaded', () => {
    const { result } = renderHook(() => useAdvancedMetrics([]))

    expect(result.current).toEqual({
      avgMergeDays: 0,
      acceptanceRate: 0,
      merged: 0,
      rejected: 0,
    })
  })

  it('calculates merge time and acceptance from completed pull requests', () => {
    const pulls = [
      {
        state: 'closed',
        created_at: '2026-01-01T00:00:00Z',
        merged_at: '2026-01-03T00:00:00Z',
      },
      {
        state: 'closed',
        created_at: '2026-01-01T00:00:00Z',
        merged_at: null,
      },
    ]

    const { result } = renderHook(() => useAdvancedMetrics(pulls))

    expect(result.current.avgMergeDays).toBe(2)
    expect(result.current.acceptanceRate).toBe(50)
    expect(result.current.merged).toBe(1)
    expect(result.current.rejected).toBe(1)
  })

  it('does not classify open pull requests as rejected', () => {
    const { result } = renderHook(() =>
      useAdvancedMetrics([{ state: 'open', created_at: '2026-01-01T00:00:00Z', merged_at: null }]),
    )

    expect(result.current.merged).toBe(0)
    expect(result.current.rejected).toBe(0)
    expect(result.current.acceptanceRate).toBe(0)
  })
})
