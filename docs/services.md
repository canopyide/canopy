# Services Reference

Main process services in `electron/services/` implement core business logic.

## Worktree Services

### WorktreeService

**File:** [`electron/services/WorktreeService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/WorktreeService.ts)

Orchestrates worktree monitoring across all git worktrees.

- Discovers worktrees in the project directory
- Spawns WorktreeMonitor instances for each worktree
- Aggregates status updates for the UI
- Manages polling intervals

### WorktreeMonitor

**File:** [`electron/services/WorktreeMonitor.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/WorktreeMonitor.ts)

Monitors a single git worktree.

- Polls git status at configurable intervals
- Tracks file changes (added, modified, deleted)
- Calculates insertion/deletion statistics
- Extracts issue numbers from branch names
- Reads `.git/canopy/note` files for AI context

### PullRequestService

**File:** [`electron/services/PullRequestService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/PullRequestService.ts)

Fetches pull request information from GitHub.

- Queries GitHub API for PR details
- Associates PRs with worktrees based on branch names
- Caches PR data to reduce API calls

### GitService

**File:** [`electron/services/GitService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/GitService.ts)

Provides Git operations via simple-git.

- Execute git commands (status, diff, commit, etc.)
- Repository discovery and validation
- Branch and remote management

### GitHubService

**File:** [`electron/services/GitHubService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/GitHubService.ts)

GitHub API integration.

- Fetch issues and pull requests
- Handle GitHub authentication
- Rate limit management

## Terminal Services

### PtyManager

**File:** [`electron/services/PtyManager.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/PtyManager.ts)

Manages pseudo-terminal processes.

- Spawns node-pty processes for terminals
- Handles input/output streaming via IPC
- Manages terminal resize events
- Cleans up processes on terminal close

### AgentStateMachine

**File:** [`electron/services/AgentStateMachine.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/AgentStateMachine.ts)

Tracks AI agent lifecycle states.

States:
- `idle` - Agent not running
- `working` - Agent actively processing
- `waiting` - Agent waiting for user input
- `completed` - Agent finished successfully
- `failed` - Agent encountered an error

Detection uses heuristics based on terminal output patterns.

### TranscriptManager

**File:** [`electron/services/TranscriptManager.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/TranscriptManager.ts)

Records agent session transcripts.

- Captures terminal output for agent sessions
- Associates transcripts with agent state changes
- Supports export and retrieval via IPC

### ArtifactExtractor

**File:** [`electron/services/ArtifactExtractor.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ArtifactExtractor.ts)

Extracts code artifacts from agent output.

- Detects code blocks in markdown
- Identifies patches and diffs
- Categorizes by language/type

### PtyClient

**File:** [`electron/services/PtyClient.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/PtyClient.ts)

Client interface for interacting with PTY processes.

- Abstracts PTY communication
- Handles input/output streaming

### PtyPool

**File:** [`electron/services/PtyPool.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/PtyPool.ts)

Manages a pool of PTY processes for reuse.

- Resource pooling for better performance
- Automatic cleanup of idle processes

## Dev Server Management

### DevServerManager

**File:** [`electron/services/DevServerManager.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/DevServerManager.ts)

Manages development server lifecycles per worktree.

- Auto-detects dev/start scripts from package.json
- Spawns and tracks server processes
- Parses stdout for URL/port detection
- Provides start/stop/restart controls
- Streams logs to the UI

## Context Generation

### CopyTreeService

**File:** [`electron/services/CopyTreeService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/CopyTreeService.ts)

Integrates with CopyTree for context generation.

- Generates codebase context for AI agents
- Selects format based on target agent (XML, Markdown)
- Reports progress during generation
- Handles file selection for targeted context

## Project Management

### ProjectStore

**File:** [`electron/services/ProjectStore.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ProjectStore.ts)

Manages multi-project support.

- Stores project configurations
- Handles project switching with state preservation
- Persists recent projects list

## Utilities

### CliAvailabilityService

**File:** [`electron/services/CliAvailabilityService.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/CliAvailabilityService.ts)

Checks availability of CLI tools.

- Detects installed agent CLIs (Claude, Gemini, etc.)
- Validates command availability

### ProcessDetector

**File:** [`electron/services/ProcessDetector.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ProcessDetector.ts)

Detects running processes.

- Identifies agent processes
- Process lifecycle detection

### ActivityMonitor

**File:** [`electron/services/ActivityMonitor.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ActivityMonitor.ts)

Monitors system and application activity.

- Tracks user interactions
- Detects idle states

## Observability

### EventBuffer

**File:** [`electron/services/EventBuffer.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/EventBuffer.ts)

Buffers events for the Event Inspector.

- Circular buffer for recent events
- Filtering by source and type
- Subscription support for real-time updates

### LogBuffer

**File:** [`electron/services/LogBuffer.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/LogBuffer.ts)

Aggregates logs from all services.

- Collects logs from multiple sources
- Provides filtering by source
- Supports log export

### events.ts

**File:** [`electron/services/events.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/events.ts)

Event bus for main process internal communication.

## AI Integration

### AI Client

**File:** [`electron/services/ai/client.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ai/client.ts)

OpenAI SDK wrapper.

- API key management with secure storage
- Model selection
- Request/response handling

### Worktree AI

**File:** [`electron/services/ai/worktree.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ai/worktree.ts)

Generates AI summaries for worktree changes.

### Project Identity

**File:** [`electron/services/ai/identity.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ai/identity.ts)

Generates AI-powered project identities (descriptions, themes).

### Issue Extractor

**File:** [`electron/services/ai/issueExtractor.ts`](https://github.com/gregpriday/canopy-electron/blob/main/electron/services/ai/issueExtractor.ts)

Detects GitHub issues from branch names and commit messages.
