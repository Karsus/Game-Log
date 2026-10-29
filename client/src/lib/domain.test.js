import { describe, it, expect } from 'vitest'
import { groupHunts, DEFAULT_FILTERS, catalogGames, parseFilters, notebookProgress, itemDone } from './domain'
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
describe('notebook and export', () => {
  it('counts leaf items once and rolls up child completion', () => {
    const items = [{ id: 'p', done: false }, { id: 'a', parentId: 'p', done: true }, { id: 'b', parentId: 'p', type: 'counter', current: 2, target: 3 }]
    expect(notebookProgress({ items })).toEqual({ done: 1, total: 2 }); expect(itemDone(items[0], items)).toBe(false)
    items[2].current = 3; expect(itemDone(items[0], items)).toBe(true)
  })
  it('quotes CSV cells and neutralizes spreadsheet formulas', () => expect(csv([['=SUM(1,2)', 'A "quote"', null]])).toBe('"\'=SUM(1,2)","A ""quote""",""'))
})
