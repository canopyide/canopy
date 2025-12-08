# Code Review Fixes for Issue #791

## Summary

Codex identified 5 critical issues with the transcript ANSI sanitization implementation:

1. **Buffer size cap can be exceeded** - Large chunks bypass the 10MB limit
2. **Inconsistent field naming** - `id` vs `terminalId` mismatch in event types
3. **Empty transcripts not signaled** - ANSI-only output never triggers transcript-ready
4. **Race condition in TranscriptService** - Session finalization can happen before transcript fetch
5. **Silent timeout failures** - No warning when transcript fetch times out

## Fixes Applied

### 1. Fix buffer size cap (pty-host.ts:97-119)
Drop chunks that exceed MAX_TRANSCRIPT_SIZE by themselves to prevent unbounded growth.

### 2. Fix field name consistency (shared/types/pty-host.ts)
Change `terminalId` to `id` in TranscriptReadyPayload and TranscriptResponse to match event protocol.

### 3. Emit transcript-ready for empty transcripts (pty-host.ts:245-266)
Always emit transcript-ready event on exit when a buffer exists, even if empty.

### 4. Fix race condition (TranscriptService.ts:60-88)
Store transcript chunks before finalizing session to prevent data loss.

### 5. Add timeout warning (PtyClient.ts:584-595, TranscriptService.ts:82-84)
Log warnings when transcript fetch times out or returns empty when chunks were expected.
