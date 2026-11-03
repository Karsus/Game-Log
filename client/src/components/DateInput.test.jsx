// @vitest-environment jsdom
import React, { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DateInput from './DateInput'

afterEach(() => { cleanup(); vi.restoreAllMocks() })

function Form({ initial = '', save = vi.fn(), ...props }) {
  const [value, setValue] = useState(initial)
  return <form onSubmit={event => { event.preventDefault(); save(value) }}>
    <label>Acquired on<DateInput aria-label="Acquired on" value={value} onChange={event => setValue(event.target.value)} {...props} /></label>
    <button type="submit">Save</button>
    <button type="button" onClick={() => setValue(initial)}>Reset</button>
    <output>{value}</output>
  </form>
}

it('always shows day/month/year and submits the same ISO calendar day', async () => {
  const save = vi.fn(), user = userEvent.setup()
  render(<Form initial="2027-04-08" save={save} />)
  const input = screen.getByRole('textbox', { name: 'Acquired on' })
  expect(input.value).toBe('08/04/2027')
  expect(input.placeholder).toBe('DD/MM/YYYY')
  await user.clear(input)
  await user.type(input, '09/05/2027')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenCalledWith('2027-05-09')
})

it('keeps partial and invalid edits visible and blocks saving a previous valid value', async () => {
  const save = vi.fn(), user = userEvent.setup()
  render(<Form initial="2028-02-29" save={save} />)
  const input = screen.getByLabelText('Acquired on')
  await user.clear(input)
  await user.type(input, '29/02/2027')
  expect(input.value).toBe('29/02/2027')
  expect(input.checkValidity()).toBe(false)
  expect(input.validationMessage).toContain('DD/MM/YYYY')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).not.toHaveBeenCalled()
  await user.clear(input)
  await user.type(input, '29/02/202')
  expect(input.value).toBe('29/02/202')
  expect(input.checkValidity()).toBe(false)
  await user.click(screen.getByRole('button', { name: 'Reset' }))
  expect(input.value).toBe('29/02/2028')
  expect(input.checkValidity()).toBe(true)
})

it('accepts numeric keyboard entry and clearing an optional date', async () => {
  const save = vi.fn(), user = userEvent.setup()
  render(<Form save={save} />)
  const input = screen.getByLabelText('Acquired on')
  expect(input.inputMode).toBe('numeric')
  await user.type(input, '29022028')
  expect(input.value).toBe('29/02/2028')
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenLastCalledWith('2028-02-29')
  await user.clear(input)
  await user.click(screen.getByRole('button', { name: 'Save' }))
  expect(save).toHaveBeenLastCalledWith('')
})

it('honors disabled, required, and calendar boundaries', () => {
  const { rerender } = render(<DateInput aria-label="Date" value="" disabled onChange={() => {}} />)
  expect(screen.getByRole('textbox').disabled).toBe(true)
  expect(screen.getByRole('button').disabled).toBe(true)
  rerender(<DateInput aria-label="Date" value="" required onChange={() => {}} />)
  expect(screen.getByRole('textbox').checkValidity()).toBe(false)
  rerender(<DateInput aria-label="Date" value="2027-04-08" min="2027-04-09" onChange={() => {}} />)
  expect(screen.getByRole('textbox').validationMessage).toContain('09/04/2027')
  rerender(<DateInput aria-label="Date" value="2027-04-08" max="2027-04-07" onChange={() => {}} />)
  expect(screen.getByRole('textbox').validationMessage).toContain('07/04/2027')
})

it('opens the native calendar and formats its selected date without exposing a second date entry field', () => {
  const { container } = render(<Form />)
  const picker = container.querySelector('input[type=date]'), showPicker = vi.fn()
  picker.showPicker = showPicker
  fireEvent.click(screen.getByRole('button', { name: 'Open calendar for Acquired on' }))
  expect(showPicker).toHaveBeenCalledOnce()
  expect(picker.tabIndex).toBe(-1)
  expect(picker.getAttribute('aria-hidden')).toBe('true')
  fireEvent.change(picker, { target: { value: '2027-04-08' } })
  expect(screen.getByRole('textbox').value).toBe('08/04/2027')
  expect(screen.getByRole('status').textContent).toBe('2027-04-08')
})
