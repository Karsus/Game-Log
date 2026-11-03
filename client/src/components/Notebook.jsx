import React, { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Plus, ListChecks, Grid3X3, Pencil, Trash2, ArrowUp, ArrowDown, Copy, AlertTriangle, ExternalLink, Download, GripVertical, ChevronRight, ChevronDown, Trophy, Layers3, Unlink } from 'lucide-react'
import { useApp } from '../state'
import { api, download } from '../lib/api'
import { itemDone, trophyDone, trophyObjectiveDone, notebookProgress } from '../lib/domain'
import { normalizeNotebook, notebookIndex, repairMainSections, descendantIds, duplicateNotebookItem, moveNotebookGroup, moveNotebookSibling } from '../lib/notebook'
import useNotebookDrag from './useNotebookDrag'
import { NotebookGroupEditor, NotebookItemEditor, DuplicateNotebookItem, CopyNotebook } from './NotebookEditors'
import { Button, Confirm, Progress, ErrorMessage, Empty } from './ui'

const uid = () => crypto.randomUUID()
function readDraft(key) { try { const value = JSON.parse(sessionStorage.getItem(key)); return value ? normalizeNotebook(value) : null } catch { return null } }
function keepDraft(key, value) { try { if (value) sessionStorage.setItem(key, JSON.stringify(value)); else sessionStorage.removeItem(key) } catch { /* Downloads remain available if browser storage is blocked. */ } }
const gridDestination = (trophyId, sectionId, anchorId) => ({ type: 'grid', id: JSON.stringify([trophyId, sectionId, anchorId || null]), trophyId, sectionId, ...(anchorId ? { anchorId } : {}) })

