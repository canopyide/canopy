import { useState, useCallback, useEffect, type ReactNode } from 'react'
import { Toolbar } from './Toolbar'
import { Sidebar } from './Sidebar'
import { LogsPanel } from '../Logs'

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

  // Restore sidebar width from persisted state
  useEffect(() => {
    const restoreSidebarWidth = async () => {
      try {
        const appState = await window.electron.app.getState()
        if (appState.sidebarWidth != null) {
          // Clamp to valid range
          const clampedWidth = Math.min(Math.max(appState.sidebarWidth, MIN_SIDEBAR_WIDTH), MAX_SIDEBAR_WIDTH)
          setSidebarWidth(clampedWidth)
        }
      } catch (error) {
        console.error('Failed to restore sidebar width:', error)
      }
    }
    restoreSidebarWidth()
  }, [])

  // Persist sidebar width changes (debounced via the resize handler)
  useEffect(() => {
    const persistSidebarWidth = async () => {
      try {
        await window.electron.app.setState({ sidebarWidth })
      } catch (error) {
        console.error('Failed to persist sidebar width:', error)
      }
    }

    // Only persist after initial mount (to avoid overwriting on restore)
    const timer = setTimeout(persistSidebarWidth, 300)
    return () => clearTimeout(timer)
  }, [sidebarWidth])

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
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          <Sidebar width={sidebarWidth} onResize={handleSidebarResize}>
            {sidebarContent}
          </Sidebar>
          <main className="flex-1 overflow-hidden bg-canopy-bg">
            {children}
          </main>
        </div>
        <LogsPanel />
      </div>
    </div>
  )
}
