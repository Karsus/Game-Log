const parentOf = item => item.parentId || null
const sameIds = (left, right) => left.length === right.length && left.every((id, index) => id === right[index])

export function normalizeNotebook(input) {
  if (input == null) return { formatVersion: 2, revision: 0, trophies: [], sections: [], items: [] }
  if (typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid notebook format.')
  const legacy = input.formatVersion === undefined || input.formatVersion === 1
  if (!legacy && input.formatVersion !== 2) throw new Error('This notebook uses an unsupported format version.')
  for (const key of ['sections', 'items', ...(legacy ? [] : ['trophies'])]) {
    if (input[key] !== undefined && !Array.isArray(input[key])) throw new Error('Invalid notebook format.')
  }
  return {
    formatVersion: 2,
    revision: input.revision ?? 0,
    trophies: (legacy ? input.sections || [] : input.trophies || []).map(trophy => ({
      id: trophy.id, title: trophy.title, description: legacy ? '' : trophy.description ?? '', done: legacy ? false : trophy.done ?? false,
      type: legacy ? 'checkbox' : trophy.type ?? 'checkbox', target: legacy ? 1 : trophy.target ?? 1, current: legacy ? 0 : trophy.current ?? 0,
      sectionIds: legacy ? [] : [...(trophy.sectionIds || [])], mainSectionId: legacy ? null : trophy.mainSectionId ?? null,
      missable: legacy ? false : trophy.missable ?? false, url: legacy ? '' : trophy.url ?? '',
    })),
    sections: legacy ? [] : (input.sections || []).map(section => ({ id: section.id, title: section.title })),
    items: (input.items || []).map(entry => {
      const { category: _category, sectionId, ...item } = entry
      return {
        parentId: null, type: 'checkbox', done: false, current: 0, target: 1, notes: '', url: '', missable: false,
        ...item,
        trophyId: legacy ? sectionId : item.trophyId,
        inheritTrophySections: legacy ? true : item.inheritTrophySections ?? true,
        parentId: parentOf(item),
        sectionIds: legacy ? [] : [...(item.sectionIds || [])],
        mainSectionId: legacy ? null : item.mainSectionId ?? null,
      }
    }),
  }
}

export function notebookIndex(notebook) {
  const trophies = new Map((notebook.trophies || []).map(trophy => [trophy.id, trophy]))
  const trophySections = new Map([...trophies.values()].map(trophy => [trophy.id, new Set(trophy.sectionIds || [])]))
  const items = new Map(notebook.items.map(item => [item.id, item])), children = new Map()
  for (const item of notebook.items) {
    const parentId = parentOf(item)
    if (!children.has(parentId)) children.set(parentId, [])
    children.get(parentId).push(item)
  }
  const effectiveSections = new Map(), inheritedSections = new Map()
  for (const item of notebook.items) {
    if (effectiveSections.has(item.id)) continue
    const path = [], seen = new Set()
    let cursor = item
    while (cursor && !effectiveSections.has(cursor.id) && !seen.has(cursor.id)) {
      path.push(cursor)
      seen.add(cursor.id)
      cursor = items.get(parentOf(cursor))
    }
    const cyclic = cursor && seen.has(cursor.id)
    for (const entry of path.reverse()) {
      // Valid trees reuse the resolved parent instead of walking each ancestry repeatedly.
      const inherited = new Set(cyclic ? [] : parentOf(entry)
        ? effectiveSections.get(parentOf(entry)) || []
        : entry.inheritTrophySections !== false ? trophySections.get(entry.trophyId) || [] : [])
      if (cyclic) {
        const visited = new Set([entry.id])
        let ancestor = items.get(parentOf(entry))
        while (ancestor && !visited.has(ancestor.id)) {
          visited.add(ancestor.id)
          for (const sectionId of ancestor.sectionIds || []) inherited.add(sectionId)
          ancestor = items.get(parentOf(ancestor))
        }
      }
      inheritedSections.set(entry.id, inherited)
      effectiveSections.set(entry.id, new Set([...inherited, ...(entry.sectionIds || [])]))
    }
  }
  return { trophies, trophySections, items, children, effectiveSections, inheritedSections, leaves: notebook.items.filter(item => !children.has(item.id)) }
}

// Run after supported edits, not when accepting malformed data from the server.
export function repairMainSections(notebook) {
  const index = notebookIndex(notebook), resolved = new Map()
  let changed = false, trophiesChanged = false
  const trophyMains = new Map()
  const trophies = (notebook.trophies || []).map(trophy => {
    const membership = index.trophySections.get(trophy.id)
    const mainSectionId = membership.has(trophy.mainSectionId) ? trophy.mainSectionId : notebook.sections.find(section => membership.has(section.id))?.id || null
    trophyMains.set(trophy.id, mainSectionId)
    if (trophy.mainSectionId === mainSectionId) return trophy
    changed = true; trophiesChanged = true
    return { ...trophy, mainSectionId }
  })
  for (const item of notebook.items) {
    const path = [], seen = new Set()
    let cursor = item
    while (cursor && !resolved.has(cursor.id) && !seen.has(cursor.id)) {
      seen.add(cursor.id)
      path.push(cursor)
      cursor = index.items.get(parentOf(cursor))
    }
    for (const entry of path.reverse()) {
      const effective = index.effectiveSections.get(entry.id)
      let main = effective.has(entry.mainSectionId) ? entry.mainSectionId : null
      if (!main && effective.size) {
        const ancestors = new Set([entry.id])
        let ancestor = index.items.get(parentOf(entry))
        while (ancestor && !ancestors.has(ancestor.id)) {
          ancestors.add(ancestor.id)
          const inheritedMain = resolved.get(ancestor.id)
          if (inheritedMain && effective.has(inheritedMain)) { main = inheritedMain; break }
          ancestor = index.items.get(parentOf(ancestor))
        }
      }
      if (!main && !parentOf(entry) && entry.inheritTrophySections !== false) {
        const trophyMain = trophyMains.get(entry.trophyId)
        if (effective.has(trophyMain)) main = trophyMain
      }
      if (!main && effective.size) main = notebook.sections.find(section => effective.has(section.id))?.id || null
      resolved.set(entry.id, main)
    }
  }
  const items = notebook.items.map(item => {
    const mainSectionId = resolved.get(item.id) ?? null
    if (item.mainSectionId === mainSectionId) return item
    changed = true
    return { ...item, mainSectionId }
  })
  return changed ? { ...notebook, trophies: trophiesChanged ? trophies : notebook.trophies, items } : notebook
}

export function descendantIds(notebook, itemId) {
  return collectDescendants(notebookIndex(notebook), itemId)
}

function collectDescendants(index, itemId) {
  const descendants = new Set(), pending = index.items.has(itemId) ? [itemId] : []
  while (pending.length) {
    const id = pending.pop()
    if (descendants.has(id)) continue
    descendants.add(id)
    for (const child of index.children.get(id) || []) pending.push(child.id)
  }
  return descendants
}

export function duplicateNotebookItem(notebook, itemId, sectionIds) {
  const source = notebook.items.find(item => item.id === itemId)
  if (!source) throw new Error('This task no longer exists. Reload the notebook and try again.')
  if (!Array.isArray(sectionIds) || !sectionIds.length) throw new Error('Choose at least one destination section.')
  const destinations = [...new Set(sectionIds)]
  if (destinations.some(id => !notebook.sections.some(section => section.id === id))) {
    throw new Error('A selected section no longer exists. Reload the notebook and try again.')
  }
  const index = notebookIndex(notebook)
  if (index.items.size !== notebook.items.length || !notebook.trophies.some(trophy => trophy.id === source.trophyId)) {
    throw new Error('This task has an invalid trophy or hierarchy. Reload the notebook and try again.')
  }
  const ancestors = new Set()
  let cursor = source
  while (cursor) {
    if (ancestors.has(cursor.id) || cursor.trophyId !== source.trophyId || parentOf(cursor) && !index.items.has(parentOf(cursor))) {
      throw new Error('This task has an invalid hierarchy. Reload the notebook and try again.')
    }
    ancestors.add(cursor.id)
    cursor = index.items.get(parentOf(cursor))
  }
  const descendants = collectDescendants(index, itemId), subtree = notebook.items.filter(item => descendants.has(item.id))
  if (subtree.some(item => item.trophyId !== source.trophyId)) {
    throw new Error('This task has an invalid hierarchy. Reload the notebook and try again.')
  }
  // Keep this aligned with the server notebook schema's total item limit.
  if (notebook.items.length + subtree.length * destinations.length > 5000) {
    throw new Error('These copies would exceed the notebook limit of 5,000 tasks. Choose fewer sections or remove some tasks.')
  }
  const usedIds = new Set(index.items.keys()), copies = []
  for (const sectionId of destinations) {
    const copiedIds = new Map()
    for (const item of subtree) {
      let id
      do { id = crypto.randomUUID() } while (usedIds.has(id))
      usedIds.add(id)
      copiedIds.set(item.id, id)
    }
    for (const item of subtree) {
      copies.push({
        ...item,
        id: copiedIds.get(item.id),
        parentId: item.id === itemId ? null : copiedIds.get(parentOf(item)),
        ...(item.id === itemId ? { inheritTrophySections: false } : {}),
        sectionIds: item.id === itemId ? [sectionId] : [],
        mainSectionId: sectionId,
        done: false,
        current: 0,
      })
    }
  }
  return { ...notebook, items: [...notebook.items, ...copies] }
}

function movement(notebook, itemId, target) {
  const index = notebookIndex(notebook), item = index.items.get(itemId)
  if (!item || !target) return null
  if (target.type === 'section') {
    return notebook.sections.some(section => section.id === target.id) ? { type: 'section', item, index } : null
  }
  if (target.type === 'grid') {
    if (index.children.has(itemId) || !notebook.trophies.some(trophy => trophy.id === target.trophyId)) return null
    if (target.sectionId !== null && !notebook.sections.some(section => section.id === target.sectionId)) return null
    if (target.sectionId === null && index.effectiveSections.get(itemId).size) return null
    if (target.sectionId === null && item.trophyId !== target.trophyId && item.inheritTrophySections !== false && index.trophySections.get(target.trophyId)?.size) return null
    let anchor = null
    if (target.anchorId !== undefined && target.anchorId !== null) {
      anchor = index.items.get(target.anchorId)
      if (!anchor || anchor.id === itemId || index.children.has(anchor.id) || anchor.trophyId !== target.trophyId || !['before', 'after'].includes(target.placement)) return null
      const membership = index.effectiveSections.get(anchor.id)
      if (target.sectionId === null ? membership.size > 0 : !membership.has(target.sectionId)) return null
    }
    return { type: 'grid', item, index, anchor }
  }

  const descendants = collectDescendants(index, itemId)
  let trophyId, parentId, anchor = null
  if (target.type === 'trophy') {
    trophyId = target.id
    parentId = null
  } else if (target.type === 'item') {
    anchor = index.items.get(target.id)
    if (!anchor || descendants.has(anchor.id) || !['before', 'after', 'inside'].includes(target.placement)) return null
    trophyId = anchor.trophyId
    parentId = target.placement === 'inside' ? anchor.id : parentOf(anchor)
  } else return null
  if (!notebook.trophies.some(trophy => trophy.id === trophyId)) return null
  const siblings = notebook.items.filter(entry => !descendants.has(entry.id) && entry.trophyId === trophyId && parentOf(entry) === parentId)
  const siblingIndex = anchor && target.placement !== 'inside'
    ? siblings.findIndex(entry => entry.id === anchor.id) + (target.placement === 'after' ? 1 : 0)
    : siblings.length
  return { type: 'tree', item, descendants, trophyId, parentId, anchor, siblings, siblingIndex }
}

// A valid drop may be unchanged; the mutation helpers retain identity for no-ops.
export function canMoveNotebookItem(notebook, itemId, target) {
  return movement(notebook, itemId, target) !== null
}

function moveGridItem(notebook, move, target) {
  const { item, anchor } = move
  let updated = item.trophyId === target.trophyId ? item : { ...item, trophyId: target.trophyId, parentId: null }
  let candidate = { ...notebook, items: notebook.items.map(entry => entry.id === item.id ? updated : entry) }
  let index = notebookIndex(candidate)
  if (target.sectionId !== null && !index.effectiveSections.get(item.id).has(target.sectionId)) {
    updated = { ...updated, sectionIds: [...updated.sectionIds, target.sectionId] }
    candidate = { ...candidate, items: candidate.items.map(entry => entry.id === item.id ? updated : entry) }
    index = notebookIndex(candidate)
  }
  const inCell = entry => entry.trophyId === target.trophyId && (target.sectionId === null ? index.effectiveSections.get(entry.id).size === 0 : index.effectiveSections.get(entry.id).has(target.sectionId))
  const cellItems = index.leaves.filter(inCell), siblings = cellItems.filter(entry => entry.id !== item.id)
  const position = anchor ? siblings.findIndex(entry => entry.id === anchor.id) + (target.placement === 'after' ? 1 : 0) : siblings.length
  const nextIds = siblings.map(entry => entry.id)
  nextIds.splice(position, 0, item.id)
  if (updated === item && sameIds(cellItems.map(entry => entry.id), nextIds)) return notebook

  const items = candidate.items.filter(entry => entry.id !== item.id)
  const anchorItem = anchor || siblings.at(-1)
  const insertion = anchorItem ? items.findIndex(entry => entry.id === anchorItem.id) + (!anchor || target.placement === 'after' ? 1 : 0) : items.length
  items.splice(insertion, 0, updated)
  return repairMainSections({ ...notebook, items })
}

export function moveNotebookItem(notebook, itemId, target) {
  const move = movement(notebook, itemId, target)
  if (!move) return notebook
  if (move.type === 'section') {
    if (move.index.effectiveSections.get(itemId).has(target.id)) return notebook
    return repairMainSections({ ...notebook, items: notebook.items.map(item => item.id === itemId ? { ...item, sectionIds: [...item.sectionIds, target.id] } : item) })
  }
  if (move.type === 'grid') return moveGridItem(notebook, move, target)

  const { item, descendants, trophyId, parentId, anchor, siblings, siblingIndex } = move
  const previousSiblings = notebook.items.filter(entry => entry.trophyId === item.trophyId && parentOf(entry) === parentOf(item)).map(entry => entry.id)
  const nextSiblings = siblings.map(entry => entry.id)
  nextSiblings.splice(siblingIndex, 0, itemId)
  if (item.trophyId === trophyId && parentOf(item) === parentId && sameIds(previousSiblings, nextSiblings) && notebook.items.every(entry => !descendants.has(entry.id) || entry.trophyId === trophyId)) return notebook

  const remaining = notebook.items.filter(entry => !descendants.has(entry.id))
  let insertion
  if (anchor && target.placement !== 'inside') insertion = remaining.findIndex(entry => entry.id === anchor.id) + (target.placement === 'after' ? 1 : 0)
  else if (siblings.length) insertion = remaining.findIndex(entry => entry.id === siblings.at(-1).id) + 1
  else if (parentId) insertion = remaining.findIndex(entry => entry.id === parentId) + 1
  else insertion = remaining.length
  const subtree = notebook.items.filter(entry => descendants.has(entry.id)).map(entry => {
    if (entry.id === itemId) return { ...entry, trophyId, parentId }
    return entry.trophyId === trophyId ? entry : { ...entry, trophyId }
  })
  remaining.splice(insertion, 0, ...subtree)
  return repairMainSections({ ...notebook, items: remaining })
}

export function moveNotebookGroup(notebook, key, id, targetId, placement) {
  if (!['trophies', 'sections'].includes(key) || id === targetId || !['before', 'after'].includes(placement)) return notebook
  const group = notebook[key].find(entry => entry.id === id)
  if (!group || !notebook[key].some(entry => entry.id === targetId)) return notebook
  const groups = notebook[key].filter(entry => entry.id !== id)
  groups.splice(groups.findIndex(entry => entry.id === targetId) + (placement === 'after' ? 1 : 0), 0, group)
  return sameIds(groups.map(entry => entry.id), notebook[key].map(entry => entry.id)) ? notebook : { ...notebook, [key]: groups }
}

export function moveNotebookSibling(notebook, itemId, direction) {
  const item = notebook.items.find(entry => entry.id === itemId)
  if (!item || ![-1, 1].includes(direction)) return notebook
  const siblings = notebook.items.filter(entry => entry.trophyId === item.trophyId && parentOf(entry) === parentOf(item))
  const target = siblings[siblings.findIndex(entry => entry.id === itemId) + direction]
  return target ? moveNotebookItem(notebook, itemId, { type: 'item', id: target.id, placement: direction < 0 ? 'before' : 'after' }) : notebook
}
