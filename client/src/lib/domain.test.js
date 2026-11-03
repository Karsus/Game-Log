import { describe, it, expect } from 'vitest'
import { groupHunts, DEFAULT_FILTERS, catalogGames, parseFilters, notebookProgress, itemDone, trophyDone, trophyObjectiveDone, ownership, activeCopy, gameSubscriptions, subscriptionLabels, accessLabel } from './domain'
import { csv } from './api'
const games = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Hidden'].map((title, i) => ({ _id: `g${i}`, title, showOnBoard: i !== 5, wishlistPlatforms: i === 1 ? ['ps5'] : [], releases: [{ platformId: i === 2 ? 'ps4' : 'ps5' }], createdAt: `2026-01-0${i + 1}` }))
const hunts = [
  ['a', 0, 2, 20, 'planned', 'ps5'], ['b', 1, 2, 5, 'priority', 'ps5'], ['c', 2, 3, 1, 'in-progress', 'ps4'], ['d', 3, null, 2, 'completed', 'ps5'], ['e', 4, 4, null, 'dropped', 'pc'], ['f', 5, 1, 1, 'priority', 'ps5'], ['g', 0, 2, null, 'dropped', 'pc'],
].map(([id, gi, expectedDifficulty, expectedHours, status, platformId], i) => ({ _id: id, gameId: `g${gi}`, expectedDifficulty, expectedHours, status, platformId, service: platformId === 'pc' ? 'steam' : 'playstation', createdAt: `2026-01-0${i + 1}` }))
const data = { games, hunts, copies: [{ gameId: 'g0', platformId: 'ps5', state: 'owned', format: 'physical' }], platforms: [] }
describe('permanent difficulty columns', () => {
  it('converts legacy decimals into whole-number groups and filters', () => {
    const legacy = { ...data, hunts: data.hunts.map(h => h._id === 'a' ? { ...h, expectedDifficulty: 2.5 } : h) }
    const groups = groupHunts(legacy)
    expect(groups.map(g => g.difficulty)).toEqual(['2', '3', '4', 'unknown'])
    expect(groups.find(g => g.difficulty === '3').rows.some(h => h._id === 'a' && h.expectedDifficulty === 3)).toBe(true)
    expect(parseFilters('difficulty=2.5', {}, 'hunts').difficulty).toBe('3')
    expect(parseFilters('', { difficulty: '4.5' }, 'hunts').difficulty).toBe('5')
  })
  for (const sort of ['hours', 'status', 'added', 'title']) for (const direction of ['asc', 'desc']) it(`${sort} ${direction} never mixes or reverses difficulty columns`, () => {
    const groups = groupHunts(data, { ...DEFAULT_FILTERS, sort, direction })
    expect(groups.map(g => g.difficulty)).toEqual(['2', '3', '4', 'unknown'])
    for (const group of groups) expect(group.rows.every(r => String(r.expectedDifficulty ?? 'unknown') === group.difficulty)).toBe(true)
    expect(groups.flatMap(g => g.rows).some(h => h._id === 'f')).toBe(false)
  })
  it('sorts expected time within columns and keeps unknown times last in both directions', () => {
    expect(groupHunts(data)[0].rows.map(h => h._id)).toEqual(['b', 'a', 'g'])
    expect(groupHunts(data, { ...DEFAULT_FILTERS, direction: 'desc' })[0].rows.map(h => h._id)).toEqual(['a', 'b', 'g'])
  })
  it('sorts status with the documented priority order', () => expect(groupHunts(data, { ...DEFAULT_FILTERS, sort: 'status' })[0].rows.map(h => h._id)).toEqual(['b', 'a', 'g']))
  it('sorts hunt creation time rather than game creation time', () => expect(groupHunts(data, { ...DEFAULT_FILTERS, sort: 'added', direction: 'desc' })[0].rows.map(h => h._id)).toEqual(['g', 'b', 'a']))
  it('filters platforms and services without collapsing difficulty groups', () => {
    expect(groupHunts(data, { ...DEFAULT_FILTERS, platforms: ['ps4', 'ps5'] }).map(g => g.difficulty)).toEqual(['2', '3', 'unknown'])
    expect(groupHunts(data, { ...DEFAULT_FILTERS, service: 'steam' }).map(g => g.difficulty)).toEqual(['2', '4'])
  })
  it('filters ownership against the specific platform copy', () => {
    expect(groupHunts(data, { ...DEFAULT_FILTERS, ownership: 'owned' }).flatMap(g => g.rows).map(h => h._id)).toEqual(['a'])
    expect(groupHunts(data, { ...DEFAULT_FILTERS, ownership: 'wishlist' }).flatMap(g => g.rows).map(h => h._id)).toEqual(['b'])
  })
  it('moves a changed estimate to the exact new difficulty column', () => {
    const next = { ...data, hunts: data.hunts.map(h => h._id === 'a' ? { ...h, expectedDifficulty: 7 } : h) }
    expect(groupHunts(next).find(g => g.difficulty === '7').rows[0]._id).toBe('a')
  })
})
describe('catalog and preferences', () => {
  it('combines format and ownership with the selected platform', () => {
    const collection = { ...data, copies: [...data.copies, { gameId: 'g0', platformId: 'pc', format: 'digital', state: 'owned' }] }
    expect(catalogGames(collection, { ...DEFAULT_FILTERS, platforms: ['ps5'], format: 'digital' })).toEqual([])
    expect(catalogGames(collection, { ...DEFAULT_FILTERS, platforms: ['pc'], format: 'digital' }).map(g => g._id)).toEqual(['g0'])
    expect(catalogGames(collection, { ...DEFAULT_FILTERS, platforms: ['ps4'], ownership: 'owned' })).toEqual([])
  })
  it('uses saved defaults unless URL settings explicitly override them', () => {
    const defaults = { ...DEFAULT_FILTERS, platforms: ['ps5'], sort: 'status' }
    expect(parseFilters('', defaults, 'hunts').platforms).toEqual(['ps5'])
    expect(parseFilters('platforms=ps4&sort=added&direction=desc&groupBy=status', defaults, 'hunts')).toMatchObject({ platforms: ['ps4'], sort: 'added', direction: 'desc' })
    expect(parseFilters('platforms=', defaults, 'hunts').platforms).toEqual([])
    expect(defaults.platforms).toEqual(['ps5'])
    expect(parseFilters('groupBy=status', defaults, 'hunts').groupBy).toBeUndefined()
  })
  it('supports platform and wishlist filters in the catalog', () => {
    expect(catalogGames(data, { ...DEFAULT_FILTERS, platforms: ['ps4'], sort: 'title' }).map(g => g.title)).toEqual(['Gamma'])
    expect(catalogGames(data, { ...DEFAULT_FILTERS, ownership: 'wishlist' }).map(g => g.title)).toEqual(['Beta'])
  })
})
describe('subscription access', () => {
  const collection = {
    ...data,
    games: games.map(game => ({ ...game, subscriptions: game._id === 'g0' ? [{ service: 'game-pass' }, { service: 'ps-plus-basic' }] : game._id === 'g1' ? [{ service: 'ps-plus-premium' }] : [] })),
  }
  const catalogIds = (filters = {}, source = collection) => catalogGames(source, { ...DEFAULT_FILTERS, ...filters }).map(game => game._id)
  const huntRows = (filters = {}, source = collection) => groupHunts(source, { ...DEFAULT_FILTERS, ...filters }).flatMap(group => group.rows)

  it('treats old games without subscriptions as having no subscription access', () => {
    expect(gameSubscriptions(games[0])).toEqual([])
    expect(subscriptionLabels(games[0])).toEqual([])
    expect(catalogIds({ ownership: 'subscription' }, data)).toEqual([])
    expect(huntRows({ ownership: 'subscription' }, data)).toEqual([])
    expect(ownership(data, 'g0')).toBe(true)
    expect(accessLabel(data, games[1])).toBe('Not owned')
  })

  it('keeps subscription-only titles and licenses out of owned counts', () => {
    expect(ownership(collection, 'g1')).toBe(false)
    expect(ownership(collection, 'g1', 'ps5')).toBe(false)
    expect(catalogIds({ ownership: 'owned' })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'unowned' })).toContain('g1')
    const active = collection.copies.filter(activeCopy)
    expect(new Set(active.map(copy => copy.gameId)).size).toBe(1)
    expect(active).toHaveLength(1)
    expect(accessLabel(collection, collection.games[1])).toBe('PS Plus Premium · Inactive')
  })

  it('keeps subscription labels game-wide while ownership follows the platform copy', () => {
    expect(ownership(collection, 'g0', 'ps5')).toBe(true)
    expect(ownership(collection, 'g0', 'pc')).toBe(false)
    expect(subscriptionLabels(collection.games[0])).toEqual(['Game Pass', 'PS Plus Basic'])
    expect(gameSubscriptions(collection.games[0])).toEqual([{ service: 'game-pass' }, { service: 'ps-plus-basic' }])
    expect(subscriptionLabels(collection.games[1])).toEqual(['PS Plus Premium'])
    expect(accessLabel(collection, collection.games[0])).toBe('Owned · Game Pass · Inactive; PS Plus Basic · Inactive')
    expect(accessLabel(collection, collection.games[0], 'pc')).toBe('Game Pass · Inactive; PS Plus Basic · Inactive')
    expect(accessLabel(collection, collection.games[0], 'ps5')).toBe('Owned · Game Pass · Inactive; PS Plus Basic · Inactive')
    expect(catalogIds({ ownership: 'subscription' })).toEqual(['g0', 'g1'])
    expect(catalogIds({ ownership: 'game-pass' })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'ps-plus' })).toEqual(['g0', 'g1'])
  })

  it('combines game-wide provider filters with existing platform and copy-format filters', () => {
    expect(catalogIds({ ownership: 'game-pass', platforms: ['ps5'] })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'game-pass', platforms: ['pc'] })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'ps-plus', platforms: ['pc'] })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'unowned', platforms: ['pc'] })).toContain('g0')
    expect(catalogIds({ ownership: 'subscription', platforms: ['ps5'], format: 'physical' })).toEqual(['g0'])
    expect(catalogIds({ ownership: 'subscription', format: 'digital' })).toEqual([])
  })

  it('does not infer a platform from a subscription service', () => {
    const source = { ...collection, games: [...collection.games, { _id: 'unassigned', title: 'Unassigned game', releases: [], wishlistPlatforms: [], subscriptions: [{ service: 'ps-plus-basic' }], createdAt: '2026-11-01' }] }
    expect(catalogIds({ ownership: 'ps-plus-basic' }, source)).toContain('unassigned')
    expect(catalogIds({ platforms: ['ps5'], ownership: 'ps-plus-basic' }, source)).toEqual(['g0'])
    expect(catalogIds({ platforms: ['ps4'] })).not.toContain('g1')
    expect(catalogIds({ platforms: ['ps4'], ownership: 'subscription' })).toEqual([])
    expect(catalogIds({ platforms: ['ps4'], ownership: 'game-pass' })).toEqual([])
  })

  it('marks all hunts for a subscribed game while platform filters still select hunt platforms', () => {
    expect(huntRows({ ownership: 'game-pass' }).map(hunt => hunt._id)).toEqual(['a', 'g'])
    expect(huntRows({ ownership: 'ps-plus' }).map(hunt => hunt._id)).toEqual(['b', 'a', 'g'])
    expect(huntRows({ ownership: 'subscription', platforms: ['pc'] })).toMatchObject([{ _id: 'g', owned: false, subscriptions: [{ service: 'game-pass' }, { service: 'ps-plus-basic' }] }])
    expect(huntRows({ ownership: 'owned' })).toMatchObject([{ _id: 'a', owned: true, subscriptions: [{ service: 'game-pass' }, { service: 'ps-plus-basic' }] }])
    expect(groupHunts(collection, { ...DEFAULT_FILTERS, ownership: 'subscription' }).map(group => group.difficulty)).toEqual(['2'])
  })

  it('removes access without losing games, hunts, progress, or owned copies', () => {
    const source = structuredClone(collection)
    source.hunts[0] = { ...source.hunts[0], earned: 12, total: 40, notebook: { revision: 2, sections: [{ id: 'main', title: 'Main' }], items: [{ id: 'done', sectionId: 'main', done: true }] } }
    const original = structuredClone(source)
    source.games[0].subscriptions = []
    expect(catalogIds({ ownership: 'game-pass' }, source)).toEqual([])
    expect(huntRows({ ownership: 'game-pass' }, source)).toEqual([])
    expect(catalogIds({}, source)).toContain('g0')
    expect(huntRows({}, source).find(hunt => hunt._id === 'a')).toMatchObject({ earned: 12, total: 40, notebook: original.hunts[0].notebook, owned: true, subscriptions: [] })
    expect(source.hunts).toEqual(original.hunts)
    expect(source.copies).toEqual(original.copies)
  })

  it('distinguishes all PS Plus tiers while the provider filter includes every tier', () => {
    const source = structuredClone(collection)
    source.games[2].subscriptions = [{ service: 'ps-plus-extra' }]
    expect(accessLabel(source, source.games[2])).toBe('PS Plus Extra · Inactive')
    expect(catalogIds({ ownership: 'ps-plus' }, source)).toEqual(['g0', 'g1', 'g2'])
    expect(catalogIds({ ownership: 'ps-plus-basic' }, source)).toEqual(['g0'])
    expect(catalogIds({ ownership: 'ps-plus-premium' }, source)).toEqual(['g1'])
    expect(catalogIds({ ownership: 'ps-plus-extra' }, source)).toEqual(['g2'])
    expect(catalogIds({ ownership: 'ps-plus-extra', platforms: ['ps5'] }, source)).toEqual([])
    expect(huntRows({ ownership: 'ps-plus' }, source).map(hunt => hunt._id)).toEqual(['b', 'a', 'g', 'c'])
    expect(huntRows({ ownership: 'ps-plus-basic' }, source).map(hunt => hunt._id)).toEqual(['a', 'g'])
    expect(huntRows({ ownership: 'ps-plus-premium' }, source).map(hunt => hunt._id)).toEqual(['b'])
    expect(huntRows({ ownership: 'ps-plus-extra' }, source).map(hunt => hunt._id)).toEqual(['c'])
    expect(huntRows({ ownership: 'ps-plus-extra', platforms: ['ps5'] }, source)).toEqual([])
  })

  it('filters each Game Pass source separately and groups all tiers under Game Pass', () => {
    const tiers = ['game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate']
    const source = structuredClone(collection)
    tiers.forEach((service, index) => { source.games[index + 1].subscriptions = [{ service }] })
    expect(catalogIds({ ownership: 'game-pass' }, source).sort()).toEqual(['g0', 'g1', 'g2', 'g3', 'g4'])
    tiers.forEach((service, index) => {
      expect(catalogIds({ ownership: service }, source)).toEqual([`g${index + 1}`])
      expect(huntRows({ ownership: service }, source).map(hunt => hunt.gameId)).toEqual([`g${index + 1}`])
    })
  })

  it('derives membership activity without changing ownership or hiding inactive source records', () => {
    const source = { ...collection, user: { memberships: { timeZone: 'UTC', gamePass: { tier: 'game-pass-pc', activeUntil: '2026-11-01' }, psPlus: { tier: 'none', activeUntil: null } } } }
    const before = Date.parse('2026-11-01T23:59:59Z'), after = Date.parse('2026-11-02T00:00:00Z')
    expect(accessLabel(source, source.games[0], undefined, before)).toBe('Owned · Game Pass · Active; PS Plus Basic · Inactive')
    expect(accessLabel(source, source.games[0], undefined, after)).toBe('Owned · Game Pass · Inactive; PS Plus Basic · Inactive')
    expect(accessLabel(source, source.games[0], undefined, before, { activeOnly: true })).toBe('Owned · Game Pass · Active')
    expect(accessLabel(source, source.games[0], undefined, after, { activeOnly: true })).toBe('Owned')
    expect(ownership(source, 'g0')).toBe(true)
    expect(ownership(source, 'g1')).toBe(false)
    expect(catalogIds({ ownership: 'subscription' }, source)).toEqual(['g0', 'g1'])
    expect(huntRows({ ownership: 'subscription' }, source).map(hunt => hunt._id)).toEqual(['b', 'a', 'g'])
  })

  it.each(['subscription', 'game-pass', 'game-pass-essential', 'game-pass-premium', 'game-pass-pc', 'game-pass-ultimate', 'ps-plus', 'ps-plus-basic', 'ps-plus-extra', 'ps-plus-premium'])('restores and overrides saved %s filters', filter => {
    expect(parseFilters('', { ownership: filter }, 'catalog').ownership).toBe(filter)
    expect(parseFilters(`ownership=${filter}`, { ownership: 'owned' }, 'hunts').ownership).toBe(filter)
    expect(parseFilters('ownership=owned', { ownership: filter }, 'catalog').ownership).toBe('owned')
  })
})

