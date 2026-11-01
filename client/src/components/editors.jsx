import React, { useState } from 'react'
import { Search, Plus, X } from 'lucide-react'
import { useApp } from '../state'
import { api } from '../lib/api'
import { SERVICE_LABELS, SUBSCRIPTION_LABELS, platformName, wholeDifficulty } from '../lib/domain'
import { FormModal, FormField, Field, Button, Cover, ChoiceGrid, ErrorMessage, statusOptions } from './ui'
import ImageField, { useImageInput } from './ImageField'
const services = Object.entries(SERVICE_LABELS).map(([value, label]) => ({ value, label }))
const options = values => values.map(value => ({ value, label: value.charAt(0).toUpperCase() + value.slice(1).replaceAll('-', ' ') }))
function useFields(initial) { const [values, setValues] = useState(initial); return { values, set: (key, value) => setValues(old => ({ ...old, [key]: value })), setValues } }
function Inputs({ specs, form }) { return specs.map(([name, label, type, extra]) => <FormField key={name} name={name} label={label} type={type || 'text'} {...form} {...extra} />) }
function PlatformField({ form }) { const { data } = useApp(); return <FormField name="platformId" label="Platform" {...form} required options={[{ value: '', label: 'Choose a platform' }, ...data.platforms.map(p => ({ value: p._id, label: p.name }))]} /> }
const acquisitionDefaults = { acquiredOn: '', price: null, currency: 'USD', condition: 'unknown', state: 'owned', location: '', lentTo: '', notes: '' }
function AcquisitionFields({ form }) { return <><div className="form-grid"><Inputs form={form} specs={[
  ['acquiredOn', 'Acquired on', 'date'], ['price', 'Purchase price', 'number', { min: 0, step: '0.01' }], ['currency', 'Currency', 'text', { maxLength: 3, pattern: '[A-Z]{3}', placeholder: 'MXN / USD' }],
  ['condition', 'Condition', 'text', { options: options(['unknown', 'new', 'excellent', 'good', 'fair', 'poor']) }], ['state', 'Ownership state', 'text', { options: options(['owned', 'lent', 'sold', 'lost']) }], ['location', 'Storage location'],
  ['lentTo', 'Lent to'],
]} /></div><FormField name="notes" label="Personal notes" type="textarea" {...form} /></> }
export function GameEditor({ game, onClose, wishlist = false }) {
  const { data, mutate } = useApp(), form = useFields({ title: '', description: '', cover: '', developer: '', publisher: '', genres: [], releaseYear: null, releases: [], igdbId: null, sourceUrl: '', wishlist, wishlistPlatforms: [], subscriptions: [], rating: null, notes: '', ...game })
  const cover = useImageInput(game?.cover || '', data.imageUploads)
  const [query, setQuery] = useState(''), [results, setResults] = useState([]), [searching, setSearching] = useState(false), [searchError, setSearchError] = useState(''), [searched, setSearched] = useState(false)
  async function search() { setSearching(true); setSearchError(''); try { setResults(await api(`/metadata/games?q=${encodeURIComponent(query)}`)); setSearched(true) } catch (e) { setSearchError(e.message) } finally { setSearching(false) } }
  function pick(result) { const { platforms, ...fields } = result; form.setValues(old => ({ ...old, ...fields })); cover.reset(fields.cover || ''); setResults([]); setSearched(false) }
  const selected = [...new Set(form.values.releases.map(r => r.platformId))]
  return <FormModal title={game ? 'Edit game' : 'Add a game'} subtitle="One game, all your platforms. Track subscription access here; add owned copies and hunts after saving." onClose={onClose} onSubmit={async () => mutate(game ? `/games/${game._id}` : '/games', game ? 'PATCH' : 'POST', { ...form.values, cover: await cover.resolve() }, game ? 'Game updated' : 'Game added')} wide label={game ? 'Save game' : 'Add to library'}>
    {!game && <div className="lookup"><Field label="Find game details"><div className="input-action"><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search IGDB, e.g. Gladius" onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (query.trim().length > 1) search() } }} /><Button type="button" onClick={search} busy={searching} disabled={query.trim().length < 2 || !data.metadataAvailable}><Search size={16} />Search</Button></div></Field>{!data.metadataAvailable && <small>Game lookup is not configured yet. All fields can be entered manually.</small>}<ErrorMessage>{searchError}</ErrorMessage>{results.length > 0 && <div className="lookup-results">{results.map(result => <button key={result.igdbId} type="button" onClick={() => pick(result)}><Cover game={result} small /><span><strong>{result.title}</strong><small>{result.releaseYear || 'Year unknown'} · {result.platforms.join(', ')}</small></span><Plus size={18} /></button>)}</div>}{searched && !results.length && <p className="muted">No games found. Try another name or enter details below.</p>}</div>}
    <FormField name="title" label="Game title" {...form} required maxLength={200} autoFocus={!!game} />
    <SubscriptionFields form={form} />
    <div className="form-grid"><FormField name="releaseYear" label="Release year" type="number" min={1950} max={2200} {...form} /><ImageField label="Cover image" image={cover} /><Inputs form={form} specs={[
      ['developer', 'Developer'], ['publisher', 'Publisher'], ['rating', 'My rating / 10', 'number', { min: 0, max: 10, step: '0.5' }],
    ]} /><Field label="Genres"><input value={form.values.genres.join(', ')} onChange={e => form.set('genres', e.target.value.split(',').map(s => s.trim()))} placeholder="Role-playing, Strategy" /></Field></div>
    <FormField name="description" label="Description" type="textarea" {...form} />
    <Field label="Released on"><ChoiceGrid value={selected} options={data.platforms.map(p => ({ value: p._id, label: p.name }))} onChange={ids => form.set('releases', ids.map(platformId => form.values.releases.find(r => r.platformId === platformId) || { platformId, date: '' }))} /></Field>
    {!!form.values.releases.length && <details className="form-details"><summary>Release dates by platform</summary><div className="form-grid">{form.values.releases.map((r, i) => <Field key={`${r.platformId}-${i}`} label={platformName(data, r.platformId)}><input type="date" value={r.date || ''} onChange={e => form.set('releases', form.values.releases.map((v, j) => j === i ? { ...v, date: e.target.value } : v))} /></Field>)}</div></details>}
    <FormField name="wishlist" label="On my wishlist" type="checkbox" {...form} />
    <Field label="Wishlist specific platform versions" hint="You can wishlist another version of a game you already own."><ChoiceGrid value={form.values.wishlistPlatforms} options={data.platforms.map(p => ({ value: p._id, label: p.name }))} onChange={value => form.set('wishlistPlatforms', value)} /></Field>
    <FormField name="notes" label="My notes" type="textarea" {...form} />
    {form.values.sourceUrl && <small>Metadata from <a href={form.values.sourceUrl} target="_blank" rel="noreferrer">IGDB</a>. Review and edit before saving.</small>}
  </FormModal>
}
function SubscriptionFields({ form }) {
  const entries = form.values.subscriptions || []
  return <Field className="subscription-source-options" label="Subscription access" hint="Keep the sources this game came from, even when your membership ends. Manage current memberships and expiration dates in Settings. Choose a specific Game Pass tier when known; plain Game Pass does not identify a tier. Basic is for claimed PS Plus monthly games."><ChoiceGrid value={entries.map(s => s.service)} options={Object.entries(SUBSCRIPTION_LABELS).map(([value, label]) => ({ value, label }))} onChange={services => form.set('subscriptions', services.map(service => ({ service })))} /></Field>
}
export function CopyEditor({ game, copy, onClose }) {
  const { mutate } = useApp(), form = useFields({ gameId: game._id, platformId: game.releases[0]?.platformId || '', format: 'physical', storefront: '', edition: '', region: '', packaging: 'unknown', ...acquisitionDefaults, ...copy })
  return <FormModal title={copy ? 'Edit owned copy' : 'Add owned copy'} subtitle={game.title} onClose={onClose} onSubmit={() => mutate(copy ? `/copies/${copy._id}` : '/copies', copy ? 'PATCH' : 'POST', form.values, 'Copy saved')} wide>
    <div className="form-grid"><PlatformField form={form} /><FormField name="format" label="Format" {...form} options={options(['physical', 'digital'])} /><Inputs form={form} specs={[
      ['storefront', 'Store / storefront', 'text', { placeholder: 'Steam, Xbox Store, local shop…' }], ['edition', 'Edition'], ['region', 'Region'], ['packaging', 'Packaging', 'text', { options: options(['unknown', 'complete', 'boxed', 'loose', 'sealed', 'not-applicable']) }],
    ]} /></div><AcquisitionFields form={form} />
  </FormModal>
}
export function HardwareEditor({ unit, platformId = '', onClose }) {
  const { data, mutate } = useApp(), form = useFields({ platformId, nickname: '', model: '', color: '', storage: '', region: '', serial: '', image: '', ...acquisitionDefaults, ...unit })
  const image = useImageInput(unit?.image || '', data.imageUploads)
  const variants = data.platforms.find(p => p._id === form.values.platformId)?.variants || []
  return <FormModal title={unit ? 'Edit console / device' : 'Add a console / device'} subtitle="Each unit gets its own record, even when you own the same platform twice." onClose={onClose} onSubmit={async () => mutate(unit ? `/hardware/${unit._id}` : '/hardware', unit ? 'PATCH' : 'POST', { ...form.values, image: await image.resolve() }, 'Device saved')} wide>
    <div className="form-grid"><PlatformField form={form} /><FormField name="nickname" label="Nickname" {...form} required placeholder="Living room PS5" /><FormField name="model" label="Model / version" {...form} list="model-variants" /><datalist id="model-variants">{variants.map(v => <option key={v}>{v}</option>)}</datalist><Inputs form={form} specs={[
      ['color', 'Color'], ['storage', 'Storage', 'text', { placeholder: '1 TB' }], ['region', 'Region'], ['serial', 'Serial number'],
    ]} /><ImageField label="Photo" image={image} /></div><AcquisitionFields form={form} />
  </FormModal>
}
export function PlatformEditor({ onClose }) {
  const { mutate } = useApp(), form = useFields({ name: '', manufacturer: '', service: 'none', variants: [] })
  return <FormModal title="Add a custom platform" subtitle="This platform is private to your account." onClose={onClose} onSubmit={() => mutate('/platforms', 'POST', form.values, 'Platform added')}><FormField name="name" label="Name" {...form} required /><FormField name="manufacturer" label="Manufacturer" {...form} /><FormField name="service" label="Default achievement service" {...form} options={services} /><Field label="Models / versions (comma separated)"><input value={form.values.variants.join(', ')} onChange={e => form.set('variants', e.target.value.split(',').map(v => v.trim()))} /></Field></FormModal>
}
export function HuntEditor({ game, hunt, onClose, showOnBoard = true }) {
  const { data, mutate } = useApp()
  const defaultPlatform = game.releases[0]?.platformId || game.wishlistPlatforms[0] || ''
  function platformService(platformId) {
    const services = game.subscriptions?.map(s => s.service) || [], gamePass = services.some(s => s.startsWith('game-pass')), psPlus = services.some(s => s.startsWith('ps-plus-'))
    if (platformId === 'pc' && gamePass !== psPlus) return gamePass ? 'xbox' : 'playstation'
    return data.platforms.find(p => p._id === platformId)?.service || 'none'
  }
  const service = platformService(defaultPlatform)
  const form = useFields({ gameId: game._id, platformId: defaultPlatform, service, variant: '', expectedDifficulty: null, expectedHours: null, status: 'planned', hasAchievements: service !== 'none', hasPlatinum: service === 'playstation', goal: service === 'playstation' ? 'platinum' : service === 'none' ? 'manual' : 'base', earned: 0, total: null, completion: { platinum: false, base: false, all: false, manual: false, completedOn: '' }, notes: '', ...hunt, expectedDifficulty: wholeDifficulty(hunt?.expectedDifficulty) })
  function set(key, value) {
    if (key === 'platformId' || key === 'service') {
      const nextService = key === 'service' ? value : platformService(value)
      form.setValues(old => ({ ...old, [key]: value, service: nextService, hasAchievements: nextService !== 'none', hasPlatinum: nextService === 'playstation', goal: nextService === 'playstation' ? 'platinum' : nextService === 'none' ? 'manual' : 'base' }))
    } else if (key === 'hasAchievements' || key === 'hasPlatinum') {
      form.setValues(old => {
        const next = { ...old, [key]: value }
        if (!next.hasAchievements) { next.hasPlatinum = false; next.goal = 'manual' }
        else if (!next.hasPlatinum && next.goal === 'platinum') next.goal = 'base'
        return next
      })
    } else form.set(key, value)
  }
  async function save() {
    const value = { ...form.values, enableBoard: showOnBoard }
    await mutate(hunt ? `/hunts/${hunt._id}` : '/hunts', hunt ? 'PATCH' : 'POST', value)
  }
  return <FormModal title={hunt ? 'Edit trophy hunt' : 'Start a trophy hunt'} subtitle={`${game.title} · Progress is separate for each platform and service.`} onClose={onClose} onSubmit={save} wide label={hunt ? 'Save hunt' : 'Create hunt'}>
    <div className="form-grid"><PlatformField form={{ ...form, set }} /><FormField name="service" label="Achievement service" {...form} set={set} options={services} /><FormField name="variant" label="Edition / trophy-list label" {...form} placeholder="Optional, e.g. EU list or remaster" /><FormField name="status" label="Status" {...form} options={statusOptions} /></div>
    <div className="estimate-box"><div className="form-grid"><FormField name="expectedDifficulty" label="Expected difficulty / 10" {...form} type="number" min={1} max={10} step={1} placeholder="Unknown" /><FormField name="expectedHours" label="Expected time to complete (hours)" {...form} type="number" min={0.01} max={100000} step="any" placeholder="Unknown" /></div><small>Choose a whole-number difficulty from 1 to 10. Estimates can stay unknown; hours can include decimals.</small></div>
    <div className="form-grid"><FormField name="hasAchievements" label="This game has trophies / achievements" type="checkbox" {...form} set={set} />{form.values.service === 'playstation' && form.values.hasAchievements && <FormField name="hasPlatinum" label="This game has a platinum trophy" type="checkbox" {...form} set={set} />}</div>
    <FormField name="goal" label="Hunt completion goal" {...form} options={[...(form.values.hasAchievements ? [...(form.values.service === 'playstation' && form.values.hasPlatinum ? [{ value: 'platinum', label: 'Earn the platinum' }] : []), { value: 'base', label: 'Base-game achievements' }, { value: 'all', label: '100% including DLC' }] : []), { value: 'manual', label: 'My own completion goal' }]} />
    {form.values.hasAchievements && <div className="form-grid"><FormField name="earned" label="Achievements earned" {...form} type="number" min={0} step={1} required /><FormField name="total" label="Total achievements" {...form} type="number" min={0} step={1} placeholder="Unknown" /></div>}
    <FormField name="notes" label="Hunt notes / guide links" {...form} type="textarea" />
  </FormModal>
}
