export const SUBSCRIPTION_LABELS = {
  'game-pass': 'Game Pass',
  'game-pass-essential': 'Game Pass Essential (Core)',
  'game-pass-premium': 'Game Pass Premium (Standard)',
  'game-pass-pc': 'PC Game Pass',
  'game-pass-ultimate': 'Game Pass Ultimate',
  'ps-plus-basic': 'PS Plus Basic',
  'ps-plus-extra': 'PS Plus Extra',
  'ps-plus-premium': 'PS Plus Premium',
}
const gamePassCoverage = {
  'game-pass-essential': ['game-pass-essential'],
  'game-pass-premium': ['game-pass-essential', 'game-pass-premium'],
  'game-pass-pc': ['game-pass-pc'],
  'game-pass-ultimate': ['game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate'],
}
const psPlusCoverage = {
  'ps-plus-basic': ['ps-plus-basic'],
  'ps-plus-extra': ['ps-plus-basic', 'ps-plus-extra'],
  'ps-plus-premium': ['ps-plus-basic', 'ps-plus-extra', 'ps-plus-premium'],
}
const formatters = new Map()
function formatter(timeZone) {
  if (!formatters.has(timeZone)) formatters.set(timeZone, new Intl.DateTimeFormat('en-CA', { timeZone, calendar: 'iso8601', numberingSystem: 'latn', year: 'numeric', month: '2-digit', day: '2-digit' }))
  return formatters.get(timeZone)
}
function validTimeZone(value) {
  if (typeof value !== 'string' || !value) return false
  try { formatter(value); return true } catch { return false }
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}
export function browserTimeZone() {
  const value = Intl.DateTimeFormat().resolvedOptions().timeZone
  return validTimeZone(value) ? value : 'UTC'
}
export function defaultMemberships(timeZone = null) {
  return { timeZone: validTimeZone(timeZone) ? timeZone : null, gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null } }
}
export function normalizeMemberships(value, timeZoneFallback = null) {
  const result = defaultMemberships(validTimeZone(value?.timeZone) ? value.timeZone : timeZoneFallback)
  for (const [key, coverage] of [['gamePass', gamePassCoverage], ['psPlus', psPlusCoverage]]) {
    const branch = value?.[key]
    const validUntil = branch?.activeUntil == null || branch.activeUntil === '' || validDate(branch.activeUntil)
    if (branch && validUntil && (branch.tier === 'none' || Object.hasOwn(coverage, branch.tier))) {
      result[key] = { tier: branch.tier, activeUntil: branch.activeUntil || null }
    }
  }
  return result
}
export function membershipDate(timeZone, now = Date.now()) {
  const zone = validTimeZone(timeZone) ? timeZone : browserTimeZone()
  const parts = Object.fromEntries(formatter(zone).formatToParts(new Date(now)).map(part => [part.type, part.value]))
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`
}
export function membershipActive(branch, timeZone, now = Date.now()) {
  if (!branch || !Object.hasOwn({ ...gamePassCoverage, ...psPlusCoverage }, branch.tier)) return false
  return branch.activeUntil == null || branch.activeUntil === '' || validDate(branch.activeUntil) && membershipDate(timeZone, now) <= branch.activeUntil
}
export function subscriptionAccess(game, memberships, now = Date.now()) {
  const account = normalizeMemberships(memberships)
  const gamePassActive = membershipActive(account.gamePass, account.timeZone, now), psPlusActive = membershipActive(account.psPlus, account.timeZone, now)
  return (game?.subscriptions || []).filter(entry => Object.hasOwn(SUBSCRIPTION_LABELS, entry.service)).map(({ service }) => {
    // Legacy Game Pass entries did not record a tier; any active Game Pass membership covers that unspecified source.
    const active = service === 'game-pass' ? gamePassActive : service.startsWith('game-pass-') ? gamePassActive && gamePassCoverage[account.gamePass.tier].includes(service) : psPlusActive && psPlusCoverage[account.psPlus.tier].includes(service)
    return { service, label: SUBSCRIPTION_LABELS[service], active }
  })
}
export const subscriptionAccessLabel = (game, memberships, now = Date.now(), { activeOnly = false } = {}) => subscriptionAccess(game, memberships, now).filter(source => !activeOnly || source.active).map(({ label, active }) => `${label} · ${active ? 'Active' : 'Inactive'}`).join('; ')
