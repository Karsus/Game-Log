// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { CopyEditor, GameEditor, HardwareEditor, HuntEditor } from './editors'
import { api } from '../lib/api'

const context = vi.hoisted(() => ({ data: {}, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/api', () => ({ api: vi.fn() }))
const game = { _id: 'game-1', title: 'Example game', cover: 'https://images.example/game.jpg', releases: [], genres: [], wishlistPlatforms: [] }
const unit = { _id: 'unit-1', nickname: 'Living room PS5', platformId: 'ps5', image: 'https://images.example/device.jpg' }
beforeEach(() => {
  vi.clearAllMocks()
  context.data = { platforms: [{ _id: 'ps5', name: 'PlayStation 5', service: 'playstation', variants: [] }], metadataAvailable: true, imageUploads: { available: true, maxBytes: 10485760, formats: ['image/jpeg', 'image/png', 'image/webp'], maxPixels: 40000000 } }
  context.mutate.mockResolvedValue({})
  api.mockResolvedValue({ url: 'https://images.example/upload.jpg' })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:preview'); URL.revokeObjectURL = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

it.each(['copy', 'hardware'])('edits %s acquisition dates day-first and saves the same calendar day as ISO', async kind => {
  const close = vi.fn(), acquiredOn = '2027-04-08'
  render(kind === 'copy'
    ? <CopyEditor game={game} copy={{ _id: 'copy-1', platformId: 'ps5', acquiredOn }} onClose={close} />
    : <HardwareEditor unit={{ ...unit, acquiredOn }} onClose={close} />)
  const date = screen.getByLabelText('Acquired on')
  expect(date.value).toBe('08/04/2027')
  fireEvent.change(date, { target: { value: '07/04/2027' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2].acquiredOn).toBe('2027-04-07')
})

it('formats game release dates day-first and retains ISO in the saved record', async () => {
  const close = vi.fn()
  render(<GameEditor game={{ ...game, releases: [{ platformId: 'ps5', date: '2027-04-08' }] }} onClose={close} />)
  fireEvent.click(screen.getByText('Release dates by platform'))
  const date = screen.getByLabelText('PlayStation 5 release date')
  expect(date.value).toBe('08/04/2027')
  fireEvent.change(date, { target: { value: '09/05/2027' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2].releases).toEqual([{ platformId: 'ps5', date: '2027-05-09' }])
})

it.each(['game', 'hardware'])('saves existing and edited %s URLs in their original property', async kind => {
  const isGame = kind === 'game', close = vi.fn()
  render(isGame ? <GameEditor game={game} onClose={close} /> : <HardwareEditor unit={unit} onClose={close} />)
  const field = screen.getByLabelText(isGame ? 'Cover image URL' : 'Photo URL')
  expect(field.value).toBe(isGame ? game.cover : unit.image)
  fireEvent.change(field, { target: { value: 'https://images.example/manual.png' } })
  fireEvent.click(screen.getByRole('button', { name: isGame ? 'Save game' : 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][0]).toBe(isGame ? '/games/game-1' : '/hardware/unit-1')
  expect(context.mutate.mock.calls[0][1]).toBe('PATCH')
  expect(context.mutate.mock.calls[0][2][isGame ? 'cover' : 'image']).toBe('https://images.example/manual.png')
  expect(api).not.toHaveBeenCalled()
})

it.each(['game', 'hardware'])('uploads once before creating a %s record and preserves other fields', async kind => {
  const isGame = kind === 'game', close = vi.fn()
  render(isGame ? <GameEditor onClose={close} /> : <HardwareEditor onClose={close} platformId="ps5" />)
  fireEvent.change(screen.getByLabelText(isGame ? 'Game title' : 'Nickname'), { target: { value: 'My new record' } })
  fireEvent.change(screen.getByLabelText(isGame ? 'My notes' : 'Personal notes'), { target: { value: 'Keep these notes' } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  fireEvent.change(screen.getByLabelText(isGame ? 'Upload cover image' : 'Upload photo'), { target: { files: [new File(['image'], 'image.webp', { type: 'image/webp' })] } })
  expect(api).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: isGame ? 'Add to library' : 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(api).toHaveBeenCalledOnce()
  expect(context.mutate.mock.calls[0][0]).toBe(isGame ? '/games' : '/hardware')
  expect(context.mutate.mock.calls[0][1]).toBe('POST')
  expect(context.mutate.mock.calls[0][2][isGame ? 'cover' : 'image']).toBe('https://images.example/upload.jpg')
  expect(context.mutate.mock.calls[0][2].notes).toBe('Keep these notes')
})

it('replaces a pending uploaded cover with the chosen IGDB cover', async () => {
  const close = vi.fn()
  api.mockResolvedValueOnce([{ title: 'Found game', cover: 'https://images.example/igdb.jpg', igdbId: 42, platforms: ['PlayStation 5'], releases: [], genres: [], releaseYear: 2020 }])
  render(<GameEditor onClose={close} />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  fireEvent.change(screen.getByLabelText('Upload cover image'), { target: { files: [new File(['image'], 'pending.png', { type: 'image/png' })] } })
  fireEvent.change(screen.getByLabelText('Find game details'), { target: { value: 'Found game' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }))
  await waitFor(() => expect(screen.getByRole('button', { name: /Found game/ })).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Found game/ }))
  expect(screen.getByLabelText('Cover image URL').value).toBe('https://images.example/igdb.jpg')
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:preview')
  fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(api).toHaveBeenCalledOnce()
  expect(context.mutate.mock.calls[0][2].cover).toBe('https://images.example/igdb.jpg')
  expect(context.mutate.mock.calls[0][2].title).toBe('Found game')
})

it.each([
  ['game-pass', 'Game Pass'],
  ['game-pass-essential', 'Game Pass Essential (Core)'],
  ['game-pass-premium', 'Game Pass Premium (Standard)'],
  ['game-pass-pc', 'PC Game Pass'],
  ['game-pass-ultimate', 'Game Pass Ultimate'],
  ['ps-plus-basic', 'PS Plus Basic'],
  ['ps-plus-extra', 'PS Plus Extra'],
  ['ps-plus-premium', 'PS Plus Premium'],
])('adds %s access to a new game without creating an owned copy', async (service, label) => {
  const close = vi.fn()
  render(<GameEditor onClose={close} />)
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'Subscription game' } })
  fireEvent.click(screen.getByRole('checkbox', { name: label, exact: true }))
  expect(screen.queryByLabelText(/Subscription platform/)).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate).toHaveBeenCalledOnce()
  expect(context.mutate.mock.calls[0].slice(0, 2)).toEqual(['/games', 'POST'])
  expect(context.mutate.mock.calls[0][2].subscriptions).toEqual([{ service }])
})

it('adds subscription access to a legacy game while preserving notes, wishlist and cover', async () => {
  const close = vi.fn(), original = { ...game, notes: 'Keep this history', wishlist: true, wishlistPlatforms: ['ps5'] }
  render(<GameEditor game={original} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'PS Plus Basic', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ notes: original.notes, wishlist: true, wishlistPlatforms: ['ps5'], cover: game.cover, subscriptions: [{ service: 'ps-plus-basic' }] })
  expect(original.subscriptions).toBeUndefined()
})

it('retains Basic monthly games while replacing Extra catalog access with Premium', async () => {
  const close = vi.fn(), original = { ...game, notes: 'Keep notes', subscriptions: [{ service: 'ps-plus-basic' }, { service: 'ps-plus-extra' }] }
  render(<GameEditor game={original} onClose={close} />)
  expect(screen.getByRole('checkbox', { name: 'PS Plus Basic', exact: true }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'PS Plus Extra', exact: true }).checked).toBe(true)
  fireEvent.click(screen.getByRole('checkbox', { name: 'PS Plus Extra', exact: true }))
  fireEvent.click(screen.getByRole('checkbox', { name: 'PS Plus Premium', exact: true }))
  expect(screen.getByRole('checkbox', { name: 'PS Plus Basic', exact: true }).checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'PS Plus Extra', exact: true }).checked).toBe(false)
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate).toHaveBeenCalledOnce()
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ notes: 'Keep notes', subscriptions: [{ service: 'ps-plus-basic' }, { service: 'ps-plus-premium' }] })
  expect(original.subscriptions).toEqual([{ service: 'ps-plus-basic' }, { service: 'ps-plus-extra' }])
})

