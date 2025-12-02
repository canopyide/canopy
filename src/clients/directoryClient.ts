/**
 * Directory IPC Client (Legacy)
 *
 * This client has been deprecated. Directory functionality has been migrated
 * to the Projects system. Use the project API instead:
 *
 * - window.electron.project.getAll() - Get all projects
 * - window.electron.project.add(path) - Add a new project
 * - window.electron.project.switch(projectId) - Switch to a project
 * - window.electron.project.openDialog() - Open project picker
 */

/**
 * @deprecated Use the project API instead. This client is kept for backward compatibility.
 */
export const directoryClient = {
  // All methods have been removed as part of the migration to the Projects system.
  // See the project API for project management functionality.
} as const;
