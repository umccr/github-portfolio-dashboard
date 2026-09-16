import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fetchContributorActivity } from '../github'

function githubResponse(status, body, headers = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: vi.fn(name => headers[name.toLowerCase()] ?? null),
    },
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('fetchContributorActivity', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('uses one date-scoped search and preserves merged status from the result', async () => {
    const mergedPullRequest = {
      id: 1,
      pull_request: { merged_at: '2026-09-15T12:26:49Z' },
    }
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      githubResponse(200, {
        total_count: 1,
        incomplete_results: false,
        items: [mergedPullRequest],
      }),
    )

    const result = await fetchContributorActivity('OrcaBus', 'raylrui', 'org-token', {
      startDate: '2025-09-16',
      endDate: '2026-09-16',
    })

    expect(result.items).toEqual([mergedPullRequest])
    expect(result.usedPublicFallback).toBe(false)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const [requestUrl, requestOptions] = fetchMock.mock.calls[0]
    const url = new URL(requestUrl)
    expect(url.pathname).toBe('/search/issues')
    expect(url.searchParams.get('q')).toBe(
      'author:raylrui org:OrcaBus created:2025-09-16..2026-09-16',
    )
    expect(url.searchParams.get('page')).toBe('1')
    expect(requestOptions.headers.Authorization).toBe('Bearer org-token')
    expect(requestUrl).not.toContain('is%3Amerged')
  })

  it('falls back to disclosed public results when an authenticated search returns 422', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(githubResponse(422, { message: 'Validation Failed' }))
      .mockResolvedValueOnce(
        githubResponse(200, {
          total_count: 1,
          incomplete_results: false,
          items: [{ id: 2 }],
        }),
      )

    const result = await fetchContributorActivity('umccr', 'raylrui', 'org-token')

    expect(result.items).toEqual([{ id: 2 }])
    expect(result.usedPublicFallback).toBe(true)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer org-token')
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined()
  })

  it('stops at GitHub Search’s 1,000-result boundary', async () => {
    const pageItems = Array.from({ length: 100 }, (_, index) => ({ id: index }))
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      githubResponse(200, {
        total_count: 1_001,
        incomplete_results: false,
        items: pageItems,
      }),
    )

    const result = await fetchContributorActivity('OrcaBus', 'busy-user', '')

    expect(fetchMock).toHaveBeenCalledTimes(10)
    expect(result.items).toHaveLength(1_000)
    expect(result.truncated).toBe(true)
  })
})
