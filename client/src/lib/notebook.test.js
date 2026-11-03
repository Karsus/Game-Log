import { describe, expect, it } from 'vitest'
import { canMoveNotebookItem, descendantIds, duplicateNotebookItem, moveNotebookGroup, moveNotebookItem, moveNotebookSibling, normalizeNotebook, notebookIndex, repairMainSections } from './notebook'

const item = (id, trophyId = 'flowers', parentId = null, extra = {}) => ({
  id, trophyId, parentId, title: id, sectionIds: [], mainSectionId: null, inheritTrophySections: true, type: 'checkbox', done: false,
  current: 0, target: 1, notes: `Notes for ${id}`, url: 'https://example.com/guide', missable: false, ...extra,
})
const fixture = () => repairMainSections({
  formatVersion: 2, revision: 7,
  trophies: [{ id: 'flowers', title: 'Flowers', done: true }, { id: 'gifts', title: 'Gifts', done: false }, { id: 'empty', title: 'Empty', done: false }],
  sections: [{ id: 'chapter1', title: 'Chapter 1' }, { id: 'chapter2', title: 'Chapter 2' }, { id: 'chapter3', title: 'Chapter 3' }],
  // Old edits can put descendants before their parents or interleave unrelated roots.
  items: [
    item('parent', 'flowers', null, { sectionIds: ['chapter1'], mainSectionId: 'chapter1', done: true, missable: true }),
    item('other'),
    item('grandchild', 'flowers', 'child', { sectionIds: ['chapter3'], mainSectionId: 'chapter3', type: 'counter', current: 2, target: 3 }),
    item('destination', 'gifts', null, { sectionIds: ['chapter2'], mainSectionId: 'chapter2' }),
    item('child', 'flowers', 'parent', { done: true }),
    item('destination-child', 'gifts', 'destination'),
    item('last-child', 'flowers', 'parent'),
    item('last'),
  ],
})
const ids = items => items.map(entry => entry.id)
const find = (notebook, id) => notebook.items.find(entry => entry.id === id)
const siblings = (notebook, trophyId, parentId = null) => ids(notebook.items.filter(entry => entry.trophyId === trophyId && entry.parentId === parentId))
const subtreeIds = new Set(['parent', 'grandchild', 'child', 'last-child'])

