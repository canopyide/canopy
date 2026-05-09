## Watching Multiple Agent Terminals

When you need to orchestrate or monitor multiple agent terminals, fetch the `triage_terminals` MCP prompt from the `daintree` server (`prompts/get` with `name: "triage_terminals"`) — it returns the full fleet-polling recipe (batch `terminal.getStatus`, stuck-state cross-checking with `includeOutput`, and `ScheduleWakeup` pacing).

For a single terminal a normal blocking `terminal.waitUntilIdle` call is still the right tool — kick off one task, wait for it to finish.
