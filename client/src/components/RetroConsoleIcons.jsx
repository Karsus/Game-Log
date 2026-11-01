// SVG children inherit the same single-color stroke as the surrounding icon.
function Switch({ variant = '', secondGeneration = false }) {
  const lite = variant.includes('lite')
  return <>
    <rect x="2" y="6" width="20" height="12" rx={lite ? 4 : 3} />
    {lite ? <rect x="7.5" y="8.5" width="9" height="7" rx=".5" /> : <path d="M6.5 6v12M17.5 6v12" />}
    <circle cx="4.3" cy="10" r=".7" />
    <circle cx="19.7" cy="14" r=".7" />
    <path d="M4.3 13v2m-1-1h2m14.4-5v2m-1-1h2" />
    {secondGeneration && <path d="M9 16h6" />}
  </>
}

function WiiU() {
  return <>
    <path d="M5 8V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M8 6h7" />
    <rect x="2" y="9" width="20" height="12" rx="3" />
    <rect x="6.5" y="11.5" width="11" height="7" rx=".5" />
    <circle cx="4.2" cy="12.5" r=".6" />
    <circle cx="19.8" cy="12.5" r=".6" />
    <path d="M4.2 16v2m-1-1h2m14.6-1v2m-1-1h2" />
  </>
}

function Wii({ variant = '' }) {
  if (variant.includes('mini')) return <>
    <rect x="3" y="7" width="18" height="11" rx="2" />
    <rect x="6" y="7" width="12" height="7" rx="1.5" />
    <path d="M6 16h2m10 0h.01" />
  </>
  return <>
    <path d="m7 4 9-2v19l-9 1Zm9-2 3 3v14l-3 2" />
    <path d="M10 8v9m3-12h.01M13 18v1" />
  </>
}

function GameCube() {
  return <>
    <path d="M8 6V5a4 3 0 0 1 8 0v1" />
    <path d="m12 5 9 4.5v8L12 22l-9-4.5v-8Zm-9 4.5L12 14l9-4.5M12 14v8" />
    <ellipse cx="12" cy="9.5" rx="3.2" ry="1.5" />
    <path d="m14.5 16.5.01 0m2.2-1.1.01 0m2.2-1.1.01 0" />
  </>
}

function Nintendo64() {
  return <>
    <path d="M6 8q6-3 12 0l3 8a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3Z" />
    <path d="M8 7V5h8v2M9 10h6M3 15h18" />
    <path d="M6 17h.01m4 0h.01m4 0h.01m4 0h.01" />
  </>
}

function SuperNintendo() {
  return <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    <path d="M7 5v8h10V5M9 8h6M3 14h18" />
    <path d="M7 16.5h3m4 0h3M9 11h1m4 0h1" />
  </>
}

function NintendoEntertainmentSystem() {
  return <>
    <rect x="3" y="5" width="18" height="14" rx="1" />
    <path d="M3 14h18M15 5v14M6 8h6v4H6ZM6 16.5h1m3 0h1m6 0h2" />
    <path d="M17 8v3m2-3v3" />
  </>
}

function DualScreen({ variant = '', threeDS = false }) {
  if (threeDS && variant.includes('2ds') && !variant.includes('xl')) return <>
    <path d="M7 2h10l4 17a2 2 0 0 1-2 3H5a2 2 0 0 1-2-3Z" />
    <rect x="8" y="5" width="8" height="5" rx=".5" />
    <rect x="8" y="13" width="8" height="5" rx=".5" />
    <path d="M5.5 14.5v2m-1-1h2m12-1h.01m1 2h.01" />
  </>
  return <>
    <rect x="4" y="2" width="16" height="9" rx="1.5" />
    <rect x="3" y="12" width="18" height="9" rx="1.5" />
    <rect x="7" y="4.5" width="10" height="4" rx=".5" />
    <rect x="8" y="14" width="8" height="5" rx=".5" />
    <path d="M5.5 15.5v2m-1-1h2m11.5-1h.01m1 2h.01" />
    {threeDS && <path d="M12 2v.01" />}
  </>
}

function GameBoyAdvance({ variant = '' }) {
  if (variant.includes('sp')) return <>
    <rect x="6" y="2" width="12" height="10" rx="1.5" />
    <rect x="8" y="4" width="8" height="6" rx=".5" />
    <rect x="6" y="13" width="12" height="9" rx="1.5" />
    <path d="M9 15.5v3m-1.5-1.5h3m4-1h.01m1 2h.01M11 20h2" />
  </>
  return <>
    {variant.includes('micro') ? <rect x="2" y="6" width="20" height="12" rx="3" /> : <path d="M6 6h12q3 0 4 5l1 5q0 3-3 2l-4-1H8l-4 1q-3 1-3-2l1-5q1-5 4-5Z" />}
    <rect x="7" y="7.5" width="10" height="8" rx="1" />
    <path d="M4.3 10v3m-1.5-1.5h3m13.2-1h.01m1 2h.01" />
  </>
}

function GameBoy() {
  return <>
    <path d="M6 2h12v15a5 5 0 0 1-5 5H6Z" />
    <rect x="8" y="4.5" width="8" height="6.5" rx="1" />
    <path d="M9 13v4m-2-2h4m3-1h.01m2 2h.01M10 19h1m2 0h1" />
  </>
}

function Dreamcast() {
  return <>
    <path d="M6 4h12l3 9v7H3v-7Z" />
    <ellipse cx="12" cy="9" rx="5" ry="3.5" />
    <path d="M3 15h18M6 17.5h1m3 0h1m3 0h1m3 0h1" />
    <path d="M5 12h.01M19 12h.01" />
  </>
}

function Genesis() {
  return <>
    <path d="M6 5q6-2 12 0l3 9v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3Z" />
    <ellipse cx="12" cy="9" rx="5" ry="3.5" />
    <path d="M9 8h6M3 15h18M6 17h3m6 0h3M5.5 11.5h.01" />
  </>
}

export const RETRO_CONSOLE_ICONS = {
  switch: Switch,
  switch2: props => <Switch {...props} secondGeneration />,
  wiiu: WiiU,
  wii: Wii,
  gamecube: GameCube,
  n64: Nintendo64,
  snes: SuperNintendo,
  nes: NintendoEntertainmentSystem,
  '3ds': props => <DualScreen {...props} threeDS />,
  ds: DualScreen,
  gba: GameBoyAdvance,
  gb: GameBoy,
  dreamcast: Dreamcast,
  genesis: Genesis,
}
