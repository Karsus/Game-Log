// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { act, cleanup, render, waitFor } from '@testing-library/react'
import { AppProvider, useApp } from './state'
import { api } from './lib/api'
import { defaultMemberships } from './lib/memberships'

vi.mock('./lib/api', () => ({ api: vi.fn() }))
vi.mock('./lib/useMembershipClock', () => ({ useMembershipClock: () => Date.parse('2026-11-01T12:00:00Z') }))
const user = { _id: 'user-1', name: 'Player', preferences: { theme: 'dark' }, memberships: defaultMemberships() }
const initialData = { user, games: [{ _id: 'game-1', subscriptions: [{ service: 'ps-plus-basic' }] }], copies: [], hunts: [{ _id: 'hunt-1', earned: 12 }] }
let context
function Consumer() { context = useApp(); return null }

beforeEach(() => {
  vi.clearAllMocks(); context = undefined
  api.mockImplementation(async path => {
    if (path === '/auth/session') return { user, demoMode: false }
    if (path === '/bootstrap') return initialData
    throw new Error(`Unexpected request: ${path}`)
  })
})
afterEach(cleanup)

it('publishes a saved membership to both user contexts without changing games or progress', async () => {
  render(<AppProvider><Consumer /></AppProvider>)
  await waitFor(() => expect(context.loading).toBe(false))
  const memberships = { ...defaultMemberships('America/Mexico_City'), psPlus: { tier: 'ps-plus-extra', activeUntil: '2026-11-30' } }
  const saved = { ...user, memberships }
  api.mockResolvedValueOnce(saved)
  let result
  await act(async () => { result = await context.saveMemberships(memberships) })
  expect(api).toHaveBeenLastCalledWith('/memberships', 'PUT', memberships)
  expect(api).toHaveBeenCalledTimes(3)
  expect(result).toEqual(saved)
  expect(context.user.memberships).toEqual(memberships)
  expect(context.data.user.memberships).toEqual(memberships)
  expect(context.data.games).toBe(initialData.games)
  expect(context.data.copies).toBe(initialData.copies)
  expect(context.data.hunts).toBe(initialData.hunts)
  expect(context.membershipNow).toBe(Date.parse('2026-11-01T12:00:00Z'))
})

it('keeps the saved membership intact when updating the server fails', async () => {
  render(<AppProvider><Consumer /></AppProvider>)
  await waitFor(() => expect(context.loading).toBe(false))
  const before = context.data
  api.mockRejectedValueOnce(new Error('Could not save memberships'))
  await act(async () => {
    await expect(context.saveMemberships({ ...defaultMemberships('UTC'), gamePass: { tier: 'game-pass-ultimate', activeUntil: null } })).rejects.toThrow('Could not save memberships')
  })
  expect(context.data).toBe(before)
  expect(context.user).toEqual(user)
  expect(context.notice).toBe('')
})

it.each(['preferences', 'memberships'])('keeps both settings when overlapping saves resolve %s first', async first => {
  render(<AppProvider><Consumer /></AppProvider>)
  await waitFor(() => expect(context.loading).toBe(false))
  const memberships = { ...defaultMemberships('UTC'), gamePass: { tier: 'game-pass-ultimate', activeUntil: '2026-12-01' } }
  // Each response deliberately contains the old value of the setting changed by the other request.
  const responses = {
    preferences: { ...user, preferences: { theme: 'light' } },
    memberships: { ...user, memberships },
  }
  const resolve = {}, pending = {}, saves = {}
  for (const key of ['preferences', 'memberships']) pending[key] = new Promise(done => { resolve[key] = done })
  api.mockImplementation(path => pending[path.slice(1)])
  act(() => {
    saves.preferences = context.preferences({ theme: 'light' })
    saves.memberships = context.saveMemberships(memberships)
  })
  const second = first === 'preferences' ? 'memberships' : 'preferences'
  await act(async () => { resolve[first](responses[first]); await saves[first] })
  await act(async () => { resolve[second](responses[second]); await saves[second] })
  const expected = { ...user, preferences: { theme: 'light' }, memberships }
  expect(context.user).toEqual(expected)
  expect(context.data.user).toEqual(expected)
  expect(context.data.games).toBe(initialData.games)
  expect(context.data.hunts).toBe(initialData.hunts)
  expect(await saves.memberships).toEqual(responses.memberships)
})
