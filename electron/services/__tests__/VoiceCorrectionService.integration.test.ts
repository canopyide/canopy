import { afterEach, describe, expect, it } from "vitest";
import { VoiceCorrectionService } from "../VoiceCorrectionService.js";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY ?? "";

describe("VoiceCorrectionService integration", () => {
  let svc: VoiceCorrectionService;

  afterEach(() => {
    svc?.resetHistory();
  });

  it.skipIf(!GEMINI_API_KEY)(
    "returns a corrected response from the Gemini API",
    async () => {
      svc = new VoiceCorrectionService();

      const result = await svc.correct("um so we need to like update the racked component", {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: ["React", "Canopy"],
      });

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
      expect(result.toLowerCase()).toContain("react");
      expect(result.toLowerCase()).not.toMatch(/\bum\b/);

      console.log("Raw:      ", "um so we need to like update the racked component");
      console.log("Corrected:", result);
    },
    15_000
  );

  it.skipIf(!GEMINI_API_KEY)(
    "returns text unchanged when transcription is already correct",
    async () => {
      svc = new VoiceCorrectionService();

      const input = "The server is running on port 3000.";
      const result = await svc.correct(input, {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: [],
      });

      expect(result).toBeTruthy();
      expect(result.toLowerCase()).toContain("server");
      expect(result.toLowerCase()).toContain("port 3000");

      console.log("Raw:      ", input);
      console.log("Corrected:", result);
    },
    15_000
  );

  it.skipIf(!GEMINI_API_KEY)(
    "respects custom dictionary terms",
    async () => {
      svc = new VoiceCorrectionService();

      const result = await svc.correct("we need to update the canopy work tree dashboard", {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: ["Canopy", "Worktree"],
      });

      expect(result).toBeTruthy();
      expect(result).toContain("Canopy");

      console.log("Raw:      ", "we need to update the canopy work tree dashboard");
      console.log("Corrected:", result);
    },
    15_000
  );

  it.skipIf(!GEMINI_API_KEY)(
    "output contains no preamble, quotes, or explanatory text",
    async () => {
      svc = new VoiceCorrectionService();

      const input = "the type script compiler is throwing errors on the racked component";
      const result = await svc.correct(input, {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: [],
      });

      console.log("Raw:      ", input);
      console.log("Corrected:", result);

      expect(result).not.toMatch(/^(here is|here's|the corrected|corrected:|sure[,!])/i);
      expect(result).not.toMatch(/^["'`]/);
      expect(result).not.toContain("```");
      expect(result.toLowerCase()).toContain("typescript");
    },
    15_000
  );

  it.skipIf(!GEMINI_API_KEY)(
    "returns already-correct input verbatim (idempotency)",
    async () => {
      svc = new VoiceCorrectionService();

      const input = "The TypeScript compiler is throwing errors on the React component.";
      const result = await svc.correct(input, {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: [],
      });

      console.log("Raw:      ", input);
      console.log("Corrected:", result);

      expect(result.toLowerCase()).toContain("typescript");
      expect(result.toLowerCase()).toContain("react");
      expect(result.toLowerCase()).toContain("compiler");
      expect(result).not.toMatch(/^(here is|the corrected)/i);
    },
    15_000
  );

  it.skipIf(!GEMINI_API_KEY)(
    "handles paragraph-length input (multi-clause)",
    async () => {
      svc = new VoiceCorrectionService();

      const input =
        "um so the type script compiler is throwing errors and we need to fix the racked component, also the tail wind styles are broken and the zoo stand store needs updating";
      const result = await svc.correct(input, {
        geminiApiKey: GEMINI_API_KEY,
        customDictionary: [],
      });

      console.log("Raw:      ", input);
      console.log("Corrected:", result);

      expect(result).toBeTruthy();
      expect(result).toContain("TypeScript");
      expect(result).toContain("React");
      expect(result).toContain("Tailwind");
      expect(result).toContain("Zustand");
      expect(result).not.toMatch(/^(here is|the corrected)/i);
    },
    20_000
  );
});
