/**
 * EventTimeline Component
 *
 * Displays a vertical timeline of events with timestamps and summary information.
 */

import { cn } from '@/lib/utils'
import type { EventRecord } from '@/store/eventStore'
import { Clock, Circle } from 'lucide-react'

interface EventTimelineProps {
  events: EventRecord[]
  selectedId: string | null
  onSelectEvent: (id: string) => void
  className?: string
}

export function EventTimeline({ events, selectedId, onSelectEvent, className }: EventTimelineProps) {
  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    const hours = date.getHours().toString().padStart(2, '0')
    const minutes = date.getMinutes().toString().padStart(2, '0')
    const seconds = date.getSeconds().toString().padStart(2, '0')
    const ms = date.getMilliseconds().toString().padStart(3, '0')
    return `${hours}:${minutes}:${seconds}.${ms}`
  }

  const getEventCategory = (type: string): string => {
    if (type.startsWith('sys:')) return 'system'
    if (type.startsWith('agent:')) return 'agent'
    if (type.startsWith('task:')) return 'task'
    if (type.startsWith('run:')) return 'run'
    if (type.startsWith('server:')) return 'devserver'
    if (type.startsWith('watcher:')) return 'watcher'
    if (type.startsWith('file:')) return 'file'
    if (type.startsWith('ui:')) return 'ui'
    return 'other'
  }

  const getCategoryColor = (category: string): string => {
    switch (category) {
      case 'system':
        return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
      case 'agent':
        return 'bg-purple-500/20 text-purple-400 border-purple-500/30'
      case 'task':
        return 'bg-green-500/20 text-green-400 border-green-500/30'
      case 'run':
        return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
      case 'devserver':
        return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
      case 'watcher':
        return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
      case 'file':
        return 'bg-pink-500/20 text-pink-400 border-pink-500/30'
      case 'ui':
        return 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30'
      default:
        return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
    }
  }

  const getPayloadSummary = (event: EventRecord): string => {
    const { payload } = event
    if (!payload || typeof payload !== 'object') return ''

    // Extract relevant IDs for display
    const parts: string[] = []
    if (payload.worktreeId) parts.push(`worktree: ${String(payload.worktreeId).substring(0, 8)}`)
    if (payload.agentId) parts.push(`agent: ${String(payload.agentId).substring(0, 8)}`)
    if (payload.taskId) parts.push(`task: ${String(payload.taskId).substring(0, 8)}`)
    if (payload.runId) parts.push(`run: ${String(payload.runId).substring(0, 8)}`)
    if (payload.terminalId) parts.push(`terminal: ${String(payload.terminalId).substring(0, 8)}`)

    return parts.length > 0 ? parts.join(' • ') : ''
  }

  if (events.length === 0) {
    return (
      <div className={cn('flex-1 flex items-center justify-center text-sm text-muted-foreground', className)}>
        <div className="text-center space-y-2">
          <Circle className="w-8 h-8 mx-auto opacity-30" />
          <p>No events captured yet</p>
          <p className="text-xs">Events will appear here as they occur</p>
        </div>
      </div>
    )
  }

  return (
    <div className={cn('flex-1 overflow-y-auto', className)}>
      <div className="space-y-px">
        {events.map((event) => {
          const category = getEventCategory(event.type)
          const colorClass = getCategoryColor(category)
          const isSelected = event.id === selectedId
          const summary = getPayloadSummary(event)

          return (
            <button
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              className={cn(
                'w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors',
                'border-l-2 border-transparent',
                isSelected && 'bg-muted border-l-primary'
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 pt-0.5">
                  <Clock className="w-3 h-3 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-muted-foreground">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center px-2 py-0.5 rounded text-xs font-mono border',
                        colorClass
                      )}
                    >
                      {event.type}
                    </span>
                  </div>
                  {summary && (
                    <p className="text-xs text-muted-foreground font-mono truncate">{summary}</p>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
