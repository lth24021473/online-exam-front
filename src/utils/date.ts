const defaultDateTimeFormat = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'short',
  timeStyle: 'short',
})

/**
 * Formats a date/timestamp to a localized string ('vi-VN').
 * Returns '—' if the value is missing or invalid.
 */
export function formatDate(value?: string | number | null): string {
  if (!value) return '—'
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return typeof value === 'string' ? value : '—'
  try {
    return defaultDateTimeFormat.format(timestamp)
  } catch {
    return new Date(timestamp).toLocaleString('vi-VN')
  }
}

/**
 * Formats a date/timestamp to a localized string ('vi-VN').
 * Returns '' if the value is missing or invalid.
 */
export function formatDateTime(value?: string | number | null): string {
  if (!value) return ''
  const timestamp = typeof value === 'number' ? value : Date.parse(value)
  if (!Number.isFinite(timestamp)) return typeof value === 'string' ? value : ''
  try {
    return defaultDateTimeFormat.format(timestamp)
  } catch {
    return typeof value === 'string' ? value : ''
  }
}
