// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, within, fireEvent, createEvent, waitFor, cleanup, act } from '@testing-library/react'
import Notebook from './Notebook'
import { api } from '../lib/api'
import { normalizeNotebook } from '../lib/notebook'

const context = vi.hoisted(() => ({ data: {}, reload: vi.fn(), mutate: vi.fn() }))
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))

const fixture = () => {
  const item = (id, title, extra = {}) => ({
    id, title, trophyId: 'weapons-trophy', parentId: null, sectionIds: [], mainSectionId: null,
    type: 'checkbox', done: false, current: 0, target: 1, notes: '', url: '', missable: false, ...extra,
  })
  return {
    _id: 'hunt', userId: 'user', gameId: 'game', platformId: 'ps5', service: 'playstation', variant: '',
    notebook: normalizeNotebook({
      formatVersion: 2, revision: 0,
      trophies: [{ id: 'weapons-trophy', title: 'Weapon master', description: '', done: false }, { id: 'explorer', title: 'Explorer', description: '', done: false }, { id: 'empty-trophy', title: 'Empty trophy', description: '', done: false }],
      sections: [{ id: 'chapter1', title: 'Chapter 1' }, { id: 'chapter2', title: 'Chapter 2' }, { id: 'empty', title: 'Empty section' }],
      items: [
        item('weapons', 'Use all weapons', { sectionIds: ['chapter1', 'chapter2'], mainSectionId: 'chapter2' }),
        item('bomb', 'Bomb Drone', { parentId: 'weapons', sectionIds: ['chapter1'], mainSectionId: 'chapter1', notes: 'Keep this note', missable: true }),
        item('fuse', 'Find fuses', { parentId: 'bomb', mainSectionId: 'chapter1', type: 'counter', target: 4, current: 2, url: 'https://example.com/guide' }),
        item('sentry', 'Sentry Gun', { parentId: 'weapons', mainSectionId: 'chapter2', done: true }),
        item('unassigned', 'Unassigned reminder'),
        item('token', 'Find the silver token', { trophyId: 'explorer', sectionIds: ['chapter1'], mainSectionId: 'chapter1' }),
      ],
    }),
  }
}
const draftKey = 'gamelog-notebook-draft:user:hunt'
const savedNotebook = () => api.mock.calls.at(-1)[2]
const itemElement = (id, scope = document) => scope.querySelector('[data-notebook-item="' + id + '"]')
const itemRow = (id, scope = document) => itemElement(id, scope).querySelector('.item-main')
const trophyElement = id => document.querySelector('[data-notebook-trophy="' + id + '"]')
const sectionElement = id => document.querySelector('[data-notebook-section="' + id + '"]')
const gridCell = (trophyId, sectionId) => document.querySelector('[data-trophy-id="' + trophyId + '"][data-section-id="' + sectionId + '"]')
const groupHeader = (kind, id) => document.querySelector('[data-notebook-group-header][data-group-kind="' + kind + '"][data-group-id="' + id + '"]')
const chooseView = name => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const taskProgress = () => within(screen.getByRole('group', { name: 'Task completion' })).getByRole('progressbar')
const successSave = async (path, method, body) => ({ notebook: { ...body, revision: body.revision + 1 } })
beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  context.data = { games: [], hunts: [], platforms: [] }
  context.reload.mockResolvedValue({})
  context.mutate.mockResolvedValue({})
  api.mockImplementation(successSave)
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

function startDrag(label, scope = document) {
  const handle = within(scope).getByRole('button', { name: label, exact: true })
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(handle, { dataTransfer })
  return { handle, dataTransfer }
}
function dragEvent(type, target, drag, { x = 100, y = 50, relatedTarget = null } = {}) {
  target.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 })
  const event = createEvent[type](target, { dataTransfer: drag.dataTransfer })
  // jsdom lacks DragEvent, so supply native pointer properties explicitly.
  Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, relatedTarget: { value: relatedTarget } })
  fireEvent(target, event)
}
function dropOn(target, drag, position) {
  dragEvent('dragOver', target, drag, position)
  dragEvent('drop', target, drag, position)
  fireEvent.dragEnd(drag.handle, { dataTransfer: drag.dataTransfer })
}
async function expectSaves(count = 1) {
  await waitFor(() => expect(api).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy())
}

