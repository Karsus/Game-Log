const { test } = require('node:test')
const assert = require('node:assert/strict')
const { emptyNotebook, normalizeNotebook } = require('../domain/notebook')
const { notebook } = require('../domain/validation')

const trophyDefaults = { description: '', type: 'checkbox', done: false, current: 0, target: 1, sectionIds: [], mainSectionId: null, missable: false, url: '' }
const item = (id, extra = {}) => ({ id, trophyId: 'flowers', title: id, ...extra })
const fixture = () => ({
  formatVersion: 2, revision: 4,
  trophies: [{ id: 'flowers', title: 'Find every flower', done: false }, { id: 'gifts', title: 'Find every gift', done: true }],
  sections: [{ id: 'first', title: 'Chapter 1' }, { id: 'route', title: 'Collectibles route' }],
  items: [
    item('parent', { sectionIds: ['first'], mainSectionId: 'first' }),
    item('child', { parentId: 'parent', sectionIds: ['route'], mainSectionId: 'route', type: 'counter', current: 2, target: 4 }),
    item('grandchild', { parentId: 'child', mainSectionId: 'first', done: true }),
    item('gift', { trophyId: 'gifts', done: false }),
  ],
})

test('new notebooks are empty v2 notebooks with independent arrays', () => {
  assert.deepEqual(notebook.parse(emptyNotebook()), { formatVersion: 2, revision: 0, trophies: [], sections: [], items: [] })
  const first = emptyNotebook(), second = emptyNotebook()
  first.trophies.push({ id: 'new', title: 'New', done: false })
  assert.equal(second.trophies.length, 0)
})

test('a first trophy can be saved before any sections or tasks exist', () => {
  const input = { ...emptyNotebook(), trophies: [{ id: 'first-trophy', title: 'Find every flower', done: false }] }
  assert.deepEqual(notebook.parse(input), { ...input, trophies: [{ ...trophyDefaults, ...input.trophies[0] }] })
})

test('legacy notebook conversion preserves progress, IDs, and hierarchy and removes categories', () => {
  const legacy = {
    revision: 9,
    sections: [{ id: 'flowers', title: 'Find every flower' }],
    items: [
      { id: 'parent', sectionId: 'flowers', title: 'Find these flowers', done: true, category: 'Old group', notes: 'Keep the location', url: 'https://example.com/guide', missable: true },
      { id: 'child', sectionId: 'flowers', parentId: 'parent', title: 'Flower count', type: 'counter', target: 6, current: 4, done: false, category: 'Collectibles' },
    ],
  }
  const original = structuredClone(legacy), result = notebook.parse(legacy)
  assert.equal(result.formatVersion, 2)
  assert.equal(result.revision, 9)
  assert.deepEqual(result.trophies, [{ ...trophyDefaults, id: 'flowers', title: 'Find every flower' }])
  assert.deepEqual(result.sections, [])
  assert.deepEqual(result.items[0], { id: 'parent', trophyId: 'flowers', parentId: null, title: 'Find these flowers', sectionIds: [], mainSectionId: null, inheritTrophySections: true, type: 'checkbox', done: true, current: 0, target: 1, notes: 'Keep the location', url: 'https://example.com/guide', missable: true })
  assert.equal(result.items[1].parentId, 'parent')
  assert.equal(result.items[1].current, 4)
  assert.equal(result.items[1].target, 6)
  assert.equal('category' in result.items[1], false)
  assert.equal('sectionId' in result.items[1], false)
  assert.deepEqual(legacy, original)
  assert.deepEqual(notebook.parse({ ...legacy, formatVersion: 1 }), result)
  assert.deepEqual(normalizeNotebook(result), result)
})

