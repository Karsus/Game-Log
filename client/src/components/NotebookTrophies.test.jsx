// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Notebook from './Notebook'
import { api } from '../lib/api'
import { normalizeNotebook, repairMainSections } from '../lib/notebook'

const context = vi.hoisted(() => ({ data: {}, reload: vi.fn(), mutate: vi.fn() }))
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))

const task = (id, title, extra = {}) => ({ id, title, trophyId: 'flowers', parentId: null, sectionIds: [], mainSectionId: null, type: 'checkbox', target: 1, current: 0, done: false, ...extra })
function fixture() {
  return {
    _id: 'hunt', userId: 'user', gameId: 'game', platformId: 'ps5', service: 'playstation',
    notebook: repairMainSections(normalizeNotebook({
      formatVersion: 2, revision: 0,
      trophies: [{ id: 'flowers', title: 'Flowers', done: false }, { id: 'other', title: 'Explorer', done: false }],
      sections: [{ id: 'chapter1', title: 'Chapter 1' }, { id: 'chapter2', title: 'Chapter 2' }, { id: 'chapter3', title: 'Chapter 3' }],
      items: [
        task('garden', 'Garden flowers', { sectionIds: ['chapter1'] }),
        task('rose', 'Red roses', { parentId: 'garden', type: 'counter', target: 3, current: 1 }),
        task('lily', 'White lily', { parentId: 'garden' }),
        task('map', 'Find the map', { trophyId: 'other', sectionIds: ['chapter1'] }),
      ],
    })),
  }
}
const saved = () => api.mock.calls.at(-1)[2]
const chooseView = name => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const section = id => document.querySelector(`[data-notebook-section="${id}"]`)
const item = (id, scope = document) => scope.querySelector(`[data-notebook-item="${id}"]`)
const trophyTask = (id, scope = document) => scope.querySelector(`[data-notebook-trophy-task="${id}"]`)
const cell = (trophyId, sectionId) => document.querySelector(`[data-trophy-id="${trophyId}"][data-section-id="${sectionId}"]`)
const trophyHeader = id => document.querySelector(`[data-notebook-group-header][data-group-kind="trophies"][data-group-id="${id}"]`)
async function expectSaves(count = 1) {
  await waitFor(() => expect(api).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy())
}
async function closeAfterSave(count = 1) {
  await expectSaves(count)
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}
function dropTrophy(scope, title, destination) {
  const handle = within(scope).getByRole('button', { name: `Drag trophy ${title}`, exact: true })
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(handle, { dataTransfer })
  destination.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 })
  for (const name of ['dragOver', 'drop']) {
    const event = createEvent[name](destination, { dataTransfer })
    Object.defineProperties(event, { clientX: { value: 100 }, clientY: { value: 50 } })
    fireEvent(destination, event)
  }
  fireEvent.dragEnd(handle, { dataTransfer })
}

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  context.data = { games: [], hunts: [], platforms: [] }
  context.reload.mockResolvedValue({})
  context.mutate.mockResolvedValue({})
  api.mockImplementation(async (path, method, body) => ({ notebook: { ...body, revision: body.revision + 1 } }))
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

