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

const sections = [{ id: 's1', title: 'S.S.D.D.' }, { id: 's2', title: 'Wolverines!' }, { id: 's3', title: 'Cleanup' }]
const trophy = (id, title, extra = {}) => ({ id, title, done: false, ...extra })
const task = (id, trophyId, sectionIds = [], extra = {}) => ({ id, title: id, trophyId, sectionIds, ...extra })
const huntWith = ({ trophies, items = [], sections: chosenSections = sections }) => ({
  _id: 'hunt', userId: 'user', gameId: 'game', platformId: 'ps5', service: 'playstation',
  notebook: repairMainSections(normalizeNotebook({ formatVersion: 2, revision: 0, trophies, items, sections: chosenSections })),
})
const chooseGrid = () => fireEvent.click(screen.getByRole('button', { name: 'Grid', exact: true }))
const chooseFilter = value => fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value } })
const stack = sectionId => document.querySelector(`td[data-compact-section-id="${sectionId}"]`)
const card = (trophyId, sectionId) => document.querySelector(`.notebook-grid-card[data-trophy-id="${trophyId}"][data-section-id="${sectionId}"]`)
const cardIds = sectionId => [...stack(sectionId).querySelectorAll('.notebook-grid-card')].map(entry => entry.dataset.trophyId)
const regularCell = (trophyId, sectionId) => document.querySelector(`td[data-trophy-id="${trophyId}"][data-section-id="${sectionId}"]`)
const regularIds = () => [...document.querySelectorAll('.notebook-grid tbody > tr > th [data-group-kind="trophies"]')].map(entry => entry.dataset.groupId)
const saved = () => api.mock.calls.at(-1)[2]
async function expectSaves(count = 1) {
  await waitFor(() => expect(api).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy())
}
function drop(source, label, destination, y = 50) {
  const handle = within(source).getByRole('button', { name: label, exact: true })
  const dataTransfer = { setData: vi.fn(), effectAllowed: '', dropEffect: '' }
  fireEvent.dragStart(handle, { dataTransfer })
  destination.getBoundingClientRect = () => ({ left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100 })
  for (const type of ['dragOver', 'drop']) {
    const event = createEvent[type](destination, { dataTransfer })
    Object.defineProperties(event, { clientX: { value: 100 }, clientY: { value: y } })
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

describe('compact single-objective Grid trophies', () => {
  it('keeps multi-task rows first and packs Silent Skies immediately below them in its own section', () => {
    const hunt = huntWith({
      trophies: [
        trophy('intel', 'All Intel'),
        trophy('clown', 'Clown in Training', { done: true, sectionIds: ['s1'] }),
        trophy('immortal', 'Immortal'),
        trophy('pit', 'Pit Boss', { done: true, sectionIds: ['s1'] }),
        trophy('precognitive', 'Precognitive Paranoia', { sectionIds: ['s1'] }),
        trophy('silent', 'Silent Skies', { sectionIds: ['s2'] }),
      ],
      items: [task('Intel 1', 'intel', ['s1']), task('Intel 2', 'intel', ['s2']), task('Mission 1', 'immortal', ['s1']), task('Mission 2', 'immortal', ['s2'])],
    })
    render(<Notebook hunt={hunt} />)
    chooseGrid()
    expect(regularIds()).toEqual(['intel', 'immortal'])
    expect(cardIds('s1')).toEqual(['clown', 'pit', 'precognitive'])
    expect(cardIds('s2')).toEqual(['silent'])
    expect(cardIds('')).toEqual([])
    expect([...document.querySelectorAll('tbody > tr')].at(-1)).toBe(card('silent', 's2').closest('tr'))
    expect(regularCell('silent', 's2')).toBeNull()
    expect(within(card('silent', 's2')).getByRole('checkbox', { name: 'Trophy earned: Silent Skies' }).checked).toBe(false)
    expect(within(card('clown', 's1')).getByRole('checkbox', { name: 'Trophy earned: Clown in Training' }).checked).toBe(true)
    expect(api).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it.each([{ label: 'no sections', chosenSections: [] }, { label: 'with sections', chosenSections: sections }])('removes the Trophy column when all trophies are single objectives ($label)', ({ chosenSections }) => {
    render(<Notebook hunt={huntWith({ trophies: [trophy('a', 'Unfinished'), trophy('b', 'Finished', { done: true })], sections: chosenSections })} />)
    chooseGrid()
    expect(screen.queryByRole('columnheader', { name: 'Trophy', exact: true })).toBeNull()
    expect(screen.getAllByRole('columnheader')).toHaveLength(chosenSections.length + 1)
    expect(regularIds()).toEqual([])
    expect(cardIds('')).toEqual(['a', 'b'])
    expect(within(card('a', '')).getByRole('button', { name: 'Delete trophy Unfinished' })).toBeTruthy()
    expect(within(card('a', '')).getByRole('button', { name: 'Edit trophy Unfinished' })).toBeTruthy()
  })

  it('counts leaf objectives rather than hierarchy records or counter target units', () => {
    render(<Notebook hunt={huntWith({
      trophies: [trophy('nested', 'Nested'), trophy('counter', 'Counter', { type: 'counter', target: 10 }), trophy('combined', 'Counter and task', { type: 'counter', target: 10 })],
      items: [task('Parent', 'nested'), task('Leaf', 'nested', [], { parentId: 'Parent' }), task('Extra task', 'combined')],
    })} />)
    chooseGrid()
    expect(regularIds()).toEqual(['combined'])
    expect(cardIds('')).toEqual(['nested', 'counter'])
    expect(within(card('nested', '')).getByRole('checkbox', { name: 'Leaf', exact: true })).toBeTruthy()
    expect(within(card('nested', '')).queryByRole('checkbox', { name: 'Parent', exact: true })).toBeNull()
    expect(within(card('counter', '')).getByText('0 / 10')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Task completion' })).getByText('0 / 4')).toBeTruthy()
  })

  it('projects inherited, direct, and unlinked objectives without duplicating total progress', () => {
    render(<Notebook hunt={huntWith({
      trophies: [trophy('linked', 'Linked', { sectionIds: ['s1', 's2'] }), trophy('independent', 'Independent', { sectionIds: ['s1'] }), trophy('unlinked', 'Unlinked')],
      items: [task('Branch', 'linked'), task('Inherited leaf', 'linked', [], { parentId: 'Branch' }), task('Independent leaf', 'independent', ['s3'], { inheritTrophySections: false })],
    })} />)
    chooseGrid()
    expect(cardIds('s1')).toEqual(['linked'])
    expect(cardIds('s2')).toEqual(['linked'])
    expect(cardIds('s3')).toEqual(['independent'])
    expect(cardIds('')).toEqual(['unlinked'])
    expect(within(card('linked', 's1')).getByText('Inherited section link')).toBeTruthy()
    expect(within(screen.getByRole('group', { name: 'Task completion' })).getByText('0 / 3')).toBeTruthy()
    expect(api).not.toHaveBeenCalled()
  })

  it('filters compact cards without gaps and does not reclassify multi-task trophies', () => {
    render(<Notebook hunt={huntWith({
      trophies: [trophy('multi', 'Several tasks'), trophy('complete', 'Complete', { done: true, sectionIds: ['s1'] }), trophy('remaining', 'Remaining', { sectionIds: ['s1'], missable: true }), trophy('award', 'Award pending', { type: 'counter', target: 4, current: 4, sectionIds: ['s1'] })],
      items: [task('Done task', 'multi', ['s1'], { done: true }), task('Remaining task', 'multi', ['s1'], { missable: true })],
    })} />)
    chooseGrid()
    chooseFilter('remaining')
    expect(regularIds()).toEqual(['multi'])
    expect(cardIds('s1')).toEqual(['remaining', 'award'])
    expect(within(regularCell('multi', 's1')).queryByRole('checkbox', { name: 'Done task', exact: true })).toBeNull()
    expect(within(regularCell('multi', 's1')).getByRole('checkbox', { name: 'Remaining task', exact: true })).toBeTruthy()
    chooseFilter('missable')
    expect(regularIds()).toEqual(['multi'])
    expect(cardIds('s1')).toEqual(['remaining'])
    chooseFilter('all')
    expect(cardIds('s1')).toEqual(['complete', 'remaining', 'award'])
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps the task and trophy award independent across every compact projection', async () => {
    render(<Notebook hunt={huntWith({ trophies: [trophy('one', 'One task', { sectionIds: ['s1', 's2'] })], items: [task('Collect item', 'one')] })} />)
    chooseGrid()
    fireEvent.click(within(card('one', 's1')).getByRole('checkbox', { name: 'Collect item', exact: true }))
    await expectSaves()
    expect(saved().trophies[0].done).toBe(false)
    expect(saved().items[0].done).toBe(true)
    expect(within(card('one', 's2')).getByRole('checkbox', { name: 'Collect item', exact: true }).checked).toBe(true)
    fireEvent.click(within(card('one', 's2')).getByRole('checkbox', { name: 'Trophy earned: One task' }))
    await expectSaves(2)
    expect(saved().trophies[0].done).toBe(true)
    expect(saved().items[0].done).toBe(true)
    fireEvent.click(within(card('one', 's1')).getByRole('checkbox', { name: 'Collect item', exact: true }))
    await expectSaves(3)
    expect(saved().trophies[0].done).toBe(true)
    expect(saved().items[0].done).toBe(false)
    expect(within(card('one', 's2')).getByRole('checkbox', { name: 'Collect item', exact: true }).checked).toBe(false)
  })

  it('moves a compact trophy to a full row when another objective is added and compacts again after removal', async () => {
    const hunt = huntWith({ trophies: [trophy('one', 'One task', { sectionIds: ['s1'] })], items: [task('Original task', 'one')] })
    const view = render(<Notebook hunt={hunt} />)
    chooseGrid()
    fireEvent.click(within(card('one', 's1')).getByRole('button', { name: 'Add tasks for One task in S.S.D.D.' }))
    fireEvent.change(screen.getByLabelText('Tasks (one per line)'), { target: { value: 'Another task' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await expectSaves()
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(regularIds()).toEqual(['one'])
    expect(card('one', 's1')).toBeNull()
    expect(within(regularCell('one', 's1')).getByRole('checkbox', { name: 'Another task', exact: true })).toBeTruthy()
    const refreshed = { ...saved(), revision: saved().revision + 2, items: saved().items.filter(entry => entry.title !== 'Another task') }
    view.rerender(<Notebook hunt={{ ...hunt, notebook: refreshed }} />)
    await waitFor(() => expect(card('one', 's1')).toBeTruthy())
    expect(regularIds()).toEqual([])
    expect(screen.queryByRole('columnheader', { name: 'Trophy', exact: true })).toBeNull()
    expect(api).toHaveBeenCalledTimes(1)
  })

  it('links a dragged leaf through shared section space without changing its trophy or parent', async () => {
    render(<Notebook hunt={huntWith({ trophies: [trophy('one', 'One task')], items: [task('Branch', 'one', ['s1']), task('Leaf', 'one', [], { parentId: 'Branch' })] })} />)
    chooseGrid()
    drop(card('one', 's1'), 'Drag Leaf', stack('s2'))
    await expectSaves()
    expect(saved().items.find(entry => entry.id === 'Leaf')).toMatchObject({ trophyId: 'one', parentId: 'Branch', sectionIds: ['s2'] })
    expect(card('one', 's1')).toBeTruthy()
    expect(card('one', 's2')).toBeTruthy()
  })

  it('links trophies from shared section space and reorders them through compact trophy headers', async () => {
    render(<Notebook hunt={huntWith({ trophies: [trophy('a', 'First', { sectionIds: ['s1'] }), trophy('b', 'Second', { sectionIds: ['s1'] })] })} />)
    chooseGrid()
    drop(card('b', 's1'), 'Drag trophy Second', stack('s2'))
    await expectSaves()
    expect(saved().trophies.find(entry => entry.id === 'b').sectionIds).toEqual(['s1', 's2'])
    expect(saved().trophies.map(entry => entry.id)).toEqual(['a', 'b'])
    const destination = card('a', 's1').querySelector('[data-notebook-group-header]')
    drop(card('b', 's1'), 'Drag trophy Second', destination, 10)
    await expectSaves(2)
    expect(saved().trophies.map(entry => entry.id)).toEqual(['b', 'a'])
    expect(cardIds('s1')).toEqual(['b', 'a'])
    expect(cardIds('s2')).toEqual(['b'])
  })

  it('changes ownership only when a leaf is dropped onto a specific compact trophy', async () => {
    render(<Notebook hunt={huntWith({
      trophies: [trophy('source', 'Source'), trophy('destination', 'Destination', { type: 'counter', target: 5, sectionIds: ['s2'] })],
      items: [task('Movable task', 'source', ['s1'])],
    })} />)
    chooseGrid()
    drop(card('source', 's1'), 'Drag Movable task', card('destination', 's2'))
    await expectSaves()
    expect(saved().items[0]).toMatchObject({ trophyId: 'destination', parentId: null, sectionIds: ['s1'] })
    expect(regularIds()).toEqual(['destination'])
    expect(within(regularCell('destination', 's2')).getByRole('checkbox', { name: 'Movable task', exact: true })).toBeTruthy()
    expect(card('source', '')).toBeTruthy()
  })
})
