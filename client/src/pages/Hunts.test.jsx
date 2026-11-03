// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Hunts, { DifficultyColumn } from './Hunts'
import { download } from '../lib/api'
const context = vi.hoisted(() => ({ data: null, user: { preferences: {} }, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/api', async importOriginal => ({ ...await importOriginal(), download: vi.fn() }))
const makeGame = (id, title) => ({ _id: id, title, releases: [{ platformId: 'ps5' }], wishlistPlatforms: [], showOnBoard: true })
const makeHunt = (id, gameId, difficulty, status) => ({ _id: id, gameId, platformId: 'ps5', service: 'playstation', expectedDifficulty: difficulty, expectedHours: 12.5, status, hasAchievements: true, hasPlatinum: true, goal: 'platinum', earned: 3, total: 40, completion: { platinum: false }, createdAt: '2026-10-29', notebook: { revision: 0, sections: [], items: [] } })
beforeEach(() => {
  vi.clearAllMocks()
  context.user = { preferences: {} }
  context.data = { games: [makeGame('g1', 'First game'), makeGame('g2', 'Second game')], hunts: [makeHunt('h1', 'g1', 2, 'priority'), makeHunt('h2', 'g2', 3, 'dropped')], copies: [], platforms: [{ _id: 'ps5', name: 'PlayStation 5', service: 'playstation' }] }
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)
it('keeps the board read-only and opens editing in a dialog', () => {
  render(<MemoryRouter><Hunts /></MemoryRouter>)
  const board = screen.getByLabelText('Hunts grouped by difficulty')
  expect(board.querySelectorAll('input, select, textarea')).toHaveLength(0)
  expect(within(board).getByRole('link', { name: 'First game' }).getAttribute('href')).toBe('/hunts/h1')
  expect(within(board).getByRole('article', { name: 'First game' }).classList.contains('priority')).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Edit First game hunt' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByLabelText('Expected difficulty / 10').step).toBe('1')
  expect(within(dialog).getByLabelText('Expected time to complete (hours)').value).toBe('12.5')
  expect(board.querySelectorAll('input, select, textarea')).toHaveLength(0)
})
it('collapses a difficulty without moving its games to other groups', () => {
  render(<MemoryRouter><Hunts /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Collapse difficulty 2' }))
  expect(screen.queryByRole('link', { name: 'First game' })).toBeNull()
  expect(screen.getByRole('region', { name: 'Difficulty 2' })).toBeTruthy()
  expect(screen.getByRole('link', { name: 'Second game' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Expand difficulty 2' }))
  expect(screen.getByRole('link', { name: 'First game' })).toBeTruthy()
})
it('supports hundreds of read-only rows and unmounts a collapsed list', () => {
  const rows = Array.from({ length: 300 }, (_, i) => ({ ...makeHunt(`h${i}`, `g${i}`, 4, 'in-progress'), game: makeGame(`g${i}`, `Game ${i}`), owned: true }))
  render(<MemoryRouter><DifficultyColumn group={{ difficulty: '4', rows }} onEdit={vi.fn()} /></MemoryRouter>)
  expect(screen.getAllByRole('article')).toHaveLength(300)
  expect(screen.queryByRole('spinbutton')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Collapse difficulty 4' }))
  expect(screen.queryAllByRole('article')).toHaveLength(0)
  expect(screen.getByText('300')).toBeTruthy()
})

it('shows only active subscription access across hunt platforms and preserves all source filters', () => {
  context.user.memberships = { timeZone: 'UTC', gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'ps-plus-basic', activeUntil: '2026-11-01' } }
  context.membershipNow = Date.parse('2026-11-01T18:00:00Z')
  context.data.user = context.user
  context.data.games[0].subscriptions = [{ service: 'ps-plus-basic' }, { service: 'game-pass-ultimate' }]
  context.data.games[1].subscriptions = [{ service: 'ps-plus-premium' }]
  context.data.platforms.push({ _id: 'pc', name: 'PC', service: 'steam' })
  context.data.hunts.push({ ...makeHunt('pc-hunt', 'g1', 5, 'planned'), platformId: 'pc', service: 'steam' })
  const { rerender } = render(<MemoryRouter><Hunts /></MemoryRouter>)
  const basicColumn = screen.getByRole('region', { name: 'Difficulty 2' }), pcColumn = screen.getByRole('region', { name: 'Difficulty 5' })
  expect(within(basicColumn).getByText('PS Plus Basic · Active')).toBeTruthy()
  expect(within(pcColumn).getByText('PS Plus Basic · Active')).toBeTruthy()
  expect(screen.queryByText(/· Inactive/)).toBeNull()
  expect(screen.queryByText(/Game Pass Ultimate ·/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }))
  expect(download.mock.calls[0][1]).toContain('PS Plus Basic · Active')
  expect(download.mock.calls[0][1]).not.toContain('Inactive')
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'ps-plus-premium' } })
  expect(screen.getByRole('article', { name: 'Second game' })).toBeTruthy()
  expect(screen.queryByRole('article', { name: 'First game' })).toBeNull()
  fireEvent.change(screen.getByLabelText('Ownership filter'), { target: { value: 'subscription' } })
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.getByRole('region', { name: 'Difficulty 5' })).toBeTruthy()
  context.membershipNow = Date.parse('2026-11-02T00:00:00Z')
  rerender(<MemoryRouter><Hunts /></MemoryRouter>)
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByText(/PS Plus Basic ·/)).toBeNull()
  expect(screen.getAllByText('3/40')).toHaveLength(3)
})

it('exports date-added values as day/month/year in the account time zone without changing records', () => {
  context.user.memberships = { timeZone: 'America/Mexico_City' }
  context.data.hunts[0].createdAt = '2027-04-08T02:00:00Z'
  const before = structuredClone(context.data)
  render(<MemoryRouter><Hunts /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Export', exact: true }))
  const exported = download.mock.calls[0][1]
  expect(exported).toContain('07/04/2027')
  expect(exported).toContain('29/10/2026')
  expect(exported).not.toContain('2027-04-08T02:00:00Z')
  expect(context.data).toEqual(before)
})
