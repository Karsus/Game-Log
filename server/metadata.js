const { PLATFORM_CATALOG } = require('./domain/constants')
const { httpError } = require('./domain/security')
function createMetadataService(env = process.env) {
  let token, expires = 0, queue = Promise.resolve(), lastCall = 0
  const cache = new Map()
  const configured = Boolean(env.IGDB_CLIENT_ID && env.IGDB_CLIENT_SECRET)
  async function request(path, body) {
    if (!configured) throw httpError(503, 'Game lookup is not configured. You can still add games manually.')
    const work = queue.then(async () => {
      if (Date.now() >= expires) {
        const response = await fetch('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: env.IGDB_CLIENT_ID, client_secret: env.IGDB_CLIENT_SECRET, grant_type: 'client_credentials' }), signal: AbortSignal.timeout(10000) })
        if (!response.ok) throw httpError(502, 'Could not authenticate game lookup. Please check the server credentials.')
        const value = await response.json(); token = value.access_token; expires = Date.now() + Math.max(0, value.expires_in - 60) * 1000
      }
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 275 - (Date.now() - lastCall))))
      lastCall = Date.now()
      const response = await fetch(`https://api.igdb.com/v4/${path}`, { method: 'POST', headers: { 'Client-ID': env.IGDB_CLIENT_ID, Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' }, body, signal: AbortSignal.timeout(10000) })
      if (response.status === 401) expires = 0
      if (!response.ok) throw httpError(502, 'Game lookup is temporarily unavailable. Please try again or enter the game manually.')
      return response.json()
    })
    const safeWork = work.catch(error => { if (error.status) throw error; throw httpError(502, 'Game lookup could not be reached. Please try again or enter the game manually.') })
    queue = safeWork.catch(() => {})
    return safeWork
  }
  async function search(query) {
    const cached = cache.get(query)
    if (cached && cached.expires > Date.now()) return cached.data
    const escaped = query.replace(/[\\"\n\r]/g, ' ')
    const values = await request('games', `search "${escaped}"; fields name,summary,url,cover.image_id,first_release_date,genres.name,involved_companies.company.name,involved_companies.developer,involved_companies.publisher,release_dates.platform,release_dates.date,platforms.name; limit 15;`)
    const data = values.map(g => ({
      igdbId: g.id, title: g.name, description: g.summary || '', sourceUrl: g.url || '',
      cover: g.cover?.image_id ? `https://images.igdb.com/igdb/image/upload/t_cover_big/${g.cover.image_id}.jpg` : '',
      releaseYear: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
      developer: (g.involved_companies || []).filter(c => c.developer).map(c => c.company.name).join(', '),
      publisher: (g.involved_companies || []).filter(c => c.publisher).map(c => c.company.name).join(', '),
      genres: (g.genres || []).map(v => v.name),
      platforms: (g.platforms || []).map(v => v.name),
      releases: PLATFORM_CATALOG.flatMap(platform => {
        const releases = (g.release_dates || []).filter(r => r.platform === platform.igdbId)
        if (!releases.length && !(g.platforms || []).some(p => p.id === platform.igdbId)) return []
        const dates = releases.filter(r => r.date).map(r => r.date).sort((a, b) => a - b)
        return [{ platformId: platform._id, date: dates.length ? new Date(dates[0] * 1000).toISOString().slice(0, 10) : '' }]
      }),
    }))
    if (cache.size >= 200) cache.delete(cache.keys().next().value)
    cache.set(query, { data, expires: Date.now() + 3600000 })
    return data
  }
  return { configured, search }
}
module.exports = { createMetadataService }
