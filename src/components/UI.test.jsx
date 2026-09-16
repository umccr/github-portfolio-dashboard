import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard } from './UI'

describe('StatCard', () => {
  it('exposes metric help text from a keyboard-focusable help icon', () => {
    const helpText = 'Pull requests and issues are included. Commits are not included.'

    render(<StatCard label="Total Contributions" value={12} helpText={helpText} />)

    const help = screen.getByLabelText(`Total Contributions: ${helpText}`)
    expect(help).toHaveAttribute('title', helpText)
    expect(help).toHaveAttribute('tabindex', '0')
  })
})
