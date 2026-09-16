import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SettingsPage from '../SettingsPage'

const mocks = vi.hoisted(() => ({
  saveOrgPat: vi.fn(),
  refreshRateLimit: vi.fn(),
}))

vi.mock('../../context/app-context', () => ({
  useApp: () => ({
    orgPats: { OrcaBus: '', umccr: '' },
    saveOrgPat: mocks.saveOrgPat,
    hasAnyPat: false,
    rateLimit: null,
    refreshRateLimit: mocks.refreshRateLimit,
  }),
}))

vi.mock('../../services/github', () => ({ cacheClear: vi.fn() }))
vi.mock('../../services/cache', () => ({ clearAnalysis: vi.fn() }))

// Minimal router for the token validation sequence: token check, organization
// read, then the private-repository probe used to confirm the resource owner.
function stubGitHub({ privateReposByOrg = {} } = {}) {
  const fetchMock = vi.fn(async url => {
    if (url.includes('/rate_limit')) return { ok: true, status: 200 }

    const match = /\/orgs\/([^/]+)\/repos/.exec(url)
    const organization = match ? match[1] : ''

    if (url.includes('type=private')) {
      return {
        ok: true,
        status: 200,
        json: async () => privateReposByOrg[organization] || [],
      }
    }

    return { ok: true, status: 200, json: async () => [{ name: 'public-repo' }] }
  })

  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

async function saveToken(user, label, token) {
  const input = screen.getByLabelText(label)
  await user.type(input, token)
  const card = input.parentElement.parentElement
  await user.click(within(card).getByRole('button', { name: /use for this session|saved/i }))
  return card
}

describe('SettingsPage organization tokens', () => {
  beforeEach(() => {
    mocks.saveOrgPat.mockReset()
    stubGitHub()
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

  it('confirms the resource owner when a private repository is visible', async () => {
    stubGitHub({ privateReposByOrg: { umccr: [{ name: 'private-repo' }] } })
    const user = userEvent.setup()
    render(<SettingsPage />)

    const card = await saveToken(user, 'UMCCR token', 'github_pat_umccr_test')

    await waitFor(() =>
      expect(mocks.saveOrgPat).toHaveBeenCalledWith('umccr', 'github_pat_umccr_test'),
    )
    expect(within(card).queryByRole('status')).not.toBeInTheDocument()
  })

  it('rejects a token whose resource owner is the other organization', async () => {
    stubGitHub({ privateReposByOrg: { OrcaBus: [{ name: 'private-repo' }] } })
    const user = userEvent.setup()
    render(<SettingsPage />)

    const card = await saveToken(user, 'UMCCR token', 'github_pat_orcabus_test')

    const alert = await within(card).findByRole('alert')
    expect(alert).toHaveTextContent(/authorized for OrcaBus, not UMCCR/i)
    expect(mocks.saveOrgPat).not.toHaveBeenCalled()
  })

  it('marks a public-only token as unverified instead of fully connected', async () => {
    stubGitHub()
    const user = userEvent.setup()
    render(<SettingsPage />)

    const card = await saveToken(user, 'UMCCR token', 'github_pat_public_only')

    await waitFor(() =>
      expect(mocks.saveOrgPat).toHaveBeenCalledWith('umccr', 'github_pat_public_only'),
    )
    const notice = await within(card).findByRole('status')
    expect(notice).toHaveTextContent(/only public access to UMCCR could be confirmed/i)
  })
})
