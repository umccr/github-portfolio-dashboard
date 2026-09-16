//  Repo Health Indicator
// Activity (40%) + Issue Health (30%) + Diversity (30%)
export function computeHealthScore(repo, contributorCount = 0) {
  const daysSince = (Date.now() - new Date(repo.pushed_at)) / 86_400_000
  const activity = Math.max(0, 100 - daysSince)
  const total = (repo.open_issues_count || 0) + 10
  const issueHealth = Math.max(0, 100 - (repo.open_issues_count / total) * 100)
  const diversity = Math.min(100, contributorCount * 10)
  return Math.round(activity * 0.4 + issueHealth * 0.3 + diversity * 0.3)
}

// Repo Lifecycle — Thriving, Active, Dormant, Hibernating based on recency of last push
export function computeActivityClassification(repo) {
  const days = (Date.now() - new Date(repo.pushed_at)) / 86_400_000
  if (days <= 30) return 'Thriving'
  if (days <= 90) return 'Active'
  if (days <= 180) return 'Dormant'
  return 'Hibernating'
}

//  Bus Factor
export function computeBusFactor(contributors = []) {
  if (!contributors.length) return { factor: 0, risk: 'unknown' }
  const contributionCounts = contributors
    .map(c => Number(c.totalContribs ?? c.contributions ?? 0))
    .sort((a, b) => b - a)
  const total = contributionCounts.reduce((sum, count) => sum + count, 0)
  if (!total) return { factor: 0, risk: 'unknown' }
  let cum = 0
  for (let i = 0; i < contributionCounts.length; i++) {
    cum += contributionCounts[i]
    if (cum / total > 0.5) {
      const f = i + 1
      return { factor: f, risk: f <= 1 ? 'critical' : f <= 2 ? 'high' : 'healthy' }
    }
  }
  return { factor: contributionCounts.length, risk: 'healthy' }
}

// Unified Analytical Data Model
// Merges multiple orgs into one normalized graph:
// Organization → Repositories → Contributors → Issues/PRs
export function buildAnalyticalModel(orgs, reposPerOrg, contribsPerRepo, totalReposPerOrg) {
  const allRepos = []
  const contributorMap = {}
  const totalRepos = []

  orgs.forEach(org => {
    const repos = reposPerOrg[org.login] || []
    const total = totalReposPerOrg[org.login] || []

    total.forEach(repo => {
      const key = `${org.login}/${repo.name}`
      const contribs = contribsPerRepo[key] || []
      const health = computeHealthScore(repo, contribs.length)
      const activityClassification = computeActivityClassification(repo)
      const bf = computeBusFactor(contribs)
      totalRepos.push({
        ...repo,
        orgLogin: org.login,
        contributors: contribs,
        healthScore: health,
        activityClassification: activityClassification,
        busFactor: bf,
      })
    })

    repos.forEach(repo => {
      const key = `${org.login}/${repo.name}`
      const contribs = contribsPerRepo[key] || []
      allRepos.push({ ...repo, orgLogin: org.login })

      // Build contributor map using GitHub's stable numeric user id. Logins can
      // change, so they are only a fallback for older or incomplete responses.
      contribs.forEach(c => {
        const identity = c.id ? `id:${c.id}` : c.login ? `login:${c.login.toLowerCase()}` : null
        if (!identity) return

        if (!contributorMap[identity]) {
          contributorMap[identity] = {
            id: c.id || null,
            login: c.login,
            avatar_url: c.avatar_url,
            totalContribs: 0,
            repos: [],
            orgs: new Set(),
            lastActive: null,
          }
        }
        const entry = contributorMap[identity]
        entry.login = c.login || entry.login
        entry.avatar_url = c.avatar_url || entry.avatar_url
        entry.totalContribs += c.contributions
        entry.repos.push({
          name: repo.name,
          org: org.login,
          count: c.contributions,
          lastActive: repo.pushed_at,
        })
        entry.orgs.add(org.login)
        if (!entry.lastActive || repo.pushed_at > entry.lastActive) {
          entry.lastActive = repo.pushed_at
        }
      })
    })
  })

  // Finalize contributors: compute signals
  const contributors = Object.values(contributorMap)
    .map(c => ({
      ...c,
      orgs: Array.from(c.orgs),
      isConnector: c.repos.length >= 3,
      isCrossOrg: c.orgs.size > 1,
      freshness: c.lastActive
        ? Math.max(0, 100 - (Date.now() - new Date(c.lastActive)) / 86_400_000)
        : 0,
    }))
    .sort((a, b) => b.totalContribs - a.totalContribs)

  // Graph is constructed here and persisted through cache layers
  return { allRepos, contributors, totalRepos }
}

