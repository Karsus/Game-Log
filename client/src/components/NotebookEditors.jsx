import React, { useEffect, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useApp } from '../state'
import { platformName } from '../lib/domain'
import { descendantIds, notebookIndex, repairMainSections } from '../lib/notebook'
import { Button, Field, FormModal, FormField } from './ui'

const uid = () => crypto.randomUUID()

export function NotebookGroupEditor({ kind, group, notebook, onClose, onSave, onDelete }) {
  const [title, setTitle] = useState(group?.title || '')
  const [description, setDescription] = useState(group?.description || '')
  const [values, setValues] = useState(() => ({ type: 'checkbox', target: 1, current: 0, sectionIds: [], mainSectionId: null, missable: false, url: '', ...group }))
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value }))
  const sections = notebook?.sections || []
  const linkedSections = sections.filter(section => values.sectionIds.includes(section.id))
  const mainSectionId = linkedSections.some(section => section.id === values.mainSectionId) ? values.mainSectionId : linkedSections[0]?.id || ''
  const form = { values: { ...values, mainSectionId }, set }
  const nameRef = useRef(null)
  useEffect(() => {
    // Focus after the nested Modal opens its native dialog.
    nameRef.current?.focus()
    nameRef.current?.select()
  }, [])
  const label = kind === 'trophies' ? 'trophy' : 'section'
  return <FormModal title={`${group ? 'Edit' : 'Add'} ${label}`} subtitle={kind === 'trophies' ? 'Mark the trophy earned separately from its counter and subtasks.' : undefined} onClose={onClose} onSubmit={() => onSave({ title: title.trim(), ...(kind === 'trophies' ? {
    description: description.trim(), type: values.type, target: values.target, current: values.current,
    sectionIds: linkedSections.map(section => section.id), mainSectionId: mainSectionId || null, missable: values.missable, url: values.url,
  } : {}) })} wide={kind === 'trophies'}>
    <Field label={`${label === 'trophy' ? 'Trophy' : 'Section'} name`}><input ref={nameRef} value={title} required maxLength={200} onChange={event => setTitle(event.target.value)} placeholder={label === 'trophy' ? 'Get all flowers' : 'Chapter 3, Cleanup, Side quests…'} /></Field>
    {kind === 'trophies' && <>
      <Field label="Description" hint="Optional. Describe how to earn this trophy."><textarea value={description} maxLength={10000} rows={4} onChange={event => setDescription(event.target.value)} placeholder="Collect every flower across all chapters." /></Field>
      <div className="form-grid">
        <FormField name="type" label="Tracking type" {...form} options={[{ value: 'checkbox', label: 'Checkbox' }, { value: 'counter', label: 'Counter' }]} />
        {values.type === 'counter' && <><FormField name="target" label="Target count" {...form} type="number" min={1} max={100000} step={1} required /><FormField name="current" label="Current count" {...form} type="number" min={0} max={values.target} step={1} required /></>}
      </div>
      <fieldset className="notebook-link-editor"><legend>Section links</legend>
        <p>Link this trophy to show it in a section. Its subtasks inherit these links unless their branch has trophy inheritance turned off.</p>
        {!sections.length && <p>Create a section to link this trophy to chapters or other groups.</p>}
        {sections.map(section => <label key={section.id} className="notebook-link-option">
          <input type="checkbox" aria-label={`Link to ${section.title}`} checked={values.sectionIds.includes(section.id)} onChange={event => set('sectionIds', event.target.checked ? [...values.sectionIds, section.id] : values.sectionIds.filter(id => id !== section.id))} />
          <span>{section.title}</span>
        </label>)}
        <FormField name="mainSectionId" label="Main section" {...form} disabled={!linkedSections.length} options={linkedSections.length ? linkedSections.map(section => ({ value: section.id, label: section.title })) : [{ value: '', label: 'No section' }]} />
        <small>The main section prefixes this trophy’s title in General. Other linked sections still include the trophy.</small>
      </fieldset>
      <FormField name="missable" label="Mark as missable" {...form} type="checkbox" />
      <FormField name="url" label="Guide link" {...form} type="url" />
    </>}
    {onDelete && <Button type="button" variant="danger" onClick={onDelete}><Trash2 size={14} />Delete {label}</Button>}
  </FormModal>
}

