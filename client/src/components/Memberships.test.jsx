// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Memberships from './Memberships'

const context = vi.hoisted(() => ({ user: null, membershipNow: Date.UTC(2026, 10, 1, 18), saveMemberships: vi.fn(), notify: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/memberships', async importOriginal => ({ ...await importOriginal(), browserTimeZone: () => 'America/Mexico_City' }))
const memberships = (patch = {}) => ({ timeZone: null, gamePass: { tier: 'none', activeUntil: null }, psPlus: { tier: 'none', activeUntil: null }, ...patch })
beforeEach(() => {
  vi.clearAllMocks()
  context.user = { memberships: memberships() }
  context.saveMemberships.mockImplementation(async value => { context.user = { ...context.user, memberships: structuredClone(value) }; return context.user })
})
afterEach(cleanup)

it('starts inactive with no memberships and initializes the draft time zone from the browser', () => {
  render(<Memberships />)
  expect(screen.getByLabelText('Game Pass tier').value).toBe('none')
  expect(screen.getByLabelText('PS Plus tier').value).toBe('none')
  expect(screen.getAllByText('Inactive')).toHaveLength(2)
  expect(screen.getByText('America/Mexico_City', { exact: true })).toBeTruthy()
  expect(screen.getByLabelText('Game Pass active through').disabled).toBe(true)
  expect(context.saveMemberships).not.toHaveBeenCalled()
})

it('saves the selected tiers and inclusive end date only after explicit save', async () => {
  render(<Memberships />)
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'game-pass-ultimate' } })
  fireEvent.change(screen.getByLabelText('Game Pass active through'), { target: { value: '2026-11-01' } })
  fireEvent.change(screen.getByLabelText('PS Plus tier'), { target: { value: 'ps-plus-premium' } })
  expect(screen.getAllByText('Inactive')).toHaveLength(2)
  expect(context.saveMemberships).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save subscriptions' }))
  await waitFor(() => expect(context.notify).toHaveBeenCalledWith('Subscription settings saved'))
  expect(context.saveMemberships).toHaveBeenCalledWith({ timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: '2026-11-01' }, psPlus: { tier: 'ps-plus-premium', activeUntil: null } })
  expect(screen.getAllByText('Active', { exact: true })).toHaveLength(2)
})

it('keeps failed drafts visible without promising active access', async () => {
  context.saveMemberships.mockRejectedValueOnce(new Error('Could not save memberships'))
  render(<Memberships />)
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'game-pass-pc' } })
  fireEvent.change(screen.getByLabelText('Game Pass active through'), { target: { value: '2026-12-01' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save subscriptions' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Could not save memberships'))
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-pc')
  expect(screen.getByLabelText('Game Pass active through').value).toBe('2026-12-01')
  expect(within(screen.getByRole('region', { name: 'Game Pass membership' })).getByText('Inactive')).toBeTruthy()
  expect(context.notify).not.toHaveBeenCalled()
})

it('converts blank end dates to null and uses the stored time zone until explicitly changed', async () => {
  context.user.memberships = memberships({ timeZone: 'Asia/Tokyo', psPlus: { tier: 'ps-plus-basic', activeUntil: '2026-11-03' } })
  render(<Memberships />)
  expect(screen.getByText('Asia/Tokyo', { exact: true })).toBeTruthy()
  fireEvent.change(screen.getByLabelText('PS Plus active through'), { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Use browser time zone' }))
  fireEvent.click(screen.getByRole('button', { name: 'Save subscriptions' }))
  await waitFor(() => expect(context.notify).toHaveBeenCalledOnce())
  expect(context.saveMemberships.mock.calls[0][0]).toMatchObject({ timeZone: 'America/Mexico_City', psPlus: { tier: 'ps-plus-basic', activeUntil: null } })
})

it('refreshes clean drafts from saved changes and preserves drafts that have unsaved edits', () => {
  const { rerender } = render(<Memberships />)
  context.user = { memberships: memberships({ timeZone: 'UTC', gamePass: { tier: 'game-pass-essential', activeUntil: null } }) }
  rerender(<Memberships />)
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-essential')
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'game-pass-premium' } })
  context.user = { memberships: memberships({ timeZone: 'UTC', gamePass: { tier: 'game-pass-ultimate', activeUntil: '2026-10-31' } }) }
  rerender(<Memberships />)
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-premium')
  expect(within(screen.getByRole('region', { name: 'Game Pass membership' })).getByText('Expired')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }))
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-ultimate')
  expect(screen.getByLabelText('Game Pass active through').value).toBe('2026-10-31')
})

it('clears an irrelevant end date when a membership is set to None', async () => {
  context.user.memberships = memberships({ gamePass: { tier: 'game-pass-ultimate', activeUntil: '2026-11-03' } })
  render(<Memberships />)
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'none' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save subscriptions' }))
  await waitFor(() => expect(context.notify).toHaveBeenCalledOnce())
  expect(context.saveMemberships.mock.calls[0][0].gamePass).toEqual({ tier: 'none', activeUntil: null })
})

it('compares retained drafts against the latest saved memberships after an external update', () => {
  context.user.memberships = memberships({ timeZone: 'UTC', gamePass: { tier: 'game-pass-essential', activeUntil: null } })
  const { rerender } = render(<Memberships />)
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'game-pass-pc' } })
  context.user = { memberships: memberships({ timeZone: 'UTC', gamePass: { tier: 'game-pass-ultimate', activeUntil: null } }) }
  rerender(<Memberships />)
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-pc')
  fireEvent.change(screen.getByLabelText('Game Pass tier'), { target: { value: 'game-pass-essential' } })
  expect(screen.getByRole('button', { name: 'Reset changes' })).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Reset changes' }))
  expect(screen.getByLabelText('Game Pass tier').value).toBe('game-pass-ultimate')
  expect(screen.queryByRole('button', { name: 'Reset changes' })).toBeNull()
  expect(context.saveMemberships).not.toHaveBeenCalled()
})

it('clears the unsaved indicator when an external saved update matches the retained draft', () => {
  context.user.memberships = memberships({ timeZone: 'UTC' })
  const { rerender } = render(<Memberships />)
  fireEvent.change(screen.getByLabelText('PS Plus tier'), { target: { value: 'ps-plus-extra' } })
  expect(screen.getByRole('button', { name: 'Reset changes' })).toBeTruthy()
  context.user = { memberships: memberships({ timeZone: 'UTC', psPlus: { tier: 'ps-plus-extra', activeUntil: null } }) }
  rerender(<Memberships />)
  expect(screen.getByLabelText('PS Plus tier').value).toBe('ps-plus-extra')
  expect(screen.queryByRole('button', { name: 'Reset changes' })).toBeNull()
})
