import React, { useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, Save, RotateCcw, X, SlidersHorizontal } from 'lucide-react'
import { useApp } from '../state'
import { DEFAULT_FILTERS, parseFilters, SERVICE_LABELS, wholeDifficulty } from '../lib/domain'
import { Button, MultiSelect, ErrorMessage, statusOptions } from './ui'
export function useFilters(scope) {
  const { user } = useApp(), [params, setParams] = useSearchParams()
  const filters = parseFilters(params.toString(), user.preferences?.[scope], scope), query = params.get('q') || ''
  const current = useRef({ filters, query, search: params.toString() })
  if (current.current.search !== params.toString()) current.current = { filters, query, search: params.toString() }
  function update(next, nextQuery = current.current.query) {
    const values = { ...current.current.filters, ...next }, result = new URLSearchParams()
    for (const [key, value] of Object.entries(values)) result.set(key, Array.isArray(value) ? value.join(',') : value)
    if (nextQuery) result.set('q', nextQuery)
    current.current = { filters: values, query: nextQuery, search: current.current.search }
    setParams(result, { replace: true })
  }
  return { filters, query, update }
}
export function Filters({ scope, filters, query, update }) {
  const { data, user, preferences, notify } = useApp(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const board = scope === 'hunts'
  async function save() { setBusy(true); setError(''); try { await preferences({ [scope]: filters }); notify('Default filters and sorting saved') } catch (e) { setError(e.message) } finally { setBusy(false) } }
  return <section className="filter-panel" aria-label={`${board ? 'Hunt board' : 'Catalog'} filters`}>
    <div className="filter-primary"><div className="search-box"><Search size={17} /><input aria-label="Search games" placeholder="Search your games…" value={query} onChange={e => update({}, e.target.value)} /></div><MultiSelect label="Platforms" value={filters.platforms} options={data.platforms.map(p => ({ value: p._id, label: p.name }))} onChange={platforms => update({ platforms })} />
      <select aria-label="Ownership filter" value={filters.ownership} onChange={e => update({ ownership: e.target.value })}><option value="all">All games</option><option value="owned">Owned</option><option value="subscription">Subscription access</option><option value="game-pass">All Game Pass</option><option value="game-pass-essential">Game Pass Essential (Core)</option><option value="game-pass-premium">Game Pass Premium (Standard)</option><option value="game-pass-pc">PC Game Pass</option><option value="game-pass-ultimate">Game Pass Ultimate</option><option value="ps-plus">All PS Plus</option><option value="ps-plus-basic">PS Plus Basic</option><option value="ps-plus-extra">PS Plus Extra</option><option value="ps-plus-premium">PS Plus Premium</option><option value="wishlist">Wishlist</option><option value="unowned">Not owned</option></select>
      {board ? <><select aria-label="Status filter" value={filters.status} onChange={e => update({ status: e.target.value })}><option value="">All statuses</option>{statusOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select><select aria-label="Achievement service filter" value={filters.service} onChange={e => update({ service: e.target.value })}><option value="">All services</option>{Object.entries(SERVICE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select aria-label="Difficulty filter" value={filters.difficulty} onChange={e => update({ difficulty: e.target.value })}><option value="">All difficulties</option>{[...new Set(data.hunts.map(h => wholeDifficulty(h.expectedDifficulty)).filter(v => v != null))].sort((a, b) => a - b).map(d => <option key={d} value={d}>{d} / 10</option>)}<option value="unknown">Unknown difficulty</option></select></> : <select aria-label="Format filter" value={filters.format} onChange={e => update({ format: e.target.value })}><option value="">All formats</option><option value="physical">Physical</option><option value="digital">Digital</option></select>}
    </div>
    <div className="filter-secondary"><div className="sort-controls"><SlidersHorizontal size={14} /><span>{board ? 'Sort within difficulty' : 'Sort by'}</span><select aria-label={board ? 'Sort within difficulty' : 'Sort catalog'} value={filters.sort} onChange={e => update({ sort: e.target.value })}>{board && <><option value="hours">Expected time</option><option value="status">Status</option></>}<option value="added">Date added</option><option value="title">Game title</option></select><select aria-label="Sort direction" value={filters.direction} onChange={e => update({ direction: e.target.value })}><option value="asc">{filters.sort === 'added' ? 'Oldest first' : filters.sort === 'status' ? 'Priority first' : 'Ascending'}</option><option value="desc">{filters.sort === 'added' ? 'Newest first' : filters.sort === 'status' ? 'Dropped first' : 'Descending'}</option></select></div><div className="filter-actions"><button onClick={save} disabled={busy}><Save size={13} />Save defaults</button><button onClick={() => update({ ...DEFAULT_FILTERS, ...(scope === 'catalog' ? { sort: 'title' } : {}), ...user.preferences?.[scope] }, '')}><RotateCcw size={13} />Restore defaults</button><button onClick={() => update({ ...DEFAULT_FILTERS, ...(scope === 'catalog' ? { sort: 'title' } : {}) }, '')}><X size={13} />Clear</button></div></div>
    <ErrorMessage>{error}</ErrorMessage>
  </section>
}
