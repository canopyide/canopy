export { detectRepoOperationState, resolveGitDir } from "./repoOperationState.js";
export type { RepoOperationState } from "./repoOperationState.js";
export { parsePorcelainV2Conflicts, CONFLICT_LABELS } from "./porcelainConflicts.js";
export { STAGED_FILE_SIZE_CAP, scanStagedFilesForConflictMarkers } from "./conflictMarkerScan.js";