export default function Notebook({ hunt }) {
  const { reload } = useApp(), draftKey = `gamelog-notebook-draft:${hunt.userId}:${hunt._id}`
  const [draft] = useState(() => readDraft(draftKey))
  const [notebook, setNotebook] = useState(() => draft || normalizeNotebook(hunt.notebook))
  const [busy, setBusy] = useState(false), [dirty, setDirty] = useState(!!draft), [error, setError] = useState(draft ? 'An unsaved draft was restored. Retry saving or download it before reloading the saved version.' : '')
  const [mode, setMode] = useState('general'), [filter, setFilter] = useState('all'), [modal, setModal] = useState(null), [collapsedItems, setCollapsedItems] = useState(() => new Map())
  const saving = useRef(false), treeId = useId(), index = useMemo(() => notebookIndex(notebook), [notebook])
  const drag = useNotebookDrag({ notebook, busy, mode, onMove: change })
  const progress = notebookProgress(notebook), trophyProgress = { done: notebook.trophies.filter(trophyDone).length, total: notebook.trophies.length }
  useEffect(() => {
    if (!dirty && !busy) setNotebook(current => hunt.notebook.revision > current.revision ? normalizeNotebook(hunt.notebook) : current)
  }, [hunt.notebook, dirty, busy])
  useEffect(() => { const before = event => { if (dirty) { event.preventDefault(); event.returnValue = '' } }; window.addEventListener('beforeunload', before); return () => window.removeEventListener('beforeunload', before) }, [dirty])

  async function save(value) {
    if (saving.current) throw new Error('Wait for the current save to finish')
    const next = repairMainSections(normalizeNotebook(value))
    saving.current = true
    keepDraft(draftKey, next); setNotebook(next); setDirty(true); setBusy(true); setError('')
    try {
      const result = await api(`/hunts/${hunt._id}/notebook`, 'PUT', next)
      keepDraft(draftKey, null); setNotebook(normalizeNotebook(result.notebook)); setDirty(false)
      try { await reload() } catch (failure) { setError(`Changes saved, but refreshing the hunt failed: ${failure.message}`) }
    }
    catch (failure) { setError(failure.message); throw failure }
    finally { saving.current = false; setBusy(false) }
  }
  function change(next) { if (next !== notebook) save(next).catch(() => {}) }
  function toggleTask(item) {
    const done = !itemDone(item, notebook.items), ids = descendantIds(notebook, item.id)
    change({ ...notebook, items: notebook.items.map(entry => ids.has(entry.id) ? { ...entry, done, current: done ? entry.target : 0 } : entry) })
  }
  function toggleTrophy(trophy) {
    change({ ...notebook, trophies: notebook.trophies.map(entry => entry.id === trophy.id ? { ...entry, done: !entry.done } : entry) })
  }
  function markTrophyTasks(trophyId) {
    change({ ...notebook, trophies: notebook.trophies.map(trophy => trophy.id === trophyId && trophy.type === 'counter' ? { ...trophy, current: trophy.target } : trophy), items: notebook.items.map(item => item.trophyId === trophyId ? { ...item, done: true, current: item.target } : item) })
  }
  function markAllButton(trophy) {
    const totals = groupProgress(trophy.id), complete = totals.total > 0 && totals.done === totals.total
    const noTasks = trophy.type !== 'counter' && !notebook.items.some(item => item.trophyId === trophy.id)
    if (complete || noTasks || !totals.total) return null
    return <button type="button" className="notebook-mark-all" aria-label={`Mark all tasks in ${trophy.title}`} title="Complete all subtasks and the trophy counter across every section; the trophy earned checkbox stays unchanged" disabled={busy} onClick={() => markTrophyTasks(trophy.id)}>Mark all</button>
  }
  function toggleCollapsed(id, defaultCollapsed = false) { drag.clearDrag(); setCollapsedItems(previous => new Map(previous).set(id, !(previous.get(id) ?? defaultCollapsed))) }
  function trophyCollapsed(trophy) {
    // An explicit expansion overrides the completion default until the notebook is reopened.
    const override = collapsedItems.get(`trophy:${trophy.id}`)
    if (override !== undefined) return override
    if (mode !== 'general') return false
    const subtasks = index.leaves.filter(item => item.trophyId === trophy.id)
    return subtasks.length > 0 && subtasks.every(item => itemDone(item, notebook.items))
  }
  function visible(item) { return filter === 'all' || filter === 'remaining' && !itemDone(item, notebook.items) || filter === 'missable' && (item.missable || (index.children.get(item.id) || []).some(visible)) }
  function visibleTrophy(trophy) { return filter === 'all' || filter === 'remaining' && (!trophyDone(trophy) || !trophyObjectiveDone(trophy) || notebook.items.some(item => item.trophyId === trophy.id && visible(item))) || filter === 'missable' && (trophy.missable || notebook.items.some(item => item.trophyId === trophy.id && visible(item))) }
  function trophyObjective(trophy) { return trophy.type === 'counter' || !notebook.items.some(item => item.trophyId === trophy.id) }
  function groupProgress(trophyId, sectionId) {
    const leaves = index.leaves.filter(item => (!trophyId || item.trophyId === trophyId) && (sectionId === undefined || (sectionId === null ? !index.effectiveSections.get(item.id)?.size : index.effectiveSections.get(item.id)?.has(sectionId))))
    const trophies = notebook.trophies.filter(trophy => (!trophyId || trophy.id === trophyId) && (sectionId === undefined || (sectionId === null ? !trophy.sectionIds.length : trophy.sectionIds.includes(sectionId))) && trophyObjective(trophy))
    return { done: leaves.filter(item => itemDone(item, notebook.items)).length + trophies.filter(trophyObjectiveDone).length, total: leaves.length + trophies.length }
  }
  function emptyGroup(kind, id) { return notebook[kind].some(group => group.id === id) && !notebook.items.some(item => kind === 'trophies' ? item.trophyId === id : index.effectiveSections.get(item.id)?.has(id)) && (kind !== 'sections' || !notebook.trophies.some(trophy => trophy.sectionIds.includes(id))) }
  function deleteGroup(kind, id) {
    if (busy || !emptyGroup(kind, id)) throw new Error(kind === 'trophies' ? 'Only trophies without subtasks can be deleted' : 'Only empty sections can be deleted')
    return save({ ...notebook, [kind]: notebook[kind].filter(group => group.id !== id) })
  }
  function moveGroup(kind, id, direction) {
    const adjacent = notebook[kind][notebook[kind].findIndex(group => group.id === id) + direction]
    if (adjacent) change(moveNotebookGroup(notebook, kind, id, adjacent.id, direction < 0 ? 'before' : 'after'))
  }
  function editItems(items) {
    if (!modal.item) return save({ ...notebook, items: [...notebook.items, ...items] })
    const updated = items[0], descendants = descendantIds(notebook, updated.id)
    return save({ ...notebook, items: notebook.items.map(item => item.id === updated.id ? updated : descendants.has(item.id) ? { ...item, trophyId: updated.trophyId } : item) })
  }
  function duplicateItems(sectionIds) {
    const selection = JSON.stringify([...sectionIds].sort())
    const next = modal.copySelection === selection ? modal.copyDraft : duplicateNotebookItem(modal.sourceNotebook, modal.item.id, sectionIds)
    setModal(previous => ({ ...previous, copySelection: selection, copyDraft: next }))
    return save(next)
  }
  function unlink(item, sectionId) { change({ ...notebook, items: notebook.items.map(entry => entry.id === item.id ? { ...entry, sectionIds: entry.sectionIds.filter(id => id !== sectionId) } : entry) }) }
  function unlinkTrophy(trophy, sectionId) { change({ ...notebook, trophies: notebook.trophies.map(entry => entry.id === trophy.id ? { ...entry, sectionIds: entry.sectionIds.filter(id => id !== sectionId) } : entry) }) }
  function counterControl(record, kind = 'items') {
    const label = `${kind === 'trophies' ? 'trophy ' : ''}${record.title}`
    const increment = delta => change({ ...notebook, [kind]: notebook[kind].map(entry => entry.id === record.id ? { ...entry, current: entry.current + delta } : entry) })
    return <div className="counter-control"><button disabled={busy || record.current <= 0} aria-label={`Decrease ${label}`} onClick={() => increment(-1)}>−</button><span>{record.current} / {record.target}</span><button disabled={busy || record.current >= record.target} aria-label={`Increase ${label}`} onClick={() => increment(1)}>+</button></div>
  }
  function trophyChildrenId(trophy, sectionId = 'general') { return `${treeId}-trophy-${encodeURIComponent(trophy.id)}-${encodeURIComponent(sectionId)}` }
  function trophyCollapse(trophy, sectionId) {
    if (!notebook.items.some(item => item.trophyId === trophy.id)) return null
    const collapsed = trophyCollapsed(trophy)
    return <button type="button" className="icon-button notebook-collapse-toggle" aria-label={`${collapsed ? 'Expand' : 'Collapse'} trophy ${trophy.title}`} aria-expanded={!collapsed} aria-controls={trophyChildrenId(trophy, sectionId)} onClick={() => toggleCollapsed(`trophy:${trophy.id}`, collapsed)}>{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>
  }
  function addTasks(trophyId = notebook.trophies[0]?.id, sectionId = null, parentId = null) { setModal({ type: 'item', trophyId, sectionId, parentId }) }
  function deleteButton(kind, group) {
    const label = kind === 'trophies' ? 'trophy' : 'section'
    return emptyGroup(kind, group.id) && <button type="button" className="icon-button notebook-delete-section" aria-label={`Delete ${label} ${group.title}`} title={kind === 'trophies' ? 'Delete trophy without subtasks' : 'Delete empty section'} disabled={busy} onClick={() => setModal({ type: 'delete-group', kind, group })}><Trash2 size={14} /></button>
  }
  function groupButtons(kind, group, compact = false) {
    const position = notebook[kind].findIndex(entry => entry.id === group.id), label = kind === 'trophies' ? 'trophy' : 'section'
    return <div className="row-actions notebook-group-actions">
      {kind === 'trophies' && markAllButton(group)}
      {!compact && <><button className="icon-button" aria-label={`Move ${label} ${group.title} up`} disabled={busy || position === 0} onClick={() => moveGroup(kind, group.id, -1)}><ArrowUp size={14} /></button><button className="icon-button" aria-label={`Move ${label} ${group.title} down`} disabled={busy || position === notebook[kind].length - 1} onClick={() => moveGroup(kind, group.id, 1)}><ArrowDown size={14} /></button></>}
      <button className="icon-button" aria-label={`Edit ${label} ${group.title}`} disabled={busy} onClick={() => setModal({ type: 'group', kind, group })}><Pencil size={14} /></button>
      {!compact && <button className="icon-button" aria-label={`Add tasks to ${group.title}`} disabled={busy || !notebook.trophies.length} onClick={() => addTasks(kind === 'trophies' ? group.id : undefined, kind === 'sections' ? group.id : null)}><Plus size={16} /></button>}
      {deleteButton(kind, group)}
    </div>
  }
  function groupHeading(kind, group, compact = false) {
    const label = kind === 'trophies' ? 'trophy' : 'section', destination = { type: `${label}-header`, id: group.id }, totals = kind === 'trophies' ? groupProgress(group.id) : groupProgress(null, group.id)
    const done = kind === 'trophies' && trophyDone(group), main = kind === 'trophies' && notebook.sections.find(section => section.id === group.mainSectionId)
    const title = mode === 'general' && main ? `${main.title} - ${group.title}` : group.title
    return <div data-notebook-group-header data-group-kind={kind} data-group-id={group.id} className={`notebook-group-heading ${drag.dropClass(destination)} ${drag.active?.kind === label && drag.active.id === group.id ? 'is-dragging' : ''}`} {...drag.dropProps(destination)}>
      <button type="button" className="icon-button notebook-drag-handle" aria-label={`Drag ${label} ${group.title}`} title={`Drag to reorder ${kind}`} {...drag.handleProps(label, group.id)}><GripVertical size={14} /></button>
      {kind === 'trophies' && <input type="checkbox" aria-label={`Trophy earned: ${group.title}`} title="Mark the trophy earned independently of its counter and subtasks" checked={done} disabled={busy} onChange={() => toggleTrophy(group)} />}
      <div className="notebook-group-title"><div className={`item-title-row ${done ? 'trophy-complete' : ''}`}>{kind === 'trophies' && !compact && trophyCollapse(group)}<h3>{title}</h3>{kind === 'trophies' && group.missable && <span className="missable"><AlertTriangle size={11} />Missable</span>}{kind === 'trophies' && !compact && group.type === 'counter' && counterControl(group, 'trophies')}</div>{kind === 'trophies' && group.description && <p className="notebook-trophy-description">{group.description}</p>}{kind === 'trophies' && group.url && <a className="guide-link" href={group.url} target="_blank" rel="noreferrer">Guide <ExternalLink size={11} /></a>}<small>{totals.done} / {totals.total} tasks{done ? ' · Trophy earned' : ''}</small></div>
      {groupButtons(kind, group, compact)}
    </div>
  }
  function ancestors(item) {
    const titles = [], seen = new Set([item.id]); let parent = index.items.get(item.parentId)
    while (parent && !seen.has(parent.id)) { seen.add(parent.id); titles.unshift(parent.title); parent = index.items.get(parent.parentId) }
    return titles.join(' › ')
  }
  function renderItem(item, { nested = false, sectionId, grid = false } = {}) {
    const children = index.children.get(item.id) || [], done = itemDone(item, notebook.items), collapsed = collapsedItems.get(item.id) ?? false, main = notebook.sections.find(section => section.id === item.mainSectionId)
    const title = mode === 'general' && main ? `${main.title} - ${item.title}` : item.title
    const destination = grid ? gridDestination(item.trophyId, sectionId, item.id) : { type: 'item', id: item.id }, drop = mode === 'general' || grid ? drag.dropProps(destination) : {}
    const siblings = (index.children.get(item.parentId || null) || []).filter(entry => entry.trophyId === item.trophyId), position = siblings.findIndex(entry => entry.id === item.id)
    const childrenId = `${treeId}-${mode}-${encodeURIComponent(sectionId || '')}-${encodeURIComponent(item.id)}`, context = (grid || sectionId && !nested && item.parentId) ? ancestors(item) : ''
    return <div key={item.id} data-notebook-item={item.id} className={`notebook-item ${done ? 'done' : ''} ${nested ? 'nested' : ''} ${drag.active?.kind === 'item' && drag.active.id === item.id ? 'is-dragging' : ''}`}>
      <div className={`item-main ${mode === 'general' || grid ? drag.dropClass(destination) : ''}`} {...drop}>
        <button type="button" className="icon-button notebook-drag-handle" aria-label={`Drag ${item.title}`} title={mode === 'general' ? 'Drag to reorder, nest, or move to another trophy' : 'Drag to link to a section or reorder in the grid'} {...drag.handleProps('item', item.id)}><GripVertical size={14} /></button>
        <input type="checkbox" aria-label={item.title} title={children.length ? 'Complete or clear this task and all its subtasks' : undefined} checked={done} disabled={busy} onChange={() => toggleTask(item)} />
        <div className="item-content">
          <div className="item-title-row">
          {!grid && children.length > 0 && <button type="button" className="icon-button notebook-collapse-toggle" aria-label={`${collapsed ? 'Expand' : 'Collapse'} ${item.title}`} aria-expanded={!collapsed} aria-controls={childrenId} title={`${collapsed ? 'Show' : 'Hide'} subtasks`} onClick={() => toggleCollapsed(item.id)}>{collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}</button>}
          <span className="item-title">{title}</span>{item.missable && <span className="missable"><AlertTriangle size={11} />Missable</span>}
          {item.type === 'counter' && !children.length && counterControl(item)}
          </div>
          {context && <small className="notebook-task-context">{context}</small>}{sectionId && !item.sectionIds.includes(sectionId) && <small className="notebook-task-context">Inherited section link</small>}
          {item.notes && <p className="item-notes">{item.notes}</p>}{item.url && <a className="guide-link" href={item.url} target="_blank" rel="noreferrer">Guide <ExternalLink size={11} /></a>}
        </div>
        <div className="item-actions">
          <button className="icon-button" aria-label={`Edit ${item.title}`} disabled={busy} onClick={() => setModal({ type: 'item', item, trophyId: item.trophyId })}><Pencil size={12} /></button>
          <button type="button" className="icon-button" aria-label={`Duplicate ${item.title}`} title="Duplicate task into sections" disabled={busy} onClick={() => setModal({ type: 'duplicate-item', item, sourceNotebook: notebook })}><Copy size={12} /></button>
          {!grid && <button className="icon-button" aria-label={`Add subtask to ${item.title}`} disabled={busy} onClick={() => addTasks(item.trophyId, null, item.id)}><Plus size={12} /></button>}
          {sectionId && item.sectionIds.includes(sectionId) && <button className="icon-button" aria-label={`Unlink ${item.title} from ${notebook.sections.find(section => section.id === sectionId)?.title}`} title="Remove the direct link; inherited links still apply" disabled={busy} onClick={() => unlink(item, sectionId)}><Unlink size={12} /></button>}
          {mode === 'general' && <><button className="icon-button" aria-label={`Move ${item.title} up`} disabled={busy || position === 0} onClick={() => change(moveNotebookSibling(notebook, item.id, -1))}><ArrowUp size={12} /></button><button className="icon-button" aria-label={`Move ${item.title} down`} disabled={busy || position === siblings.length - 1} onClick={() => change(moveNotebookSibling(notebook, item.id, 1))}><ArrowDown size={12} /></button></>}
        </div>
      </div>
      {!grid && children.length > 0 && <div id={childrenId} className="notebook-subtasks" hidden={collapsed}>{!collapsed && children.filter(visible).map(child => renderItem(child, { nested: true, sectionId }))}</div>}
    </div>
  }

  function renderTrophyItem(trophy, { sectionId, grid = false, compact = false } = {}) {
    const done = trophyDone(trophy), collapsed = trophyCollapsed(trophy)
    const children = (index.children.get(null) || []).filter(item => item.trophyId === trophy.id && item.inheritTrophySections !== false && index.effectiveSections.get(item.id)?.has(sectionId) && visible(item))
    const destination = drag.active?.kind === 'trophy' ? { type: 'trophy-header', id: trophy.id } : gridDestination(trophy.id, sectionId)
    const headerProps = compact ? { 'data-notebook-group-header': true, 'data-group-kind': 'trophies', 'data-group-id': trophy.id, ...drag.dropProps(destination) } : {}
    return <div key={`trophy:${trophy.id}`} data-notebook-trophy-task={trophy.id} className={`notebook-item ${done ? 'done' : ''}`}>
      <div className={`item-main ${compact ? drag.dropClass(destination) : ''}`} {...headerProps}>
        <button type="button" className="icon-button notebook-drag-handle" aria-label={`Drag trophy ${trophy.title}`} title={compact ? 'Drag to reorder trophies or link to a section' : 'Drag to link this trophy to a section'} {...drag.handleProps('trophy', trophy.id)}><GripVertical size={14} /></button>
        <input type="checkbox" aria-label={`Trophy earned: ${trophy.title}`} title="Mark the trophy earned independently of its counter and subtasks" checked={done} disabled={busy} onChange={() => toggleTrophy(trophy)} />
        <div className="item-content"><div className="item-title-row">
          {!grid && children.length > 0 && trophyCollapse(trophy, sectionId)}<span className="item-title">{trophy.title}</span>
          {trophy.missable && <span className="missable"><AlertTriangle size={11} />Missable</span>}
          {trophy.type === 'counter' && counterControl(trophy, 'trophies')}
        </div>{trophy.description && <p className="item-notes">{trophy.description}</p>}{trophy.url && <a className="guide-link" href={trophy.url} target="_blank" rel="noreferrer">Guide <ExternalLink size={11} /></a>}</div>
        <div className="item-actions">
          <button className="icon-button" aria-label={`Edit trophy ${trophy.title}`} disabled={busy} onClick={() => setModal({ type: 'group', kind: 'trophies', group: trophy })}><Pencil size={12} /></button>
          {!grid && <button className="icon-button" aria-label={`Add tasks to ${trophy.title}`} disabled={busy} onClick={() => addTasks(trophy.id)}><Plus size={12} /></button>}
          {sectionId && trophy.sectionIds.includes(sectionId) && <button className="icon-button" aria-label={`Unlink trophy ${trophy.title} from ${notebook.sections.find(section => section.id === sectionId)?.title}`} disabled={busy} onClick={() => unlinkTrophy(trophy, sectionId)}><Unlink size={12} /></button>}
          {!grid && children.length > 0 && markAllButton(trophy)}
          {compact && deleteButton('trophies', trophy)}
        </div>
      </div>
      {!grid && children.length > 0 && <div id={trophyChildrenId(trophy, sectionId)} className="notebook-subtasks" hidden={collapsed}>{!collapsed && children.map(item => renderItem(item, { sectionId, nested: true }))}</div>}
    </div>
  }

  function gridAddButton(trophy, sectionId) {
    const title = notebook.sections.find(section => section.id === sectionId)?.title || 'No section'
    return <button className="notebook-cell-add" aria-label={`Add tasks for ${trophy.title} in ${title}`} disabled={busy} onClick={() => addTasks(trophy.id, sectionId)}><Plus size={14} />Add task</button>
  }

  function renderGrid() {
    // Classify from the full objective count, before filtering or section projection.
    const rows = [], compactTrophies = [], leavesByTrophy = new Map()
    for (const item of index.leaves) {
      if (!leavesByTrophy.has(item.trophyId)) leavesByTrophy.set(item.trophyId, [])
      leavesByTrophy.get(item.trophyId).push(item)
    }
    for (const trophy of notebook.trophies) {
      const total = (leavesByTrophy.get(trophy.id)?.length || 0) + Number(trophyObjective(trophy))
      if (total === 1) compactTrophies.push(trophy)
      else rows.push(trophy)
    }
    const sectionIds = [null, ...notebook.sections.map(section => section.id)]
    const inSection = (membership, sectionId) => sectionId ? membership.has(sectionId) : !membership.size
    const leavesInSection = (trophy, sectionId) => (leavesByTrophy.get(trophy.id) || []).filter(item => inSection(index.effectiveSections.get(item.id), sectionId))
    const unlinked = groupProgress(null, null)
    return <div ref={drag.gridRef} className="chapter-grid-wrap" tabIndex={0}>
      <table className={`chapter-grid notebook-grid ${rows.length ? 'notebook-grid-has-trophy-column' : ''}`}>
        <thead><tr>
          {rows.length > 0 && <th scope="col" className="notebook-grid-trophy-column">Trophy</th>}
          <th scope="col" className="notebook-grid-unlinked-column"><div>No section</div><small>{unlinked.done} / {unlinked.total} tasks</small></th>
          {notebook.sections.map(section => <th scope="col" className="notebook-grid-section-column" key={section.id}>{groupHeading('sections', section, true)}</th>)}
        </tr></thead>
        <tbody>
          {rows.map(trophy => <tr key={trophy.id}>
            <th scope="row" className="notebook-grid-trophy-column">{groupHeading('trophies', trophy, true)}</th>
            {sectionIds.map(sectionId => {
              const destination = gridDestination(trophy.id, sectionId)
              const leaves = leavesInSection(trophy, sectionId).filter(visible)
              const showTrophy = trophyObjective(trophy) && (filter === 'all' || filter === 'remaining' && !trophyObjectiveDone(trophy) || filter === 'missable' && trophy.missable) && inSection(index.trophySections.get(trophy.id), sectionId)
              return <td key={sectionId || 'unlinked'} data-trophy-id={trophy.id} data-section-id={sectionId || ''} className={drag.dropClass(destination)} {...drag.dropProps(destination)}><div className="notebook-cell-content">
                {showTrophy && renderTrophyItem(trophy, { sectionId, grid: true })}
                {leaves.map(item => renderItem(item, { sectionId, grid: true }))}
                {gridAddButton(trophy, sectionId)}
                {['item', 'trophy'].includes(drag.active?.kind) && <div className="notebook-root-drop">{sectionId ? 'Drop to link here' : 'Unlinked tasks only'}</div>}
              </div></td>
            })}
          </tr>)}
          {compactTrophies.length > 0 && <tr className="notebook-grid-compact-row">
            {rows.length > 0 && <td className="notebook-grid-spacer" aria-hidden="true" />}
            {sectionIds.map(sectionId => {
              const destination = { type: 'section', id: sectionId }
              return <td key={sectionId || 'unlinked'} data-compact-section-id={sectionId || ''} className={`notebook-grid-stack ${sectionId ? drag.dropClass(destination) : ''}`} {...(sectionId ? drag.dropProps(destination) : {})}>
                {compactTrophies.filter(visibleTrophy).map(trophy => {
                  const leaves = leavesInSection(trophy, sectionId)
                  if (!leaves.length && !(trophyObjective(trophy) && inSection(index.trophySections.get(trophy.id), sectionId))) return null
                  const cardDestination = gridDestination(trophy.id, sectionId)
                  return <div key={trophy.id} data-trophy-id={trophy.id} data-section-id={sectionId || ''} className={`notebook-grid-card ${drag.dropClass(cardDestination)} ${drag.active?.kind === 'trophy' && drag.active.id === trophy.id ? 'is-dragging' : ''}`} {...drag.dropProps(cardDestination)}>
                    {renderTrophyItem(trophy, { sectionId, grid: true, compact: true })}
                    {leaves.filter(visible).map(item => renderItem(item, { sectionId, grid: true }))}
                    <div className="notebook-grid-card-actions">{gridAddButton(trophy, sectionId)}{markAllButton(trophy)}</div>
                  </div>
                })}
                {sectionId && ['item', 'trophy'].includes(drag.active?.kind) && <div className="notebook-root-drop">Drop here to add a section link</div>}
              </td>
            })}
          </tr>}
        </tbody>
      </table>
    </div>
  }

  const emptyTrophies = <Empty icon={Trophy} title="Create your first trophy" action={<Button disabled={busy} onClick={() => setModal({ type: 'group', kind: 'trophies' })}><Plus size={14} />Add trophy</Button>}>Track a trophy with a checkbox or counter, add subtasks when needed, and link work to sections.</Empty>
  return <section ref={drag.rootRef} className={`notebook ${drag.active ? 'notebook-dragging' : ''}`}>
    <div className="panel-heading"><div><h2>Trophy notebook</h2><p>Trophy goals, shared tasks, and the sections where you’ll work on them.</p></div><div className="row-actions">
      <Button disabled={busy} onClick={() => setModal({ type: 'copy' })}><Copy size={14} />Copy to hunt</Button><Button disabled={busy} onClick={() => setModal({ type: 'group', kind: 'trophies' })}><Trophy size={14} />Trophy</Button><Button disabled={busy} onClick={() => setModal({ type: 'group', kind: 'sections' })}><Plus size={14} />Section</Button><Button variant="primary" disabled={busy || !notebook.trophies.length} onClick={() => addTasks()}><Plus size={14} />Add tasks</Button>
    </div></div>
    <div className="notebook-toolbar">
      <div className="notebook-progress-summary" role="group" aria-label="Trophy completion"><span>Trophies</span><Progress {...trophyProgress} /></div><div className="notebook-progress-summary" role="group" aria-label="Task completion"><span>Tasks</span><Progress {...progress} /></div><span className="save-state">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'All changes saved'}</span>
      <select aria-label="Notebook filter" value={filter} onChange={event => { drag.clearDrag(); setFilter(event.target.value) }}><option value="all">All items</option><option value="remaining">Remaining items</option><option value="missable">Missable items</option></select>
      <div className="segmented">{[['general', 'General', ListChecks], ['sections', 'Sections', Layers3], ['grid', 'Grid', Grid3X3]].map(([value, label, Icon]) => <button key={value} aria-pressed={mode === value} onClick={() => setMode(value)}><Icon size={15} />{label}</button>)}</div>
    </div>
    <ErrorMessage>{error}</ErrorMessage>{dirty && !busy && <div className="recovery-actions"><Button onClick={() => save(notebook).catch(() => {})}>Retry saving</Button><Button onClick={() => download('unsaved-notebook.json', JSON.stringify(notebook, null, 2))}><Download size={14} />Download unsaved draft</Button><Button onClick={() => setModal({ type: 'reload' })}>Reload saved version</Button></div>}
    {mode === 'general' && (!notebook.trophies.length ? emptyTrophies : <div className="notebook-sections">{notebook.trophies.filter(visibleTrophy).map(trophy => {
      const destination = { type: 'trophy', id: trophy.id }
      const collapsed = trophyCollapsed(trophy)
      return <section key={trophy.id} data-notebook-trophy={trophy.id} className={`notebook-section ${drag.dropClass(destination)}`} {...drag.dropProps(destination)}>{groupHeading('trophies', trophy)}<div id={trophyChildrenId(trophy)} hidden={collapsed}>{!collapsed && (index.children.get(null) || []).filter(item => item.trophyId === trophy.id && visible(item)).map(item => renderItem(item))}</div>{drag.active?.kind === 'item' && <div className="notebook-root-drop">Drop here as a direct subtask</div>}</section>
    })}</div>)}
    {mode === 'sections' && (!notebook.sections.length ? <Empty icon={Layers3} title="Create a section" action={<Button disabled={busy} onClick={() => setModal({ type: 'group', kind: 'sections' })}><Plus size={14} />Add section</Button>}>Use sections for chapters, locations, or cleanup. Linking a task includes its whole branch.</Empty> : <div className="notebook-sections">{notebook.sections.map(section => {
      const destination = { type: 'section', id: section.id }
      const trophies = notebook.trophies.filter(trophy => trophy.sectionIds.includes(section.id) && visibleTrophy(trophy))
      const roots = notebook.items.filter(item => index.effectiveSections.get(item.id)?.has(section.id) && (!item.parentId || !index.effectiveSections.get(item.parentId)?.has(section.id)) && (item.parentId || item.inheritTrophySections === false || !index.trophies.get(item.trophyId)?.sectionIds.includes(section.id)) && visible(item))
      return <section key={section.id} data-notebook-section={section.id} className={`notebook-section ${drag.dropClass(destination)}`} {...drag.dropProps(destination)}>{groupHeading('sections', section)}{trophies.map(trophy => renderTrophyItem(trophy, { sectionId: section.id }))}{roots.map(item => renderItem(item, { sectionId: section.id }))}{emptyGroup('sections', section.id) && <p className="notebook-empty-section">No linked tasks. Link a task or trophy in its editor, or drag one into this section.</p>}{['item', 'trophy'].includes(drag.active?.kind) && <div className="notebook-root-drop">Drop here to add a section link</div>}</section>
    })}</div>)}
    {mode === 'grid' && (!notebook.trophies.length ? emptyTrophies : renderGrid())}
    {modal?.type === 'group' && <NotebookGroupEditor kind={modal.kind} group={modal.group} notebook={notebook} onClose={() => setModal(null)} onDelete={modal.group && emptyGroup(modal.kind, modal.group.id) ? () => setModal({ type: 'delete-group', kind: modal.kind, group: modal.group }) : null} onSave={fields => save({ ...notebook, [modal.kind]: modal.group ? notebook[modal.kind].map(group => group.id === modal.group.id ? { ...group, ...fields } : group) : [...notebook[modal.kind], { id: uid(), ...fields }] })} />}
    {modal?.type === 'item' && <NotebookItemEditor {...modal} notebook={notebook} onClose={() => setModal(null)} onSave={editItems} onDelete={modal.item ? () => setModal({ type: 'delete-item', item: modal.item }) : null} />}
    {modal?.type === 'duplicate-item' && <DuplicateNotebookItem item={modal.item} notebook={notebook} onClose={() => setModal(null)} onSave={duplicateItems} />}
    {modal?.type === 'delete-group' && <Confirm title={modal.kind === 'trophies' ? 'Delete trophy?' : 'Delete empty section?'} onClose={() => setModal(null)} onConfirm={() => deleteGroup(modal.kind, modal.group.id)}>Remove {modal.group.title}?</Confirm>}
    {modal?.type === 'delete-item' && <Confirm title="Delete task and its subtasks?" onClose={() => setModal(null)} onConfirm={() => { const ids = descendantIds(notebook, modal.item.id); return save({ ...notebook, items: notebook.items.filter(item => !ids.has(item.id)) }) }}>Remove {modal.item.title} and its subtasks from every view and linked section?</Confirm>}
    {modal?.type === 'copy' && <CopyNotebook hunt={hunt} onClose={() => setModal(null)} />}
    {modal?.type === 'reload' && <Confirm title="Discard unsaved notebook changes?" label="Reload saved version" onClose={() => setModal(null)} onConfirm={async () => { const next = await reload(); keepDraft(draftKey, null); setNotebook(normalizeNotebook(next.hunts.find(entry => entry._id === hunt._id).notebook)); setDirty(false); setError('') }}>Download your unsaved draft first if you want to keep it. This replaces it with the latest saved notebook.</Confirm>}
  </section>
}
