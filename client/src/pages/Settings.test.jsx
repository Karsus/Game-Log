// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor, cleanup } from '@testing-library/react'
import Settings from './Settings'
import { api } from '../lib/api'

const context = vi.hoisted(() => ({ user: { name: 'Player', email: 'player@example.test', preferences: { theme: 'dark' } }, data: { metadataAvailable: false }, preferences: vi.fn(), reload: vi.fn(), notify: vi.fn(), saveMemberships: vi.fn(), membershipNow: Date.UTC(2026, 10, 1, 18) }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/api', () => ({ api: vi.fn(), download: vi.fn() }))
const restoredMemberships = { timeZone: 'America/Mexico_City', gamePass: { tier: 'game-pass-ultimate', activeUntil: '2026-11-30' }, psPlus: { tier: 'ps-plus-basic', activeUntil: null } }
beforeEach(() => {
  vi.clearAllMocks()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

it('places subscription settings prominently before the other settings', () => {
  render(<Settings />)
  const titles = screen.getAllByRole('heading', { level: 2 }).map(element => element.textContent)
  expect(titles[0]).toBe('My subscriptions')
})

it('discloses restored tiers, dates and time zone in both backup preview and confirmation', async () => {
  const backup = { version: 1, memberships: restoredMemberships }
  api.mockResolvedValueOnce({ counts: { games: 3, hunts: 2 }, restoresMemberships: true, memberships: restoredMemberships })
  render(<Settings />)
  fireEvent.change(screen.getByLabelText('Choose a Game Log backup'), { target: { files: [{ size: 123, text: async () => JSON.stringify(backup) }] } })
  await waitFor(() => expect(screen.getByText('This backup will replace your subscription settings.')).toBeTruthy())
  expect(screen.getByText(/Ultimate · Active through 2026-11-30/)).toBeTruthy()
  expect(screen.getByText(/Basic · No end date/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Import these records' }))
  const dialog = screen.getByRole('dialog')
  expect(within(dialog).getByText('This backup will replace your subscription settings.')).toBeTruthy()
  expect(within(dialog).getByText(/Ultimate · Active through 2026-11-30/)).toBeTruthy()
  expect(within(dialog).getByText(/America\/Mexico_City/)).toBeTruthy()
  expect(api).toHaveBeenCalledTimes(1)
  fireEvent.click(within(dialog).getByRole('button', { name: 'Import records' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/backups/import', 'POST', backup))
})

it('explains that older backups preserve memberships in preview and confirmation', async () => {
  api.mockResolvedValueOnce({ counts: { games: 1, hunts: 0 }, restoresMemberships: false })
  render(<Settings />)
  fireEvent.change(screen.getByLabelText('Choose a Game Log backup'), { target: { files: [{ size: 10, text: async () => '{"version":1}' }] } })
  const message = 'This backup has no subscription settings. Your current memberships will be kept.'
  await waitFor(() => expect(screen.getByText(message)).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: 'Import these records' }))
  expect(within(screen.getByRole('dialog')).getByText(message)).toBeTruthy()
  expect(screen.queryByText('This backup will replace your subscription settings.')).toBeNull()
})
