import { useCallback, useEffect, useRef, useState } from 'react'
import { canMoveNotebookItem, moveNotebookItem, moveNotebookGroup, repairMainSections } from '../lib/notebook'

const edgeSpeed = (position, start, end) => {
  const edge = Math.min(48, (end - start) / 3)
  if (position < start || position > end || edge <= 0) return 0
  if (position < start + edge) return -14 * (1 - (position - start) / edge)
  if (position > end - edge) return 14 * (1 - (end - position) / edge)
  return 0
}

const matchesTarget = (target, destination) => {
  if (!target || target.id !== destination.id) return false
  if (target.type === 'grid' || destination.type === 'grid') {
    return target.type === destination.type && target.trophyId === destination.trophyId && target.sectionId === destination.sectionId && target.anchorId === destination.anchorId
  }
  return target.type === destination.type || ['trophy', 'section'].includes(target.type) && destination.type === `${target.type}-header`
}

export default function useNotebookDrag({ notebook, busy, mode, onMove }) {
  const rootRef = useRef(null), gridRef = useRef(null), activeRef = useRef(null), pointerRef = useRef(null), frameRef = useRef(null)
  const [active, setActive] = useState(null), [target, setTarget] = useState(null)

  const clearDrag = useCallback(() => {
    activeRef.current = null
    pointerRef.current = null
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    frameRef.current = null
    setActive(null)
    setTarget(null)
  }, [])

  useEffect(() => {
    function scroll() {
      const pointer = pointerRef.current
      if (!activeRef.current || !pointer) { frameRef.current = null; return }
      const grid = gridRef.current
      let scrolledGrid = false
      if (grid) {
        const rect = grid.getBoundingClientRect()
        const left = Math.max(0, rect.left), right = Math.min(window.innerWidth, rect.right)
        const top = Math.max(0, rect.top), bottom = Math.min(window.innerHeight, rect.bottom)
        if (pointer.x >= left && pointer.x <= right && pointer.y >= top && pointer.y <= bottom) {
          const previousTop = grid.scrollTop
          grid.scrollLeft += edgeSpeed(pointer.x, left, right)
          grid.scrollTop += edgeSpeed(pointer.y, top, bottom)
          scrolledGrid = grid.scrollTop !== previousTop
        }
      }
      const vertical = edgeSpeed(pointer.y, 0, window.innerHeight)
      if (!scrolledGrid && vertical) window.scrollBy(0, vertical)
      frameRef.current = requestAnimationFrame(scroll)
    }
    function track(event) {
      if (!activeRef.current) return
      pointerRef.current = { x: event.clientX, y: event.clientY }
      if (!rootRef.current?.contains(event.target)) setTarget(null)
      if (frameRef.current === null) frameRef.current = requestAnimationFrame(scroll)
    }
    function cancel(event) { if (event.key === 'Escape') clearDrag() }
    function outsideDrop(event) { if (!rootRef.current?.contains(event.target)) clearDrag() }
    function leaveWindow(event) {
      if (event.relatedTarget || (event.target !== document.documentElement && event.clientX > 0 && event.clientX < window.innerWidth && event.clientY > 0 && event.clientY < window.innerHeight)) return
      pointerRef.current = null
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
      frameRef.current = null
      setTarget(null)
    }
    // Capture continues tracking when nested drop zones stop event propagation.
    document.addEventListener('dragover', track, true)
    document.addEventListener('drop', outsideDrop, true)
    document.addEventListener('dragend', clearDrag, true)
    document.addEventListener('dragleave', leaveWindow, true)
    document.addEventListener('keydown', cancel)
    window.addEventListener('blur', clearDrag)
    return () => {
      document.removeEventListener('dragover', track, true)
      document.removeEventListener('drop', outsideDrop, true)
      document.removeEventListener('dragend', clearDrag, true)
      document.removeEventListener('dragleave', leaveWindow, true)
      document.removeEventListener('keydown', cancel)
      window.removeEventListener('blur', clearDrag)
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    }
  }, [clearDrag])

  useEffect(() => { clearDrag() }, [busy, mode, clearDrag])

  function handleProps(kind, id) {
    return {
      draggable: !busy,
      disabled: busy,
      tabIndex: -1,
      onDragStart(event) {
        event.stopPropagation()
        if (busy) { event.preventDefault(); return }
        activeRef.current = { kind, id }
        setActive(activeRef.current)
        setTarget(null)
        event.dataTransfer.effectAllowed = kind === 'item' || kind === 'trophy' ? 'linkMove' : 'move'
        // A payload is required by some browsers; only the in-memory descriptor is trusted.
        event.dataTransfer.setData('text/plain', id)
        const preview = event.currentTarget.closest(kind === 'item' ? '.item-main' : '.item-main, [data-notebook-group-header]')
        if (preview && event.dataTransfer.setDragImage) event.dataTransfer.setDragImage(preview, 12, 12)
      },
      onDragEnd: clearDrag,
    }
  }

  function resolve(event, destination) {
    const drag = activeRef.current
    if (busy || !drag) return null
    if (drag.kind === 'trophy' && ['section', 'section-header', 'grid'].includes(destination.type)) {
      const sectionId = destination.type === 'grid' ? destination.sectionId : destination.id
      const trophy = notebook.trophies.find(entry => entry.id === drag.id)
      if (!sectionId || !trophy || (trophy.sectionIds || []).includes(sectionId) || !notebook.sections.some(section => section.id === sectionId)) return null
      return destination.type === 'grid' ? { ...destination, linkSectionId: sectionId } : { type: 'section', id: sectionId }
    }
    if (drag.kind === 'section' || drag.kind === 'trophy') {
      const key = drag.kind === 'section' ? 'sections' : 'trophies'
      if (destination.type !== `${drag.kind}-header` || destination.id === drag.id || !notebook[key].some(group => group.id === destination.id)) return null
      const rect = event.currentTarget.getBoundingClientRect()
      const horizontal = drag.kind === 'section' && mode === 'grid'
      const before = horizontal ? event.clientX < rect.left + rect.width / 2 : event.clientY < rect.top + rect.height / 2
      return { type: destination.type, id: destination.id, placement: before ? 'before' : 'after' }
    }
    if (drag.kind !== 'item') return null
    let next = destination
    if (destination.type === 'section-header') next = { type: 'section', id: destination.id }
    if (destination.type === 'trophy-header') {
      if (mode !== 'general') return null
      next = { type: 'trophy', id: destination.id }
    }
    if (destination.type === 'trophy' && mode !== 'general') return null
    if (destination.type === 'item') {
      if (mode !== 'general') return null
      const rect = event.currentTarget.getBoundingClientRect()
      const ratio = rect.height ? (event.clientY - rect.top) / rect.height : 0.5
      next = { ...destination, placement: ratio < 0.25 ? 'before' : ratio > 0.75 ? 'after' : 'inside' }
    }
    if (destination.type === 'grid') {
      if (mode !== 'grid') return null
      if (destination.anchorId) {
        const rect = event.currentTarget.getBoundingClientRect()
        next = { ...destination, placement: event.clientY < rect.top + rect.height / 2 ? 'before' : 'after' }
      }
    }
    return canMoveNotebookItem(notebook, drag.id, next) ? next : null
  }

  function dropProps(destination) {
    return {
      onDragOver(event) {
        event.stopPropagation()
        const next = resolve(event, destination)
        if (next) {
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = next.type === 'section' || next.linkSectionId ? 'link' : 'move'
        } else if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
        setTarget(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
      },
      onDragLeave(event) {
        event.stopPropagation()
        if (!event.currentTarget.contains(event.relatedTarget)) setTarget(current => matchesTarget(current, destination) ? null : current)
      },
      onDrop(event) {
        event.stopPropagation()
        const drag = activeRef.current, destinationTarget = resolve(event, destination)
        if (drag) event.preventDefault()
        let next = notebook
        if (destinationTarget && drag) {
          if (drag.kind === 'trophy' && (destinationTarget.type === 'section' || destinationTarget.linkSectionId)) {
            const sectionId = destinationTarget.linkSectionId || destinationTarget.id
            next = repairMainSections({ ...notebook, trophies: notebook.trophies.map(trophy => trophy.id === drag.id ? { ...trophy, sectionIds: [...(trophy.sectionIds || []), sectionId] } : trophy) })
          } else {
            next = drag.kind === 'section' || drag.kind === 'trophy'
              ? moveNotebookGroup(notebook, drag.kind === 'section' ? 'sections' : 'trophies', drag.id, destinationTarget.id, destinationTarget.placement)
              : moveNotebookItem(notebook, drag.id, destinationTarget)
          }
        }
        clearDrag()
        if (next !== notebook) onMove(next)
      },
    }
  }

  function dropClass(destination) {
    if (!matchesTarget(target, destination)) return ''
    return `drop-${target.placement || 'inside'}`
  }

  return { rootRef, gridRef, active, handleProps, dropProps, dropClass, clearDrag }
}
