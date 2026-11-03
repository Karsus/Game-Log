// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import GameDetail from './GameDetail'

const context = vi.hoisted(() => ({ data: {}, user: {}, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))

beforeEach(() => {
  vi.resetAllMocks()
  context.user = { memberships: {} }
  context.data = { games: [{ _id: 'game', title: 'Pragmata', releases: [], genres: [], wishlistPlatforms: [], subscriptions: [] }], copies: [], hunts: [], platforms: [] }
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

function openConfirmation() {
  render(<MemoryRouter initialEntries={['/games/game']}><Routes><Route path="/games/:id" element={<GameDetail />} /><Route path="/games" element={<h1>Game library</h1>} /></Routes></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Delete game' }))
  return screen.getByRole('dialog', { name: 'Delete Pragmata?' })
}

it('returns to the library after successful deletion', async () => {
  context.mutate.mockResolvedValue({ ok: true })
  const dialog = openConfirmation()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Game library' })).toBeTruthy())
  expect(context.mutate).toHaveBeenCalledWith('/games/game', 'DELETE')
  expect(screen.queryByRole('dialog')).toBeNull()
})

it('keeps confirmation open after partial cleanup failure and allows retry', async () => {
  context.mutate.mockRejectedValueOnce(new Error('Some related records may have been deleted. Reload the page and retry deleting this game.')).mockResolvedValueOnce({ ok: true })
  const dialog = openConfirmation()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  await waitFor(() => expect(within(dialog).getByRole('alert').textContent).toContain('Reload the page'))
  expect(dialog.open).toBe(true)
  expect(screen.getByRole('heading', { name: 'Pragmata', exact: true })).toBeTruthy()
  expect(within(dialog).getByRole('button', { name: 'Delete', exact: true }).disabled).toBe(false)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Delete', exact: true }))
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Game library' })).toBeTruthy())
  expect(context.mutate).toHaveBeenCalledTimes(2)
})
