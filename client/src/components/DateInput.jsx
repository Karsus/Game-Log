import React, { useEffect, useId, useRef } from 'react'
import { CalendarDays } from 'lucide-react'
import { formatDate, isCalendarDate, parseDateInput } from '../lib/dates'

export default function DateInput({ value = '', onChange, disabled, readOnly, required, min, max, className = '', ...props }) {
  const input = useRef(null), picker = useRef(null), hintId = useId()
  const text = isCalendarDate(value) ? formatDate(value) : value || ''
  const parsed = parseDateInput(text)
  const error = text && !parsed ? 'Enter a valid date in DD/MM/YYYY format.' : parsed && min && parsed < min ? `Enter a date on or after ${formatDate(min)}.` : parsed && max && parsed > max ? `Enter a date on or before ${formatDate(max)}.` : ''
  useEffect(() => { input.current?.setCustomValidity(error) }, [error])
  function change(event) {
    const entered = event.target.value
    const next = parseDateInput(entered) || entered
    onChange?.({ ...event, target: { value: next, name: props.name }, currentTarget: { value: next, name: props.name } })
  }
  function openCalendar(event) {
    event.preventDefault()
    try {
      if (picker.current?.showPicker) picker.current.showPicker()
      else input.current?.focus()
    } catch { input.current?.focus() }
  }
  return <span className="date-input">
    <input {...props} ref={input} type="text" inputMode="numeric" placeholder="DD/MM/YYYY" autoComplete="off" className={className} value={text} disabled={disabled} readOnly={readOnly} required={required} aria-describedby={[props['aria-describedby'], hintId].filter(Boolean).join(' ')} onChange={change} />
    <button type="button" className="date-calendar-button" aria-label={props['aria-label'] ? `Open calendar for ${props['aria-label']}` : 'Open calendar'} title="Choose a date" disabled={disabled || readOnly} onClick={openCalendar}><CalendarDays size={16} aria-hidden="true" /></button>
    <input ref={picker} type="date" className="date-native-picker" tabIndex={-1} aria-hidden="true" value={parsed || ''} min={min} max={max} disabled={disabled || readOnly} onChange={event => { onChange?.({ ...event, target: { value: event.target.value, name: props.name }, currentTarget: { value: event.target.value, name: props.name } }); input.current?.focus() }} />
    <span id={hintId} className="date-format-hint">Day/month/year (DD/MM/YYYY)</span>
  </span>
}
