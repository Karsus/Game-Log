// @vitest-environment jsdom
import React from 'react'
import { beforeEach, afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import ImageField, { useImageInput } from './ImageField'
import { FormModal } from './ui'
import { api } from '../lib/api'

vi.mock('../lib/api', () => ({ api: vi.fn() }))
const limits = { available: true, maxBytes: 10485760, formats: ['image/jpeg', 'image/png', 'image/webp'], maxPixels: 40000000 }
const makeFile = (name = 'console.jpg', type = 'image/jpeg') => new File(['picture'], name, { type })
function Harness({ url = '', uploads = limits, save = vi.fn(), close = vi.fn() }) {
  const image = useImageInput(url, uploads)
  return <FormModal title="Edit image" onClose={close} onSubmit={async () => save(await image.resolve())}><ImageField label="Photo" image={image} /></FormModal>
}
function select(file = makeFile()) {
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  fireEvent.change(screen.getByLabelText('Upload photo'), { target: { files: [file] } })
  return file
}
beforeEach(() => {
  vi.clearAllMocks()
  api.mockResolvedValue({ url: 'https://images.example/upload.jpg' })
  URL.createObjectURL = vi.fn().mockReturnValue('blob:local-preview')
  URL.revokeObjectURL = vi.fn()
  HTMLDialogElement.prototype.showModal = function () { this.open = true }
  HTMLDialogElement.prototype.close = function () { this.open = false }
})
afterEach(cleanup)

it('defaults to URL, previews it, and saves a URL without uploading', async () => {
  const save = vi.fn(), close = vi.fn()
  render(<Harness url="https://images.example/old.jpg" save={save} close={close} />)
  expect(screen.getByRole('button', { name: 'URL', exact: true }).getAttribute('aria-pressed')).toBe('true')
  fireEvent.change(screen.getByLabelText('Photo URL'), { target: { value: 'https://images.example/new.jpg' } })
  expect(screen.getByAltText('Photo preview').getAttribute('src')).toBe('https://images.example/new.jpg')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('https://images.example/new.jpg'))
  expect(api).not.toHaveBeenCalled()
  expect(close).toHaveBeenCalledOnce()
})

it('previews a selected file and does not upload when canceled', () => {
  const close = vi.fn()
  const { unmount } = render(<Harness close={close} />)
  const file = select()
  expect(URL.createObjectURL).toHaveBeenCalledWith(file)
  expect(screen.getByAltText('Photo preview').getAttribute('src')).toBe('blob:local-preview')
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  expect(close).toHaveBeenCalledOnce()
  expect(api).not.toHaveBeenCalled()
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview')
})

it('preserves URL and file drafts across source changes and saves the active choice', async () => {
  const save = vi.fn()
  render(<Harness url="https://images.example/manual.png" save={save} />)
  select()
  fireEvent.click(screen.getByRole('button', { name: 'URL', exact: true }))
  expect(screen.getByLabelText('Photo URL').value).toBe('https://images.example/manual.png')
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  expect(screen.getByText('Selected: console.jpg')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'URL', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('https://images.example/manual.png'))
  expect(api).not.toHaveBeenCalled()
})

it('uploads only on Save and caches success when saving the record fails', async () => {
  const save = vi.fn().mockRejectedValueOnce(new Error('Record save failed')).mockResolvedValueOnce({}), close = vi.fn()
  render(<Harness save={save} close={close} />)
  const file = select()
  expect(api).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getByText('Record save failed')).toBeTruthy())
  expect(api).toHaveBeenCalledOnce()
  expect(api.mock.calls[0][0]).toBe('/images')
  expect(api.mock.calls[0][1]).toBe('POST')
  expect(api.mock.calls[0][2].get('file')).toBe(file)
  expect(save).toHaveBeenCalledWith('https://images.example/upload.jpg')
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
  expect(api).toHaveBeenCalledOnce()
  expect(save).toHaveBeenCalledTimes(2)
})

it('keeps the selection after upload failure and retries without saving the record early', async () => {
  const save = vi.fn(), close = vi.fn()
  api.mockRejectedValueOnce(new Error('Storage unavailable'))
  render(<Harness save={save} close={close} />)
  select()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getByText('Storage unavailable')).toBeTruthy())
  expect(screen.getByText('Selected: console.jpg')).toBeTruthy()
  expect(save).not.toHaveBeenCalled()
  expect(close).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('https://images.example/upload.jpg'))
  expect(api).toHaveBeenCalledTimes(2)
})

