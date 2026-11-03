import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { Plus, LibraryBig, LayoutGrid, List, Heart, Download } from 'lucide-react'
import { useApp } from '../state'
import { formatDate } from '../lib/dates'
import { catalogGames, ownership, isWishlist, platformName, activeCopy } from '../lib/domain'
import { subscriptionAccessLabel } from '../lib/memberships'
import { download, csv } from '../lib/api'
import { Button, Cover, Empty, PageHeading } from '../components/ui'
import { GameEditor } from '../components/editors'
import GameAccess from '../components/GameAccess'
import { Filters, useFilters } from '../components/filters'
export default function Library() {
  const { data, user, membershipNow } = useApp(), controls = useFilters('catalog'), [editing, setEditing] = useState(false), [view, setView] = useState('grid')
  const games = catalogGames(data, controls.filters, controls.query)
  function platforms(game) { return [...new Set(data.copies.filter(c => c.gameId === game._id && activeCopy(c)).map(c => c.platformId))].map(id => platformName(data, id)).join(' · ') }
  function exportCsv() { download('game-log-catalog.csv', csv([['Game', 'Owned', 'Wishlist', 'Platforms', 'Rating', 'Subscription access'], ...games.map(g => [g.title, ownership(data, g._id) ? 'Yes' : 'No', isWishlist(g) ? 'Yes' : 'No', platforms(g), g.rating, subscriptionAccessLabel(g, user?.memberships || data.user?.memberships, membershipNow)])]), 'text/csv') }
  return <><PageHeading eyebrow="YOUR COLLECTION" title="Game library" actions={<Button variant="primary" onClick={() => setEditing(true)}><Plus size={17} />Add game</Button>}>Every edition. Every platform. All in one place.</PageHeading><Filters scope="catalog" {...controls} />
    <div className="section-bar"><span><strong>{games.length}</strong> {games.length === 1 ? 'game' : 'games'} in view</span><div><Button onClick={exportCsv} disabled={!games.length}><Download size={14} />Export</Button><div className="segmented"><button aria-label="Card view" aria-pressed={view === 'grid'} onClick={() => setView('grid')}><LayoutGrid size={16} /></button><button aria-label="Table view" aria-pressed={view === 'table'} onClick={() => setView('table')}><List size={16} /></button></div></div></div>
    {!games.length ? <Empty icon={LibraryBig} title={data.games.length ? 'No games match these filters' : 'Your next great collection starts here'} action={!data.games.length && <Button variant="primary" onClick={() => setEditing(true)}><Plus size={16} />Add your first game</Button>}>{data.games.length ? 'Adjust the search or clear your filters to see more games.' : 'Add a favorite, record a subscription or owned copy, or start with your wishlist.'}</Empty> : view === 'grid' ? <div className="game-grid">{games.map(g => <Link className="game-card" key={g._id} to={`/games/${g._id}`}><Cover game={g} /><div className="game-card-info"><div className="game-tags"><GameAccess game={g} includeFormats activeOnly />{isWishlist(g) && <Heart size={13} aria-label="Wishlisted" />}</div><h3>{g.title}</h3><p>{platforms(g) || g.releases.map(r => platformName(data, r.platformId)).slice(0, 2).join(' · ') || 'Add a platform'}</p></div></Link>)}</div> : <div className="table-wrap"><table><thead><tr><th>Game</th><th>Collection / access</th><th>Owned on</th><th>My rating</th><th>Added</th></tr></thead><tbody>{games.map(g => <tr key={g._id}><td><Link className="game-cell" to={`/games/${g._id}`}><Cover game={g} small /><strong>{g.title}</strong></Link></td><td><GameAccess game={g} includeFormats />{isWishlist(g) ? ' · Wishlist' : ''}</td><td>{platforms(g) || '—'}</td><td>{g.rating == null ? '—' : `${g.rating}/10`}</td><td>{formatDate(g.createdAt, { timeZone: user?.memberships?.timeZone })}</td></tr>)}</tbody></table></div>}
    {editing && <GameEditor onClose={() => setEditing(false)} />}
  </>
}
