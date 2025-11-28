import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  width: number
  onResize: (width: number) => void
  children?: ReactNode
  className?: string
}

const RESIZE_STEP = 10

export function Sidebar({ width, onResize, children, className }: SidebarProps) {
  const [isResizing, setIsResizing] = useState(false)
  const sidebarRef = useRef<HTMLElement>(null)

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setIsResizing(true)
  }, [])

  const stopResizing = useCallback(() => {
    setIsResizing(false)
  }, [])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault()
        onResize(width - RESIZE_STEP)
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        onResize(width + RESIZE_STEP)
      }
    },
    [width, onResize]
  )

  const resize = useCallback(
    (e: MouseEvent) => {
      if (isResizing && sidebarRef.current) {
        const newWidth = e.clientX - sidebarRef.current.getBoundingClientRect().left
        onResize(newWidth)
      }
    },
    [isResizing, onResize]
  )

  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', resize)
      document.addEventListener('mouseup', stopResizing)
      // Add cursor style to body during resize
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
    }

    return () => {
      document.removeEventListener('mousemove', resize)
      document.removeEventListener('mouseup', stopResizing)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
  }, [isResizing, resize, stopResizing])

  return (
    <aside
      ref={sidebarRef}
      className={cn(
        'relative border-r border-canopy-border bg-canopy-sidebar overflow-y-auto shrink-0',
        className
      )}
      style={{ width }}
    >
      {/* Sidebar content */}
      <div className="h-full overflow-y-auto">
        {children}
      </div>

      {/* Resize handle */}
      <div
        role="separator"
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuenow={width}
        tabIndex={0}
        className={cn(
          'absolute top-0 right-0 w-1 h-full cursor-col-resize',
          'hover:bg-canopy-accent/50 transition-colors focus:outline-none focus:bg-canopy-accent',
          isResizing && 'bg-canopy-accent'
        )}
        onMouseDown={startResizing}
        onKeyDown={handleKeyDown}
      />
    </aside>
  )
}
