import { useState, useMemo, useEffect, useRef } from 'react'
import {
  FiAlertTriangle,
  FiDatabase,
  FiDownload,
  FiExternalLink,
  FiRefreshCw,
} from 'react-icons/fi'
import { useApp } from '../context/app-context'
import { C, SortTh, PageTitle, LoadMore } from '../components/UI'
import { useSortedData } from '../hooks/useSortedData'
import {
  buildPeriodContributors,
  computeBusFactor,
  exportContributorsCSV,
  selectAnalyticsRepositories,
} from '../services/analytics'
import { fetchContributorStats } from '../services/github'
import { useNavigate, Link } from 'react-router-dom'
import EmptyStateCard from '../components/EmptyStateCard'
import { AiOutlineInfoCircle } from 'react-icons/ai'
import AnalysisBanner from '../components/AnalysisBanner'
import { ContributorSkeleton } from '../components/DashboardSkeletons'

const CONTRIBUTION_PERIODS = [
  { value: 'all', label: 'All time' },
  { value: '1m', label: 'Last month' },
  { value: '3m', label: 'Last 3 months' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
]

const CONTRIBUTOR_STATS_BATCH_SIZE = 5

function periodStatsWarning(failures, totalCount) {
  if (!failures.length) return ''

  const loadedCount = totalCount - failures.length
  const prefix =
    loadedCount > 0
      ? `Period results are partial: ${loadedCount} of ${totalCount} repositories loaded. `
      : ''
  const firstError = failures[0]

  if (firstError?.message === 'RATE_LIMIT') {
    return `${prefix}GitHub's API rate limit has been reached. Add a PAT or retry after the limit resets.`
  }
  if (firstError?.message === 'STATS_PENDING') {
    return `${prefix}GitHub is still preparing contributor statistics. Wait briefly and retry.`
  }
  if (firstError?.message === 'FORBIDDEN') {
    return `${prefix}GitHub denied access to contributor statistics. Check the token's repository access.`
  }

  return `${prefix}Contributor statistics could not be loaded. Please retry.`
}

export default function ContributorsPage() {
  const {
    model,
    isComplete,
    loading,
    runFullExplore,
    selectedOrg,
    getPatForOrg,
    hasAnyPat,
    scopeHasPat,
  } = useApp()
  const [search, setSearch] = useState('')
  const [shown, setShown] = useState(20)
  const [openInfo, setOpenInfo] = useState(null)
  const [period, setPeriod] = useState('all')
  const [periodStats, setPeriodStats] = useState(null)
  const [periodLoading, setPeriodLoading] = useState(false)
  const [periodProgress, setPeriodProgress] = useState({ loaded: 0, total: 0 })
  const [periodError, setPeriodError] = useState('')
  const [periodReload, setPeriodReload] = useState(0)
  const busFactorRef = useRef(null)
  const freshnessRef = useRef(null)
  const signalRef = useRef(null)

  useEffect(() => {
    const handleClickOutside = e => {
      if (busFactorRef.current && busFactorRef.current.contains(e.target)) return

      if (freshnessRef.current && freshnessRef.current.contains(e.target)) return

      if (signalRef.current && signalRef.current.contains(e.target)) return

      setOpenInfo(null)
    }

    document.addEventListener('mousedown', handleClickOutside)

    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const navigate = useNavigate()
  const contributors = useMemo(() => model?.contributors ?? [], [model])

  const lifetimeContributors = useMemo(() => {
    return contributors
      .map(contributor => {
        const repos =
          selectedOrg === 'all'
            ? contributor.repos
            : contributor.repos.filter(repo => repo.org === selectedOrg)

        if (!repos.length) return null

        const orgNames = [...new Set(repos.map(repo => repo.org))]
        const lastActive =
          repos
            .map(repo => repo.lastActive)
            .filter(Boolean)
            .sort()
            .at(-1) || contributor.lastActive

        return {
          ...contributor,
          repos,
          orgs: orgNames,
          totalContribs: repos.reduce((sum, repo) => sum + repo.count, 0),
          lastActive,
          isConnector: repos.length >= 3,
          isCrossOrg: orgNames.length > 1,
        }
      })
      .filter(Boolean)
      .sort((a, b) => b.totalContribs - a.totalContribs)
  }, [contributors, selectedOrg])

  const periodRepos = useMemo(() => {
    if (period === 'all' || !model) return []

    return selectAnalyticsRepositories(
      model.totalRepos || [],
      selectedOrg,
      orgLogin => Boolean(getPatForOrg(orgLogin)),
      5,
    )
  }, [getPatForOrg, model, period, selectedOrg])

  useEffect(() => {
    if (period === 'all') {
      setPeriodStats(null)
      setPeriodLoading(false)
      setPeriodProgress({ loaded: 0, total: 0 })
      setPeriodError('')
      return undefined
    }

    let cancelled = false

    async function loadPeriodStats() {
      setPeriodStats(null)
      setPeriodLoading(true)
      setPeriodError('')
      setPeriodProgress({ loaded: 0, total: periodRepos.length })

      const statsByRepo = {}
      const failures = []

      try {
        for (let index = 0; index < periodRepos.length; index += CONTRIBUTOR_STATS_BATCH_SIZE) {
          const batch = periodRepos.slice(index, index + CONTRIBUTOR_STATS_BATCH_SIZE)
          const results = await Promise.allSettled(
            batch.map(repo => {
              const orgPat = getPatForOrg(repo.orgLogin)
              return orgPat
                ? fetchContributorStats(repo.orgLogin, repo.name, orgPat)
                : fetchContributorStats(repo.orgLogin, repo.name, '', { maxAttempts: 1 })
            }),
          )

          if (cancelled) return

          results.forEach((result, resultIndex) => {
            const repo = batch[resultIndex]
            if (result.status === 'fulfilled') {
              statsByRepo[`${repo.orgLogin}/${repo.name}`] = result.value
            } else {
              failures.push(result.reason)
            }
          })

          setPeriodProgress({
            loaded: Math.min(index + batch.length, periodRepos.length),
            total: periodRepos.length,
          })
        }

        if (!cancelled) {
          setPeriodStats(statsByRepo)
          setPeriodError(periodStatsWarning(failures, periodRepos.length))
        }
      } finally {
        if (!cancelled) setPeriodLoading(false)
      }
    }

    void loadPeriodStats()
    return () => {
      cancelled = true
    }
  }, [getPatForOrg, period, periodReload, periodRepos])

  const filteredPeriodContributors = useMemo(
    () => (periodStats ? buildPeriodContributors(periodStats, period) : []),
    [period, periodStats],
  )

  const scopedContributors = period === 'all' ? lifetimeContributors : filteredPeriodContributors

  const availableRepositoryCount = useMemo(() => {
    const repositories = model?.totalRepos || []
    return repositories.filter(repo => selectedOrg === 'all' || repo.orgLogin === selectedOrg)
      .length
  }, [model, selectedOrg])

  const lifetimeAnalyzedRepositoryCount = useMemo(() => {
    const repositories = model?.allRepos || []
    return repositories.filter(repo => selectedOrg === 'all' || repo.orgLogin === selectedOrg)
      .length
  }, [model, selectedOrg])

  const periodAnalyzedRepositoryCount = periodStats ? Object.keys(periodStats).length : 0

  const analyzedRepositoryCount =
    period === 'all' ? lifetimeAnalyzedRepositoryCount : periodAnalyzedRepositoryCount

  const contributorCoverageComplete =
    period === 'all'
      ? isComplete
      : Boolean(
          isComplete &&
          !periodLoading &&
          !periodError &&
          periodStats &&
          periodRepos.length > 0 &&
          periodAnalyzedRepositoryCount === periodRepos.length,
        )

  const sampleSize = period === 'all' ? 10 : 5
  const sampleLabel = `top ${sampleSize} repositories`
  const sampleScope = selectedOrg === 'all' ? `${sampleLabel} per organization` : sampleLabel
  const hasMixedCoverage = selectedOrg === 'all' && hasAnyPat && !scopeHasPat
  const coverageLabel =
    periodLoading && isComplete
      ? 'Loading commits across all accessible repositories'
      : contributorCoverageComplete
        ? 'Commits across all accessible repositories'
        : isComplete
          ? 'Partial commit data — some repositories unavailable'
          : hasMixedCoverage
            ? 'Mixed commit coverage — organization token missing'
            : `Sampled commits — ${sampleLabel}`
  const coverageDescription =
    periodLoading && isComplete
      ? 'GitHub contributor statistics are loading for every repository visible to the configured PAT in this scope.'
      : contributorCoverageComplete
        ? 'Commit totals include every repository visible to the configured PAT in the selected organization scope.'
        : isComplete
          ? 'One or more repository statistics requests did not complete, so the displayed totals are not complete for this scope.'
          : hasMixedCoverage
            ? 'Organizations with a configured token include all accessible repositories; organizations without one include only their ranked repository sample. These are not complete portfolio-wide totals.'
            : `Commit totals include only the ${sampleScope}, ranked by stars, forks, watchers, and recent pushes. Repositories outside the sample are excluded, so these are not organization-wide totals.`

  useEffect(() => {
    setShown(20)
  }, [period, selectedOrg])

  const busFactor = useMemo(
    () => (contributorCoverageComplete ? computeBusFactor(scopedContributors) : null),
    [contributorCoverageComplete, scopedContributors],
  )
  const filtered = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()

    if (!normalizedSearch) {
      return scopedContributors
    }

    return scopedContributors.filter(contributor =>
      contributor.login.toLowerCase().includes(normalizedSearch),
    )
  }, [scopedContributors, search])

  const { sorted, sortConfig, onSort } = useSortedData(filtered, 'totalContribs', 'desc')
  const visible = sorted.slice(0, shown)

  if (loading) return <ContributorSkeleton />
  if (!model) return null

  const topActive = scopedContributors.slice(0, 10).filter(c => c.freshness > 50).length

  const freshPct = scopedContributors.length
    ? Math.round((topActive / Math.min(10, scopedContributors.length)) * 100)
    : 0

  const connectors = scopedContributors.filter(c => c.isConnector)

  const crossOrg = scopedContributors.filter(c => c.isCrossOrg)
  const periodDataUnavailable =
    period !== 'all' && !periodLoading && Boolean(periodError) && !scopedContributors.length

  const riskColor = r =>
    r === 'critical' ? 'var(--red)' : r === 'high' ? 'var(--amber)' : 'var(--green)'
  const riskBar = r => (r === 'critical' ? '90%' : r === 'high' ? '60%' : '25%')

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
      <AnalysisBanner
        page="contributors"
        description="Contributor insights are computed from a representative subset to balance speed and API usage. Connect a PAT to analyze every repository and access complete results."
        analysisStatus={isComplete ? 'complete' : 'standard'}
        loading={loading}
        onRun={runFullExplore}
      />

      <PageTitle
        title="Contributor Intelligence"
        subtitle="Analyzing contribution patterns, coverage risk, and organizational health"
        right={
          <button
            onClick={() => exportContributorsCSV(filtered)}
            style={{
              ...C.btn('ghost'),
              fontSize: 12,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            <FiDownload size={13} /> Export CSV
          </button>
        }
      />

      {/* Signal panels */}
      {periodLoading || periodDataUnavailable ? (
        <div
          role="status"
          style={{
            ...C.card,
            marginBottom: 24,
            minHeight: 120,
            display: 'grid',
            placeItems: 'center',
            color: 'var(--text2)',
            textAlign: 'center',
          }}
        >
          <div>
            {periodLoading && <FiRefreshCw className="spin" size={20} color="var(--accent)" />}
            <div style={{ marginTop: periodLoading ? 8 : 0, fontSize: 13 }}>
              {periodLoading
                ? 'Updating contributor indicators for the selected period…'
                : 'Contributor indicators are unavailable until period statistics load.'}
            </div>
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 24 }}>
          {/* Bus Factor */}
          {busFactor ? (
            <div
              style={{
                ...C.card,
                borderColor:
                  busFactor.risk === 'critical'
                    ? 'rgba(239,68,68,.4)'
                    : busFactor.risk === 'high'
                      ? 'rgba(245,158,11,.4)'
                      : 'var(--border)',
              }}
            >
              <div
                ref={busFactorRef}
                style={{ ...C.label, marginBottom: 8, position: 'relative' }}
                className="flex justify-between items-center"
              >
                <p>Bus Factor Risk</p>

                <button
                  type="button"
                  aria-label="Explain bus factor"
                  onMouseEnter={() => setOpenInfo('busfactor')}
                  onMouseLeave={() => setOpenInfo(null)}
                  className="p-2 rounded-full hover:bg-(--bg) transition"
                >
                  <AiOutlineInfoCircle className="text-(--text) cursor-pointer" />
                </button>

                {openInfo === 'busfactor' && (
                  <div
                    style={{
                      ...C.card,
                      position: 'absolute',
                      top: '120%',
                      right: 0,
                      width: '320px',
                      zIndex: 100,
                    }}
                  >
                    <div className="text-xs text-(--text)">
                      <h4 style={{ marginBottom: 8 }} className="text-(--accent)">
                        Bus Factor
                      </h4>

                      <p>Measures contributor concentration risk using complete commit coverage.</p>

                      <ul style={{ marginLeft: 16 }}>
                        <li>1 = Critical Risk</li>
                        <li>2 = High Risk</li>
                        <li>3+ = Healthy Distribution</li>
                      </ul>
                    </div>

                    <p style={{ marginTop: 8 }}>
                      Higher values indicate knowledge is distributed across more contributors,
                      reducing dependency on a small number of individuals.
                    </p>
                  </div>
                )}
              </div>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <div style={{ fontSize: 22, fontWeight: 700 }}>Bus Factor: {busFactor.factor}</div>
                <span
                  style={{
                    padding: '3px 10px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    background: `color-mix(in srgb, ${riskColor(busFactor.risk)} 15%, transparent)`,
                    color: riskColor(busFactor.risk),
                    letterSpacing: '.05em',
                  }}
                >
                  {busFactor.risk.toUpperCase()}
                </span>
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                {busFactor.factor <= 2
                  ? `${busFactor.factor} contributor${busFactor.factor === 1 ? '' : 's'} own${busFactor.factor === 1 ? 's' : ''} over 50% of total commits. Knowledge distribution is heavily skewed.`
                  : 'Healthy contributor distribution across the selected organization scope.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 11,
                  color: 'var(--text2)',
                  marginBottom: 4,
                }}
              >
                <span>RISK LEVEL</span>
                <span style={{ color: riskColor(busFactor.risk), fontWeight: 600 }}>
                  {busFactor.risk.toUpperCase()}
                </span>
              </div>
              <div style={{ height: 4, background: 'var(--border)', borderRadius: 2 }}>
                <div
                  style={{
                    width: riskBar(busFactor.risk),
                    height: '100%',
                    background: riskColor(busFactor.risk),
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          ) : (
            <div style={{ ...C.card, borderColor: 'var(--accent-border)' }}>
              <div
                style={{
                  ...C.label,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <span>Bus Factor Risk</span>
                <span style={C.pill('var(--text2)', 'var(--surface2)')}>NOT CALCULATED</span>
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
                Complete repository coverage required
              </div>
              <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>
                {isComplete
                  ? 'Bus factor is unavailable because contributor statistics did not load for every repository in this scope.'
                  : 'Bus factor is not calculated from sampled commits because incomplete repository coverage could misstate organization-wide concentration risk.'}
              </p>
              {!isComplete && (
                <Link
                  to="/settings"
                  style={{
                    ...C.btn('ghost'),
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '7px 11px',
                    textDecoration: 'none',
                  }}
                >
                  Add a PAT for complete analysis
                </Link>
              )}
            </div>
          )}

          {/* Freshness Index */}
          <div style={C.card}>
            <div
              ref={freshnessRef}
              style={{ ...C.label, marginBottom: 12, position: 'relative' }}
              className="flex justify-between items-center"
            >
              <p>Freshness Index</p>

              <button
                onMouseEnter={() => setOpenInfo('freshness')}
                onMouseLeave={() => setOpenInfo(null)}
                className="p-2 rounded-full hover:bg-(--bg) transition"
              >
                <AiOutlineInfoCircle className="text-(--text) cursor-pointer" />
              </button>

              {openInfo === 'freshness' && (
                <div
                  style={{
                    ...C.card,
                    position: 'absolute',
                    top: '120%',
                    right: 0,
                    width: '320px',
                    zIndex: 100,
                  }}
                  className="text-xs"
                >
                  <div className="text-(--text) text-xs">
                    <h4 className="text-(--accent)">Freshness Index</h4>

                    <p>Measures how active and recently engaged the contributor community is.</p>

                    <ul className="ml-2">
                      <li>
                        <strong>High Score</strong> = Contributors active recently
                      </li>
                      <li>
                        <strong>Medium Score</strong> = Some recent activity
                      </li>
                      <li>
                        <strong>Low Score</strong> = Limited recent participation
                      </li>
                    </ul>
                  </div>

                  <p style={{ marginTop: 8 }}>
                    Higher values indicate stronger project momentum and ongoing maintenance.
                  </p>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
              <div
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: `conic-gradient(var(--green) ${freshPct * 3.6}deg, var(--border) 0)`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    background: 'var(--surface)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 16,
                    fontWeight: 700,
                    color: 'var(--green)',
                  }}
                >
                  {Math.round(freshPct / 10)}/10
                </div>
              </div>
              <div>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>Core Momentum</div>
                <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                  {topActive} of top 10 contributors active in last 90 days
                </div>
                <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 4 }}>
                  ACTIVE RECENTLY: <strong style={{ color: 'var(--green)' }}>{freshPct}%</strong>
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {connectors.length > 0 && (
                <div
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'rgba(245,197,24,.06)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <strong style={{ color: 'var(--accent)' }}>{connectors.length}</strong> cross-repo
                  connectors (3+ repos)
                </div>
              )}
              {crossOrg.length > 0 && (
                <div
                  style={{
                    flex: 1,
                    padding: '8px 10px',
                    background: 'rgba(168,85,247,.06)',
                    borderRadius: 4,
                    fontSize: 12,
                  }}
                >
                  <strong style={{ color: 'var(--purple)' }}>{crossOrg.length}</strong> cross-org
                  contributors
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Analytical table */}
      <div style={{ ...C.card, padding: 0, overflowX: 'auto' }}>
        <div
          aria-label="Contributor commit coverage"
          style={{
            padding: '16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 18,
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border)',
            background: contributorCoverageComplete ? 'rgba(34,197,94,.05)' : 'var(--accent-soft)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 11, flex: '1 1 520px' }}>
            <FiDatabase
              size={18}
              color={contributorCoverageComplete ? 'var(--green)' : 'var(--accent)'}
              style={{ marginTop: 2, flexShrink: 0 }}
            />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>{coverageLabel}</div>
              <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>
                {coverageDescription}
              </div>
              {!isComplete && (
                <Link
                  to="/settings"
                  style={{
                    display: 'inline-flex',
                    marginTop: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--accent)',
                  }}
                >
                  Add a PAT for complete repository coverage
                </Link>
              )}
            </div>
          </div>
          <div style={{ minWidth: 160, textAlign: 'right' }}>
            <div
              style={{
                fontSize: 22,
                fontWeight: 750,
                color: contributorCoverageComplete ? 'var(--green)' : 'var(--accent)',
              }}
            >
              {periodLoading
                ? `${periodProgress.loaded} / ${periodProgress.total}`
                : `${analyzedRepositoryCount} / ${availableRepositoryCount}`}
            </div>
            <div style={{ ...C.label, marginTop: 3 }}>Repositories analyzed</div>
          </div>
        </div>
        <div
          style={{
            padding: '14px 16px',
            display: 'flex',
            gap: 12,
            alignItems: 'center',
            flexWrap: 'wrap',
            borderBottom: '1px solid var(--border)',
          }}
        >
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by username..."
            style={{ ...C.input, width: 220 }}
          />
          <label
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              color: 'var(--text2)',
              fontSize: 12,
            }}
          >
            <span>Period</span>
            <select
              aria-label="Contribution period"
              value={period}
              onChange={event => setPeriod(event.target.value)}
              style={{ ...C.select, minWidth: 150 }}
            >
              {CONTRIBUTION_PERIODS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 12, color: 'var(--text2)' }}>
            {periodLoading
              ? `Loading ${periodProgress.loaded} of ${periodProgress.total} repositories…`
              : `${filtered.length} contributors found`}
          </span>
        </div>

        {period !== 'all' && (
          <div
            style={{
              padding: '10px 16px',
              fontSize: 11,
              lineHeight: 1.5,
              color: 'var(--text2)',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface2)',
            }}
          >
            Counts use GitHub-attributed weekly commits. The first weekly bucket may partially
            overlap the selected period.
          </div>
        )}

        {periodError && (
          <div
            role="alert"
            style={{
              margin: 16,
              padding: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              border: '1px solid rgba(239,68,68,.35)',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(239,68,68,.06)',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                color: 'var(--text2)',
                fontSize: 12,
              }}
            >
              <FiAlertTriangle size={15} color="var(--red)" /> {periodError}
            </span>
            <button
              type="button"
              onClick={() => setPeriodReload(value => value + 1)}
              style={{
                ...C.btn('ghost'),
                padding: '6px 10px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                flexShrink: 0,
              }}
            >
              <FiRefreshCw size={12} /> Retry
            </button>
          </div>
        )}

        {periodLoading ? (
          <div
            role="status"
            style={{ minHeight: 260, display: 'grid', placeItems: 'center', color: 'var(--text2)' }}
          >
            <div style={{ textAlign: 'center' }}>
              <FiRefreshCw className="spin" size={22} color="var(--accent)" />
              <div style={{ marginTop: 10, fontSize: 13 }}>
                Loading weekly contributor commit statistics…
              </div>
            </div>
          </div>
        ) : filtered?.length ? (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <SortTh
                    label="Contributor"
                    sortKey="login"
                    sortConfig={sortConfig}
                    onSort={onSort}
                  />
                  <SortTh
                    label={period === 'all' ? 'Commits' : 'Commits in Period'}
                    title="Commits attributed by GitHub to this account across the analyzed repositories; pull requests and issues are not included."
                    sortKey="totalContribs"
                    sortConfig={sortConfig}
                    onSort={onSort}
                  />
                  <SortTh
                    label="Repos Contributed To"
                    sortKey="repos"
                    sortConfig={sortConfig}
                    onSort={onSort}
                  />
                  <SortTh label="Orgs" sortKey="orgs" sortConfig={sortConfig} onSort={onSort} />
                  <SortTh
                    label={period === 'all' ? 'Latest Repo Push' : 'Latest Commit Week'}
                    title={
                      period === 'all'
                        ? 'Latest push to a repository this account contributed to; it may have been pushed by another contributor.'
                        : 'Start date of the latest GitHub weekly bucket containing an attributed commit.'
                    }
                    sortKey="lastActive"
                    sortConfig={sortConfig}
                    onSort={onSort}
                  />
                  <th
                    style={{
                      padding: '10px 14px',
                      fontSize: 11,
                      color: 'var(--text2)',
                      fontWeight: 600,
                      background: 'var(--surface2)',
                      borderBottom: '1px solid var(--border)',
                      textAlign: 'left',
                      position: 'relative',
                    }}
                    ref={signalRef}
                  >
                    <div className="flex items-center gap-2" style={{ position: 'relative' }}>
                      <p>SIGNALS</p>

                      <button
                        onMouseEnter={() => setOpenInfo('signals')}
                        onMouseLeave={() => setOpenInfo(null)}
                        className="p-2 rounded-full hover:bg-(--bg) transition"
                      >
                        <AiOutlineInfoCircle className="text-(--text) cursor-pointer" />
                      </button>

                      {openInfo === 'signals' && (
                        <div
                          style={{
                            ...C.card,
                            position: 'absolute',
                            top: '130%',
                            right: 2,
                            width: '320px',
                            zIndex: 100,
                          }}
                        >
                          <h4 className="mb-2 text-(--accent)">Contributor Signals</h4>

                          <div className="text-(--text) text-xs">
                            <p>Measures how contributors connect repositories and organizations.</p>

                            <ul className="ml-2 mt-2">
                              <li>
                                <strong>Connector Contributors</strong> — active in 3+ repositories.
                              </li>
                              <li>
                                <strong>Cross-Org Contributors</strong> — contribute across multiple
                                organizations.
                              </li>
                            </ul>
                          </div>

                          <p style={{ marginTop: 8 }}>
                            Higher values indicate stronger collaboration and knowledge sharing.
                          </p>
                        </div>
                      )}
                    </div>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((c, i) => (
                  <tr
                    key={c.login}
                    style={{
                      borderBottom: '1px solid var(--border)',
                      background: i % 2 ? 'var(--surface2)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <Link
                          to={`/contributors/${c.login}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            textDecoration: 'none',
                            color: 'inherit',
                          }}
                          title="View contributor profile"
                          aria-label="View contributor profile"
                        >
                          <img
                            src={c.avatar_url}
                            alt={c.login}
                            style={{ width: 28, height: 28, borderRadius: '50%' }}
                          />
                          <span
                            style={{ fontSize: 13, fontWeight: 500 }}
                            className="hover:text-(--accent) transition"
                          >
                            {c.login}
                          </span>
                        </Link>
                        <a
                          href={`https://github.com/${c.login}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            color: 'var(--text2)',
                            opacity: 0.7,
                          }}
                          title="View GitHub profile"
                          aria-label="View GitHub profile"
                          className="hover:opacity-100 hover:text-(--accent)"
                        >
                          <FiExternalLink size={12} />
                        </a>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div
                          style={{
                            width: 80,
                            height: 4,
                            background: 'var(--border)',
                            borderRadius: 2,
                          }}
                        >
                          <div
                            style={{
                              width: `${Math.min(100, c.totalContribs / 15)}%`,
                              height: '100%',
                              background: 'var(--accent)',
                              borderRadius: 2,
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 13, color: 'var(--text2)' }}>
                          {c.totalContribs.toLocaleString()}
                        </span>
                      </div>
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                      {c.repos.length}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 13, color: 'var(--text2)' }}>
                      {c.orgs.length}
                    </td>
                    <td style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text2)' }}>
                      {c.lastActive?.slice(0, 10) || '—'}
                    </td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {c.isConnector && (
                          <span style={C.pill('var(--accent)', 'rgba(245,197,24,.12)')}>
                            CONNECTOR
                          </span>
                        )}
                        {c.isCrossOrg && (
                          <span style={C.pill('var(--purple)', 'rgba(168,85,247,.12)')}>
                            CROSS-ORG
                          </span>
                        )}
                        {c.freshness > 70 && (
                          <span style={C.pill('var(--green)', 'rgba(34,197,94,.12)')}>ACTIVE</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <LoadMore shown={shown} total={sorted.length} onLoad={() => setShown(s => s + 20)} />
          </>
        ) : (
          <>
            <div
              style={{
                padding: '32px 24px',
                maxWidth: 900,
                margin: '0 auto',
              }}
            >
              <EmptyStateCard
                SvgIcon={<FiDatabase size={36} color="var(--accent)" />}
                title={
                  search.trim()
                    ? 'No matching contributors'
                    : periodDataUnavailable
                      ? 'Period data unavailable'
                      : period !== 'all'
                        ? 'No commits in the selected period'
                        : 'No contributors found'
                }
                description={
                  search.trim()
                    ? `No contributors match "${search}".`
                    : periodDataUnavailable
                      ? 'GitHub could not provide the weekly contributor statistics yet. Use Retry above after a short wait.'
                      : period !== 'all'
                        ? 'GitHub did not return any attributed commits for the selected repositories and period.'
                        : "We couldn't find any contributor data for the configured organizations."
                }
                buttonText={period !== 'all' ? 'Show all time' : 'Reload dashboard'}
                onButtonClick={() => (period !== 'all' ? setPeriod('all') : navigate('/'))}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}
