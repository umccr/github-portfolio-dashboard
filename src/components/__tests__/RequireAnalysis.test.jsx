import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RequireAnalysis from '../RequireAnalysis'

const app = vi.hoisted(() => ({
  state: { model: null, error: '', hydrating: false, explore: vi.fn() },
}))

vi.mock('../../context/app-context', () => ({ useApp: () => app.state }))

function renderGuarded() {
  return render(
    <MemoryRouter>
      <RequireAnalysis>
        <div>analysis dashboard</div>
      </RequireAnalysis>
    </MemoryRouter>,
  )
}

describe('RequireAnalysis', () => {
  beforeEach(() => {
    app.state = { model: null, error: '', hydrating: false, explore: vi.fn() }
  })

  it('shows a loader while the fixed portfolio is being loaded', () => {
    renderGuarded()
    expect(screen.getByText('Loading OrcaBus and UMCCR…')).toBeInTheDocument()
    expect(screen.queryByText('analysis dashboard')).not.toBeInTheDocument()
  })

  it('renders the page once an analysis is loaded', () => {
    app.state = { ...app.state, model: { totalRepos: [] } }
    renderGuarded()
    expect(screen.getByText('analysis dashboard')).toBeInTheDocument()
  })

  it('waits while the cached analysis is being restored', () => {
    app.state = { ...app.state, hydrating: true }
    renderGuarded()
    expect(screen.getByText('Restoring dashboard…')).toBeInTheDocument()
  })

  it('shows a recoverable error state', () => {
    app.state = { ...app.state, error: 'GitHub could not be reached.' }
    renderGuarded()
    expect(screen.getByRole('alert')).toHaveTextContent('GitHub could not be reached.')
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument()
  })
})
