const { z } = require('zod')
const { SERVICES, STATUSES } = require('./constants')
const text = (max = 500) => z.string().trim().max(max)
const name = text(200).min(1, 'A name is required')
const id = z.string().min(1).max(100)
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid record ID')
const nullableNumber = (min, max) => z.number().finite().min(min).max(max).nullable().default(null)
const url = text(2000).refine(v => !v || /^https?:\/\//i.test(v), 'Use an http or https URL').default('')
const date = z.string().refine(v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)), 'Use YYYY-MM-DD').default('')
const platform = z.object({ name, manufacturer: text(100).default('Other'), service: z.enum(SERVICES).default('none'), variants: z.array(text(100)).max(50).default([]) })
const game = z.object({
  title: name, description: text(20000).default(''), cover: url,
  developer: text(500).default(''), publisher: text(500).default(''), genres: z.array(text(100)).max(30).default([]),
  releaseYear: nullableNumber(1950, 2200), releases: z.array(z.object({ platformId: id, date })).max(100).default([]),
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
const copy = z.object({ gameId: objectId, platformId: id, format: z.enum(['physical', 'digital']), storefront: text(100).default(''), edition: text(200).default(''), region: text(100).default(''), packaging: z.enum(['unknown', 'complete', 'boxed', 'loose', 'sealed', 'not-applicable']).default('unknown'), ...acquisition })
const completion = z.object({ platinum: z.boolean().default(false), base: z.boolean().default(false), all: z.boolean().default(false), manual: z.boolean().default(false), completedOn: date }).default({})
const hunt = z.object({
  gameId: objectId, platformId: id, service: z.enum(SERVICES).default('none'), variant: text(100).default(''),
  expectedDifficulty: z.number().int('Use a whole-number difficulty from 1 to 10').min(1).max(10).nullable().default(null), expectedHours: nullableNumber(Number.MIN_VALUE, 100000),
  status: z.enum(STATUSES).default('planned'), hasAchievements: z.boolean().default(true), hasPlatinum: z.boolean().default(false),
  goal: z.enum(['platinum', 'base', 'all', 'manual']).default('base'),
  earned: z.number().int().min(0).max(100000).default(0), total: z.number().int().min(0).max(100000).nullable().default(null),
  completion, notes: text(20000).default(''),
})
const notebook = z.object({
  revision: z.number().int().nonnegative(),
  sections: z.array(z.object({ id, title: name })).min(1).max(200),
  items: z.array(z.object({
    id, sectionId: id, parentId: id.nullable().default(null), title: name, category: text(100).default('General'),
    type: z.enum(['checkbox', 'counter']).default('checkbox'), done: z.boolean().default(false),
    current: z.number().int().nonnegative().max(100000).default(0), target: z.number().int().positive().max(100000).default(1),
    notes: text(10000).default(''), url, missable: z.boolean().default(false),
  })).max(5000),
}).superRefine((value, ctx) => {
  const sections = new Set(value.sections.map(s => s.id)), items = new Map(value.items.map(i => [i.id, i]))
  const issue = message => ctx.addIssue({ code: 'custom', message })
  if (sections.size !== value.sections.length || items.size !== value.items.length) issue('IDs must be unique')
  for (const item of value.items) {
    if (!sections.has(item.sectionId)) issue('Item section does not exist')
    if (item.current > item.target) issue('Counter cannot exceed its target')
    let cursor = item, seen = new Set([item.id])
    while (cursor.parentId) {
      const parent = items.get(cursor.parentId)
      if (!parent || parent.sectionId !== item.sectionId) { issue('Parent must be in the same section'); break }
      if (seen.has(parent.id)) { issue('Checklist hierarchy cannot contain cycles'); break }
      seen.add(parent.id); cursor = parent
    }
  }
})
const filter = z.object({
  platforms: z.array(id).max(100).default([]), service: z.enum(['', ...SERVICES]).default(''),
  ownership: z.enum(['all', 'owned', 'wishlist', 'unowned']).default('all'), status: z.enum(['', ...STATUSES]).default(''),
  difficulty: z.string().regex(/^(|unknown|10|[1-9])$/).default(''),
  format: z.enum(['', 'physical', 'digital']).default(''),
  sort: z.enum(['hours', 'status', 'added', 'title']).default('hours'), direction: z.enum(['asc', 'desc']).default('asc'),
})
const preferences = z.object({ theme: z.enum(['dark', 'light']).default('dark'), catalog: filter.nullable().default(null), hunts: filter.nullable().default(null) })
module.exports = { z, objectId, platform, game, copy, hardware, hunt, notebook, preferences, filter }
