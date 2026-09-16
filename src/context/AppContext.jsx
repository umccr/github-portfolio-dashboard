import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  cacheClear,
  fetchOrg,
  fetchRepos,
  fetchContributors,
  fetchIssues,
  fetchRateLimit,
  fetchPulls,
} from '../services/github'
import {
  buildAnalyticalModel,
  getTopRepositories,
  selectAnalyticsRepositories,
} from '../services/analytics'
import { clearAnalysis, saveAnalysis, loadAnalysis } from '../services/cache'
import { DASHBOARD_ORGANIZATIONS, STORAGE_KEYS } from '../config/dashboard'
import { AppContext } from './app-context'

const ANONYMOUS_ANALYTICS_REPOS_PER_ORG = 5

function historyWarning(results) {
  const totalCount = results.reduce((sum, result) => sum + result.totalCount, 0)
  const failedCount = results.reduce((sum, result) => sum + result.failedCount, 0)

  if (!failedCount) return ''

  const firstError = results.find(result => result.firstError)?.firstError
  if (firstError?.message === 'RATE_LIMIT') {
    return 'GitHub API rate limit reached. Add a personal access token in Settings, or retry after the limit resets.'
  }
  if (firstError?.message === 'FORBIDDEN') {
    return 'GitHub denied one or more analytics requests. Check the token permissions and organization approval in Settings.'
  }

  const loadedCount = totalCount - failedCount
  return loadedCount > 0
    ? `Analytics data is partial: ${loadedCount} of ${totalCount} repository requests succeeded.`
    : 'GitHub analytics data could not be loaded. Please retry or check the token in Settings.'
}

function getStoredRateLimit() {
  const stored = localStorage.getItem(STORAGE_KEYS.rateLimit)

  if (!stored) return null

  try {
    const data = JSON.parse(stored)

    if (Date.now() > data.reset * 1000) {
      localStorage.removeItem(STORAGE_KEYS.rateLimit)
      return null
    }

    return data
  } catch {
    localStorage.removeItem(STORAGE_KEYS.rateLimit)
    return null
  }
}

function getStoredPins() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEYS.pins) || '[]')
    return Array.isArray(stored) ? stored.map(String) : []
  } catch {
    localStorage.removeItem(STORAGE_KEYS.pins)
    return []
  }
}

function getStoredOrganizationScope() {
  const stored = localStorage.getItem(STORAGE_KEYS.organizationScope)
  return stored === 'all' || DASHBOARD_ORGANIZATIONS.includes(stored) ? stored : 'all'
}

function organizationKey(orgLogin) {
  return DASHBOARD_ORGANIZATIONS.find(
    organization => organization.toLowerCase() === String(orgLogin || '').toLowerCase(),
  )
}

function getStoredOrganizationTokens() {
  return Object.fromEntries(
    DASHBOARD_ORGANIZATIONS.map(organization => [
      organization,
      sessionStorage.getItem(STORAGE_KEYS.tokens[organization]) || '',
    ]),
  )
}

function updateScopeCompletion(setter, scope, complete) {
  const scopes = scope === 'all' ? ['all', ...DASHBOARD_ORGANIZATIONS] : [scope]
  setter(current =>
    complete
      ? [...new Set([...current, ...scopes])]
      : current.filter(item => !scopes.includes(item)),
  )
}

