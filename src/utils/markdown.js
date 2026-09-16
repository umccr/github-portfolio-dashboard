/**
 * Encode an untrusted value for use in a GitHub-Flavored Markdown table cell.
 *
 * Backslashes must be escaped before pipes so an input backslash cannot consume
 * the escape added to a table delimiter. Line endings are flattened to keep the
 * value within its intended row.
 */
export function escapeMarkdownTableCell(value) {
  if (value === null || value === undefined) return ''

  return String(value)
    .replace(/\r\n?|\n/g, ' ')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
}
