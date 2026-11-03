const { z } = require('zod')
const { SERVICES, STATUSES } = require('./constants')
const { GAME_PASS_TIERS, PS_PLUS_TIERS, SUBSCRIPTION_SERVICES } = require('./memberships')
const { normalizeNotebook } = require('./notebook')
const { storefrontId } = require('./storefronts')
const text = (max = 500) => z.string().trim().max(max)
const name = text(200).min(1, 'A name is required')
const id = z.string().min(1).max(100)
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record ID')
const nullableNumber = (min, max) => z.number().finite().min(min).max(max).nullable().default(null)
const url = text(2000).refine(v => !v || /^https?:\/\//i.test(v), 'Use an http or https URL').default('')
const date = z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)), 'Use YYYY-MM-DD').default('')
const membershipDate = z.string().refine(value => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00.000Z`)
  return !isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}, 'Use a valid calendar date in YYYY-MM-DD format').nullable().default(null)
const timeZone = text(100).min(1).refine(value => {
  if (/^[+-]/.test(value)) return false
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true } catch { return false }
}, 'Choose a valid IANA time zone')
const gamePassMembership = z.object({ tier: z.enum(['none', ...GAME_PASS_TIERS]).default('none'), activeUntil: membershipDate }).strict()
const psPlusMembership = z.object({ tier: z.enum(['none', ...PS_PLUS_TIERS]).default('none'), activeUntil: membershipDate }).strict()
const memberships = z.object({ timeZone: timeZone.nullable().default(null), gamePass: gamePassMembership.default({ tier: 'none', activeUntil: null }), psPlus: psPlusMembership.default({ tier: 'none', activeUntil: null }) }).strict()
  .refine(value => value.timeZone !== null || [value.gamePass, value.psPlus].every(provider => provider.tier === 'none' && provider.activeUntil === null), { path: ['timeZone'], message: 'A saved time zone is required for membership tiers or expiry dates' })
const membershipUpdate = z.object({ timeZone, gamePass: gamePassMembership, psPlus: psPlusMembership }).strict()
const platform = z.object({ name, manufacturer: text(100).default('Other'), service: z.enum(SERVICES).default('none'), variants: z.array(text(100)).max(50).default([]) })
const game = z.object({
  title: name, description: text(20000).default(''), cover: url,
  developer: text(500).default(''), publisher: text(500).default(''), genres: z.array(text(100)).max(30).default([]),
  releaseYear: nullableNumber(1950, 2200), releases: z.array(z.object({ platformId: id, date })).max(100).default([]),
  subscriptions: z.array(z.object({ service: z.enum(SUBSCRIPTION_SERVICES) })).max(8)
    .refine(entries => new Set(entries.map(entry => entry.service)).size === entries.length, 'Each subscription service can only be added once').default([]),
  igdbId: z.number().int().positive().nullable().default(null), sourceUrl: url,
  wishlist: z.boolean().default(false), wishlistPlatforms: z.array(id).max(100).default([]), showOnBoard: z.boolean().default(false),
  rating: nullableNumber(0, 10), notes: text(20000).default(''),
})
const acquisition = {
  acquiredOn: date, price: nullableNumber(0, 1000000000), currency: z.string().regex(/^[A-Z]{3}$/).default('USD'),
  condition: z.enum(['unknown', 'new', 'excellent', 'good', 'fair', 'poor']).default('unknown'),
  state: z.enum(['owned', 'lent', 'sold', 'lost']).default('owned'), location: text(200).default(''),
  lentTo: text(200).default(''), notes: text(10000).default(''),
}
const hardware = z.object({ platformId: id, nickname: name, model: text(100).default(''), color: text(100).default(''), storage: text(100).default(''), region: text(100).default(''), serial: text(200).default(''), image: url, ...acquisition })
const storefront = text(100).refine(value => storefrontId(value) !== undefined, 'Choose a storefront from the list, or choose Other').transform(storefrontId).default('')
const copy = z.object({ gameId: objectId, platformId: id, format: z.enum(['physical', 'digital']), storefront, storefrontOther: text(100).default(''), edition: text(200).default(''), region: text(100).default(''), packaging: z.enum(['unknown', 'complete', 'boxed', 'loose', 'sealed', 'not-applicable']).default('unknown'), ...acquisition })
  .refine(value => value.storefront !== 'other' || !!value.storefrontOther, { path: ['storefrontOther'], message: 'Enter the store name for Other' })
  .overwrite(value => ({ ...value, storefrontOther: value.storefront === 'other' ? value.storefrontOther : '' }))
const completion = z.object({ platinum: z.boolean().default(false), base: z.boolean().default(false), all: z.boolean().default(false), manual: z.boolean().default(false), completedOn: date }).default({})
const hunt = z.object({
  gameId: objectId, platformId: id, service: z.enum(SERVICES).default('none'), variant: text(100).default(''),
  expectedDifficulty: z.number().int('Use a whole-number difficulty from 1 to 10').min(1).max(10).nullable().default(null), expectedHours: nullableNumber(Number.MIN_VALUE, 100000),
  status: z.enum(STATUSES).default('planned'), hasAchievements: z.boolean().default(true), hasPlatinum: z.boolean().default(false),
  goal: z.enum(['platinum', 'base', 'all', 'manual']).default('base'),
  earned: z.number().int().min(0).max(100000).default(0), total: z.number().int().min(0).max(100000).nullable().default(null),
  completion, notes: text(20000).default(''),
})
const notebookTracking = {
  sectionIds: z.array(id).max(200).default([]), mainSectionId: id.nullable().default(null),
  type: z.enum(['checkbox', 'counter']).default('checkbox'), done: z.boolean().default(false),
  current: z.number().int().nonnegative().max(100000).default(0), target: z.number().int().positive().max(100000).default(1),
  url, missable: z.boolean().default(false),
}
const notebookV2 = z.object({
  formatVersion: z.literal(2),
  revision: z.number().int().nonnegative(),
  trophies: z.array(z.object({ id, title: name, description: text(10000).default(''), ...notebookTracking })).max(200),
  sections: z.array(z.object({ id, title: name })).max(200),
  items: z.array(z.object({
    id, trophyId: id, parentId: id.nullable().default(null), title: name,
    ...notebookTracking, inheritTrophySections: z.boolean().default(true), notes: text(10000).default(''),
  })).max(5000),
}).superRefine((value, ctx) => {
  const trophies = new Map(value.trophies.map(trophy => [trophy.id, trophy])), sections = new Set(value.sections.map(section => section.id)), items = new Map(value.items.map(item => [item.id, item]))
  const issue = message => ctx.addIssue({ code: 'custom', message })
  if (trophies.size !== value.trophies.length || sections.size !== value.sections.length || items.size !== value.items.length) issue('IDs must be unique within trophies, sections, and items')
  for (const trophy of value.trophies) {
    if (new Set(trophy.sectionIds).size !== trophy.sectionIds.length) issue('Trophy section links must be unique')
    if (trophy.sectionIds.some(sectionId => !sections.has(sectionId))) issue('Linked trophy section does not exist')
    if (trophy.current > trophy.target) issue('Trophy counter cannot exceed its target')
    if (trophy.sectionIds.length ? !trophy.sectionIds.includes(trophy.mainSectionId) : trophy.mainSectionId !== null) issue('Trophy main section must be one of its linked sections, or empty when there are no links')
  }
  for (const item of value.items) {
    if (!trophies.has(item.trophyId)) issue('Item trophy does not exist')
    if (new Set(item.sectionIds).size !== item.sectionIds.length) issue('Item section links must be unique')
    if (item.sectionIds.some(sectionId => !sections.has(sectionId))) issue('Linked section does not exist')
    if (item.current > item.target) issue('Counter cannot exceed its target')
    if (item.parentId) {
      const parent = items.get(item.parentId)
      if (!parent || parent.trophyId !== item.trophyId) issue('Parent must be in the same trophy')
    }
  }
  const effective = new Map()
  for (const item of value.items) {
    let cursor = item
    const branch = [], seen = new Set()
    while (cursor && !effective.has(cursor.id)) {
      if (seen.has(cursor.id)) { issue('Checklist hierarchy cannot contain cycles'); return }
      seen.add(cursor.id); branch.push(cursor)
      cursor = items.get(cursor.parentId)
    }
    let links = cursor ? effective.get(cursor.id) : new Set()
    for (let index = branch.length - 1; index >= 0; index--) {
      const entry = branch[index]
      if (!entry.parentId && entry.inheritTrophySections) links = new Set(trophies.get(entry.trophyId)?.sectionIds || [])
      links = new Set([...links, ...entry.sectionIds])
      effective.set(entry.id, links)
    }
  }
  for (const item of value.items) {
    const links = effective.get(item.id)
    if (links.size ? !links.has(item.mainSectionId) : item.mainSectionId !== null) issue('Main section must be one of the item’s direct or inherited sections, or empty when there are no links')
  }
})
const notebook = z.preprocess((input, ctx) => {
  try { return normalizeNotebook(input) }
  catch (error) { ctx.addIssue({ code: 'custom', message: error.message }); return z.NEVER }
}, notebookV2)
const filter = z.object({
  platforms: z.array(id).max(100).default([]), service: z.enum(['', ...SERVICES]).default(''),
  ownership: z.enum(['all', 'owned', 'wishlist', 'unowned', 'subscription', 'ps-plus', ...SUBSCRIPTION_SERVICES]).default('all'), status: z.enum(['', ...STATUSES]).default(''),
  difficulty: z.string().regex(/^(|unknown|10|[1-9])$/).default(''),
  format: z.enum(['', 'physical', 'digital']).default(''),
  sort: z.enum(['hours', 'status', 'added', 'title']).default('hours'), direction: z.enum(['asc', 'desc']).default('asc'),
})
const preferences = z.object({ theme: z.enum(['dark', 'light']).default('dark'), catalog: filter.nullable().default(null), hunts: filter.nullable().default(null) })
module.exports = { z, objectId, platform, game, copy, hardware, hunt, notebook, preferences, filter, memberships, membershipUpdate }