const CONTRIBUTOR_PERIOD_DAYS = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
  '12m': 365,
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export function getContributorPeriodStart(period, now = Date.now()) {
  const days = CONTRIBUTOR_PERIOD_DAYS[period]
  return days ? now - days * 24 * 60 * 60 * 1000 : null
}

/**
 * Convert per-repository weekly statistics into the contributor model used by
 * the table. A week is included when it overlaps the requested rolling period,
 * because GitHub does not expose the individual dates inside a weekly bucket.
 */
export function buildPeriodContributors(statsByRepo, period, now = Date.now()) {
  const periodStart = getContributorPeriodStart(period, now)
  if (periodStart === null) return []

  const contributorMap = {}

  Object.entries(statsByRepo || {}).forEach(([repoKey, stats]) => {
    const separator = repoKey.indexOf('/')
    if (separator < 1) return

    const org = repoKey.slice(0, separator)
    const repoName = repoKey.slice(separator + 1)

    ;(Array.isArray(stats) ? stats : []).forEach(stat => {
      const author = stat?.author
      if (!author?.login) return

      let commits = 0
      let latestWeek = null

      ;(Array.isArray(stat.weeks) ? stat.weeks : []).forEach(week => {
        const weekStart = Number(week?.w) * 1000
        const count = Number(week?.c) || 0
        if (!Number.isFinite(weekStart) || count <= 0 || weekStart + WEEK_MS <= periodStart) return

        commits += count
        latestWeek = latestWeek === null ? weekStart : Math.max(latestWeek, weekStart)
      })

      if (!commits || latestWeek === null) return

      const identity = author.id ? `id:${author.id}` : `login:${author.login.toLowerCase()}`
      if (!contributorMap[identity]) {
        contributorMap[identity] = {
          id: author.id || null,
          login: author.login,
          avatar_url: author.avatar_url,
          totalContribs: 0,
          repos: [],
          orgs: new Set(),
          lastActiveMs: null,
        }
      }

      const entry = contributorMap[identity]
      entry.login = author.login || entry.login
      entry.avatar_url = author.avatar_url || entry.avatar_url
      entry.totalContribs += commits
      entry.repos.push({
        name: repoName,
        org,
        count: commits,
        lastActive: new Date(latestWeek).toISOString(),
      })
      entry.orgs.add(org)
      entry.lastActiveMs =
        entry.lastActiveMs === null ? latestWeek : Math.max(entry.lastActiveMs, latestWeek)
    })
  })

  return Object.values(contributorMap)
    .map(contributor => {
      const orgs = Array.from(contributor.orgs)
      const lastActive = new Date(contributor.lastActiveMs).toISOString()
      return {
        id: contributor.id,
        login: contributor.login,
        avatar_url: contributor.avatar_url,
        totalContribs: contributor.totalContribs,
        repos: contributor.repos,
        orgs,
        lastActive,
        isConnector: contributor.repos.length >= 3,
        isCrossOrg: orgs.length > 1,
        freshness: Math.max(0, 100 - (now - contributor.lastActiveMs) / 86_400_000),
      }
    })
    .sort((a, b) => b.totalContribs - a.totalContribs)
}

