// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Library from './Library'
import Dashboard from './Dashboard'
import { download } from '../lib/api'

const context = vi.hoisted(() => ({ data: null, user: { name: 'Player One', preferences: {} }, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal(), download: vi.fn() }))
const game = (id, title, subscriptions = []) => ({ _id: id, title, subscriptions, releases: [], genres: [], wishlistPlatforms: [], createdAt: '2026-11-01', rating: null })
beforeEach(() => {
  vi.clearAllMocks()
  context.user = { name: 'Player One', preferences: {} }
  context.membershipNow = Date.parse('2026-11-01T18:00:00Z')
  context.data = {
    platforms: [{ _id: 'ps5', name: 'PlayStation 5' }, { _id: 'pc', name: 'PC' }],
    games: [
      game('monthly', 'Monthly adventure', [{ service: 'ps-plus-basic' }]),
      game('catalog', 'Catalog adventure', [{ service: 'ps-plus-premium' }]),
      game('pass', 'Pass adventure', [{ service: 'game-pass' }]),
    ], copies: [], hunts: [], hardware: [],
  }
})
afterEach(cleanup)

it('shows only active provider badges in cards and keeps source filters independent of membership activity', () => {
  context.user.memberships = { timeZone: 'UTC', gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'ps-plus-basic', activeUntil: null } }
  context.data.games[0].subscriptions.push({ service: 'game-pass-ultimate' })
  render(<MemoryRouter><Library /></MemoryRouter>)
  const card = screen.getByRole('link', { name: /Monthly adventure/ })
  expect(within(card).getByText('PS Plus Basic · Active')).toBeTruthy()
  expect(within(card).queryByText(/Game Pass Ultimate/)).toBeNull()
  expect(screen.queryByText(/· Inactive/)).toBeNull()
  expect(within(card).queryByText('Owned')).toBeNull()
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'ps-plus-basic' } })
  expect(screen.getByRole('link', { name: /Monthly adventure/ })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Catalog adventure/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'ps-plus' } })
  expect(screen.getByRole('link', { name: /Monthly adventure/ })).toBeTruthy()
  expect(screen.getByRole('link', { name: /Catalog adventure/ })).toBeTruthy()
  expect(screen.queryByRole('link', { name: /Pass adventure/ })).toBeNull()
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'owned' } })
  expect(screen.getByText('No games match these filters')).toBeTruthy()
})

it('shows subscription access separately without inventing owned platforms in table view', () => {
  context.data.copies = [{ gameId: 'monthly', platformId: 'pc', state: 'owned', format: 'digital' }]
  render(<MemoryRouter><Library /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Table view' }))
  const monthly = screen.getByRole('row', { name: /Monthly adventure/ }), catalog = screen.getByRole('row', { name: /Catalog adventure/ })
  expect(within(monthly).getByText('Owned')).toBeTruthy()
  expect(within(monthly).getByText('PS Plus Basic · Inactive')).toBeTruthy()
  expect(within(monthly).getByText('PC')).toBeTruthy()
  expect(within(catalog).getByText('PS Plus Premium · Inactive')).toBeTruthy()
  expect(within(catalog).getAllByText('—')).toHaveLength(2)
  expect(within(catalog).queryByText(/Owned/)).toBeNull()
})

it('counts no owned games or copies for a library containing only subscriptions', () => {
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const stat = screen.getByRole('link', { name: /Games owned/ })
  expect(within(stat).getByText('0')).toBeTruthy()
  expect(within(stat).getByText('0 individual copies / licenses')).toBeTruthy()
})

it('counts only active owned copies when a title also has subscription access', () => {
  context.data.copies = [
    { gameId: 'monthly', platformId: 'pc', state: 'owned', format: 'digital' },
    { gameId: 'monthly', platformId: 'ps5', state: 'lent', format: 'physical' },
    { gameId: 'catalog', platformId: 'ps5', state: 'sold', format: 'physical' },
  ]
  render(<MemoryRouter><Dashboard /></MemoryRouter>)
  const stat = screen.getByRole('link', { name: /Games owned/ })
  expect(within(stat).getByText('1')).toBeTruthy()
  expect(within(stat).getByText('2 individual copies / licenses')).toBeTruthy()
})

it('updates source badges after expiration without hiding games or losing ownership', () => {
  context.user.memberships = { timeZone: 'America/Mexico_City', gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'ps-plus-premium', activeUntil: '2026-11-01' } }
  context.data.copies = [{ gameId: 'monthly', platformId: 'pc', state: 'owned', format: 'digital' }]
  const { rerender } = render(<MemoryRouter><Library /></MemoryRouter>)
  expect(within(screen.getByRole('link', { name: /Monthly adventure/ })).getByText('PS Plus Basic · Active')).toBeTruthy()
  expect(within(screen.getByRole('link', { name: /Catalog adventure/ })).getByText('PS Plus Premium · Active')).toBeTruthy()
  context.membershipNow = Date.parse('2026-11-02T06:00:00Z')
  rerender(<MemoryRouter><Library /></MemoryRouter>)
  const monthly = screen.getByRole('link', { name: /Monthly adventure/ })
  expect(within(monthly).getByText('Owned')).toBeTruthy()
  expect(within(monthly).queryByText(/PS Plus Basic/)).toBeNull()
  expect(screen.getByRole('link', { name: /Catalog adventure/ })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'subscription' } })
  expect(screen.getByRole('link', { name: /Pass adventure/ })).toBeTruthy()
})

it('exports each source status while keeping subscription-only ownership as No', () => {
  context.user.memberships = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: null }, psPlus: { tier: 'ps-plus-basic', activeUntil: null } }
  render(<MemoryRouter><Library /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }))
  const exported = download.mock.calls[0][1]
  expect(exported).toContain('PS Plus Basic · Active')
  expect(exported).toContain('PS Plus Premium · Inactive')
  expect(exported).toContain('Game Pass · Active')
  expect(exported).toMatch(/Pass adventure[^\r\n]*No/)
})
