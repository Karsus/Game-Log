// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import HuntDetail from './HuntDetail'

const context = vi.hoisted(() => ({ data: null, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../components/Notebook', () => ({ default: () => null }))
vi.mock('../components/GameAccess', () => ({ default: () => null }))

const decrease = () => screen.getByRole('button', { name: 'Decrease trophies earned' })
const increase = () => screen.getByRole('button', { name: 'Increase trophies earned' })
const currentHunt = () => context.data.hunts[0]

function showHunt(patch = {}) {
  Object.assign(currentHunt(), patch)
  return render(<MemoryRouter initialEntries={['/hunts/hunt']}><Routes><Route path="/hunts/:id" element={<HuntDetail />} /></Routes></MemoryRouter>)
}

async function savePatch(_path, _method, patch) {
  context.data = { ...context.data, hunts: [{ ...currentHunt(), ...patch }] }
}

beforeEach(() => {
  vi.resetAllMocks()
  context.data = {
    platforms: [{ _id: 'ps5', name: 'PlayStation 5' }],
    games: [{ _id: 'game', title: 'Trophy counter example' }],
    hunts: [{
      _id: 'hunt', gameId: 'game', platformId: 'ps5', service: 'playstation',
      hasAchievements: true, hasPlatinum: true, status: 'in-progress', goal: 'platinum',
      earned: 17, total: 51,
      completion: { platinum: false, base: false, all: false, manual: false, completedOn: '' },
      notebook: { revision: 3, trophies: [{ id: 'trophy', done: true }], items: [{ id: 'task', done: false, current: 2, target: 5 }] },
    }],
  }
  context.mutate.mockImplementation(savePatch)
})
afterEach(cleanup)

describe('quick trophy-count controls', () => {
  it('saves single-step changes and uses the refreshed count for the next click', async () => {
    showHunt()
    const before = structuredClone(currentHunt())
    expect(screen.getByText('17 / 51')).toBeTruthy()
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByText('18 / 51')).toBeTruthy())
    expect(context.mutate).toHaveBeenNthCalledWith(1, '/hunts/hunt', 'PATCH', { earned: 18 })
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('35')
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByText('19 / 51')).toBeTruthy())
    fireEvent.click(decrease())
    await waitFor(() => expect(screen.getByText('18 / 51')).toBeTruthy())
    expect(context.mutate).toHaveBeenNthCalledWith(2, '/hunts/hunt', 'PATCH', { earned: 19 })
    expect(context.mutate).toHaveBeenNthCalledWith(3, '/hunts/hunt', 'PATCH', { earned: 18 })
    expect(currentHunt()).toEqual({ ...before, earned: 18 })
  })

  it.each([
    [0, 51, true, false],
    [51, 51, false, true],
    [0, 0, true, true],
    [100000, null, false, true],
  ])('enforces bounds for %s earned and %s total', (earned, total, decreaseDisabled, increaseDisabled) => {
    showHunt({ earned, total })
    expect(decrease().disabled).toBe(decreaseDisabled)
    expect(increase().disabled).toBe(increaseDisabled)
    if (decreaseDisabled) fireEvent.click(decrease())
    if (increaseDisabled) fireEvent.click(increase())
    expect(context.mutate).not.toHaveBeenCalled()
  })

  it('allows counting with an unknown total and stops at the existing maximum', async () => {
    showHunt({ earned: 99999, total: null })
    expect(screen.getByText('99999 / —')).toBeTruthy()
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByText('100000 / —')).toBeTruthy())
    expect(increase().disabled).toBe(true)
    fireEvent.click(decrease())
    await waitFor(() => expect(screen.getByText('99999 / —')).toBeTruthy())
    expect(increase().disabled).toBe(false)
  })

  it('does not complete a hunt or notebook when the count reaches the total', async () => {
    showHunt({ earned: 50 })
    const before = structuredClone(currentHunt())
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByText('51 / 51')).toBeTruthy())
    expect(context.mutate).toHaveBeenCalledExactlyOnceWith('/hunts/hunt', 'PATCH', { earned: 51 })
    expect(currentHunt()).toEqual({ ...before, earned: 51 })
    expect(screen.getByRole('checkbox', { name: 'Platinum earned' }).checked).toBe(false)
    expect(screen.getByRole('button', { name: 'Mark platinum earned' })).toBeTruthy()
  })

  it('does not reopen a completed hunt when decreasing its count', async () => {
    showHunt({ earned: 51, status: 'completed', completion: { platinum: true, base: true, all: true, manual: false, completedOn: '2026-11-01' } })
    const before = structuredClone(currentHunt())
    fireEvent.click(decrease())
    await waitFor(() => expect(screen.getByText('50 / 51')).toBeTruthy())
    expect(context.mutate).toHaveBeenCalledExactlyOnceWith('/hunts/hunt', 'PATCH', { earned: 50 })
    expect(currentHunt()).toEqual({ ...before, earned: 50 })
    expect(screen.getByRole('button', { name: 'Platinumed · Reopen hunt' })).toBeTruthy()
  })

  it('keeps the saved count visible and blocks overlapping updates while saving', async () => {
    let finishSave
    context.mutate.mockImplementationOnce((...args) => new Promise(resolve => {
      finishSave = async () => { await savePatch(...args); resolve() }
    }))
    showHunt()
    const button = increase()
    act(() => { button.click(); button.click() })
    expect(context.mutate).toHaveBeenCalledTimes(1)
    expect(screen.getByText('17 / 51')).toBeTruthy()
    expect(decrease().disabled).toBe(true)
    expect(increase().disabled).toBe(true)
    for (const checkbox of screen.getAllByRole('checkbox')) expect(checkbox.disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Mark platinum earned' }).disabled).toBe(true)
    fireEvent.click(decrease())
    fireEvent.click(screen.getByRole('button', { name: 'Mark platinum earned' }))
    expect(context.mutate).toHaveBeenCalledTimes(1)
    await act(async () => { await finishSave() })
    expect(screen.getByText('18 / 51')).toBeTruthy()
    expect(increase().disabled).toBe(false)
    expect(decrease().disabled).toBe(false)
  })

  it('shows a failed save without changing the count and allows retry', async () => {
    context.mutate.mockRejectedValueOnce(new Error('Unable to save trophy count'))
    showHunt()
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Unable to save trophy count'))
    expect(screen.getByText('17 / 51')).toBeTruthy()
    expect(increase().disabled).toBe(false)
    expect(decrease().disabled).toBe(false)
    fireEvent.click(increase())
    await waitFor(() => expect(screen.getByText('18 / 51')).toBeTruthy())
    expect(context.mutate).toHaveBeenNthCalledWith(2, '/hunts/hunt', 'PATCH', { earned: 18 })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('hides the counter controls for hunts without achievements', () => {
    showHunt({ hasAchievements: false, hasPlatinum: false, service: 'none', goal: 'manual', earned: 0, total: null })
    expect(screen.queryByRole('button', { name: 'Decrease trophies earned' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Increase trophies earned' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Mark hunt complete' })).toBeTruthy()
  })
})
