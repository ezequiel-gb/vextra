import { afterEach, describe, it, expect, vi } from "vitest";
import { youtubeRequest } from "../../src/source/youtube/request.ts";
afterEach(() => vi.unstubAllGlobals());
describe("restricted network boundary", () => {
  it("rejects unapproved origins before fetching", async () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    await expect(
      youtubeRequest(
        new URL("https://evil.test/watch"),
        new AbortController().signal,
      ),
    ).rejects.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
  it("requests without credentials and rejects redirects", async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(new Response("body", { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    expect(
      await youtubeRequest(
        new URL("https://www.youtube.com/watch?v=abcdefghijk"),
        new AbortController().signal,
      ),
    ).toBe("body");
    expect(fetch).toHaveBeenCalledWith(
      expect.any(URL),
      expect.objectContaining({ credentials: "omit", redirect: "error" }),
    );
  });
  it("distinguishes rate limiting and retains retry-after", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response("", { status: 429, headers: { "retry-after": "30" } }),
        ),
    );
    await expect(
      youtubeRequest(
        new URL("https://www.youtube.com/watch?v=abcdefghijk"),
        new AbortController().signal,
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED", retryAfterMs: 30000 });
  });
  it("does not interpret an empty body as transcript success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 200 })),
    );
    expect(
      await youtubeRequest(
        new URL("https://www.youtube.com/api/timedtext"),
        new AbortController().signal,
      ),
    ).toBe("");
  });
});
