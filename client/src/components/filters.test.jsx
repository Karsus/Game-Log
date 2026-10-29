// @vitest-environment jsdom
import React from 'react'
import { expect, it, vi } from 'vitest'
import { render, screen, act, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useFilters } from './filters'
vi.mock('../state', () => ({ useApp: () => ({ user: { preferences: {} } }) }))
it('preserves rapid successive filter changes before navigation commits', async () => {
  let controls
  function Harness() { controls = useFilters('hunts'); return <output>{JSON.stringify(controls.filters)}</output> }
  render(<MemoryRouter><Harness /></MemoryRouter>)
  await act(async () => { controls.update({ sort: 'status' }); controls.update({ direction: 'desc' }); controls.update({ platforms: ['ps5'] }) })
  expect(JSON.parse(screen.getByRole('status').textContent)).toMatchObject({ sort: 'status', direction: 'desc', platforms: ['ps5'] })
  cleanup()
})