// Time-Series Bucketing
// Parses created_at, closed_at, merged_at into weekly/monthly bins
export function buildTimeSeries(issues = [], granularity = 'monthly') {
  const buckets = {}

  const toKey = dateStr => {
    if (!dateStr) return null
    const d = new Date(dateStr)
    if (granularity === 'weekly') {
      const jan1 = new Date(d.getFullYear(), 0, 1)
      const week = Math.ceil(((d - jan1) / 86_400_000 + jan1.getDay() + 1) / 7)
      return `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    }
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }

  const ensure = key => {
    if (!buckets[key]) {
      buckets[key] = {
        date: key,
        prs_created: 0,
        prs_merged: 0,
        prs_closed: 0,
        issues_created: 0,
        issues_closed: 0,
      }
    }
  }

  issues.forEach(item => {
    const isPR = Boolean(item.pull_request)

    const ck = toKey(item.created_at)
    if (ck) {
      ensure(ck)
      if (isPR) buckets[ck].prs_created++
      else buckets[ck].issues_created++
    }

    if (item.closed_at) {
      const xk = toKey(item.closed_at)
      if (xk) {
        ensure(xk)
        if (isPR) buckets[xk].prs_closed++
        else buckets[xk].issues_closed++
      }
    }

    if (isPR && item.pull_request?.merged_at) {
      const mk = toKey(item.pull_request.merged_at)
      if (mk) {
        ensure(mk)
        buckets[mk].prs_merged++
      }
    }
  })

  return Object.values(buckets)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12)
}

// CSV Export
function download(content, filename, type = 'text/csv') {
  const blob = new Blob([content], { type })
  const url = URL.createObjectURL(blob)
  const a = Object.assign(document.createElement('a'), { href: url, download: filename })
  a.click()
  URL.revokeObjectURL(url)
}

export function exportReposCSV(repos) {
  const header = [
    'Repository',
    'Org',
    'Stars',
    'Forks',
    'Open Items',
    'Health Score',
    'Activity Classification',
    'Language',
    'Last Active',
  ]
  const rows = repos.map(r => [
    r.name,
    r.orgLogin,
    r.stargazers_count,
    r.forks_count,
    r.open_issues_count,
    r.healthScore,
    r.activityClassification,
    r.language || 'N/A',
    r.pushed_at?.slice(0, 10),
  ])
  download(
    [header, ...rows].map(r => r.join(',')).join('\n'),
    'umccr-github-portfolio-repositories.csv',
  )
}

export function exportContributorsCSV(contributors) {
  const header = ['Login', 'Commits', 'Repos', 'Orgs', 'Last Active', 'Connector', 'Cross-Org']
  const rows = contributors.map(c => [
    c.login,
    c.totalContribs,
    c.repos.length,
    c.orgs.length,
    c.lastActive?.slice(0, 10) || '',
    c.isConnector,
    c.isCrossOrg,
  ])
  download(
    [header, ...rows].map(r => r.join(',')).join('\n'),
    'umccr-github-portfolio-contributors.csv',
  )
}

export function exportTrendsCSV(series) {
  const header = [
    'Date',
    'PRs Created',
    'PRs Merged',
    'PRs Closed',
    'Issues Created',
    'Issues Closed',
  ]
  const rows = series.map(s => [
    s.date,
    s.prs_created,
    s.prs_merged,
    s.prs_closed,
    s.issues_created,
    s.issues_closed,
  ])
  download([header, ...rows].map(r => r.join(',')).join('\n'), 'umccr-github-portfolio-trends.csv')
}

export function getTopRepositories(repos, limit = 10) {
  const MS_PER_DAY = 1000 * 60 * 60 * 24

  return [...repos]
    .map(repo => {
      const pushedAtMs = Date.parse(repo.pushed_at)
      const daysSinceLastPush = Number.isFinite(pushedAtMs)
        ? (Date.now() - pushedAtMs) / MS_PER_DAY
        : Infinity

      const activityBonus = 0.5 * Math.max(0, 365 - daysSinceLastPush)

      const score =
        (repo.stargazers_count ?? 0) +
        (repo.forks_count ?? 0) * 2 +
        (repo.watchers_count ?? 0) * 1.5 +
        activityBonus

      return {
        ...repo,
        score,
      }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function selectAnalyticsRepositories(
  repos,
  selectedOrg = 'all',
  authenticated = false,
  sampleSize = 5,
) {
  const scopedRepos =
    selectedOrg === 'all' ? repos : repos.filter(repo => repo.orgLogin === selectedOrg)
  const byOrg = {}

  scopedRepos.forEach(repo => {
    ;(byOrg[repo.orgLogin] ??= []).push(repo)
  })

  const isAuthenticated = orgLogin => {
    if (typeof authenticated === 'function') return Boolean(authenticated(orgLogin))
    if (authenticated && typeof authenticated === 'object') return Boolean(authenticated[orgLogin])
    return Boolean(authenticated)
  }

  return Object.entries(byOrg).flatMap(([orgLogin, orgRepos]) =>
    isAuthenticated(orgLogin) ? orgRepos : getTopRepositories(orgRepos, sampleSize),
  )
}
