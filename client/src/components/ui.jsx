import React, { useEffect, useRef, useState } from 'react'
import { X, Gamepad2, AlertCircle, LoaderCircle, Check, ChevronDown } from 'lucide-react'
import { STATUS_LABELS, huntLabel } from '../lib/domain'
import DateInput from './DateInput'
export function Button({ children, variant = 'secondary', className = '', busy, ...props }) { return <button className={`button ${variant} ${className}`} {...props} disabled={props.disabled || busy}>{busy && <LoaderCircle className="spin" size={16} />}{children}</button> }
export function Field({ label, hint, children, className = '' }) {
  const group = children?.type === ChoiceGrid
  return group ? <div className={`field ${className}`} role="group" aria-label={label}><span>{label}</span>{children}{hint && <small>{hint}</small>}</div> : <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}
export function ErrorMessage({ children }) { return children ? <div className="error" role="alert"><AlertCircle size={17} /><span>{children}</span></div> : null }
export function Empty({ icon: Icon = Gamepad2, title, children, action }) { return <div className="empty"><span className="empty-icon"><Icon size={30} /></span><h3>{title}</h3><p>{children}</p>{action}</div> }
export function Modal({ title, subtitle, children, onClose, wide = false }) {
  const ref = useRef(null), close = useRef(onClose); close.current = onClose
  useEffect(() => { const dialog = ref.current; dialog.showModal(); const cancel = e => { e.preventDefault(); close.current() }; dialog.addEventListener('cancel', cancel); return () => { dialog.removeEventListener('cancel', cancel); dialog.close() } }, [])
  return <dialog ref={ref} className={`modal ${wide ? 'wide' : ''}`} aria-labelledby="dialog-title"><div className="modal-heading"><div><h2 id="dialog-title">{title}</h2>{subtitle && <p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20} /></button></div>{children}</dialog>
}
export function FormModal({ title, subtitle, onClose, onSubmit, children, label = 'Save changes', wide, submitDisabled = false, renderError = error => error.message }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState(null)
  async function submit(event) { event.preventDefault(); if (busy || submitDisabled) return; setBusy(true); setError(null); try { await onSubmit(); onClose() } catch (e) { setError(e) } finally { setBusy(false) } }
  // Keep the dialog instance mounted during validation and saving.
  const close = useRef(onClose); close.current = onClose
  const stableClose = React.useCallback(() => { if (!busy) close.current() }, [busy])
  return <Modal title={title} subtitle={subtitle} onClose={stableClose} wide={wide}><form onSubmit={submit}><fieldset disabled={busy} className="form-fields">{children}</fieldset><ErrorMessage>{error && renderError(error)}</ErrorMessage><div className="modal-footer"><Button type="button" onClick={stableClose} disabled={busy}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={submitDisabled}>{label}</Button></div></form></Modal>
}
export function Confirm({ title, children, onClose, onConfirm, label = 'Delete' }) { return <FormModal title={title} onClose={onClose} onSubmit={onConfirm} label={label}><p className="muted">{children}</p></FormModal> }
export function Cover({ game, small = false }) {
  const [failed, setFailed] = useState(false)
  useEffect(() => setFailed(false), [game?.cover])
  return <div className={`cover ${small ? 'small' : ''}`} style={{ '--cover-hue': ((game?.title || '').split('').reduce((sum, x) => sum + x.charCodeAt(0), 0) * 7) % 360 }}>
    {game?.cover && !failed ? <img src={game.cover} alt={`${game.title} cover`} loading="lazy" onError={() => setFailed(true)} /> : <div className="cover-placeholder"><Gamepad2 size={small ? 20 : 46} /><span>{game?.title}</span></div>}
  </div>
}
export function Status({ hunt }) { return <span className={`status ${hunt.status}`}><i />{huntLabel(hunt)}</span> }
export function Progress({ done, total }) { const percentage = total ? Math.min(100, Math.round(done / total * 100)) : 0; return <div className="progress-wrap"><div className="progress" role="progressbar" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100} aria-label="Completion"><span style={{ width: `${percentage}%` }} /></div><small>{done} / {total ?? '—'}</small></div> }
export function MultiSelect({ label, options, value, onChange }) { return <details className="multi-select"><summary>{label}{value.length > 0 && <span className="count">{value.length}</span>}<ChevronDown size={14} /></summary><div className="multi-menu">{options.map(option => <label key={option.value}><input type="checkbox" checked={value.includes(option.value)} onChange={e => onChange(e.target.checked ? [...value, option.value] : value.filter(v => v !== option.value))} />{option.label}</label>)}{!options.length && <span>No options</span>}</div></details> }
export function ChoiceGrid({ options, value, onChange }) { return <div className="choice-grid">{options.map(option => <label key={option.value} className={value.includes(option.value) ? 'chosen' : ''}><input type="checkbox" checked={value.includes(option.value)} onChange={e => onChange(e.target.checked ? [...value, option.value] : value.filter(v => v !== option.value))} />{option.label}</label>)}</div> }
export function PageHeading({ eyebrow, title, children, actions }) { return <header className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{children && <p>{children}</p>}</div><div className="heading-actions">{actions}</div></header> }
export function FormField({ name, label, values, set, setValues: _setValues, type = 'text', options, ...props }) {
  if (type === 'checkbox') return <label className="check-label"><input type="checkbox" checked={!!values[name]} onChange={e => set(name, e.target.checked)} {...props} />{label}</label>
  if (type === 'date') return <Field label={label}><DateInput aria-label={label} value={values[name] ?? ''} onChange={e => set(name, e.target.value)} {...props} /></Field>
  const attrs = { value: values[name] ?? '', onChange: e => set(name, type === 'number' ? e.target.value === '' ? null : Number(e.target.value) : e.target.value), ...props }
  return <Field label={label}>{options ? <select {...attrs}>{options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}</select> : type === 'textarea' ? <textarea rows={3} {...attrs} /> : <input type={type} {...attrs} />}</Field>
}
export const statusOptions = Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))
