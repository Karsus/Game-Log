let csrf = ''
export function setCsrf(value) { csrf = value || '' }
export async function api(path, method = 'GET', body) {
  const multipart = body instanceof FormData
  let response
  try {
    response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: { ...(!multipart ? { 'Content-Type': 'application/json' } : {}), ...(method !== 'GET' ? { 'X-CSRF-Token': csrf } : {}) }, ...(body !== undefined ? { body: multipart ? body : JSON.stringify(body) } : {}) })
  } catch { throw new Error('Could not reach Game Log. Your unsaved changes are still here.') }
  const data = await response.json().catch(() => ({ error: 'The server returned an unexpected response. Please try again.' }))
  if (!response.ok) throw Object.assign(new Error(data.error || 'Request failed'), { status: response.status })
  if (data.csrf) setCsrf(data.csrf)
  return data
}
export function download(name, content, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; anchor.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function csv(rows) {
  return rows.map(row => row.map(value => {
    let text = String(value ?? '')
    if (/^[=+@\-\t\r\n]/.test(text)) text = `'${text}`
    return `"${text.replaceAll('"', '""')}"`
  }).join(',')).join('\r\n')
}
