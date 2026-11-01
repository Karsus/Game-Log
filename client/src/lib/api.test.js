import { afterEach, beforeEach, it, expect, vi } from 'vitest'
import { api, setCsrf } from './api'

beforeEach(() => { setCsrf('csrf-token'); vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://images.example/photo.jpg' }) })) })
afterEach(() => { setCsrf(''); vi.unstubAllGlobals() })

it('sends multipart with CSRF and lets the browser set its boundary', async () => {
  const body = new FormData(); body.append('file', new Blob(['image'], { type: 'image/jpeg' }), 'photo.jpg')
  await api('/images', 'POST', body)
  expect(fetch).toHaveBeenCalledWith('/api/images', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': 'csrf-token' }, body })
})

it('continues to serialize ordinary request bodies as JSON', async () => {
  await api('/games', 'POST', { title: 'Example', cover: 'https://images.example/photo.jpg' })
  expect(fetch.mock.calls[0][1]).toEqual({ method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf-token' }, body: JSON.stringify({ title: 'Example', cover: 'https://images.example/photo.jpg' }) })
})

it('surfaces upload server and network failures', async () => {
  fetch.mockResolvedValueOnce({ ok: false, status: 413, json: async () => ({ error: 'Image is too large' }) })
  await expect(api('/images', 'POST', new FormData())).rejects.toMatchObject({ message: 'Image is too large', status: 413 })
  fetch.mockRejectedValueOnce(new Error('Offline'))
  await expect(api('/images', 'POST', new FormData())).rejects.toThrow('Your unsaved changes are still here.')
})
