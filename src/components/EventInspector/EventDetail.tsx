/**
 * EventDetail Component
 *
 * Displays detailed information about a selected event including full payload.
 */

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import type { EventRecord } from '@/store/eventStore'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'

interface EventDetailProps {
  event: EventRecord | null
  className?: string
}

export function EventDetail({ event, className }: EventDetailProps) {
  const [copied, setCopied] = useState(false)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['payload']))
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Clean up copy timeout when component unmounts or event changes
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
        copyTimeoutRef.current = null
      }
    }
  }, [event])

  if (!event) {
    return (
      <div className={cn('flex items-center justify-center text-sm text-muted-foreground h-full', className)}>
        <p>Select an event to view details</p>
      </div>
    )
  }

  const toggleSection = (section: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(section)) {
        next.delete(section)
      } else {
        next.add(section)
      }
      return next
    })
  }

  const copyPayload = async () => {
    try {
      const payloadStr = JSON.stringify(event.payload, null, 2)
      await navigator.clipboard.writeText(payloadStr)
      setCopied(true)

      // Clear any existing timeout
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current)
      }

      // Set new timeout
      copyTimeoutRef.current = setTimeout(() => {
        setCopied(false)
        copyTimeoutRef.current = null
      }, 2000)
    } catch (err) {
      console.error('Failed to copy payload:', err)
    }
  }

  const formatTimestamp = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toISOString()
  }

  const getTimeSince = (timestamp: number) => {
    const now = Date.now()
    const diff = now - timestamp
    if (diff < 1000) return `${diff}ms ago`
    if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
    return `${Math.floor(diff / 3600000)}h ago`
  }

  return (
    <div className={cn('flex flex-col h-full bg-background', className)}>
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0 space-y-1">
            <h3 className="font-mono text-sm font-semibold truncate">{event.type}</h3>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{formatTimestamp(event.timestamp)}</span>
              <span>•</span>
              <span>{getTimeSince(event.timestamp)}</span>
              <span>•</span>
              <span className="capitalize">{event.source}</span>
            </div>
          </div>
          <button
            onClick={copyPayload}
            className="flex-shrink-0 p-2 hover:bg-muted rounded transition-colors"
            title="Copy payload"
          >
            {copied ? (
              <Check className="w-4 h-4 text-green-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>
        </div>
      </div>

      {/* Metadata */}
      <div className="flex-shrink-0 border-b">
        <button
          onClick={() => toggleSection('metadata')}
          className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
        >
          {expandedSections.has('metadata') ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">Metadata</span>
        </button>
        {expandedSections.has('metadata') && (
          <div className="px-4 pb-3 space-y-2 text-sm">
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">Event ID:</span>
              <span className="font-mono text-xs truncate" title={event.id}>{event.id}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">Type:</span>
              <span className="font-mono text-xs">{event.type}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">Source:</span>
              <span className="font-mono text-xs capitalize">{event.source}</span>
            </div>
            <div className="grid grid-cols-[100px_1fr] gap-2">
              <span className="text-muted-foreground">Timestamp:</span>
              <span className="font-mono text-xs">{event.timestamp}</span>
            </div>
          </div>
        )}
      </div>

      {/* Payload */}
      <div className="flex-1 flex flex-col border-b">
        <button
          onClick={() => toggleSection('payload')}
          className="flex-shrink-0 px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
        >
          {expandedSections.has('payload') ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
          <span className="text-sm font-medium">Payload</span>
        </button>
        {expandedSections.has('payload') && (
          <div className="flex-1 overflow-auto px-4 pb-3">
            <pre className="text-xs font-mono bg-muted/50 p-3 rounded overflow-x-auto">
              {JSON.stringify(event.payload, null, 2)}
            </pre>
          </div>
        )}
      </div>

      {/* Context info */}
      {event.payload && (event.payload.worktreeId || event.payload.agentId || event.payload.taskId || event.payload.runId) && (
        <div className="flex-shrink-0">
          <button
            onClick={() => toggleSection('context')}
            className="w-full px-4 py-2 flex items-center gap-2 hover:bg-muted/50 transition-colors"
          >
            {expandedSections.has('context') ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronRight className="w-4 h-4" />
            )}
            <span className="text-sm font-medium">Context</span>
          </button>
          {expandedSections.has('context') && (
            <div className="px-4 pb-3 space-y-2 text-sm">
              {event.payload.worktreeId && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Worktree:</span>
                  <span className="font-mono text-xs truncate">{String(event.payload.worktreeId)}</span>
                </div>
              )}
              {event.payload.agentId && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Agent:</span>
                  <span className="font-mono text-xs truncate">{String(event.payload.agentId)}</span>
                </div>
              )}
              {event.payload.taskId && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Task:</span>
                  <span className="font-mono text-xs truncate">{String(event.payload.taskId)}</span>
                </div>
              )}
              {event.payload.runId && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Run:</span>
                  <span className="font-mono text-xs truncate">{String(event.payload.runId)}</span>
                </div>
              )}
              {event.payload.terminalId && (
                <div className="grid grid-cols-[100px_1fr] gap-2">
                  <span className="text-muted-foreground">Terminal:</span>
                  <span className="font-mono text-xs truncate">{String(event.payload.terminalId)}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
