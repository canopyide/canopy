/**
 * EventsContent Component
 *
 * Content component for the Events tab in the diagnostics dock.
 * Displays event timeline extracted from the original EventInspectorPanel.
 */

import { useCallback, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { useEventStore } from "@/store/eventStore";
import { EventTimeline } from "../EventInspector/EventTimeline";
import { EventDetail } from "../EventInspector/EventDetail";
import { EventFilters } from "../EventInspector/EventFilters";

export interface EventsContentProps {
  className?: string;
}

export function EventsContent({ className }: EventsContentProps) {
  const {
    events,
    filters,
    selectedEventId,
    autoScroll,
    setAutoScroll,
    addEvent,
    setEvents,
    setFilters,
    setSelectedEvent,
    getFilteredEvents,
  } = useEventStore();

  const timelineRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  // Load initial events and set up subscription
  useEffect(() => {
    if (!window.electron?.eventInspector) return;

    // Notify main process that we're subscribing
    window.electron.eventInspector.subscribe();

    // Load existing events
    window.electron.eventInspector
      .getEvents()
      .then((existingEvents) => {
        setEvents(existingEvents);
      })
      .catch((error) => {
        console.error("Failed to load events:", error);
      });

    // Subscribe to new events
    const unsubscribe = window.electron.eventInspector.onEvent((event) => {
      addEvent(event);
    });

    return () => {
      unsubscribe();
      // Notify main process that we're unsubscribing
      window.electron.eventInspector.unsubscribe();
    };
  }, [addEvent, setEvents]);

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && timelineRef.current && !isUserScrolling.current) {
      isProgrammaticScroll.current = true;
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
      // Reset flag after scroll completes
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 50);
    }
  }, [events, autoScroll]);

  // Handle user scrolling
  const handleScroll = useCallback(() => {
    if (!timelineRef.current) return;

    // Ignore programmatic scrolls
    if (isProgrammaticScroll.current) return;

    const { scrollTop, scrollHeight, clientHeight } = timelineRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    // Detect if user is scrolling
    isUserScrolling.current = true;
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 100);

    // Auto-scroll is disabled when user scrolls up, enabled when at bottom
    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  }, [autoScroll, setAutoScroll]);

  // Memoize filtered events to avoid unnecessary re-renders
  const filteredEvents = useMemo(() => getFilteredEvents(), [getFilteredEvents]);
  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) || null
    : null;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Filters */}
      <EventFilters
        events={events}
        filters={filters}
        onFiltersChange={(newFilters) => setFilters(newFilters)}
      />

      {/* Main content area */}
      <div className="flex-1 flex min-h-0">
        {/* Timeline (left) */}
        <div ref={timelineRef} onScroll={handleScroll} className="w-1/2 border-r overflow-y-auto">
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
  );
}
