const STOREFRONTS = require('../../shared/storefronts.json')
const STOREFRONT_IDS = STOREFRONTS.map(storefront => storefront.id)
const key = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const aliases = new Map(STOREFRONTS.flatMap(storefront => [storefront.id, storefront.label, ...storefront.aliases].map(value => [key(value), storefront.id])))

function storefrontId(value) {
  if (typeof value !== 'string') return undefined
  return value.trim() ? aliases.get(key(value)) : ''
}

// Old copies used the storefront field for both catalog names and local shops.
// Keep unknown names while moving recognized stores onto stable catalog IDs.
function normalizeLegacyStorefront(copy) {
  if (copy.storefront !== undefined && typeof copy.storefront !== 'string') return { storefront: copy.storefront, storefrontOther: copy.storefrontOther }
  const original = copy.storefront?.trim() || '', id = storefrontId(original)
  if (id === undefined) return { storefront: 'other', storefrontOther: original }
  if (id === 'other') return { storefront: id, storefrontOther: copy.storefrontOther === undefined ? original : copy.storefrontOther }
  return { storefront: id, storefrontOther: '' }
}

async function migrateStorefronts(models) {
  const copies = await models.GameCopy.find().select('_id storefront storefrontOther').lean()
  const updates = []
  for (const copy of copies) {
    const next = normalizeLegacyStorefront(copy)
    if (copy.storefront === next.storefront && copy.storefrontOther === next.storefrontOther) continue
    const previous = field => copy[field] === undefined ? { $exists: false } : copy[field]
    updates.push({ updateOne: {
      filter: { _id: copy._id, storefront: previous('storefront'), storefrontOther: previous('storefrontOther') },
      update: { $set: next, $inc: { __v: 1 } }, timestamps: false,
    } })
  }
  if (updates.length) await models.GameCopy.bulkWrite(updates)
}

module.exports = { STOREFRONTS, STOREFRONT_IDS, storefrontId, normalizeLegacyStorefront, migrateStorefronts }
