import { describe, it, expect } from "vitest";
import stringArgv from "string-argv";

interface ParsedCommand {
  executable: string;
  args: string[];
  env?: Record<string, string>;
}

function parseCommand(command: string): ParsedCommand {
  const trimmed = command.trim();

  if (!trimmed) {
    throw new Error("Command cannot be empty");
  }

  const env: Record<string, string> = {};
  let commandWithoutEnv = trimmed;
  const envVarRegex = /^(\w+)=(\S+)(?:\s+|$)/;
  let match;

  while ((match = envVarRegex.exec(commandWithoutEnv))) {
    env[match[1]] = match[2];
    commandWithoutEnv = commandWithoutEnv.slice(match[0].length).trim();
    if (!commandWithoutEnv) break;
  }

  const parts = stringArgv(commandWithoutEnv);

  if (parts.length === 0) {
    throw new Error("Invalid command: no executable found");
  }

  const result: ParsedCommand = {
    executable: parts[0],
    args: parts.slice(1),
  };

  if (Object.keys(env).length > 0) {
    result.env = env;
  }

  return result;
}

describe("parseCommand", () => {
  it("parses npm run commands", () => {
    const result = parseCommand("npm run dev");
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev"],
    });
  });

  it("parses npm run commands with extra arguments", () => {
    const result = parseCommand("npm run dev -- --port 3000");
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev", "--", "--port", "3000"],
    });
  });

  it("parses yarn commands", () => {
    const result = parseCommand("yarn dev");
    expect(result).toEqual({
      executable: "yarn",
      args: ["dev"],
    });
  });

  it("parses pnpm commands", () => {
    const result = parseCommand("pnpm run start");
    expect(result).toEqual({
      executable: "pnpm",
      args: ["run", "start"],
    });
  });

  it("parses npx commands with arguments", () => {
    const result = parseCommand("npx vite --port 3000");
    expect(result).toEqual({
      executable: "npx",
      args: ["vite", "--port", "3000"],
    });
  });

  it("handles quoted arguments", () => {
    const result = parseCommand('npm run dev -- --host "0.0.0.0"');
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev", "--", "--host", "0.0.0.0"],
    });
  });

  it("handles single-quoted arguments", () => {
    const result = parseCommand("npx create-react-app 'my app'");
    expect(result).toEqual({
      executable: "npx",
      args: ["create-react-app", "my app"],
    });
  });

  it("extracts environment variables", () => {
    const result = parseCommand("PORT=3000 npm run dev");
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev"],
      env: { PORT: "3000" },
    });
  });

  it("extracts multiple environment variables", () => {
    const result = parseCommand("PORT=3000 HOST=localhost npm run dev");
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev"],
      env: { PORT: "3000", HOST: "localhost" },
    });
  });

  it("parses make commands", () => {
    const result = parseCommand("make serve");
    expect(result).toEqual({
      executable: "make",
      args: ["serve"],
    });
  });

  it("parses python django commands", () => {
    const result = parseCommand("python manage.py runserver");
    expect(result).toEqual({
      executable: "python",
      args: ["manage.py", "runserver"],
    });
  });

  it("parses composer commands", () => {
    const result = parseCommand("composer run-script serve");
    expect(result).toEqual({
      executable: "composer",
      args: ["run-script", "serve"],
    });
  });

  it("throws error for empty command", () => {
    expect(() => parseCommand("")).toThrow("Command cannot be empty");
    expect(() => parseCommand("   ")).toThrow("Command cannot be empty");
  });

  it("throws error for invalid command with only env vars", () => {
    expect(() => parseCommand("PORT=3000")).toThrow("Invalid command: no executable found");
  });

  it("handles commands with multiple spaces", () => {
    const result = parseCommand("npm    run    dev");
    expect(result).toEqual({
      executable: "npm",
      args: ["run", "dev"],
    });
  });

  it("handles npx with flags", () => {
    const result = parseCommand("npx --yes create-react-app my-app");
    expect(result).toEqual({
      executable: "npx",
      args: ["--yes", "create-react-app", "my-app"],
    });
  });
});
