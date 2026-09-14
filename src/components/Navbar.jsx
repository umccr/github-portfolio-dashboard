import { useEffect, useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { FiCheck, FiChevronDown, FiGithub, FiSettings, FiZap } from 'react-icons/fi'
import { useApp } from '../context/app-context'
import { APP_NAME, DASHBOARD_ORGANIZATIONS, organizationLabel } from '../config/dashboard'
import ThemeToggle from './ThemeToggle'

const LINKS = [
  { to: '/overview', label: 'Overview' },
  { to: '/repositories', label: 'Repositories' },
  { to: '/contributors', label: 'Contributors' },
  { to: '/analytics', label: 'Trends' },
  { to: '/governance', label: 'Triage' },
]

export default function Navbar() {
  const { orgs, rateLimit, selectedOrg, selectOrganization } = useApp()
  const [scopeOpen, setScopeOpen] = useState(false)
  const scopeRef = useRef(null)
  const navigate = useNavigate()
  const hasData = orgs.length > 0
  const lowLimit = rateLimit && rateLimit.remaining < 15

  useEffect(() => {
    const closeMenu = event => {
      if (scopeRef.current && !scopeRef.current.contains(event.target)) setScopeOpen(false)
    }
    document.addEventListener('mousedown', closeMenu)
    return () => document.removeEventListener('mousedown', closeMenu)
  }, [])

  const selectedMetadata = orgs.find(org => org.login === selectedOrg)
  const scopeLabel = selectedOrg === 'all' ? 'All organizations' : organizationLabel(selectedOrg)

  const chooseScope = orgLogin => {
    selectOrganization(orgLogin)
    setScopeOpen(false)
  }

  return (
    <nav className="dashboard-navbar" aria-label="Primary navigation">
      <div className="dashboard-brand-group">
        <button type="button" className="dashboard-wordmark" onClick={() => navigate('/overview')}>
          <span className="dashboard-wordmark-icon" aria-hidden="true"><FiGithub size={19} /></span>
          <span>{APP_NAME}</span>
        </button>

        <div className="dashboard-scope" ref={scopeRef}>
          <button
            type="button"
            className="dashboard-scope-button"
            aria-expanded={scopeOpen}
            aria-haspopup="menu"
            onClick={() => setScopeOpen(open => !open)}
          >
            {selectedOrg === 'all' ? (
              <span className="dashboard-scope-avatars" aria-hidden="true">
                {orgs.slice(0, 2).map(org => (
                  <img key={org.login} src={org.avatar_url} alt="" />
                ))}
              </span>
            ) : selectedMetadata?.avatar_url ? (
              <img className="dashboard-scope-avatar" src={selectedMetadata.avatar_url} alt="" />
            ) : (
              <FiGithub size={15} aria-hidden="true" />
            )}
            <span>{scopeLabel}</span>
            <FiChevronDown size={14} aria-hidden="true" />
          </button>

          {scopeOpen && (
            <div className="dashboard-scope-menu" role="menu" aria-label="Dashboard organization scope">
              <button
                type="button"
                role="menuitemradio"
                aria-checked={selectedOrg === 'all'}
                onClick={() => chooseScope('all')}
              >
                <span className="dashboard-scope-avatars" aria-hidden="true">
                  {orgs.slice(0, 2).map(org => <img key={org.login} src={org.avatar_url} alt="" />)}
                </span>
                <span><strong>All organizations</strong><small>Combined portfolio</small></span>
                {selectedOrg === 'all' && <FiCheck size={15} />}
              </button>

              {DASHBOARD_ORGANIZATIONS.map(orgLogin => {
                const metadata = orgs.find(org => org.login === orgLogin)
                return (
                  <button
                    key={orgLogin}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selectedOrg === orgLogin}
                    onClick={() => chooseScope(orgLogin)}
                  >
                    {metadata?.avatar_url
                      ? <img className="dashboard-scope-avatar" src={metadata.avatar_url} alt="" />
                      : <FiGithub size={18} aria-hidden="true" />}
                    <span><strong>{organizationLabel(orgLogin)}</strong><small>@{orgLogin}</small></span>
                    {selectedOrg === orgLogin && <FiCheck size={15} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <div className="dashboard-navlinks">
        {hasData && LINKS.map(({ to, label }) => (
          <NavLink
            key={to}
            to={to}
            className="navbar-link"
            style={({ isActive }) => ({
              display: 'block',
              padding: '17px 10px 15px',
              fontSize: 13,
              whiteSpace: 'nowrap',
              textDecoration: 'none',
              fontWeight: isActive ? 650 : 450,
              color: isActive ? 'var(--accent)' : 'var(--text2)',
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
            })}
          >
            {label}
          </NavLink>
        ))}
      </div>

      <div className="dashboard-nav-actions">
        {rateLimit && (
          <div className="dashboard-rate" style={{ color: lowLimit ? 'var(--red)' : 'var(--text2)' }} title="GitHub API requests remaining">
            <FiZap size={12} />
            <span>{rateLimit.remaining.toLocaleString()}</span>
          </div>
        )}
        <ThemeToggle />
        <button type="button" onClick={() => navigate('/settings')} className="dashboard-settings-button">
          <FiSettings size={14} /> <span>Settings</span>
        </button>
      </div>
    </nav>
  )
}
