import { useEffect, useRef } from 'react'
import { FiKey, FiX } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { C } from './UI'
import { useApp } from '../context/app-context'
import { organizationLabel } from '../config/dashboard'

export default function PatRequiredDialog({ open, onClose }) {
  const navigate = useNavigate()
  const { selectedOrg } = useApp()
  const settingsButtonRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    settingsButtonRef.current?.focus()

    const handleKeyDown = event => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  const openSettings = () => {
    onClose()
    navigate('/settings')
  }

  return (
    <div
      role="presentation"
      onMouseDown={event => {
        if (event.target === event.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'grid',
        placeItems: 'center',
        padding: 20,
        background: 'rgba(0,0,0,.55)',
      }}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="pat-required-title"
        aria-describedby="pat-required-description"
        style={{
          ...C.card,
          width: 'min(480px, 100%)',
          padding: 24,
          boxShadow: '0 20px 60px rgba(0,0,0,.45)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              aria-hidden="true"
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                display: 'grid',
                placeItems: 'center',
                color: 'var(--accent)',
                background: 'var(--accent-soft)',
              }}
            >
              <FiKey size={18} />
            </span>
            <h2 id="pat-required-title" style={{ fontSize: 18, fontWeight: 700 }}>
              Personal Access Token required
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            style={{ ...C.btn('ghost'), padding: 7, display: 'grid', placeItems: 'center' }}
          >
            <FiX size={17} />
          </button>
        </div>

        <div
          id="pat-required-description"
          style={{ marginTop: 18, color: 'var(--text2)', fontSize: 13, lineHeight: 1.65 }}
        >
          <p>
            Complete Analysis needs{' '}
            {selectedOrg === 'all'
              ? 'a separate GitHub Personal Access Token for UMCCR and OrcaBus'
              : `a GitHub Personal Access Token for ${organizationLabel(selectedOrg)}`}{' '}
            so it can retrieve data for every accessible repository in this scope. Without the
            required token, GitHub limits anonymous requests and the dashboard can provide only a
            representative sample.
          </p>
          <p style={{ marginTop: 10 }}>
            Your token is stored only in this browser session and is sent only to GitHub.
          </p>
        </div>

        <div
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button type="button" onClick={onClose} style={C.btn('ghost')}>
            Continue with sample
          </button>
          <button
            ref={settingsButtonRef}
            type="button"
            onClick={openSettings}
            style={C.btn('primary')}
          >
            Open Settings
          </button>
        </div>
      </section>
    </div>
  )
}