export function AppProvider({ children }) {
  const [orgPats, setOrgPats] = useState(getStoredOrganizationTokens)
  const [orgs, setOrgs] = useState([])
  const [model, setModel] = useState(null)
  const [issuesData, setIssuesData] = useState({})
  const [pullsData, setPullsData] = useState({})
  const [rateLimit, setRateLimit] = useState(getStoredRateLimit)
  const [loading, setLoading] = useState(false)
  const [loadMsg, setLoadMsg] = useState('')
  const [govLoading, setGovLoading] = useState(false)
  const [error, setError] = useState('')
  const [totalRepo, setTotalRepo] = useState(0)
  const [advanceAnalyticsLoading, setAdvanceAnalyticsLoading] = useState(false)
  const [advanceAnalyticsCompleteScopes, setAdvanceAnalyticsCompleteScopes] = useState([])
  const [analyticsError, setAnalyticsError] = useState('')
  const [completeOrgs, setCompleteOrgs] = useState([])
  const [auditCompleteScopes, setAuditCompleteScopes] = useState([])
  const [lastOrgNames, setLastOrgNames] = useState([...DASHBOARD_ORGANIZATIONS])
  const [pinnedRepoIds, setPinnedRepoIds] = useState(getStoredPins)
  const [selectedOrg, setSelectedOrg] = useState(getStoredOrganizationScope)
  // True until the cached analysis has been read, so routes that need a model
  // wait for the restore instead of bouncing to the loader on first paint.
  const [hydrating, setHydrating] = useState(true)
  // Set when state came straight from the cache, so the write-back effect can
  // skip it. Re-saving an untouched restore would stamp a fresh savedAt on
  // every page load and the entry would never reach its TTL.
  const restoredFromCache = useRef(false)

  const getPatForOrg = useCallback(
    orgLogin => {
      const key = organizationKey(orgLogin)
      return key ? orgPats[key] || '' : ''
    },
    [orgPats],
  )
  const hasAnyPat = useMemo(
    () => DASHBOARD_ORGANIZATIONS.some(organization => Boolean(orgPats[organization])),
    [orgPats],
  )
  const hasAllOrgPats = useMemo(
    () => DASHBOARD_ORGANIZATIONS.every(organization => Boolean(orgPats[organization])),
    [orgPats],
  )
  const scopeHasPat = selectedOrg === 'all' ? hasAllOrgPats : Boolean(getPatForOrg(selectedOrg))
  const isComplete =
    scopeHasPat &&
    (selectedOrg === 'all'
      ? DASHBOARD_ORGANIZATIONS.every(organization => completeOrgs.includes(organization))
      : completeOrgs.includes(organizationKey(selectedOrg)))
  const auditComplete = scopeHasPat && auditCompleteScopes.includes(selectedOrg)
  const advanceAnalyticsComplete = scopeHasPat && advanceAnalyticsCompleteScopes.includes(selectedOrg)

  // Never migrate the upstream app's long-lived token. Removing it closes the
  // localStorage exposure as soon as this version is opened.
  useEffect(() => {
    localStorage.removeItem('oe_pat')
    localStorage.removeItem('oe_recent')
    // A legacy shared token has no trustworthy resource-owner mapping. Do not
    // guess which organization it belongs to; require an explicit assignment.
    sessionStorage.removeItem(STORAGE_KEYS.legacyToken)
  }, [])

  // Restore the last analysis on startup. The model is held in memory, so
  // without this a reload, bookmark or shared link loses it entirely.
  useEffect(() => {
    let cancelled = false

    loadAnalysis()
      .then(cached => {
        if (cancelled || !cached) return

        restoredFromCache.current = true

        setOrgs(cached.orgs || [])
        setModel(cached.model)
        setTotalRepo(cached.totalRepo || 0)
        setCompleteOrgs(
          Array.isArray(cached.completeOrgs)
            ? cached.completeOrgs.filter(organization =>
                DASHBOARD_ORGANIZATIONS.includes(organization),
              )
            : cached.isComplete
              ? [...DASHBOARD_ORGANIZATIONS]
              : [],
        )
        setLastOrgNames([...DASHBOARD_ORGANIZATIONS])
        setIssuesData(cached.issuesData || {})
        setPullsData(cached.pullsData || {})
        setAuditCompleteScopes(
          Array.isArray(cached.auditCompleteScopes)
            ? cached.auditCompleteScopes
            : cached.auditComplete
              ? ['all', ...DASHBOARD_ORGANIZATIONS]
              : [],
        )
        setAdvanceAnalyticsCompleteScopes(
          Array.isArray(cached.advanceAnalyticsCompleteScopes)
            ? cached.advanceAnalyticsCompleteScopes
            : cached.advanceAnalyticsComplete
              ? ['all', ...DASHBOARD_ORGANIZATIONS]
              : [],
        )
      })
      .finally(() => {
        if (!cancelled) setHydrating(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.pins, JSON.stringify(pinnedRepoIds))
  }, [pinnedRepoIds])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.organizationScope, selectedOrg)
  }, [selectedOrg])

  // Persist the analysis whenever it changes, including audit and analytics
  // results — those are the most expensive data to refetch.
  useEffect(() => {
    if (hydrating || !model) return

    // Skip the write that would immediately follow a restore.
    if (restoredFromCache.current) {
      restoredFromCache.current = false
      return
    }

    saveAnalysis({
      orgs,
      model,
      totalRepo,
      isComplete,
      completeOrgs,
      lastOrgNames,
      issuesData,
      pullsData,
      auditComplete,
      auditCompleteScopes,
      advanceAnalyticsComplete,
      advanceAnalyticsCompleteScopes,
    })
  }, [
    hydrating,
    orgs,
    model,
    totalRepo,
    isComplete,
    completeOrgs,
    lastOrgNames,
    issuesData,
    pullsData,
    auditComplete,
    auditCompleteScopes,
    advanceAnalyticsComplete,
    advanceAnalyticsCompleteScopes,
  ])

  useEffect(() => {
    const handler = e => {
      setRateLimit(e.detail)
      localStorage.setItem(STORAGE_KEYS.rateLimit, JSON.stringify(e.detail))
    }

    window.addEventListener('rate-limit-update', handler)

    return () => {
      window.removeEventListener('rate-limit-update', handler)
    }
  }, [])

  useEffect(() => {
    if (!rateLimit?.reset) return

    const timeout = setTimeout(
      () => {
        localStorage.removeItem(STORAGE_KEYS.rateLimit)
        setRateLimit(null)
      },
      Math.max(0, rateLimit.reset * 1000 - Date.now()),
    )

    return () => clearTimeout(timeout)
  }, [rateLimit])

  const refreshRateLimit = useCallback(
    async (orgLogin = selectedOrg) => {
      const token =
        orgLogin === 'all'
          ? DASHBOARD_ORGANIZATIONS.map(getPatForOrg).find(Boolean) || ''
          : getPatForOrg(orgLogin)
      const rl = await fetchRateLimit(token)
      if (rl) {
        setRateLimit(rl)
        return true
      }
      return false
    },
    [getPatForOrg, selectedOrg],
  )
  const saveOrgPat = useCallback((orgLogin, token) => {
    const key = organizationKey(orgLogin)
    if (!key) return false

    const value = token.trim()
    setOrgPats(current => ({ ...current, [key]: value }))
    value
      ? sessionStorage.setItem(STORAGE_KEYS.tokens[key], value)
      : sessionStorage.removeItem(STORAGE_KEYS.tokens[key])
    setModel(null)
    setOrgs([])
    setIssuesData({})
    setPullsData({})
    setCompleteOrgs([])
    setAuditCompleteScopes([])
    setAdvanceAnalyticsCompleteScopes([])
    setAnalyticsError('')
    setError('')
    void Promise.all([cacheClear(), clearAnalysis()])
    return true
  }, [])

  const selectOrganization = useCallback(orgLogin => {
    if (orgLogin === 'all' || DASHBOARD_ORGANIZATIONS.includes(orgLogin)) {
      setSelectedOrg(orgLogin)
      setAnalyticsError('')
    }
  }, [])

  const togglePinnedRepo = useCallback(repoId => {
    const id = String(repoId)
    setPinnedRepoIds(current =>
      current.includes(id) ? current.filter(item => item !== id) : [...current, id],
    )
  }, [])

  // The dashboard has a fixed portfolio; arbitrary organization discovery is
  // deliberately not exposed to users.
  const explore = useCallback(async () => {
    const orgNames = DASHBOARD_ORGANIZATIONS
    setLoading(true)
    setError('')
    setModel(null)
    setOrgs([])
    setIssuesData({})
    setLastOrgNames(orgNames)
    setAuditCompleteScopes([])
    setAdvanceAnalyticsCompleteScopes([])
    setAnalyticsError('')
    try {
      setLoadMsg('Fetching organization metadata...')
      const validOrgs = await Promise.all(orgNames.map(n => fetchOrg(n, getPatForOrg(n))))
      setOrgs(validOrgs)

      setLoadMsg('Fetching repositories...')
      const reposPerOrg = {}
      await Promise.all(
        validOrgs.map(async org => {
          reposPerOrg[org.login] = await fetchRepos(
            org.login,
            org.public_repos,
            getPatForOrg(org.login),
          )
        }),
      )

      const total = Object.values(reposPerOrg).reduce((sum, repos) => sum + repos.length, 0)
      setTotalRepo(total)

      const totalReposPerOrg = Object.fromEntries(
        Object.entries(reposPerOrg).map(([org, repos]) => [org, [...repos]]),
      )

      setLoadMsg('Fetching contributor data for top repositories...')
      const contribsPerRepo = {}
      const fullyLoadedOrganizations = []
      for (const org of validOrgs) {
        const orgPat = getPatForOrg(org.login)
        const top = orgPat
          ? reposPerOrg[org.login] || []
          : getTopRepositories(reposPerOrg[org.login] || [], 10)
        reposPerOrg[org.login] = top

        const contributorResults = await Promise.allSettled(
          top.map(async repo => {
            contribsPerRepo[`${org.login}/${repo.name}`] = await fetchContributors(
              org.login,
              repo.name,
              orgPat,
            )
          }),
        )
        if (orgPat && contributorResults.every(result => result.status === 'fulfilled')) {
          fullyLoadedOrganizations.push(organizationKey(org.login))
        }
      }

      setLoadMsg('Building analytical data model...')
      const builtModel = buildAnalyticalModel(
        validOrgs,
        reposPerOrg,
        contribsPerRepo,
        totalReposPerOrg,
      )
      setModel(builtModel)

      setCompleteOrgs(fullyLoadedOrganizations.filter(Boolean))

      return builtModel
    } catch (err) {
      const messages = {
        RATE_LIMIT:
          'GitHub API rate limit reached. Add a PAT in Settings for 5,000 requests per hour.',
        FORBIDDEN:
          'GitHub denied this request. Check the token permissions and organization approval.',
        NOT_FOUND:
          'A configured organization could not be found or is not accessible with this token.',
      }
      setError(
        messages[err.message] || 'The dashboard could not load GitHub data. Please try again.',
      )
      return false
    } finally {
      setLoading(false)
      setLoadMsg('')
    }
  }, [getPatForOrg])

  // Load the fixed portfolio automatically. The root route goes directly to
  // Overview, so there is no organization picker or intermediate landing page.
  useEffect(() => {
    if (hydrating || loading || model || error) return
    void explore()
  }, [error, explore, hydrating, loading, model])

  // re-run explore for the same orgs: used by the banner on
  // Overview / Contributors / Repositories
  const runFullExplore = useCallback(() => {
    return explore()
  }, [explore])

  const selectAnalysisRepos = useCallback(
    allRepos => {
      return selectAnalyticsRepositories(
        allRepos,
        selectedOrg,
        orgLogin => Boolean(getPatForOrg(orgLogin)),
        ANONYMOUS_ANALYTICS_REPOS_PER_ORG,
      )
    },
    [getPatForOrg, selectedOrg],
  )

  const fetchRepoHistory = useCallback(
    async (allRepos, fetcher) => {
      const repos = selectAnalysisRepos(allRepos)
      const map = {}
      let failedCount = 0
      let firstError = null

      for (let i = 0; i < repos.length; i += 5) {
        const batch = repos.slice(i, i + 5)
        const results = await Promise.allSettled(
          batch.map(async repo => ({
            key: `${repo.orgLogin}/${repo.name}`,
            data: await fetcher(repo.orgLogin, repo.name, getPatForOrg(repo.orgLogin)),
          })),
        )

        results.forEach(result => {
          if (result.status === 'fulfilled') {
            map[result.value.key] = result.value.data
            return
          }

          failedCount += 1
          firstError ||= result.reason
        })
      }

      return { map, failedCount, firstError, totalCount: repos.length }
    },
    [getPatForOrg, selectAnalysisRepos],
  )

  // Shared issue-fetch logic: same repo-selection rule as contributors
  const auditRepos = useCallback(
    async allRepos => {
      return fetchRepoHistory(allRepos, fetchIssues)
    },
    [fetchRepoHistory],
  )

  // Governance audit : used directly when repos are already complete
  const runAudit = useCallback(async () => {
    if (!model || govLoading) return
    setAnalyticsError('')
    setGovLoading(true)
    try {
      const result = await auditRepos(model.totalRepos)
      setIssuesData(current => ({ ...current, ...result.map }))
      setAnalyticsError(historyWarning([result]))
      updateScopeCompletion(
        setAuditCompleteScopes,
        selectedOrg,
        scopeHasPat && result.failedCount === 0,
      )
    } finally {
      setGovLoading(false)
    }
  }, [model, selectedOrg, scopeHasPat, govLoading, auditRepos])

  // Entry point for Governance / Analytics "Run Complete Analysis"
  // - If repos/contributors aren't complete yet -> fetch them first (explore),
  //   then fetch issues using the freshly-returned model (avoids stale closure).
  // - If already complete -> skip repo fetching (cache/state already has it),
  //   just fetch issues.
  const runGovernanceAnalysis = useCallback(async () => {
    if (govLoading) return

    let currentModel = model
    if (!currentModel) {
      setGovLoading(true) // reflect "working" immediately, explore() also sets its own loading
      const freshModel = await runFullExplore()
      setGovLoading(false)
      if (!freshModel) return
      currentModel = freshModel
    }

    if (!currentModel) return

    setAnalyticsError('')
    setGovLoading(true)
    try {
      const result = await auditRepos(currentModel.totalRepos)
      setIssuesData(current => ({ ...current, ...result.map }))
      setAnalyticsError(historyWarning([result]))
      updateScopeCompletion(
        setAuditCompleteScopes,
        selectedOrg,
        scopeHasPat && result.failedCount === 0,
      )
    } finally {
      setGovLoading(false)
    }
  }, [model, runFullExplore, auditRepos, selectedOrg, scopeHasPat, govLoading])

  // Advanced analytics — parallel batches of 5 (Section 3.2.5)
  // Entry point for Analytics "Run Complete Analysis"
  // - If repos/contributors aren't complete yet -> fetch them first (explore),
  //   then fetch pulls using the freshly-returned model (avoids stale closure).
  // - If already complete -> skip repo fetching, just fetch pulls.
  const runAdvanceAnalytics = useCallback(async () => {
    if (advanceAnalyticsLoading) return

    let currentModel = model
    if (!currentModel) {
      setAdvanceAnalyticsLoading(true) // reflect "working" immediately
      const freshModel = await runFullExplore()
      setAdvanceAnalyticsLoading(false)
      if (!freshModel) return
      currentModel = freshModel
    }

    if (!currentModel) return

    setAnalyticsError('')
    setAdvanceAnalyticsLoading(true)
    try {
      const result = await fetchRepoHistory(currentModel.totalRepos, fetchPulls)
      setPullsData(current => ({ ...current, ...result.map }))
      setAnalyticsError(historyWarning([result]))
      updateScopeCompletion(
        setAdvanceAnalyticsCompleteScopes,
        selectedOrg,
        scopeHasPat && result.failedCount === 0,
      )
    } finally {
      setAdvanceAnalyticsLoading(false)
    }
  }, [model, runFullExplore, fetchRepoHistory, selectedOrg, scopeHasPat, advanceAnalyticsLoading])

  // Combined entry point for the whole Analytics page banner
  // Runs explore() once if needed, then fetches issues + pulls in parallel
  const runFullAnalytics = useCallback(async () => {
    if (govLoading || advanceAnalyticsLoading) return

    let currentModel = model
    if (!currentModel) {
      setGovLoading(true)
      setAdvanceAnalyticsLoading(true)
      const freshModel = await runFullExplore()
      setGovLoading(false)
      setAdvanceAnalyticsLoading(false)
      if (!freshModel) return
      currentModel = freshModel
    }

    if (!currentModel) return

    setAnalyticsError('')
    setGovLoading(true)
    setAdvanceAnalyticsLoading(true)
    try {
      const [issuesResult, pullsResult] = await Promise.all([
        auditRepos(currentModel.totalRepos),
        fetchRepoHistory(currentModel.totalRepos, fetchPulls),
      ])

      setIssuesData(current => ({ ...current, ...issuesResult.map }))
      setPullsData(current => ({ ...current, ...pullsResult.map }))
      setAnalyticsError(historyWarning([issuesResult, pullsResult]))
      const complete = scopeHasPat
      updateScopeCompletion(
        setAuditCompleteScopes,
        selectedOrg,
        complete && issuesResult.failedCount === 0,
      )
      updateScopeCompletion(
        setAdvanceAnalyticsCompleteScopes,
        selectedOrg,
        complete && pullsResult.failedCount === 0,
      )
    } finally {
      setGovLoading(false)
      setAdvanceAnalyticsLoading(false)
    }
  }, [
    model,
    runFullExplore,
    auditRepos,
    fetchRepoHistory,
    selectedOrg,
    scopeHasPat,
    govLoading,
    advanceAnalyticsLoading,
  ])

  const STALE_DAYS = 90

  const staleRepoStats = useMemo(() => {
    const now = Date.now()

    return Object.entries(issuesData || {})
      .map(([key, issues]) => {
        const [org, repo] = key.split('/')

        const normalIssues = issues.filter(i => !i.pull_request)

        const openIssues = normalIssues.filter(i => i.state === 'open')

        const staleIssues = openIssues.filter(i => {
          const updated = new Date(i.updated_at).getTime()
          const diffDays = (now - updated) / (1000 * 60 * 60 * 24)
          return diffDays >= STALE_DAYS
        })

        const ratio =
          openIssues.length === 0 ? 0 : Math.round((staleIssues.length / openIssues.length) * 100)

        return {
          id: key,
          org,
          repo,
          ratio,
          staleCount: staleIssues.length,
          openCount: openIssues.length,
        }
      })
      .sort((a, b) => b.ratio - a.ratio)
  }, [issuesData])

  return (
    <AppContext.Provider
      value={{
        orgPats,
        saveOrgPat,
        getPatForOrg,
        hasAnyPat,
        hasAllOrgPats,
        scopeHasPat,
        orgs,
        model,
        issuesData,
        pullsData,
        rateLimit,
        loading,
        loadMsg,
        govLoading,
        error,
        totalRepo,
        runAdvanceAnalytics,
        refreshRateLimit,
        advanceAnalyticsLoading,
        advanceAnalyticsComplete,
        runFullAnalytics,
        analyticsError,
        isComplete,
        auditComplete,
        lastOrgNames,
        hydrating,
        pinnedRepoIds,
        togglePinnedRepo,
        selectedOrg,
        selectOrganization,
        explore,
        runFullExplore,
        runAudit,
        runGovernanceAnalysis,
        setError,
        staleRepoStats,
      }}
    >
      {children}
    </AppContext.Provider>
  )
}
