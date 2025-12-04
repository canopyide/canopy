import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { CommandDetector } from "../CommandDetector.js";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("CommandDetector", () => {
  let detector: CommandDetector;
  let testDir: string;

  beforeEach(() => {
    detector = new CommandDetector();
    testDir = join(tmpdir(), `command-detector-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("parseCommand", () => {
    it("should parse simple command", () => {
      const result = detector.parseCommand("npm run dev");

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "dev"],
      });
    });

    it("should parse command with environment variables", () => {
      const result = detector.parseCommand("PORT=3000 npm run dev");

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "dev"],
        env: { PORT: "3000" },
      });
    });

    it("should parse command with multiple environment variables", () => {
      const result = detector.parseCommand("PORT=3000 NODE_ENV=development npm run start");

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "start"],
        env: {
          PORT: "3000",
          NODE_ENV: "development",
        },
      });
    });

    it("should parse command with quoted arguments", () => {
      const result = detector.parseCommand('echo "hello world"');

      expect(result).toEqual({
        executable: "echo",
        args: ["hello world"],
      });
    });

    it("should parse command with flags", () => {
      const result = detector.parseCommand("vite --host --port 5173");

      expect(result).toEqual({
        executable: "vite",
        args: ["--host", "--port", "5173"],
      });
    });

    it("should handle extra whitespace", () => {
      const result = detector.parseCommand("  npm   run   dev  ");

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "dev"],
      });
    });

    it("should throw error for empty command", () => {
      expect(() => detector.parseCommand("")).toThrow("Command cannot be empty");
    });

    it("should throw error for whitespace-only command", () => {
      expect(() => detector.parseCommand("   ")).toThrow("Command cannot be empty");
    });

    it("should throw error for environment variables only", () => {
      expect(() => detector.parseCommand("PORT=3000")).toThrow("Invalid command: no executable found");
    });

    it("should parse complex npm script command", () => {
      const result = detector.parseCommand("npm run build -- --mode production");

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "build", "--", "--mode", "production"],
      });
    });

    it("should parse pnpm command", () => {
      const result = detector.parseCommand("pnpm dev");

      expect(result).toEqual({
        executable: "pnpm",
        args: ["dev"],
      });
    });

    it("should parse yarn command", () => {
      const result = detector.parseCommand("yarn start");

      expect(result).toEqual({
        executable: "yarn",
        args: ["start"],
      });
    });

    it("should handle single quotes in arguments", () => {
      const result = detector.parseCommand("echo 'hello world'");

      expect(result).toEqual({
        executable: "echo",
        args: ["hello world"],
      });
    });

    it("should handle environment variables with quoted values", () => {
      const result = detector.parseCommand('PORT="3000" npm run dev');

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "dev"],
        env: {
          PORT: "3000",
        },
      });
    });

    it("should handle multiple environment variables", () => {
      const result = detector.parseCommand("MESSAGE=hello NODE_ENV=production npm start");

      expect(result).toEqual({
        executable: "npm",
        args: ["start"],
        env: {
          MESSAGE: "hello",
          NODE_ENV: "production",
        },
      });
    });

    it("should handle environment variables with complex values", () => {
      const result = detector.parseCommand('API_URL=http://localhost:3000 npm run dev');

      expect(result).toEqual({
        executable: "npm",
        args: ["run", "dev"],
        env: {
          API_URL: "http://localhost:3000",
        },
      });
    });
  });

  describe("detectDevCommand", () => {
    it("should detect 'dev' script", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          dev: "vite",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBe("npm run dev");
    });

    it("should prefer 'dev' over 'start'", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          dev: "vite",
          start: "node server.js",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBe("npm run dev");
    });

    it("should detect 'start:dev' when 'dev' is missing", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          "start:dev": "next dev",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBe("npm run start:dev");
    });

    it("should detect 'serve' when dev variants are missing", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          serve: "http-server",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBe("npm run serve");
    });

    it("should fallback to 'start' script", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          start: "node index.js",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBe("npm run start");
    });

    it("should return null when no dev script exists", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          build: "tsc",
          test: "vitest",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBeNull();
    });

    it("should return null when package.json is missing", async () => {
      const result = await detector.detectDevCommand(testDir);

      expect(result).toBeNull();
    });

    it("should return null when package.json has no scripts", async () => {
      const packageJson = {
        name: "test-app",
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBeNull();
    });

    it("should handle malformed package.json gracefully", async () => {
      writeFileSync(join(testDir, "package.json"), "{ invalid json }");

      const result = await detector.detectDevCommand(testDir);

      expect(result).toBeNull();
    });

    it("should not cache errors from malformed package.json", async () => {
      // Write malformed JSON
      const packageJsonPath = join(testDir, "package.json");
      writeFileSync(packageJsonPath, "{ invalid json }");

      // First call returns null
      const result1 = await detector.detectDevCommand(testDir);
      expect(result1).toBeNull();

      // Fix the JSON
      writeFileSync(
        packageJsonPath,
        JSON.stringify({
          scripts: { dev: "vite" },
        })
      );

      // Second call should detect the dev script (error wasn't cached)
      const result2 = await detector.detectDevCommand(testDir);
      expect(result2).toBe("npm run dev");
    });

    it("should cache results for performance", async () => {
      const packageJson = {
        name: "test-app",
        scripts: {
          dev: "vite",
        },
      };
      const packageJsonPath = join(testDir, "package.json");
      writeFileSync(packageJsonPath, JSON.stringify(packageJson));

      // First call
      const result1 = await detector.detectDevCommand(testDir);
      expect(result1).toBe("npm run dev");

      // Delete the file to verify cache is used
      rmSync(packageJsonPath);

      // Second call should still return cached result
      const result2 = await detector.detectDevCommand(testDir);
      expect(result2).toBe("npm run dev");
    });

    it("should expire cache after TTL", async () => {
      const shortTTL = 100; // 100ms
      const cachedDetector = new CommandDetector(shortTTL);

      const packageJson = {
        name: "test-app",
        scripts: {
          dev: "vite",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      // First call
      const result1 = await cachedDetector.detectDevCommand(testDir);
      expect(result1).toBe("npm run dev");

      // Wait for cache to expire
      await new Promise((resolve) => setTimeout(resolve, shortTTL + 50));

      // Update package.json
      const updatedPackageJson = {
        name: "test-app",
        scripts: {
          start: "node server.js",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(updatedPackageJson));

      // Should detect new script after cache expiry
      const result2 = await cachedDetector.detectDevCommand(testDir);
      expect(result2).toBe("npm run start");
    });
  });

  describe("hasDevScript", () => {
    it("should return true when dev script exists", async () => {
      const packageJson = {
        scripts: {
          dev: "vite",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.hasDevScript(testDir);

      expect(result).toBe(true);
    });

    it("should return false when no dev script exists", async () => {
      const packageJson = {
        scripts: {
          build: "tsc",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      const result = await detector.hasDevScript(testDir);

      expect(result).toBe(false);
    });
  });

  describe("cache management", () => {
    it("should invalidate specific worktree cache", async () => {
      const packageJson = {
        scripts: {
          dev: "vite",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(packageJson));

      // Populate cache
      await detector.detectDevCommand(testDir);

      // Invalidate cache
      detector.invalidateCache(testDir);

      // Update package.json
      const updatedPackageJson = {
        scripts: {
          start: "node server.js",
        },
      };
      writeFileSync(join(testDir, "package.json"), JSON.stringify(updatedPackageJson));

      // Should detect new script after invalidation
      const result = await detector.detectDevCommand(testDir);
      expect(result).toBe("npm run start");
    });

    it("should clear all cache entries", async () => {
      const testDir2 = join(tmpdir(), `command-detector-test-2-${Date.now()}`);
      mkdirSync(testDir2, { recursive: true });

      try {
        writeFileSync(
          join(testDir, "package.json"),
          JSON.stringify({ scripts: { dev: "vite" } })
        );
        writeFileSync(
          join(testDir2, "package.json"),
          JSON.stringify({ scripts: { start: "node server.js" } })
        );

        // Populate both caches
        await detector.detectDevCommand(testDir);
        await detector.detectDevCommand(testDir2);

        // Clear all cache
        detector.clearCache();

        // Delete files to verify cache was cleared
        rmSync(join(testDir, "package.json"));
        rmSync(join(testDir2, "package.json"));

        // Both should return null now (cache cleared, files deleted)
        const result1 = await detector.detectDevCommand(testDir);
        const result2 = await detector.detectDevCommand(testDir2);

        expect(result1).toBeNull();
        expect(result2).toBeNull();
      } finally {
        rmSync(testDir2, { recursive: true, force: true });
      }
    });

    it("should warm cache for multiple paths", async () => {
      const testDir2 = join(tmpdir(), `command-detector-test-warm-${Date.now()}`);
      mkdirSync(testDir2, { recursive: true });

      try {
        writeFileSync(
          join(testDir, "package.json"),
          JSON.stringify({ scripts: { dev: "vite" } })
        );
        writeFileSync(
          join(testDir2, "package.json"),
          JSON.stringify({ scripts: { start: "node server.js" } })
        );

        // Warm cache
        await detector.warmCache([testDir, testDir2]);

        // Delete files
        rmSync(join(testDir, "package.json"));
        rmSync(join(testDir2, "package.json"));

        // Should still get cached results
        const result1 = await detector.detectDevCommand(testDir);
        const result2 = await detector.detectDevCommand(testDir2);

        expect(result1).toBe("npm run dev");
        expect(result2).toBe("npm run start");
      } finally {
        rmSync(testDir2, { recursive: true, force: true });
      }
    });
  });
});
