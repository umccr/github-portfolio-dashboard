import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import AnalysisBanner from '../AnalysisBanner'

const app = vi.hoisted(() => ({ state: { scopeHasPat: false, selectedOrg: 'all' } }))

vi.mock('../../context/app-context', () => ({ useApp: () => app.state }))

function renderBanner(onRun = vi.fn()) {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route
          path="/"
          element={
            <AnalysisBanner description="Complete results require authentication." onRun={onRun} />
          }
        />
        <Route path="/settings" element={<div>Token settings</div>} />
      </Routes>
    </MemoryRouter>,
  )
  return onRun
}

describe('AnalysisBanner PAT guard', () => {
  beforeEach(() => {
    app.state = { scopeHasPat: false, selectedOrg: 'all' }
  })

  it('explains why a PAT is required before navigating to Settings', async () => {
    const user = userEvent.setup()
    const onRun = renderBanner()

    await user.click(screen.getByRole('button', { name: /connect pat & run/i }))

    expect(
      screen.getByRole('dialog', { name: /personal access token required/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/retrieve data for every accessible repository/i)).toBeInTheDocument()
    expect(onRun).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: /open settings/i }))
    expect(screen.getByText('Token settings')).toBeInTheDocument()
  })

  it('runs complete analysis immediately when a PAT is available', async () => {
    const user = userEvent.setup()
    const onRun = vi.fn()
    app.state = { scopeHasPat: true, selectedOrg: 'all' }
    renderBanner(onRun)

    await user.click(screen.getByRole('button', { name: /run complete analysis/i }))

    expect(onRun).toHaveBeenCalledOnce()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
