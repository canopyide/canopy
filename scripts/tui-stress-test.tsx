#!/usr/bin/env node
/**
 * TUI Stress Test for Terminal Flicker Issue (#800)
 *
 * Uses actual Ink framework to reproduce the exact rendering behavior
 * that causes flickering in xterm.js-based terminals.
 *
 * TODO: Remove this file once issue #800 is resolved.
 */

import React, { useState, useEffect } from 'react';
import { render, Box, Text, Newline } from 'ink';
import Spinner from 'ink-spinner';

// Simulated AI agent output
const agentOutput = `
Claude I'll help you implement the terminal rendering optimization. Let me start by analyzing the current codebase.

> Read src/components/Terminal/XtermAdapter.tsx

I can see the XtermAdapter component handles the xterm.js integration. The key areas for optimization are:

1. Refresh Management - The current implementation calls terminal.refresh(0, rows-1) which forces a full redraw
2. WebGL Renderer - The addon is being recreated on visibility changes
3. Output Throttling - Data is written directly without batching on the renderer side

Let me look at the TerminalInstanceService to understand the data flow better.

> Read src/services/TerminalInstanceService.ts

The service uses a ring buffer polling mechanism with a 1-4ms interval. Here's the relevant code:

\`\`\`typescript
private poll = (): void => {
  const now = performance.now();
  const isActive = now - this.lastActivityTime < this.ACTIVE_THRESHOLD;
  const delay = isActive ? 1 : 4;

  for (const [terminalId, instance] of this.instances) {
    if (instance.buffer.available() > 0) {
      const data = instance.buffer.read();
      instance.terminal.write(data);
    }
  }

  this.pollTimer = setTimeout(this.poll, delay);
};
\`\`\`

The issue is that when TUI frameworks like Ink send rapid updates with cursor movement
and erase sequences, each write triggers xterm.js to recalculate and potentially redraw
affected regions. The eraseDown sequence is particularly problematic.

> Read electron/services/pty/TerminalProcess.ts

Looking at the PTY side, I can see the OutputThrottler batches at 4ms intervals:

\`\`\`typescript
export class OutputThrottler {
  private buffer: string[] = [];
  private timer: NodeJS.Timeout | null = null;
  private readonly THROTTLE_MS = 4;

  write(data: string): void {
    this.buffer.push(data);
    if (!this.timer) {
      this.timer = setTimeout(() => this.flush(), this.THROTTLE_MS);
    }
  }

  private flush(): void {
    const combined = this.buffer.join('');
    this.buffer = [];
    this.timer = null;
    this.onData(combined);
  }
}
\`\`\`

This batching helps but may not be sufficient for high-frequency TUI animations.

Root Cause Analysis:

When Ink renders an animation frame, it sends:
1. Cursor up N lines
2. Erase from cursor to end of screen
3. New frame content with ANSI styling

The erase sequence invalidates all rows below the cursor in xterm.js's internal
buffer, causing the WebGL renderer to mark those cells as dirty.

Proposed Solutions:

1. Frame Coalescing - Batch multiple writes within a single animation frame
2. Dirty Region Optimization - Track which rows actually changed vs just erased
3. Double Buffering - Render to offscreen buffer before displaying
4. Refresh Throttling - Limit refresh calls during high-frequency updates

> Edit src/services/TerminalInstanceService.ts

\`\`\`typescript
// Add requestAnimationFrame-based write coalescing
private pendingWrites = new Map<string, string[]>();
private rafHandle: number | null = null;

private scheduleWrite(terminalId: string, data: string): void {
  if (!this.pendingWrites.has(terminalId)) {
    this.pendingWrites.set(terminalId, []);
  }
  this.pendingWrites.get(terminalId)!.push(data);

  if (!this.rafHandle) {
    this.rafHandle = requestAnimationFrame(() => {
      this.flushWrites();
      this.rafHandle = null;
    });
  }
}
\`\`\`

✓ Changes applied successfully.

> Bash npm run typecheck

✓ TypeScript compilation successful - no errors

> Bash npm run test

Running test suite...

  ✓ TerminalInstanceService.test.ts (12 tests)
  ✓ XtermAdapter.test.ts (8 tests)
  ✓ OutputThrottler.test.ts (5 tests)

All 25 tests passed in 3.42s

The implementation is complete. Would you like me to run the stress test to verify the fix?
`.trim();

function ProgressBar({ percent, width = 30 }) {
  const filled = Math.floor((percent / 100) * width);
  const empty = width - filled;
  return (
    <Text>
      <Text color="green">{'█'.repeat(filled)}</Text>
      <Text color="gray">{'░'.repeat(empty)}</Text>
    </Text>
  );
}

