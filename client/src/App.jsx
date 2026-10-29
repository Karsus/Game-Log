import React, { useState } from 'react'
import { NavLink, Routes, Route, Link } from 'react-router-dom'
import { Gamepad2, LayoutDashboard, LibraryBig, Trophy, Settings, LogOut, Moon, Sun, Menu, X, Check, LoaderCircle } from 'lucide-react'
import { useApp } from './state'
import { Button, Empty, ErrorMessage } from './components/ui'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Library from './pages/Library'
import Platforms from './pages/Platforms'
import GameDetail from './pages/GameDetail'
import Hunts from './pages/Hunts'
import HuntDetail from './pages/HuntDetail'
import SettingsPage from './pages/Settings'
const nav = [['/', 'Overview', LayoutDashboard], ['/games', 'Game library', LibraryBig], ['/platforms', 'Platforms & consoles', Gamepad2], ['/hunts', 'Trophy hunts', Trophy], ['/settings', 'Settings', Settings]]
export default function App() {
  const { user, data, demoMode, loading, error, initialize, logout, preferences, notice } = useApp(), [menu, setMenu] = useState(false), [actionError, setActionError] = useState('')
  if (loading) return <div className="loading-screen"><Gamepad2 size={40} /><LoaderCircle className="spin" size={22} /><p>Opening your collection…</p></div>
  if (error) return <div className="loading-screen"><ErrorMessage>{error}</ErrorMessage><Button onClick={initialize}>Try again</Button></div>
  if (!user || !data) return <Auth />
  async function act(fn) { setActionError(''); try { await fn() } catch (e) { setActionError(e.message) } }
  return <div className="app-shell"><button className="mobile-menu button" aria-label="Toggle navigation" onClick={() => setMenu(!menu)}>{menu ? <X size={20} /> : <Menu size={20} />}</button>{menu && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setMenu(false)} />}<aside className={`sidebar ${menu ? 'open' : ''}`}><Link className="brand" to="/"><span className="brand-icon"><Gamepad2 size={25} /></span><span>game<span className="brand-light">log</span><small>COLLECT. PLAY. COMPLETE.</small></span></Link><div className="nav-label">YOUR SPACE</div><nav>{nav.map(([path, label, Icon]) => <NavLink key={path} to={path} end={path === '/'} onClick={() => setMenu(false)}><Icon size={19} />{label}{path === '/hunts' && data.hunts.some(h => h.status === 'in-progress') && <span className="nav-dot" />}</NavLink>)}</nav><div className="sidebar-bottom"><div className="sidebar-note"><Trophy size={22} /><strong>One more trophy.</strong><p>Every small step counts.</p></div><div className="profile"><span className="avatar">{user.name.slice(0, 2).toUpperCase()}</span><div><strong>{user.name}</strong><small>Personal collection</small></div><button className="icon-button" aria-label="Toggle color theme" onClick={() => act(() => preferences({ theme: user.preferences.theme === 'dark' ? 'light' : 'dark' }))}>{user.preferences.theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button></div><button className="logout" onClick={() => act(logout)}><LogOut size={15} />Sign out</button><ErrorMessage>{actionError}</ErrorMessage></div></aside>
    <div className="main-area"><div className="topbar"><span><span className="connection-dot connected" />{demoMode ? "Demo workspace · sample data resets on restart" : "Your private gaming space"}</span><Link to="/settings">{user.name}<span className="avatar small">{user.name.slice(0, 1).toUpperCase()}</span></Link></div><main className="page-content"><Routes><Route path="/" element={<Dashboard />} /><Route path="/games" element={<Library />} /><Route path="/games/:id" element={<GameDetail />} /><Route path="/platforms" element={<Platforms />} /><Route path="/hunts" element={<Hunts />} /><Route path="/hunts/:id" element={<HuntDetail />} /><Route path="/settings" element={<SettingsPage />} /><Route path="*" element={<Empty title="Page not found" action={<Link className="button" to="/">Back to overview</Link>}>This page does not exist.</Empty>} /></Routes><footer className="app-footer"><span>GAMELOG</span><span>Your collection, at your own pace.</span></footer></main></div>{notice && <div className="toast" role="status"><Check size={17} />{notice}</div>}</div>
}
