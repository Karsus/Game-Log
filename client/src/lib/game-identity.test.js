import { describe, expect, it } from 'vitest'
import { findDuplicateGame, gameIdentityChanged, gameIgdbIdentity, normalizeGameTitle } from '../../../shared/game-identity.mjs'

describe('game identity shared by browser and server', () => {
  it('ignores capitalization and whitespace while keeping punctuation and accents', () => {
    expect(normalizeGameTitle('  PRAGMATA \t\n Deluxe  ')).toBe('pragmata deluxe')
    expect(normalizeGameTitle('Pokémon: Red')).toBe('pokémon: red')
    expect(findDuplicateGame([{ title: 'Pokémon: Red' }], { title: 'Pokemon Red' })).toBeUndefined()
  })

  it('matches titles regardless of year or platforms, or the same IGDB game with another title', () => {
    const entry = { _id: 'first', title: 'Pragmata', igdbId: 42, releaseYear: 2026, releases: [{ platformId: 'ps5' }] }
    expect(findDuplicateGame([entry], { title: ' pragmata ', releaseYear: 2027, releases: [{ platformId: 'pc' }] })).toBe(entry)
    expect(findDuplicateGame([entry], { title: 'Different title', igdbId: 42 })).toBe(entry)
    expect(findDuplicateGame([entry], { title: 'Different title', igdbId: 43 })).toBeUndefined()
  })

  it('excludes the edited record and does not match missing identities', () => {
    const entry = { _id: 'same', title: 'Pragmata', igdbId: 42 }
    expect(findDuplicateGame([entry], entry, 'same')).toBeUndefined()
    expect(findDuplicateGame([{ title: '', igdbId: null }], {})).toBeUndefined()
    expect(findDuplicateGame([{ title: 'First', igdbId: 0 }], { title: 'Second', igdbId: 0 })).toBeUndefined()
    expect(gameIgdbIdentity({ igdbId: '42' })).toBeNull()
  })

  it('only treats normalized title or IGDB changes as identity edits', () => {
    const before = { title: 'Pragmata', notes: 'old' }
    expect(gameIdentityChanged(before, { title: '  PRAGMATA ', igdbId: null, notes: 'new' })).toBe(false)
    expect(gameIdentityChanged(before, { ...before, title: 'Pragmata Deluxe' })).toBe(true)
    expect(gameIdentityChanged(before, { ...before, igdbId: 42 })).toBe(true)
    expect(gameIdentityChanged({ ...before, igdbId: 42 }, before)).toBe(true)
  })
})
