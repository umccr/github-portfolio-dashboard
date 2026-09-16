import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cacheClear, fetchOrg } from '../github'

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('credential-scoped response cache', () => {
  beforeEach(async () => {
    // Force the in-memory fallback so cache behaviour is observable without
    // IndexedDB, which jsdom does not provide.
    vi.stubGlobal('crypto', {})
    await cacheClear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('reuses a cached response for the same credential', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ login: 'umccr' }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(fetchOrg('umccr', 'token-a')).resolves.toEqual({ login: 'umccr' })
    await expect(fetchOrg('umccr', 'token-a')).resolves.toEqual({ login: 'umccr' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('never serves one credential a response fetched by another', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ login: 'umccr', seenBy: 'token-a' }))
      .mockResolvedValueOnce(jsonResponse({ login: 'umccr', seenBy: 'token-b' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchOrg('umccr', 'token-a')
    const second = await fetchOrg('umccr', 'token-b')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(second).toEqual({ login: 'umccr', seenBy: 'token-b' })
  })

  it('keeps public and authenticated responses apart', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ login: 'umccr', scope: 'public' }))
      .mockResolvedValueOnce(jsonResponse({ login: 'umccr', scope: 'authenticated' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchOrg('umccr', '')
    const authenticated = await fetchOrg('umccr', 'token-a')

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(authenticated).toEqual({ login: 'umccr', scope: 'authenticated' })
  })

  it('drops cached credential responses when the cache is cleared', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ login: 'umccr' }))
    vi.stubGlobal('fetch', fetchMock)

    await fetchOrg('umccr', 'token-a')
    await cacheClear()
    await fetchOrg('umccr', 'token-a')

    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
