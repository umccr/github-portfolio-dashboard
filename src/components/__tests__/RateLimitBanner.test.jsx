import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import RateLimitBanner from '../RateLimitBanner'

const mocks = vi.hoisted(() => ({ state: {} }))

vi.mock('../../context/app-context', () => ({ useApp: () => mocks.state }))

function renderBanner() {
  return render(
    <MemoryRouter>
      <RateLimitBanner />
    </MemoryRouter>,
  )
}

describe('RateLimitBanner', () => {
  beforeEach(() => {
    mocks.state = {
      rateLimit: { limit: 60, remaining: 5, used: 55, reset: Math.floor(Date.now() / 1000) + 600 },
      scopeHasPat: false,
    }
  })

  it('offers Settings as a keyboard-reachable link', () => {
    renderBanner()

    const link = screen.getByRole('link', { name: /add required pats/i })
    expect(link).toHaveAttribute('href', '/settings')
  })

  it('hides the token prompt once the scope is authenticated', () => {
    mocks.state = { ...mocks.state, scopeHasPat: true }
    renderBanner()

    expect(screen.queryByRole('link', { name: /add required pats/i })).not.toBeInTheDocument()
  })
})