it('saves an empty subscription list when the final access entry is removed', async () => {
  const close = vi.fn()
  render(<GameEditor game={{ ...game, subscriptions: [{ service: 'ps-plus-premium' }] }} onClose={close} />)
  fireEvent.click(screen.getByRole('checkbox', { name: 'PS Plus Premium', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2].subscriptions).toEqual([])
  expect(context.mutate.mock.calls[0][0]).toBe('/games/game-1')
})

it.each(['game-pass', 'game-pass-pc', 'game-pass-ultimate'])('starts a PC %s hunt with Xbox achievements instead of the PC default service', async gamePassService => {
  const close = vi.fn()
  context.data.platforms.push({ _id: 'pc', name: 'PC', service: 'steam' })
  render(<HuntEditor game={{ ...game, releases: [{ platformId: 'pc' }], subscriptions: [{ service: gamePassService }] }} onClose={close} />)
  expect(screen.getByLabelText('Platform').value).toBe('pc')
  expect(screen.getByLabelText('Achievement service').value).toBe('xbox')
  expect(screen.queryByLabelText('This game has a platinum trophy')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Create hunt' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ platformId: 'pc', service: 'xbox', hasPlatinum: false, goal: 'base' })
})

it('uses native PlayStation defaults and PC Game Pass achievements when switching platforms', () => {
  context.data.platforms.push({ _id: 'pc', name: 'PC', service: 'steam' })
  render(<HuntEditor game={{ ...game, releases: [{ platformId: 'pc' }, { platformId: 'ps5' }], subscriptions: [{ service: 'game-pass' }] }} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'ps5' } })
  expect(screen.getByLabelText('Achievement service').value).toBe('playstation')
  expect(screen.getByLabelText('This game has a platinum trophy').checked).toBe(true)
  expect(screen.getByLabelText('Hunt completion goal').value).toBe('platinum')
  fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'pc' } })
  expect(screen.getByLabelText('Achievement service').value).toBe('xbox')
  expect(screen.queryByLabelText('This game has a platinum trophy')).toBeNull()
  expect(screen.getByLabelText('Hunt completion goal').value).toBe('base')
})

