import React, { useEffect, useRef, useState } from 'react'
import { useApp } from '../state'
import { browserTimeZone, membershipActive, membershipDate, normalizeMemberships } from '../lib/memberships'
import { Button, ErrorMessage, Field } from './ui'

const providers = [
  { key: 'gamePass', label: 'Game Pass', options: [['none', 'None'], ['game-pass-essential', 'Essential (Core)'], ['game-pass-premium', 'Premium (Standard)'], ['game-pass-pc', 'PC'], ['game-pass-ultimate', 'Ultimate']], hint: 'Ultimate includes the lower Game Pass tiers and PC access.' },
  { key: 'psPlus', label: 'PS Plus', options: [['none', 'None'], ['ps-plus-basic', 'Basic'], ['ps-plus-extra', 'Extra'], ['ps-plus-premium', 'Premium']], hint: 'Higher tiers include lower tiers. Basic marks claimed monthly games; Extra and Premium mark catalog access.' },
]

function status(branch, timeZone, now) {
  if (membershipActive(branch, timeZone, now)) return 'Active'
  if (branch.tier !== 'none' && branch.activeUntil && branch.activeUntil < membershipDate(timeZone, now)) return 'Expired'
  return 'Inactive'
}

export function MembershipsSummary({ memberships }) {
  const value = normalizeMemberships(memberships)
  return <span className="memberships-summary">{providers.map(({ key, label, options }) => <React.Fragment key={key}><strong>{label}:</strong> {options.find(([tier]) => tier === value[key].tier)?.[1] || 'None'} · {value[key].activeUntil ? `Active through ${value[key].activeUntil}` : 'No end date'}<br /></React.Fragment>)}<strong>Time zone:</strong> {value.timeZone || 'Not set'}</span>
}

export default function Memberships() {
  const { user, membershipNow, saveMemberships, notify } = useApp()
  const saved = normalizeMemberships(user.memberships), savedKey = JSON.stringify(saved)
  const localTimeZone = browserTimeZone()
  const forDraft = value => normalizeMemberships(value, localTimeZone)
  const [draft, setDraft] = useState(() => forDraft(saved)), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const baseline = useRef(JSON.stringify(forDraft(saved))), lastStored = useRef(savedKey)
  const dirty = JSON.stringify(draft) !== baseline.current

  useEffect(() => {
    if (lastStored.current === savedKey) return
    lastStored.current = savedKey
    const hadUnsavedChanges = JSON.stringify(draft) !== baseline.current
    const next = normalizeMemberships(saved, localTimeZone)
    baseline.current = JSON.stringify(next)
    setDraft(hadUnsavedChanges ? { ...draft } : next)
  }, [savedKey, localTimeZone, draft])

  function update(key, patch) { setDraft(old => ({ ...old, [key]: { ...old[key], ...patch } })) }
  function reset() { const next = forDraft(saved); baseline.current = JSON.stringify(next); setDraft(next); setError('') }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('')
    try {
      await saveMemberships(draft)
      baseline.current = JSON.stringify(draft)
      notify('Subscription settings saved')
    } catch (error) { setError(error.message) }
    finally { setBusy(false) }
  }

  return <section className="panel padded memberships-panel" aria-label="My subscriptions"><h2>My subscriptions</h2><p className="muted">Record your current memberships to see which subscription games you can access. Subscription games never count as owned.</p><form onSubmit={save}><fieldset disabled={busy} className="form-fields"><div className="form-grid">{providers.map(({ key, label, options, hint }) => <section key={key} aria-label={`${label} membership`}><h3>{label} <span className={`membership-status ${status(saved[key], saved.timeZone, membershipNow).toLowerCase()}`}>{status(saved[key], saved.timeZone, membershipNow)}</span></h3><p className="muted">Status reflects your saved settings.</p><Field label={`${label} tier`} hint={hint}><select aria-label={`${label} tier`} value={draft[key].tier} onChange={e => update(key, { tier: e.target.value, ...(e.target.value === 'none' ? { activeUntil: null } : {}) })}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field><Field label={`${label} active through`} hint="Optional. Access includes this entire date in the time zone below; leave blank for no end date."><input type="date" aria-label={`${label} active through`} disabled={draft[key].tier === 'none'} value={draft[key].activeUntil || ''} onChange={e => update(key, { activeUntil: e.target.value || null })} /></Field></section>)}</div><div className="memberships-timezone"><p><strong>Time zone for dates:</strong> <span>{draft.timeZone}</span></p><Button type="button" onClick={() => setDraft(old => ({ ...old, timeZone: localTimeZone }))}>Use browser time zone</Button><small className="muted">Browser time zone: {localTimeZone}. Changes take effect when you save.</small></div><ErrorMessage>{error}</ErrorMessage><div className="memberships-actions"><Button type="submit" variant="primary" busy={busy}>Save subscriptions</Button>{dirty && <Button type="button" onClick={reset}>Reset changes</Button>}</div></fieldset></form></section>
}
