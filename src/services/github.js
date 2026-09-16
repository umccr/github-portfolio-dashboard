const DB_NAME = 'github-dashboard-api-cache-v1'
const STORE = 'responses'
const TTL_MS = 3_600_000
const API_VERSION = '2022-11-28'

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = event => {
      const db = event.target.result
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'key' })
    }
    request.onsuccess = event => resolve(event.target.result)
    request.onerror = () => reject(request.error)
  })
}

async function cacheGetEntry(key) {
  try {
    const db = await openDB()
    return await new Promise(resolve => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(key)
      request.onsuccess = () => {
        const result = request.result || null
        db.close()
        resolve(result)
      }
      request.onerror = () => {
        db.close()
        resolve(null)
      }
    })
  } catch {
    return null
  }
}

async function cacheSetEntry(key, value, etag) {
  try {
    const db = await openDB()
    return await new Promise(resolve => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).put({ key, value, etag, savedAt: Date.now() })
      transaction.oncomplete = () => {
        db.close()
        resolve(true)
      }
      transaction.onerror = () => {
        db.close()
        resolve(false)
      }
      transaction.onabort = () => {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

export async function cacheClear() {
  try {
    const db = await openDB()
    return await new Promise(resolve => {
      const transaction = db.transaction(STORE, 'readwrite')
      transaction.objectStore(STORE).clear()
      transaction.oncomplete = () => {
        db.close()
        resolve(true)
      }
      transaction.onerror = () => {
        db.close()
        resolve(false)
      }
      transaction.onabort = () => {
        db.close()
        resolve(false)
      }
    })
  } catch {
    return false
  }
}

function requestHeaders(pat, etag) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
  }
  if (pat) headers.Authorization = `Bearer ${pat}`
  if (etag) headers['If-None-Match'] = etag
  return headers
}

function publishRateLimit(response) {
  const raw = [
    response.headers.get('x-ratelimit-limit'),
    response.headers.get('x-ratelimit-remaining'),
    response.headers.get('x-ratelimit-used'),
    response.headers.get('x-ratelimit-reset'),
  ]
  if (raw.some(value => value === null)) return

  const [limit, remaining, used, reset] = raw.map(Number)

  if (![limit, remaining, used, reset].every(Number.isFinite)) return

  window.dispatchEvent(
    new CustomEvent('rate-limit-update', {
      detail: { limit, remaining, used, reset },
    }),
  )
}

async function fetchWithCache(url, pat) {
  // Do not put the token itself in IndexedDB. Authentication mode is enough to
  // prevent public responses from shadowing a later authenticated request.
  const cacheKey = `${pat ? 'authenticated' : 'public'}:${url}`
  const cached = await cacheGetEntry(cacheKey)

  if (cached && Date.now() - cached.savedAt <= TTL_MS) return cached.value

  const response = await fetch(url, { headers: requestHeaders(pat, cached?.etag) })
  publishRateLimit(response)

  if (response.status === 304 && cached) {
    await cacheSetEntry(cacheKey, cached.value, cached.etag)
    return cached.value
  }

  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
  ) {
    throw new Error('RATE_LIMIT')
  }
  if (response.status === 403) throw new Error('FORBIDDEN')
  if (response.status === 404) throw new Error('NOT_FOUND')
  if (!response.ok) throw new Error(`HTTP_${response.status}`)

  const data = response.status === 204 ? [] : await response.json()
  await cacheSetEntry(cacheKey, data, response.headers.get('etag'))
  return data
}

function waitForRetry(delayMs) {
  return new Promise(resolve => setTimeout(resolve, delayMs))
}

const encode = value => encodeURIComponent(value)

export const fetchOrg = (org, pat) =>
  fetchWithCache(`https://api.github.com/orgs/${encode(org)}`, pat)

