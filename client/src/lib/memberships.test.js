import { describe, it, expect, vi } from 'vitest'
import { defaultMemberships, normalizeMemberships, browserTimeZone, membershipDate, membershipActive, subscriptionAccess, subscriptionAccessLabel } from './memberships'

const now = Date.parse('2026-11-01T12:00:00Z')
const gpSources = ['game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate']
const psSources = ['ps-plus-basic', 'ps-plus-extra', 'ps-plus-premium']
const allSources = { subscriptions: ['game-pass', ...gpSources, ...psSources].map(service => ({ service })) }
const account = (branch, tier, activeUntil = null, timeZone = 'UTC') => ({ ...defaultMemberships(timeZone), [branch]: { tier, activeUntil } })

describe('membership normalization', () => {
  it('keeps old accounts inactive and returns independent defaults', () => {
    const expected = { timeZone: null, gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null } }
    expect(normalizeMemberships(undefined)).toEqual(expected)
    expect(defaultMemberships()).toEqual(expected)
    const one = defaultMemberships(); one.gamePass.tier = 'game-pass-ultimate'
    expect(defaultMemberships()).toEqual(expected)
    expect(subscriptionAccess(allSources, undefined, now).every(entry => entry.active === false)).toBe(true)
  })

  it('fills missing branches, preserves valid values, and uses only valid fallback time zones', () => {
    expect(normalizeMemberships({ gamePass: { tier: 'game-pass-pc', activeUntil: '' } }, 'America/Mexico_City')).toEqual(account('gamePass', 'game-pass-pc', null, 'America/Mexico_City'))
    expect(normalizeMemberships({ timeZone: 'Asia/Tokyo', psPlus: { tier: 'ps-plus-extra', activeUntil: '2028-02-29' } }, 'UTC')).toEqual(account('psPlus', 'ps-plus-extra', '2028-02-29', 'Asia/Tokyo'))
    expect(normalizeMemberships({ timeZone: 'Invalid/Zone', gamePass: { tier: 'unknown', activeUntil: null } }, 'UTC')).toEqual(defaultMemberships('UTC'))
    expect(normalizeMemberships({ gamePass: { tier: 'game-pass-pc', activeUntil: '2026-02-30' } })).toEqual(defaultMemberships())
    expect(typeof browserTimeZone()).toBe('string')
    expect(() => new Intl.DateTimeFormat('en', { timeZone: browserTimeZone() })).not.toThrow()
  })
})

describe('tier coverage', () => {
  it.each([
    ['none', []],
    ['game-pass-essential', ['game-pass', 'game-pass-essential']],
    ['game-pass-premium', ['game-pass', 'game-pass-essential', 'game-pass-premium']],
    ['game-pass-pc', ['game-pass', 'game-pass-pc']],
    ['game-pass-ultimate', ['game-pass', ...gpSources]],
  ])('Game Pass membership %s covers exactly its source tiers and legacy generic access', (tier, covered) => {
    expect(subscriptionAccess(allSources, account('gamePass', tier), now).filter(entry => entry.active).map(entry => entry.service)).toEqual(covered)
  })

  it.each([
    ['none', []],
    ['ps-plus-basic', ['ps-plus-basic']],
    ['ps-plus-extra', ['ps-plus-basic', 'ps-plus-extra']],
    ['ps-plus-premium', psSources],
  ])('PS Plus membership %s covers exactly its source tiers', (tier, covered) => {
    expect(subscriptionAccess(allSources, account('psPlus', tier), now).filter(entry => entry.active).map(entry => entry.service)).toEqual(covered)
  })

  it('keeps provider memberships independent and never changes saved sources', () => {
    const memberships = account('gamePass', 'game-pass-ultimate', '2026-10-31')
    memberships.psPlus = { tier: 'ps-plus-extra', activeUntil: '2026-11-01' }
    const original = structuredClone({ memberships, game: allSources })
    expect(subscriptionAccess(allSources, memberships, now).filter(entry => entry.active).map(entry => entry.service)).toEqual(['ps-plus-basic', 'ps-plus-extra'])
    expect({ memberships, game: allSources }).toEqual(original)
    expect(subscriptionAccessLabel({ subscriptions: [{ service: 'game-pass-pc' }, { service: 'ps-plus-basic' }] }, memberships, now)).toBe('PC Game Pass · Inactive; PS Plus Basic · Active')
  })
})

describe('expiration dates and time zones', () => {
  it('includes the entire saved expiration day in the saved time zone', () => {
    const branch = { tier: 'ps-plus-basic', activeUntil: '2026-11-01' }
    expect(membershipActive(branch, 'America/Mexico_City', Date.parse('2026-11-02T05:59:59.999Z'))).toBe(true)
    expect(membershipActive(branch, 'America/Mexico_City', Date.parse('2026-11-02T06:00:00Z'))).toBe(false)
    expect(membershipActive(branch, 'Asia/Tokyo', Date.parse('2026-11-01T14:59:59.999Z'))).toBe(true)
    expect(membershipActive(branch, 'Asia/Tokyo', Date.parse('2026-11-01T15:00:00Z'))).toBe(false)
  })

  it('uses the saved zone even when the browser local date is different', () => {
    const time = Date.parse('2026-11-01T12:00:00Z')
    expect(membershipDate('Pacific/Kiritimati', time)).toBe('2026-11-02')
    expect(membershipDate('Pacific/Honolulu', time)).toBe('2026-11-01')
    const branch = { tier: 'game-pass-ultimate', activeUntil: '2026-11-01' }
    expect(membershipActive(branch, 'Pacific/Kiritimati', time)).toBe(false)
    expect(membershipActive(branch, 'Pacific/Honolulu', time)).toBe(true)
  })

  it('supports no expiry but never activates none or invalid dates', () => {
    expect(membershipActive({ tier: 'game-pass-pc', activeUntil: null }, 'UTC', now)).toBe(true)
    expect(membershipActive({ tier: 'ps-plus-premium', activeUntil: '' }, 'UTC', now)).toBe(true)
    expect(membershipActive({ tier: 'none', activeUntil: '2099-01-01' }, 'UTC', now)).toBe(false)
    expect(membershipActive({ tier: 'game-pass-pc', activeUntil: '2026-02-30' }, 'UTC', now)).toBe(false)
    expect(membershipActive({ tier: 'invalid', activeUntil: null }, 'UTC', now)).toBe(false)
  })

  it('reads the current clock when a caller omits now', () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime('2026-11-01T23:59:59Z')
      expect(membershipActive({ tier: 'ps-plus-basic', activeUntil: '2026-11-01' }, 'UTC')).toBe(true)
      vi.setSystemTime('2026-11-02T00:00:00Z')
      expect(membershipActive({ tier: 'ps-plus-basic', activeUntil: '2026-11-01' }, 'UTC')).toBe(false)
    } finally { vi.useRealTimers() }
  })
})
