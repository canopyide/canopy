import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VoiceCorrectionService } from "../VoiceCorrectionService.js";

const BASE_SETTINGS = {
  geminiApiKey: "test-gemini-key",
  customDictionary: [] as string[],
};

function makeGeminiResponse(text: string, ok = true, status = 200) {
  return {
    ok,
    status,
    json: async () => ({
      candidates: [{ content: { parts: [{ text }] } }],
    }),
  } as unknown as Response;
}

describe("VoiceCorrectionService", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns corrected text from the Gemini API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeGeminiResponse("React is great.")));

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("React is great.");
  });

  it("falls back to raw text on API error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeGeminiResponse("", false, 500)));

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("react is great");
  });

  it("falls back to raw text on network error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Network error")));

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("react is great");
  });

  it("falls back to raw text when API returns empty content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeGeminiResponse("")));

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("react is great");
  });

  it("falls back to raw text on timeout", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) =>
              setTimeout(() => resolve(makeGeminiResponse("Corrected.")), 30000)
            )
        )
    );

    const svc = new VoiceCorrectionService();
    const resultPromise = svc.correct("react is great", BASE_SETTINGS);
    vi.advanceTimersByTime(16000);
    const result = await resultPromise;
    expect(result).toBe("react is great");
  });

  it("returns raw text unchanged when input is empty", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("", BASE_SETTINGS);
    expect(result).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("includes custom dictionary in the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Canopy is great."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("canopy is great", {
      ...BASE_SETTINGS,
      customDictionary: ["Canopy", "Worktree"],
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const systemText = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    expect(systemText).toContain("Canopy");
    expect(systemText).toContain("Worktree");
  });

  it("includes project name in the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test sentence", {
      ...BASE_SETTINGS,
      projectName: "my-project",
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const systemText = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    expect(systemText).toContain("my-project");
  });

  it("includes custom instructions in the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test sentence", {
      ...BASE_SETTINGS,
      customInstructions: "Always capitalize ProductName.",
    });

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const systemText = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    expect(systemText).toContain("Always capitalize ProductName.");
  });

  it("uses Gemini API format with temperature 0 and maxOutputTokens", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    expect(body.generationConfig.temperature).toBe(0);
    expect(body.generationConfig.maxOutputTokens).toBe(2048);
    expect(body.systemInstruction).toBeDefined();
    expect(body.contents).toBeDefined();
    expect(body.contents[0].role).toBe("user");
  });

  it("sends x-goog-api-key header for authentication", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test", BASE_SETTINGS);

    const headers = (fetchMock.mock.calls[0] as [string, RequestInit])[1].headers as Record<
      string,
      string
    >;
    expect(headers["x-goog-api-key"]).toBe("test-gemini-key");
  });

  it("maintains a sliding history window of 3 paragraphs", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected sentence."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("sentence one", BASE_SETTINGS);
    await svc.correct("sentence two", BASE_SETTINGS);
    await svc.correct("sentence three", BASE_SETTINGS);
    await svc.correct("sentence four", BASE_SETTINGS);

    const lastBody = JSON.parse(
      (fetchMock.mock.calls[3] as [string, RequestInit])[1].body as string
    );
    const userText = (lastBody.contents[0].parts[0] as { text: string }).text;
    expect(userText).not.toContain("sentence one");
    expect(userText).toContain("Corrected sentence.");
  });

  it("resets history on resetHistory()", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("sentence one", BASE_SETTINGS);
    svc.resetHistory();
    await svc.correct("sentence two", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    const userText = (body.contents[0].parts[0] as { text: string }).text;
    expect(userText).not.toContain("sentence one");
  });

  it("formats current input with <input> XML tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test input text", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userText = (body.contents[0].parts[0] as { text: string }).text;
    expect(userText).toContain("<input>");
    expect(userText).toContain("test input text");
    expect(userText).toContain("</input>");
  });

  it("formats history with <history> XML tags when history is present", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("sentence one", BASE_SETTINGS);
    await svc.correct("sentence two", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[1] as [string, RequestInit])[1].body as string);
    const userText = (body.contents[0].parts[0] as { text: string }).text;
    expect(userText).toContain("<history>");
    expect(userText).toContain("</history>");
    expect(userText).toContain("Corrected.");
  });

  it("omits <history> section on first call when no history", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("first input", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const userText = (body.contents[0].parts[0] as { text: string }).text;
    expect(userText).not.toContain("<history>");
    expect(userText).toContain("<input>");
  });

  it("always includes guardrail suffix in the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const systemText = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    expect(systemText).toContain("plain text only");
    expect(systemText).toContain("Begin immediately");
  });

  it("includes core prompt in the system instruction", async () => {
    const fetchMock = vi.fn().mockResolvedValue(makeGeminiResponse("Corrected."));
    vi.stubGlobal("fetch", fetchMock);

    const svc = new VoiceCorrectionService();
    await svc.correct("test", BASE_SETTINGS);

    const body = JSON.parse((fetchMock.mock.calls[0] as [string, RequestInit])[1].body as string);
    const systemText = (body.systemInstruction as { parts: Array<{ text: string }> }).parts[0].text;
    expect(systemText).toContain("speech-to-text correction engine");
  });

  it("falls back to raw text when API returns whitespace-only content", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(makeGeminiResponse("   \n  ")));

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("react is great");
  });

  it("falls back to raw text when API response has no candidates", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ candidates: [] }),
      } as unknown as Response)
    );

    const svc = new VoiceCorrectionService();
    const result = await svc.correct("react is great", BASE_SETTINGS);
    expect(result).toBe("react is great");
  });
});
