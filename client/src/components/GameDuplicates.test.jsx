// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { GameEditor } from './editors'
import { api } from '../lib/api'

const context = vi.hoisted(() => ({ data: {}, mutate: vi.fn() }))
vi.mock('../state', () => ({ useApp: () => context }))
vi.mock('../lib/api', () => ({ api: vi.fn() }))
const existing = { _id: 'existing-game', title: 'Pragmata', igdbId: 123, releases: [], genres: [], wishlistPlatforms: [], notes: '' }

beforeEach(() => {
  vi.resetAllMocks()
  context.data = { games: [existing], platforms: [], metadataAvailable: true, imageUploads: { available: true, maxBytes: 10485760, formats: ['image/jpeg', 'image/png', 'image/webp'], maxPixels: 40000000 } }
  context.mutate.mockResolvedValue({})
  api.mockResolvedValue({ url: 'https://images.example/upload.webp' })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:preview'); URL.revokeObjectURL = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

it('blocks a normalized title match before uploading and preserves the draft', () => {
  context.data.games = [{ ...existing, title: 'The Last Guardian' }]
  const onClose = vi.fn()
  render(<GameEditor onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: '  THE   last Guardian  ' } })
  fireEvent.change(screen.getByLabelText('My notes'), { target: { value: 'Keep this draft' } })
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  fireEvent.change(screen.getByLabelText('Upload cover image'), { target: { files: [new File(['image'], 'cover.webp', { type: 'image/webp' })] } })
  const submit = screen.getByRole('button', { name: 'Add to library' })
  expect(submit.disabled).toBe(true)
  expect(screen.getByRole('link', { name: 'Open existing game' }).getAttribute('href')).toBe('/games/existing-game')
  expect(screen.getByRole('alert').textContent).toContain('already in your library')
  fireEvent.submit(submit.closest('form'))
  expect(api).not.toHaveBeenCalled()
  expect(context.mutate).not.toHaveBeenCalled()
  expect(onClose).not.toHaveBeenCalled()
  expect(screen.getByLabelText('My notes').value).toBe('Keep this draft')
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'A different game' } })
  expect(submit.disabled).toBe(false)
  expect(screen.queryByRole('alert')).toBeNull()
})

it('marks existing IGDB results and blocks the same ID even with a different title', async () => {
  api.mockResolvedValueOnce([{ title: 'Pragmata alternate title', igdbId: 123, cover: '', platforms: ['PC'], releases: [], genres: [], releaseYear: 2026 }])
  render(<GameEditor onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Find game details'), { target: { value: 'Pragmata' } })
  fireEvent.click(screen.getByRole('button', { name: 'Search', exact: true }))
  await waitFor(() => expect(screen.getByText('Already in your library')).toBeTruthy())
  fireEvent.click(screen.getByRole('button', { name: /Pragmata alternate title/ }))
  expect(screen.getByLabelText('Game title').value).toBe('Pragmata alternate title')
  expect(screen.getByRole('button', { name: 'Add to library' }).disabled).toBe(true)
  expect(screen.getByRole('link', { name: 'Open existing game' }).getAttribute('href')).toBe('/games/existing-game')
  expect(context.mutate).not.toHaveBeenCalled()
})

it.each([false, true])('allows unchanged identity edits with legacy duplicates present: %s', async legacyDuplicate => {
  if (legacyDuplicate) context.data.games.push({ ...existing, _id: 'legacy-duplicate' })
  const onClose = vi.fn()
  render(<GameEditor game={existing} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: '  PRAGMATA  ' } })
  fireEvent.change(screen.getByLabelText('My notes'), { target: { value: 'Keep tracking progress' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(context.mutate.mock.calls[0].slice(0, 2)).toEqual(['/games/existing-game', 'PATCH'])
})

it('blocks an edit that changes identity into another game', () => {
  context.data.games.push({ ...existing, _id: 'another-game', title: 'Gladius', igdbId: 456 })
  render(<GameEditor game={existing} onClose={vi.fn()} />)
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'GLADIUS' } })
  expect(screen.getByRole('button', { name: 'Save game' }).disabled).toBe(true)
  expect(screen.getByRole('link', { name: 'Open existing game' }).getAttribute('href')).toBe('/games/another-game')
})

it('keeps server conflict drafts and offers the existing game when local data is stale', async () => {
  context.data.games = []
  context.mutate.mockRejectedValueOnce(Object.assign(new Error('Pragmata is already in your library.'), { status: 409, code: 'DUPLICATE_GAME', existingGameId: 'fresh-game', existingGameTitle: 'Pragmata' }))
  const onClose = vi.fn()
  render(<GameEditor onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'Pragmata' } })
  fireEvent.change(screen.getByLabelText('My notes'), { target: { value: 'Unsaved notes' } })
  fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
  await waitFor(() => expect(screen.getByRole('link', { name: 'Open existing game' }).getAttribute('href')).toBe('/games/fresh-game'))
  expect(screen.getAllByRole('alert')).toHaveLength(1)
  expect(screen.getByRole('button', { name: 'Add to library' }).disabled).toBe(true)
  expect(screen.getByLabelText('My notes').value).toBe('Unsaved notes')
  expect(onClose).not.toHaveBeenCalled()
  fireEvent.change(screen.getByLabelText('Game title'), { target: { value: 'Another game' } })
  expect(screen.queryByRole('alert')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Add to library' }))
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
  expect(context.mutate).toHaveBeenCalledTimes(2)
})

it('shows authoritative server conflicts when an unchanged edit has a stale original identity', async () => {
  context.mutate.mockRejectedValueOnce(Object.assign(new Error('Another Pragmata entry already exists.'), { code: 'DUPLICATE_GAME', existingGameId: 'new-entry' }))
  const onClose = vi.fn()
  render(<GameEditor game={existing} onClose={onClose} />)
  fireEvent.change(screen.getByLabelText('My notes'), { target: { value: 'Keep this edit' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save game' }))
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Another Pragmata entry'))
  expect(screen.getByRole('link', { name: 'Open existing game' }).getAttribute('href')).toBe('/games/new-entry')
  expect(screen.getByLabelText('My notes').value).toBe('Keep this edit')
  expect(screen.getByRole('button', { name: 'Save game' }).disabled).toBe(true)
  expect(onClose).not.toHaveBeenCalled()
})
