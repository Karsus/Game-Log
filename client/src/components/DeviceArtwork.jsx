import React, { useEffect, useState } from 'react'
import { activeCopy } from '../lib/domain'
import DeviceIllustration from './DeviceIllustration'

export default function DeviceArtwork({ unit, platform }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [unit.image])

  return <div className="hardware-art">
    {unit.image && !failed
      ? <img src={unit.image} alt={unit.nickname} loading="lazy" onError={() => setFailed(true)} />
      : <DeviceIllustration platform={platform} model={unit.model} />}
    <span className={`tiny-badge ${activeCopy(unit) ? 'owned-tag' : ''}`}>{unit.state}</span>
  </div>
}