describe('notebook v2 shared records and section links', () => {
  it('saves, reloads, displays, and clears trophy descriptions without changing progress or tasks', async () => {
    const hunt = fixture(), description = 'Use every weapon.\nFinish the final challenge.'
    hunt.notebook.trophies[0].done = true
    delete hunt.notebook.trophies[0].description
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit trophy Weapon master' }))
    const field = screen.getByRole('textbox', { name: /^Description/ })
    expect(field.value).toBe('')
    fireEvent.change(field, { target: { value: `  ${description}\n ` } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    expect(savedNotebook().trophies[0]).toMatchObject({ title: 'Weapon master', description, done: true })
    expect(savedNotebook().items).toEqual(hunt.notebook.items)

    const saved = structuredClone(savedNotebook())
    cleanup()
    render(<Notebook hunt={{ ...hunt, notebook: saved }} />)
    expect(trophyElement('weapons-trophy').querySelector('.notebook-trophy-description').textContent).toBe(description)
    chooseView('Sections')
    for (const sectionId of ['chapter1', 'chapter2']) {
      expect(sectionElement(sectionId).querySelector('.notebook-trophy-description')).toBeNull()
      expect(within(sectionElement(sectionId)).queryByRole('heading', { name: 'Weapon master' })).toBeNull()
    }
    chooseView('Grid')
    expect(groupHeader('trophies', 'weapons-trophy').querySelector('.notebook-trophy-description').textContent).toBe(description)
    fireEvent.click(screen.getByRole('button', { name: 'Edit trophy Weapon master' }))
    expect(screen.getByRole('textbox', { name: /^Description/ }).value).toBe(description)
    fireEvent.change(screen.getByRole('textbox', { name: /^Description/ }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves(2)
    expect(savedNotebook().trophies[0]).toMatchObject({ description: '', done: true })
    expect(groupHeader('trophies', 'weapons-trophy').querySelector('.notebook-trophy-description')).toBeNull()
  })

  it('shares task completion across all views while the trophy checkbox remains independent', async () => {
    render(<Notebook hunt={fixture()} />)
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('20')
    fireEvent.click(screen.getByRole('checkbox', { name: 'Find fuses', exact: true }))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'fuse').current).toBe(4)
    expect(savedNotebook().trophies.every(trophy => !trophy.done)).toBe(true)
    chooseView('Sections')
    for (const sectionId of ['chapter1', 'chapter2']) {
      expect(within(sectionElement(sectionId)).getByRole('checkbox', { name: 'Find fuses', exact: true }).checked).toBe(true)
    }
    chooseView('Grid')
    for (const sectionId of ['chapter1', 'chapter2']) {
      expect(within(gridCell('weapons-trophy', sectionId)).getByRole('checkbox', { name: 'Find fuses', exact: true }).checked).toBe(true)
    }
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('40')
    chooseView('General')
    const completedItems = structuredClone(savedNotebook().items)
    const trophyCount = savedNotebook().trophies.find(trophy => trophy.id === 'weapons-trophy').current
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Weapon master' }))
    await expectSaves(2)
    expect(savedNotebook().trophies.find(trophy => trophy.id === 'weapons-trophy').done).toBe(true)
    expect(savedNotebook().items).toEqual(completedItems)
    expect(savedNotebook().trophies.find(trophy => trophy.id === 'weapons-trophy').current).toBe(trophyCount)
    expect(savedNotebook().revision).toBe(1)
    expect(within(screen.getByRole('group', { name: 'Trophy completion' })).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('33')
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('40')
  })

  it('projects inherited links without duplicating progress and prefixes only the displayed General title', async () => {
    render(<Notebook hunt={fixture()} />)
    expect(itemRow('weapons').querySelector('.item-title').textContent).toContain('Chapter 2 - Use all weapons')
    expect(itemRow('fuse').querySelector('.item-title').textContent).toContain('Chapter 1 - Find fuses')
    expect(itemRow('unassigned').querySelector('.item-title').textContent).toBe('Unassigned reminder')
    fireEvent.click(screen.getByRole('button', { name: 'Edit Use all weapons', exact: true }))
    expect(screen.getByLabelText('Title').value).toBe('Use all weapons')
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
    chooseView('Sections')
    expect(itemElement('fuse', sectionElement('chapter1'))).toBeTruthy()
    expect(itemElement('fuse', sectionElement('chapter2'))).toBeTruthy()
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('20')
    chooseView('Grid')
    expect(itemElement('weapons', gridCell('weapons-trophy', 'chapter1'))).toBeNull()
    expect(itemElement('fuse', gridCell('weapons-trophy', 'chapter1'))).toBeTruthy()
    expect(itemElement('fuse', gridCell('weapons-trophy', 'chapter2'))).toBeTruthy()
    expect(itemElement('unassigned', gridCell('weapons-trophy', ''))).toBeTruthy()
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('20')
    expect(api).not.toHaveBeenCalled()
  })

  it('updates one counter record from a section projection', async () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Sections')
    fireEvent.click(within(sectionElement('chapter2')).getByRole('button', { name: 'Increase Find fuses' }))
    await expectSaves()
    expect(savedNotebook().items.filter(item => item.id === 'fuse')).toHaveLength(1)
    expect(savedNotebook().items.find(item => item.id === 'fuse').current).toBe(3)
    chooseView('General')
    expect(within(itemElement('fuse')).getByText('3 / 4')).toBeTruthy()
  })

  it('bulk-creates plain tasks without automatically linking them to a section', async () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add tasks', exact: true }))
    fireEvent.change(screen.getByLabelText('Tasks (one per line)'), { target: { value: 'Flower one\nFlower two\n\nFlower three' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    const created = savedNotebook().items.filter(item => item.title.startsWith('Flower'))
    expect(created.map(item => item.title)).toEqual(['Flower one', 'Flower two', 'Flower three'])
    expect(created.every(item => item.trophyId === 'weapons-trophy' && item.parentId === null && item.sectionIds.length === 0 && item.mainSectionId === null)).toBe(true)
  })

  it('creates a child with inherited section membership instead of copied direct links', async () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add tasks', exact: true }))
    fireEvent.change(screen.getByLabelText('Tasks (one per line)'), { target: { value: 'New weapon' } })
    fireEvent.change(screen.getByLabelText('Subtask of'), { target: { value: 'weapons' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    const created = savedNotebook().items.find(item => item.title === 'New weapon')
    expect(created).toMatchObject({ trophyId: 'weapons-trophy', parentId: 'weapons', sectionIds: [], mainSectionId: 'chapter2' })
    chooseView('Sections')
    expect(itemElement(created.id, sectionElement('chapter1'))).toBeTruthy()
    expect(itemElement(created.id, sectionElement('chapter2'))).toBeTruthy()
  })

  it('lets a child choose an inherited section as its main section without creating a direct link', async () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit Find fuses', exact: true }))
    fireEvent.change(screen.getByLabelText('Main section'), { target: { value: 'chapter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'fuse')).toMatchObject({ sectionIds: [], mainSectionId: 'chapter2', parentId: 'bomb' })
    expect(itemRow('fuse').querySelector('.item-title').textContent).toContain('Chapter 2 - Find fuses')
  })

  it('removes a direct link without removing membership inherited from the parent', async () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Sections')
    fireEvent.click(within(sectionElement('chapter1')).getByRole('button', { name: 'Unlink Bomb Drone from Chapter 1' }))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'bomb')).toMatchObject({ sectionIds: [], mainSectionId: 'chapter1', parentId: 'weapons' })
    expect(itemElement('bomb', sectionElement('chapter1'))).toBeTruthy()
    expect(within(sectionElement('chapter1')).queryByRole('button', { name: 'Unlink Bomb Drone from Chapter 1' })).toBeNull()
    expect(within(sectionElement('chapter1')).queryByRole('button', { name: 'Unlink Find fuses from Chapter 1' })).toBeNull()
  })

  it('repairs the main section after its direct link is removed', async () => {
    const hunt = fixture()
    hunt.notebook.items.find(item => item.id === 'token').sectionIds = ['chapter1', 'chapter2']
    render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    fireEvent.click(within(sectionElement('chapter1')).getByRole('button', { name: 'Unlink Find the silver token from Chapter 1' }))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'token')).toMatchObject({ sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    expect(itemElement('token', sectionElement('chapter1'))).toBeNull()
    chooseView('General')
    expect(itemRow('token').querySelector('.item-title').textContent).toContain('Chapter 2 - Find the silver token')
  })
})

describe('notebook task duplication and trophy task completion', () => {
  it('copies a nested branch into multiple sections with independent counters and completion', async () => {
    const hunt = fixture()
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Bomb Drone', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Copy to Chapter 1' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Copy to Empty section' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await expectSaves()

    const saved = savedNotebook(), originalIds = new Set(hunt.notebook.items.map(item => item.id))
    const copies = saved.items.filter(item => !originalIds.has(item.id))
    expect(copies).toHaveLength(4)
    expect(new Set(saved.items.map(item => item.id)).size).toBe(saved.items.length)
    expect(saved.items.filter(item => originalIds.has(item.id))).toEqual(hunt.notebook.items)
    expect(saved.trophies).toEqual(hunt.notebook.trophies)
    const chapterCopy = copies.find(item => item.title === 'Bomb Drone' && item.mainSectionId === 'chapter1')
    const emptyCopy = copies.find(item => item.title === 'Bomb Drone' && item.mainSectionId === 'empty')
    const chapterCounter = copies.find(item => item.parentId === chapterCopy.id)
    const emptyCounter = copies.find(item => item.parentId === emptyCopy.id)
    expect(chapterCopy).toMatchObject({ parentId: null, trophyId: 'weapons-trophy', sectionIds: ['chapter1'], done: false, notes: 'Keep this note', missable: true })
    expect(emptyCopy).toMatchObject({ parentId: null, sectionIds: ['empty'], done: false })
    for (const counter of [chapterCounter, emptyCounter]) {
      expect(counter).toMatchObject({ title: 'Find fuses', type: 'counter', target: 4, current: 0, done: false, sectionIds: [], url: 'https://example.com/guide' })
    }

    chooseView('Sections')
    expect(itemElement(chapterCopy.id, sectionElement('chapter2'))).toBeNull()
    expect(itemElement(emptyCopy.id, sectionElement('chapter1'))).toBeNull()
    fireEvent.click(within(itemElement(emptyCounter.id, sectionElement('empty'))).getByRole('button', { name: 'Increase Find fuses' }))
    await expectSaves(2)
    expect(savedNotebook().items.find(item => item.id === emptyCounter.id).current).toBe(1)
    expect(savedNotebook().items.find(item => item.id === chapterCounter.id).current).toBe(0)
    expect(savedNotebook().items.find(item => item.id === 'fuse').current).toBe(2)

    fireEvent.click(within(itemRow(chapterCopy.id, sectionElement('chapter1'))).getByRole('checkbox', { name: 'Bomb Drone', exact: true }))
    await expectSaves(3)
    expect(savedNotebook().items.find(item => item.id === chapterCounter.id)).toMatchObject({ current: 4, done: true })
    expect(savedNotebook().items.find(item => item.id === emptyCounter.id)).toMatchObject({ current: 1, done: false })
    expect(savedNotebook().items.filter(item => originalIds.has(item.id))).toEqual(hunt.notebook.items)
    expect(savedNotebook().trophies).toEqual(hunt.notebook.trophies)
  })

  it('validates destinations and supports selecting and clearing every section', async () => {
    const hunt = fixture()
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Sentry Gun', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Choose at least one destination section'))
    expect(api).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Select all' }))
    expect(within(dialog).getAllByRole('checkbox').every(checkbox => checkbox.checked)).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Select all' }).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Clear selection' }))
    expect(within(dialog).getAllByRole('checkbox').every(checkbox => !checkbox.checked)).toBe(true)
    expect(within(dialog).getByRole('button', { name: 'Clear selection' }).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Select all' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await expectSaves()
    const copies = savedNotebook().items.filter(item => item.title === 'Sentry Gun' && item.id !== 'sentry')
    expect(copies).toHaveLength(3)
    expect(copies.map(item => item.sectionIds)).toEqual([['chapter1'], ['chapter2'], ['empty']])
    expect(copies.every(item => !item.done && item.current === 0 && item.parentId === null)).toBe(true)
    expect(savedNotebook().items.find(item => item.id === 'sentry').done).toBe(true)
  })

  it('keeps the notebook unchanged when a destination selection is cancelled', () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Bomb Drone', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    fireEvent.click(within(dialog).getByRole('button', { name: 'Select all' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(api).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    expect(screen.getAllByRole('checkbox', { name: 'Bomb Drone', exact: true })).toHaveLength(1)
  })

  it('explains missing sections and prevents creating copies without destinations', async () => {
    const hunt = fixture()
    hunt.notebook.sections = []
    hunt.notebook.items = hunt.notebook.items.map(item => ({ ...item, sectionIds: [], mainSectionId: null }))
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Bomb Drone', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    expect(within(dialog).getByText('Create a section in the notebook before duplicating this task.')).toBeTruthy()
    expect(within(dialog).queryByRole('checkbox')).toBeNull()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Choose at least one destination section'))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }))
    expect(api).not.toHaveBeenCalled()
    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })

  it('retries a failed copy save from the dialog without creating a second batch', async () => {
    const hunt = fixture()
    api.mockRejectedValueOnce(new Error('Network unavailable'))
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Bomb Drone', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Copy to Chapter 1' }))
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Copy to Empty section' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Network unavailable'))
    const failedDraft = structuredClone(savedNotebook())
    expect(failedDraft.items).toHaveLength(hunt.notebook.items.length + 4)
    expect(JSON.parse(sessionStorage.getItem(draftKey)).items).toEqual(failedDraft.items)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await expectSaves(2)
    expect(savedNotebook().items).toEqual(failedDraft.items)
    expect(savedNotebook().revision).toBe(failedDraft.revision)
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('keeps a saved copy batch committed when refreshing the hunt fails afterward', async () => {
    const hunt = fixture()
    context.reload.mockRejectedValueOnce(new Error('Refresh unavailable'))
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Bomb Drone', exact: true }))
    const dialog = screen.getByRole('dialog', { name: 'Duplicate task' })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Copy to Empty section' }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create copies' }))
    await expectSaves()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(screen.getByRole('alert').textContent).toContain('Changes saved, but refreshing the hunt failed: Refresh unavailable')
    expect(sessionStorage.getItem(draftKey)).toBeNull()
    const originalIds = new Set(hunt.notebook.items.map(item => item.id))
    const copies = savedNotebook().items.filter(item => !originalIds.has(item.id))
    expect(copies).toHaveLength(2)

    fireEvent.click(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }))
    await expectSaves(2)
    expect(savedNotebook().revision).toBe(1)
    expect(savedNotebook().items.filter(item => !originalIds.has(item.id))).toEqual(copies)
    expect(savedNotebook().items.find(item => item.id === 'unassigned').done).toBe(true)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it.each(['General', 'Sections', 'Grid'])('marks all trophy tasks from %s, including hidden tasks, without changing trophy awards', async view => {
    const hunt = fixture()
    hunt.notebook.trophies[0].sectionIds = ['chapter1']
    hunt.notebook.trophies[0].mainSectionId = 'chapter1'
    hunt.notebook.trophies.find(trophy => trophy.id === 'explorer').done = true
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Use all weapons' }))
    chooseView(view)
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value: 'missable' } })
    const scope = view === 'Sections' ? sectionElement('chapter1') : document
    expect(itemElement('unassigned')).toBeNull()
    fireEvent.click(within(scope).getByRole('button', { name: 'Mark all tasks in Weapon master' }))
    await expectSaves()
    const trophyTasks = savedNotebook().items.filter(item => item.trophyId === 'weapons-trophy')
    expect(trophyTasks).toHaveLength(5)
    expect(trophyTasks.every(item => item.done && item.current === item.target)).toBe(true)
    expect(savedNotebook().items.find(item => item.id === 'token')).toEqual(hunt.notebook.items.find(item => item.id === 'token'))
    expect(savedNotebook().trophies).toEqual(hunt.notebook.trophies)
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('60')
    expect(within(scope).queryByRole('button', { name: 'Mark all tasks in Weapon master' })).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('button', { name: /Clear all tasks/ })).toBeNull()
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value: 'all' } })
    if (view === 'General') fireEvent.click(within(scope).getByRole('button', { name: 'Expand trophy Weapon master' }))
    if (view !== 'Grid') fireEvent.click(within(scope).getByRole('button', { name: 'Expand Use all weapons' }))
    const counterScope = view === 'Grid' ? gridCell('weapons-trophy', 'chapter1') : scope
    fireEvent.click(within(counterScope).getByRole('button', { name: 'Decrease Find fuses' }))
    await expectSaves(2)
    expect(savedNotebook().items.find(item => item.id === 'fuse').current).toBe(3)
    expect(savedNotebook().trophies).toEqual(hunt.notebook.trophies)
    expect(within(scope).getByRole('button', { name: 'Mark all tasks in Weapon master' }).disabled).toBe(false)
  })

  it.each([false, true])('hides mark all for standalone checkbox trophies without subtasks (earned=%s)', earned => {
    const hunt = fixture()
    hunt.notebook.trophies.find(trophy => trophy.id === 'empty-trophy').done = earned
    render(<Notebook hunt={hunt} />)
    for (const view of ['General', 'Grid']) {
      chooseView(view)
      expect(screen.queryByRole('button', { name: 'Mark all tasks in Empty trophy' })).toBeNull()
    }
    expect(api).not.toHaveBeenCalled()
  })
})