it('blocks duplicate submissions and closing while uploading', async () => {
  let finish
  api.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const close = vi.fn(), save = vi.fn()
  render(<Harness close={close} save={save} />)
  select()
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  expect(screen.getByRole('button', { name: 'Save changes' }).disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Cancel' }).disabled).toBe(true)
  expect(screen.getByText('Uploading image…')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  expect(close).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
  finish({ url: 'https://images.example/upload.jpg' })
  await waitFor(() => expect(close).toHaveBeenCalledOnce())
})

it('rejects invalid, empty, and oversized files without replacing the current selection', () => {
  render(<Harness />)
  select()
  const input = screen.getByLabelText('Upload photo')
  fireEvent.change(input, { target: { files: [makeFile('unsafe.svg', 'image/svg+xml')] } })
  expect(screen.getByText('Choose a JPEG, PNG, or WebP image.')).toBeTruthy()
  expect(screen.getByText('Selected: console.jpg')).toBeTruthy()
  fireEvent.change(input, { target: { files: [new File([], 'empty.png', { type: 'image/png' })] } })
  expect(screen.getByRole('alert').textContent).toContain('not empty')
  const oversized = makeFile(); Object.defineProperty(oversized, 'size', { value: limits.maxBytes + 1 })
  fireEvent.change(input, { target: { files: [oversized] } })
  expect(screen.getByRole('alert').textContent).toContain('10 MiB')
  expect(screen.getByText('Selected: console.jpg')).toBeTruthy()
  expect(api).not.toHaveBeenCalled()
})

it('requires an upload selection before saving in Upload mode', async () => {
  const save = vi.fn()
  render(<Harness save={save} />)
  fireEvent.click(screen.getByRole('button', { name: 'Upload', exact: true }))
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(screen.getAllByText('Choose an image to upload, or switch to URL.').length).toBeGreaterThan(0))
  expect(api).not.toHaveBeenCalled()
  expect(save).not.toHaveBeenCalled()
})

it('clears both sources, saves an empty image, and allows reselecting the same file', async () => {
  const save = vi.fn(), file = makeFile()
  render(<Harness url="https://images.example/old.jpg" save={save} />)
  select(file)
  fireEvent.click(screen.getByRole('button', { name: 'Clear image' }))
  expect(screen.getByLabelText('Photo URL').value).toBe('')
  expect(screen.queryByAltText('Photo preview')).toBeNull()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview')
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith(''))
  select(file)
  expect(screen.getByText('Selected: console.jpg')).toBeTruthy()
  expect(screen.getByLabelText('Upload photo').value).toBe('')
})

it('revokes a replaced preview and recovers from a broken URL preview', () => {
  const { unmount } = render(<Harness url="https://images.example/broken.jpg" />)
  fireEvent.error(screen.getByAltText('Photo preview'))
  expect(screen.getByText('Preview unavailable. Check the image or URL.')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Photo URL'), { target: { value: 'https://images.example/working.jpg' } })
  expect(screen.getByAltText('Photo preview').getAttribute('src')).toBe('https://images.example/working.jpg')
  select()
  URL.createObjectURL.mockReturnValueOnce('blob:replacement')
  fireEvent.change(screen.getByLabelText('Upload photo'), { target: { files: [makeFile('replacement.png', 'image/png')] } })
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:local-preview')
  unmount()
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:replacement')
})

it('keeps URL usable and explains the disabled Upload choice without configuration', async () => {
  const save = vi.fn()
  render(<Harness uploads={{ ...limits, available: false }} save={save} />)
  expect(screen.getByRole('button', { name: 'Upload', exact: true }).disabled).toBe(true)
  expect(screen.getByText(/Uploads are not configured yet/)).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Photo URL'), { target: { value: 'https://images.example/manual.jpg' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save changes' }))
  await waitFor(() => expect(save).toHaveBeenCalledWith('https://images.example/manual.jpg'))
  expect(api).not.toHaveBeenCalled()
})
