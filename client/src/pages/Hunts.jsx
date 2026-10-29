import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Trophy, Plus, Download, Pencil, Layers3, ChevronDown, Clock3 } from 'lucide-react'
import { useApp } from '../state'
import { groupHunts, platformName, SERVICE_LABELS, huntLabel, notebookProgress } from '../lib/domain'
import { download, csv } from '../lib/api'
import { Button, Empty, PageHeading, Status, FormModal, Field } from '../components/ui'
import { HuntEditor } from '../components/editors'
import { Filters, useFilters } from '../components/filters'
export function HuntRow({ hunt, onEdit }) {
  const { data } = useApp()
  const progress = hunt.total == null ? notebookProgress(hunt.notebook) : { total: 0, done: 0 }
  return <article className={`hunt-row ${hunt.status}`} aria-label={hunt.game.title}>
    <div className="hunt-row-heading"><Link className="hunt-title" to={`/hunts/${hunt._id}`} title="Open trophy log">{hunt.game.title}</Link><button className="icon-button" aria-label={`Edit ${hunt.game.title} hunt`} onClick={onEdit}><Pencil size={14} /></button></div>
    <div className="hunt-row-platform"><span>{platformName(data, hunt.platformId)}{hunt.service !== 'none' && ` · ${SERVICE_LABELS[hunt.service]}`}{hunt.variant && ` · ${hunt.variant}`}</span><span>{hunt.owned ? 'Owned' : hunt.wished ? 'Wishlist' : 'Not owned'}</span></div>
    <div className="hunt-row-meta"><Status hunt={hunt} /><span className="hunt-time" title="Expected time to complete"><Clock3 size={12} />{hunt.expectedHours == null ? 'Time unknown' : `${hunt.expectedHours} h`}</span>{hunt.hasPlatinum && <Trophy size={13} aria-label="Platinum available" />}{hunt.total != null ? <span className="hunt-count" title="Achievements earned">{hunt.earned}/{hunt.total}</span> : progress.total > 0 && <span className="hunt-count" title="Notebook items completed">{progress.done}/{progress.total}</span>}</div>
  </article>
}
export function DifficultyColumn({ group, onEdit }) {
  const [collapsed, setCollapsed] = useState(false), title = group.difficulty === 'unknown' ? 'Unrated' : `Difficulty ${group.difficulty}`, itemsId = `difficulty-${group.difficulty}-items`
  return <section className="difficulty-column" aria-label={title}><header className="difficulty-heading"><button className="difficulty-toggle" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${title.toLowerCase()}`} aria-expanded={!collapsed} aria-controls={itemsId} onClick={() => setCollapsed(!collapsed)}><span className="difficulty-number">{group.difficulty === 'unknown' ? '?' : group.difficulty}</span><span className="difficulty-label"><strong>{title}</strong><small>{group.difficulty === 'unknown' ? 'NOT YET RATED' : 'OUT OF 10'}</small></span><span className="count">{group.rows.length}</span><ChevronDown size={15} className={collapsed ? 'collapsed' : ''} /></button></header><div className="difficulty-items" id={itemsId} hidden={collapsed}>{!collapsed && group.rows.map(h => <HuntRow key={h._id} hunt={h} onEdit={() => onEdit({ game: h.game, hunt: h })} />)}</div></section>
}
export default function Hunts() {
  const { data } = useApp(), controls = useFilters('hunts'), [edit, setEdit] = useState(null), [picking, setPicking] = useState(false), [gameId, setGameId] = useState('')
  const groups = groupHunts(data, controls.filters, controls.query), rows = groups.flatMap(g => g.rows)
  function exportCsv() { download('game-log-hunts.csv', csv([['Difficulty', 'Game', 'Platform', 'Service', 'Expected hours', 'Status', 'Date added'], ...rows.map(h => [h.expectedDifficulty, h.game.title, platformName(data, h.platformId), SERVICE_LABELS[h.service], h.expectedHours, huntLabel(h), h.createdAt])]), 'text/csv') }
  return <><PageHeading eyebrow="ONE TROPHY AT A TIME" title="Trophy hunts" actions={<Button variant="primary" onClick={() => setPicking(true)} disabled={!data.games.length}><Plus size={17} />Add hunt</Button>}>Your next challenge, arranged by difficulty.</PageHeading>
    <div className="hunt-summary">{[['Active hunts', data.hunts.filter(h => h.status === 'in-progress').length, 'yellow'], ['Priority', data.hunts.filter(h => h.status === 'priority').length, 'gold'], ['Completed', data.hunts.filter(h => h.status === 'completed').length, 'green']].map(([label, count, color]) => <div key={label}><i className={color} /><strong>{count}</strong><span>{label}</span></div>)}</div>
    <Filters scope="hunts" {...controls} /><div className="section-bar"><span><strong>{rows.length}</strong> hunts · <strong>{groups.length}</strong> difficulty groups</span><div><span className="grouping-note"><Layers3 size={14} />Always grouped by difficulty</span><Button onClick={exportCsv} disabled={!rows.length}><Download size={14} />Export</Button></div></div>
    {!rows.length ? <Empty icon={Trophy} title="Make room for your next achievement" action={!data.games.length ? <Link className="button primary" to="/games">Add a game first</Link> : <Button variant="primary" onClick={() => setPicking(true)}><Plus size={16} />Create a hunt</Button>}>Enable a hunt from any owned or wishlisted game, or adjust your current filters. Each difficulty gets its own column.</Empty> : <div className="hunt-board" aria-label="Hunts grouped by difficulty" tabIndex={0}>{groups.map(group => <DifficultyColumn key={group.difficulty} group={group} onEdit={setEdit} />)}</div>}
    {picking && <FormModal title="Choose a game to hunt" onClose={() => setPicking(false)} label="Set up hunt" onSubmit={async () => { const game = data.games.find(g => g._id === gameId); if (!game) throw new Error('Choose a game'); setEdit({ game }) }}><Field label="Game"><select required value={gameId} onChange={e => setGameId(e.target.value)}><option value="">Choose from your library</option>{data.games.map(g => <option key={g._id} value={g._id}>{g.title}</option>)}</select></Field></FormModal>}
    {edit && <HuntEditor {...edit} onClose={() => setEdit(null)} />}
  </>
}
