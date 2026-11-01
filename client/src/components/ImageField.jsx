import React, { useEffect, useId, useRef, useState } from 'react'
import { api } from '../lib/api'
import { Button, ErrorMessage } from './ui'

const defaultFormats = ['image/jpeg', 'image/png', 'image/webp']

export function useImageInput(initialUrl = '', uploads) {
  const [mode, setMode] = useState('url'), [url, setUrl] = useState(initialUrl)
  const [file, setFile] = useState(null), [error, setError] = useState('')
  const [uploading, setUploading] = useState(false), [uploaded, setUploaded] = useState(false)
  const cached = useRef(null)
  const maxBytes = uploads?.maxBytes || 10 * 1024 * 1024
  const formats = uploads?.formats || defaultFormats

  function reset(nextUrl = '') {
    setMode('url'); setUrl(nextUrl); setFile(null); setError(''); setUploaded(false); cached.current = null
  }
  function selectFile(next) {
    if (!next) return
    if (!formats.includes(next.type)) { setError('Choose a JPEG, PNG, or WebP image.'); return }
    if (!next.size || next.size > maxBytes) { setError(`Choose an image smaller than or equal to ${maxBytes / 1024 / 1024} MiB that is not empty.`); return }
    setFile(next); setError(''); setUploaded(false); cached.current = null
  }
  async function resolve() {
    if (mode === 'url') return url.trim()
    if (cached.current?.file === file) return cached.current.url
    if (!uploads?.available) throw new Error('Image uploads are not configured. Use an image URL instead.')
    if (!file) { setError('Choose an image to upload, or switch to URL.'); throw new Error('Choose an image to upload, or switch to URL.') }
    setUploading(true); setError('')
    try {
      const body = new FormData(); body.append('file', file)
      const result = await api('/images', 'POST', body)
      if (!result?.url || typeof result.url !== 'string') throw new Error('The upload did not return an image URL. Please try again.')
      // Keep a successful upload if saving the record fails, so retrying does not create another file.
      cached.current = { file, url: result.url }; setUploaded(true)
      return result.url
    } catch (e) { setError('The image could not be uploaded. Try saving again or use a URL.'); throw e }
    finally { setUploading(false) }
  }
  return { mode, setMode, url, setUrl, file, selectFile, error, uploading, uploaded, reset, resolve, maxBytes, formats, available: !!uploads?.available, maxPixels: uploads?.maxPixels || 40000000 }
}

export default function ImageField({ label, image }) {
  const id = useId(), [preview, setPreview] = useState(''), [failed, setFailed] = useState(false)
  useEffect(() => {
    if (!image.file) { setPreview(''); return }
    const next = URL.createObjectURL(image.file); setPreview(next)
    return () => URL.revokeObjectURL(next)
  }, [image.file])
  const source = image.mode === 'upload' ? preview : /^https?:\/\//i.test(image.url.trim()) ? image.url.trim() : ''
  useEffect(() => setFailed(false), [source])

  return <div className="field image-field" role="group" aria-labelledby={`${id}-label`}>
    <span id={`${id}-label`}>{label}</span>
    <div className="segmented image-source" role="group" aria-label={`${label} source`}>
      <button type="button" aria-pressed={image.mode === 'url'} onClick={() => image.setMode('url')}>URL</button>
      <button type="button" aria-pressed={image.mode === 'upload'} disabled={!image.available} aria-describedby={!image.available ? `${id}-setup` : undefined} onClick={() => image.setMode('upload')}>Upload</button>
    </div>
    {image.mode === 'url'
      ? <input aria-label={`${label} URL`} type="url" maxLength={2000} value={image.url} onChange={e => image.setUrl(e.target.value)} placeholder="https://…" />
      : <><input aria-label={`Upload ${label.toLowerCase()}`} type="file" accept={image.formats.join(',')} onChange={e => { image.selectFile(e.target.files?.[0]); e.target.value = '' }} />
        <small>JPEG, PNG, or WebP · up to {image.maxBytes / 1024 / 1024} MiB and {image.maxPixels / 1000000} megapixels. Uploads when you save.</small>
        {image.file && <small className="image-filename">Selected: {image.file.name}</small>}
        <ErrorMessage>{image.error}</ErrorMessage>
        {image.uploading ? <small role="status">Uploading image…</small> : image.uploaded && <small role="status">Image uploaded. Ready to save.</small>}</>}
    {!image.available && <small id={`${id}-setup`}>Uploads are not configured yet. You can use an image URL, or ask the app owner to connect image storage.</small>}
    {source && <div className="image-preview">{failed ? <small>Preview unavailable. Check the image or URL.</small> : <img src={source} alt={`${label} preview`} onError={() => setFailed(true)} />}</div>}
    {(image.url || image.file) && <Button type="button" className="image-clear" onClick={() => image.reset()}>Clear image</Button>}
  </div>
}
