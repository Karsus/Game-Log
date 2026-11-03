// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import Library from './Library'
import GameDetail from './GameDetail'
import Platforms from './Platforms'
import HuntDetail from './HuntDetail'

const context = vi.hoisted(() => ({ data: null, user: null, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../components/Notebook', () => ({ default: () => null }))

beforeEach(() => {
  context.user = { preferences: {}, memberships: { timeZone: 'America/Mexico_City' } }
  context.data = {
    platforms: [{ _id: 'ps5', name: 'PlayStation 5', service: 'playstation', variants: [] }],
    games: [{ _id: 'game', title: 'Date example', releases: [{ platformId: 'ps5' }], genres: [], subscriptions: [], wishlistPlatforms: [], createdAt: '2027-04-08T02:00:00Z' }],
    copies: [{ _id: 'copy', gameId: 'game', platformId: 'ps5', state: 'owned', format: 'physical', acquiredOn: '2027-04-08' }],
    hardware: [{ _id: 'device', nickname: 'Living room PS5', platformId: 'ps5', state: 'owned', acquiredOn: '2027-04-08' }],
    hunts: [{ _id: 'hunt', gameId: 'game', platformId: 'ps5', service: 'playstation', status: 'completed', goal: 'platinum', hasPlatinum: true, completion: { platinum: true, completedOn: '2028-02-29' } }],
  }
})
afterEach(cleanup)

it('shows Added in day/month/year using the account time zone', () => {
  render(<MemoryRouter><Library /></MemoryRouter>)
  fireEvent.click(screen.getByRole('button', { name: 'Table view' }))
  expect(screen.getByRole('cell', { name: '07/04/2027' })).toBeTruthy()
  expect(context.data.games[0].createdAt).toBe('2027-04-08T02:00:00Z')
})

it.each([
  [GameDetail, '/games/game', '/games/:id', '08/04/2027'],
  [Platforms, '/platforms', '/platforms', '08/04/2027'],
  [HuntDetail, '/hunts/hunt', '/hunts/:id', 'Completed 29/02/2028'],
])('formats date-only details without shifting their calendar day', (Component, url, path, expected) => {
  const before = structuredClone(context.data)
  render(<MemoryRouter initialEntries={[url]}><Routes><Route path={path} element={<Component />} /></Routes></MemoryRouter>)
  expect(screen.getByText(expected)).toBeTruthy()
  expect(context.data).toEqual(before)
})
