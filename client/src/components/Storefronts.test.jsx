// @vitest-environment jsdom
import React from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { CopyEditor } from './editors'
import GameDetail from '../pages/GameDetail'

const context = vi.hoisted(() => ({ data: {}, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
const game = { _id: 'game-1', title: 'Storefront example', releases: [{ platformId: 'pc' }], genres: [], wishlistPlatforms: [], subscriptions: [] }
beforeEach(() => {
  context.mutate.mockReset().mockResolvedValue({})
  context.data = { platforms: [{ _id: 'pc', name: 'PC' }], games: [game], copies: [], hunts: [] }
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

it.each([
  ['steam', 'Steam'], ['xbox-store', 'Xbox Store'], ['gog', 'GOG'], ['epic-store', 'Epic Store'],
])('saves %s from the storefront dropdown as a stable ID', async (id, label) => {
  const close = vi.fn()
  render(<CopyEditor game={game} onClose={close} />)
  const field = screen.getByRole('combobox', { name: 'Store / storefront' })
  expect(screen.getByRole('option', { name: label }).value).toBe(id)
  fireEvent.change(screen.getByLabelText('Format'), { target: { value: 'digital' } })
  fireEvent.change(field, { target: { value: id } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0]).toEqual(['/copies', 'POST', expect.objectContaining({ storefront: id, storefrontOther: '', format: 'digital', platformId: 'pc' }), 'Copy saved'])
})

it('edits a legacy alias using the matching choice and preserves copy details', async () => {
  const close = vi.fn()
  render(<CopyEditor game={game} copy={{ _id: 'copy-1', storefront: ' EPIC Games Store ', edition: 'Deluxe', notes: 'Keep this', state: 'lent' }} onClose={close} />)
  expect(screen.getByLabelText('Store / storefront').value).toBe('epic-store')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0].slice(0, 2)).toEqual(['/copies/copy-1', 'PATCH'])
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ storefront: 'epic-store', storefrontOther: '', edition: 'Deluxe', notes: 'Keep this', state: 'lent' })
})

it('preserves an existing custom shop under Other and keeps the draft after a failed save', async () => {
  const close = vi.fn()
  context.mutate.mockRejectedValueOnce(new Error('Try again'))
  render(<CopyEditor game={game} copy={{ _id: 'copy-1', storefront: 'Local game shop' }} onClose={close} />)
  expect(screen.getByLabelText('Store / storefront').value).toBe('other')
  expect(screen.getByLabelText('Store name').value).toBe('Local game shop')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await screen.findByText('Try again')
  expect(close).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Store name').value).toBe('Local game shop')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[1][2]).toMatchObject({ storefront: 'other', storefrontOther: 'Local game shop' })
})

it.each(['steam', ''])('clears the saved custom name when changing Other to "%s"', async storefront => {
  const close = vi.fn()
  render(<CopyEditor game={game} copy={{ _id: 'copy-1', storefront: 'other', storefrontOther: 'Local game shop' }} onClose={close} />)
  fireEvent.change(screen.getByLabelText('Store / storefront'), { target: { value: storefront } })
  expect(screen.queryByLabelText('Store name')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ storefront, storefrontOther: '' })
})

it('requires a custom store name only when Other is selected', async () => {
  const close = vi.fn()
  render(<CopyEditor game={game} onClose={close} />)
  fireEvent.change(screen.getByLabelText('Store / storefront'), { target: { value: 'other' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(context.mutate).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Store name'), { target: { value: '  Local game shop  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ storefront: 'other', storefrontOther: 'Local game shop' })
})

it('shows readable store labels and custom names in the owned copies table', () => {
  context.data.copies = [
    { _id: 'copy-1', gameId: game._id, platformId: 'pc', storefront: 'xbox-store', format: 'digital', state: 'owned' },
    { _id: 'copy-2', gameId: game._id, platformId: 'pc', storefront: 'other', storefrontOther: 'Local game shop', format: 'physical', state: 'owned' },
  ]
  render(<MemoryRouter initialEntries={['/games/game-1']}><Routes><Route path="/games/:id" element={<GameDetail />} /></Routes></MemoryRouter>)
  expect(screen.getByText('Xbox Store')).toBeTruthy()
  expect(screen.getByText('Local game shop')).toBeTruthy()
  expect(screen.queryByText('xbox-store')).toBeNull()
})
