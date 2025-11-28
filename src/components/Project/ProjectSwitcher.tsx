/**
 * ProjectSwitcher Component
 *
 * Dropdown menu for switching between projects
 */

import { useState } from 'react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { useProjects } from '../../hooks/useProjects'

export function ProjectSwitcher() {
  const { projects, currentProject, switchProject, openDirectoryDialog } = useProjects()
  const [isOpen, setIsOpen] = useState(false)

  const handleSwitchProject = async (projectId: string) => {
    try {
      await switchProject(projectId)
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to switch project:', error)
    }
  }

  const handleOpenDialog = async () => {
    try {
      await openDirectoryDialog()
      setIsOpen(false)
    } catch (error) {
      console.error('Failed to open directory:', error)
    }
  }

  if (!currentProject && projects.length === 0) {
    return (
      <button
        onClick={handleOpenDialog}
        className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-800 transition-colors"
      >
        <span className="text-sm text-zinc-400">Open Project...</span>
      </button>
    )
  }

  return (
    <DropdownMenu open={isOpen} onOpenChange={setIsOpen}>
      <DropdownMenuTrigger asChild>
        <button className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-zinc-800 transition-colors text-left w-full">
          <span className="text-lg">{currentProject?.emoji || '🌲'}</span>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-zinc-200 truncate">
              {currentProject?.name || 'No Project'}
            </div>
            <div className="text-xs text-zinc-500 truncate">
              {currentProject?.path || ''}
            </div>
          </div>
          <svg
            className="w-4 h-4 text-zinc-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" className="w-64 bg-zinc-900 border-zinc-800">
        {projects.length > 0 && (
          <>
            {projects.map((project) => (
              <DropdownMenuItem
                key={project.id}
                onClick={() => handleSwitchProject(project.id)}
                className={`flex items-start gap-2 px-3 py-2 ${
                  project.id === currentProject?.id
                    ? 'bg-zinc-800'
                    : 'hover:bg-zinc-800'
                }`}
              >
                <span className="text-lg flex-shrink-0">{project.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-zinc-200 truncate">
                    {project.name}
                  </div>
                  <div className="text-xs text-zinc-500 truncate">
                    {project.path}
                  </div>
                  <div className="text-xs text-zinc-600">
                    Last opened: {new Date(project.lastOpened).toLocaleDateString()}
                  </div>
                </div>
                {project.id === currentProject?.id && (
                  <svg
                    className="w-4 h-4 text-green-500 flex-shrink-0 mt-1"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clipRule="evenodd"
                    />
                  </svg>
                )}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator className="bg-zinc-800" />
          </>
        )}

        <DropdownMenuItem
          onClick={handleOpenDialog}
          className="flex items-center gap-2 px-3 py-2 hover:bg-zinc-800 text-zinc-400"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 4v16m8-8H4"
            />
          </svg>
          <span className="text-sm">Open Other...</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
