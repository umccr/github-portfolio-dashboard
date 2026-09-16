import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchContributorStats } from './github'

describe('fetchContributorStats', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('retries a 202 response without caching it', async () => {
    const stats = [{ author: { id: 1, login: 'alice' }, weeks: [] }]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 202 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify(stats), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    const result = await fetchContributorStats('OrcaBus', 'example repo', '', {
      maxAttempts: 2,
      retryDelayMs: 0,
    })

    expect(result).toEqual(stats)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][0]).toBe(
      'https://api.github.com/repos/OrcaBus/example%20repo/stats/contributors',
    )
  })

  it('reports when GitHub is still preparing statistics', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 202 })))

    await expect(
      fetchContributorStats('umccr', 'repo', '', {
        maxAttempts: 1,
        retryDelayMs: 0,
      }),
    ).rejects.toThrow('STATS_PENDING')
  })
})