it.each(['steam', 'none'])('preserves an existing hunt’s explicit %s service despite new Game Pass access', async service => {
  const close = vi.fn(), hasAchievements = service !== 'none', goal = hasAchievements ? 'base' : 'manual'
  context.data.platforms.push({ _id: 'pc', name: 'PC', service: 'steam' })
  render(<HuntEditor game={{ ...game, releases: [{ platformId: 'pc' }], subscriptions: [{ service: 'game-pass' }] }} hunt={{ _id: 'hunt-1', platformId: 'pc', service, hasAchievements, hasPlatinum: false, goal, earned: 2, total: 10 }} onClose={close} />)
  expect(screen.getByLabelText('Achievement service').value).toBe(service)
  expect(screen.getByLabelText('Hunt completion goal').value).toBe(goal)
  fireEvent.change(screen.getByLabelText('Hunt notes / guide links'), { target: { value: 'Updated notes only' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save hunt' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0].slice(0, 2)).toEqual(['/hunts/hunt-1', 'PATCH'])
  expect(context.mutate.mock.calls[0][2]).toMatchObject({ service, goal, hasAchievements, earned: 2, total: 10, notes: 'Updated notes only' })
})

it.each([
  [[{ service: 'ps-plus-premium' }], 'playstation'],
  [[{ service: 'game-pass' }, { service: 'ps-plus-premium' }], 'steam'],
])('uses unambiguous subscription defaults on PC while leaving mixed providers selectable', (subscriptions, service) => {
  context.data.platforms.push({ _id: 'pc', name: 'PC', service: 'steam' })
  render(<HuntEditor game={{ ...game, releases: [{ platformId: 'pc' }], subscriptions }} onClose={vi.fn()} />)
  expect(screen.getByLabelText('Achievement service').value).toBe(service)
})
