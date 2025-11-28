/**
 * EventInspectorPanel Component
 *
 * Main event inspector panel that displays recent events from the central event bus.
 */

import { useCallback, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { useEventStore } from '@/store/eventStore'
import { EventTimeline } from './EventTimeline'
import { EventDetail } from './EventDetail'
import { EventFilters } from './EventFilters'
import { X, Trash2 } from 'lucide-react'

interface EventInspectorPanelProps {
  className?: string
}

export function EventInspectorPanel({ className }: EventInspectorPanelProps) {
  const {
    events,
    isOpen,
    filters,
    selectedEventId,
    autoScroll,
    addEvent,
    setEvents,
    clearEvents,
    setFilters,
    setSelectedEvent,
    getFilteredEvents,
  } = useEventStore()

  const timelineRef = useRef<HTMLDivElement>(null)
  const isUserScrolling = useRef(false)
  const isProgrammaticScroll = useRef(false)
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null)

  // Load initial events and set up subscription
  useEffect(() => {
    if (!isOpen || !window.electron?.eventInspector) return

    // Notify main process that we're subscribing
    window.electron.eventInspector.subscribe()

    // Load existing events
    window.electron.eventInspector.getEvents().then((existingEvents) => {
      setEvents(existingEvents)
    })

    // Subscribe to new events
    const unsubscribe = window.electron.eventInspector.onEvent((event) => {
      addEvent(event)
    })

    return () => {
      unsubscribe()
      // Notify main process that we're unsubscribing
      window.electron.eventInspector.unsubscribe()
    }
  }, [isOpen, addEvent, setEvents])

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && timelineRef.current && !isUserScrolling.current) {
      isProgrammaticScroll.current = true
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight
      // Reset flag after scroll completes
      setTimeout(() => {
        isProgrammaticScroll.current = false
      }, 50)
    }
  }, [events, autoScroll])

  // Handle user scrolling
  const handleScroll = useCallback(() => {
    if (!timelineRef.current) return

    // Ignore programmatic scrolls
    if (isProgrammaticScroll.current) return

    const { scrollTop, scrollHeight, clientHeight } = timelineRef.current
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50

    // Detect if user is scrolling
    isUserScrolling.current = true
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current)
    }
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false
    }, 100)

    // Auto-scroll is disabled when user scrolls up, enabled when at bottom
    if (!isAtBottom && autoScroll) {
      useEventStore.getState().setAutoScroll(false)
    } else if (isAtBottom && !autoScroll) {
      useEventStore.getState().setAutoScroll(true)
    }
  }, [events, autoScroll])

  const handleClearEvents = async () => {
    if (window.confirm('Clear all events? This cannot be undone.')) {
      // Clear local state
      clearEvents()
      // Clear main process buffer
      if (window.electron?.eventInspector) {
        await window.electron.eventInspector.clear()
      }
    }
  }

  // Early return before expensive operations
  if (!isOpen) return null

  // Only compute filtered events and selection when panel is open
  const filteredEvents = getFilteredEvents()
  const selectedEvent = selectedEventId ? events.find((e) => e.id === selectedEventId) || null : null

  return (
    <div className={cn('flex flex-col bg-background border-t', className)}>
      {/* Header */}
      <div className="flex-shrink-0 flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold">Event Inspector</h2>
          <span className="text-xs text-muted-foreground">
            {filteredEvents.length} {filteredEvents.length === 1 ? 'event' : 'events'}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleClearEvents}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Clear all events"
          >
            <Trash2 className="w-4 h-4" />
          </button>
          <button
            onClick={() => useEventStore.getState().setOpen(false)}
            className="p-1.5 hover:bg-muted rounded transition-colors"
            title="Close inspector"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Filters */}
      <EventFilters
        events={events}
        filters={filters}
        onFiltersChange={(newFilters) => setFilters(newFilters)}
      />

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Timeline (left) */}
        <div
          ref={timelineRef}
          onScroll={handleScroll}
          className="w-1/2 border-r overflow-y-auto"
        >
          <EventTimeline
            events={filteredEvents}
            selectedId={selectedEventId}
            onSelectEvent={setSelectedEvent}
          />
        </div>

        {/* Detail view (right) */}
        <div className="w-1/2 overflow-hidden">
          <EventDetail event={selectedEvent} />
        </div>
      </div>
    </div>
  )
}