export function NotebookItemEditor({ item, trophyId, parentId = null, sectionId = null, notebook, onClose, onSave, onDelete }) {
  const [values, setValues] = useState(() => ({ id: uid(), trophyId: trophyId || notebook.trophies[0]?.id || '', parentId: parentId || '', title: '', sectionIds: sectionId ? [sectionId] : [], mainSectionId: sectionId, inheritTrophySections: true, type: 'checkbox', target: 1, current: 0, done: false, missable: false, notes: '', url: '', ...item }))
  const set = (key, value) => setValues(previous => ({ ...previous, [key]: value, ...(key === 'trophyId' ? { parentId: '' } : {}) }))
  const excluded = item ? descendantIds(notebook, item.id) : new Set()
  const candidate = { ...values, parentId: values.parentId || null }
  const preview = { ...notebook, items: item ? notebook.items.map(entry => entry.id === item.id ? candidate : entry) : [...notebook.items, candidate] }
  const index = notebookIndex(preview), inherited = index.inheritedSections.get(candidate.id) || new Set(), effective = index.effectiveSections.get(candidate.id) || new Set()
  const mainSectionId = repairMainSections(preview).items.find(entry => entry.id === candidate.id)?.mainSectionId || ''
  const form = { values: { ...values, mainSectionId }, set }
  async function submit() {
    const titles = (item ? [values.title] : values.title.split('\n')).map(title => title.trim()).filter(Boolean)
    if (!titles.length) throw new Error('Enter at least one task')
    if (titles.some(title => title.length > 200)) throw new Error('Each task title must be 200 characters or fewer')
    await onSave(titles.map(title => ({ ...candidate, id: item?.id || uid(), title, mainSectionId: mainSectionId || null })))
  }
  return <FormModal title={item ? 'Edit task' : 'Add tasks or paste a list'} subtitle="Tasks share one completion state across General, Sections, and Grid." onClose={onClose} onSubmit={submit} wide>
    <FormField name="title" label={item ? 'Title' : 'Tasks (one per line)'} type={item ? 'text' : 'textarea'} {...form} required autoFocus />
    <div className="form-grid">
      <FormField name="trophyId" label="Trophy" {...form} options={notebook.trophies.map(trophy => ({ value: trophy.id, label: trophy.title }))} required />
      <FormField name="parentId" label="Subtask of" {...form} options={[{ value: '', label: 'Trophy (direct subtask)' }, ...notebook.items.filter(entry => entry.trophyId === values.trophyId && !excluded.has(entry.id)).map(entry => ({ value: entry.id, label: entry.title }))]} />
    </div>
    <fieldset className="notebook-link-editor"><legend>Section links</legend>
      <p>Direct links also include all subtasks. Inherited links come from a parent task or trophy.</p>
      {!values.parentId && <FormField name="inheritTrophySections" label="Inherit trophy section links" {...form} type="checkbox" />}
      {!notebook.sections.length && <p>Create a section to link tasks to chapters or other groups.</p>}
      {notebook.sections.map(section => <label key={section.id} className="notebook-link-option">
        <input type="checkbox" aria-label={`Link to ${section.title}`} checked={values.sectionIds.includes(section.id)} onChange={event => set('sectionIds', event.target.checked ? [...values.sectionIds, section.id] : values.sectionIds.filter(id => id !== section.id))} />
        <span>{section.title}</span><small>{inherited.has(section.id) ? values.sectionIds.includes(section.id) ? 'Direct + inherited' : 'Inherited' : values.sectionIds.includes(section.id) ? 'Direct' : ''}</small>
      </label>)}
      <FormField name="mainSectionId" label="Main section" {...form} disabled={!effective.size} options={effective.size ? notebook.sections.filter(section => effective.has(section.id)).map(section => ({ value: section.id, label: section.title })) : [{ value: '', label: 'No section' }]} />
      <small>The main section prefixes this task’s title in General. Other linked sections still include the task.</small>
    </fieldset>
    <div className="form-grid">
      <FormField name="type" label="Tracking type" {...form} options={[{ value: 'checkbox', label: 'Checkbox' }, { value: 'counter', label: 'Counter' }]} />
      {values.type === 'counter' && <><FormField name="target" label="Target count" {...form} type="number" min={1} step={1} required /><FormField name="current" label="Current count" {...form} type="number" min={0} max={values.target} step={1} required /></>}
    </div>
    <FormField name="missable" label="Mark as missable" {...form} type="checkbox" />
    <FormField name="notes" label="Notes / location" {...form} type="textarea" />
    <FormField name="url" label="Guide link" {...form} type="url" />
    {onDelete && <Button type="button" variant="danger" onClick={onDelete}><Trash2 size={14} />Delete task</Button>}
  </FormModal>
}

