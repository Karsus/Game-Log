const object = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const mapEntries = (value, convert) => Array.isArray(value) ? value.map(entry => object(entry) ? convert(entry) : entry) : value
const normalizeTrophy = entry => ({
  id: entry.id,
  title: entry.title,
  description: entry.description === undefined ? '' : entry.description,
  type: entry.type === undefined ? 'checkbox' : entry.type,
  done: entry.done === undefined ? false : entry.done,
  current: entry.current === undefined ? 0 : entry.current,
  target: entry.target === undefined ? 1 : entry.target,
  sectionIds: entry.sectionIds === undefined ? [] : Array.isArray(entry.sectionIds) ? [...entry.sectionIds] : entry.sectionIds,
  mainSectionId: entry.mainSectionId === undefined ? null : entry.mainSectionId,
  missable: entry.missable === undefined ? false : entry.missable,
  url: entry.url === undefined ? '' : entry.url,
})

function emptyNotebook() {
  return { formatVersion: 2, revision: 0, trophies: [], sections: [], items: [] }
}

// Conversion is deliberately separate from validation: malformed explicit values
// remain malformed, so an invalid v2 link or main section cannot be silently lost.
function normalizeNotebook(input) {
  if (!object(input)) throw Object.assign(new Error('Notebook must be an object'), { status: 400 })
  if (input.formatVersion !== undefined && ![1, 2].includes(input.formatVersion)) {
    throw Object.assign(new Error('Unsupported notebook format version'), { status: 400 })
  }
  const legacy = input.formatVersion !== 2
  const sections = input.sections === undefined ? [] : input.sections
  return {
    formatVersion: 2,
    revision: input.revision,
    trophies: legacy
      ? mapEntries(sections, entry => normalizeTrophy({ id: entry.id, title: entry.title }))
      : mapEntries(input.trophies === undefined ? [] : input.trophies, normalizeTrophy),
    sections: legacy ? [] : mapEntries(sections, entry => ({ id: entry.id, title: entry.title })),
    items: mapEntries(input.items === undefined ? [] : input.items, entry => ({
      id: entry.id,
      trophyId: legacy ? entry.sectionId : entry.trophyId,
      parentId: entry.parentId === undefined ? null : entry.parentId,
      title: entry.title,
      type: entry.type === undefined ? 'checkbox' : entry.type,
      done: entry.done === undefined ? false : entry.done,
      current: entry.current === undefined ? 0 : entry.current,
      target: entry.target === undefined ? 1 : entry.target,
      notes: entry.notes === undefined ? '' : entry.notes,
      url: entry.url === undefined ? '' : entry.url,
      missable: entry.missable === undefined ? false : entry.missable,
      sectionIds: legacy || entry.sectionIds === undefined ? [] : Array.isArray(entry.sectionIds) ? [...entry.sectionIds] : entry.sectionIds,
      mainSectionId: legacy || entry.mainSectionId === undefined ? null : entry.mainSectionId,
      inheritTrophySections: entry.inheritTrophySections === undefined ? true : entry.inheritTrophySections,
    })),
  }
}

module.exports = { emptyNotebook, normalizeNotebook }
