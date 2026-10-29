// @vitest-environment jsdom
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Notebook from './Notebook'
import { api } from '../lib/api'
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => ({ data: { games: [], hunts: [], platforms: [] }, reload: vi.fn().mockResolvedValue({}), mutate: vi.fn() }) }))
const fixture = () => ({ _id: 'hunt', notebook: { revision: 0, sections: [{ id: 'chapter1', title: 'Chapter 1' }], items: [{ id: 'one', sectionId: 'chapter1', parentId: null, title: 'Find the silver token', category: 'Treasures', type: 'checkbox', done: false, current: 0, target: 1, notes: '', url: '', missable: false }] } })
beforeEach(() => { vi.clearAllMocks(); sessionStorage.clear(); HTMLDialogElement.prototype.showModal = function () { this.open = true }; HTMLDialogElement.prototype.close = function () { this.open = false } })
afterEach(cleanup)
describe('notebook interaction', () => {
  it('shows the same saved completion in list and chapter grid', async () => {
    api.mockImplementation(async (path, method, body) => ({ notebook: { ...body, revision: body.revision + 1 } }))
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Find the silver token' }))
    await waitFor(() => expect(screen.getByText('All changes saved')).toBeTruthy())
    expect(api.mock.calls[0][2].items[0].done).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Chapter grid' }))
    expect(screen.getByRole('checkbox', { name: 'Find the silver token' }).checked).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Find the silver token' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
    expect(api.mock.calls[1][2].revision).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'List', exact: true }))
    expect(screen.getByRole('checkbox', { name: 'Find the silver token' }).checked).toBe(false)
  })
  it('keeps an unsaved draft visible when a save fails', async () => {
    api.mockRejectedValue(new Error('Network unavailable'))
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Find the silver token' }))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Network unavailable'))
    expect(screen.getByRole('checkbox', { name: 'Find the silver token' }).checked).toBe(true)
    expect(screen.getByRole('button', { name: 'Retry saving' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Download unsaved draft' })).toBeTruthy()
    cleanup()
    render(<Notebook hunt={fixture()} />)
    expect(screen.getByRole('alert').textContent).toContain('unsaved draft was restored')
    expect(screen.getByRole('checkbox', { name: 'Find the silver token' }).checked).toBe(true)
  })
  it('creates multiple individual items from bulk paste', async () => {
    api.mockImplementation(async (path, method, body) => ({ notebook: { ...body, revision: body.revision + 1 } }))
    render(<Notebook hunt={fixture()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Add items', exact: true }))
    fireEvent.change(screen.getByLabelText('Items (one per line)'), { target: { value: 'Flower one\nFlower two\n\nFlower three' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
    await waitFor(() => expect(api).toHaveBeenCalledTimes(1))
    expect(api.mock.calls[0][2].items.map(i => i.title)).toEqual(['Find the silver token', 'Flower one', 'Flower two', 'Flower three'])
  })
})
