import { RETRO_CONSOLE_ICONS } from './RetroConsoleIcons'
import ps5StandardIcon from '../assets/devices/playstation-5.svg'
import nintendoSwitchIcon from '../assets/devices/nintendo-switch.svg'
import xboxOneIcon from '../assets/devices/xbox-one.svg'
import xbox360Icon from '../assets/devices/xbox-360.svg'
import ps4Icon from '../assets/devices/playstation-4.svg'
import wiiIcon from '../assets/devices/nintendo-wii.svg'
import wiiUIcon from '../assets/devices/nintendo-wii-u.svg'
import ps3Icon from '../assets/devices/playstation-3.svg'
import snesIcon from '../assets/devices/super-nintendo.svg'
import nesIcon from '../assets/devices/nintendo-nes.svg'
import gameBoyIcon from '../assets/devices/game-boy.svg'
import vitaIcon from '../assets/devices/playstation-vita.svg'
import dsIcon from '../assets/devices/nintendo-ds.svg'

const NOUN_DEVICE_ICONS = new Map([
  ['ps4', ps4Icon], ['ps3', ps3Icon], ['wii', wiiIcon], ['wiiu', wiiUIcon],
  ['snes', snesIcon], ['nes', nesIcon], ['gb', gameBoyIcon], ['vita', vitaIcon], ['ds', dsIcon],
  ['3ds', dsIcon], ['psp', vitaIcon],
])

const HANDHELD_PLATFORMS = new Set(['psp', 'gba', 'gb', 'ds', '3ds', 'vita', 'switch', 'switch2'])

// Match the original Lucide controller: a 24px grid, open shapes, and one thin stroke.
function Handheld({ vita = false, go = false }) {
  return <>
    <rect x="2" y={go ? 5 : 7} width="20" height="10" rx={vita ? 5 : 3} />
    <rect x="7" y={go ? 7 : 9} width="10" height="6" rx=".6" />
    <path d="M4 12h2m-1-1v2m14-2h.01M20 13h.01" />
    {go && <path d="M5 17v2h14v-2" />}
    {vita && <path d="M5 15h.01M19 15h.01" />}
  </>
}

function Laptop() {
  return <><rect x="4" y="4" width="16" height="12" rx="1.2" /><path d="M4 16 2 20h20l-2-4M10 18h4" /></>
}

