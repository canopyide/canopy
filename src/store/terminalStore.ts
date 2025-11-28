/**
 * Terminal Store
 *
 * Zustand store for managing terminal instances and grid state.
 * Handles terminal spawning, focus management, and maximize/restore.
 */

import { create, type StateCreator } from 'zustand'
import type { TerminalType } from '@/components/Terminal/TerminalPane'

export interface TerminalInstance {
  id: string
  type: TerminalType
  title: string
  worktreeId?: string
  cwd: string
}

export interface AddTerminalOptions {
  type?: TerminalType
  title?: string
  worktreeId?: string
  cwd: string
  shell?: string
  /** Command to execute after shell starts (e.g., 'claude' for AI agents) */
  command?: string
}

interface TerminalGridState {
  terminals: TerminalInstance[]
  focusedId: string | null
  maximizedId: string | null

  addTerminal: (options: AddTerminalOptions) => Promise<string>
  removeTerminal: (id: string) => void
  updateTitle: (id: string, newTitle: string) => void
  setFocused: (id: string | null) => void
  toggleMaximize: (id: string) => void
  focusNext: () => void
  focusPrevious: () => void
}

const TYPE_TITLES: Record<TerminalType, string> = {
  shell: 'Shell',
  claude: 'Claude',
  gemini: 'Gemini',
  custom: 'Terminal',
}

const createTerminalStore: StateCreator<TerminalGridState> = (set) => ({
  terminals: [],
  focusedId: null,
  maximizedId: null,

  addTerminal: async (options) => {
    const type = options.type || 'shell'
    const title = options.title || TYPE_TITLES[type]

    try {
      // Spawn the PTY process via IPC
      const id = await window.electron.terminal.spawn({
        cwd: options.cwd,
        shell: options.shell,
        cols: 80,
        rows: 24,
        command: options.command,
      })

      const terminal: TerminalInstance = {
        id,
        type,
        title,
        worktreeId: options.worktreeId,
        cwd: options.cwd,
      }

      set((state) => {
        const newTerminals = [...state.terminals, terminal]

        // Persist terminal list to electron-store
        window.electron.app.setState({
          terminals: newTerminals.map(t => ({
            id: t.id,
            type: t.type,
            title: t.title,
            cwd: t.cwd,
            worktreeId: t.worktreeId,
          }))
        }).catch((error) => {
          console.error('Failed to persist terminals:', error)
        })

        return {
          terminals: newTerminals,
          focusedId: id,
        }
      })

      return id
    } catch (error) {
      console.error('Failed to spawn terminal:', error)
      throw error
    }
  },

  removeTerminal: (id) => {
    // Kill the PTY process
    window.electron.terminal.kill(id).catch((error) => {
      console.error('Failed to kill terminal:', error)
      // Continue with state cleanup even if kill fails
    })

    set((state) => {
      const newTerminals = state.terminals.filter((t) => t.id !== id)
      const currentIndex = state.terminals.findIndex((t) => t.id === id)

      // Determine new focused terminal
      let newFocusedId: string | null = null
      if (state.focusedId === id && newTerminals.length > 0) {
        // Focus the next terminal, or the previous if we removed the last one
        const nextIndex = Math.min(currentIndex, newTerminals.length - 1)
        newFocusedId = newTerminals[nextIndex]?.id || null
      } else if (state.focusedId !== id) {
        newFocusedId = state.focusedId
      }

      // Persist updated terminal list
      window.electron.app.setState({
        terminals: newTerminals.map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          cwd: t.cwd,
          worktreeId: t.worktreeId,
        }))
      }).catch((error) => {
        console.error('Failed to persist terminals:', error)
      })

      return {
        terminals: newTerminals,
        focusedId: newFocusedId,
        maximizedId: state.maximizedId === id ? null : state.maximizedId,
      }
    })
  },

  setFocused: (id) => set({ focusedId: id }),

  updateTitle: (id, newTitle) => {
    set((state) => {
      const terminal = state.terminals.find((t) => t.id === id)
      if (!terminal) return state

      // Use trimmed title, or fall back to default title based on type
      const effectiveTitle = newTitle.trim() || TYPE_TITLES[terminal.type]
      const newTerminals = state.terminals.map((t) =>
        t.id === id ? { ...t, title: effectiveTitle } : t
      )

      // Persist updated terminal list
      window.electron.app.setState({
        terminals: newTerminals.map(t => ({
          id: t.id,
          type: t.type,
          title: t.title,
          cwd: t.cwd,
          worktreeId: t.worktreeId,
        }))
      }).catch((error) => {
        console.error('Failed to persist terminals:', error)
      })

      return { terminals: newTerminals }
    })
  },

  toggleMaximize: (id) =>
    set((state) => ({
      maximizedId: state.maximizedId === id ? null : id,
    })),

  focusNext: () =>
    set((state) => {
      if (state.terminals.length === 0) return state
      const currentIndex = state.focusedId
        ? state.terminals.findIndex((t) => t.id === state.focusedId)
        : -1
      const nextIndex = (currentIndex + 1) % state.terminals.length
      return { focusedId: state.terminals[nextIndex].id }
    }),

  focusPrevious: () =>
    set((state) => {
      if (state.terminals.length === 0) return state
      const currentIndex = state.focusedId
        ? state.terminals.findIndex((t) => t.id === state.focusedId)
        : 0
      const prevIndex =
        currentIndex <= 0 ? state.terminals.length - 1 : currentIndex - 1
      return { focusedId: state.terminals[prevIndex].id }
    }),
})

export const useTerminalStore = create<TerminalGridState>()(createTerminalStore)
