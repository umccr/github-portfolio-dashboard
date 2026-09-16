import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from './SettingsPage'

const mocks = vi.hoisted(() => ({
  saveOrgPat: vi.fn(),
  refreshRateLimit: vi.fn(),
}))

vi.mock('../context/app-context', () => ({
  useApp: () => ({
    orgPats: { OrcaBus: '', umccr: '' },
    saveOrgPat: mocks.saveOrgPat,
    hasAnyPat: false,
    rateLimit: null,
    refreshRateLimit: mocks.refreshRateLimit,
  }),
}))

vi.mock('../services/github', () => ({ cacheClear: vi.fn() }))
vi.mock('../services/cache', () => ({ clearAnalysis: vi.fn() }))

describe('SettingsPage organization tokens', () => {
  beforeEach(() => {
    mocks.saveOrgPat.mockReset()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200 }))
  })

  afterEach(() => vi.unstubAllGlobals())

  it('renders and saves separate UMCCR and OrcaBus credentials', async () => {
    const user = userEvent.setup()
    render(<SettingsPage />)

    const umccrInput = screen.getByLabelText('UMCCR token')
    const orcabusInput = screen.getByLabelText('OrcaBus token')
    expect(umccrInput).not.toBe(orcabusInput)

    await user.type(umccrInput, 'github_pat_umccr_test')
    const umccrCard = umccrInput.parentElement.parentElement
    await user.click(within(umccrCard).getByRole('button', { name: /use for this session/i }))

    await waitFor(() =>
      expect(mocks.saveOrgPat).toHaveBeenCalledWith('umccr', 'github_pat_umccr_test'),
    )
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('/orgs/umccr/repos'),
      expect.any(Object),
    )

    expect(screen.getByRole('link', { name: /create umccr token/i })).toHaveAttribute(
      'href',
      expect.stringContaining('target_name=umccr'),
    )
    expect(screen.getByRole('link', { name: /create orcabus token/i })).toHaveAttribute(
      'href',
      expect.stringContaining('target_name=OrcaBus'),
    )
  })
})
