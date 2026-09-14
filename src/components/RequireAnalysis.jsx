import { FiAlertTriangle, FiRefreshCw, FiSettings } from 'react-icons/fi'
import { useNavigate } from 'react-router-dom'
import { useApp } from '../context/app-context'
import { C, Spinner } from './UI'

/** Keeps data-backed routes usable while the fixed portfolio loads. */
export default function RequireAnalysis({ children }) {
  const { model, error, explore, hydrating } = useApp()
  const navigate = useNavigate()

  if (hydrating || (!model && !error)) {
    return (
      <div style={{ minHeight: '55vh', display: 'grid', placeItems: 'center' }} role="status">
        <div style={{ display: 'grid', justifyItems: 'center', gap: 12, color: 'var(--text2)' }}>
          <Spinner />
          <span>{hydrating ? 'Restoring dashboard…' : 'Loading OrcaBus and UMCCR…'}</span>
        </div>
      </div>
    )
  }

  if (!model && error) {
    return (
      <div style={{ minHeight: '55vh', padding: 24, display: 'grid', placeItems: 'center' }}>
        <div className="dashboard-error" role="alert">
          <FiAlertTriangle size={24} style={{ marginBottom: 8 }} />
          <p>{error}</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={explore} style={{ ...C.btn('primary'), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FiRefreshCw size={14} /> Retry
            </button>
            <button type="button" onClick={() => navigate('/settings')} style={{ ...C.btn('ghost'), display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <FiSettings size={14} /> Configure token
            </button>
          </div>
        </div>
      </div>
    )
  }

  return children
}
