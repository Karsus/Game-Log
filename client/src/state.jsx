import React, { createContext, useContext, useEffect, useState, useRef } from 'react'
import { api } from './lib/api'
import { useMembershipClock } from './lib/useMembershipClock'
const Context = createContext(null)
export function AppProvider({ children }) {
  const [user, setUser] = useState(null), [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState(''), [demoMode, setDemoMode] = useState(false)
  const membershipNow = useMembershipClock(user?.memberships?.timeZone)
  async function reload() {
    const next = await api('/bootstrap'); setData(next); setUser(next.user); return next
  }
  async function initialize() {
    setLoading(true); setError('')
    try { const session = await api('/auth/session'); setDemoMode(session.demoMode); setUser(session.user); if (session.user) await reload(); else setData(null) }
    catch (e) { setError(e.message) } finally { setLoading(false) }
  }
  const started = useRef(false)
  useEffect(() => { if (!started.current) { started.current = true; initialize() } }, [])
  useEffect(() => { document.documentElement.dataset.theme = user?.preferences?.theme || 'dark' }, [user?.preferences?.theme])
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 4000); return () => clearTimeout(timer) }, [notice])
  async function mutate(path, method, value, message) {
    const result = await api(path, method, value)
    await reload()
    if (message) setNotice(message)
    return result
  }
  async function preferences(patch) {
    const result = await api('/preferences', 'PUT', { ...user.preferences, ...patch })
    setUser(old => old ? { ...old, preferences: result.preferences } : old)
    setData(old => old?.user ? { ...old, user: { ...old.user, preferences: result.preferences } } : old)
  }
  async function saveMemberships(value) {
    const result = await api('/memberships', 'PUT', value)
    setUser(old => old ? { ...old, memberships: result.memberships } : old)
    setData(old => old?.user ? { ...old, user: { ...old.user, memberships: result.memberships } } : old)
    setNotice('Memberships updated')
    return result
  }
  async function logout() { await api('/auth/logout', 'POST'); setUser(null); setData(null); await api('/auth/session') }
  return <Context.Provider value={{ user, data, demoMode, loading, error, initialize, reload, mutate, preferences, saveMemberships, membershipNow, logout, notice, notify: setNotice }}>{children}</Context.Provider>
}
export const useApp = () => useContext(Context)
