// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import Notebook from './Notebook'
import { api } from '../lib/api'
import { normalizeNotebook } from '../lib/notebook'

const context = vi.hoisted(() => ({ data: {}, reload: vi.fn(), mutate: vi.fn() }))
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))

const task = (id, extra = {}) => ({ id, title: id, trophyId: 'collector', ...extra })
function fixture({ trophies = [{ id: 'collector', title: 'Collector', done: false, sectionIds: ['chapter'] }], items = [task('First task', { done: true }), task('Last task')], revision = 0 } = {}) {
  return {
    _id: 'collapse-hunt', userId: 'user', gameId: 'game', platformId: 'ps5', service: 'playstation',
    notebook: normalizeNotebook({ formatVersion: 2, revision, trophies, sections: [{ id: 'chapter', title: 'Chapter 1' }], items }),
  }
}
const draftKey = 'gamelog-notebook-draft:user:collapse-hunt'
const chooseView = name => fireEvent.click(screen.getByRole('button', { name, exact: true }))
const chooseFilter = value => fireEvent.change(screen.getByRole('combobox', { name: 'Notebook filter' }), { target: { value } })
const saved = () => api.mock.calls.at(-1)[2]
const collapseButton = (title = 'Collector') => screen.getByRole('button', { name: `Collapse trophy ${title}`, exact: true })
const expandButton = (title = 'Collector') => screen.getByRole('button', { name: `Expand trophy ${title}`, exact: true })
async function expectSaves(count = 1) {
  await waitFor(() => expect(api).toHaveBeenCalledTimes(count))
  await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy())
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