describe('notebook and export', () => {
  it('counts leaf items once and rolls up child completion', () => {
    const items = [{ id: 'p', done: false }, { id: 'a', parentId: 'p', done: true }, { id: 'b', parentId: 'p', type: 'counter', current: 2, target: 3 }]
    expect(notebookProgress({ items })).toEqual({ done: 1, total: 2 }); expect(itemDone(items[0], items)).toBe(false)
    items[2].current = 3; expect(itemDone(items[0], items)).toBe(true)
  })
  it.each(['checkbox', 'counter'])('keeps the %s trophy earned flag independent from nested task progress', type => {
    const trophy = { id: 'trophy', type, target: 4, current: 0, done: true }
    const items = [
      { id: 'root', trophyId: 'trophy', parentId: null, done: false },
      { id: 'a', trophyId: 'trophy', parentId: 'root', done: true },
      { id: 'b', trophyId: 'trophy', parentId: 'root', type: 'counter', current: 2, target: 3 },
      { id: 'second-root', trophyId: 'trophy', parentId: null, done: true },
      { id: 'unrelated', trophyId: 'other', parentId: null, done: false },
    ]
    expect(trophyDone(trophy, items)).toBe(true)
    items[2].current = 3
    expect(trophyDone({ ...trophy, current: 4, done: false }, items)).toBe(false)
    items[3].done = false
    expect(trophyDone(trophy, items)).toBe(true)
    expect(trophyDone(trophy, [])).toBe(true)
    expect(trophyDone({ ...trophy, done: false }, [])).toBe(false)
    expect(trophyDone({ id: 'old-checkbox', done: true })).toBe(true)
  })
  it('tracks counter objectives independently from the trophy earned flag and checkbox objectives manually', () => {
    const trophy = { id: 'counter', type: 'counter', current: 1, target: 4, done: true }
    expect(trophyDone(trophy)).toBe(true)
    expect(trophyObjectiveDone(trophy)).toBe(false)
    const completed = { ...trophy, current: 4, done: false }
    expect(trophyDone(completed)).toBe(false)
    expect(trophyObjectiveDone(completed)).toBe(true)
    expect(trophyObjectiveDone({ id: 'default-counter', type: 'counter' })).toBe(false)
    expect(trophyObjectiveDone({ id: 'checkbox', type: 'checkbox', current: 0, target: 1, done: true })).toBe(true)
    expect(trophyObjectiveDone({ id: 'checkbox', type: 'checkbox', current: 1, target: 1, done: false })).toBe(false)
  })
  it('counts standalone trophies and trophy counters alongside task leaves without counting checkbox parents twice', () => {
    const notebook = {
      trophies: [
        { id: 'parent', type: 'checkbox', done: false, sectionIds: ['one', 'two'] },
        { id: 'standalone', done: true, sectionIds: ['one', 'two'] },
        { id: 'counter-parent', type: 'counter', current: 1, target: 2 },
        { id: 'counter-alone', type: 'counter', current: 3, target: 3 },
        { id: 'empty', done: false },
      ],
      items: [
        { id: 'root', trophyId: 'parent', done: false },
        { id: 'a', trophyId: 'parent', parentId: 'root', done: true },
        { id: 'b', trophyId: 'parent', parentId: 'root', type: 'counter', current: 2, target: 3 },
        { id: 'counter-child', trophyId: 'counter-parent', done: true },
      ],
    }
    expect(notebookProgress(notebook)).toEqual({ done: 4, total: 7 })
    notebook.trophies[0].done = true
    notebook.trophies[2].done = true
    notebook.trophies[3].done = true
    expect(notebookProgress(notebook)).toEqual({ done: 4, total: 7 })
    notebook.items[2].current = 3
    notebook.trophies[2].current = 2
    notebook.trophies[2].done = false
    expect(notebookProgress(notebook)).toEqual({ done: 6, total: 7 })
    expect(trophyDone(notebook.trophies[2])).toBe(false)
    expect(notebookProgress({ items: [], trophies: [] })).toEqual({ done: 0, total: 0 })
  })
  it('quotes CSV cells and neutralizes spreadsheet formulas', () => expect(csv([['=SUM(1,2)', 'A "quote"', null]])).toBe('"\'=SUM(1,2)","A ""quote""",""'))
})
