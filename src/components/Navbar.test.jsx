import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import Navbar from './Navbar'

const app = vi.hoisted(() => ({
  selectOrganization: vi.fn(),
  state: {
    orgs: [
      { login: 'OrcaBus', avatar_url: 'https://example.test/orcabus.png' },
      { login: 'umccr', avatar_url: 'https://example.test/umccr.png' },
    ],
    rateLimit: null,
    selectedOrg: 'all',
  },
}))

vi.mock('../context/app-context', () => ({
  useApp: () => ({ ...app.state, selectOrganization: app.selectOrganization }),
}))
vi.mock('./ThemeToggle', () => ({ default: () => <button type="button">Theme</button> }))

describe('Navbar organization scope', () => {
  beforeEach(() => {
    app.selectOrganization.mockReset()
    app.state.selectedOrg = 'all'
  })

  it('shows the combined portfolio by default and offers both fixed organizations', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Navbar /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: /all organizations/i }))

    expect(screen.getByRole('menuitemradio', { name: /combined portfolio/i })).toHaveAttribute('aria-checked', 'true')
    expect(screen.getByRole('menuitemradio', { name: /umccr/i })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: /orcabus/i })).toBeInTheDocument()
  })

  it('applies a selected organization from the dropdown', async () => {
    const user = userEvent.setup()
    render(<MemoryRouter><Navbar /></MemoryRouter>)

    await user.click(screen.getByRole('button', { name: /all organizations/i }))
    await user.click(screen.getByRole('menuitemradio', { name: /umccr/i }))

    expect(app.selectOrganization).toHaveBeenCalledWith('umccr')
  })
})