export function DuplicateNotebookItem({ item, notebook, onClose, onSave }) {
  const [selected, setSelected] = useState([])
  const sectionIds = notebook.sections.filter(section => selected.includes(section.id)).map(section => section.id)
  async function submit() {
    if (!sectionIds.length) throw new Error('Choose at least one destination section')
    await onSave(sectionIds)
  }
  return <FormModal title="Duplicate task" label="Create copies" onClose={onClose} onSubmit={submit}>
    <p>Create a separate copy of <strong>{item.title}</strong> and its subtasks in each selected section.</p>
    <p className="muted">Each copy starts incomplete with counters at zero and tracks progress independently. Copies are top-level tasks under the same trophy. The original task stays unchanged.</p>
    <fieldset className="notebook-link-editor"><legend>Destination sections</legend>
      {notebook.sections.length > 0 ? <>
        <div className="row-actions">
          <Button type="button" disabled={sectionIds.length === notebook.sections.length} onClick={() => setSelected(notebook.sections.map(section => section.id))}>Select all</Button>
          <Button type="button" disabled={!sectionIds.length} onClick={() => setSelected([])}>Clear selection</Button>
        </div>
        {notebook.sections.map(section => <label key={section.id} className="notebook-link-option">
          <input type="checkbox" aria-label={`Copy to ${section.title}`} checked={sectionIds.includes(section.id)} onChange={event => setSelected(previous => event.target.checked ? [...previous, section.id] : previous.filter(id => id !== section.id))} />
          <span>{section.title}</span>
        </label>)}
        <small>{sectionIds.length} {sectionIds.length === 1 ? 'section selected' : 'sections selected'}</small>
      </> : <p>Create a section in the notebook before duplicating this task.</p>}
    </fieldset>
  </FormModal>
}

export function CopyNotebook({ hunt, onClose }) {
  const { data, mutate } = useApp(), [targetId, setTargetId] = useState('')
  const targets = data.hunts.filter(target => target._id !== hunt._id)
  return <FormModal title="Copy notebook to another hunt" onClose={onClose} label="Copy and reset completion" onSubmit={async () => {
    const target = targets.find(entry => entry._id === targetId)
    if (!target) throw new Error('Choose a destination hunt')
    await mutate(`/hunts/${hunt._id}/copy-notebook`, 'POST', { targetId, revision: target.notebook.revision })
  }}>
    <Field label="Destination hunt"><select required value={targetId} onChange={event => setTargetId(event.target.value)}><option value="">Choose a hunt</option>{targets.map(target => <option key={target._id} value={target._id}>{data.games.find(game => game._id === target.gameId)?.title} · {platformName(data, target.platformId)} · {target.service} {target.variant}</option>)}</select></Field>
    <p className="muted">This replaces the destination notebook with the same trophies, task trees, and section links. Trophy checkboxes and task progress reset in the copy.</p>
  </FormModal>
}