describe('notebook version conversion', () => {
  it('converts legacy sections to unearned trophies without losing task data or revision', () => {
    const legacyItem = { ...item('flower'), sectionId: 'old-section', category: 'Collectibles', done: true, current: 2, target: 4 }
    delete legacyItem.trophyId
    const old = { revision: 9, sections: [{ id: 'old-section', title: 'Get flowers' }], items: [legacyItem] }, before = structuredClone(old)
    const next = normalizeNotebook(old)
    expect(next).toMatchObject({ formatVersion: 2, revision: 9, trophies: [{ id: 'old-section', title: 'Get flowers', done: false }], sections: [] })
    const { category, sectionId, ...retained } = legacyItem
    expect(next.items).toEqual([{ ...retained, trophyId: sectionId, sectionIds: [], mainSectionId: null }])
    expect(old).toEqual(before)
    expect(normalizeNotebook({ ...old, formatVersion: 1 })).toEqual(next)
  })
  it('is idempotent for v2 without reinterpreting sections and removes legacy category fields', () => {
    const notebook = fixture()
    notebook.items[0].category = 'Old metadata'
    notebook.items[0].sectionId = 'obsolete'
    const normalized = normalizeNotebook(notebook)
    expect(normalizeNotebook(normalized)).toEqual(normalized)
    expect(normalized.sections).toEqual(notebook.sections)
    expect(normalized.trophies[0].done).toBe(true)
    expect(normalized.items[0]).not.toHaveProperty('category')
    expect(normalized.items[0]).not.toHaveProperty('sectionId')
    expect(normalized.items[0].sectionIds).toEqual(['chapter1'])
  })
  it('adds trophy tracking defaults to old v2 notebooks and preserves configured trophy tasks', () => {
    const notebook = fixture()
    delete notebook.items[0].inheritTrophySections
    Object.assign(notebook.trophies[1], { type: 'counter', current: 3, target: 8, sectionIds: ['chapter2'], mainSectionId: 'chapter2', missable: true, url: 'https://example.com/trophy', description: 'Bring eight gifts.' })
    notebook.items[1].inheritTrophySections = false
    const before = structuredClone(notebook), normalized = normalizeNotebook(notebook)
    expect(normalized.trophies[0]).toEqual({ id: 'flowers', title: 'Flowers', description: '', done: true, type: 'checkbox', target: 1, current: 0, sectionIds: [], mainSectionId: null, missable: false, url: '' })
    expect(normalized.trophies[1]).toEqual(notebook.trophies[1])
    expect(normalized.items[0].inheritTrophySections).toBe(true)
    expect(normalized.items[1].inheritTrophySections).toBe(false)
    expect(normalizeNotebook(normalized)).toEqual(normalized)
    normalized.trophies[1].sectionIds.push('chapter3')
    expect(notebook).toEqual(before)
  })
  it('supports empty notebooks and refuses unknown or malformed versions', () => {
    expect(normalizeNotebook()).toEqual({ formatVersion: 2, revision: 0, trophies: [], sections: [], items: [] })
    expect(() => normalizeNotebook({ formatVersion: 3 })).toThrow('unsupported')
    expect(() => normalizeNotebook({ ...fixture(), formatVersion: null })).toThrow('unsupported')
    expect(() => normalizeNotebook({ formatVersion: 2, sections: 'bad' })).toThrow('Invalid')
    expect(() => normalizeNotebook('bad')).toThrow('Invalid')
  })
})