test('v2 normalization is idempotent and preserves manual trophy state and explicit direct links', () => {
  const input = fixture(), original = structuredClone(input)
  const result = notebook.parse(input)
  assert.equal(result.trophies[1].done, true)
  assert.deepEqual(result.trophies[1], { ...trophyDefaults, ...input.trophies[1] })
  assert.equal(result.items.every(entry => entry.inheritTrophySections), true)
  assert.equal(result.items[1].current, 2)
  assert.equal(result.items.find(entry => entry.id === 'gift').done, false)
  assert.deepEqual(result.items.find(entry => entry.id === 'grandchild').sectionIds, [])
  assert.equal(result.items.find(entry => entry.id === 'grandchild').mainSectionId, 'first')
  assert.deepEqual(normalizeNotebook(normalizeNotebook(result)), result)
  assert.deepEqual(input, original)
})

test('a main section may come from any ancestor and direct links may overlap inherited links', () => {
  const input = fixture()
  input.items[2].sectionIds = ['first']
  input.items[2].mainSectionId = 'route'
  const result = notebook.parse(input)
  assert.deepEqual(result.items[2].sectionIds, ['first'])
  assert.equal(result.items[2].mainSectionId, 'route')
})

test('a trophy can track a counter and section links without subtasks, retaining progress and metadata', () => {
  const input = fixture()
  input.items = []
  Object.assign(input.trophies[0], { type: 'counter', current: 3, target: 6, done: true, sectionIds: ['first', 'route'], mainSectionId: 'route', missable: true, url: 'https://example.com/trophy', description: 'Find these before leaving.' })
  const before = structuredClone(input), result = notebook.parse(input)
  assert.deepEqual(result.trophies[0], input.trophies[0])
  assert.deepEqual(normalizeNotebook(result), result)
  assert.deepEqual(notebook.parse(result), result)
  result.trophies[0].sectionIds.push('another')
  assert.deepEqual(input, before)
})

test('root tasks inherit trophy sections and descendants inherit the full branch membership', () => {
  const input = fixture()
  Object.assign(input.trophies[0], { sectionIds: ['route'], mainSectionId: 'route' })
  input.items = [
    item('root', { sectionIds: ['first'], mainSectionId: 'route' }),
    item('child', { parentId: 'root', mainSectionId: 'route', inheritTrophySections: false }),
    item('grandchild', { parentId: 'child', mainSectionId: 'first' }),
  ]
  const saved = notebook.parse(input)
  assert.equal(saved.items[0].inheritTrophySections, true)
  assert.equal(saved.items[1].inheritTrophySections, false)
  assert.equal(saved.items[1].mainSectionId, 'route')
  assert.equal(saved.items[2].mainSectionId, 'first')
})

test('independent root copies opt out of trophy membership for their whole subtree', () => {
  const input = fixture()
  Object.assign(input.trophies[0], { sectionIds: ['route'], mainSectionId: 'route' })
  input.items = [
    item('root', { inheritTrophySections: false, sectionIds: ['first'], mainSectionId: 'first' }),
    item('child', { parentId: 'root', mainSectionId: 'first' }),
    item('unlinked', { inheritTrophySections: false }),
  ]
  const saved = notebook.parse(input)
  assert.equal(saved.items[0].inheritTrophySections, false)
  assert.equal(saved.items[1].inheritTrophySections, true)
  assert.equal(saved.items[2].mainSectionId, null)
  for (const position of [0, 1, 2]) {
    const invalid = structuredClone(saved)
    invalid.items[position].mainSectionId = 'route'
    assert.equal(notebook.safeParse(invalid).success, false)
  }
})

test('trophy descriptions preserve multiline text and can be cleared without changing progress', () => {
  const input = fixture()
  input.trophies[0].description = '  Find all flowers.\nCheck the garden before leaving.  '
  const saved = notebook.parse(input)
  assert.equal(saved.trophies[0].description, 'Find all flowers.\nCheck the garden before leaving.')
  assert.equal(saved.trophies[1].description, '')
  assert.deepEqual(normalizeNotebook(saved), saved)
  const cleared = notebook.parse({ ...saved, trophies: saved.trophies.map(trophy => ({ ...trophy, description: '' })) })
  assert.equal(cleared.trophies[0].description, '')
  assert.deepEqual(cleared.items, saved.items)
  assert.equal(cleared.trophies[1].done, true)
})

