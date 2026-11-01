import React from 'react'
import { useApp } from '../state'
import { ownership } from '../lib/domain'
import { subscriptionAccess } from '../lib/memberships'

export default function GameAccess({ game, platformId, includeOwnership = true }) {
  const { data, user, membershipNow } = useApp()
  const owned = includeOwnership && ownership(data, game._id, platformId)
  const sources = subscriptionAccess(game, user?.memberships || data.user?.memberships, membershipNow)
  return <span className="access-badges">
    {owned && <span className="access-badge owned-tag">Owned</span>}
    {sources.map(source => <span key={source.service} className={`access-badge ${source.active ? 'access-active' : 'access-inactive'}`}>
      {source.label} · {source.active ? 'Active' : 'Inactive'}
    </span>)}
    {!owned && !sources.length && includeOwnership && <span className="muted">Not owned</span>}
  </span>
}