function ConsoleShape({ id, variant }) {
  switch (id) {
    case 'ps5':
      return <>
        <path d="M5 2c2 1 3 2 4 4v15l-5 1c1.5-6 2-13 1-20ZM11 5l8-3c-1.5 7-1 14 1 20l-9-1ZM9 6l2-1M9 21h2" />
        {variant.includes('pro') ? <path d="M11 11l7-2M11 13l7-2M11 15l7.5-2" /> : variant.includes('slim') ? <path d="M11 13l7-2" /> : null}
      </>
    case 'ps4':
      return <>
        <path d="M3 21V3l5-1 10 2.5V14M3 21h8M8 2v19M3 9l5-.5L18 10" />
        {variant.includes('pro') && <path d="M3 12l5-.5 10 1.5" />}
        <path d="M14.5 15.5h4c1 0 1.6.7 1.9 1.8l1 3.6c.3 1.1-.8 1.8-1.6 1.1l-2-1.8h-2.6L13.3 22c-.8.7-1.9 0-1.6-1.1l1-3.6c.3-1.1.9-1.8 1.8-1.8Z" />
        <path d="M14 18h2m-1-1v2m3-.6h.01M19.5 17.5h.01" />
      </>
    case 'ps3':
      return <><path d="M5 5c4-2 10-2 14 0l2 13c-6 2-12 2-18 0Z" /><path d="M3.5 15c5.5 1.5 11.5 1.5 17 0M7 18h9" />{variant.includes('super') && <path d="M8 7h8M8 10h8" />}</>
    case 'ps2':
      return <><path d="M7 3 17 2v19L7 22ZM17 2l3 2v15l-3 2M7 18h10" /><path d={variant.includes('slim') ? 'M10 6v9' : 'M10 6v9M13 6v9'} /><path d="M18.5 6v.01" /></>
    case 'ps1':
      return <><rect x="2" y="5" width="20" height="14" rx={variant.includes('one') ? 3 : 1.5} /><circle cx="12" cy="11" r="4" /><path d="M5 9h.01M5 12h.01M19 12h.01M2 16h20M6 18h3m6 0h3" /></>
    case 'vita':
      return variant === 'tv' || variant.includes('vita tv') ? <><rect x="4" y="7" width="16" height="10" rx="2" /><path d="M7 15h3m7 0h.01" /></> : <Handheld vita />
    case 'psp': return <Handheld go={variant.includes('go')} />
    case 'xbox-series':
      return /\bs\b/.test(variant)
        ? <><rect x="2" y="6" width="20" height="12" rx="1.5" /><circle cx="10" cy="12" r="4" /><path d="M19 9h.01M18 16h2" /></>
        : <><path d="M7 4 15 2l4 2v16l-8 2-4-2ZM7 4l4 2 8-2M11 6v16" /><path d="M14 12v5m2-8h.01M10 3.5l4 1" /></>
    case 'xbox-one':
      return <><path d="M4 5h16l2 5v9H2v-9ZM2 10h20M5 15h9m5-2h.01M13 7h5" /></>
    case 'xbox360':
      return <><path d="M7 2c3 .7 7 .7 10 0-1.5 6-1.5 14 0 20-3-.7-7-.7-10 0 1.5-6 1.5-14 0-20Z" /><path d="M10 6h4M10 8h4M10 19h4" /><circle cx="12" cy="14" r="2" /></>
    case 'xbox':
      return <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="m3 6 6 4m6 0 6-4M3 16l6-4m6 0 6 4M2 16h20" /><circle cx="12" cy="11" r="3" /><path d="M6 18h2m3 0h2m3 0h2" /></>
    case 'pc':
    case 'mac':
      if (variant.includes('laptop') || variant.includes('book')) return <Laptop />
      if (variant.includes('handheld')) return <Handheld vita />
      return id === 'pc'
        ? <><rect x="1" y="5" width="14" height="11" rx="1" /><path d="M8 16v4M5 20h6" /><rect x="18" y="3" width="5" height="18" rx="1" /><path d="M20 6h1m-.5 4v.01M20 18h1" /></>
        : <><rect x="2" y="3" width="20" height="14" rx="1.5" /><path d="M2 14h20M12 17v4M8 21h8" /></>
    default: {
      const RetroIcon = RETRO_CONSOLE_ICONS[id]
      return RetroIcon ? <RetroIcon variant={variant} /> : <><rect x="3" y="7" width="18" height="11" rx="2" /><path d="M3 11h18M6 14h8m4 0h.01" /></>
    }
  }
}

export default function DeviceIllustration({ platform, model = '' }) {
  const variant = String(model || '').trim().toLowerCase()
  const platformId = platform?._id
  const isVitaTV = platformId === 'vita' && (variant === 'tv' || variant.includes('vita tv'))
  const label = [platform?.name || 'Game console', model].filter(Boolean).join(' ')
  let assetIcon, assetCredit
  if (platform?._id === 'ps5' && ['', 'standard', 'basic', 'base', 'original'].includes(variant)) {
    assetIcon = ps5StandardIcon
  } else if (platform?._id === 'switch' && !variant.includes('lite')) {
    assetIcon = nintendoSwitchIcon
  } else if (platform?._id === 'xbox-one') {
    assetIcon = xboxOneIcon
  } else if (platform?._id === 'xbox360') {
    assetIcon = xbox360Icon
  } else {
    const distinctModel = (platformId === 'wii' && variant.includes('mini')) || isVitaTV
    if (!distinctModel) assetIcon = NOUN_DEVICE_ICONS.get(platform?._id)
    if (assetIcon) {
      const iconName = assetIcon === dsIcon ? 'Nintendo DS' : assetIcon === vitaIcon ? 'PlayStation Vita' : platform.name
      assetCredit = `${iconName} icon by Mr. Minuvi, from the Noun Project`
    }
  }
  const isHandheld = (HANDHELD_PLATFORMS.has(platformId) && !isVitaTV) ||
    (!isVitaTV && variant.includes('handheld'))
  if (!assetIcon && isHandheld) {
    assetIcon = gameBoyIcon
    assetCredit = 'Game Boy icon by Mr. Minuvi, from the Noun Project'
  }
  if (assetIcon) {
    return <span className="device-illustration device-asset-icon" role="img" aria-label={`${label} console icon`} title={assetCredit} style={{ maskImage: `url("${assetIcon}")`, WebkitMaskImage: `url("${assetIcon}")` }} />
  }
  return <svg className="device-illustration" width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" role="img" aria-label={`${label} console icon`} focusable="false">
    <ConsoleShape id={platform?._id || ''} variant={variant} />
  </svg>
}