test('trophy descriptions accept up to 10000 characters and reject malformed values', () => {
  const input = fixture()
  input.trophies[0].description = 'a'.repeat(10000)
  assert.equal(notebook.parse(input).trophies[0].description.length, 10000)
  for (const description of ['a'.repeat(10001), null, 42, {}]) {
    input.trophies[0].description = description
    assert.equal(notebook.safeParse(input).success, false)
  }
})

test('unknown formats and non-object notebooks are rejected', () => {
  for (const input of [null, [], 'notebook', { ...fixture(), formatVersion: 3 }, { ...fixture(), formatVersion: '2' }, { ...fixture(), formatVersion: null }]) {
    assert.throws(() => normalizeNotebook(input))
    assert.equal(notebook.safeParse(input).success, false)
  }
})

for (const [name, change] of [
  ['duplicate trophy IDs', value => value.trophies.push({ ...value.trophies[0] })],
  ['duplicate section IDs', value => value.sections.push({ ...value.sections[0] })],
  ['duplicate item IDs', value => value.items.push({ ...value.items[0] })],
  ['unknown trophy', value => { value.items[0].trophyId = 'missing' }],
  ['unknown direct section', value => { value.items[0].sectionIds = ['missing'] }],
  ['duplicate direct section', value => { value.items[0].sectionIds = ['first', 'first'] }],
  ['unknown parent', value => { value.items[1].parentId = 'missing' }],
  ['parent in a different trophy', value => { value.items[1].parentId = 'gift' }],
  ['self cycle', value => { value.items[0].parentId = 'parent' }],
  ['multi-level cycle', value => { value.items[0].parentId = 'grandchild' }],
  ['main section not linked directly or inherited', value => { value.items[0].mainSectionId = 'route' }],
  ['missing main section with inherited links', value => { value.items[2].mainSectionId = null }],
  ['main section without any links', value => { value.items[3].mainSectionId = 'first' }],
  ['null section-links array', value => { value.items[0].sectionIds = null }],
  ['counter past its target', value => { value.items[1].current = 5 }],
  ['unknown trophy section', value => { value.trophies[0].sectionIds = ['missing']; value.trophies[0].mainSectionId = 'missing' }],
  ['duplicate trophy section links', value => { value.trophies[0].sectionIds = ['first', 'first']; value.trophies[0].mainSectionId = 'first' }],
  ['null trophy section links', value => { value.trophies[0].sectionIds = null }],
  ['unlinked trophy main section', value => { value.trophies[0].mainSectionId = 'first' }],
  ['missing trophy main section', value => { value.trophies[0].sectionIds = ['first'] }],
  ['trophy counter past target', value => { value.trophies[0].current = 2 }],
  ['negative trophy counter', value => { value.trophies[0].current = -1 }],
  ['fractional trophy counter', value => { value.trophies[0].current = 0.5 }],
  ['zero trophy counter target', value => { value.trophies[0].target = 0 }],
  ['oversized trophy counter target', value => { value.trophies[0].target = 100001 }],
  ['invalid trophy tracking type', value => { value.trophies[0].type = 'percentage' }],
  ['invalid trophy guide URL', value => { value.trophies[0].url = 'javascript:alert(1)' }],
  ['invalid trophy missable flag', value => { value.trophies[0].missable = 'yes' }],
  ['invalid trophy inheritance flag', value => { value.items[0].inheritTrophySections = null }],
]) test(`v2 rejects ${name} without repairing the submitted data`, () => {
  const input = fixture()
  change(input)
  const original = structuredClone(input)
  assert.equal(notebook.safeParse(input).success, false)
  assert.deepEqual(input, original)
})

test('deep inherited section chains validate without recursive traversal', () => {
  const value = fixture()
  Object.assign(value.trophies[0], { sectionIds: ['first'], mainSectionId: 'first' })
  value.items = Array.from({ length: 2000 }, (_, index) => item(`node-${index}`, { parentId: index ? `node-${index - 1}` : null, mainSectionId: 'first' }))
  assert.equal(notebook.parse(value).items.length, 2000)
})
