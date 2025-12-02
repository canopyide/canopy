import { useCallback, useEffect, useRef, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useEventStore } from "@/store/eventStore";
import { EventTimeline } from "../EventInspector/EventTimeline";
import { EventDetail } from "../EventInspector/EventDetail";
import { EventFilters } from "../EventInspector/EventFilters";
import { eventInspectorClient } from "@/clients";

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
  } = useEventStore(
    useShallow((state) => ({
      events: state.events,
      filters: state.filters,
      selectedEventId: state.selectedEventId,
      autoScroll: state.autoScroll,
      setAutoScroll: state.setAutoScroll,
      addEvent: state.addEvent,
      setEvents: state.setEvents,
      setFilters: state.setFilters,
      setSelectedEvent: state.setSelectedEvent,
      getFilteredEvents: state.getFilteredEvents,
    }))
  );

  const timelineRef = useRef<HTMLDivElement>(null);
  const isUserScrolling = useRef(false);
  const isProgrammaticScroll = useRef(false);
  const scrollTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    eventInspectorClient.subscribe();

    eventInspectorClient
      .getEvents()
      .then((existingEvents) => {
        setEvents(existingEvents);
      })
      .catch((error) => {
        console.error("Failed to load events:", error);
      });

    const unsubscribe = eventInspectorClient.onEvent((event) => {
      addEvent(event);
    });

    return () => {
      unsubscribe();
      eventInspectorClient.unsubscribe();
    };
  }, [addEvent, setEvents]);

  useEffect(() => {
    if (autoScroll && timelineRef.current && !isUserScrolling.current) {
      isProgrammaticScroll.current = true;
      timelineRef.current.scrollTop = timelineRef.current.scrollHeight;
      setTimeout(() => {
        isProgrammaticScroll.current = false;
      }, 50);
    }
  }, [events, autoScroll]);

  const handleScroll = useCallback(() => {
    if (!timelineRef.current) return;

    if (isProgrammaticScroll.current) return;

    const { scrollTop, scrollHeight, clientHeight } = timelineRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

    isUserScrolling.current = true;
    if (scrollTimeout.current) {
      clearTimeout(scrollTimeout.current);
    }
    scrollTimeout.current = setTimeout(() => {
      isUserScrolling.current = false;
    }, 100);

    if (!isAtBottom && autoScroll) {
      setAutoScroll(false);
    } else if (isAtBottom && !autoScroll) {
      setAutoScroll(true);
    }
  }, [autoScroll, setAutoScroll]);

  const filteredEvents = useMemo(() => getFilteredEvents(), [getFilteredEvents]);
  const selectedEvent = selectedEventId
    ? events.find((e) => e.id === selectedEventId) || null
    : null;

  return (
    <div className={cn("flex flex-col h-full", className)}>
      <EventFilters
        events={events}
        filters={filters}
        onFiltersChange={(newFilters) => setFilters(newFilters)}
      />

      <div className="flex-1 flex min-h-0">
        <div ref={timelineRef} onScroll={handleScroll} className="w-1/2 border-r overflow-y-auto">
          <EventTimeline
            events={filteredEvents}
            selectedId={selectedEventId}
            onSelectEvent={setSelectedEvent}
          />
        </div>

        <div className="w-1/2 overflow-hidden">
          <EventDetail event={selectedEvent} />
        </div>
      </div>
    </div>
  );
}
