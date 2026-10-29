// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import Hunts, { DifficultyColumn } from './Hunts'
const context = vi.hoisted(() => ({ data: null, user: { preferences: {} }, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
const makeGame = (id, title) => ({ _id: id, title, releases: [{ platformId: 'ps5' }], wishlistPlatforms: [], showOnBoard: true })
const makeHunt = (id, gameId, difficulty, status) => ({ _id: id, gameId, platformId: 'ps5', service: 'playstation', expectedDifficulty: difficulty, expectedHours: 12.5, status, hasAchievements: true, hasPlatinum: true, goal: 'platinum', earned: 3, total: 40, completion: { platinum: false }, createdAt: '2026-10-29', notebook: { revision: 0, sections: [], items: [] } })
beforeEach(() => {
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
