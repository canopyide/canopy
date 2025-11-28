import { useState, useCallback, type ReactNode } from 'react'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'

interface AppLayoutProps {
  children?: ReactNode
  sidebarContent?: ReactNode
  onLaunchAgent?: (type: 'claude' | 'gemini' | 'shell') => void
  onRefresh?: () => void
  onSettings?: () => void
}

const MIN_SIDEBAR_WIDTH = 200
const MAX_SIDEBAR_WIDTH = 600
const DEFAULT_SIDEBAR_WIDTH = 350

export function AppLayout({
  children,
  sidebarContent,
  onLaunchAgent,
  onRefresh,
  onSettings,
}: AppLayoutProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_SIDEBAR_WIDTH)

  const handleSidebarResize = useCallback((newWidth: number) => {
    const clampedWidth = Math.min(Math.max(newWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
    setSidebarWidth(clampedWidth)
  }, [])

  const handleLaunchAgent = useCallback((type: 'claude' | 'gemini' | 'shell') => {
    onLaunchAgent?.(type)
  }, [onLaunchAgent])

  const handleRefresh = useCallback(() => {
    onRefresh?.()
  }, [onRefresh])

  const handleSettings = useCallback(() => {
    onSettings?.()
  }, [onSettings])

  return (
    <div className="h-screen flex flex-col bg-canopy-bg">
      <Toolbar
        onLaunchAgent={handleLaunchAgent}
        onRefresh={handleRefresh}
        onSettings={handleSettings}
      />
      <div className="flex-1 flex overflow-hidden">
        <Sidebar width={sidebarWidth} onResize={handleSidebarResize}>
          {sidebarContent}
        </Sidebar>
        <main className="flex-1 overflow-hidden bg-canopy-bg">
          {children}
        </main>
      </div>
    </div>
  )
}
