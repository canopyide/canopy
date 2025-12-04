import { describe, it, expect } from "vitest";
import { DevServerParser } from "../DevServerParser.js";

describe("DevServerParser", () => {
  describe("detectUrl", () => {
    it("should detect Vite dev server URL", () => {
      const output = "  VITE v5.0.0  ready in 234 ms\n\n  ➜  Local:   http://localhost:5173/";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:5173/",
        port: 5173,
      });
    });

    it("should detect Next.js dev server URL", () => {
      const output = "- Ready on http://localhost:3000";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:3000",
        port: 3000,
      });
    });

    it("should detect port-only output and construct URL", () => {
      const output = "Server listening on port 8080";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:8080",
        port: 8080,
      });
    });

    it("should detect numeric-only port and construct URL", () => {
      const output = "Started on 3000";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:3000",
        port: 3000,
      });
    });

    it("should detect webpack-dev-server URL", () => {
      const output = "Project is running at http://localhost:8080/";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:8080/",
        port: 8080,
      });
    });

    it("should detect server with hostname", () => {
      const output = "Listening on http://0.0.0.0:4000/";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://0.0.0.0:4000/",
        port: 4000,
      });
    });

    it("should detect HTTPS URLs", () => {
      const output = "Server running at https://localhost:8443/";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "https://localhost:8443/",
        port: 8443,
      });
    });

    it("should return null when no URL pattern matches", () => {
      const output = "This is just some random output without a URL";
      const result = DevServerParser.detectUrl(output);

      expect(result).toBeNull();
    });

    it("should return null for empty output", () => {
      const result = DevServerParser.detectUrl("");

      expect(result).toBeNull();
    });

    it("should return null for whitespace-only output", () => {
      const result = DevServerParser.detectUrl("   \n  \t  ");

      expect(result).toBeNull();
    });

    it("should detect first matching pattern in multi-line output", () => {
      const output = `
Building...
Compiled successfully!

  Local:   http://localhost:3000/
  Network: http://192.168.1.5:3000/

Ready in 1.2s
      `;
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:3000/",
        port: 3000,
      });
    });

    it("should handle case-insensitive patterns", () => {
      const output = "SERVER IS RUNNING ON HTTP://LOCALHOST:9000/";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "HTTP://LOCALHOST:9000/",
        port: 9000,
      });
    });

    it("should detect URLs with trailing slashes", () => {
      const output = "Server is listening on http://localhost:7000//";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:7000//",
        port: 7000,
      });
    });

    it("should detect create-react-app output", () => {
      const output =
        "Compiled successfully!\n\nYou can now view my-app in the browser.\n\n  Local:            http://localhost:3000";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:3000",
        port: 3000,
      });
    });

    it("should detect Express-style output", () => {
      const output = "Server started on port: 4200";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:4200",
        port: 4200,
      });
    });

    it("should detect Svelte Kit output", () => {
      const output = "\n  ➜  Local:   http://localhost:5173/\n  ➜  Network: use --host to expose";
      const result = DevServerParser.detectUrl(output);

      expect(result).toEqual({
        url: "http://localhost:5173/",
        port: 5173,
      });
    });
  });

  describe("detectPort", () => {
    it("should extract port from URL", () => {
      const output = "Server running on http://localhost:3000/";
      const port = DevServerParser.detectPort(output);

      expect(port).toBe(3000);
    });

    it("should extract port from port-only pattern", () => {
      const output = "Listening on port 8080";
      const port = DevServerParser.detectPort(output);

      expect(port).toBe(8080);
    });

    it("should return null when no port detected", () => {
      const output = "No port information here";
      const port = DevServerParser.detectPort(output);

      expect(port).toBeNull();
    });
  });
});
