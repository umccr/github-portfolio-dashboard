import { describe, expect, it } from 'vitest'
import { escapeMarkdownTableCell } from '../markdown'

describe('escapeMarkdownTableCell', () => {
  it('preserves ordinary table cell text', () => {
    expect(escapeMarkdownTableCell('Update contributor metrics')).toBe('Update contributor metrics')
  })

  it('escapes backslashes before pipes', () => {
    expect(escapeMarkdownTableCell(String.raw`repository\|injected | column`)).toBe(
      String.raw`repository\\\|injected \| column`,
    )
  })

  it('flattens every common line ending', () => {
    expect(escapeMarkdownTableCell('first\r\nsecond\rthird\nfourth')).toBe(
      'first second third fourth',
    )
  })

  it('handles empty values without stringifying them', () => {
    expect(escapeMarkdownTableCell(null)).toBe('')
    expect(escapeMarkdownTableCell(undefined)).toBe('')
  })
})
