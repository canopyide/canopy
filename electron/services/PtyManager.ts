/**
 * PtyManager Service
 *
 * Manages node-pty terminal instances for the integrated terminals.
 * Handles spawning, input/output, resize, and cleanup of PTY processes.
 */

import * as pty from 'node-pty'
import { EventEmitter } from 'events'

export interface PtySpawnOptions {
  cwd: string
  shell?: string           // Default: user's default shell
  args?: string[]          // Shell arguments (e.g., ['-l'] for login shell)
  env?: Record<string, string>
  cols: number
  rows: number
}

interface TerminalInfo {
  id: string
  ptyProcess: pty.IPty
  cwd: string
  shell: string
}

export interface PtyManagerEvents {
  data: (id: string, data: string) => void
  exit: (id: string, exitCode: number) => void
  error: (id: string, error: string) => void
}

export class PtyManager extends EventEmitter {
  private terminals: Map<string, TerminalInfo> = new Map()

  constructor() {
    super()
  }

  /**
   * Spawn a new PTY process
   * @param id - Unique identifier for this terminal
   * @param options - Spawn options including cwd, shell, cols, rows
   * @throws Error if PTY spawn fails
   */
  spawn(id: string, options: PtySpawnOptions): void {
    // Check if terminal with this ID already exists
    if (this.terminals.has(id)) {
      console.warn(`Terminal with id ${id} already exists, killing existing instance`)
      this.kill(id)
    }

    const shell = options.shell || this.getDefaultShell()
    const args = options.args || this.getDefaultShellArgs(shell)

    let ptyProcess: pty.IPty

    try {
      ptyProcess = pty.spawn(shell, args, {
        name: 'xterm-256color',
        cols: options.cols,
        rows: options.rows,
        cwd: options.cwd,
        env: { ...process.env, ...options.env } as Record<string, string>,
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      console.error(`Failed to spawn terminal ${id}:`, errorMessage)
      this.emit('error', id, errorMessage)
      throw new Error(`Failed to spawn terminal: ${errorMessage}`)
    }

    // Forward PTY data events
    ptyProcess.onData((data) => {
      this.emit('data', id, data)
    })

    // Handle PTY exit
    ptyProcess.onExit(({ exitCode }) => {
      this.emit('exit', id, exitCode ?? 0)
      this.terminals.delete(id)
    })

    this.terminals.set(id, { id, ptyProcess, cwd: options.cwd, shell })
  }

  /**
   * Write data to terminal stdin
   * @param id - Terminal identifier
   * @param data - Data to write
   */
  write(id: string, data: string): void {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.ptyProcess.write(data)
    } else {
      console.warn(`Terminal ${id} not found, cannot write data`)
    }
  }

  /**
   * Resize terminal
   * @param id - Terminal identifier
   * @param cols - New column count
   * @param rows - New row count
   */
  resize(id: string, cols: number, rows: number): void {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.ptyProcess.resize(cols, rows)
    } else {
      console.warn(`Terminal ${id} not found, cannot resize`)
    }
  }

  /**
   * Kill a terminal process
   * @param id - Terminal identifier
   */
  kill(id: string): void {
    const terminal = this.terminals.get(id)
    if (terminal) {
      terminal.ptyProcess.kill()
      this.terminals.delete(id)
    }
  }

  /**
   * Get information about a terminal
   * @param id - Terminal identifier
   * @returns Terminal info or undefined if not found
   */
  getTerminal(id: string): TerminalInfo | undefined {
    return this.terminals.get(id)
  }

  /**
   * Get all active terminal IDs
   * @returns Array of terminal IDs
   */
  getActiveTerminalIds(): string[] {
    return Array.from(this.terminals.keys())
  }

  /**
   * Check if a terminal exists
   * @param id - Terminal identifier
   * @returns True if terminal exists
   */
  hasTerminal(id: string): boolean {
    return this.terminals.has(id)
  }

  /**
   * Clean up all terminals (called on app quit)
   */
  dispose(): void {
    for (const [, terminal] of this.terminals) {
      try {
        terminal.ptyProcess.kill()
      } catch (error) {
        // Ignore errors during cleanup - process may already be dead
        console.warn(`Error killing terminal ${terminal.id}:`, error)
      }
    }
    this.terminals.clear()
    this.removeAllListeners()
  }

  /**
   * Get the default shell for the current platform
   * Tries multiple fallbacks to ensure a valid shell is found
   */
  private getDefaultShell(): string {
    if (process.platform === 'win32') {
      // Prefer PowerShell, fall back to cmd.exe
      return process.env.COMSPEC || 'powershell.exe'
    }

    // On macOS/Linux, try SHELL env var first
    if (process.env.SHELL) {
      return process.env.SHELL
    }

    // Try common shells in order of preference
    const fs = require('fs')
    const commonShells = ['/bin/zsh', '/bin/bash', '/bin/sh']

    for (const shell of commonShells) {
      try {
        if (fs.existsSync(shell)) {
          return shell
        }
      } catch (error) {
        // Continue to next shell if check fails
      }
    }

    // Last resort: /bin/sh should exist on all Unix-like systems
    return '/bin/sh'
  }

  /**
   * Get default arguments for the shell
   * @param shell - Shell path
   */
  private getDefaultShellArgs(shell: string): string[] {
    const shellName = shell.toLowerCase()

    // For login shells on Unix-like systems
    if (process.platform !== 'win32') {
      if (shellName.includes('zsh') || shellName.includes('bash')) {
        // Use login shell to load user's profile
        return ['-l']
      }
    }

    return []
  }
}

// Export singleton instance
let ptyManagerInstance: PtyManager | null = null

export function getPtyManager(): PtyManager {
  if (!ptyManagerInstance) {
    ptyManagerInstance = new PtyManager()
  }
  return ptyManagerInstance
}

export function disposePtyManager(): void {
  if (ptyManagerInstance) {
    ptyManagerInstance.dispose()
    ptyManagerInstance = null
  }
}
