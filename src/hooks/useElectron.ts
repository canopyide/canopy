/**
 * useElectron Hook
 *
 * Provides typed access to the Electron API in React components.
 * Includes defensive checks for environments where the preload script may not be available.
 */

import type { ElectronAPI } from '../types/electron'

/**
 * Get the Electron API
 *
 * @returns The Electron API object
 * @throws Error if window.electron is not available
 */
export function useElectron(): ElectronAPI {
  if (typeof window === 'undefined' || !window.electron) {
    throw new Error(
      'Electron API is not available. Make sure the preload script is loaded correctly.'
    )
  }

  return window.electron
}

/**
 * Check if the Electron API is available
 *
 * Useful for conditional rendering or testing environments
 *
 * @returns True if the Electron API is available
 */
export function isElectronAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.electron
}
