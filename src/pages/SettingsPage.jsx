import { useEffect, useRef, useState } from 'react'
import {
  FiCheck,
  FiExternalLink,
  FiEye,
  FiEyeOff,
  FiRefreshCw,
  FiSave,
  FiTrash2,
} from 'react-icons/fi'
import { AiOutlineInfoCircle } from 'react-icons/ai'
import { useApp } from '../context/app-context'
import { C } from '../components/UI'
import { cacheClear } from '../services/github'
import { clearAnalysis } from '../services/cache'
import {
  DASHBOARD_ORGANIZATIONS,
  GPL_URL,
  LEGAL_NOTICE,
  UPSTREAM_URL,
  organizationLabel,
} from '../config/dashboard'

const API_VERSION = '2022-11-28'
const PAT_DOCS_URL =
  'https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens'
const PERMISSION_DOCS_URL =
  'https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens?apiVersion=2026-03-10'

function createTokenUrl(organization) {
  const params = new URLSearchParams({
    name: `${organizationLabel(organization)} Portfolio Dashboard`,
    description: 'Read-only portfolio analytics',
    target_name: organization,
    expires_in: '30',
    metadata: 'read',
    issues: 'read',
    pull_requests: 'read',
  })
  return `https://github.com/settings/personal-access-tokens/new?${params}`
}

async function validateOrganizationToken(organization, token) {
  const headers = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': API_VERSION,
  }
  const identityResponse = await fetch('https://api.github.com/rate_limit', { headers })

  if (identityResponse.status === 401)
    throw new Error(
      'GitHub rejected this token. Check that it was copied completely and has not expired.',
    )
  if (!identityResponse.ok)
    throw new Error(`GitHub could not validate this token (HTTP ${identityResponse.status}).`)

  const accessResponse = await fetch(
    `https://api.github.com/orgs/${encodeURIComponent(organization)}/repos?type=all&per_page=1`,
    { headers },
  )

  if (accessResponse.status === 403) {
    throw new Error(
      `GitHub denied access to ${organizationLabel(organization)}. The token may be awaiting organization approval or blocked by organization policy.`,
    )
  }
  if (accessResponse.status === 404) {
    throw new Error(
      `${organizationLabel(organization)} is not accessible with this token. Confirm the token's Resource owner.`,
    )
  }
  if (!accessResponse.ok)
    throw new Error(
      `GitHub could not check ${organizationLabel(organization)} access (HTTP ${accessResponse.status}).`,
    )
}