function Task({ name, status, progress, color }) {
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={color}><Spinner type="dots" /></Text>
        <Text bold> {name.padEnd(14)}</Text>
        <Text color={progress > 80 ? 'green' : progress > 40 ? 'yellow' : 'cyan'}>
          {status.padEnd(20)}
        </Text>
      </Box>
      <Box marginLeft={2}>
        <Text>[</Text>
        <ProgressBar percent={progress} width={40} />
        <Text>] {String(progress).padStart(3)}%</Text>
      </Box>
    </Box>
  );
}

function LogEntry({ timestamp, message, tokens, frame, index }) {
  return (
    <Box>
      <Text dimColor>{timestamp}</Text>
      <Text> </Text>
      <Text color="cyan"><Spinner type="dots12" /></Text>
      <Text> </Text>
      <Text dimColor>{message}</Text>
      <Text dimColor> ({tokens.toLocaleString()} tokens)</Text>
    </Box>
  );
}

function StressTest() {
  const [frame, setFrame] = useState(0);
  const [phase, setPhase] = useState('output'); // 'output' | 'animate'
  const [outputLines, setOutputLines] = useState([]);
  const [outputIndex, setOutputIndex] = useState(0);

  const allOutputLines = agentOutput.split('\n');

  // Phase 1: Stream output
  useEffect(() => {
    if (phase !== 'output') return;

    if (outputIndex < allOutputLines.length) {
      const timer = setTimeout(() => {
        setOutputLines(prev => [...prev, allOutputLines[outputIndex]]);
        setOutputIndex(prev => prev + 1);
      }, 20);
      return () => clearTimeout(timer);
    } else {
      // Transition to animation phase after a brief pause
      const timer = setTimeout(() => setPhase('animate'), 1500);
      return () => clearTimeout(timer);
    }
  }, [phase, outputIndex, allOutputLines]);

  // Phase 2: Animation loop
  useEffect(() => {
    if (phase !== 'animate') return;

    const timer = setInterval(() => {
      setFrame(f => f + 1);
    }, 80);

    // Run for 45 seconds
    const stopTimer = setTimeout(() => {
      clearInterval(timer);
      process.exit(0);
    }, 45000);

    return () => {
      clearInterval(timer);
      clearTimeout(stopTimer);
    };
  }, [phase]);

  const tasks = [
    { name: 'Codex MCP', status: 'Analyzing codebase...', color: 'green' },
    { name: 'Code Review', status: 'Checking issues...', color: 'yellow' },
    { name: 'Test Runner', status: 'Running tests...', color: 'cyan' },
    { name: 'Type Check', status: 'Validating types...', color: 'magenta' },
    { name: 'Lint Check', status: 'Running ESLint...', color: 'blue' },
  ];

  const logMessages = [
    'Processing src/components/Terminal/XtermAdapter.tsx',
    'Analyzing electron/services/pty/TerminalProcess.ts',
    'Checking src/services/TerminalInstanceService.ts',
    'Reviewing electron/services/WorktreeService.ts',
    'Scanning src/store/terminalStore.ts',
    'Validating src/components/Layout/Sidebar.tsx',
  ];

  const elapsed = (frame * 0.08).toFixed(1);
  const remaining = Math.max(0, 45 - parseFloat(elapsed)).toFixed(0);

  if (phase === 'output') {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>  TUI STRESS TEST - Terminal Flicker Issue #800</Text>
        </Box>
        <Box marginBottom={1}>
          <Text bold>━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>  Phase 1: Streaming agent output... ({outputIndex}/{allOutputLines.length})</Text>
        </Box>
        <Box flexDirection="column">
          {outputLines.map((line, i) => (
            <Text key={i}>{line}</Text>
          ))}
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Header */}
      <Box>
        <Text bold color="white">╔{'═'.repeat(96)}╗</Text>
      </Box>
      <Box>
        <Text bold>║ </Text>
        <Text color="cyan"><Spinner type="dots" /></Text>
        <Text bold color="cyan"> PROCESSING</Text>
        <Text dimColor> | Frame: {String(frame).padStart(5)} | {elapsed}s elapsed | {remaining}s remaining</Text>
        <Text>{' '.repeat(Math.max(0, 40))}</Text>
        <Text bold>║</Text>
      </Box>
      <Box>
        <Text bold color="white">╠{'═'.repeat(96)}╣</Text>
      </Box>

      {/* Tasks */}
      {tasks.map((task, i) => {
        const progress = ((frame * (i + 1) * 2 + i * 20) % 100);
        return (
          <Box key={i} flexDirection="column">
            <Box>
              <Text bold>║ </Text>
              <Task {...task} progress={progress} />
              <Text>{' '.repeat(Math.max(0, 20))}</Text>
              <Text bold>║</Text>
            </Box>
          </Box>
        );
      })}

      <Box>
        <Text bold color="white">╠{'═'.repeat(96)}╣</Text>
      </Box>

      {/* Activity Log */}
      <Box>
        <Text bold>║ Activity Log:{' '.repeat(82)}║</Text>
      </Box>
      {logMessages.map((msg, i) => {
        const timestamp = new Date(Date.now() - (5 - i) * 800).toISOString().slice(11, 23);
        const tokens = ((frame + i) * 347 % 9999);
        return (
          <Box key={i}>
            <Text bold>║ </Text>
            <LogEntry timestamp={timestamp} message={msg} tokens={tokens} frame={frame} index={i} />
            <Text>{' '.repeat(Math.max(0, 10))}</Text>
            <Text bold>║</Text>
          </Box>
        );
      })}

      <Box>
        <Text bold color="white">╠{'═'.repeat(96)}╣</Text>
      </Box>

      {/* System Metrics */}
      <Box>
        <Text bold>║ System: </Text>
        <Text>CPU [</Text>
        <ProgressBar percent={(45 + Math.sin(frame * 0.08) * 25) | 0} width={12} />
        <Text>] {String((45 + Math.sin(frame * 0.08) * 25) | 0).padStart(2)}%  </Text>
        <Text>MEM [</Text>
        <ProgressBar percent={(55 + Math.sin(frame * 0.05) * 20) | 0} width={12} />
        <Text>] {String((55 + Math.sin(frame * 0.05) * 20) | 0).padStart(2)}%  </Text>
        <Text>GPU [</Text>
        <ProgressBar percent={(40 + Math.sin(frame * 0.06) * 30) | 0} width={12} />
        <Text>] {String((40 + Math.sin(frame * 0.06) * 30) | 0).padStart(2)}%</Text>
        <Text>{' '.repeat(5)}</Text>
        <Text bold>║</Text>
      </Box>

      <Box>
        <Text bold color="white">╚{'═'.repeat(96)}╝</Text>
      </Box>

      <Newline />

      {/* Static content warning */}
      <Box>
        <Text backgroundColor="yellow" color="red" bold>  ⚠ STATIC CONTENT BELOW - THIS REGION SHOULD NOT FLICKER ⚠  </Text>
      </Box>
      <Newline />
      <Text dimColor>  The following text is OUTSIDE the Ink animated region.</Text>
      <Text dimColor>  If you see ANY flickering in these lines, the bug is confirmed.</Text>
      <Newline />
      <Text>  ┌─────────────────────────────────────────────────────────────────────────┐</Text>
      <Text>  │  This box should remain perfectly stable and never redraw.             │</Text>
      <Text>  │                                                                         │</Text>
      <Text>  │  Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do       │</Text>
      <Text>  │  eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim   │</Text>
      <Text>  │  ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut    │</Text>
      <Text>  │  aliquip ex ea commodo consequat.                                      │</Text>
      <Text>  │                                                                         │</Text>
      <Text>  │  Duis aute irure dolor in reprehenderit in voluptate velit esse        │</Text>
      <Text>  │  cillum dolore eu fugiat nulla pariatur.                               │</Text>
      <Text>  └─────────────────────────────────────────────────────────────────────────┘</Text>
      <Newline />
      <Text dimColor>  On a correctly functioning terminal, ONLY the content above the yellow</Text>
      <Text dimColor>  warning banner should be updating. Everything below should be static.</Text>
    </Box>
  );
}

// Help text
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
\x1b[1mTUI Stress Test for Terminal Flicker Issue (#800)\x1b[0m

\x1b[2mUsage:\x1b[0m npm run stress-test

This test uses the actual Ink framework to reproduce terminal flickering:

\x1b[1mPhase 1:\x1b[0m Streams simulated Claude Code output
  - Creates scrollback buffer before animation

\x1b[1mPhase 2:\x1b[0m Runs 45 seconds of Ink-rendered animation
  - 5 concurrent task spinners with progress bars
  - 6-line activity log
  - System metrics
  - Real Ink rendering (cursor-up + erase-down)

The yellow "STATIC CONTENT" section should NOT flicker.
If it flickers, the xterm.js rendering bug is confirmed.

\x1b[2mPress Ctrl+C to stop.\x1b[0m
`);
  process.exit(0);
}

render(<StressTest />);
