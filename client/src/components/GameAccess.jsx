import React from 'react'
import { useApp } from '../state'
import { activeCopy, ownership } from '../lib/domain'
import { subscriptionAccess } from '../lib/memberships'

export default function GameAccess({ game, platformId, includeOwnership = true, includeFormats = false, activeOnly = false }) {
  const { data, user, membershipNow } = useApp()
  const owned = includeOwnership && ownership(data, game._id, platformId)
  const formats = includeFormats && owned ? ['physical', 'digital'].filter(format => data.copies.some(copy => copy.gameId === game._id && (!platformId || copy.platformId === platformId) && activeCopy(copy) && copy.format === format)) : []
  const sources = subscriptionAccess(game, user?.memberships || data.user?.memberships, membershipNow).filter(source => !activeOnly || source.active)
  return <span className="access-badges">
    {owned && <span className="access-badge owned-tag">Owned</span>}
    {formats.map(format => <span key={format} className="access-badge">{format === 'physical' ? 'Physical' : 'Digital'}</span>)}
    {sources.map(source => <span key={source.service} className={`access-badge ${source.active ? 'access-active' : 'access-inactive'}`}>
      {source.label} · {source.active ? 'Active' : 'Inactive'}
    </span>)}
    {!owned && !sources.length && includeOwnership && <span className="muted">Not owned</span>}
  </span>
}
