import { useEffect, useState, useMemo } from 'react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadialBarChart,
  RadialBar,
  PolarAngleAxis,
} from 'recharts'
import { FiAlertTriangle, FiDownload, FiRefreshCw } from 'react-icons/fi'
import { useApp } from '../context/app-context'
import { C, PageTitle, InfoBox } from '../components/UI'
import { buildTimeSeries, exportTrendsCSV } from '../services/analytics'
import { FaCodeBranch } from 'react-icons/fa'
import { IoChevronDown } from 'react-icons/io5'
import { HiCheck, HiOutlineClock } from 'react-icons/hi'
import { useAdvancedMetrics } from '../hooks/useSortedData'
import AnalysisBanner from '../components/AnalysisBanner'
import { AnalyticsSkeleton } from '../components/DashboardSkeletons'
import { useNavigate } from 'react-router-dom'

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    fontSize: 12,
  },
  labelStyle: { color: 'var(--text)' },
  itemStyle: { color: 'var(--text2)' },
}

export default function AnalyticsPage() {
  const {
    model,
    issuesData,
    govLoading,
    advanceAnalyticsLoading,
    advanceAnalyticsComplete,
    runFullAnalytics,
    pullsData,
    auditComplete,
    loading,
    selectedOrg,
    analyticsError,
    rateLimit,
    scopeHasPat,
  } = useApp()
  const navigate = useNavigate()

  const [granularity, setGranularity] = useState('monthly')
  const [selectedRepo, setSelectedRepo] = useState('all')
  const [selectedRepoForAM, setSelectedRepoForAM] = useState('all')

  const scopedIssueEntries = useMemo(
    () =>
      Object.entries(issuesData || {}).filter(
        ([key]) => selectedOrg === 'all' || key.startsWith(`${selectedOrg}/`),
      ),
    [issuesData, selectedOrg],
  )

  const scopedPullEntries = useMemo(
    () =>
      Object.entries(pullsData || {}).filter(
        ([key]) => selectedOrg === 'all' || key.startsWith(`${selectedOrg}/`),
      ),
    [pullsData, selectedOrg],
  )

  useEffect(() => {
    setSelectedRepo('all')
    setSelectedRepoForAM('all')
  }, [selectedOrg])

  const allIssues = useMemo(() => {
    const arr = []
    scopedIssueEntries.forEach(([, issues]) => arr.push(...issues))
    return arr
  }, [scopedIssueEntries])

  const filteredIssues = useMemo(() => {
    if (selectedRepo === 'all') return allIssues
    return issuesData[selectedRepo] || []
  }, [allIssues, selectedRepo, issuesData])

  const series = useMemo(
    () => buildTimeSeries(filteredIssues, granularity),
    [filteredIssues, granularity],
  )

  const filteredPulls = useMemo(() => {
    if (selectedRepoForAM === 'all') return scopedPullEntries.flatMap(([, pulls]) => pulls)
    return pullsData[selectedRepoForAM] || []
  }, [pullsData, scopedPullEntries, selectedRepoForAM])

  const advancedMetrics = useAdvancedMetrics(filteredPulls)
  const analyticsLoading = govLoading || advanceAnalyticsLoading
  const apiBlocked = rateLimit?.remaining === 0
  const completedPulls = advancedMetrics.merged + advancedMetrics.rejected
  const hasMergedPulls = advancedMetrics.merged > 0

  if (loading) return <AnalyticsSkeleton />
  if (!model) return null

  const acceptanceChart = [
    {
      name: 'Merged',
      value: advancedMetrics.merged,
    },
    {
      name: 'Rejected',
      value: advancedMetrics.rejected,
    },
  ]

  const issueRepoOptions = [
    { value: 'all', label: 'All Repositories' },
    ...scopedIssueEntries.map(([key]) => ({ value: key, label: key })),
  ]
  const pullRepoOptions = [
    { value: 'all', label: 'All Repositories' },
    ...scopedPullEntries.map(([key]) => ({ value: key, label: key })),
  ]
  const hasData = scopedIssueEntries.length > 0
  const hasPullsData = scopedPullEntries.length > 0
  const hasSeries = series.length > 0

  const MAX_DAYS = 14

  const mergeGauge = [
    {
      value: Math.min((advancedMetrics.avgMergeDays / MAX_DAYS) * 100, 100),
    },
  ]

  const getMergeColor = days => {
    if (days <= 5) return 'var(--green)'
    if (days <= 10) return 'var(--accent)'
    if (days <= 15) return 'var(--amber)'
    return 'var(--red)'
  }
  const analyticsComplete = auditComplete && advanceAnalyticsComplete

  return (
    <>
      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
        <AnalysisBanner
          page="governance"
          description="Activity trends and advanced metrics are computed from a representative subset to balance speed and API usage. Connect a PAT to analyze every repository and access complete results."
          analysisStatus={analyticsComplete ? 'complete' : 'sample'}
          loading={loading || govLoading || advanceAnalyticsLoading}
          onRun={runFullAnalytics}
        />
        {(analyticsError || apiBlocked) && (
          <div
            role="alert"
            style={{
              ...C.card,
              marginBottom: 24,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 16,
              borderColor: 'rgba(239,68,68,.35)',
              background: 'rgba(239,68,68,.06)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <FiAlertTriangle
                size={18}
                color="var(--red)"
                style={{ marginTop: 2, flexShrink: 0 }}
              />
              <div>
                <div style={{ fontWeight: 600, marginBottom: 2 }}>
                  Analytics data is unavailable
                </div>
                <div style={{ color: 'var(--text2)', fontSize: 12 }}>
                  {analyticsError ||
                    `GitHub's API allowance is exhausted. Retry after ${new Date(rateLimit.reset * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, or add a personal access token.`}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              style={{ ...C.btn('primary'), flexShrink: 0 }}
            >
              Open Settings
            </button>
          </div>
        )}
        <PageTitle
          title="Activity Trends"
          subtitle="How PR and issue velocity is evolving over time — created, merged, and closed per week or month."
          right={
            hasSeries && (
              <button
                onClick={() => exportTrendsCSV(series)}
                style={{
                  ...C.btn('ghost'),
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <FiDownload size={13} /> Export CSV
              </button>
            )
          }
        />

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <select
            value={selectedRepo}
            onChange={e => setSelectedRepo(e.target.value)}
            style={C.select}
          >
            {issueRepoOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <div style={{ display: 'flex', gap: 4 }}>
            {['monthly', 'weekly'].map(g => (
              <button
                key={g}
                onClick={() => setGranularity(g)}
                style={{
                  ...C.btn(granularity === g ? 'primary' : 'ghost'),
                  fontSize: 12,
                  padding: '7px 16px',
                }}
              >
                {g.charAt(0).toUpperCase() + g.slice(1)}
              </button>
            ))}
          </div>

          {!hasData && (
            <button
              onClick={runFullAnalytics}
              disabled={analyticsLoading || apiBlocked}
              style={{
                ...C.btn('primary'),
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                opacity: analyticsLoading || apiBlocked ? 0.65 : 1,
              }}
            >
              <FiRefreshCw size={13} />
              {analyticsLoading ? 'Loading analytics...' : 'Load Analytics Data'}
            </button>
          )}
        </div>

        {/* Empty state before audit runs */}
        {!hasData && !govLoading && (
          <InfoBox>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              No trend data loaded yet
            </div>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Click "Load Analytics Data" above to fetch issue and pull request history for the
              selected organization scope.
            </p>
            <p style={{ fontSize: 12 }}>
              Without a token, the dashboard samples the top five repositories per organization to
              stay within GitHub's anonymous API limit. With a token, it can analyze every
              repository.
            </p>
          </InfoBox>
        )}

        {govLoading && (
          <InfoBox>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>
              Fetching issue and pull request history for{' '}
              {scopeHasPat
                ? 'all accessible repositories'
                : 'a repository sample where a token is missing'}
              ...
            </div>
          </InfoBox>
        )}

        {/* PR chart */}
        {hasSeries && (
          <>
            <div style={{ ...C.card, marginBottom: 20 }}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Pull Request Activity</div>
              <div style={{ ...C.label, marginBottom: 20 }}>Created vs Merged vs Closed</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text2)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="prs_created"
                    name="Created"
                    stroke="var(--accent)"
                    fill="rgba(245,197,24,.3)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="prs_merged"
                    name="Merged"
                    stroke="var(--green)"
                    fill="rgba(34,197,94,.1)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="prs_closed"
                    name="Closed"
                    stroke="var(--red)"
                    fill="rgba(239,68,68,.1)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Issue chart */}
            <div style={C.card}>
              <div style={{ fontWeight: 600, marginBottom: 4 }}>Issue Activity</div>
              <div style={{ ...C.label, marginBottom: 20 }}>Created vs Closed</div>
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={series} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" tick={{ fill: 'var(--text2)', fontSize: 11 }} />
                  <YAxis tick={{ fill: 'var(--text2)', fontSize: 11 }} />
                  <Tooltip {...TOOLTIP_STYLE} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Area
                    type="monotone"
                    dataKey="issues_created"
                    name="Created"
                    stroke="var(--accent)"
                    fill="rgba(245,197,24,.1)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="issues_closed"
                    name="Closed"
                    stroke="var(--green)"
                    fill="rgba(34,197,94,.1)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {hasData && !hasSeries && (
          <InfoBox>
            <div style={{ color: 'var(--green)', fontWeight: 600 }}>
              No time-series data found for this selection.
            </div>
            <div style={{ fontSize: 12, marginTop: 6 }}>Try selecting "All Repositories".</div>
          </InfoBox>
        )}
      </div>

      <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
        <PageTitle
          title="Advanced Analytics"
          subtitle="Pull request acceptance and merge-time metrics for the selected organization scope."
        />

        {/* Controls */}
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 24,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          {/* Repository Selection */}
          <div
            style={{
              position: 'relative',
              width: 260,
            }}
          >
            <FaCodeBranch
              style={{
                position: 'absolute',
                left: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text2)',
                pointerEvents: 'none',
              }}
            />

            <select
              value={selectedRepoForAM}
              onChange={e => setSelectedRepoForAM(e.target.value)}
              style={{
                ...C.select,
                width: '100%',
                paddingLeft: 36,
                appearance: 'none',
                WebkitAppearance: 'none',
                MozAppearance: 'none',
              }}
            >
              {pullRepoOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <IoChevronDown
              style={{
                position: 'absolute',
                right: 12,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text)',
                pointerEvents: 'none',
              }}
            />
          </div>

          {!hasPullsData && (
            <button
              onClick={runFullAnalytics}
              disabled={analyticsLoading || apiBlocked}
              style={{
                ...C.btn('primary'),
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 13,
                opacity: analyticsLoading || apiBlocked ? 0.65 : 1,
              }}
            >
              <FiRefreshCw size={13} />
              {analyticsLoading ? 'Loading analytics...' : 'Load Analytics Data'}
            </button>
          )}
        </div>

        {/* Empty state before audit runs */}
        {!hasPullsData && !advanceAnalyticsLoading && (
          <InfoBox>
            <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text)', marginBottom: 8 }}>
              No Pull Request data loaded yet
            </div>
            <p style={{ fontSize: 13, marginBottom: 12 }}>
              Click "Load Analytics Data" above to fetch pull request data for the selected
              organization scope.
            </p>
            <p style={{ fontSize: 12 }}>
              Average merge time and acceptance rate are calculated from completed pull requests.
              Open pull requests are intentionally excluded from the acceptance calculation.
            </p>
          </InfoBox>
        )}

        {advanceAnalyticsLoading && (
          <InfoBox>
            <div style={{ fontSize: 14, color: 'var(--text)' }}>
              Fetching pull request history for{' '}
              {scopeHasPat
                ? 'all accessible repositories'
                : 'a repository sample where a token is missing'}
              ...
            </div>
          </InfoBox>
        )}

        {hasPullsData && (
          <div
            style={{
              gap: 20,
              marginTop: 24,
            }}
            className="grid grid-cols-1 md:grid-cols-2"
          >
            <div style={{ ...C.card, minHeight: 360 }}>
              <div className="flex gap-4 items-center mb-4">
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 14,
                    background: 'rgba(34,197,94,.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HiOutlineClock size={28} color="#22c55e" />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Average PR Merge Time</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12 }}>Created to merged</div>
                </div>
              </div>

              {hasMergedPulls ? (
                <>
                  <div style={{ position: 'relative', height: 230 }}>
                    <ResponsiveContainer width="100%" height={230}>
                      <RadialBarChart
                        data={mergeGauge}
                        innerRadius="72%"
                        outerRadius="100%"
                        startAngle={180}
                        endAngle={0}
                        barSize={16}
                      >
                        <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                        <RadialBar
                          background={{ fill: 'var(--surface2)' }}
                          dataKey="value"
                          cornerRadius={12}
                          fill={getMergeColor(advancedMetrics.avgMergeDays)}
                        />
                      </RadialBarChart>
                    </ResponsiveContainer>
                    <div
                      style={{ position: 'absolute', inset: '92px 0 auto', textAlign: 'center' }}
                    >
                      <div style={{ fontSize: 34, fontWeight: 700 }}>
                        {advancedMetrics.avgMergeDays.toFixed(1)}
                      </div>
                      <div style={{ color: 'var(--text2)', fontSize: 13 }}>days</div>
                      <div
                        style={{
                          marginTop: 5,
                          fontSize: 12,
                          color: getMergeColor(advancedMetrics.avgMergeDays),
                          fontWeight: 600,
                        }}
                      >
                        {advancedMetrics.avgMergeDays <= 2
                          ? 'Excellent'
                          : advancedMetrics.avgMergeDays <= 5
                            ? 'Good'
                            : advancedMetrics.avgMergeDays <= 10
                              ? 'Slow'
                              : 'Very slow'}
                      </div>
                    </div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}>
                    Based on <b style={{ color: 'var(--text)' }}>{advancedMetrics.merged}</b> merged
                    pull requests
                  </div>
                </>
              ) : (
                <div
                  style={{
                    minHeight: 240,
                    display: 'grid',
                    placeItems: 'center',
                    textAlign: 'center',
                    color: 'var(--text2)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>
                      No merged pull requests found
                    </div>
                    <div style={{ fontSize: 12 }}>
                      There is not enough completed data to calculate merge time for this selection.
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div style={{ ...C.card, minHeight: 360 }}>
              <div className="flex gap-4 items-center mb-4">
                <div
                  style={{
                    width: 54,
                    height: 54,
                    borderRadius: 14,
                    background: 'rgba(168,85,247,.12)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <HiCheck size={28} color="#a855f7" />
                </div>
                <div>
                  <div style={{ fontWeight: 600 }}>Pull Request Acceptance Rate</div>
                  <div style={{ color: 'var(--text2)', fontSize: 12 }}>
                    Merged versus closed without merge
                  </div>
                </div>
              </div>

              {completedPulls > 0 ? (
                <>
                  <div style={{ marginTop: 12, color: 'var(--text2)', fontSize: 13 }}>
                    <b style={{ color: 'var(--text)' }}>{advancedMetrics.merged}</b> merged ·{' '}
                    <b style={{ color: 'var(--text)' }}>{advancedMetrics.rejected}</b> closed
                    without merge
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart margin={{ top: 10, right: 0, left: 0, bottom: 10 }}>
                      <Pie
                        data={acceptanceChart}
                        dataKey="value"
                        innerRadius={55}
                        outerRadius={80}
                        paddingAngle={3}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                        blendStroke="var(--surface)"
                      >
                        <Cell fill="var(--green)" />
                        <Cell fill="var(--red)" />
                      </Pie>
                      <Tooltip {...TOOLTIP_STYLE} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <div
                    style={{
                      textAlign: 'center',
                      fontSize: 28,
                      fontWeight: 700,
                      color: 'var(--purple)',
                    }}
                  >
                    {advancedMetrics.acceptanceRate.toFixed(1)}%
                  </div>
                </>
              ) : (
                <div
                  style={{
                    minHeight: 240,
                    display: 'grid',
                    placeItems: 'center',
                    textAlign: 'center',
                    color: 'var(--text2)',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text)', fontWeight: 600, marginBottom: 6 }}>
                      No completed pull requests found
                    </div>
                    <div style={{ fontSize: 12 }}>
                      Open pull requests are excluded because their outcome is not known yet.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  )
}
