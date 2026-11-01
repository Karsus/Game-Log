// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { membershipActive } from './memberships'
import { nextMembershipDateChange, useMembershipClock } from './useMembershipClock'

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

describe('membership clock', () => {
  it.each([
    ['2026-03-08T05:00:00Z', '2026-03-09T04:00:00Z', 23],
    ['2026-11-01T04:00:00Z', '2026-11-02T05:00:00Z', 25],
  ])('finds the real next New York midnight from %s across DST', (start, end, hours) => {
    const boundary = nextMembershipDateChange('America/New_York', Date.parse(start))
    expect(boundary).toBe(Date.parse(end))
    expect(boundary - Date.parse(start)).toBe(hours * 60 * 60 * 1000)
  })

  it('updates activity at the saved zone midnight without navigation or mutations', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-02T05:59:59Z')
    const branch = { tier: 'game-pass-pc', activeUntil: '2026-11-01' }
    const { result, unmount } = renderHook(() => useMembershipClock('America/Mexico_City'))
    expect(membershipActive(branch, 'America/Mexico_City', result.current)).toBe(true)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(Date.parse('2026-11-02T06:00:00Z'))
    expect(membershipActive(branch, 'America/Mexico_City', result.current)).toBe(false)
    expect(branch).toEqual({ tier: 'game-pass-pc', activeUntil: '2026-11-01' })
    unmount()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('refreshes after a suspended tab regains focus or becomes visible', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-01T12:00:00Z')
    const { result } = renderHook(() => useMembershipClock('UTC'))
    vi.setSystemTime('2026-11-02T12:00:00Z')
    act(() => window.dispatchEvent(new Event('focus')))
    expect(result.current).toBe(Date.parse('2026-11-02T12:00:00Z'))
    vi.setSystemTime('2026-11-03T12:00:00Z')
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toBe(Date.parse('2026-11-02T12:00:00Z'))
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    expect(result.current).toBe(Date.parse('2026-11-03T12:00:00Z'))
    expect(vi.getTimerCount()).toBe(1)
  })

  it('reschedules expiration when the saved time zone changes', () => {
    vi.useFakeTimers(); vi.setSystemTime('2026-11-01T14:59:59Z')
    const { result, rerender } = renderHook(({ zone }) => useMembershipClock(zone), { initialProps: { zone: 'UTC' } })
    rerender({ zone: 'Asia/Tokyo' })
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(1000))
    expect(result.current).toBe(Date.parse('2026-11-01T15:00:00Z'))
    expect(membershipActive({ tier: 'ps-plus-basic', activeUntil: '2026-11-01' }, 'Asia/Tokyo', result.current)).toBe(false)
  })
})
