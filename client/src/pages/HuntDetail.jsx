import React, { useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil, Trophy, Trash2, Check, Minus, Plus } from 'lucide-react'
import { useApp } from '../state'
import { formatDate } from '../lib/dates'
import { platformName, SERVICE_LABELS, completionLabel } from '../lib/domain'
import { Button, Cover, Empty, Status, ErrorMessage, Progress, Confirm } from '../components/ui'
import { HuntEditor } from '../components/editors'
import GameAccess from '../components/GameAccess'
import Notebook from '../components/Notebook'
export default function HuntDetail() {
  const { id } = useParams(), navigate = useNavigate(), { data, mutate } = useApp(), [modal, setModal] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const saving = useRef(false)
  const hunt = data.hunts.find(h => h._id === id), game = data.games.find(g => g._id === hunt?.gameId)
  if (!hunt || !game) return <Empty title="Hunt not found" action={<Link className="button" to="/hunts">Back to hunts</Link>}>This hunt may have been removed.</Empty>
  const earned = hunt.earned ?? 0, earnedLimit = hunt.total ?? 100000
  async function change(patch) {
    if (saving.current) return
    saving.current = true; setBusy(true); setError('')
    try { await mutate(`/hunts/${id}`, 'PATCH', patch) }
    catch (e) { setError(e.message) }
    finally { saving.current = false; setBusy(false) }
  }
  return <><Link className="back-link" to="/hunts"><ArrowLeft size={16} />Trophy hunts</Link><header className="hunt-detail-heading"><Cover game={game} small /><div><div className="eyebrow">{platformName(data, hunt.platformId)} · {SERVICE_LABELS[hunt.service]}{hunt.variant && ` · ${hunt.variant}`}</div><h1>{game.title}</h1><div className="pill-row"><Status hunt={hunt} /><GameAccess game={game} platformId={hunt.platformId} activeOnly /><span className="tiny-badge">{hunt.expectedDifficulty ?? '?'} / 10 difficulty</span><span className="tiny-badge">{hunt.expectedHours == null ? 'Time unknown' : `${hunt.expectedHours} hours expected`}</span></div></div><Button onClick={() => setModal('edit')}><Pencil size={14} />Edit hunt</Button></header>
    <section className="completion-panel"><div className="completion-summary"><h2>Your completion milestones</h2><p>Track trophies separately from your custom notebook.</p>
      {hunt.hasAchievements ? <div className="completion-progress">
        <div className="completion-count" aria-live="polite" aria-atomic="true"><Progress done={earned} total={hunt.total} /></div>
        <div className="completion-count-actions" role="group" aria-label="Trophies earned" aria-busy={busy}>
          <Button type="button" aria-label="Decrease trophies earned" title="Decrease trophies earned" disabled={busy || earned <= 0} onClick={() => change({ earned: Math.max(0, earned - 1) })}><Minus size={16} aria-hidden="true" /></Button>
          <Button type="button" aria-label="Increase trophies earned" title="Increase trophies earned" disabled={busy || earned >= earnedLimit} onClick={() => change({ earned: Math.min(earnedLimit, earned + 1) })}><Plus size={16} aria-hidden="true" /></Button>
        </div>
      </div> : hunt.total != null && <Progress done={earned} total={hunt.total} />}
    </div><div className="completion-controls">{hunt.hasPlatinum && hunt.service === 'playstation' && <label><input type="checkbox" checked={hunt.completion.platinum} disabled={busy} onChange={e => change({ completion: { platinum: e.target.checked } })} /><Trophy size={16} />Platinum earned</label>}{hunt.hasAchievements && <><label><input type="checkbox" checked={hunt.completion.base} disabled={busy} onChange={e => change({ completion: { base: e.target.checked } })} />Base-game achievements complete</label><label><input type="checkbox" checked={hunt.completion.all} disabled={busy} onChange={e => change({ completion: { all: e.target.checked } })} />100% including DLC</label></>}<Button variant={hunt.status === 'completed' ? 'success' : 'primary'} busy={busy} onClick={() => change({ status: hunt.status === 'completed' ? 'in-progress' : 'completed' })}><Check size={15} />{hunt.status === 'completed' ? `${completionLabel(hunt)} · Reopen hunt` : hunt.goal === 'platinum' ? 'Mark platinum earned' : hunt.goal === 'all' ? 'Mark 100% complete' : 'Mark hunt complete'}</Button>{hunt.completion.completedOn && <small>Completed {formatDate(hunt.completion.completedOn)}</small>}</div><ErrorMessage>{error}</ErrorMessage></section>
    {hunt.notes && <section className="panel padded"><h2>Hunt notes</h2><p className="preserve-lines">{hunt.notes}</p></section>}<Notebook key={hunt._id} hunt={hunt} /><div className="page-footer"><Link className="button" to={`/games/${game._id}`}>View game & copies</Link><Button variant="danger" onClick={() => setModal('delete')}><Trash2 size={14} />Delete hunt</Button></div>
    {modal === 'edit' && <HuntEditor game={game} hunt={hunt} showOnBoard={false} onClose={() => setModal(null)} />}{modal === 'delete' && <Confirm title="Delete this hunt and notebook?" onClose={() => setModal(null)} onConfirm={async () => { await mutate(`/hunts/${id}`, 'DELETE'); navigate(`/games/${game._id}`) }}>This removes this platform’s progress and custom notebook. Other hunts and owned copies remain.</Confirm>}
  </>
}
