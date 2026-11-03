const isoDate = /^\d{4}-\d{2}-\d{2}$/

export function isCalendarDate(value) {
  if (typeof value !== 'string' || !isoDate.test(value) || value.startsWith('0000')) return false
  const date = new Date(`${value}T00:00:00.000Z`)
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

export function parseDateInput(value) {
  if (typeof value !== 'string') return null
  // Eight digits also work with a phone's numeric keyboard.
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value) || /^(\d{2})(\d{2})(\d{4})$/.exec(value)
  if (!match) return null
  const date = `${match[3]}-${match[2]}-${match[1]}`
  return isCalendarDate(date) ? date : null
}

export function formatDate(value, { timeZone } = {}) {
  if (value == null || value === '') return '—'
  if (typeof value === 'string' && isoDate.test(value)) {
    return isCalendarDate(value) ? value.split('-').reverse().join('/') : '—'
  }
  // Only timestamps and Date/number values should use a time zone. Avoid the
  // engine's locale-dependent parsing of arbitrary date strings.
  if (typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}T/.test(value)) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '—'
  const options = { day: '2-digit', month: '2-digit', year: 'numeric', calendar: 'gregory', numberingSystem: 'latn', ...(timeZone ? { timeZone } : {}) }
  let formatter
  try { formatter = new Intl.DateTimeFormat('en-GB', options) }
  catch { delete options.timeZone; formatter = new Intl.DateTimeFormat('en-GB', options) }
  const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.day}/${parts.month}/${parts.year.padStart(4, '0')}`
}

export const formatDateFilename = (value, options) => formatDate(value, options).replaceAll('/', '-')