export async function fetchRepos(org, _repoCount, pat) {
  const all = []
  for (let page = 1; page <= 20; page++) {
    const data = await fetchWithCache(
      `https://api.github.com/orgs/${encode(org)}/repos?type=all&per_page=100&page=${page}&sort=updated`,
      pat,
    )
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

export async function fetchContributors(org, repo, pat) {
  const all = []
  const maxPages = pat ? 10 : 1
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${encode(org)}/${encode(repo)}/contributors?per_page=100&page=${page}`,
      pat,
    )
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

function contributorDateQualifier(startDate, endDate) {
  if (startDate && endDate) return `created:${startDate}..${endDate}`
  if (startDate) return `created:>=${startDate}`
  if (endDate) return `created:<=${endDate}`
  return ''
}

async function fetchSearchPage(url, pat, signal) {
  const response = await fetch(url, { headers: requestHeaders(pat), signal })
  publishRateLimit(response)

  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
  ) {
    throw new Error('RATE_LIMIT')
  }
  if (response.status === 403) throw new Error('FORBIDDEN')

  if (!response.ok) {
    const payload = await response.json().catch(() => null)
    const error = new Error(`HTTP_${response.status}`)
    error.status = response.status
    error.details = payload?.message || ''
    throw error
  }

  return response.json()
}

async function fetchContributorSearchPages(org, username, pat, signal, dateRange) {
  const qualifier = contributorDateQualifier(dateRange.startDate, dateRange.endDate)
  const query = [`author:${username}`, `org:${org}`, qualifier].filter(Boolean).join(' ')
  const all = []
  let totalCount = 0
  let incomplete = false

  // GitHub Search exposes at most 1,000 results. Stop explicitly at that
  // boundary instead of following a Link header beyond a processable page.
  for (let page = 1; page <= 10; page += 1) {
    const params = new URLSearchParams({
      q: query,
      per_page: '100',
      page: String(page),
      sort: 'created',
      order: 'desc',
    })
    const data = await fetchSearchPage(
      `https://api.github.com/search/issues?${params}`,
      pat,
      signal,
    )
    const items = Array.isArray(data.items) ? data.items : []

    if (page === 1) totalCount = Number(data.total_count) || 0
    incomplete ||= Boolean(data.incomplete_results)
    all.push(...items)

    const availableCount = Math.min(totalCount, 1_000)
    if (items.length < 100 || all.length >= availableCount) break
  }

  return {
    items: all,
    totalCount,
    truncated: incomplete || totalCount > all.length,
  }
}

/**
 * Fetch issues and pull requests authored by one contributor in one org.
 *
 * Search results already include `pull_request.merged_at`, so this deliberately
 * uses one search stream rather than issuing a second merged-PR search. If a
 * fine-grained PAT is rejected with 422, public results remain useful and are
 * returned with `usedPublicFallback` so the UI can clearly disclose the scope.
 */
export async function fetchContributorActivity(
  org,
  username,
  pat,
  { startDate = '', endDate = '', signal } = {},
) {
  const dateRange = { startDate, endDate }

  try {
    return {
      ...(await fetchContributorSearchPages(org, username, pat, signal, dateRange)),
      usedPublicFallback: false,
    }
  } catch (error) {
    if (!pat || error.status !== 422) throw error

    return {
      ...(await fetchContributorSearchPages(org, username, '', signal, dateRange)),
      usedPublicFallback: true,
    }
  }
}

/**
 * Fetch GitHub's weekly, per-contributor commit statistics for one repository.
 *
 * GitHub may answer with 202 while it computes this expensive dataset. Those
 * responses must not be cached; retry briefly and surface a recoverable status
 * if the statistics are still being prepared.
 */
export async function fetchContributorStats(
  org,
  repo,
  pat,
  { maxAttempts = 4, retryDelayMs = 750 } = {},
) {
  const url = `https://api.github.com/repos/${encode(org)}/${encode(repo)}/stats/contributors`
  const cacheKey = `${pat ? 'authenticated' : 'public'}:${url}`
  const cached = await cacheGetEntry(cacheKey)

  if (cached && Date.now() - cached.savedAt <= TTL_MS) return cached.value

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(url, { headers: requestHeaders(pat, cached?.etag) })
    publishRateLimit(response)

    if (response.status === 202) {
      if (attempt === maxAttempts - 1) throw new Error('STATS_PENDING')
      await waitForRetry(retryDelayMs * 2 ** attempt)
      continue
    }

    if (response.status === 304 && cached) {
      await cacheSetEntry(cacheKey, cached.value, cached.etag)
      return cached.value
    }

    if (
      response.status === 429 ||
      (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0')
    ) {
      throw new Error('RATE_LIMIT')
    }
    if (response.status === 403) throw new Error('FORBIDDEN')
    if (response.status === 404) throw new Error('NOT_FOUND')
    if (!response.ok) throw new Error(`HTTP_${response.status}`)

    const data = response.status === 204 ? [] : await response.json()
    const stats = Array.isArray(data) ? data : []
    await cacheSetEntry(cacheKey, stats, response.headers.get('etag'))
    return stats
  }

  throw new Error('STATS_PENDING')
}

export async function fetchIssues(org, repo, pat) {
  const all = []
  const maxPages = pat ? 10 : 1
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${encode(org)}/${encode(repo)}/issues?state=all&per_page=100&page=${page}`,
      pat,
    )
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

export async function fetchPulls(org, repo, pat) {
  const all = []
  const maxPages = pat ? 10 : 1
  for (let page = 1; page <= maxPages; page++) {
    const data = await fetchWithCache(
      `https://api.github.com/repos/${encode(org)}/${encode(repo)}/pulls?state=all&per_page=100&page=${page}`,
      pat,
    )
    all.push(...data)
    if (data.length < 100) break
  }
  return all
}

export async function fetchRateLimit(pat) {
  try {
    const response = await fetch('https://api.github.com/rate_limit', {
      headers: requestHeaders(pat),
    })
    if (!response.ok) return null
    const data = await response.json()
    return data.rate
  } catch {
    return null
  }
}
