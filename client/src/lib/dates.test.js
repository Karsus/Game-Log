import { describe, expect, it } from 'vitest'
import { formatDate, formatDateFilename, isCalendarDate, parseDateInput } from './dates'

describe('day/month/year dates', () => {
  it('reads ambiguous dates in day/month order and keeps date-only values in their calendar day', () => {
    expect(parseDateInput('08/04/2027')).toBe('2027-04-08')
    expect(parseDateInput('08042027')).toBe('2027-04-08')
    expect(formatDate('2027-04-08', { timeZone: 'America/Mexico_City' })).toBe('08/04/2027')
    expect(formatDate('2027-04-08', { timeZone: 'Pacific/Kiritimati' })).toBe('08/04/2027')
  })

  it('formats timestamps in the account time zone and keeps filename separators safe', () => {
    expect(formatDate('2027-04-08T02:00:00Z', { timeZone: 'America/Mexico_City' })).toBe('07/04/2027')
    expect(formatDate(new Date('2027-04-08T02:00:00Z'), { timeZone: 'Asia/Tokyo' })).toBe('08/04/2027')
    expect(formatDateFilename('2027-04-08')).toBe('08-04-2027')
  })

  it('accepts leap days only in real leap years', () => {
    expect(parseDateInput('29/02/2028')).toBe('2028-02-29')
    expect(parseDateInput('29/02/2000')).toBe('2000-02-29')
    for (const value of ['29/02/2027', '29/02/2100', '31/04/2027', '00/04/2027', '08/00/2027', '08/13/2027', '08/04/0000']) expect(parseDateInput(value)).toBeNull()
  })

  it('does not guess the meaning of partial, malformed, or locale-specific dates', () => {
    for (const value of ['', '08/04/27', '8/4/2027', '08/04/202', '2027-04-08', 'April 8, 2027', null]) expect(parseDateInput(value)).toBeNull()
    for (const value of ['', null, undefined, 'invalid', '08/04/2027', '2027-02-30']) expect(formatDate(value)).toBe('—')
    expect(isCalendarDate('0000-01-01')).toBe(false)
  })
})