describe('trophies as first-level tasks', () => {
  it('creates a linked counter trophy directly without a redundant task and shares its progress across views', async () => {
    const hunt = fixture()
    hunt.notebook.trophies = []
    hunt.notebook.items = []
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Trophy', exact: true }))
    fireEvent.change(screen.getByLabelText('Trophy name'), { target: { value: 'Gather flowers' } })
    fireEvent.change(screen.getByLabelText('Tracking type'), { target: { value: 'counter' } })
    fireEvent.change(screen.getByLabelText('Target count'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Current count'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Link to Chapter 1' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Link to Chapter 2' }))
    fireEvent.change(screen.getByLabelText('Main section'), { target: { value: 'chapter2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await closeAfterSave()
    const trophyId = saved().trophies[0].id
    expect(saved().trophies[0]).toMatchObject({ title: 'Gather flowers', type: 'counter', target: 2, current: 1, sectionIds: ['chapter1', 'chapter2'], mainSectionId: 'chapter2' })
    expect(saved().items).toEqual([])
    expect(within(trophyHeader(trophyId)).getByText('1 / 2')).toBeTruthy()
    chooseView('Sections')
    expect(trophyTask(trophyId, section('chapter1'))).toBeTruthy()
    expect(trophyTask(trophyId, section('chapter2'))).toBeTruthy()
    fireEvent.click(within(section('chapter2')).getByRole('button', { name: 'Increase trophy Gather flowers' }))
    await expectSaves(2)
    expect(saved().trophies[0].current).toBe(2)
    for (const id of ['chapter1', 'chapter2']) {
      expect(within(section(id)).getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }).checked).toBe(false)
      expect(within(section(id)).getByRole('button', { name: 'Increase trophy Gather flowers' }).disabled).toBe(true)
    }
    expect(saved().trophies[0].done).toBe(false)
    fireEvent.click(within(section('chapter1')).getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }))
    await expectSaves(3)
    expect(saved().trophies[0]).toMatchObject({ current: 2, done: true })
    expect(within(section('chapter2')).getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }).checked).toBe(true)
    chooseView('Grid')
    expect(cell(trophyId, '')).toBeNull()
    fireEvent.click(within(cell(trophyId, 'chapter1')).getByRole('button', { name: 'Decrease trophy Gather flowers' }))
    await expectSaves(4)
    expect(saved().trophies[0]).toMatchObject({ current: 1, done: true })
    expect(within(cell(trophyId, 'chapter2')).getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }).checked).toBe(true)
    expect(saved().items).toEqual([])
    const persisted = structuredClone(saved())
    cleanup()
    render(<Notebook hunt={{ ...hunt, notebook: persisted }} />)
    expect(screen.getByText('1 / 2')).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }))
    await expectSaves(5)
    expect(saved().trophies[0]).toMatchObject({ current: 1, done: false })
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Gather flowers' }).checked).toBe(false)
  })

  it('keeps checkbox trophy awards independent of completing or clearing subtasks', async () => {
    const hunt = fixture()
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Garden flowers', exact: true }))
    await expectSaves()
    expect(saved().items.filter(entry => entry.trophyId === 'flowers').every(entry => entry.done && entry.current === entry.target)).toBe(true)
    expect(saved().items.find(entry => entry.id === 'map')).toEqual(hunt.notebook.items.find(entry => entry.id === 'map'))
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(false)
    expect(saved().trophies[0].done).toBe(false)
    const completedItems = structuredClone(saved().items)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }))
    await expectSaves(2)
    expect(saved().items).toEqual(completedItems)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Expand trophy Flowers' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'White lily', exact: true }))
    await expectSaves(3)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(true)
    const partialItems = structuredClone(saved().items)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }))
    await expectSaves(4)
    expect(saved().items).toEqual(partialItems)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(false)
    expect(saved().trophies.find(entry => entry.id === 'other')).toEqual(hunt.notebook.trophies.find(entry => entry.id === 'other'))
  })

  it('does not award a counter trophy when its counter and subtasks are complete or reset progress when its award changes', async () => {
    const hunt = fixture()
    Object.assign(hunt.notebook.trophies[0], { type: 'counter', target: 2, current: 0 })
    hunt.notebook.items = hunt.notebook.items.map(entry => entry.trophyId === 'flowers' ? { ...entry, done: true, current: entry.target } : entry)
    render(<Notebook hunt={hunt} />)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(false)
    fireEvent.click(screen.getByRole('button', { name: 'Increase trophy Flowers' }))
    await expectSaves()
    fireEvent.click(screen.getByRole('button', { name: 'Increase trophy Flowers' }))
    await expectSaves(2)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(false)
    expect(saved().items).toEqual(hunt.notebook.items)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }))
    await expectSaves(3)
    expect(saved().trophies[0]).toMatchObject({ current: 2, done: true })
    expect(saved().items).toEqual(hunt.notebook.items)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }))
    await expectSaves(4)
    expect(saved().trophies[0]).toMatchObject({ current: 2, done: false })
    expect(saved().items).toEqual(hunt.notebook.items)
  })

  it('shows linked tasks directly in Sections without their unlinked trophy headings', () => {
    render(<Notebook hunt={fixture()} />)
    chooseView('Sections')
    const chapter = section('chapter1')
    expect(within(chapter).getByRole('checkbox', { name: 'Garden flowers', exact: true })).toBeTruthy()
    expect(within(chapter).getByRole('checkbox', { name: 'Find the map', exact: true })).toBeTruthy()
    expect(within(chapter).queryByRole('checkbox', { name: /^Trophy earned:/ })).toBeNull()
    expect(within(chapter).queryByText('Flowers', { exact: true })).toBeNull()
    expect(within(chapter).queryByText('Explorer', { exact: true })).toBeNull()
    expect(chapter.querySelector('.notebook-section-trophy-heading')).toBeNull()
    expect(chapter.querySelector('[data-notebook-trophy-task]')).toBeNull()
  })

  it('renders a linked trophy as a task, inherits links to children, and respects branch opt-out', async () => {
    const hunt = fixture()
    Object.assign(hunt.notebook.trophies[0], { sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    hunt.notebook.items.push(task('independent', 'Independent flowers', { sectionIds: ['chapter3'], mainSectionId: 'chapter3', inheritTrophySections: false }))
    render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    expect(trophyTask('flowers', section('chapter2'))).toBeTruthy()
    expect(item('garden', section('chapter2'))).toBeTruthy()
    expect(item('rose', section('chapter2'))).toBeTruthy()
    expect(item('independent', section('chapter2'))).toBeNull()
    expect(item('independent', section('chapter3'))).toBeTruthy()
    expect(trophyTask('flowers', section('chapter3'))).toBeNull()
    fireEvent.click(within(section('chapter2')).getByRole('button', { name: 'Edit Garden flowers', exact: true }))
    expect(screen.getByRole('checkbox', { name: 'Inherit trophy section links' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Inherit trophy section links' }))
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await closeAfterSave()
    expect(saved().items.find(entry => entry.id === 'garden').inheritTrophySections).toBe(false)
    expect(item('garden', section('chapter2'))).toBeNull()
    expect(item('rose', section('chapter2'))).toBeNull()
    expect(item('garden', section('chapter1'))).toBeTruthy()
    expect(trophyTask('flowers', section('chapter2'))).toBeTruthy()
  })

  it('protects sections linked only to standalone trophies and repairs the main section after unlinking in the editor', async () => {
    const hunt = fixture()
    hunt.notebook.trophies = [{ ...hunt.notebook.trophies[0], sectionIds: ['chapter1', 'chapter2'], mainSectionId: 'chapter1' }]
    hunt.notebook.items = []
    render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    expect(screen.queryByRole('button', { name: 'Delete section Chapter 1' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Delete section Chapter 2' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete section Chapter 3' })).toBeTruthy()
    fireEvent.click(within(section('chapter1')).getByRole('button', { name: 'Edit trophy Flowers' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Link to Chapter 1' }))
    expect(screen.getByLabelText('Main section').value).toBe('chapter2')
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await closeAfterSave()
    expect(saved().trophies[0]).toMatchObject({ sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    expect(trophyTask('flowers', section('chapter1'))).toBeNull()
    expect(screen.getByRole('button', { name: 'Delete section Chapter 1' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Delete section Chapter 2' })).toBeNull()
    expect(trophyTask('flowers', section('chapter2'))).toBeTruthy()
  })

  it('links trophies by dragging into sections and Grid without duplicate links or implicit unlinking', async () => {
    const hunt = fixture()
    Object.assign(hunt.notebook.trophies[0], { sectionIds: ['chapter1'], mainSectionId: 'chapter1' })
    render(<Notebook hunt={hunt} />)
    chooseView('Sections')
    dropTrophy(section('chapter1'), 'Flowers', section('chapter2'))
    await expectSaves()
    expect(saved().trophies[0]).toMatchObject({ sectionIds: ['chapter1', 'chapter2'], mainSectionId: 'chapter1' })
    expect(item('rose', section('chapter2'))).toBeTruthy()
    dropTrophy(section('chapter1'), 'Flowers', section('chapter2'))
    expect(api).toHaveBeenCalledTimes(1)
    chooseView('Grid')
    dropTrophy(trophyHeader('flowers'), 'Flowers', cell('flowers', ''))
    expect(api).toHaveBeenCalledTimes(1)
    dropTrophy(trophyHeader('flowers'), 'Flowers', document.querySelector('[data-compact-section-id="chapter3"]'))
    await expectSaves(2)
    expect(saved().trophies[0].sectionIds).toEqual(['chapter1', 'chapter2', 'chapter3'])
    expect(saved().trophies[1].sectionIds).toEqual([])
    expect(item('rose', cell('flowers', 'chapter3'))).toBeTruthy()
    expect(item('lily', cell('flowers', 'chapter3'))).toBeTruthy()
  })

  it.each([false, true])('marks a standalone trophy counter complete while preserving its manual award (%s)', async earned => {
    const hunt = fixture()
    hunt.notebook.trophies = [{ ...hunt.notebook.trophies[0], type: 'counter', target: 10, current: 3, done: earned }]
    hunt.notebook.items = []
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all tasks in Flowers' }))
    await expectSaves()
    expect(saved().trophies[0]).toMatchObject({ current: 10, done: earned })
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(earned)
    expect(saved().items).toEqual([])
    expect(screen.queryByRole('button', { name: 'Mark all tasks in Flowers' })).toBeNull()
    expect(screen.queryByRole('button', { name: /Clear all/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Decrease trophy Flowers' }))
    await expectSaves(2)
    expect(saved().trophies[0]).toMatchObject({ current: 9, done: earned })
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(earned)
    expect(screen.getByRole('button', { name: 'Mark all tasks in Flowers' }).disabled).toBe(false)
  })

  it.each([false, true])('marks checkbox trophy subtasks complete without changing its manual award (%s)', async earned => {
    const hunt = fixture()
    hunt.notebook.trophies[0].done = earned
    render(<Notebook hunt={hunt} />)
    fireEvent.click(screen.getByRole('button', { name: 'Mark all tasks in Flowers' }))
    await expectSaves()
    expect(saved().items.filter(entry => entry.trophyId === 'flowers').every(entry => entry.done && entry.current === entry.target)).toBe(true)
    expect(saved().trophies).toEqual(hunt.notebook.trophies)
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(earned)
    expect(screen.queryByRole('button', { name: 'Mark all tasks in Flowers' })).toBeNull()
  })

  it('hides Mark all for an unearned standalone checkbox trophy', () => {
    const hunt = fixture()
    hunt.notebook.trophies = [hunt.notebook.trophies[0]]
    hunt.notebook.items = []
    render(<Notebook hunt={hunt} />)
    for (const view of ['General', 'Grid']) {
      chooseView(view)
      expect(screen.queryByRole('button', { name: 'Mark all tasks in Flowers' })).toBeNull()
    }
    expect(api).not.toHaveBeenCalled()
    expect(within(trophyHeader('flowers')).getByRole('checkbox', { name: 'Trophy earned: Flowers' }).checked).toBe(false)
  })

  it('filters a Grid trophy objective by its own completion and missable state while retaining matching child tasks', () => {
    const hunt = fixture()
    Object.assign(hunt.notebook.trophies[0], { type: 'counter', target: 2, current: 2, sectionIds: ['chapter1'], mainSectionId: 'chapter1', missable: false })
    hunt.notebook.items.find(entry => entry.id === 'lily').missable = true
    render(<Notebook hunt={hunt} />)
    chooseView('Grid')
    expect(trophyTask('flowers', cell('flowers', 'chapter1'))).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value: 'remaining' } })
    expect(trophyTask('flowers', cell('flowers', 'chapter1'))).toBeNull()
    expect(item('rose', cell('flowers', 'chapter1'))).toBeTruthy()
    expect(item('lily', cell('flowers', 'chapter1'))).toBeTruthy()
    fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value: 'missable' } })
    expect(trophyTask('flowers', cell('flowers', 'chapter1'))).toBeNull()
    expect(item('lily', cell('flowers', 'chapter1'))).toBeTruthy()
    expect(item('rose', cell('flowers', 'chapter1'))).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })
})
