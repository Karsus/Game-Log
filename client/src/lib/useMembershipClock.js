import { useEffect, useState } from 'react'
import { membershipDate } from './memberships'

export function nextMembershipDateChange(timeZone, now = Date.now()) {
  const today = membershipDate(timeZone, now)
  let low = now, high = now + 36 * 60 * 60 * 1000
  // Search actual local dates so a 23-hour or 25-hour DST day uses its real boundary.
  while (membershipDate(timeZone, high) === today) high += 24 * 60 * 60 * 1000
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2)
    if (membershipDate(timeZone, middle) === today) low = middle
    else high = middle
  }
  return high
}

export function useMembershipClock(timeZone) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let timer
    function refresh() {
      clearTimeout(timer)
      const current = Date.now()
      setNow(current)
      timer = setTimeout(refresh, Math.max(1, nextMembershipDateChange(timeZone, current) - current))
    }
    function visible() { if (document.visibilityState === 'visible') refresh() }
    refresh()
    window.addEventListener('focus', refresh)
    document.addEventListener('visibilitychange', visible)
    return () => { clearTimeout(timer); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible) }
  }, [timeZone])
  return now
}
