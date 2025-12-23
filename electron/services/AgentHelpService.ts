import { execFile } from "child_process";
import type { GetAgentHelpResponse } from "../../shared/types/ipc.js";
import { getAgentConfig } from "../../shared/config/agentRegistry.js";

interface CacheEntry {
  response: GetAgentHelpResponse;
  timestamp: number;
}

const CACHE_TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_OUTPUT_BYTES = 256 * 1024;

export class AgentHelpService {
  private cache = new Map<string, CacheEntry>();

  async getAgentHelp(agentId: string, refresh = false): Promise<GetAgentHelpResponse> {
    if (!/^[a-zA-Z0-9._-]+$/.test(agentId)) {
      throw new Error(`Invalid agent ID: ${agentId}`);
    }

    const config = getAgentConfig(agentId);
    if (!config) {
      throw new Error(`Unknown agent ID: ${agentId}`);
    }

    const command = config.command;
    if (!/^[a-zA-Z0-9._-]+$/.test(command)) {
      throw new Error(`Invalid command for agent ${agentId}: ${command}`);
    }

    const cached = this.cache.get(agentId);
    if (!refresh && cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return cached.response;
    }

    const helpArgs = config.help?.args ?? ["--help"];

    const response = await this.executeHelp(command, helpArgs);

    this.cache.set(agentId, { response, timestamp: Date.now() });

    return response;
  }

  private executeHelp(command: string, args: string[]): Promise<GetAgentHelpResponse> {
    return new Promise((resolve) => {
      const startTime = Date.now();
      let stdoutBuffer = "";
      let stderrBuffer = "";
      let stdoutTruncated = false;
      let stderrTruncated = false;
      let timedOut = false;

      const child = execFile(command, args, {
        timeout: TIMEOUT_MS,
        maxBuffer: MAX_OUTPUT_BYTES,
        windowsHide: true,
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill();
      }, TIMEOUT_MS);

      if (child.stdout) {
        child.stdout.on("data", (chunk: Buffer) => {
          const newData = chunk.toString();
          if (stdoutBuffer.length + newData.length <= MAX_OUTPUT_BYTES) {
            stdoutBuffer += newData;
          } else {
            const remaining = MAX_OUTPUT_BYTES - stdoutBuffer.length;
            if (remaining > 0) {
              stdoutBuffer += newData.slice(0, remaining);
            }
            stdoutTruncated = true;
            child.kill();
          }
        });
      }

      if (child.stderr) {
        child.stderr.on("data", (chunk: Buffer) => {
          const newData = chunk.toString();
          if (stderrBuffer.length + newData.length <= MAX_OUTPUT_BYTES) {
            stderrBuffer += newData;
          } else {
            const remaining = MAX_OUTPUT_BYTES - stderrBuffer.length;
            if (remaining > 0) {
              stderrBuffer += newData.slice(0, remaining);
            }
            stderrTruncated = true;
            child.kill();
          }
        });
      }

      child.on("close", (exitCode) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer,
          exitCode: exitCode ?? null,
          timedOut,
          truncated: stdoutTruncated || stderrTruncated,
          durationMs,
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        const durationMs = Date.now() - startTime;

        resolve({
          stdout: stdoutBuffer,
          stderr: stderrBuffer || error.message,
          exitCode: null,
          timedOut,
          truncated: stdoutTruncated || stderrTruncated,
          durationMs,
        });
      });
    });
  }
}