describe('completed trophy defaults in General', () => {
  it('initially collapses completed subtasks and allows expanding without saving', () => {
    render(<Notebook hunt={fixture({ items: [task('Finished task', { done: true })] })} />)
    const toggle = expandButton()
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(document.getElementById(toggle.getAttribute('aria-controls')).hidden).toBe(true)
    expect(screen.queryByRole('checkbox', { name: 'Finished task', exact: true })).toBeNull()
    expect(screen.getByRole('checkbox', { name: 'Trophy earned: Collector' }).checked).toBe(false)
    fireEvent.click(toggle)
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true }).checked).toBe(true)
    expect(api).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })

  it('leaves incomplete subtasks expanded and gives empty trophies no collapse control', () => {
    render(<Notebook hunt={fixture({ trophies: [
      { id: 'collector', title: 'Collector', done: true },
      { id: 'empty', title: 'Empty trophy', type: 'counter', current: 5, target: 5, done: true },
    ] })} />)
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Last task', exact: true }).checked).toBe(false)
    expect(screen.queryByRole('button', { name: /(?:Collapse|Expand) trophy Empty trophy/ })).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('uses nested leaf and counter completion despite stale parent flags and unfinished trophy tracking', () => {
    render(<Notebook hunt={fixture({
      trophies: [
        { id: 'collector', title: 'Collector', type: 'counter', current: 0, target: 10, done: false },
        { id: 'unfinished', title: 'Unfinished', type: 'counter', current: 10, target: 10, done: true },
      ],
      items: [
        task('Stale unfinished parent', { type: 'counter', target: 20, current: 0, done: false }),
        task('Nested checkbox', { parentId: 'Stale unfinished parent', done: true }),
        task('Nested counter', { parentId: 'Stale unfinished parent', type: 'counter', target: 3, current: 3, done: false }),
        task('Stale finished parent', { trophyId: 'unfinished', done: true }),
        task('Incomplete counter', { trophyId: 'unfinished', parentId: 'Stale finished parent', type: 'counter', target: 3, current: 2, done: true }),
      ],
    })} />)
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    expect(collapseButton('Unfinished').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Incomplete counter', exact: true }).checked).toBe(false)
    expect(screen.queryByRole('checkbox', { name: 'Nested counter', exact: true })).toBeNull()
    fireEvent.click(expandButton())
    expect(screen.getByRole('checkbox', { name: 'Nested counter', exact: true }).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Increase trophy Collector' }).disabled).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })

  it('does not infer completion from the tasks left visible by a filter', () => {
    render(<Notebook hunt={fixture({ items: [task('Finished missable task', { done: true, missable: true }), task('Hidden incomplete task')] })} />)
    chooseFilter('missable')
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Finished missable task', exact: true }).checked).toBe(true)
    expect(screen.queryByRole('checkbox', { name: 'Hidden incomplete task', exact: true })).toBeNull()
    chooseFilter('remaining')
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Hidden incomplete task', exact: true }).checked).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })

  it('limits the automatic default to General while Sections and Grid show completed tasks', () => {
    render(<Notebook hunt={fixture({ items: [task('Finished task', { done: true })] })} />)
    expect(expandButton()).toBeTruthy()
    chooseView('Sections')
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true }).checked).toBe(true)
    chooseView('Grid')
    expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true }).checked).toBe(true)
    chooseView('General')
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('checkbox', { name: 'Finished task', exact: true })).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('automatically collapses after the final task completes and permits manually reopening it', async () => {
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Last task', exact: true }))
    await expectSaves()
    expect(saved().items.every(item => item.done)).toBe(true)
    expect(saved().trophies[0].done).toBe(false)
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('checkbox', { name: 'Last task', exact: true })).toBeNull()
    fireEvent.click(expandButton())
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Last task', exact: true }).checked).toBe(true)
    expect(api).toHaveBeenCalledTimes(1)
    expect(sessionStorage.length).toBe(0)
  })

  it('recomputes an untouched default as newer notebook revisions change completion', async () => {
    const hunt = fixture()
    const view = render(<Notebook hunt={hunt} />)
    expect(collapseButton()).toBeTruthy()
    const complete = { ...hunt.notebook, revision: 1, items: hunt.notebook.items.map(item => ({ ...item, done: true })) }
    view.rerender(<Notebook hunt={{ ...hunt, notebook: complete }} />)
    await waitFor(() => expect(expandButton().getAttribute('aria-expanded')).toBe('false'))
    const reopened = { ...complete, revision: 2, items: complete.items.map(item => ({ ...item, done: false })) }
    view.rerender(<Notebook hunt={{ ...hunt, notebook: reopened }} />)
    await waitFor(() => expect(collapseButton().getAttribute('aria-expanded')).toBe('true'))
    expect(screen.getByRole('checkbox', { name: 'Last task', exact: true }).checked).toBe(false)
    expect(api).not.toHaveBeenCalled()
  })

  it('preserves a manual expansion across mode switches, rerenders, and subsequent completion changes', async () => {
    const hunt = fixture({ items: [task('Finished task', { done: true })] })
    const view = render(<Notebook hunt={hunt} />)
    fireEvent.click(expandButton())
    chooseView('Sections')
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    chooseView('Grid')
    expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true })).toBeTruthy()
    chooseView('General')
    view.rerender(<Notebook hunt={{ ...hunt, notebook: { ...hunt.notebook, revision: 1 } }} />)
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    const incomplete = { ...hunt.notebook, revision: 2, items: hunt.notebook.items.map(item => ({ ...item, done: false })) }
    view.rerender(<Notebook hunt={{ ...hunt, notebook: incomplete }} />)
    await waitFor(() => expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true }).checked).toBe(false))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Finished task', exact: true }))
    await expectSaves()
    expect(collapseButton().getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: 'Finished task', exact: true }).checked).toBe(true)
  })

  it('preserves a manual collapse while revisions change tasks and Grid still shows them', async () => {
    const hunt = fixture()
    const view = render(<Notebook hunt={hunt} />)
    fireEvent.click(collapseButton())
    view.rerender(<Notebook hunt={{ ...hunt, notebook: { ...hunt.notebook, revision: 1, items: [...hunt.notebook.items, task('New unfinished task')] } }} />)
    await waitFor(() => expect(within(screen.getByRole('group', { name: 'Task completion' })).getByText('1 / 3')).toBeTruthy())
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    chooseView('Grid')
    expect(screen.getByRole('checkbox', { name: 'New unfinished task', exact: true })).toBeTruthy()
    chooseView('General')
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('checkbox', { name: 'New unfinished task', exact: true })).toBeNull()
    expect(api).not.toHaveBeenCalled()
  })

  it('derives the initial default from restored draft tasks without changing the saved draft', () => {
    const hunt = fixture()
    const draft = { ...hunt.notebook, items: hunt.notebook.items.map(item => ({ ...item, done: true })) }
    const storedDraft = JSON.stringify(draft)
    sessionStorage.setItem(draftKey, storedDraft)
    render(<Notebook hunt={hunt} />)
    expect(screen.getByText(/An unsaved draft was restored/)).toBeTruthy()
    expect(expandButton().getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expandButton())
    expect(screen.getByRole('checkbox', { name: 'Last task', exact: true }).checked).toBe(true)
    expect(sessionStorage.getItem(draftKey)).toBe(storedDraft)
    expect(api).not.toHaveBeenCalled()
  })
})
