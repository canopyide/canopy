/**
 * useProjects Hook
 *
 * React hook for managing project state
 */

import { useEffect, useState, useCallback } from 'react'

interface Project {
  id: string
  path: string
  name: string
  emoji: string
  aiGeneratedName?: string
  aiGeneratedEmoji?: string
  lastOpened: number
  color?: string
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [currentProject, setCurrentProject] = useState<Project | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Load projects on mount
  useEffect(() => {
    const loadProjects = async () => {
      try {
        setLoading(true)
        const [allProjects, current] = await Promise.all([
          window.electron.project.getAll(),
          window.electron.project.getCurrent(),
        ])

        setProjects(allProjects.sort((a, b) => b.lastOpened - a.lastOpened))
        setCurrentProject(current)
        setError(null)
      } catch (err) {
        console.error('Failed to load projects:', err)
        setError(err instanceof Error ? err.message : 'Failed to load projects')
      } finally {
        setLoading(false)
      }
    }

    loadProjects()
  }, [])

  // Create a new project
  const createProject = useCallback(async (path: string, name?: string, emoji?: string) => {
    try {
      const project = await window.electron.project.create(path, name, emoji)
      setProjects(prev => [project, ...prev.filter(p => p.id !== project.id)])
      setCurrentProject(project)
      return project
    } catch (err) {
      console.error('Failed to create project:', err)
      throw err
    }
  }, [])

  // Update a project
  const updateProject = useCallback(async (id: string, updates: { name?: string; emoji?: string; color?: string }) => {
    try {
      await window.electron.project.update(id, updates)
      setProjects(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p))
      if (currentProject?.id === id) {
        setCurrentProject(prev => prev ? { ...prev, ...updates } : null)
      }
    } catch (err) {
      console.error('Failed to update project:', err)
      throw err
    }
  }, [currentProject])

  // Remove a project
  const removeProject = useCallback(async (id: string) => {
    try {
      await window.electron.project.remove(id)
      setProjects(prev => prev.filter(p => p.id !== id))
      if (currentProject?.id === id) {
        setCurrentProject(null)
      }
    } catch (err) {
      console.error('Failed to remove project:', err)
      throw err
    }
  }, [currentProject])

  // Switch to a project
  const switchProject = useCallback(async (id: string) => {
    try {
      await window.electron.project.switch(id)
      const project = projects.find(p => p.id === id)
      if (project) {
        setCurrentProject(project)
        // Reload page to reflect new project state
        window.location.reload()
      }
    } catch (err) {
      console.error('Failed to switch project:', err)
      throw err
    }
  }, [projects])

  // Open directory dialog and create project
  const openDirectoryDialog = useCallback(async () => {
    try {
      const path = await window.electron.directory.openDialog()
      if (path) {
        return await createProject(path)
      }
      return null
    } catch (err) {
      console.error('Failed to open directory:', err)
      throw err
    }
  }, [createProject])

  return {
    projects,
    currentProject,
    loading,
    error,
    createProject,
    updateProject,
    removeProject,
    switchProject,
    openDirectoryDialog,
  }
}