describe('section membership and main sections', () => {
  it('inherits trophy links through roots and descendants while keeping direct links distinct', () => {
    const notebook = fixture()
    notebook.trophies[0].sectionIds = ['chapter2']
    notebook.items.push(item('future'))
    const index = notebookIndex(notebook)
    expect(index.trophies.get('flowers')).toBe(notebook.trophies[0])
    expect([...index.trophySections.get('flowers')]).toEqual(['chapter2'])
    expect([...index.inheritedSections.get('parent')]).toEqual(['chapter2'])
    expect([...index.effectiveSections.get('parent')]).toEqual(['chapter2', 'chapter1'])
    expect([...index.effectiveSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter2', 'chapter3'])
    expect([...index.effectiveSections.get('future')]).toEqual(['chapter2'])
    expect([...index.effectiveSections.get('destination-child')]).toEqual(['chapter2'])
    expect(find(notebook, 'parent').sectionIds).toEqual(['chapter1'])
  })
  it('lets independent roots opt out of trophy links while their descendants still inherit their parent', () => {
    const notebook = fixture()
    notebook.trophies[0].sectionIds = ['chapter2']
    find(notebook, 'parent').inheritTrophySections = false
    find(notebook, 'child').inheritTrophySections = false
    const index = notebookIndex(notebook)
    expect([...index.inheritedSections.get('parent')]).toEqual([])
    expect([...index.effectiveSections.get('parent')]).toEqual(['chapter1'])
    expect([...index.inheritedSections.get('child')]).toEqual(['chapter1'])
    expect([...index.effectiveSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter3'])
    expect([...index.effectiveSections.get('other')]).toEqual(['chapter2'])
  })
  it('repairs trophy main sections and uses them as the fallback for inherited task branches', () => {
    const notebook = fixture()
    Object.assign(notebook.trophies[0], { sectionIds: ['chapter3', 'chapter2'], mainSectionId: 'invalid' })
    find(notebook, 'parent').mainSectionId = null
    find(notebook, 'child').mainSectionId = null
    Object.assign(find(notebook, 'last'), { inheritTrophySections: false, sectionIds: ['chapter1'], mainSectionId: null })
    const repaired = repairMainSections(notebook)
    expect(repaired.trophies[0].mainSectionId).toBe('chapter2')
    expect(find(repaired, 'parent').mainSectionId).toBe('chapter2')
    expect(find(repaired, 'child').mainSectionId).toBe('chapter2')
    expect(find(repaired, 'grandchild').mainSectionId).toBe('chapter3')
    expect(find(repaired, 'other').mainSectionId).toBe('chapter2')
    expect(find(repaired, 'last').mainSectionId).toBe('chapter1')
    expect(repairMainSections(repaired)).toBe(repaired)
    const unlinked = repairMainSections({ ...repaired, trophies: repaired.trophies.map(trophy => ({ ...trophy, sectionIds: [] })) })
    expect(unlinked.trophies[0].mainSectionId).toBeNull()
    expect(find(unlinked, 'other').mainSectionId).toBeNull()
    expect(find(unlinked, 'parent').mainSectionId).toBe('chapter1')
  })
  it('indexes inherited and direct links without duplicating membership or leaf objectives', () => {
    const notebook = fixture()
    find(notebook, 'child').sectionIds = ['chapter1', 'chapter2']
    const index = notebookIndex(notebook)
    expect(ids(index.children.get(null))).toEqual(['parent', 'other', 'destination', 'last'])
    expect([...index.inheritedSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter2'])
    expect([...index.effectiveSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter2', 'chapter3'])
    expect([...index.effectiveSections.get('child')].sort()).toEqual(['chapter1', 'chapter2'])
    expect(ids(index.leaves)).toEqual(['other', 'grandchild', 'destination-child', 'last-child', 'last'])
  })
  it('preserves valid choices, otherwise prefers the nearest parent main then section order', () => {
    const notebook = fixture()
    Object.assign(find(notebook, 'parent'), { sectionIds: ['chapter3', 'chapter2'], mainSectionId: 'invalid' })
    Object.assign(find(notebook, 'child'), { sectionIds: ['chapter1'], mainSectionId: null })
    const repaired = repairMainSections(notebook)
    expect(find(repaired, 'parent').mainSectionId).toBe('chapter2')
    expect(find(repaired, 'child').mainSectionId).toBe('chapter2')
    expect(find(repaired, 'grandchild').mainSectionId).toBe('chapter3')
    expect(find(repaired, 'other').mainSectionId).toBeNull()
    expect(repairMainSections(repaired)).toBe(repaired)
  })
  it('keeps overlapping direct links and automatically includes future descendants', () => {
    let notebook = fixture()
    find(notebook, 'child').sectionIds = ['chapter2']
    notebook = moveNotebookItem(notebook, 'parent', { type: 'section', id: 'chapter2' })
    expect(find(notebook, 'child').sectionIds).toEqual(['chapter2'])
    find(notebook, 'parent').sectionIds = ['chapter1']
    notebook.items.push(item('future', 'flowers', 'parent'))
    notebook = repairMainSections(notebook)
    expect(notebookIndex(notebook).effectiveSections.get('child').has('chapter2')).toBe(true)
    expect([...notebookIndex(notebook).effectiveSections.get('future')]).toEqual(['chapter1'])
    expect(find(notebook, 'future').mainSectionId).toBe('chapter1')
  })
  it('keeps inherited membership when direct links are removed and repairs a removed main', () => {
    const notebook = fixture()
    Object.assign(find(notebook, 'child'), { sectionIds: [], mainSectionId: 'chapter2' })
    const next = repairMainSections(notebook)
    expect([...notebookIndex(next).effectiveSections.get('child')]).toEqual(['chapter1'])
    expect(find(next, 'child').mainSectionId).toBe('chapter1')
  })
  it('does not hang when inspecting malformed cycles or missing parents', () => {
    const notebook = fixture()
    find(notebook, 'parent').parentId = 'grandchild'
    find(notebook, 'other').parentId = 'missing'
    expect(descendantIds(notebook, 'parent')).toEqual(subtreeIds)
    expect(descendantIds(notebook, 'missing').size).toBe(0)
    expect(notebookIndex(notebook).effectiveSections.get('child').has('chapter1')).toBe(true)
    expect(repairMainSections(notebook).items).toHaveLength(notebook.items.length)
  })
})

describe('independent task copies across sections', () => {
  it('copies entire scattered subtrees with fresh IDs, preserved content, and independent reset progress', () => {
    const notebook = fixture(), before = structuredClone(notebook)
    const next = duplicateNotebookItem(notebook, 'parent', ['chapter2', 'chapter3'])
    const originals = notebook.items.filter(entry => subtreeIds.has(entry.id)), copies = next.items.slice(notebook.items.length)
    expect(copies).toHaveLength(8)
    expect(new Set(ids(next.items)).size).toBe(next.items.length)
    expect(next.items.slice(0, notebook.items.length)).toEqual(notebook.items)
    expect(next.trophies).toBe(notebook.trophies)
    expect(next.sections).toBe(notebook.sections)
    expect(next.revision).toBe(notebook.revision)
    const index = notebookIndex(next)
    for (const [groupIndex, sectionId] of ['chapter2', 'chapter3'].entries()) {
      const group = copies.slice(groupIndex * originals.length, (groupIndex + 1) * originals.length)
      const copiedIds = new Map(originals.map((entry, position) => [entry.id, group[position].id]))
      originals.forEach((original, position) => {
        expect(group[position]).toEqual({
          ...original, id: copiedIds.get(original.id), parentId: original.id === 'parent' ? null : copiedIds.get(original.parentId),
          inheritTrophySections: original.id === 'parent' ? false : original.inheritTrophySections,
          sectionIds: original.id === 'parent' ? [sectionId] : [], mainSectionId: sectionId, done: false, current: 0,
        })
        expect([...index.effectiveSections.get(group[position].id)]).toEqual([sectionId])
      })
    }
    copies[1].current = 1
    copies[0].done = true
    copies[0].sectionIds.push('chapter1')
    expect(copies[5].current).toBe(0)
    expect(copies[4].done).toBe(false)
    expect(copies[4].sectionIds).toEqual(['chapter3'])
    expect(notebook).toEqual(before)
  })
  it('copies nested, multi-linked sources as separate roots with only each destination membership', () => {
    const notebook = fixture()
    notebook.trophies[0].sectionIds = ['chapter1', 'chapter2', 'chapter3']
    Object.assign(find(notebook, 'child'), { sectionIds: ['chapter1', 'chapter2'], mainSectionId: 'chapter2' })
    const before = structuredClone(notebook)
    const next = duplicateNotebookItem(notebook, 'child', ['chapter1', 'chapter2'])
    const copies = next.items.slice(notebook.items.length), index = notebookIndex(next)
    expect(copies).toHaveLength(4)
    for (const sectionId of ['chapter1', 'chapter2']) {
      const root = copies.find(entry => entry.title === 'child' && entry.mainSectionId === sectionId)
      const child = copies.find(entry => entry.title === 'grandchild' && entry.mainSectionId === sectionId)
      expect(root).toMatchObject({ parentId: null, trophyId: 'flowers', sectionIds: [sectionId], inheritTrophySections: false })
      expect(child).toMatchObject({ parentId: root.id, sectionIds: [], type: 'counter', target: 3 })
      expect([...index.effectiveSections.get(child.id)]).toEqual([sectionId])
    }
    expect(notebook).toEqual(before)
  })
  it('deduplicates destinations and allows a copy into the source section', () => {
    const notebook = fixture(), next = duplicateNotebookItem(notebook, 'parent', ['chapter1', 'chapter1'])
    expect(next.items).toHaveLength(notebook.items.length + 4)
    expect(next.items.slice(notebook.items.length).every(entry => entry.mainSectionId === 'chapter1')).toBe(true)
  })
  it.each([
    ['missing', ['chapter1'], 'task no longer exists'],
    ['parent', [], 'Choose at least one'],
    ['parent', null, 'Choose at least one'],
    ['parent', 'chapter1', 'Choose at least one'],
    ['parent', ['chapter1', 'missing'], 'section no longer exists'],
  ])('rejects stale sources or invalid destinations without changing the notebook (%s, %j)', (itemId, sections, message) => {
    const notebook = fixture(), before = structuredClone(notebook)
    expect(() => duplicateNotebookItem(notebook, itemId, sections)).toThrow(message)
    expect(notebook).toEqual(before)
  })
  it.each([
    notebook => { find(notebook, 'parent').parentId = 'grandchild' },
    notebook => { find(notebook, 'parent').parentId = 'missing' },
    notebook => { find(notebook, 'child').trophyId = 'gifts' },
    notebook => { notebook.trophies = [] },
  ])('rejects an invalid source hierarchy or trophy', invalidate => {
    const notebook = fixture()
    invalidate(notebook)
    const before = structuredClone(notebook)
    expect(() => duplicateNotebookItem(notebook, 'parent', ['chapter1'])).toThrow('invalid')
    expect(notebook).toEqual(before)
  })
  it('counts every descendant and unique destination against the 5,000-task limit before changing anything', () => {
    const notebook = fixture()
    notebook.items.push(...Array.from({ length: 4992 - notebook.items.length }, (_, index) => item(`filler-${index}`)))
    const before = structuredClone(notebook)
    const exact = duplicateNotebookItem(notebook, 'parent', ['chapter1', 'chapter2', 'chapter2'])
    expect(exact.items).toHaveLength(5000)
    expect(() => duplicateNotebookItem(notebook, 'parent', ['chapter1', 'chapter2', 'chapter3'])).toThrow('5,000 tasks')
    expect(() => duplicateNotebookItem(exact, 'other', ['chapter1'])).toThrow('5,000 tasks')
    expect(notebook).toEqual(before)
  })
})

describe('General tree movement', () => {
  it('inherits a destination trophy when moving an ordinary branch but preserves independent root opt-outs', () => {
    const notebook = fixture()
    Object.assign(notebook.trophies[1], { sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    const moved = moveNotebookItem(notebook, 'other', { type: 'trophy', id: 'gifts' })
    expect([...notebookIndex(moved).effectiveSections.get('other')]).toEqual(['chapter2'])
    expect(find(moved, 'other').mainSectionId).toBe('chapter2')
    find(notebook, 'other').inheritTrophySections = false
    const independent = moveNotebookItem(notebook, 'other', { type: 'trophy', id: 'gifts' })
    expect([...notebookIndex(independent).effectiveSections.get('other')]).toEqual([])
    expect(find(independent, 'other').mainSectionId).toBeNull()
  })
  it('moves a complete branch between trophies, retaining all fields, direct links, and unrelated order', () => {
    const notebook = fixture(), before = structuredClone(notebook)
    const next = moveNotebookItem(notebook, 'parent', { type: 'trophy', id: 'empty' })
    expect(next.revision).toBe(7)
    expect(next.trophies).toBe(notebook.trophies)
    expect(siblings(next, 'flowers')).toEqual(['other', 'last'])
    expect(siblings(next, 'empty')).toEqual(['parent'])
    for (const original of notebook.items) expect(find(next, original.id)).toEqual(subtreeIds.has(original.id) ? { ...original, trophyId: 'empty' } : original)
    expect(ids(next.items.filter(entry => !subtreeIds.has(entry.id)))).toEqual(ids(notebook.items.filter(entry => !subtreeIds.has(entry.id))))
    expect(ids(next.items.filter(entry => subtreeIds.has(entry.id)))).toEqual(ids(notebook.items.filter(entry => subtreeIds.has(entry.id))))
    expect(notebook).toEqual(before)
  })
  it('nests across trophies and inherits new membership while retaining valid main choices', () => {
    const next = moveNotebookItem(fixture(), 'parent', { type: 'item', id: 'destination', placement: 'inside' })
    expect(siblings(next, 'gifts', 'destination')).toEqual(['destination-child', 'parent'])
    expect(find(next, 'parent')).toMatchObject({ parentId: 'destination', trophyId: 'gifts', sectionIds: ['chapter1'], mainSectionId: 'chapter1' })
    expect(find(next, 'grandchild')).toMatchObject({ trophyId: 'gifts', parentId: 'child', current: 2, mainSectionId: 'chapter3' })
    expect([...notebookIndex(next).effectiveSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter2', 'chapter3'])
  })
  it('promotes a branch, removing inherited links and repairing main choices while keeping direct links', () => {
    const next = moveNotebookItem(fixture(), 'child', { type: 'trophy', id: 'flowers' })
    expect(siblings(next, 'flowers')).toEqual(['parent', 'other', 'last', 'child'])
    expect(find(next, 'child').mainSectionId).toBeNull()
    expect(find(next, 'grandchild')).toMatchObject({ parentId: 'child', mainSectionId: 'chapter3', sectionIds: ['chapter3'] })
    expect([...notebookIndex(next).effectiveSections.get('grandchild')]).toEqual(['chapter3'])
  })
  it('moves between parents using a sibling anchor and repairs inherited main sections', () => {
    const next = moveNotebookItem(fixture(), 'child', { type: 'item', id: 'destination-child', placement: 'before' })
    expect(siblings(next, 'gifts', 'destination')).toEqual(['child', 'destination-child'])
    expect(find(next, 'child').mainSectionId).toBe('chapter2')
    expect(find(next, 'grandchild')).toMatchObject({ trophyId: 'gifts', parentId: 'child', mainSectionId: 'chapter3' })
  })
  it('reorders against full siblings and retains no-op identity even with scattered descendants', () => {
    const notebook = fixture()
    expect(siblings(moveNotebookItem(notebook, 'last', { type: 'item', id: 'parent', placement: 'after' }), 'flowers')).toEqual(['parent', 'last', 'other'])
    expect(moveNotebookItem(notebook, 'parent', { type: 'item', id: 'other', placement: 'before' })).toBe(notebook)
    expect(moveNotebookItem(notebook, 'last', { type: 'trophy', id: 'flowers' })).toBe(notebook)
    expect(moveNotebookItem(notebook, 'last-child', { type: 'item', id: 'parent', placement: 'inside' })).toBe(notebook)
  })
  it.each([
    ['parent', { type: 'item', id: 'parent', placement: 'inside' }],
    ['parent', { type: 'item', id: 'grandchild', placement: 'inside' }],
    ['parent', { type: 'item', id: 'child', placement: 'before' }],
    ['parent', { type: 'item', id: 'child', placement: 'after' }],
    ['parent', { type: 'trophy', id: 'missing' }],
    ['parent', { type: 'section', id: 'missing' }],
    ['parent', { type: 'item', id: 'missing', placement: 'inside' }],
    ['missing', { type: 'trophy', id: 'flowers' }],
    ['parent', { type: 'item', id: 'other', placement: 'invalid' }],
    ['parent', null],
  ])('rejects invalid movement of %s to %j', (id, target) => {
    const notebook = fixture()
    expect(canMoveNotebookItem(notebook, id, target)).toBe(false)
    expect(moveNotebookItem(notebook, id, target)).toBe(notebook)
  })
})

describe('section and Grid drops', () => {
  it('does not put an inheriting task in No section under a trophy with links', () => {
    const notebook = fixture(), destination = { type: 'grid', trophyId: 'gifts', sectionId: null }
    Object.assign(notebook.trophies[1], { sectionIds: ['chapter2'], mainSectionId: 'chapter2' })
    expect(canMoveNotebookItem(notebook, 'other', destination)).toBe(false)
    expect(moveNotebookItem(notebook, 'other', destination)).toBe(notebook)
    find(notebook, 'other').inheritTrophySections = false
    expect(canMoveNotebookItem(notebook, 'other', destination)).toBe(true)
    const moved = moveNotebookItem(notebook, 'other', destination)
    expect([...notebookIndex(moved).effectiveSections.get('other')]).toEqual([])
  })
  it('adds a direct section link without moving the task or replacing other links or main', () => {
    const notebook = fixture(), next = moveNotebookItem(notebook, 'child', { type: 'section', id: 'chapter2' })
    expect(ids(next.items)).toEqual(ids(notebook.items))
    expect(find(next, 'child')).toEqual({ ...find(notebook, 'child'), sectionIds: ['chapter2'] })
    expect(notebookIndex(next).effectiveSections.get('grandchild').has('chapter2')).toBe(true)
    expect(moveNotebookItem(next, 'child', { type: 'section', id: 'chapter2' })).toBe(next)
    expect(moveNotebookItem(next, 'child', { type: 'section', id: 'chapter1' })).toBe(next)
  })
  it('sets a first main section when linking an unlinked task', () => {
    const next = moveNotebookItem(fixture(), 'other', { type: 'section', id: 'chapter3' })
    expect(find(next, 'other')).toMatchObject({ sectionIds: ['chapter3'], mainSectionId: 'chapter3' })
  })
  it('links a Grid leaf to another section without changing its parent or main', () => {
    const notebook = fixture(), next = moveNotebookItem(notebook, 'grandchild', { type: 'grid', trophyId: 'flowers', sectionId: 'chapter2' })
    expect(find(next, 'grandchild')).toEqual({ ...find(notebook, 'grandchild'), sectionIds: ['chapter3', 'chapter2'] })
    expect([...notebookIndex(next).effectiveSections.get('grandchild')].sort()).toEqual(['chapter1', 'chapter2', 'chapter3'])
    expect(moveNotebookItem(next, 'grandchild', { type: 'grid', trophyId: 'flowers', sectionId: 'chapter2' })).toBe(next)
  })
  it('clears an incompatible parent on a Grid cross-trophy drop while retaining direct links and metadata', () => {
    const notebook = fixture(), next = moveNotebookItem(notebook, 'grandchild', { type: 'grid', trophyId: 'gifts', sectionId: 'chapter2' })
    expect(find(next, 'grandchild')).toEqual({ ...find(notebook, 'grandchild'), trophyId: 'gifts', parentId: null, sectionIds: ['chapter3', 'chapter2'] })
    expect([...notebookIndex(next).effectiveSections.get('grandchild')].sort()).toEqual(['chapter2', 'chapter3'])
  })
  it('materializes a destination link when cross-trophy movement removes its inherited source', () => {
    const next = moveNotebookItem(fixture(), 'last-child', { type: 'grid', trophyId: 'gifts', sectionId: 'chapter1' })
    expect(find(next, 'last-child')).toMatchObject({ parentId: null, trophyId: 'gifts', sectionIds: ['chapter1'], mainSectionId: 'chapter1' })
  })
  it('reorders Grid objectives from different parents without nesting or changing ownership', () => {
    const notebook = fixture(), next = moveNotebookItem(notebook, 'last-child', { type: 'grid', trophyId: 'flowers', sectionId: 'chapter1', anchorId: 'grandchild', placement: 'before' })
    expect(next.items.indexOf(find(next, 'last-child'))).toBeLessThan(next.items.indexOf(find(next, 'grandchild')))
    expect(find(next, 'last-child').parentId).toBe('parent')
    expect(find(next, 'grandchild').parentId).toBe('child')
    expect(ids(next.items.filter(entry => entry.id !== 'last-child'))).toEqual(ids(notebook.items.filter(entry => entry.id !== 'last-child')))
    expect(moveNotebookItem(next, 'last-child', { type: 'grid', trophyId: 'flowers', sectionId: 'chapter1', anchorId: 'grandchild', placement: 'before' })).toBe(next)
  })
  it('orders unlinked objectives but never silently unlinks a No section drop', () => {
    const notebook = fixture(), next = moveNotebookItem(notebook, 'last', { type: 'grid', trophyId: 'flowers', sectionId: null, anchorId: 'other', placement: 'before' })
    const index = notebookIndex(next)
    expect(ids(index.leaves.filter(entry => index.effectiveSections.get(entry.id).size === 0))).toEqual(['last', 'other'])
    expect(find(next, 'last').sectionIds).toEqual([])
    expect(canMoveNotebookItem(notebook, 'grandchild', { type: 'grid', trophyId: 'gifts', sectionId: null })).toBe(false)
    expect(moveNotebookItem(notebook, 'grandchild', { type: 'grid', trophyId: 'gifts', sectionId: null })).toBe(notebook)
  })
  it.each([
    ['parent', { type: 'grid', trophyId: 'flowers', sectionId: 'chapter1' }],
    ['last', { type: 'grid', trophyId: 'missing', sectionId: null }],
    ['last', { type: 'grid', trophyId: 'flowers', sectionId: 'missing' }],
    ['last', { type: 'grid', trophyId: 'flowers', sectionId: null, anchorId: 'last', placement: 'before' }],
    ['last', { type: 'grid', trophyId: 'flowers', sectionId: null, anchorId: 'parent', placement: 'before' }],
    ['last', { type: 'grid', trophyId: 'flowers', sectionId: null, anchorId: 'grandchild', placement: 'before' }],
    ['last', { type: 'grid', trophyId: 'flowers', sectionId: null, anchorId: 'other', placement: 'inside' }],
  ])('rejects invalid Grid drop of %s onto %j', (id, target) => {
    const notebook = fixture()
    expect(canMoveNotebookItem(notebook, id, target)).toBe(false)
    expect(moveNotebookItem(notebook, id, target)).toBe(notebook)
  })
})

describe('group and sibling ordering', () => {
  it('moves arrows among actual siblings despite interleaved descendants and trophies', () => {
    const notebook = fixture()
    expect(siblings(moveNotebookSibling(notebook, 'other', 1), 'flowers')).toEqual(['parent', 'last', 'other'])
    expect(siblings(moveNotebookSibling(notebook, 'last-child', -1), 'flowers', 'parent')).toEqual(['last-child', 'child'])
    for (const [id, direction] of [['parent', -1], ['last', 1], ['missing', 1], ['parent', 0]]) expect(moveNotebookSibling(notebook, id, direction)).toBe(notebook)
  })
  it.each(['trophies', 'sections'])('reorders %s without changing item data or revision', key => {
    const notebook = fixture(), [first, second, third] = notebook[key]
    expect(ids(moveNotebookGroup(notebook, key, third.id, first.id, 'before')[key])).toEqual([third.id, first.id, second.id])
    const after = moveNotebookGroup(notebook, key, first.id, second.id, 'after')
    expect(ids(after[key])).toEqual([second.id, first.id, third.id])
    expect(after.items).toBe(notebook.items)
    expect(after.revision).toBe(7)
    expect(moveNotebookGroup(notebook, key, first.id, second.id, 'before')).toBe(notebook)
    expect(moveNotebookGroup(notebook, key, first.id, first.id, 'after')).toBe(notebook)
    expect(moveNotebookGroup(notebook, key, 'missing', second.id, 'after')).toBe(notebook)
  })
})
