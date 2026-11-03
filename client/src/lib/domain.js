import { SUBSCRIPTION_LABELS, subscriptionAccessLabel } from './memberships'
export { SUBSCRIPTION_LABELS } from './memberships'
export const STATUS_LABELS = { planned: 'Planned', 'in-progress': 'In progress', dropped: 'Dropped', completed: 'Completed', priority: 'Priority' }
export const STATUS_ORDER = ['priority', 'in-progress', 'planned', 'completed', 'dropped']
export const SERVICE_LABELS = { none: 'No achievement service', playstation: 'PlayStation', xbox: 'Xbox', steam: 'Steam', epic: 'Epic Games', gog: 'GOG', nintendo: 'Nintendo', custom: 'Custom' }
export const DEFAULT_FILTERS = { platforms: [], service: '', ownership: 'all', status: '', difficulty: '', format: '', sort: 'hours', direction: 'asc' }
export const activeCopy = copy => ['owned', 'lent'].includes(copy.state)
export const isWishlist = game => game.wishlist || game.wishlistPlatforms?.length > 0
export const wholeDifficulty = value => typeof value === 'number' && Number.isFinite(value) && value >= 1 && value <= 10 ? Math.round(value) : null
export const platformName = (data, id) => data.platforms.find(p => p._id === id)?.name || id
export const completionLabel = hunt => hunt.goal === 'platinum' && hunt.hasPlatinum ? 'Platinumed' : hunt.goal === 'manual' ? 'Completed' : 'Achievements completed'
export const huntLabel = hunt => hunt.status === 'completed' ? completionLabel(hunt) : STATUS_LABELS[hunt.status]
export const gameSubscriptions = game => game.subscriptions || []
export const subscriptionLabels = game => [...new Set(gameSubscriptions(game).map(subscription => SUBSCRIPTION_LABELS[subscription.service]).filter(Boolean))]
export function ownership(data, gameId, platformId) {
  return data.copies.some(c => c.gameId === gameId && (!platformId || c.platformId === platformId) && activeCopy(c))
}
export const accessLabel = (data, game, platformId, now = Date.now(), options) => [...(ownership(data, game._id, platformId) ? ['Owned'] : []), subscriptionAccessLabel(game, data.user?.memberships, now, options)].filter(Boolean).join(' · ') || 'Not owned'
export function matchesOwnership(owned, wished, filter, subscriptions = []) {
  return filter === 'all' || filter === 'owned' && owned || filter === 'wishlist' && wished || filter === 'unowned' && !owned || filter === 'subscription' && subscriptions.length > 0 || filter === 'game-pass' && subscriptions.some(subscription => ['game-pass', 'game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate'].includes(subscription.service)) || filter === 'ps-plus' && subscriptions.some(subscription => ['ps-plus-basic', 'ps-plus-extra', 'ps-plus-premium'].includes(subscription.service)) || Object.hasOwn(SUBSCRIPTION_LABELS, filter) && subscriptions.some(subscription => subscription.service === filter)
}
export function catalogGames(data, filters, query = '') {
  return data.games.filter(g => {
    const copies = data.copies.filter(c => c.gameId === g._id && activeCopy(c))
    const matchingCopies = copies.filter(c => !filters.platforms.length || filters.platforms.includes(c.platformId))
    const subscriptions = gameSubscriptions(g)
    const wished = g.wishlist || g.wishlistPlatforms.some(id => !filters.platforms.length || filters.platforms.includes(id))
    const platforms = [...g.releases.map(r => r.platformId), ...g.wishlistPlatforms, ...copies.map(c => c.platformId), ...data.hunts.filter(h => h.gameId === g._id).map(h => h.platformId)]
    return g.title.toLowerCase().includes(query.toLowerCase()) && (!filters.platforms.length || filters.platforms.some(id => platforms.includes(id))) && matchesOwnership(!!matchingCopies.length, wished, filters.ownership, subscriptions) && (!filters.format || matchingCopies.some(c => c.format === filters.format))
  }).sort((a, b) => (filters.sort === 'added' ? new Date(a.createdAt) - new Date(b.createdAt) : a.title.localeCompare(b.title)) * (filters.direction === 'desc' ? -1 : 1) || a.title.localeCompare(b.title))
}
export function groupHunts(data, filters = DEFAULT_FILTERS, query = '') {
  const groups = new Map()
  for (const hunt of data.hunts) {
    const game = data.games.find(g => g._id === hunt.gameId)
    if (!game?.showOnBoard || !game.title.toLowerCase().includes(query.toLowerCase())) continue
    if (filters.platforms.length && !filters.platforms.includes(hunt.platformId)) continue
    if (filters.service && filters.service !== hunt.service || filters.status && filters.status !== hunt.status) continue
    const estimate = wholeDifficulty(hunt.expectedDifficulty), difficulty = estimate == null ? 'unknown' : String(estimate)
    if (filters.difficulty && filters.difficulty !== difficulty) continue
    const owned = ownership(data, game._id, hunt.platformId), wished = game.wishlist || game.wishlistPlatforms.includes(hunt.platformId)
    const subscriptions = gameSubscriptions(game)
    if (!matchesOwnership(owned, wished, filters.ownership, subscriptions)) continue
    const row = { ...hunt, expectedDifficulty: estimate, game, owned, wished, subscriptions }
    if (!groups.has(difficulty)) groups.set(difficulty, [])
    groups.get(difficulty).push(row)
  }
  const direction = filters.direction === 'desc' ? -1 : 1
  const compare = (a, b) => {
    let primary = 0
    if (filters.sort === 'hours') {
      if (a.expectedHours == null && b.expectedHours != null) return 1
      if (b.expectedHours == null && a.expectedHours != null) return -1
      primary = (a.expectedHours ?? 0) - (b.expectedHours ?? 0)
    } else if (filters.sort === 'status') primary = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status)
    else if (filters.sort === 'added') primary = new Date(a.createdAt) - new Date(b.createdAt)
    else primary = a.game.title.localeCompare(b.game.title)
    return primary * direction || a.game.title.localeCompare(b.game.title) || new Date(a.createdAt) - new Date(b.createdAt) || a._id.localeCompare(b._id)
  }
  return [...groups.entries()].sort(([a], [b]) => a === 'unknown' ? 1 : b === 'unknown' ? -1 : Number(a) - Number(b)).map(([difficulty, rows]) => ({ difficulty, rows: rows.sort(compare) }))
}
export function itemDone(item, items) {
  const children = items.filter(i => i.parentId === item.id)
  if (children.length) return children.every(i => itemDone(i, items))
  return item.type === 'counter' ? item.current >= item.target : item.done
}
export const trophyDone = trophy => !!trophy.done
export const trophyObjectiveDone = trophy => trophy.type === 'counter' ? (trophy.current ?? 0) >= (trophy.target ?? 1) : trophyDone(trophy)
export function notebookProgress(notebook) {
  const parents = new Set(notebook.items.map(item => item.parentId).filter(Boolean))
  const leaves = notebook.items.filter(item => !parents.has(item.id))
  const withTasks = new Set(notebook.items.map(item => item.trophyId))
  const trophyObjectives = (notebook.trophies || []).filter(trophy => trophy.type === 'counter' || !withTasks.has(trophy.id))
  return {
    total: leaves.length + trophyObjectives.length,
    done: leaves.filter(item => item.type === 'counter' ? item.current >= item.target : item.done).length + trophyObjectives.filter(trophyObjectiveDone).length,
  }
}
export function parseFilters(search, defaults, scope) {
  const base = { ...DEFAULT_FILTERS, ...(scope === 'catalog' ? { sort: 'title' } : {}), ...defaults }
  const params = new URLSearchParams(search)
  if (params.has('platforms')) base.platforms = params.get('platforms').split(',').filter(Boolean)
  for (const key of ['service', 'ownership', 'status', 'difficulty', 'format', 'sort', 'direction']) if (params.has(key)) base[key] = params.get(key)
  if (!['asc', 'desc'].includes(base.direction)) base.direction = 'asc'
  if (!['hours', 'status', 'added', 'title'].includes(base.sort)) base.sort = scope === 'catalog' ? 'title' : 'hours'
  if (scope === 'catalog' && !['title', 'added'].includes(base.sort)) base.sort = 'title'
  if (!Object.keys(SERVICE_LABELS).includes(base.service)) base.service = ''
  if (!['all', 'owned', 'wishlist', 'unowned', 'subscription', 'ps-plus', ...Object.keys(SUBSCRIPTION_LABELS)].includes(base.ownership)) base.ownership = 'all'
  if (!Object.keys(STATUS_LABELS).includes(base.status)) base.status = ''
  if (base.difficulty !== 'unknown' && base.difficulty !== '') base.difficulty = wholeDifficulty(Number(base.difficulty)) == null ? '' : String(wholeDifficulty(Number(base.difficulty)))
  if (!['', 'physical', 'digital'].includes(base.format)) base.format = ''
  return base
}
