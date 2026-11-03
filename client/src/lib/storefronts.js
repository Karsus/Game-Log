import catalog from '../../../shared/storefronts.json'

export const STOREFRONT_OPTIONS = [{ value: '', label: 'Not specified' }, ...catalog.map(({ id, label }) => ({ value: id, label }))]
const key = value => value.trim().toLowerCase().replace(/[^a-z0-9]/g, '')
const byName = new Map(catalog.flatMap(store => [store.id, store.label, ...store.aliases].map(name => [key(name), store.id])))
const labels = new Map(catalog.map(store => [store.id, store.label]))

// Also preserve older records still present in an open client session.
export function copyStorefrontFields(copy = {}) {
  const name = (copy.storefront || '').trim()
  if (!name) return { storefront: '', storefrontOther: '' }
  const storefront = byName.get(key(name)) || 'other'
  return { storefront, storefrontOther: storefront === 'other' ? copy.storefrontOther?.trim() || name : '' }
}

export function storefrontLabel(copy) {
  const { storefront, storefrontOther } = copyStorefrontFields(copy)
  return storefront === 'other' ? storefrontOther : labels.get(storefront) || ''
}