describe('notebook v2 movement and collapse', () => {
  it('moves a collapsed subtree between trophies while retaining direct links and hidden descendants', async () => {
    const hunt = fixture()
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Use all weapons' }))
    dropOn(trophyElement('explorer'), startDrag('Drag Use all weapons'))
    await expectSaves()
    for (const id of ['weapons', 'bomb', 'fuse', 'sentry']) {
      expect(savedNotebook().items.find(item => item.id === id)).toEqual({ ...hunt.notebook.items.find(item => item.id === id), trophyId: 'explorer' })
    }
    expect(itemElement('bomb')).toBeNull()
    expect(trophyElement('explorer').contains(itemElement('weapons'))).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expand Use all weapons' }))
    expect(trophyElement('explorer').contains(itemElement('fuse'))).toBe(true)
  })

  it('nests and promotes tasks in General, recalculating inherited membership and main section', async () => {
    render(<Notebook hunt={fixture()} />)
    dropOn(itemRow('weapons'), startDrag('Drag Unassigned reminder'))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'unassigned')).toMatchObject({ parentId: 'weapons', sectionIds: [], mainSectionId: 'chapter2' })
    dropOn(trophyElement('empty-trophy'), startDrag('Drag Unassigned reminder'))
    await expectSaves(2)
    expect(savedNotebook().items.find(item => item.id === 'unassigned')).toMatchObject({ trophyId: 'empty-trophy', parentId: null, sectionIds: [], mainSectionId: null })
  })

  it('uses General task-row edges to reorder siblings without nesting', async () => {
    render(<Notebook hunt={fixture()} />)
    dropOn(itemRow('bomb'), startDrag('Drag Sentry Gun'), { y: 10 })
    await expectSaves()
    expect(savedNotebook().items.filter(item => item.parentId === 'weapons').map(item => item.id)).toEqual(['sentry', 'bomb'])
    dropOn(itemRow('bomb'), startDrag('Drag Sentry Gun'), { y: 90 })
    await expectSaves(2)
    expect(savedNotebook().items.filter(item => item.parentId === 'weapons').map(item => item.id)).toEqual(['bomb', 'sentry'])
    expect(savedNotebook().items.find(item => item.id === 'fuse').parentId).toBe('bomb')
  })

  it('links a task from a Sections drop without changing its trophy or hierarchy', async () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Sections')
    dropOn(sectionElement('empty'), startDrag('Drag Bomb Drone', sectionElement('chapter1')))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'bomb')).toMatchObject({ trophyId: 'weapons-trophy', parentId: 'weapons', sectionIds: ['chapter1', 'empty'], mainSectionId: 'chapter1' })
    expect(itemElement('fuse', sectionElement('empty'))).toBeTruthy()
    dropOn(itemRow('bomb', sectionElement('empty')), startDrag('Drag Find the silver token', sectionElement('chapter1')))
    await expectSaves(2)
    expect(savedNotebook().items.find(item => item.id === 'token')).toMatchObject({ trophyId: 'explorer', parentId: null, sectionIds: ['chapter1', 'empty'] })
  })

  it('links and reorders Grid objectives without reparenting within the same trophy', async () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Grid')
    dropOn(gridCell('weapons-trophy', 'empty'), startDrag('Drag Find fuses', gridCell('weapons-trophy', 'chapter1')))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'fuse')).toMatchObject({ parentId: 'bomb', sectionIds: ['empty'], mainSectionId: 'chapter1' })
    dropOn(itemRow('sentry', gridCell('weapons-trophy', 'chapter2')), startDrag('Drag Find fuses', gridCell('weapons-trophy', 'chapter2')), { y: 10 })
    await expectSaves(2)
    const items = savedNotebook().items
    expect(items.findIndex(item => item.id === 'fuse')).toBeLessThan(items.findIndex(item => item.id === 'sentry'))
    expect(items.find(item => item.id === 'fuse').parentId).toBe('bomb')
    expect(items.find(item => item.id === 'sentry').parentId).toBe('weapons')
  })

  it('moves a Grid objective to another trophy and repairs links lost through detachment', async () => {
    const hunt = fixture()
    // Compact trophies expose ownership targets only where they have an objective.
    hunt.notebook.items.push({ ...hunt.notebook.items.at(-1), id: 'destination-task', title: 'Destination task', trophyId: 'empty-trophy', sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    render(<Notebook hunt={hunt} />)
    chooseView('Grid')
    dropOn(gridCell('empty-trophy', 'chapter2'), startDrag('Drag Find fuses', gridCell('weapons-trophy', 'chapter1')))
    await expectSaves()
    expect(savedNotebook().items.find(item => item.id === 'fuse')).toMatchObject({ trophyId: 'empty-trophy', parentId: null, sectionIds: ['chapter2'], mainSectionId: 'chapter2', current: 2 })
    expect(itemElement('fuse', gridCell('empty-trophy', 'chapter2'))).toBeTruthy()
  })

  it.each([
    ['General', 'trophies', 'Drag trophy Empty trophy', 'weapons-trophy', ['empty-trophy', 'weapons-trophy', 'explorer'], { x: 190, y: 10 }],
    ['Grid', 'sections', 'Drag section Empty section', 'chapter1', ['empty', 'chapter1', 'chapter2'], { x: 10, y: 90 }],
  ])('reorders %s group headers using the correct axis', async (mode, kind, label, target, order, pointer) => {
    render(<Notebook hunt={fixture()} />)
    chooseView(mode)
    dropOn(groupHeader(kind, target), startDrag(label), pointer)
    await expectSaves()
    expect(savedNotebook()[kind].map(group => group.id)).toEqual(order)
  })

  it('keeps independent collapsed branches in General and Sections without hiding Grid objectives', () => {
    render(<Notebook hunt={fixture()} />)
    expect(screen.queryByRole('button', { name: 'Collapse Sentry Gun' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Bomb Drone' }))
    fireEvent.click(screen.getByRole('button', { name: 'Collapse Use all weapons' }))
    chooseView('Sections')
    expect(within(sectionElement('chapter1')).getByRole('button', { name: 'Expand Use all weapons' }).getAttribute('aria-expanded')).toBe('false')
    chooseView('Grid')
    expect(itemElement('fuse', gridCell('weapons-trophy', 'chapter1'))).toBeTruthy()
    chooseView('General')
    fireEvent.click(screen.getByRole('button', { name: 'Expand Use all weapons' }))
    expect(screen.getByRole('button', { name: 'Expand Bomb Drone' }).getAttribute('aria-expanded')).toBe('false')
    expect(itemElement('fuse')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Expand Bomb Drone' }))
    expect(itemElement('fuse')).toBeTruthy()
    expect(taskProgress().getAttribute('aria-valuenow')).toBe('20')
    expect(api).not.toHaveBeenCalled()
  })

  it('rejects cycles, unchanged moves, cancelled drags, and foreign payloads', () => {
    render(<Notebook hunt={fixture()} />)
    dropOn(itemRow('weapons'), startDrag('Drag Use all weapons'))
    dropOn(itemRow('fuse'), startDrag('Drag Use all weapons'))
    dropOn(trophyElement('weapons-trophy'), startDrag('Drag Unassigned reminder'))
    const cancelled = startDrag('Drag Bomb Drone')
    dragEvent('dragOver', trophyElement('empty-trophy'), cancelled)
    fireEvent.dragEnd(cancelled.handle, { dataTransfer: cancelled.dataTransfer })
    const foreign = { dataTransfer: { dropEffect: '', getData: () => 'untrusted task' } }
    dragEvent('drop', trophyElement('empty-trophy'), foreign)
    expect(api).not.toHaveBeenCalled()
  })

  it('rejects extra drops and disables drag handles while saving', async () => {
    let finish
    api.mockImplementation((path, method, body) => new Promise(resolve => { finish = () => resolve({ notebook: { ...body, revision: body.revision + 1 } }) }))
    render(<Notebook hunt={fixture()} />)
    dropOn(trophyElement('empty-trophy'), startDrag('Drag Unassigned reminder'))
    expect(screen.getByText('Saving…')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Drag Bomb Drone' }).disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Drag trophy Explorer' }).disabled).toBe(true)
    dropOn(trophyElement('explorer'), startDrag('Drag Bomb Drone'))
    expect(api).toHaveBeenCalledTimes(1)
    finish()
    await expectSaves()
  })
})

describe('notebook v2 recovery, copying, and empty groups', () => {
  it('adopts a newer parent revision received during saving before the next edit', async () => {
    let finishSave
    api.mockImplementationOnce((path, method, body) => new Promise(resolve => { finishSave = () => resolve({ notebook: { ...body, revision: body.revision + 1 } }) }))
    const hunt = fixture(), { rerender } = render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }))
    expect(screen.getByText('Saving…')).toBeTruthy()
    rerender(<Notebook hunt={structuredClone(hunt)} />)
    expect(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }).checked).toBe(true)
    const refreshed = structuredClone(hunt)
    refreshed.notebook.revision = 2
    refreshed.notebook.items.find(item => item.id === 'unassigned').done = true
    refreshed.notebook.items.find(item => item.id === 'token').title = 'Refreshed token'
    rerender(<Notebook hunt={refreshed} />)
    expect(screen.queryByRole('checkbox', { name: 'Refreshed token', exact: true })).toBeNull()
    await act(async () => finishSave())
    await expectSaves()
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Refreshed token', exact: true })).toBeTruthy())
    fireEvent.click(screen.getByRole('checkbox', { name: 'Refreshed token', exact: true }))
    await expectSaves(2)
    expect(savedNotebook().revision).toBe(2)
    expect(savedNotebook().items.find(item => item.id === 'token')).toMatchObject({ title: 'Refreshed token', done: true })
    expect(savedNotebook().items.find(item => item.id === 'unassigned').done).toBe(true)
  })

  it('does not overwrite a confirmed save when stale parent props are recreated', async () => {
    const hunt = fixture(), { rerender } = render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }))
    await expectSaves()
    rerender(<Notebook hunt={structuredClone(hunt)} />)
    expect(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Unassigned reminder', exact: true }))
    await expectSaves(2)
    expect(savedNotebook().revision).toBe(1)
    expect(savedNotebook().items.find(item => item.id === 'unassigned').done).toBe(false)
  })

  it('restores a failed movement draft and retries the same canonical hierarchy', async () => {
    const hunt = fixture()
    api.mockRejectedValue(new Error('Network unavailable'))
    render(<Notebook hunt={hunt} />)
    dropOn(itemRow('weapons'), startDrag('Drag Unassigned reminder'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Network unavailable'))
    cleanup()
    render(<Notebook hunt={hunt} />)
    expect(screen.getByRole('alert').textContent).toContain('unsaved draft was restored')
    expect(itemElement('weapons').contains(itemElement('unassigned'))).toBe(true)
    api.mockImplementation(successSave)
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await expectSaves(2)
    expect(savedNotebook().formatVersion).toBe(2)
    expect(savedNotebook().items.find(item => item.id === 'unassigned').parentId).toBe('weapons')
    expect(sessionStorage.getItem(draftKey)).toBeNull()
  })

  it('converts a legacy session draft before rendering or retrying it', async () => {
    const legacy = {
      revision: 3, sections: [{ id: 'old-section', title: 'Old chapter' }],
      items: [{ id: 'old-task', sectionId: 'old-section', parentId: null, category: 'Old category', title: 'Recovered task', type: 'checkbox', done: true, current: 1, target: 1, notes: 'Preserve this', url: '', missable: false }],
    }
    sessionStorage.setItem(draftKey, JSON.stringify(legacy))
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Expand trophy Old chapter' }))
    expect(screen.getByRole('checkbox', { name: 'Recovered task', exact: true }).checked).toBe(true)
    expect(screen.getByRole('alert').textContent).toContain('unsaved draft was restored')
    fireEvent.click(screen.getByRole('button', { name: 'Retry saving' }))
    await expectSaves()
    const saved = savedNotebook(), item = saved.items.find(entry => entry.id === 'old-task')
    expect(saved.formatVersion).toBe(2)
    expect(saved.revision).toBe(3)
    expect(item).toMatchObject({ title: 'Recovered task', done: true, notes: 'Preserve this', trophyId: 'old-section', sectionIds: [], mainSectionId: null })
    expect(saved.trophies.some(trophy => trophy.id === item.trophyId)).toBe(true)
    expect(item).not.toHaveProperty('sectionId')
    expect(item).not.toHaveProperty('category')
  })

  it('copies through the existing revision-checked action without changing the source', async () => {
    const hunt = fixture(), other = { ...fixture(), _id: 'other', notebook: { ...fixture().notebook, revision: 7 } }
    context.data = { games: [{ _id: 'game', title: 'Test game' }], hunts: [hunt, other], platforms: [{ _id: 'ps5', name: 'PlayStation 5' }] }
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Copy to hunt' }))
    fireEvent.change(screen.getByLabelText('Destination hunt'), { target: { value: 'other' } })
    fireEvent.click(screen.getByRole('button', { name: 'Copy and reset completion' }))
    await waitFor(() => expect(context.mutate).toHaveBeenCalledWith('/hunts/hunt/copy-notebook', 'POST', { targetId: 'other', revision: 7 }))
    expect(api).not.toHaveBeenCalled()
    expect(screen.getByRole('checkbox', { name: 'Sentry Gun', exact: true }).checked).toBe(true)
  })

  it('allows deleting the final empty trophy and section, then creating new groups', async () => {
    const hunt = fixture()
    hunt.notebook.trophies = [hunt.notebook.trophies[0]]
    hunt.notebook.sections = [hunt.notebook.sections[0]]
    hunt.notebook.items = []
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Delete trophy Weapon master' }))
    expect(screen.getByRole('dialog', { name: 'Delete trophy?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    await expectSaves()
    expect(savedNotebook().trophies).toEqual([])
    chooseView('Sections')
    fireEvent.click(screen.getByRole('button', { name: 'Delete section Chapter 1' }))
    expect(screen.getByRole('dialog', { name: 'Delete empty section?' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    await expectSaves(2)
    expect(savedNotebook().sections).toEqual([])
    expect(savedNotebook().items).toEqual([])
    fireEvent.click(screen.getByRole('button', { name: 'Trophy', exact: true }))
    fireEvent.change(screen.getByLabelText('Trophy name'), { target: { value: 'New trophy' } })
    fireEvent.change(screen.getByRole('textbox', { name: /^Description/ }), { target: { value: 'Collect all hidden flowers.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves(3)
    expect(savedNotebook().trophies[0]).toMatchObject({ title: 'New trophy', description: 'Collect all hidden flowers.', done: false })
    fireEvent.click(screen.getByRole('button', { name: 'Section', exact: true }))
    expect(screen.queryByRole('textbox', { name: /^Description/ })).toBeNull()
    fireEvent.change(screen.getByLabelText('Section name'), { target: { value: 'New section' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves(4)
    expect(savedNotebook().sections[0].title).toBe('New section')
  })

  it('appends two sections in sequence without replacing the first section or changing trophies', async () => {
    const hunt = fixture()
    hunt.notebook.trophies = [hunt.notebook.trophies[0]]
    hunt.notebook.sections = []
    hunt.notebook.items = hunt.notebook.items.filter(item => item.id === 'unassigned')
    const { rerender } = render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    fireEvent.click(screen.getByRole('button', { name: 'Section', exact: true }))
    fireEvent.change(screen.getByLabelText('Section name'), { target: { value: 'Chapter Alpha' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const firstSection = savedNotebook().sections[0]
    expect(savedNotebook().sections).toEqual([{ id: firstSection.id, title: 'Chapter Alpha' }])
    // Parent refreshes can still carry the pre-save snapshot between successive additions.
    rerender(<Notebook hunt={structuredClone(hunt)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Section', exact: true }))
    fireEvent.change(screen.getByLabelText('Section name'), { target: { value: 'Chapter Beta' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves(2)
    expect(savedNotebook().revision).toBe(1)
    expect(savedNotebook().sections.map(section => section.title)).toEqual(['Chapter Alpha', 'Chapter Beta'])
    expect(savedNotebook().sections[0]).toEqual(firstSection)
    expect(savedNotebook().sections[1].id).not.toBe(firstSection.id)
    expect(savedNotebook().trophies).toEqual(hunt.notebook.trophies)
    expect(savedNotebook().items).toEqual(hunt.notebook.items)
    expect(api.mock.calls[0][2].sections).toHaveLength(1)
    expect(sectionElement(firstSection.id)).toBeTruthy()
    expect(sectionElement(savedNotebook().sections[1].id)).toBeTruthy()
  })

  it('does not treat filtered-out tasks as empty groups', () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value: 'missable' } })
    expect(itemElement('token')).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete trophy Explorer' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete trophy Empty trophy' })).toBeNull()
    chooseView('Sections')
    expect(screen.queryByRole('button', { name: 'Delete section Chapter 2' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete section Empty section' })).toBeTruthy()
  })

  it('refuses a stale deletion after a refreshed notebook links a branch to the section', async () => {
    const hunt = fixture(), { rerender } = render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    fireEvent.click(screen.getByRole('button', { name: 'Delete section Empty section' }))
    const refreshed = structuredClone(hunt)
    refreshed.notebook.revision += 1
    refreshed.notebook.items.find(item => item.id === 'weapons').sectionIds.push('empty')
    rerender(<Notebook hunt={refreshed} />)
    await waitFor(() => expect(itemElement('fuse', sectionElement('empty'))).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Delete', exact: true }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toMatch(/empty/i))
    expect(api).not.toHaveBeenCalled()
    expect(itemElement('fuse', sectionElement('empty'))).toBeTruthy()
  })
})

describe('notebook v2 drag edge scrolling', () => {
  let frames, requestFrame, cancelFrame, scrollPage
  beforeEach(() => {
    frames = new Map()
    let nextId = 0
    requestFrame = vi.fn(callback => { frames.set(++nextId, callback); return nextId })
    cancelFrame = vi.fn(id => frames.delete(id))
    vi.stubGlobal('requestAnimationFrame', requestFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelFrame)
    scrollPage = vi.spyOn(window, 'scrollBy').mockImplementation(() => {})
  })
  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    scrollPage.mockRestore()
  })
  function nextFrame() {
    expect(frames.size).toBe(1)
    const [id, callback] = frames.entries().next().value
    frames.delete(id)
    act(() => callback(16))
  }
  function mockGrid({ bottom = 400, scrollTop = 100 } = {}) {
    const grid = document.querySelector('.chapter-grid-wrap')
    let top = scrollTop, left = 100
    const height = bottom - 100
    grid.getBoundingClientRect = () => ({ top: 100, bottom, left: 100, right: 500, width: 400, height })
    Object.defineProperties(grid, {
      clientWidth: { configurable: true, value: 400 }, scrollWidth: { configurable: true, value: 1200 },
      clientHeight: { configurable: true, value: height }, scrollHeight: { configurable: true, value: height + 600 },
      scrollLeft: { configurable: true, get: () => left, set: value => { left = Math.max(0, Math.min(800, value)) } },
      scrollTop: { configurable: true, get: () => top, set: value => { top = Math.max(0, Math.min(600, value)) } },
    })
    return grid
  }

  it('scrolls Grid in both axes and cancels the frame on drop', async () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Grid')
    const grid = mockGrid(), drag = startDrag('Drag Unassigned reminder'), target = gridCell('weapons-trophy', 'empty')
    dragEvent('dragOver', target, drag, { x: 495, y: 395 })
    nextFrame()
    expect(grid.scrollLeft).toBeGreaterThan(100)
    expect(grid.scrollTop).toBeGreaterThan(100)
    expect(scrollPage).not.toHaveBeenCalled()
    const previousLeft = grid.scrollLeft, previousTop = grid.scrollTop
    dragEvent('dragOver', target, drag, { x: 105, y: 105 })
    nextFrame()
    expect(grid.scrollLeft).toBeLessThan(previousLeft)
    expect(grid.scrollTop).toBeLessThan(previousTop)
    const scheduledFrame = frames.keys().next().value
    dragEvent('drop', target, drag, { x: 105, y: 105 })
    expect(cancelFrame).toHaveBeenCalledWith(scheduledFrame)
    expect(frames.size).toBe(0)
    await expectSaves()
  })

  it('scrolls page edges and stops on Escape', () => {
    render(<Notebook hunt={fixture()} />)
    const drag = startDrag('Drag Bomb Drone')
    dragEvent('dragOver', document.body, drag, { x: 200, y: window.innerHeight - 5 })
    nextFrame()
    expect(scrollPage.mock.calls.at(-1)[1]).toBeGreaterThan(0)
    dragEvent('dragOver', document.body, drag, { x: 200, y: 5 })
    nextFrame()
    expect(scrollPage.mock.calls.at(-1)[1]).toBeLessThan(0)
    const scheduledFrame = frames.keys().next().value
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cancelFrame).toHaveBeenCalledWith(scheduledFrame)
    expect(frames.size).toBe(0)
    expect(document.querySelector('.notebook-dragging')).toBeNull()
  })

  it('scrolls the page once Grid reaches its vertical limit and stops on dragEnd', () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Grid')
    const grid = mockGrid({ bottom: window.innerHeight, scrollTop: 600 }), drag = startDrag('Drag Unassigned reminder')
    dragEvent('dragOver', gridCell('weapons-trophy', 'empty'), drag, { x: 300, y: window.innerHeight - 5 })
    nextFrame()
    expect(grid.scrollTop).toBe(600)
    expect(scrollPage.mock.calls.at(-1)[1]).toBeGreaterThan(0)
    const scheduledFrame = frames.keys().next().value
    fireEvent.dragEnd(drag.handle, { dataTransfer: drag.dataTransfer })
    expect(cancelFrame).toHaveBeenCalledWith(scheduledFrame)
    expect(frames.size).toBe(0)
  })

  it('does not schedule scrolling for foreign drags', () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Grid')
    const grid = mockGrid(), foreign = { dataTransfer: { dropEffect: '' } }
    dragEvent('dragOver', gridCell('weapons-trophy', 'empty'), foreign, { x: 495, y: 395 })
    dragEvent('dragOver', document.body, foreign, { x: 200, y: window.innerHeight - 5 })
    expect(requestFrame).not.toHaveBeenCalled()
    expect(grid.scrollLeft).toBe(100)
    expect(grid.scrollTop).toBe(100)
    expect(scrollPage).not.toHaveBeenCalled()
  })

  it('pauses at document exit, resumes the same drag, and cleans up on unmount', () => {
    const { unmount } = render(<Notebook hunt={fixture()} />)
    chooseView('Grid')
    const grid = mockGrid(), drag = startDrag('Drag Unassigned reminder'), target = gridCell('weapons-trophy', 'empty')
    dragEvent('dragOver', target, drag, { x: 495, y: 395 })
    nextFrame()
    expect(target.classList.contains('drop-inside')).toBe(true)
    const exitFrame = frames.keys().next().value, pausedTop = grid.scrollTop
    dragEvent('dragLeave', document.documentElement, drag, { x: 0, y: 0 })
    expect(cancelFrame).toHaveBeenCalledWith(exitFrame)
    expect(frames.size).toBe(0)
    expect(target.classList.contains('drop-inside')).toBe(false)
    expect(document.querySelector('.notebook-dragging')).toBeTruthy()
    dragEvent('dragOver', target, drag, { x: 495, y: 395 })
    nextFrame()
    expect(grid.scrollTop).toBeGreaterThan(pausedTop)
    const unmountFrame = frames.keys().next().value
    unmount()
    expect(cancelFrame).toHaveBeenCalledWith(unmountFrame)
    expect(frames.size).toBe(0)
    const requestsBefore = requestFrame.mock.calls.length
    dragEvent('dragOver', document.body, drag, { x: 200, y: window.innerHeight - 5 })
    expect(requestFrame).toHaveBeenCalledTimes(requestsBefore)
  })

  it('keeps the newer target after late drag-leave events from an old row or trophy', () => {
    render(<Notebook hunt={fixture()} />)
    const drag = startDrag('Drag Unassigned reminder'), oldRow = itemRow('bomb'), newRow = itemRow('token')
    dragEvent('dragOver', oldRow, drag)
    dragEvent('dragOver', newRow, drag)
    expect(newRow.classList.contains('drop-inside')).toBe(true)
    dragEvent('dragLeave', oldRow, drag, { relatedTarget: newRow })
    dragEvent('dragLeave', trophyElement('weapons-trophy'), drag, { relatedTarget: newRow })
    expect(newRow.classList.contains('drop-inside')).toBe(true)
    dragEvent('dragLeave', newRow, drag, { relatedTarget: trophyElement('empty-trophy') })
    expect(newRow.classList.contains('drop-inside')).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })
})