export default function SettingsPage() {
  const { orgPats, saveOrgPat, hasAnyPat, rateLimit, refreshRateLimit } = useApp()
  const [drafts, setDrafts] = useState(() => ({ ...orgPats }))
  const [visible, setVisible] = useState({})
  const [savedOrg, setSavedOrg] = useState('')
  const [validatingOrg, setValidatingOrg] = useState('')
  const [tokenErrors, setTokenErrors] = useState({})
  const [cleared, setCleared] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [refreshError, setRefreshError] = useState(false)
  const [quotaOrg, setQuotaOrg] = useState(DASHBOARD_ORGANIZATIONS[0])
  const [checkedQuotaOrg, setCheckedQuotaOrg] = useState('')
  const [infoOpen, setInfoOpen] = useState(false)
  const infoRef = useRef(null)

  const connectedCount = DASHBOARD_ORGANIZATIONS.filter(organization =>
    Boolean(orgPats[organization]),
  ).length

  useEffect(() => {
    function handleClickOutside(event) {
      if (infoRef.current && !infoRef.current.contains(event.target)) setInfoOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const setDraft = (organization, value) => {
    setDrafts(current => ({ ...current, [organization]: value }))
    setTokenErrors(current => ({ ...current, [organization]: '' }))
    if (savedOrg === organization) setSavedOrg('')
  }

  const handleSave = async organization => {
    const token = (drafts[organization] || '').trim()
    if (!token || validatingOrg) return

    setValidatingOrg(organization)
    setTokenErrors(current => ({ ...current, [organization]: '' }))
    try {
      await validateOrganizationToken(organization, token)
      saveOrgPat(organization, token)
      setSavedOrg(organization)
    } catch (error) {
      setTokenErrors(current => ({
        ...current,
        [organization]:
          error instanceof Error ? error.message : 'Network error while verifying the token.',
      }))
    } finally {
      setValidatingOrg('')
    }
  }

  const handleDelete = organization => {
    saveOrgPat(organization, '')
    setDraft(organization, '')
    setSavedOrg('')
  }

  const handleClear = async () => {
    await Promise.all([cacheClear(), clearAnalysis()])
    setCleared(true)
    setTimeout(() => setCleared(false), 2000)
  }

  const displayedRateLimit = checkedQuotaOrg === quotaOrg ? rateLimit : null
  const rateColor = displayedRateLimit
    ? displayedRateLimit.remaining / displayedRateLimit.limit > 0.3
      ? 'var(--green)'
      : 'var(--red)'
    : 'var(--text2)'

  return (
    <div style={{ padding: '32px 24px', maxWidth: 1100, margin: '0 auto' }} className="fade-up">
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>Settings</h1>
      <p style={{ color: 'var(--text2)', fontSize: 13, marginBottom: 24 }}>
        Configure separate session-only GitHub credentials for the two organization resource owners.
      </p>

      <div className="settings-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={C.card} aria-labelledby="github-authentication-title">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 14,
                marginBottom: 18,
              }}
            >
              <div>
                <div
                  ref={infoRef}
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <h2 id="github-authentication-title" style={{ fontWeight: 650, fontSize: 15 }}>
                    GitHub Authentication
                  </h2>
                  <button
                    type="button"
                    aria-label="Explain PAT security"
                    onMouseEnter={() => setInfoOpen(true)}
                    onMouseLeave={() => setInfoOpen(false)}
                    onClick={() => setInfoOpen(open => !open)}
                    style={{
                      ...C.btn('ghost'),
                      border: 0,
                      padding: 6,
                      display: 'grid',
                      placeItems: 'center',
                    }}
                  >
                    <AiOutlineInfoCircle size={15} />
                  </button>
                  {infoOpen && (
                    <div
                      style={{
                        ...C.card,
                        position: 'absolute',
                        top: '110%',
                        left: 0,
                        width: 'min(350px, 82vw)',
                        zIndex: 100,
                        fontSize: 12,
                        color: 'var(--text2)',
                        lineHeight: 1.6,
                      }}
                    >
                      <strong style={{ color: 'var(--accent)' }}>PAT security</strong>
                      <p style={{ marginTop: 6 }}>
                        Tokens are stored separately in session storage, never in persistent local
                        storage, and are sent only to GitHub's API.
                      </p>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                  Fine-grained personal access tokens
                </div>
              </div>
              <span
                style={C.pill(
                  connectedCount === 2 ? 'var(--green)' : 'var(--accent)',
                  connectedCount === 2 ? 'rgba(34,197,94,.12)' : 'var(--accent-soft)',
                )}
              >
                {connectedCount} OF 2 CONNECTED
              </span>
            </div>

            <div style={{ display: 'grid', gap: 16 }}>
              {DASHBOARD_ORGANIZATIONS.map(organization => {
                const label = organizationLabel(organization)
                const connected = Boolean(orgPats[organization])
                const validating = validatingOrg === organization
                const saved = savedOrg === organization
                const error = tokenErrors[organization]

                return (
                  <div
                    key={organization}
                    style={{
                      padding: 15,
                      borderRadius: 8,
                      border: '1px solid var(--border)',
                      background: 'var(--surface2)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 12,
                        marginBottom: 10,
                      }}
                    >
                      <label
                        htmlFor={`token-${organization}`}
                        style={{ fontWeight: 650, fontSize: 13 }}
                      >
                        {label} token
                      </label>
                      {connected && (
                        <span style={C.pill('var(--green)', 'rgba(34,197,94,.12)')}>CONNECTED</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 9 }}>
                      <input
                        id={`token-${organization}`}
                        aria-label={`${label} token`}
                        type={visible[organization] ? 'text' : 'password'}
                        value={drafts[organization] || ''}
                        onChange={event => setDraft(organization, event.target.value)}
                        onKeyDown={event => event.key === 'Enter' && handleSave(organization)}
                        placeholder="github_pat_xxxxxxxxxxxxxxxxxxxx"
                        autoComplete="off"
                        spellCheck="false"
                        style={{ ...C.input, flex: 1, minWidth: 0 }}
                      />
                      <button
                        type="button"
                        aria-label={`${visible[organization] ? 'Hide' : 'Show'} ${label} token`}
                        onClick={() =>
                          setVisible(current => ({
                            ...current,
                            [organization]: !current[organization],
                          }))
                        }
                        style={{
                          ...C.btn('ghost'),
                          padding: '8px 10px',
                          display: 'grid',
                          placeItems: 'center',
                        }}
                      >
                        {visible[organization] ? <FiEyeOff size={14} /> : <FiEye size={14} />}
                      </button>
                    </div>
                    {error && (
                      <div
                        role="alert"
                        style={{
                          color: 'var(--red)',
                          fontSize: 12,
                          lineHeight: 1.5,
                          marginBottom: 10,
                        }}
                      >
                        {error}
                      </div>
                    )}
                    <div
                      style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
                    >
                      <button
                        type="button"
                        onClick={() => handleSave(organization)}
                        disabled={!drafts[organization]?.trim() || Boolean(validatingOrg)}
                        style={{
                          ...C.btn('primary'),
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        {saved ? <FiCheck size={13} /> : <FiSave size={13} />}
                        {validating ? 'Validating…' : saved ? 'Connected' : 'Use for this session'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(organization)}
                        disabled={!drafts[organization]?.trim() || Boolean(validatingOrg)}
                        style={{
                          ...C.btn('danger'),
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontSize: 12,
                        }}
                      >
                        <FiTrash2 size={13} /> Forget
                      </button>
                      <a
                        href={createTokenUrl(organization)}
                        target="_blank"
                        rel="noreferrer"
                        style={{
                          marginLeft: 'auto',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          fontSize: 12,
                          fontWeight: 650,
                        }}
                      >
                        Create {label} token <FiExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>

          <section style={C.card} aria-labelledby="pat-instructions-title">
            <h2
              id="pat-instructions-title"
              style={{ fontWeight: 650, fontSize: 15, marginBottom: 10 }}
            >
              Create a read-only fine-grained PAT
            </h2>
            <div
              style={{
                padding: 12,
                marginBottom: 14,
                borderRadius: 7,
                background: 'var(--accent-soft)',
                border: '1px solid var(--accent-border)',
                fontSize: 12,
                lineHeight: 1.6,
              }}
            >
              GitHub does not provide one global “Read-only permissions” switch. Select the
              organization as the Resource owner, then add each repository permission separately and
              choose <strong>Read-only</strong>.
            </div>
            <ol
              style={{
                margin: '0 0 14px 18px',
                color: 'var(--text2)',
                fontSize: 12,
                lineHeight: 1.75,
              }}
            >
              <li>
                Create one token for <strong style={{ color: 'var(--text)' }}>UMCCR</strong> and a
                second token for <strong style={{ color: 'var(--text)' }}>OrcaBus</strong>.
              </li>
              <li>
                For each token, choose that organization under{' '}
                <strong style={{ color: 'var(--text)' }}>Resource owner</strong>.
              </li>
              <li>
                Choose <strong style={{ color: 'var(--text)' }}>All repositories</strong>, or
                explicitly select the repositories the dashboard should analyze.
              </li>
              <li>
                Under <strong style={{ color: 'var(--text)' }}>Repository permissions</strong>, add{' '}
                <strong style={{ color: 'var(--text)' }}>Metadata: Read-only</strong>,{' '}
                <strong style={{ color: 'var(--text)' }}>Issues: Read-only</strong>, and{' '}
                <strong style={{ color: 'var(--text)' }}>Pull requests: Read-only</strong>. Metadata
                may be selected automatically.
              </li>
              <li>
                Generate the token. If GitHub marks it{' '}
                <strong style={{ color: 'var(--text)' }}>pending</strong>, an organization owner
                must approve it before it can read private resources.
              </li>
              <li>Paste each token into its matching field above.</li>
            </ol>
            <p style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              Public repositories are already read-only. If this dashboard only needs public data,
              choose <strong style={{ color: 'var(--text)' }}>Public repositories</strong> and leave
              optional permissions empty; the token can still raise the REST API limit. Private
              repositories require the organization-owned token and the repository permissions
              above.
            </p>
            <p style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.6, marginBottom: 12 }}>
              If the Resource owner list shows only your personal account, the organization may
              restrict fine-grained PATs or your account may not be eligible to create one for that
              organization. Ask a UMCCR or OrcaBus organization owner to confirm the PAT policy and
              approval requirement.
            </p>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 12 }}>
              <a href={PAT_DOCS_URL} target="_blank" rel="noreferrer">
                GitHub PAT guide
              </a>
              <a href={PERMISSION_DOCS_URL} target="_blank" rel="noreferrer">
                REST permission reference
              </a>
            </div>
          </section>

          <section style={C.card}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 14,
                marginBottom: 12,
              }}
            >
              <div>
                <div style={{ fontWeight: 650, fontSize: 15 }}>Data Cache</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>
                  IndexedDB · 1-hour TTL per entry
                </div>
              </div>
              <button
                type="button"
                onClick={handleClear}
                style={{
                  ...C.btn('danger'),
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 5,
                }}
              >
                <FiTrash2 size={13} /> {cleared ? 'Cleared' : 'Clear All'}
              </button>
            </div>
            <p style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.6 }}>
              API responses are cached in IndexedDB for one hour. Clearing forces fresh GitHub
              requests on the next analysis.
            </p>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <section style={C.card} aria-labelledby="api-quota-title">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 14,
                marginBottom: 16,
              }}
            >
              <div>
                <h2 id="api-quota-title" style={{ fontWeight: 650, fontSize: 15 }}>
                  API Quota
                </h2>
                <div style={{ color: 'var(--text2)', fontSize: 11, marginTop: 2 }}>
                  Check one organization credential at a time
                </div>
              </div>
              <button
                type="button"
                disabled={isRefreshing}
                onClick={async () => {
                  setIsRefreshing(true)
                  setRefreshError(false)
                  try {
                    const success = await refreshRateLimit(quotaOrg)
                    if (success) setCheckedQuotaOrg(quotaOrg)
                    else setRefreshError(true)
                  } finally {
                    setTimeout(() => setIsRefreshing(false), 500)
                  }
                }}
                style={{ ...C.btn('ghost'), padding: 7, display: 'grid', placeItems: 'center' }}
                aria-label={`Refresh ${organizationLabel(quotaOrg)} API quota`}
                title={refreshError ? 'Failed to refresh' : 'Refresh API quota'}
              >
                <FiRefreshCw
                  className={isRefreshing ? 'spin' : ''}
                  size={14}
                  color={refreshError ? 'var(--red)' : 'var(--text2)'}
                />
              </button>
            </div>
            <select
              aria-label="API quota organization"
              value={quotaOrg}
              onChange={event => {
                setQuotaOrg(event.target.value)
                setCheckedQuotaOrg('')
              }}
              style={{ ...C.select, width: '100%', marginBottom: 14 }}
            >
              {DASHBOARD_ORGANIZATIONS.map(organization => (
                <option key={organization} value={organization}>
                  {organizationLabel(organization)}
                </option>
              ))}
            </select>
            {displayedRateLimit ? (
              <>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ fontSize: 28, fontWeight: 700, color: rateColor }}>
                    {displayedRateLimit.remaining.toLocaleString()}
                  </span>
                  <span style={{ fontSize: 14, color: 'var(--text2)', marginLeft: 4 }}>
                    / {displayedRateLimit.limit.toLocaleString()}
                  </span>
                </div>
                <div style={{ ...C.label, marginBottom: 10 }}>Requests remaining</div>
                <div
                  style={{
                    height: 6,
                    background: 'var(--border)',
                    borderRadius: 3,
                    marginBottom: 10,
                  }}
                >
                  <div
                    style={{
                      width: `${(displayedRateLimit.remaining / displayedRateLimit.limit) * 100}%`,
                      height: '100%',
                      background: rateColor,
                      borderRadius: 3,
                    }}
                  />
                </div>
                {!hasAnyPat && (
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--text2)',
                      padding: '8px 10px',
                      background: 'var(--accent-soft)',
                      borderRadius: 4,
                    }}
                  >
                    Add organization PATs to raise authenticated API capacity.
                  </div>
                )}
              </>
            ) : (
              <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                Choose an organization and refresh to see its live API quota.
              </div>
            )}
          </section>

          <section style={C.card}>
            <div style={{ fontWeight: 650, fontSize: 15, marginBottom: 16 }}>
              Technical Information
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {[
                ['Version', 'v1.0.0-internal'],
                ['Architecture', 'Client-side only, no backend'],
                ['Credentials', `${connectedCount} of 2 organization tokens`],
                ['Portfolio', 'OrcaBus + UMCCR'],
                ['Cache', 'IndexedDB + browser preferences'],
              ].map(([key, value]) => (
                <div
                  key={key}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 14,
                    fontSize: 13,
                  }}
                >
                  <span style={{ color: 'var(--text2)' }}>{key}</span>
                  <span style={{ color: 'var(--accent)', fontWeight: 500, textAlign: 'right' }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '18px 0' }} />
            <div style={{ ...C.label, marginBottom: 8 }}>Attribution and license</div>
            <p style={{ color: 'var(--text2)', fontSize: 12, lineHeight: 1.6, marginBottom: 8 }}>
              {LEGAL_NOTICE}
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              <a href={UPSTREAM_URL} target="_blank" rel="noreferrer">
                Upstream source
              </a>
              <a href={GPL_URL} target="_blank" rel="noreferrer">
                GNU GPL v3
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
